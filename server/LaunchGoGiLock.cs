using System;
using System.Diagnostics;
using System.IO;

namespace GoGiLock
{
    internal static class Launch
    {
        private static int Main(string[] args)
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string root = Path.GetFullPath(Path.Combine(baseDir, ".."));
            string script = Path.Combine(baseDir, "start.ps1");
            if (!File.Exists(script))
            {
                script = Path.Combine(root, "server", "start.ps1");
            }
            if (!File.Exists(script))
            {
                return 1;
            }

            bool admin = args != null && args.Length > 0 && string.Equals(args[0], "-Admin", StringComparison.OrdinalIgnoreCase);
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = "powershell.exe";
            psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + script + "\"" + (admin ? " -Admin" : "");
            psi.WorkingDirectory = Path.GetDirectoryName(script);
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            psi.UseShellExecute = true;
            Process.Start(psi);
            return 0;
        }
    }
}
