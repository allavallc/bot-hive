# Stale-claim reclaim (HV-066) — PowerShell variant.
#
# Usage:
#   .\scripts\reclaim-stale-claims.ps1            # dry-run; lists stale claims
#   .\scripts\reclaim-stale-claims.ps1 -Reclaim   # opens an auto-merging PR

param(
    [switch]$Reclaim,
    [int]$ThresholdHours = 2
)

$repoRoot = git rev-parse --show-toplevel 2>$null
if (-not $repoRoot) {
    Write-Error "not in a git repository"
    exit 2
}
Set-Location $repoRoot

$inProgress = Join-Path "hive" "in-progress"
if (-not (Test-Path $inProgress)) {
    Write-Output "no hive/in-progress/ directory; nothing to scan"
    exit 0
}

$now = [DateTimeOffset]::UtcNow
$threshold = New-TimeSpan -Hours $ThresholdHours
$stale = @()

Get-ChildItem $inProgress -Filter '*.md' | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    if ($content -match '^# \[(HV-\d+)\]') { $ticketId = $Matches[1] } else { return }
    if ($content -match '(?m)^- \*\*Last touched\*\*:\s*(\S+)') { $ts = $Matches[1] } else { return }
    if ($content -match '(?m)^- \*\*Assigned to\*\*:\s*(.*)$') { $assigned = $Matches[1].Trim() } else { $assigned = 'unknown' }

    try {
        $lastTouched = [DateTimeOffset]::Parse($ts)
    } catch {
        return
    }
    $age = $now - $lastTouched
    if ($age -gt $threshold) {
        $stale += [PSCustomObject]@{
            File = $_.FullName
            Id = $ticketId
            LastTouched = $ts
            Assigned = $assigned
            AgeMinutes = [int]$age.TotalMinutes
        }
    }
}

if ($stale.Count -eq 0) {
    Write-Output "no stale claims found (threshold ${ThresholdHours}h)"
    exit 0
}

Write-Output "Stale claims found (threshold ${ThresholdHours}h):"
foreach ($s in $stale) {
    Write-Output "  STALE: $($s.Id) (last touched $($s.LastTouched), assigned $($s.Assigned), age $($s.AgeMinutes)m)"
}

if (-not $Reclaim) {
    Write-Output ""
    Write-Output "Re-run with -Reclaim to return them to backlog/"
    exit 1
}

$branch = "reclaim-stale-claims-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
git checkout -b $branch

foreach ($s in $stale) {
    $reclaimIso = [DateTimeOffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    $content = Get-Content $s.File -Raw
    $content = $content -replace '(?m)^- \*\*Status\*\*:.*$', '- **Status**: open'
    $content = $content -replace '(?m)^- \*\*Assigned to\*\*:.*$', '- **Assigned to**:'
    $content = $content -replace '(?m)^- \*\*Started\*\*:.*$', '- **Started**:'
    $reclaimLine = "- **Reclaim reason**: stale claim (last touched $($s.LastTouched); was assigned $($s.Assigned); reclaimed $reclaimIso)"
    $content = $content -replace '(?m)(^- \*\*Last touched\*\*:.*$)', "`$1`n$reclaimLine"
    Set-Content -Encoding UTF8 -NoNewline -Path $s.File -Value $content

    $basename = Split-Path -Leaf $s.File
    $newPath = Join-Path "hive" "backlog" $basename
    git mv $s.File $newPath
    if (-not (Test-Path "hive/events")) { New-Item -ItemType Directory -Path "hive/events" | Out-Null }
    "$reclaimIso $($s.Id) reclaimed-stale cron" | Add-Content "hive/events/cron.log"
}

git add -A
$summary = ($stale | ForEach-Object { "- $($_.Id) (last touched $($_.LastTouched), assigned $($_.Assigned), age $($_.AgeMinutes)m)" }) -join "`n"
git commit -m "hive: reclaim stale claims (HV-066 cron)" -m $summary
git push -u origin $branch

$prTitle = "hive: reclaim $($stale.Count) stale claim(s) — HV-066 cron"
$prBody = "## Summary`n`nReclaim cron found stale in-progress tickets and returned them to backlog/:`n`n$summary`n`nPer the 2h Last-touched rule (HIVE.md). See HV-066 for the convention."
gh pr create --title $prTitle --body $prBody
if ($LASTEXITCODE -eq 0) {
    gh pr merge --auto --squash --delete-branch
}
