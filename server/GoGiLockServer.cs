using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;

namespace GoGiLock
{
    public class MailSettings
    {
        public bool testMode = true;
        public string host = "";
        public int port = 587;
        public bool enableSsl = true;
        public string user = "";
        public string password = "";
        public string fromEmail = "noreply@gogilock.local";
        public string fromName = "GoGiLock";
    }

    public class AdminAccount
    {
        public string email = "";
        public string passwordHash = "";
        public string passwordSalt = "";
        public string createdAt = "";
        public string pinHash = "";
        public string pinSalt = "";
        public string resetCodeHash = "";
        public string resetCodeSalt = "";
        public string resetCodeExpiresAt = "";
    }

    public class UserAccount
    {
        public string id = "";
        public string email = "";
        public string passwordHash = "";
        public string passwordSalt = "";
        public string createdAt = "";
        public string passwordChangedAt = "";
    }

    public class SessionItem
    {
        public string token = "";
        public string role = "";
        public string userId = "";
        public string email = "";
        public string expiresAt = "";
    }

    public class ProgramItem
    {
        public string id = "";
        public string name = "";
        public string description = "";
        public string icon = "";
        public string accent = "";
        public string type = "code";
        public string url = "";
        public string html = "";
        public string css = "";
        public string js = "";
        public string createdAt = "";
    }

    public class MailLogItem
    {
        public string id = "";
        public string to = "";
        public string subject = "";
        public string createdAt = "";
        public string mode = "";
        public string preview = "";
    }

    public class AppState
    {
        public AdminAccount admin = new AdminAccount();
        public List<UserAccount> users = new List<UserAccount>();
        public List<SessionItem> sessions = new List<SessionItem>();
        public List<ProgramItem> programs = new List<ProgramItem>();
        public MailSettings mail = new MailSettings();
        public List<MailLogItem> mailLog = new List<MailLogItem>();
    }

    public class GoGiLockServer
    {
        private const int Port = 8080;
        private static readonly object Gate = new object();
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer() { MaxJsonLength = 16777216 };
        private static readonly Regex EmailRx = new Regex(
            @"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$",
            RegexOptions.Compiled);
        private static readonly Dictionary<string, List<DateTime>> Hits = new Dictionary<string, List<DateTime>>();

        private static string Root;
        private static string DataFile;
        private static string OutboxDir;
        private static string SeedDir;
        private static AppState State;

        public static int Main(string[] args)
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            Root = Path.GetFullPath(Path.Combine(baseDir, ".."));
            if (!File.Exists(Path.Combine(Root, "index.html")))
            {
                Root = Path.GetFullPath(baseDir);
            }

            string dataDir = Path.Combine(Root, "data");
            Directory.CreateDirectory(dataDir);
            OutboxDir = Path.Combine(dataDir, "outbox");
            Directory.CreateDirectory(OutboxDir);
            DataFile = Path.Combine(dataDir, "gogilock.json");
            SeedDir = Path.Combine(baseDir, "seed");
            if (!Directory.Exists(SeedDir))
            {
                SeedDir = Path.Combine(Root, "server", "seed");
            }

            LoadState();

            HttpListener listener = new HttpListener();
            List<string> prefixes = BuildPrefixes();
            for (int i = 0; i < prefixes.Count; i++)
            {
                listener.Prefixes.Add(prefixes[i]);
            }

            try
            {
                listener.Start();
            }
            catch (Exception)
            {
                listener.Close();
                listener = new HttpListener();
                listener.Prefixes.Add("http://127.0.0.1:" + Port + "/");
                listener.Prefixes.Add("http://localhost:" + Port + "/");
                try
                {
                    listener.Start();
                }
                catch (Exception ex)
                {
                    Console.WriteLine("GoGiLock konnte Port " + Port + " nicht oeffnen: " + ex.Message);
                    return 1;
                }
            }

            Console.WriteLine("GoGiLock laeuft auf http://127.0.0.1:" + Port + "/");
            Console.WriteLine("Admin: http://127.0.0.1:" + Port + "/admin");
            Console.WriteLine("Ordner: " + Root);

            while (true)
            {
                HttpListenerContext ctx = null;
                try
                {
                    ctx = listener.GetContext();
                    ThreadPool.QueueUserWorkItem(Handle, ctx);
                }
                catch (Exception ex)
                {
                    Console.WriteLine("Listener: " + ex.Message);
                }
            }
        }

