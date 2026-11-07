param(
  # Paths are passed separately so the command line is assembled here: passing
  # an already-quoted command line through a native executable can silently
  # strip the quotes, and this command must survive install paths with spaces.
  [Parameter(Mandatory = $true)]
  [string]$WscriptPath,
  [Parameter(Mandatory = $true)]
  [string]$VbsScript,
  [Parameter(Mandatory = $true)]
  [string]$ActionDir,

  # Registration nonce written beside the command so a disposing instance can
  # tell whether this registration is still the current one before removing it.
  [Parameter(Mandatory = $true)]
  [string]$Owner
)

$ErrorActionPreference = 'Stop'
$base = 'HKCU:\Software\Classes\dshnotify'
$command = '"' + $WscriptPath + '" //B //Nologo "' + $VbsScript + '" "' + $ActionDir + '" "%1"'

New-Item -Path $base -Force | Out-Null
Set-ItemProperty -Path $base -Name '(default)' -Value 'URL:DSH Notification Actions'
New-ItemProperty -Path $base -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
Set-ItemProperty -Path $base -Name 'Owner' -Value $Owner
New-Item -Path "$base\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$base\shell\open\command" -Name '(default)' -Value $command
