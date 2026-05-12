# scripts/whoami.ps1 - Windows PowerShell version of the bot identity +
# role resolver. See scripts/whoami.sh for the canonical flow.

$ErrorActionPreference = "Stop"

$colony = $null
$handle = $null
$explicitRole = $null
if (Test-Path ".bot-hive-identity") {
    Get-Content ".bot-hive-identity" | ForEach-Object {
        if ($_ -match '^colony=(.+)$') { $colony = $Matches[1].Trim() }
        if ($_ -match '^handle=(.+)$') { $handle = $Matches[1].Trim() }
        # HV-122: optional role= override.
        if ($_ -match '^role=(.+)$') { $explicitRole = $Matches[1].Trim() }
    }
}
if (-not $handle -and $env:BOT_HIVE_HANDLE) { $handle = $env:BOT_HIVE_HANDLE }
if (-not $handle) {
    Write-Error "no bot identity found (.bot-hive-identity missing and BOT_HIVE_HANDLE unset)"
    exit 2
}
if (-not $colony) { $colony = $handle }
$actor = "$colony.$handle"

$now = (Get-Date).ToUniversalTime()
$activeThreshold = New-TimeSpan -Hours 2

# Find all logs for this colony. Build list of active bots (last event
# within 2h) with their first-seen timestamp for tenure ordering.
$activeBots = @()
$logs = Get-ChildItem -Path "hive/events" -Filter "$colony.*.log" -ErrorAction SilentlyContinue
foreach ($log in $logs) {
    $basename = $log.BaseName
    $botHandle = $basename -replace "^$([regex]::Escape($colony))\.", ""
    $firstTs = $null
    $lastTs = $null
    Get-Content $log.FullName | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        $ts = ($line -split '\s+')[0]
        if (-not $firstTs) { $firstTs = $ts }
        $lastTs = $ts
    }
    if (-not $lastTs) { return }
    try {
        $lastDate = [datetime]::Parse($lastTs).ToUniversalTime()
        $firstDate = [datetime]::Parse($firstTs).ToUniversalTime()
    } catch { return }
    $age = $now - $lastDate
    if ($age -le $activeThreshold) {
        $activeBots += [PSCustomObject]@{ FirstSeen = $firstDate; Handle = $botHandle }
    }
}

# Sort by first-seen ascending (older = higher tier).
$sorted = $activeBots | Sort-Object FirstSeen

# Find our position. If absent (just spawned, no events), append self last.
$selfIndex = -1
for ($i = 0; $i -lt $sorted.Count; $i++) {
    if ($sorted[$i].Handle -eq $handle) { $selfIndex = $i; break }
}
if ($selfIndex -lt 0) {
    $sorted = @($sorted) + ([PSCustomObject]@{ FirstSeen = $now; Handle = $handle })
    $selfIndex = $sorted.Count - 1
}

$total = $sorted.Count
$position = $selfIndex + 1

# Consolidation table (hive/roles.md).
$roles = ""
$skills = ""
switch ($total) {
    1 {
        $roles = "PM + coder + tester"
        $skills = "hive/skills/pm.md, hive/skills/coder.md, hive/skills/tester.md"
    }
    2 {
        if ($position -eq 1) {
            $roles = "PM + tester"
            $skills = "hive/skills/pm.md, hive/skills/tester.md"
        } else {
            $roles = "coder"
            $skills = "hive/skills/coder.md"
        }
    }
    Default {
        if ($position -eq 1) {
            $roles = "PM"
            $skills = "hive/skills/pm.md"
        } elseif ($position -eq 2) {
            $roles = "coder"
            $skills = "hive/skills/coder.md"
        } elseif ($position -eq 3) {
            $roles = "tester"
            $skills = "hive/skills/tester.md"
        } else {
            $roles = "coder (additional)"
            $skills = "hive/skills/coder.md"
        }
    }
}

# HV-122: explicit role= override. Applied after the tenure heuristic so
# the "colony bots active" tier metric still reflects reality even when
# the role itself is forced.
$roleSource = "heuristic"
if ($explicitRole) {
    switch ($explicitRole) {
        "pm"     { $roles = "PM";     $skills = "hive/skills/pm.md";     $roleSource = "explicit (.bot-hive-identity role=pm)" }
        "coder"  { $roles = "coder";  $skills = "hive/skills/coder.md";  $roleSource = "explicit (.bot-hive-identity role=coder)" }
        "tester" { $roles = "tester"; $skills = "hive/skills/tester.md"; $roleSource = "explicit (.bot-hive-identity role=tester)" }
        default  { Write-Warning "unknown role '$explicitRole' in .bot-hive-identity; valid values are pm, coder, tester. Falling back to the tenure heuristic." }
    }
}

Write-Host "actor: $actor"
Write-Host "colony bots active: $total (you are $position/$total)"
Write-Host "role: $roles"
Write-Host "role source: $roleSource"
Write-Host "read these skill files: $skills"
