# scripts/in-review.ps1 - Windows PowerShell version of the in-review helper.
# See scripts/in-review.sh for the canonical flow this mirrors.

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$HvId
)

$ErrorActionPreference = "Stop"

# Resolve bot identity (ADR-003).
$colony = $null
$handle = $null
if (Test-Path ".bot-hive-identity") {
    Get-Content ".bot-hive-identity" | ForEach-Object {
        if ($_ -match '^colony=(.+)$') { $colony = $Matches[1].Trim() }
        if ($_ -match '^handle=(.+)$') { $handle = $Matches[1].Trim() }
    }
}
if (-not $handle -and $env:BOT_HIVE_HANDLE) { $handle = $env:BOT_HIVE_HANDLE }
if (-not $handle) {
    Write-Error "Bot identity not found. Add-a-Bot writes .bot-hive-identity; alternatively, set BOT_HIVE_HANDLE."
    exit 2
}
if (-not $colony) { $colony = $handle }
$actor = "$colony.$handle"

if ($HvId -notmatch '^HV-\d+$') {
    Write-Error "Ticket id must look like HV-<number>; got '$HvId'"
    exit 2
}

$ticketFile = Get-ChildItem -Path "hive/in-progress" -Filter "$HvId-*.md" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $ticketFile) {
    Write-Error "$HvId not found in hive/in-progress/. Has it been claimed yet?"
    exit 1
}

# Soft check on Assigned-to (warn, don't block).
$ticketContent = Get-Content -Raw $ticketFile.FullName
if ($ticketContent -match "(?m)^- \*\*Assigned to\*\*:[ \t]*(\S+)") {
    $assigned = $Matches[1].Trim()
    if ($assigned -and $assigned -ne $actor -and $assigned -ne $handle) {
        Write-Warning "$HvId is assigned to '$assigned', not '$actor'. Continuing."
    }
}

$nowIso = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$today = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
$ticketName = $ticketFile.Name
$newPath = "hive/in-review/$ticketName"

if (-not (Test-Path "hive/in-review")) { New-Item -ItemType Directory -Path "hive/in-review" | Out-Null }
git mv $ticketFile.FullName $newPath

$content = Get-Content -Raw -Encoding UTF8 -Path $newPath
function Patch-Field {
    param([string]$text, [string]$key, [string]$value)
    $pattern = "(?m)^- \*\*$([regex]::Escape($key))\*\*:.*$"
    if ($text -match $pattern) {
        return [regex]::Replace($text, $pattern, "- **$key**: $value", 1)
    }
    return $text
}
$content = Patch-Field $content "Status" "in-review"
$content = Patch-Field $content "Completed" $today
$content = Patch-Field $content "Last touched" $nowIso
[System.IO.File]::WriteAllText((Resolve-Path $newPath), $content, [System.Text.UTF8Encoding]::new($false))

if (-not (Test-Path "hive/events")) { New-Item -ItemType Directory -Path "hive/events" | Out-Null }
"$nowIso $HvId in-review $actor" | Add-Content -Path "hive/events/$actor.log"

git add hive/
git commit -m "${HvId}: in-review - $actor"
git push

# Anti-buzz verification: confirm the file actually moved to in-review/ on
# the remote branch, not just locally. If a hook reverted the move or push
# silently failed, fail loud.
Start-Sleep -Seconds 1
$branch = (git branch --show-current).Trim()
$remoteList = git ls-tree --name-only -r "origin/$branch" 2>$null | Out-String
$basename = [System.IO.Path]::GetFileName($newPath)
$matches = ($remoteList -split "`n" | Where-Object { $_ -like "*$basename" })
if (-not $matches) {
    Write-Warning "Could not verify $newPath on origin/$branch after push (may be eventual consistency)."
} else {
    $remotePath = $matches[0].Trim()
    if (-not $remotePath.StartsWith("hive/in-review/")) {
        Write-Error "$basename is at '$remotePath' on origin, not hive/in-review/. The move did not stick."
        exit 1
    }
}

Write-Host "shipped: $HvId to in-review by $actor (branch $branch)"
