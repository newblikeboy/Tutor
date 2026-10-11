param([switch]$EnableInterviews)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $projectRoot '.env'
if (-not (Test-Path -LiteralPath $configPath)) { throw 'Configure the private .env first.' }
$original = [IO.File]::ReadAllText($configPath)
foreach ($required in @('GOOGLE_OAUTH_CLIENT_ID','GOOGLE_OAUTH_CLIENT_SECRET','GOOGLE_OAUTH_REDIRECT_URI')) {
    if (-not [regex]::IsMatch($original, "(?m)^$required=.+$")) { throw "Missing private $required configuration." }
}
$additions = [Collections.Generic.List[string]]::new()
if (-not [regex]::IsMatch($original, '(?m)^GOOGLE_TOKEN_KEY=')) {
    $bytes = New-Object byte[] 32
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes) } finally { $random.Dispose() }
    $additions.Add('GOOGLE_TOKEN_KEY=' + [Convert]::ToBase64String($bytes))
}
if ($EnableInterviews) {
    $provider = [regex]::Match($original, '(?m)^INTERVIEW_PROVIDER=([^\r\n]*)')
    if ($provider.Success -and $provider.Groups[1].Value -ne 'google') { throw 'INTERVIEW_PROVIDER already exists; review that setting manually. Existing configuration was preserved.' }
    if (-not $provider.Success) { $additions.Add('INTERVIEW_PROVIDER=google') }
}
if ($additions.Count -gt 0) {
    # Add new settings only. Existing OAuth credentials and callback bytes remain unchanged.
    $ending = if ($original.Contains("`r`n")) { "`r`n" } else { "`n" }
    $separator = if ($original.EndsWith("`n")) { '' } else { $ending }
    [IO.File]::AppendAllText($configPath, $separator + ($additions -join $ending) + $ending, [Text.UTF8Encoding]::new($false))
}
Write-Output 'Private Google token encryption configuration is present; no credential values were displayed or replaced.'
