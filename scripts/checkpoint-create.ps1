param(
  [string]$Label = ""
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$CheckpointsRoot = Join-Path $ProjectRoot ".checkpoints"

if (-not (Test-Path $CheckpointsRoot)) {
  New-Item -ItemType Directory -Path $CheckpointsRoot | Out-Null
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$safeLabel = ($Label -replace '[^a-zA-Z0-9_-]', '-').Trim('-')
$name = if ([string]::IsNullOrWhiteSpace($safeLabel)) { $stamp } else { "$stamp-$safeLabel" }
$target = Join-Path $CheckpointsRoot $name

New-Item -ItemType Directory -Path $target | Out-Null

# Copy project into checkpoint snapshot, excluding heavy/generated dirs.
$null = robocopy $ProjectRoot $target /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP /XD "node_modules" ".checkpoints"

$manifest = [PSCustomObject]@{
  checkpoint = $name
  createdAt  = (Get-Date).ToString("o")
  project    = $ProjectRoot
}

$manifest | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $target "manifest.json")

Write-Host "Created checkpoint: $name"
Write-Host "Path: $target"
