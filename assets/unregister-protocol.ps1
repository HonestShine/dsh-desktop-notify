param(
  [Parameter(Mandatory = $true)]
  [string]$Owner,

  # The protocol handler this plugin registered. It is compared with the live
  # command so an uninstall never removes a registration that now belongs to
  # something else.
  [Parameter(Mandatory = $true)]
  [string]$ScriptPath
)

# Remove the `dshnotify:` protocol when this plugin is uninstalled or disabled.
# A registration carries a per-instance nonce (`Owner`); a reload registers a
# new instance with a new nonce, so the old instance's teardown sees a mismatch
# and leaves the fresh registration alone.

$ErrorActionPreference = 'Stop'
$base = 'HKCU:\Software\Classes\dshnotify'
$result = [ordered]@{ ok = $true; removed = $false; reason = '' }

if (-not (Test-Path -LiteralPath $base)) {
  $result.reason = 'not-registered'
  $result | ConvertTo-Json -Compress
  exit 0
}

$currentOwner = ''
try {
  $currentOwner = [string](Get-ItemProperty -LiteralPath $base -ErrorAction Stop).Owner
} catch {
  $currentOwner = ''
}

$command = ''
try {
  $command = [string](Get-ItemProperty -LiteralPath "$base\shell\open\command" -ErrorAction Stop).'(default)'
} catch {
  $command = ''
}

if ($currentOwner -ne $Owner -or $command -notlike "*$ScriptPath*") {
  $result.reason = 'owner-mismatch'
  $result | ConvertTo-Json -Compress
  exit 0
}

try {
  Remove-Item -LiteralPath $base -Recurse -Force
  $result.removed = $true
} catch {
  $result.ok = $false
  $result.reason = $_.Exception.Message
}

$result | ConvertTo-Json -Compress
