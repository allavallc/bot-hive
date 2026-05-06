# Hot-file conflict check (HV-063).
#
# Usage:
#   .\scripts\check-hot-files.ps1 AGENTS.md hive/HIVE.md
#
# Prints any open PRs that already touch one of the given files.
# Exits 0 if no conflicts found, 1 if at least one conflict found.

param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Files
)

if (-not $Files -or $Files.Count -eq 0) {
    Write-Error "usage: check-hot-files.ps1 <file>..."
    exit 2
}

try {
    $json = gh pr list --state open --json number,headRefName,files 2>$null
} catch {
    Write-Warning "gh pr list failed; skipping check"
    exit 0
}

if (-not $json) {
    exit 0
}

$prs = $json | ConvertFrom-Json
$conflicts = 0
foreach ($f in $Files) {
    foreach ($pr in $prs) {
        $touched = $pr.files | Where-Object { $_.path -eq $f }
        if ($touched) {
            Write-Output "$f -> PR #$($pr.number) ($($pr.headRefName))"
            $conflicts++
        }
    }
}

if ($conflicts -gt 0) { exit 1 } else { exit 0 }
