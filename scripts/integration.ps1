param([switch]$Race)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
foreach ($line in Get-Content -LiteralPath (Join-Path $projectRoot '.env')) {
    if ($line -match '^([A-Z_]+)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process') }
}
$env:TEST_MONGODB_URI = $env:MONGODB_URI
Push-Location (Join-Path $projectRoot 'apps/api')
try { if ($Race) { go test -race -count=1 -v ./... } else { go test -count=1 -v ./... }; if ($LASTEXITCODE -ne 0) { throw 'Integration checks failed' } } finally { Pop-Location }
