# Stale-PR watchdog — see AGENTS.md "Stale-PR watchdog" section.
#
# PowerShell version of update-stale-prs.sh. Lists every open non-draft PR;
# for any in BEHIND state, triggers `gh pr update-branch` so GitHub merges
# current main into the PR. DIRTY PRs are left alone (real conflicts).

$json = gh pr list --json number,mergeStateStatus,isDraft | ConvertFrom-Json

$stale = $json | Where-Object { -not $_.isDraft -and $_.mergeStateStatus -eq "BEHIND" }

if (-not $stale) {
    Write-Host "No BEHIND PRs."
    exit 0
}

foreach ($pr in $stale) {
    Write-Host "Updating PR #$($pr.number)..."
    gh pr update-branch $pr.number
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  (couldn't update PR #$($pr.number) — may have just become DIRTY)"
    }
}
