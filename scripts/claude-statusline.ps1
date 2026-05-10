# scripts/claude-statusline.ps1 - Windows PowerShell version of the
# Claude Code statusLine printer. See scripts/claude-statusline.sh.

if (Test-Path ".bot-hive-identity") {
    $colony = $null
    $handle = $null
    Get-Content ".bot-hive-identity" | ForEach-Object {
        if ($_ -match '^colony=(.+)$') { $colony = $Matches[1].Trim() }
        if ($_ -match '^handle=(.+)$') { $handle = $Matches[1].Trim() }
    }
    if ($colony -and $handle) {
        Write-Output "$colony.$handle"
        exit 0
    }
}
Write-Output "orchestrator"
