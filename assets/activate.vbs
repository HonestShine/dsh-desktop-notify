Option Explicit

' Called by Windows protocol activation: activate.vbs <rendezvous-dir> <uri>
' Writes one JSON decision file for the Harness Host to consume, then focuses
' the application through its own dsh:// protocol.
'
' The token and decision come from the activation URI, so they are untrusted:
' the token must be the UUID minted by lib/winrt.js and the decision must be a
' protocol-safe action id. Anything else is discarded before it reaches the
' filesystem, which keeps a crafted dshnotify: URI from escaping the rendezvous
' directory via a token such as `..\..\target`.

Dim dir, uri, payload, queryAt, hashAt, parts, pair, i, token, decision
Dim tokenPattern, decisionPattern, re
If WScript.Arguments.Count < 2 Then WScript.Quit 1
dir = WScript.Arguments(0)
uri = WScript.Arguments(1)

queryAt = InStr(uri, "?")
If queryAt = 0 Then WScript.Quit 2
payload = Mid(uri, queryAt + 1)

' Ignore any fragment so only the query pairs are parsed.
hashAt = InStr(payload, "#")
If hashAt > 0 Then payload = Left(payload, hashAt - 1)

token = ""
decision = ""
parts = Split(payload, "&")
For i = 0 To UBound(parts)
  pair = Split(parts(i), "=")
  If UBound(pair) >= 1 Then
    Select Case LCase(pair(0))
      Case "token"
        token = pair(1)
      Case "decision"
        decision = pair(1)
    End Select
  End If
Next

If Len(token) = 0 Or Len(decision) = 0 Then WScript.Quit 3

tokenPattern = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
decisionPattern = "^[A-Za-z0-9_-]{1,64}$"
Set re = CreateObject("VBScript.RegExp")
re.Global = False
re.Pattern = tokenPattern
If Not re.Test(token) Then WScript.Quit 4
re.Pattern = decisionPattern
If Not re.Test(decision) Then WScript.Quit 5

Dim fso, file, stream, shell
Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FolderExists(dir) Then fso.CreateFolder(dir)
file = fso.BuildPath(dir, token & ".json")
Set stream = fso.CreateTextFile(file, True)
stream.Write "{""token"":""" & token & """,""decision"":""" & decision & """,""at"":" & CStr(CLng(Timer * 1000)) & "}"
stream.Close

On Error Resume Next
Set shell = CreateObject("WScript.Shell")
shell.Run "dsh://open", 1, False
