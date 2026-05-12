# scripts/check-role.ps1 - detect mid-session role shift (FS-028 / HV-133).
#
# Windows PowerShell counterpart to scripts/check-role.sh. See that file
# for the contract: prints a one-line notice on role change, silent
# otherwise. Designed to run from the agent host's pre-prompt hook.

$ErrorActionPreference = "SilentlyContinue"

$apiBase = if ($env:BOT_HIVE_API_URL) { $env:BOT_HIVE_API_URL } else { "https://bot-hive-j0ax.onrender.com" }
$cacheFile = ".bot-hive-role-cache"

if (-not (Test-Path ".bot-hive-identity")) { exit 0 }

$colony = $null
$handle = $null
Get-Content ".bot-hive-identity" | ForEach-Object {
    if ($_ -match '^colony=(.+)$') { $colony = $Matches[1].Trim() }
    if ($_ -match '^handle=(.+)$') { $handle = $Matches[1].Trim() }
}
if (-not $handle) { exit 0 }
if (-not $colony) { $colony = $handle }

$originUrl = ""
try { $originUrl = (git remote get-url origin 2>$null) } catch {}
if (-not $originUrl) { exit 0 }
$repoFullName = $originUrl `
    -replace '\.git$', '' `
    -replace '^https?://[^/]+/', '' `
    -replace '^git@[^:]+:', ''
if (-not $repoFullName -or $repoFullName -notmatch '/') { exit 0 }

$uri = "$apiBase/api/bots/whoami?repo_full_name=$([uri]::EscapeDataString($repoFullName))&colony=$([uri]::EscapeDataString($colony))&handle=$([uri]::EscapeDataString($handle))"
$resp = $null
try {
    $resp = Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec 5 -ErrorAction Stop
} catch {
    exit 0
}
if (-not $resp -or -not $resp.seat) { exit 0 }

$seat = $resp.seat
$total = $resp.total
$role = $resp.role

$prevSeat = ""
$prevRole = ""
if (Test-Path $cacheFile) {
    $cacheLine = (Get-Content $cacheFile | Select-Object -First 1)
    if ($cacheLine -match 'seat=([^;]+);role=(.+)') {
        $prevSeat = $Matches[1].Trim()
        $prevRole = $Matches[2]
    }
}

Set-Content -Path $cacheFile -Value "seat=$seat;role=$role" -Encoding utf8

if ($prevSeat -eq "$seat" -and $prevRole -eq "$role") { exit 0 }
# Suppress on first run (no prior cache).
if (-not $prevSeat) { exit 0 }

Write-Output "[BOT-HIVE] Role changed: you are now seat $seat of $total, role: $role."
Write-Output "Announce this to the operator before continuing."
