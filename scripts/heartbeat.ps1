# scripts/heartbeat.ps1 - background liveness ping (FS-028 / HV-133).
#
# Windows PowerShell counterpart to scripts/heartbeat.sh. Launch as a
# background job: `Start-Job -FilePath ./scripts/heartbeat.ps1` (the
# bot-startup doc covers the exact invocation).

$ErrorActionPreference = "SilentlyContinue"

$apiBase = if ($env:BOT_HIVE_API_URL) { $env:BOT_HIVE_API_URL } else { "https://bot-hive-j0ax.onrender.com" }
$intervalSeconds = if ($env:BOT_HIVE_HEARTBEAT_SECONDS) { [int]$env:BOT_HIVE_HEARTBEAT_SECONDS } else { 300 }
$pidFile = ".bot-hive-heartbeat.pid"

if (-not (Test-Path ".bot-hive-identity")) {
    Write-Error "heartbeat: no .bot-hive-identity; exiting."
    exit 2
}

$colony = $null
$handle = $null
Get-Content ".bot-hive-identity" | ForEach-Object {
    if ($_ -match '^colony=(.+)$') { $colony = $Matches[1].Trim() }
    if ($_ -match '^handle=(.+)$') { $handle = $Matches[1].Trim() }
}
if (-not $handle) {
    Write-Error "heartbeat: no handle."
    exit 2
}
if (-not $colony) { $colony = $handle }

$originUrl = ""
try { $originUrl = (git remote get-url origin 2>$null) } catch {}
if (-not $originUrl) {
    Write-Error "heartbeat: no origin remote."
    exit 2
}
$repoFullName = $originUrl `
    -replace '\.git$', '' `
    -replace '^https?://[^/]+/', '' `
    -replace '^git@[^:]+:', ''

Set-Content -Path $pidFile -Value $PID -Encoding utf8

while ($true) {
    $payload = @{ repo_full_name = $repoFullName; colony = $colony; handle = $handle } | ConvertTo-Json -Compress
    try {
        Invoke-RestMethod -Uri "$apiBase/api/bots/heartbeat" `
            -Method Post `
            -ContentType "application/json" `
            -Body $payload `
            -TimeoutSec 10 `
            -ErrorAction Stop | Out-Null
    } catch {
        # Transient: log to stderr and keep going.
        Write-Error "heartbeat ping failed: $_"
    }
    Start-Sleep -Seconds $intervalSeconds
}
