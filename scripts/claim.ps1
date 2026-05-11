# scripts/claim.ps1 - Windows PowerShell version of the bot claim helper.
# See scripts/claim.sh for the canonical flow this mirrors.

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$HvId,
    [Parameter(Position=1)]
    [string]$Suffix = "claim"
)

$ErrorActionPreference = "Stop"

# Resolve bot identity (ADR-003). Prefer .bot-hive-identity in the
# worktree; fall back to env var for backward compatibility.
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
    Write-Error "Bot identity not found. The Add-a-Bot spawn flow writes .bot-hive-identity; alternatively, set BOT_HIVE_HANDLE."
    exit 2
}
# Colony defaults to handle for legacy single-colony state.
if (-not $colony) { $colony = $handle }
$actor = "$colony.$handle"

if ($HvId -notmatch '^HV-\d+$') {
    Write-Error "Ticket id must look like HV-<number>; got '$HvId'"
    exit 2
}

# Fresh state.
git pull --rebase origin main | Out-Null

$ticketFile = Get-ChildItem -Path "hive/backlog" -Filter "$HvId-*.md" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $ticketFile) {
    Write-Error "$HvId not found in hive/backlog/. May already be claimed, done, or routed to not-doing/."
    exit 1
}

# Owner check (ADR-003): FS Owner field holds a colony name. Refuse if
# the FS is owned by a different colony than ours.
$ticketContent = Get-Content -Raw $ticketFile.FullName
if ($ticketContent -match "(?m)^- \*\*Feature set\*\*:[ \t]*(\S+)") {
    $ticketFs = $Matches[1].Trim()
    if ($ticketFs -and (Test-Path "hive/feature-sets/$ticketFs.md")) {
        $fsContent = Get-Content -Raw "hive/feature-sets/$ticketFs.md"
        if ($fsContent -match "(?m)^\*\*Owner\*\*:[ \t]*(\S+)") {
            $fsOwner = $Matches[1].Trim()
            if ($fsOwner -and $fsOwner -ne $colony) {
                Write-Error "${ticketFs} is owned by colony ${fsOwner}; your colony (${colony}) cannot claim ${HvId}."
                exit 1
            }
        }
    }
}

# Use --jq '.[0].number' (no inner quotes) so PowerShell doesn't strip quoting on the way to gh.exe.
$existingPrNum = & gh pr list --state open --search "$HvId in:title" --json number --jq '.[0].number' 2>$null
if ($existingPrNum) {
    Write-Warning "Open PR #${existingPrNum} already references ${HvId}; skipping claim."
    exit 1
}

$nowIso = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$today = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
$branch = "hv-$($HvId.Substring(3))-$Suffix"
$ticketName = $ticketFile.Name
$newPath = "hive/in-progress/$ticketName"

git switch -c $branch
# Ensure parent dir exists; first claim on a fresh repo won't have hive/in-progress/ yet.
if (-not (Test-Path "hive/in-progress")) { New-Item -ItemType Directory -Path "hive/in-progress" | Out-Null }
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
# ADR-003: Assigned-to uses qualified <colony>.<handle> form.
$content = Patch-Field $content "Assigned to" $actor
$content = Patch-Field $content "Started" $today
$content = Patch-Field $content "Last touched" $nowIso
[System.IO.File]::WriteAllText((Resolve-Path $newPath), $content, [System.Text.UTF8Encoding]::new($false))

# ADR-003: events log keyed by colony.handle to avoid cross-colony collisions.
if (-not (Test-Path "hive/events")) { New-Item -ItemType Directory -Path "hive/events" | Out-Null }
"$nowIso $HvId claim $actor" | Add-Content -Path "hive/events/$actor.log"

git add hive/
git commit -m "${HvId}: claim - $actor"
git push -u origin $branch

gh pr create `
    --base main `
    --head $branch `
    --title "${HvId}: claim - $actor" `
    --body "Claim signal - moves $HvId from backlog/ to in-progress/. Subsequent commits on this branch carry the work."

$prNumber = & gh pr view --json number --jq '.number'
& gh pr merge $prNumber --auto --squash | Out-Null

Write-Host "claimed: $HvId by $actor on branch $branch (PR #$prNumber)"
