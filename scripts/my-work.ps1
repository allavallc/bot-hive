# scripts/my-work.ps1 - Windows PowerShell version of the bot session-start helper.
# See scripts/my-work.sh for the full description.

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

if (-not $env:BOT_HIVE_HANDLE) {
    Write-Error "BOT_HIVE_HANDLE not set."
    exit 2
}

$handle = $env:BOT_HIVE_HANDLE

git pull --rebase origin main | Out-Null

Write-Host "=== you are: $handle ==="

# Section 1 - your own rejected work
Write-Host ""
Write-Host "=== your rejected work (claim before any new ticket) ==="
$rejected = @()
Get-ChildItem -Path "hive/in-progress" -Filter "*.md" -ErrorAction SilentlyContinue | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    if ($content -match "(?m)^- \*\*Assigned to\*\*: $([regex]::Escape($handle))" -and
        $content -match "(?m)^- \*\*Rejected by\*\*:\s*\S") {
        $hv = $_.BaseName -replace '-\d+$', ''
        $reason = if ($content -match "(?m)^- \*\*Rejection reason\*\*:\s*(.+)$") { $Matches[1].Trim() } else { "" }
        $rejected += "  $hv - rejected: $reason"
    }
}
if ($rejected.Count -eq 0) { Write-Host "  (none)" } else { $rejected | ForEach-Object { Write-Host $_ } }

# Section 2 - in-progress (not rejected)
Write-Host ""
Write-Host "=== your in-progress (not rejected) ==="
$inprog = @()
Get-ChildItem -Path "hive/in-progress" -Filter "*.md" -ErrorAction SilentlyContinue | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    if ($content -match "(?m)^- \*\*Assigned to\*\*: $([regex]::Escape($handle))" -and
        -not ($content -match "(?m)^- \*\*Rejected by\*\*:\s*\S")) {
        $hv = $_.BaseName -replace '-\d+$', ''
        $title = (Get-Content $_.FullName -TotalCount 1) -replace '^# \[.*\] ', ''
        $inprog += "  $hv - $title"
    }
}
if ($inprog.Count -eq 0) { Write-Host "  (none)" } else { $inprog | ForEach-Object { Write-Host $_ } }

# Section 3 - notes addressed to you
Write-Host ""
Write-Host "=== notes addressed to you (last 24h) ==="
$cutoff = (Get-Date).ToUniversalTime().AddHours(-24)
$notes = @()
if (Test-Path "hive/notes-to-bots") {
    Get-ChildItem -Path "hive/notes-to-bots" -Filter "*.log" | ForEach-Object {
        $author = $_.BaseName
        Get-Content $_.FullName | ForEach-Object {
            if ($_ -match "^([\d\-T:Z\.]+)\t(.+)$") {
                $ts = $Matches[1]
                $msg = $Matches[2]
                try { $tsDate = [datetime]::Parse($ts).ToUniversalTime() } catch { return }
                if ($tsDate -lt $cutoff) { return }
                if ($msg -match "@$([regex]::Escape($handle))\b" -or $msg -match '@swarm\b') {
                    $notes += "  [$ts from $author] $msg"
                }
            }
        }
    }
}
if ($notes.Count -eq 0) { Write-Host "  (none)" } else { $notes | ForEach-Object { Write-Host $_ } }

# Section 4 - recent swarm activity
Write-Host ""
Write-Host "=== recent swarm activity (last 50 events) ==="
if (Test-Path "hive/events") {
    $events = Get-ChildItem -Path "hive/events" -Filter "*.log" | ForEach-Object {
        Get-Content $_.FullName | Where-Object { $_ -notmatch '^#' -and $_.Trim() -ne "" }
    } | Sort-Object | Select-Object -Last 50
    if ($events) { $events | ForEach-Object { Write-Host $_ } } else { Write-Host "  (no events yet)" }
} else {
    Write-Host "  (no events yet)"
}

# Section 5 - available backlog
Write-Host ""
Write-Host "=== available backlog (DAG-walk leaves, FS-active only) ==="
$leaves = @()
Get-ChildItem -Path "hive/backlog" -Filter "*.md" -ErrorAction SilentlyContinue | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $hv = $_.BaseName -replace '-\d+$', ''
    $title = (Get-Content $_.FullName -TotalCount 1) -replace '^# \[.*\] ', ''

    # Filter by FS status + Owner
    $fs = if ($content -match "(?m)^- \*\*Feature set\*\*:\s*(\S+)") { $Matches[1] } else { "" }
    if ($fs -and (Test-Path "hive/feature-sets/$fs.md")) {
        $fsContent = Get-Content "hive/feature-sets/$fs.md" -Raw
        if ($fsContent -match "(?m)^\*\*Status\*\*:\s*(\w+)") {
            if ($Matches[1] -ne "active") { return }
        }
        if ($fsContent -match "(?m)^\*\*Owner\*\*:\s*(\S+)") {
            $fsOwner = $Matches[1].Trim()
            if ($fsOwner -and $fsOwner -ne $handle) { return }
        }
    }

    # Filter by Blocked-by
    if ($content -match "(?m)^- \*\*Blocked by\*\*:\s*(.+)$") {
        $blockers = $Matches[1].Trim()
        if ($blockers) {
            $unfinished = $false
            foreach ($b in $blockers -split ',\s*') {
                $b = $b.Trim()
                if ($b -and -not (Get-ChildItem "hive/done" -Filter "$b-*.md" -ErrorAction SilentlyContinue)) {
                    $unfinished = $true
                    break
                }
            }
            if ($unfinished) { return }
        }
    }

    $leaves += "  $hv - $title"
}
if ($leaves.Count -eq 0) {
    Write-Host "  (none - all blocked, claimed, or in non-active FSs)"
} else {
    $leaves | ForEach-Object { Write-Host $_ }
}
