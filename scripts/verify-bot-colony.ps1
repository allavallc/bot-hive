# scripts/verify-bot-colony.ps1 -- local Bot Hive role verifier.
#
# Fetches /api/bots/colony and checks one colony's active seats against
# hive/roles.md's consolidation table. Intended for local join/leave tests.

[CmdletBinding()]
param(
    [string]$ApiBase,
    [string]$RepoFullName,
    [string]$Colony
)

$ErrorActionPreference = "Stop"

function Read-IdentityValue {
    param([string]$Key)
    if (-not (Test-Path ".bot-hive-identity")) { return $null }
    $line = Get-Content ".bot-hive-identity" |
        Where-Object { $_ -match "^$([regex]::Escape($Key))=" } |
        Select-Object -First 1
    if (-not $line) { return $null }
    return ($line -replace "^$([regex]::Escape($Key))=", "").Trim()
}

function Expected-Role {
    param(
        [int]$Total,
        [int]$Seat
    )
    if ($Total -eq 1) { return "PM + coder + tester" }
    if ($Total -eq 2) {
        if ($Seat -eq 1) { return "PM + tester" }
        if ($Seat -eq 2) { return "coder" }
    }
    if ($Total -eq 3) {
        if ($Seat -eq 1) { return "PM" }
        if ($Seat -eq 2) { return "coder" }
        if ($Seat -eq 3) { return "tester" }
    }
    if ($Total -ge 4) {
        if ($Seat -eq 1) { return "PM" }
        if ($Seat -eq 2) { return "coder" }
        if ($Seat -eq 3) { return "tester" }
        if ($Seat -ge 4) { return "coder (additional)" }
    }
    throw "invalid total/seat: total=$Total seat=$Seat"
}

if (-not $ApiBase) {
    if ($env:BOT_HIVE_API_URL) {
        $ApiBase = $env:BOT_HIVE_API_URL
    } elseif (Test-Path ".bot-hive-api-url") {
        $ApiBase = (Get-Content ".bot-hive-api-url" -Raw).Trim()
    } else {
        $ApiBase = "http://localhost:3000"
    }
}

if (-not $RepoFullName) {
    $originUrl = git remote get-url origin 2>$null
    if (-not $originUrl) { throw "no origin remote; pass -RepoFullName owner/repo" }
    $RepoFullName = $originUrl `
        -replace '\.git$', '' `
        -replace '^https?://[^/]+/', '' `
        -replace '^git@[^:]+:', ''
}

if (-not $Colony) {
    $Colony = Read-IdentityValue -Key "colony"
}
if (-not $Colony) {
    try { $Colony = (gh api user --jq .login 2>$null) } catch { }
}
if (-not $Colony) { throw "could not resolve colony; pass -Colony <name>" }

$uri = "$ApiBase/api/bots/colony?repo_full_name=$([uri]::EscapeDataString($RepoFullName))"
$resp = Invoke-RestMethod -Uri $uri -Method Get
$entry = @($resp.colonies | Where-Object { $_.colony -eq $Colony } | Select-Object -First 1)

if (-not $entry) {
    Write-Output "PASS: colony '$Colony' has no active bots."
    exit 0
}

$seats = @($entry.seats | Sort-Object seat)
$total = $seats.Count
$failed = $false

foreach ($s in $seats) {
    $expected = Expected-Role -Total $total -Seat ([int]$s.seat)
    $ok = $s.role -eq $expected
    $status = if ($ok) { "PASS" } else { "FAIL" }
    Write-Output "${status}: seat $($s.seat) handle=$($s.handle) role='$($s.role)' expected='$expected'"
    if (-not $ok) { $failed = $true }
}

if ($failed) { exit 1 }
Write-Output "PASS: $Colony role map is correct for $total active bot(s)."
