Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & root & "\server\start.ps1"""
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = root
sh.Run cmd, 0, False
