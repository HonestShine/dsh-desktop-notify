param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('show', 'remove')]
  [string]$Mode,

  [Parameter(Mandatory = $true)]
  [string]$AppId,

  [string]$EncodedXml = '',
  [string]$Tag = '',
  [string]$Group = ''
)

$ErrorActionPreference = 'Stop'

[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId)

if ($Mode -eq 'remove') {
  if ($Tag.Length -gt 0) {
    [Windows.UI.Notifications.ToastNotificationManager]::History.Remove($Tag, $Group, $AppId)
  }
  exit 0
}

[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$xmlText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($EncodedXml))
$document = New-Object Windows.Data.Xml.Dom.XmlDocument
$document.LoadXml($xmlText)
$toast = [Windows.UI.Notifications.ToastNotification]::new($document)
if ($Tag.Length -gt 0) { $toast.Tag = $Tag }
if ($Group.Length -gt 0) { $toast.Group = $Group }
$notifier.Show($toast)
exit 0
