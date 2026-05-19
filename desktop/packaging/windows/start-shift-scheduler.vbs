Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
appRoot = fso.GetParentFolderName(WScript.ScriptFullName)
command = """" & appRoot & "\start-shift-scheduler.cmd" & """"
shell.Run command, 0, False
