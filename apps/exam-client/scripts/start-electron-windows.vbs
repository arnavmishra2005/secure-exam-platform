Option Explicit

Dim fso, shell, appDir, repoDir, electronExe, launchUrl, command
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

If WScript.Arguments.Count <> 1 Then WScript.Quit 2
launchUrl = WScript.Arguments(0)

Dim urlPattern
Set urlPattern = New RegExp
urlPattern.Pattern = "^secure-exam://launch/[A-Za-z0-9_-]{43}$"
If Not urlPattern.Test(launchUrl) Then WScript.Quit 2

appDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
repoDir = fso.GetAbsolutePathName(appDir & "\..\..")
electronExe = repoDir & "\node_modules\electron\dist\electron.exe"
If Not fso.FileExists(electronExe) Then WScript.Quit 3

shell.Environment("Process").Remove "ELECTRON_RUN_AS_NODE"
command = """" & electronExe & """ """ & appDir & """ """ & launchUrl & """"
shell.Run command, 1, False
