# scripts/note.ps1 — Windows PowerShell version of the bot note helper.
# See scripts/note.sh for the canonical flow this mirrors.

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$Message
)

$ErrorActionPreference = "Stop"

if (-not $env:BOT_HIVE_HANDLE) {
    Write-Error "BOT_HIVE_HANDLE not set."
    exit 2
}

$handle = $env:BOT_HIVE_HANDLE

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
$noteFile = Join-Path $noteDir "$handle.log"
"$nowIso`t$cleanMsg" | Add-Content -Path $noteFile

$branch = "note-$handle-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
git switch -c $branch
git add $noteFile
$snippet = if ($cleanMsg.Length -gt 60) { $cleanMsg.Substring(0, 60) } else { $cleanMsg }
git commit -m "note from ${handle}: $snippet"
git push -u origin $branch

gh pr create `
    --base main `
    --head $branch `
    --title "note from $handle" `
    --body $cleanMsg | Out-Null

$prNumber = & gh pr view --json number --jq '.number'
& gh pr merge $prNumber --auto --squash | Out-Null

Write-Host "note from ${handle}: $cleanMsg (PR #$prNumber)"
