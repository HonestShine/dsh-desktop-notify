param(
  [Parameter(Mandatory = $true)]
  [string]$CommandValue
)

$ErrorActionPreference = 'Stop'
$base = 'HKCU:\Software\Classes\dshnotify'

New-Item -Path $base -Force | Out-Null
Set-ItemProperty -Path $base -Name '(default)' -Value 'URL:DSH Notification Actions'
New-ItemProperty -Path $base -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
New-Item -Path "$base\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$base\shell\open\command" -Name '(default)' -Value $CommandValue
