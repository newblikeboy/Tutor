param([ValidateSet('api','migrate','seed')][string]$Task = 'api')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$configFile = Join-Path $projectRoot '.env'
if (-not (Test-Path -LiteralPath $configFile)) { throw 'Copy .env.example to .env and configure backend values first.' }
foreach ($line in Get-Content -LiteralPath $configFile) {
    if ($line -match '^([A-Z_]+)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process') }
}
Push-Location (Join-Path $projectRoot 'apps/api')
try { go run "./cmd/$Task"; if ($LASTEXITCODE -ne 0) { throw 'Go command failed' } } finally { Pop-Location }
