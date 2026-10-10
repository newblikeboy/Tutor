param([string]$EnvPath = '.env')
$ErrorActionPreference = 'Stop'
$resolvedPath = [System.IO.Path]::GetFullPath($EnvPath)
if (-not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) { throw 'Create your private environment file before configuring email.' }
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($resolvedPath.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  $relativePath = $resolvedPath.Substring($projectRoot.Length + 1)
  & git -C $projectRoot check-ignore --quiet -- $relativePath
  if ($LASTEXITCODE -ne 0) { throw 'SMTP secrets can only be written to a private, Git-ignored environment file.' }
  $tracked = & git -C $projectRoot ls-files -- $relativePath
  if ($tracked) { throw 'Refusing to write SMTP secrets to a tracked file.' }
}
# Never echo the app password or put it in process arguments.
$secret = Read-Host 'Google Workspace app password for support@gocoaching.in (hidden)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try { $appPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Replace(' ', '') }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
if ($appPassword -notmatch '^[a-zA-Z0-9]{16}$') { throw 'Enter the 16-character Google app password, not your account password.' }
$lines = [System.IO.File]::ReadAllLines($resolvedPath)
$existingKey = $lines | Where-Object { $_ -match '^MAIL_TOKEN_KEY=' } | Select-Object -Last 1
if ($existingKey) {
  $tokenKey = $existingKey.Substring('MAIL_TOKEN_KEY='.Length).Trim().Trim('"').Trim("'")
  try { $keyBytes = [Convert]::FromBase64String($tokenKey) } catch { throw 'The existing MAIL_TOKEN_KEY is invalid. Review it before making changes.' }
  if ($keyBytes.Length -ne 32) { throw 'The existing MAIL_TOKEN_KEY must contain 32 bytes.' }
} else {
  $keyBytes = New-Object byte[] 32
  $random = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $random.GetBytes($keyBytes) } finally { $random.Dispose() }
  $tokenKey = [Convert]::ToBase64String($keyBytes)
}
$settings = [ordered]@{ MAIL_PROVIDER='smtp'; SMTP_HOST='smtp.gmail.com'; SMTP_PORT='587'; SMTP_SECURITY='starttls'; SMTP_USER='support@gocoaching.in'; SMTP_FROM='support@gocoaching.in'; SMTP_PASSWORD=$appPassword; MAIL_TOKEN_KEY=$tokenKey }
$kept = @($lines | Where-Object { $key = ($_ -split '=',2)[0]; -not $settings.Contains($key) })
$updated = @($kept) + @($settings.GetEnumerator() | ForEach-Object { "$( $_.Key )=$( $_.Value )" })
[System.IO.File]::WriteAllLines($resolvedPath, $updated, (New-Object System.Text.UTF8Encoding($false)))
$appPassword = $null
$settings['SMTP_PASSWORD'] = $null
Write-Host 'Private SMTP settings saved. Restart the Go API to enable email. No test email was sent.'
