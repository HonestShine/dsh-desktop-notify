# Probe whether Windows actually accepts each candidate AppUserModelID.
#
# A toast is attributed through its AUMID: an identifier Windows has not
# registered still renders, but the header shows the raw identifier and a
# generic icon. Reading ToastNotificationManager's Setting is the only way to
# tell a registered identity from an unknown one without showing anything.
#
# Emits one JSON object on stdout:
#   { "aumid": "...", "setting": "Enabled" }   first acceptable candidate
#   {}                                          none of the candidates is known
param([string]$Candidates = '')

$ErrorActionPreference = 'Stop'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null

$list = @($Candidates -split ';' | Where-Object { $_ -ne '' })
if ($list.Count -eq 0) { '{}'; exit 0 }

foreach ($candidate in $list) {
  try {
    $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($candidate)
    if ($null -eq $notifier) { continue }
    $setting = $notifier.Setting
    if ($null -eq $setting) { continue }
    [pscustomobject]@{ aumid = $candidate; setting = [string]$setting } | ConvertTo-Json -Compress
    exit 0
  } catch {
    # An identifier the OS rejects is simply not a candidate.
  }
}
'{}'
