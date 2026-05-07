# scripts/claim.ps1 — Windows PowerShell version of the bot claim helper.
# See scripts/claim.sh for the canonical flow this mirrors.

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$HvId,
    [Parameter(Position=1)]
    [string]$Suffix = "claim"
)

$ErrorActionPreference = "Stop"

if (-not $env:BOT_HIVE_HANDLE) {
    Write-Error "BOT_HIVE_HANDLE not set. Pick a handle from hive/handles.txt and set it before claiming."
    exit 2
}

if ($HvId -notmatch '^HV-\d+$') {
    Write-Error "Ticket id must look like HV-<number>; got '$HvId'"
    exit 2
}

$handle = $env:BOT_HIVE_HANDLE

# Fresh state.
git pull --rebase origin main | Out-Null

$ticketFile = Get-ChildItem -Path "hive/backlog" -Filter "$HvId-*.md" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $ticketFile) {
    Write-Error "$HvId not found in hive/backlog/. May already be claimed, done, or routed to not-doing/."
    exit 1
}

$existingPr = & gh pr list --state open --search "$HvId in:title" --json number,title,headRefName --jq '.[] | "\(.number)|\(.headRefName)|\(.title)"' | Select-Object -First 1
if ($existingPr) {
    Write-Warning "Open PR already references ${HvId}: $existingPr"
    exit 1
}

$nowIso = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$today = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
$branch = "hv-$($HvId.Substring(3))-$Suffix"
$ticketName = $ticketFile.Name
$newPath = "hive/in-progress/$ticketName"

git switch -c $branch
git mv $ticketFile.FullName $newPath

# Patch frontmatter fields. Mirrors the python helper in claim.sh.
$content = Get-Content -Raw -Encoding UTF8 -Path $newPath
function Patch-Field {
    param([string]$text, [string]$key, [string]$value)
    $pattern = "(?m)^- \*\*$([regex]::Escape($key))\*\*:.*$"
    if ($text -match $pattern) {
        return [regex]::Replace($text, $pattern, "- **$key**: $value", 1)
    }
    return $text
}
$content = Patch-Field $content "Status" "in-progress"
$content = Patch-Field $content "Assigned to" $handle
$content = Patch-Field $content "Started" $today
$content = Patch-Field $content "Last touched" $nowIso
[System.IO.File]::WriteAllText((Resolve-Path $newPath), $content, [System.Text.UTF8Encoding]::new($false))

if (-not (Test-Path "hive/events")) { New-Item -ItemType Directory -Path "hive/events" | Out-Null }
"$nowIso $HvId claim $handle" | Add-Content -Path "hive/events/$handle.log"

git add hive/
git commit -m "${HvId}: claim — $handle"
git push -u origin $branch

gh pr create `
    --base main `
    --head $branch `
    --title "${HvId}: claim — $handle" `
    --body "Claim signal — moves $HvId from backlog/ to in-progress/. Subsequent commits on this branch carry the work."

$prNumber = & gh pr view --json number --jq '.number'
& gh pr merge $prNumber --auto --squash | Out-Null

Write-Host "claimed: $HvId by $handle on branch $branch (PR #$prNumber)"