        private static List<string> BuildPrefixes()
        {
            List<string> list = new List<string>();
            list.Add("http://127.0.0.1:" + Port + "/");
            list.Add("http://localhost:" + Port + "/");
            try
            {
                string host = Dns.GetHostName();
                IPAddress[] addrs = Dns.GetHostAddresses(host);
                for (int i = 0; i < addrs.Length; i++)
                {
                    if (addrs[i].AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                    {
                        string ip = addrs[i].ToString();
                        if (ip != "127.0.0.1")
                        {
                            list.Add("http://" + ip + ":" + Port + "/");
                        }
                    }
                }
            }
            catch
            {
            }
            return list;
        }

        private static void Handle(object state)
        {
            HttpListenerContext ctx = (HttpListenerContext)state;
            try
            {
                string path = ctx.Request.Url.AbsolutePath;
                if (string.IsNullOrEmpty(path) || path == "/") path = "/index.html";
                if (path == "/admin" || path == "/admin/") path = "/admin.html";

                string method = ctx.Request.HttpMethod.ToUpperInvariant();
                if (method == "OPTIONS")
                {
                    ctx.Response.StatusCode = 204;
                    ctx.Response.Close();
                    return;
                }

                if (path.StartsWith("/api/"))
                {
                    HandleApi(ctx, method, path);
                    return;
                }

                ServeStatic(ctx, path);
            }
            catch (Exception ex)
            {
                try { WriteJson(ctx, 500, Err("Serverfehler")); }
                catch { }
                Console.WriteLine(ex);
            }
        }

        private static void HandleApi(HttpListenerContext ctx, string method, string path)
        {
            Dictionary<string, object> body = ReadJson(ctx);

            if (method == "GET" && path == "/api/health")
            {
                WriteJson(ctx, 200, Ok("ok", true));
                return;
            }

            if (method == "GET" && path == "/api/admin/status")
            {
                Dictionary<string, object> r = new Dictionary<string, object>();
                r["ok"] = true;
                r["hasAdmin"] = HasAdmin();
                WriteJson(ctx, 200, r);
                return;
            }

            if (method == "POST" && path == "/api/register")
            {
                Register(ctx, body);
                return;
            }
            if (method == "POST" && path == "/api/login")
            {
                LoginUser(ctx, body);
                return;
            }
            if (method == "POST" && path == "/api/logout")
            {
                ClearSession(ctx, "ggl_user");
                WriteJson(ctx, 200, Ok("ok", true));
                return;
            }
            if (method == "POST" && path == "/api/forgot-password")
            {
                ForgotPassword(ctx, body);
                return;
            }
            if (method == "POST" && path == "/api/change-password")
            {
                ChangePassword(ctx, body);
                return;
            }
            if (method == "GET" && path == "/api/me")
            {
                SessionItem s = GetSession(ctx, "ggl_user", "user");
                if (s == null) { WriteJson(ctx, 401, Err("Nicht angemeldet")); return; }
                Dictionary<string, object> r = new Dictionary<string, object>();
                r["ok"] = true;
                r["email"] = s.email;
                r["role"] = "user";
                WriteJson(ctx, 200, r);
                return;
            }
            if (method == "GET" && path == "/api/programs")
            {
                SessionItem s = GetSession(ctx, "ggl_user", "user");
                if (s == null) { WriteJson(ctx, 401, Err("Bitte zuerst anmelden")); return; }
                Dictionary<string, object> r = new Dictionary<string, object>();
                r["ok"] = true;
                r["programs"] = PublicPrograms();
                WriteJson(ctx, 200, r);
                return;
            }

            if (method == "POST" && path == "/api/admin/setup")
            {
                SetupAdmin(ctx, body);
                return;
            }
            if (method == "POST" && path == "/api/admin/login")
            {
                LoginAdmin(ctx, body);
                return;
            }
            if (method == "POST" && path == "/api/admin/logout")
            {
                ClearSession(ctx, "ggl_admin");
                WriteJson(ctx, 200, Ok("ok", true));
                return;
            }
            if (method == "POST" && path == "/api/admin/forgot")
            {
                ForgotAdmin(ctx, body);
                return;
            }
            if (method == "POST" && path == "/api/admin/reset")
            {
                ResetAdmin(ctx, body);
                return;
            }
            if (method == "PUT" && path == "/api/admin/account")
            {
                UpdateAdminAccount(ctx, body);
                return;
            }
            if (method == "GET" && path == "/api/admin/me")
            {
                SessionItem s = RequireAdmin(ctx);
                if (s == null) return;
                Dictionary<string, object> r = new Dictionary<string, object>();
                r["ok"] = true;
                r["email"] = s.email;
                r["role"] = "admin";
                r["hasPin"] = HasAdminPin();
                WriteJson(ctx, 200, r);
                return;
            }
            if (method == "GET" && path == "/api/admin/programs")
            {
                if (RequireAdmin(ctx) == null) return;
                Dictionary<string, object> r = new Dictionary<string, object>();
                r["ok"] = true;
                r["programs"] = State.programs;
                WriteJson(ctx, 200, r);
                return;
            }
            if (method == "POST" && path == "/api/admin/programs")
            {
                SaveProgram(ctx, body, null);
                return;
            }
            if (method == "PUT" && path.StartsWith("/api/admin/programs/"))
            {
                string id = path.Substring("/api/admin/programs/".Length);
                SaveProgram(ctx, body, id);
                return;
            }
            if (method == "DELETE" && path.StartsWith("/api/admin/programs/"))
            {
                string id = path.Substring("/api/admin/programs/".Length);
                DeleteProgram(ctx, id);
                return;
            }
            if (method == "GET" && path == "/api/admin/settings")
            {
                if (RequireAdmin(ctx) == null) return;
                WriteJson(ctx, 200, SettingsPublic());
                return;
            }
            if (method == "PUT" && path == "/api/admin/settings")
            {
                SaveSettings(ctx, body);
                return;
            }
            if (method == "GET" && path == "/api/admin/users")
            {
                if (RequireAdmin(ctx) == null) return;
                List<Dictionary<string, object>> users = new List<Dictionary<string, object>>();
                lock (Gate)
                {
                    for (int i = 0; i < State.users.Count; i++)
                    {
                        Dictionary<string, object> u = new Dictionary<string, object>();
                        u["id"] = State.users[i].id;
                        u["email"] = State.users[i].email;
                        u["createdAt"] = State.users[i].createdAt;
                        users.Add(u);
                    }
                }
                Dictionary<string, object> r = new Dictionary<string, object>();
                r["ok"] = true;
                r["users"] = users;
                WriteJson(ctx, 200, r);
                return;
            }
            if (method == "GET" && path == "/api/admin/outbox")
            {
                if (RequireAdmin(ctx) == null) return;
                Dictionary<string, object> r = new Dictionary<string, object>();
                r["ok"] = true;
                r["items"] = State.mailLog;
                WriteJson(ctx, 200, r);
                return;
            }
            if (method == "GET" && path.StartsWith("/api/admin/outbox/"))
            {
                if (RequireAdmin(ctx) == null) return;
                string id = path.Substring("/api/admin/outbox/".Length);
                string file = Path.Combine(OutboxDir, SanitizeFile(id) + ".txt");
                if (!File.Exists(file)) { WriteJson(ctx, 404, Err("Nicht gefunden")); return; }
                Dictionary<string, object> r = new Dictionary<string, object>();
                r["ok"] = true;
                r["body"] = File.ReadAllText(file, Encoding.UTF8);
                WriteJson(ctx, 200, r);
                return;
            }

            WriteJson(ctx, 404, Err("Unbekannte Schnittstelle"));
        }

        private static void Register(HttpListenerContext ctx, Dictionary<string, object> body)
        {
            if (!RateOk(ctx, "register", 5, 10)) { WriteJson(ctx, 429, Err("Zu viele Versuche. Bitte spaeter erneut.")); return; }
            string email = NormalizeEmail(Str(body, "email"));
            if (!IsValidEmail(email))
            {
                WriteJson(ctx, 400, Err("Bitte eine gueltige E-Mail-Adresse angeben."));
                return;
            }

            string password = GeneratePassword();
            bool created = false;
            lock (Gate)
            {
                if (HasAdmin() && string.Equals(State.admin.email, email, StringComparison.OrdinalIgnoreCase))
                {
                    WriteJson(ctx, 400, Err("Diese Adresse kann nicht registriert werden."));
                    return;
                }
                if (FindUser(email) == null)
                {
                    string salt;
                    string hash = HashPassword(password, out salt);
                    UserAccount u = new UserAccount();
                    u.id = NewId("u");
                    u.email = email;
                    u.passwordHash = hash;
                    u.passwordSalt = salt;
                    u.createdAt = NowIso();
                    State.users.Add(u);
                    SaveStateUnlocked();
                    created = true;
                }
            }

            if (created)
            {
                string err;
                if (!SendLoginMail(email, password, false, out err))
                {
                    lock (Gate)
                    {
                        UserAccount u = FindUser(email);
                        if (u != null) State.users.Remove(u);
                        SaveStateUnlocked();
                    }
                    WriteJson(ctx, 500, Err("Die Zugangsdaten konnten nicht per E-Mail gesendet werden. " + err));
                    return;
                }
            }

            Dictionary<string, object> r = new Dictionary<string, object>();
            r["ok"] = true;
            r["message"] = "Wenn die Adresse neu und gueltig ist, erhaeltst du in Kuerze deine Zugangsdaten per E-Mail.";
            WriteJson(ctx, 200, r);
        }

        private static void LoginUser(HttpListenerContext ctx, Dictionary<string, object> body)
        {
            if (!RateOk(ctx, "login", 8, 10)) { WriteJson(ctx, 429, Err("Zu viele Versuche. Bitte spaeter erneut.")); return; }
            string email = NormalizeEmail(Str(body, "email"));
            string password = Str(body, "password");
            UserAccount user = null;
            lock (Gate)
            {
                user = FindUser(email);
                if (user == null || !VerifyPassword(password, user.passwordSalt, user.passwordHash))
                {
                    WriteJson(ctx, 401, Err("E-Mail oder Passwort ist falsch."));
                    return;
                }
                IssueSession(ctx, "ggl_user", "user", user.id, user.email);
            }
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["ok"] = true;
            r["email"] = email;
            WriteJson(ctx, 200, r);
        }

        private static void ForgotPassword(HttpListenerContext ctx, Dictionary<string, object> body)
        {
            if (!RateOk(ctx, "forgot", 5, 15)) { WriteJson(ctx, 429, Err("Zu viele Versuche. Bitte spaeter erneut.")); return; }
            string email = NormalizeEmail(Str(body, "email"));
            if (!IsValidEmail(email))
            {
                WriteJson(ctx, 400, Err("Bitte eine gueltige E-Mail-Adresse angeben."));
                return;
            }

            string password = GeneratePassword();
            bool exists = false;
            lock (Gate)
            {
                UserAccount u = FindUser(email);
                if (u != null)
                {
                    string salt;
                    u.passwordHash = HashPassword(password, out salt);
                    u.passwordSalt = salt;
                    u.passwordChangedAt = NowIso();
                    DropUserSessions(u.id);
                    SaveStateUnlocked();
                    exists = true;
                }
            }

            if (exists)
            {
                string err;
                SendLoginMail(email, password, true, out err);
            }

            Dictionary<string, object> r = new Dictionary<string, object>();
            r["ok"] = true;
            r["message"] = "Wenn ein Konto zu dieser Adresse existiert, wurde ein neues Passwort per E-Mail gesendet.";
            WriteJson(ctx, 200, r);
        }

        private static void ChangePassword(HttpListenerContext ctx, Dictionary<string, object> body)
        {
            SessionItem s = GetSession(ctx, "ggl_user", "user");
            if (s == null) { WriteJson(ctx, 401, Err("Nicht angemeldet")); return; }
            string current = Str(body, "currentPassword");
            string next = Str(body, "newPassword");
            if (next == null) next = "";
            next = next.Trim();
            if (next.Length < 8)
            {
                WriteJson(ctx, 400, Err("Das neue Passwort muss mindestens 8 Zeichen haben."));
                return;
            }
            lock (Gate)
            {
                UserAccount u = FindUser(s.email);
                if (u == null || !VerifyPassword(current, u.passwordSalt, u.passwordHash))
                {
                    WriteJson(ctx, 400, Err("Das aktuelle Passwort ist falsch."));
                    return;
                }
                string salt;
                u.passwordHash = HashPassword(next, out salt);
                u.passwordSalt = salt;
                u.passwordChangedAt = NowIso();
                SaveStateUnlocked();
            }
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["ok"] = true;
            r["message"] = "Passwort wurde gespeichert.";
            WriteJson(ctx, 200, r);
        }

        private static void SetupAdmin(HttpListenerContext ctx, Dictionary<string, object> body)
        {
            string email = NormalizeEmail(Str(body, "email"));
            string password = Str(body, "password");
            string pin = Str(body, "securityCode");
            if (!IsValidEmail(email))
            {
                WriteJson(ctx, 400, Err("Bitte eine gueltige E-Mail-Adresse angeben."));
                return;
            }
            if (password == null || password.Trim().Length < 8)
            {
                WriteJson(ctx, 400, Err("Das Passwort muss mindestens 8 Zeichen haben."));
                return;
            }
            if (!IsValidPin(pin))
            {
                WriteJson(ctx, 400, Err("Der Sicherheitscode muss mindestens 6 Zeichen haben."));
                return;
            }
            lock (Gate)
            {
                if (HasAdmin())
                {
                    WriteJson(ctx, 400, Err("Administrator ist bereits eingerichtet."));
                    return;
                }
                string salt;
                string pinSalt;
                State.admin.email = email;
                State.admin.passwordHash = HashPassword(password.Trim(), out salt);
                State.admin.passwordSalt = salt;
                State.admin.pinHash = HashPassword(pin, out pinSalt);
                State.admin.pinSalt = pinSalt;
                State.admin.createdAt = NowIso();
                if (State.programs.Count == 0)
                {
                    State.programs = LoadSeedPrograms();
                }
                IssueSession(ctx, "ggl_admin", "admin", "admin", email);
                SaveStateUnlocked();
            }
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["ok"] = true;
            r["email"] = email;
            r["hasPin"] = true;
            WriteJson(ctx, 200, r);
        }

        private static void LoginAdmin(HttpListenerContext ctx, Dictionary<string, object> body)
        {
            if (!RateOk(ctx, "admin-login", 8, 10)) { WriteJson(ctx, 429, Err("Zu viele Versuche. Bitte spaeter erneut.")); return; }
            string email = NormalizeEmail(Str(body, "email"));
            string password = Str(body, "password");
            lock (Gate)
            {
                if (!HasAdmin() ||
                    !string.Equals(State.admin.email, email, StringComparison.OrdinalIgnoreCase) ||
                    !VerifyPassword(password, State.admin.passwordSalt, State.admin.passwordHash))
                {
                    WriteJson(ctx, 401, Err("E-Mail oder Passwort ist falsch."));
                    return;
                }
                IssueSession(ctx, "ggl_admin", "admin", "admin", State.admin.email);
            }
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["ok"] = true;
            r["email"] = email;
            WriteJson(ctx, 200, r);
        }

        private static void UpdateAdminAccount(HttpListenerContext ctx, Dictionary<string, object> body)
        {
            SessionItem s = RequireAdmin(ctx);
            if (s == null) return;
            string current = Str(body, "currentPassword");
            string email = NormalizeEmail(Str(body, "email"));
            string newPassword = Str(body, "newPassword");
            string pin = Str(body, "securityCode");
            bool changeEmail = !string.IsNullOrEmpty(email);
            bool changePassword = !string.IsNullOrEmpty(newPassword);
            bool changePin = !string.IsNullOrEmpty(pin);
            if (!changeEmail && !changePassword && !changePin)
            {
                WriteJson(ctx, 400, Err("Es wurde nichts geaendert."));
                return;
            }
            if (changeEmail && !IsValidEmail(email))
            {
                WriteJson(ctx, 400, Err("Bitte eine gueltige E-Mail-Adresse angeben."));
                return;
            }
            if (changePassword && newPassword.Length < 8)
            {
                WriteJson(ctx, 400, Err("Das neue Passwort muss mindestens 8 Zeichen haben."));
                return;
            }
            if (changePin && !IsValidPin(pin))
            {
                WriteJson(ctx, 400, Err("Der Sicherheitscode muss mindestens 6 Zeichen haben."));
                return;
            }
            lock (Gate)
            {
                if (!VerifyPassword(current, State.admin.passwordSalt, State.admin.passwordHash))
                {
                    WriteJson(ctx, 400, Err("Das aktuelle Passwort ist falsch."));
                    return;
                }
                if (changeEmail)
                {
                    if (FindUser(email) != null)
                    {
                        WriteJson(ctx, 400, Err("Diese E-Mail-Adresse ist bereits als Benutzer registriert."));
                        return;
                    }
                    State.admin.email = email;
                    s.email = email;
                }
                if (changePassword)
                {
                    string salt;
                    State.admin.passwordHash = HashPassword(newPassword, out salt);
                    State.admin.passwordSalt = salt;
                }
                if (changePin)
                {
                    string pinSalt;
                    State.admin.pinHash = HashPassword(pin, out pinSalt);
                    State.admin.pinSalt = pinSalt;
                }
                SaveStateUnlocked();
            }
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["ok"] = true;
            r["email"] = s.email;
            r["hasPin"] = HasAdminPin();
            r["message"] = "Admin-Zugang wurde gespeichert.";
            WriteJson(ctx, 200, r);
        }

        private static void ForgotAdmin(HttpListenerContext ctx, Dictionary<string, object> body)
        {
            if (!RateOk(ctx, "admin-forgot", 5, 15)) { WriteJson(ctx, 429, Err("Zu viele Versuche. Bitte spaeter erneut.")); return; }
            string email = NormalizeEmail(Str(body, "email"));
            if (!IsValidEmail(email))
            {
                WriteJson(ctx, 400, Err("Bitte eine gueltige E-Mail-Adresse angeben."));
                return;
            }
            string code = GenerateNumericCode(6);
            bool match = false;
            lock (Gate)
            {
                if (HasAdmin() && string.Equals(State.admin.email, email, StringComparison.OrdinalIgnoreCase))
                {
                    string salt;
                    State.admin.resetCodeHash = HashPassword(code, out salt);
                    State.admin.resetCodeSalt = salt;
                    State.admin.resetCodeExpiresAt = DateTime.UtcNow.AddMinutes(15).ToString("o");
                    SaveStateUnlocked();
                    match = true;
                }
            }
            if (match)
            {
                string err;
                string html =
                    "<div style=\"font-family:Georgia,serif;color:#1a1612\">" +
                    "<p>Hallo,</p><p>fuer die GoGiLock-Administration wurde ein Sicherheitscode angefordert.</p>" +
                    "<p><strong>E-Mail-Code:</strong> " + Html(code) + "</p>" +
                    "<p>Gib diesen Code zusammen mit deinem persoenlichen Sicherheitscode ein, um ein neues Passwort festzulegen. Der Code gilt 15 Minuten.</p>" +
                    "<p>GoGiLock Admin</p></div>";
                string plain = "An: " + email + "\r\nBetreff: GoGiLock Admin-Sicherheitscode\r\n\r\nCode: " + code + "\r\n";
                SendMail(email, "Dein GoGiLock-Admin-Sicherheitscode", html, plain, "Admin-Sicherheitscode", out err);
            }
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["ok"] = true;
            r["message"] = "Wenn die Adresse zum Administrator gehoert, wurde ein Sicherheitscode per E-Mail gesendet.";
            WriteJson(ctx, 200, r);
        }

        private static void ResetAdmin(HttpListenerContext ctx, Dictionary<string, object> body)
        {
            if (!RateOk(ctx, "admin-reset", 8, 15)) { WriteJson(ctx, 429, Err("Zu viele Versuche. Bitte spaeter erneut.")); return; }
            string email = NormalizeEmail(Str(body, "email"));
            string mailCode = Str(body, "mailCode");
            string pin = Str(body, "securityCode");
            string newPassword = Str(body, "newPassword");
            if (!IsValidEmail(email))
            {
                WriteJson(ctx, 400, Err("Bitte eine gueltige E-Mail-Adresse angeben."));
                return;
            }
            if (string.IsNullOrEmpty(mailCode) || string.IsNullOrEmpty(pin))
            {
                WriteJson(ctx, 400, Err("E-Mail-Code und Sicherheitscode sind erforderlich."));
                return;
            }
            if (newPassword.Length < 8)
            {
                WriteJson(ctx, 400, Err("Das neue Passwort muss mindestens 8 Zeichen haben."));
                return;
            }
            lock (Gate)
            {
                if (!HasAdmin() || !string.Equals(State.admin.email, email, StringComparison.OrdinalIgnoreCase))
                {
                    WriteJson(ctx, 400, Err("Angaben sind nicht korrekt."));
                    return;
                }
                DateTime exp;
                bool expired = !DateTime.TryParse(State.admin.resetCodeExpiresAt, out exp) || exp < DateTime.UtcNow;
                if (expired || string.IsNullOrEmpty(State.admin.resetCodeHash) ||
                    !VerifyPassword(mailCode, State.admin.resetCodeSalt, State.admin.resetCodeHash))
                {
                    WriteJson(ctx, 400, Err("Der E-Mail-Code ist ungueltig oder abgelaufen."));
                    return;
                }
                if (HasAdminPin())
                {
                    if (!VerifyPassword(pin, State.admin.pinSalt, State.admin.pinHash))
                    {
                        WriteJson(ctx, 400, Err("Der Sicherheitscode ist nicht korrekt."));
                        return;
                    }
                }
                else
                {
                    if (!IsValidPin(pin))
                    {
                        WriteJson(ctx, 400, Err("Lege einen Sicherheitscode mit mindestens 6 Zeichen fest."));
                        return;
                    }
                    string pinSalt;
                    State.admin.pinHash = HashPassword(pin, out pinSalt);
                    State.admin.pinSalt = pinSalt;
                }
                string salt;
                State.admin.passwordHash = HashPassword(newPassword, out salt);
                State.admin.passwordSalt = salt;
                State.admin.resetCodeHash = "";
                State.admin.resetCodeSalt = "";
                State.admin.resetCodeExpiresAt = "";
                DropRoleSessions("admin");
                SaveStateUnlocked();
            }
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["ok"] = true;
            r["message"] = "Das Admin-Passwort wurde erneuert. Du kannst dich jetzt anmelden.";
            WriteJson(ctx, 200, r);
        }

        private static void SaveProgram(HttpListenerContext ctx, Dictionary<string, object> body, string id)
        {
            if (RequireAdmin(ctx) == null) return;
            string name = Str(body, "name");
            if (name == null) name = "";
            name = name.Trim();
            if (name.Length == 0)
            {
                WriteJson(ctx, 400, Err("Name fehlt."));
                return;
            }
            string type = Str(body, "type");
            if (type != "link" && type != "embed") type = "code";
            lock (Gate)
            {
                ProgramItem p = null;
                if (!string.IsNullOrEmpty(id))
                {
                    p = FindProgram(id);
                    if (p == null) { WriteJson(ctx, 404, Err("Programm nicht gefunden")); return; }
                }
                else
                {
                    p = new ProgramItem();
                    p.id = NewId("p");
                    p.createdAt = NowIso();
                    State.programs.Add(p);
                }
                p.name = name;
                p.description = Str(body, "description");
                p.icon = Str(body, "icon");
                if (string.IsNullOrEmpty(p.icon)) p.icon = "⌘";
                p.accent = Str(body, "accent");
                if (string.IsNullOrEmpty(p.accent)) p.accent = "#c45c32";
                p.type = type;
                p.url = Str(body, "url");
                p.html = Str(body, "html");
                p.css = Str(body, "css");
                p.js = Str(body, "js");
                SaveStateUnlocked();
                Dictionary<string, object> r = new Dictionary<string, object>();
                r["ok"] = true;
                r["program"] = p;
                WriteJson(ctx, 200, r);
            }
        }

        private static void DeleteProgram(HttpListenerContext ctx, string id)
        {
            if (RequireAdmin(ctx) == null) return;
            lock (Gate)
            {
                ProgramItem p = FindProgram(id);
                if (p == null) { WriteJson(ctx, 404, Err("Programm nicht gefunden")); return; }
                State.programs.Remove(p);
                SaveStateUnlocked();
            }
            WriteJson(ctx, 200, Ok("ok", true));
        }

        private static void SaveSettings(HttpListenerContext ctx, Dictionary<string, object> body)
        {
            if (RequireAdmin(ctx) == null) return;
            lock (Gate)
            {
                State.mail.testMode = Bool(body, "testMode", State.mail.testMode);
                State.mail.host = Str(body, "host");
                State.mail.port = IntVal(body, "port", State.mail.port);
                State.mail.enableSsl = Bool(body, "enableSsl", State.mail.enableSsl);
                State.mail.user = Str(body, "user");
                string pw = Str(body, "password");
                if (!string.IsNullOrEmpty(pw)) State.mail.password = pw;
                State.mail.fromEmail = Str(body, "fromEmail");
                State.mail.fromName = Str(body, "fromName");
                if (string.IsNullOrEmpty(State.mail.fromName)) State.mail.fromName = "GoGiLock";
                SaveStateUnlocked();
            }
            WriteJson(ctx, 200, SettingsPublic());
        }

        private static Dictionary<string, object> SettingsPublic()
        {
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["ok"] = true;
            r["testMode"] = State.mail.testMode;
            r["host"] = State.mail.host;
            r["port"] = State.mail.port;
            r["enableSsl"] = State.mail.enableSsl;
            r["user"] = State.mail.user;
            r["hasPassword"] = !string.IsNullOrEmpty(State.mail.password);
            r["fromEmail"] = State.mail.fromEmail;
            r["fromName"] = State.mail.fromName;
            return r;
        }

        private static List<ProgramItem> PublicPrograms()
        {
            lock (Gate)
            {
                return new List<ProgramItem>(State.programs);
            }
        }

        private static SessionItem RequireAdmin(HttpListenerContext ctx)
        {
            SessionItem s = GetSession(ctx, "ggl_admin", "admin");
            if (s == null)
            {
                WriteJson(ctx, 401, Err("Nur fuer Administratoren"));
            }
            return s;
        }

        private static bool HasAdmin()
        {
            return State.admin != null && !string.IsNullOrEmpty(State.admin.passwordHash);
        }

        private static bool HasAdminPin()
        {
            return State.admin != null && !string.IsNullOrEmpty(State.admin.pinHash);
        }

        private static bool IsValidPin(string pin)
        {
            return pin != null && pin.Trim().Length >= 6 && pin.Trim().Length <= 32;
        }

        private static string GenerateNumericCode(int length)
        {
            char[] buf = new char[length];
            byte[] raw = new byte[length];
            using (RNGCryptoServiceProvider rng = new RNGCryptoServiceProvider())
            {
                rng.GetBytes(raw);
            }
            for (int i = 0; i < length; i++)
            {
                buf[i] = (char)('0' + (raw[i] % 10));
            }
            return new string(buf);
        }

        private static void DropRoleSessions(string role)
        {
            for (int i = State.sessions.Count - 1; i >= 0; i--)
            {
                if (State.sessions[i].role == role)
                {
                    State.sessions.RemoveAt(i);
                }
            }
        }

        private static UserAccount FindUser(string email)
        {
            for (int i = 0; i < State.users.Count; i++)
            {
                if (string.Equals(State.users[i].email, email, StringComparison.OrdinalIgnoreCase))
                    return State.users[i];
            }
            return null;
        }

        private static ProgramItem FindProgram(string id)
        {
            for (int i = 0; i < State.programs.Count; i++)
            {
                if (State.programs[i].id == id) return State.programs[i];
            }
            return null;
        }

        private static SessionItem GetSession(HttpListenerContext ctx, string cookie, string role)
        {
            string token = ReadCookie(ctx, cookie);
            if (string.IsNullOrEmpty(token)) return null;
            lock (Gate)
            {
                DateTime now = DateTime.UtcNow;
                for (int i = State.sessions.Count - 1; i >= 0; i--)
                {
                    DateTime exp;
                    if (!DateTime.TryParse(State.sessions[i].expiresAt, out exp) || exp < now)
                    {
                        State.sessions.RemoveAt(i);
                        continue;
                    }
                    if (State.sessions[i].token == token && State.sessions[i].role == role)
                    {
                        return State.sessions[i];
                    }
                }
            }
            return null;
        }

        private static void IssueSession(HttpListenerContext ctx, string cookie, string role, string userId, string email)
        {
            SessionItem s = new SessionItem();
            s.token = NewToken();
            s.role = role;
            s.userId = userId;
            s.email = email;
            s.expiresAt = DateTime.UtcNow.AddDays(14).ToString("o");
            State.sessions.Add(s);
            SaveStateUnlocked();
            string header = cookie + "=" + s.token + "; HttpOnly; Path=/; SameSite=Lax; Max-Age=1209600";
            ctx.Response.Headers.Add("Set-Cookie", header);
        }

        private static void ClearSession(HttpListenerContext ctx, string cookie)
        {
            string token = ReadCookie(ctx, cookie);
            lock (Gate)
            {
                if (!string.IsNullOrEmpty(token))
                {
                    for (int i = State.sessions.Count - 1; i >= 0; i--)
                    {
                        if (State.sessions[i].token == token) State.sessions.RemoveAt(i);
                    }
                    SaveStateUnlocked();
                }
            }
            ctx.Response.Headers.Add("Set-Cookie", cookie + "=; HttpOnly; Path=/; Max-Age=0");
        }

        private static void DropUserSessions(string userId)
        {
            for (int i = State.sessions.Count - 1; i >= 0; i--)
            {
                if (State.sessions[i].role == "user" && State.sessions[i].userId == userId)
                {
                    State.sessions.RemoveAt(i);
                }
            }
        }

        private static string ReadCookie(HttpListenerContext ctx, string name)
        {
            Cookie c = ctx.Request.Cookies[name];
            if (c == null || string.IsNullOrEmpty(c.Value)) return "";
            return c.Value;
        }

        private static bool SendLoginMail(string email, string password, bool reset, out string error)
        {
            string subject = reset
                ? "Dein neues GoGiLock-Passwort"
                : "Dein GoGiLock-Zugang";
            string intro = reset
                ? "fuer dein GoGiLock-Konto wurde ein neues Passwort erzeugt."
                : "du hast dich bei GoGiLock registriert. Dein Zugang wurde automatisch erstellt.";
            string html =
                "<div style=\"font-family:Georgia,serif;color:#1a1612\">" +
                "<p>Hallo,</p><p>" + intro + "</p>" +
                "<p><strong>E-Mail:</strong> " + Html(email) + "<br/>" +
                "<strong>Passwort:</strong> " + Html(password) + "</p>" +
                "<p>Nach der Anmeldung kannst du das Passwort selbst aendern.</p>" +
                "<p>GoGiLock</p></div>";
            string plain = "An: " + email + "\r\nBetreff: " + subject + "\r\n\r\n" +
                "E-Mail: " + email + "\r\nPasswort: " + password + "\r\n";
            return SendMail(email, subject, html, plain, "Passwort wurde erzeugt.", out error);
        }

        private static bool SendMail(string to, string subject, string html, string plain, string preview, out string error)
        {
            error = "";
            MailLogItem log = new MailLogItem();
            log.id = NewId("m");
            log.to = to;
            log.subject = subject;
            log.createdAt = NowIso();
            log.preview = preview;

            try
            {
                bool test;
                lock (Gate) { test = State.mail.testMode || string.IsNullOrEmpty(State.mail.host); }
                string file = Path.Combine(OutboxDir, log.id + ".txt");
                File.WriteAllText(file, string.IsNullOrEmpty(plain) ? html : plain, Encoding.UTF8);

                if (test)
                {
                    log.mode = "test";
                    lock (Gate)
                    {
                        State.mailLog.Insert(0, log);
                        if (State.mailLog.Count > 50) State.mailLog.RemoveRange(50, State.mailLog.Count - 50);
                        SaveStateUnlocked();
                    }
                    return true;
                }

                MailSettings mail;
                lock (Gate) { mail = State.mail; }
                MailMessage msg = new MailMessage();
                msg.From = new MailAddress(
                    string.IsNullOrEmpty(mail.fromEmail) ? "noreply@gogilock.local" : mail.fromEmail,
                    string.IsNullOrEmpty(mail.fromName) ? "GoGiLock" : mail.fromName);
                msg.To.Add(to);
                msg.Subject = subject;
                msg.Body = html;
                msg.IsBodyHtml = true;

                SmtpClient smtp = new SmtpClient(mail.host, mail.port <= 0 ? 587 : mail.port);
                smtp.EnableSsl = mail.enableSsl;
                smtp.DeliveryMethod = SmtpDeliveryMethod.Network;
                smtp.Timeout = 20000;
                if (!string.IsNullOrEmpty(mail.user))
                {
                    smtp.Credentials = new NetworkCredential(mail.user, mail.password);
                }
                smtp.Send(msg);
                log.mode = "smtp";
                lock (Gate)
                {
                    State.mailLog.Insert(0, log);
                    if (State.mailLog.Count > 50) State.mailLog.RemoveRange(50, State.mailLog.Count - 50);
                    SaveStateUnlocked();
                }
                return true;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }
        }

        private static List<ProgramItem> LoadSeedPrograms()
        {
            List<ProgramItem> list = new List<ProgramItem>();
            list.Add(SeedOne("p-notes", "Notizen", "Schnelle Texte, die im Browser bleiben.", "✎", "#5a6b4a", "notes"));
            list.Add(SeedOne("p-calc", "Rechner", "Kleiner Taschenrechner fuer zwischendurch.", "∑", "#2c4a6e", "calc"));
            list.Add(SeedOne("p-timer", "Stoppuhr", "Zeit stoppen, pausieren, zuruecksetzen.", "◷", "#c45c32", "timer"));
            return list;
        }

        private static ProgramItem SeedOne(string id, string name, string desc, string icon, string accent, string file)
        {
            ProgramItem p = new ProgramItem();
            p.id = id;
            p.name = name;
            p.description = desc;
            p.icon = icon;
            p.accent = accent;
            p.type = "code";
            p.createdAt = NowIso();
            p.html = ReadSeed(file + ".html");
            p.css = ReadSeed(file + ".css");
            p.js = ReadSeed(file + ".js");
            return p;
        }

        private static string ReadSeed(string name)
        {
            string path = Path.Combine(SeedDir, name);
            if (!File.Exists(path)) return "";
            return File.ReadAllText(path, Encoding.UTF8);
        }

        private static void LoadState()
        {
            lock (Gate)
            {
                if (File.Exists(DataFile))
                {
                    try
                    {
                        string raw = File.ReadAllText(DataFile, Encoding.UTF8);
                        State = Json.Deserialize<AppState>(raw);
                    }
                    catch
                    {
                        State = new AppState();
                    }
                }
                else
                {
                    State = new AppState();
                }
                if (State.admin == null) State.admin = new AdminAccount();
                if (State.users == null) State.users = new List<UserAccount>();
                if (State.sessions == null) State.sessions = new List<SessionItem>();
                if (State.programs == null) State.programs = new List<ProgramItem>();
                if (State.mail == null) State.mail = new MailSettings();
                if (State.mailLog == null) State.mailLog = new List<MailLogItem>();
                if (State.programs.Count == 0)
                {
                    State.programs = LoadSeedPrograms();
                    SaveStateUnlocked();
                }
            }
        }

        private static void SaveStateUnlocked()
        {
            string tmp = DataFile + ".tmp";
            File.WriteAllText(tmp, Json.Serialize(State), Encoding.UTF8);
            File.Copy(tmp, DataFile, true);
            File.Delete(tmp);
        }

        private static void ServeStatic(HttpListenerContext ctx, string path)
        {
            if (path.IndexOf("..") >= 0)
            {
                ctx.Response.StatusCode = 400;
                ctx.Response.Close();
                return;
            }
            string rel = path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            if (rel.StartsWith("data" + Path.DirectorySeparatorChar) ||
                rel.StartsWith("server" + Path.DirectorySeparatorChar))
            {
                ctx.Response.StatusCode = 404;
                ctx.Response.Close();
                return;
            }
            string file = Path.Combine(Root, rel);
            if (!File.Exists(file))
            {
                ctx.Response.StatusCode = 404;
                byte[] miss = Encoding.UTF8.GetBytes("Nicht gefunden");
                ctx.Response.OutputStream.Write(miss, 0, miss.Length);
                ctx.Response.Close();
                return;
            }
            string ext = Path.GetExtension(file).ToLowerInvariant();
            ctx.Response.ContentType = Mime(ext);
            byte[] bytes = File.ReadAllBytes(file);
            ctx.Response.ContentLength64 = bytes.Length;
            ctx.Response.OutputStream.Write(bytes, 0, bytes.Length);
            ctx.Response.Close();
        }

        private static string Mime(string ext)
        {
            if (ext == ".html") return "text/html; charset=utf-8";
            if (ext == ".css") return "text/css; charset=utf-8";
            if (ext == ".js") return "text/javascript; charset=utf-8";
            if (ext == ".json") return "application/json; charset=utf-8";
            if (ext == ".svg") return "image/svg+xml";
            if (ext == ".png") return "image/png";
            if (ext == ".ico") return "image/x-icon";
            return "application/octet-stream";
        }

        private static Dictionary<string, object> ReadJson(HttpListenerContext ctx)
        {
            if (ctx.Request.HttpMethod == "GET" || ctx.Request.HttpMethod == "DELETE")
            {
                return new Dictionary<string, object>();
            }
            if (!ctx.Request.HasEntityBody)
            {
                return new Dictionary<string, object>();
            }
            using (StreamReader sr = new StreamReader(ctx.Request.InputStream, Encoding.UTF8))
            {
                string raw = sr.ReadToEnd();
                if (string.IsNullOrEmpty(raw)) return new Dictionary<string, object>();
                object parsed = Json.DeserializeObject(raw);
                Dictionary<string, object> dict = parsed as Dictionary<string, object>;
                if (dict == null) return new Dictionary<string, object>();
                return dict;
            }
        }

        private static void WriteJson(HttpListenerContext ctx, int code, Dictionary<string, object> data)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(Json.Serialize(data));
            ctx.Response.StatusCode = code;
            ctx.Response.ContentType = "application/json; charset=utf-8";
            ctx.Response.ContentLength64 = bytes.Length;
            ctx.Response.OutputStream.Write(bytes, 0, bytes.Length);
            ctx.Response.Close();
        }

