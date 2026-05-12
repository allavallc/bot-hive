# scripts/whoami.ps1 - bot identity + role resolver (FS-028 / HV-133).
#
# Windows PowerShell version. See scripts/whoami.sh for the canonical
# flow. Calls POST /api/bots/join on the platform server (idempotent).

$ErrorActionPreference = "Stop"

$apiBase = if ($env:BOT_HIVE_API_URL) { $env:BOT_HIVE_API_URL } else { "https://bot-hive-j0ax.onrender.com" }

$colony = $null
$handle = $null
$explicitRole = $null
if (Test-Path ".bot-hive-identity") {
    Get-Content ".bot-hive-identity" | ForEach-Object {
        if ($_ -match '^colony=(.+)$') { $colony = $Matches[1].Trim() }
        if ($_ -match '^handle=(.+)$') { $handle = $Matches[1].Trim() }
        if ($_ -match '^role=(.+)$')   { $explicitRole = $Matches[1].Trim() }
    }
}
if (-not $handle -and $env:BOT_HIVE_HANDLE) { $handle = $env:BOT_HIVE_HANDLE }
if (-not $handle) {
    Write-Error "no bot identity found (.bot-hive-identity missing and BOT_HIVE_HANDLE unset)."
    exit 2
}
if (-not $colony) { $colony = $handle }
$actor = "$colony.$handle"

# Derive the repo full name from origin.
$originUrl = ""
try { $originUrl = (git remote get-url origin 2>$null) } catch { $originUrl = "" }
if (-not $originUrl) {
    Write-Error "no 'origin' git remote configured."
    exit 3
}
$repoFullName = $originUrl `
    -replace '\.git$', '' `
    -replace '^https?://[^/]+/', '' `
    -replace '^git@[^:]+:', ''
if (-not $repoFullName -or $repoFullName -notmatch '/') {
    Write-Error "could not parse 'owner/repo' from origin URL: $originUrl"
    exit 3
}

$uri = "$apiBase/api/bots/join"
$payload = @{ repo_full_name = $repoFullName; colony = $colony; handle = $handle } | ConvertTo-Json -Compress
try {
    $resp = Invoke-RestMethod -Uri $uri -Method Post -ContentType "application/json" -Body $payload -ErrorAction Stop
} catch {
    Write-Error "server unreachable or returned error: $_"
    exit 4
}

$seat = $resp.seat
$total = $resp.total
$serverRole = $resp.role
$skills = if ($resp.skill_files) { ($resp.skill_files -join ", ") } else { "" }

$roles = $serverRole
$roleSource = "heuristic"
if ($explicitRole) {
    switch ($explicitRole) {
        "pm"     { $roles = "PM";     $skills = "hive/skills/pm.md";     $roleSource = "explicit (.bot-hive-identity role=pm)" }
        "coder"  { $roles = "coder";  $skills = "hive/skills/coder.md";  $roleSource = "explicit (.bot-hive-identity role=coder)" }
        "tester" { $roles = "tester"; $skills = "hive/skills/tester.md"; $roleSource = "explicit (.bot-hive-identity role=tester)" }
        default  { Write-Warning "unknown role '$explicitRole' in .bot-hive-identity; valid values are pm, coder, tester. Falling back to the server's role." }
    }
}

Write-Host "actor: $actor"
Write-Host "colony bots active: $total (you are $seat/$total)"
Write-Host "role: $roles"
Write-Host "role source: $roleSource"
Write-Host "read these skill files: $skills"
