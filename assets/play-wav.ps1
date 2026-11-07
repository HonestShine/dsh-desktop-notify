param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

$player = New-Object System.Media.SoundPlayer -ArgumentList $Path
$player.PlaySync()