        private static Dictionary<string, object> Err(string message)
        {
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["ok"] = false;
            r["error"] = message;
            return r;
        }

        private static Dictionary<string, object> Ok(string key, object value)
        {
            Dictionary<string, object> r = new Dictionary<string, object>();
            r[key] = value;
            return r;
        }

        private static string Str(Dictionary<string, object> body, string key)
        {
            if (body == null || !body.ContainsKey(key) || body[key] == null) return "";
            return Convert.ToString(body[key]).Trim();
        }

        private static bool Bool(Dictionary<string, object> body, string key, bool fallback)
        {
            if (body == null || !body.ContainsKey(key) || body[key] == null) return fallback;
            object v = body[key];
            if (v is bool) return (bool)v;
            string s = Convert.ToString(v).ToLowerInvariant();
            if (s == "true" || s == "1") return true;
            if (s == "false" || s == "0") return false;
            return fallback;
        }

        private static int IntVal(Dictionary<string, object> body, string key, int fallback)
        {
            if (body == null || !body.ContainsKey(key) || body[key] == null) return fallback;
            try { return Convert.ToInt32(body[key]); }
            catch { return fallback; }
        }

        private static string NormalizeEmail(string email)
        {
            if (email == null) return "";
            return email.Trim().ToLowerInvariant();
        }

