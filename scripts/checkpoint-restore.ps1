param(
  [string]$Name = "",
  [switch]$Latest
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$CheckpointsRoot = Join-Path $ProjectRoot ".checkpoints"

if (-not (Test-Path $CheckpointsRoot)) {
  throw "No .checkpoints directory found."
}

if ([string]::IsNullOrWhiteSpace($Name) -and -not $Latest) {
  throw "Provide -Name <checkpoint> or -Latest."
}

if ($Latest) {
  $latestDir = Get-ChildItem -Path $CheckpointsRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $latestDir) {
    throw "No checkpoints available."
  }
  $Name = $latestDir.Name
}

$source = Join-Path $CheckpointsRoot $Name
if (-not (Test-Path $source)) {
  throw "Checkpoint '$Name' not found."
}

Write-Host "Restoring checkpoint: $Name"

# Mirror checkpoint back into project; keep .checkpoints directory untouched.
$null = robocopy $source $ProjectRoot /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP /XD ".checkpoints"

Write-Host "Restore complete."
