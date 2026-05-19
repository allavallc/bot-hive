# scripts/note.ps1 - Windows PowerShell version of the bot note helper.
# See scripts/note.sh for the canonical flow this mirrors.

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$Message
)

$ErrorActionPreference = "Stop"

try {
    $stateDir = (& node ./scripts/bot-session.mjs state-dir 2>$null | Select-Object -First 1)
    if ($LASTEXITCODE -eq 0 -and $stateDir) { Set-Location $stateDir.Trim() }
} catch { }


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

# Strip tabs/newlines so the TSV format isn't corrupted.
$cleanMsg = ($Message -replace '[\t\r\n]+', ' ').Trim()
if (-not $cleanMsg) {
    Write-Error "Message is empty after sanitization."
    exit 2
}
if ($cleanMsg.Length -gt 280) {
    Write-Error "Message exceeds 280 chars (got $($cleanMsg.Length))."
    exit 2
}

git pull --rebase origin main | Out-Null

$nowIso = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$noteDir = "hive/notes-to-humans"
if (-not (Test-Path $noteDir)) { New-Item -ItemType Directory -Path $noteDir | Out-Null }
$noteFile = Join-Path $noteDir "$actor.log"
"$nowIso`t$cleanMsg" | Add-Content -Path $noteFile

$branch = "note-$actor-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
git switch -c $branch
git add $noteFile
$snippet = if ($cleanMsg.Length -gt 60) { $cleanMsg.Substring(0, 60) } else { $cleanMsg }
git commit -m "note from ${actor}: $snippet"
git push -u origin $branch

gh pr create `
    --base main `
    --head $branch `
    --title "note from $actor" `
    --body $cleanMsg | Out-Null

$prNumber = & gh pr view --json number --jq '.number'
& gh pr merge $prNumber --auto --squash | Out-Null

Write-Host "note from ${actor}: $cleanMsg (PR #$prNumber)"