        private static bool IsValidEmail(string email)
        {
            if (string.IsNullOrEmpty(email) || email.Length > 120) return false;
            if (email.IndexOf("..") >= 0) return false;
            return EmailRx.IsMatch(email);
        }

        private static string HashPassword(string password, out string salt)
        {
            byte[] saltBytes = new byte[16];
            using (RNGCryptoServiceProvider rng = new RNGCryptoServiceProvider())
            {
                rng.GetBytes(saltBytes);
            }
            salt = Convert.ToBase64String(saltBytes);
            return ComputeHash(password, saltBytes);
        }

        private static bool VerifyPassword(string password, string salt, string hash)
        {
            if (string.IsNullOrEmpty(password) || string.IsNullOrEmpty(salt) || string.IsNullOrEmpty(hash))
                return false;
            try
            {
                byte[] saltBytes = Convert.FromBase64String(salt);
                return SlowEquals(ComputeHash(password, saltBytes), hash);
            }
            catch
            {
                return false;
            }
        }

        private static string ComputeHash(string password, byte[] salt)
        {
            using (Rfc2898DeriveBytes pbkdf2 = new Rfc2898DeriveBytes(password, salt, 120000))
            {
                return Convert.ToBase64String(pbkdf2.GetBytes(32));
            }
        }

