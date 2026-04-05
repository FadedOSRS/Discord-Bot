$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$CheckpointsRoot = Join-Path $ProjectRoot ".checkpoints"

if (-not (Test-Path $CheckpointsRoot)) {
  Write-Host "No checkpoints found."
  exit 0
}

$dirs = Get-ChildItem -Path $CheckpointsRoot -Directory | Sort-Object Name -Descending
if (-not $dirs) {
  Write-Host "No checkpoints found."
  exit 0
}

Write-Host "Available checkpoints:"
foreach ($d in $dirs) {
  Write-Host " - $($d.Name)"
}
