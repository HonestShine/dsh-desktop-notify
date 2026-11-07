param(
  [string]$Executable = '',
  [string]$ProductName = 'DeepSeek Harness'
)

# Resolve the AppUserModelID Windows has actually registered for this app.
#
# A desktop toast is attributed through its AUMID: Windows looks up a Start Menu
# shortcut whose System.AppUserModel.ID matches, and takes the display name and
# icon from that shortcut. Passing an unregistered AUMID (for example the
# installer's old appId) makes the toast header show the raw AUMID string and a
# generic icon instead of the application name.
#
# Emits one compact JSON object on stdout, or `{}` when nothing matches:
#   { "aumid": "...", "shortcut": "...", "target": "...", "icon": "...", "displayName": "..." }

$ErrorActionPreference = 'Stop'

$roots = New-Object System.Collections.Generic.List[string]
foreach ($name in @('Programs', 'CommonPrograms')) {
  $folder = [Environment]::GetFolderPath($name)
  if (-not [string]::IsNullOrWhiteSpace($folder) -and (Test-Path -LiteralPath $folder)) {
    $roots.Add($folder)
  }
}

$shell = New-Object -ComObject Shell.Application
$wsh = New-Object -ComObject WScript.Shell
$direct = $null
$named = $null

foreach ($root in $roots) {
  $links = Get-ChildItem -LiteralPath $root -Recurse -Filter '*.lnk' -ErrorAction SilentlyContinue
  foreach ($link in $links) {
    try {
      $shortcut = $wsh.CreateShortcut($link.FullName)
      $target = [string]$shortcut.TargetPath
      if ([string]::IsNullOrWhiteSpace($target)) { continue }
      $item = $shell.Namespace($link.DirectoryName).ParseName($link.Name)
      if ($null -eq $item) { continue }
      $aumid = [string]$item.ExtendedProperty('System.AppUserModel.ID')
      if ([string]::IsNullOrWhiteSpace($aumid)) { continue }
      $entry = [pscustomobject]@{
        aumid       = $aumid.Trim()
        shortcut    = $link.FullName
        target      = $target
        icon        = [string]$shortcut.IconLocation
        displayName = [string]$shortcut.Description
      }
      if (-not [string]::IsNullOrWhiteSpace($Executable) -and ($target -ieq $Executable)) {
        $direct = $entry
        break
      }
      if ($null -eq $named -and $target -like "*$ProductName*") { $named = $entry }
    } catch {
      # A shortcut the shell cannot read is not evidence about the app; skip it.
    }
  }
  if ($null -ne $direct) { break }
}

$found = if ($null -ne $direct) { $direct } else { $named }
if ($null -ne $found) {
  $found | ConvertTo-Json -Compress
} else {
  '{}'
}