        private static bool SlowEquals(string a, string b)
        {
            if (a == null || b == null || a.Length != b.Length) return false;
            int diff = 0;
            for (int i = 0; i < a.Length; i++) diff |= a[i] ^ b[i];
            return diff == 0;
        }

        private static string GeneratePassword()
        {
            const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
            char[] buf = new char[12];
            byte[] raw = new byte[12];
            using (RNGCryptoServiceProvider rng = new RNGCryptoServiceProvider())
            {
                rng.GetBytes(raw);
            }
            for (int i = 0; i < 12; i++)
            {
                buf[i] = chars[raw[i] % chars.Length];
            }
            return new string(buf, 0, 4) + "-" + new string(buf, 4, 4) + "-" + new string(buf, 8, 4);
        }

        private static string NewId(string prefix)
        {
            return prefix + "_" + Guid.NewGuid().ToString("N").Substring(0, 12);
        }

        private static string NewToken()
        {
            byte[] raw = new byte[24];
            using (RNGCryptoServiceProvider rng = new RNGCryptoServiceProvider())
            {
                rng.GetBytes(raw);
            }
            return BitConverter.ToString(raw).Replace("-", "").ToLowerInvariant();
        }

        private static string NowIso()
        {
            return DateTime.UtcNow.ToString("o");
        }

        private static string Html(string value)
        {
            if (value == null) return "";
            return value.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");
        }

        private static string SanitizeFile(string id)
        {
            if (id == null) return "";
            return Regex.Replace(id, @"[^a-zA-Z0-9_\-]", "");
        }

        private static bool RateOk(HttpListenerContext ctx, string bucket, int max, int minutes)
        {
            string ip = ctx.Request.RemoteEndPoint != null ? ctx.Request.RemoteEndPoint.Address.ToString() : "unknown";
            string key = bucket + ":" + ip;
            DateTime now = DateTime.UtcNow;
            lock (Hits)
            {
                if (!Hits.ContainsKey(key)) Hits[key] = new List<DateTime>();
                List<DateTime> list = Hits[key];
                for (int i = list.Count - 1; i >= 0; i--)
                {
                    if (list[i] < now.AddMinutes(-minutes)) list.RemoveAt(i);
                }
                if (list.Count >= max) return false;
                list.Add(now);
                return true;
            }
        }
    }
}
