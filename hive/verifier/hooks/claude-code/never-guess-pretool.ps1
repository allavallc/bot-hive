# never-guess-pretool.ps1 -- block destructive bash unless verified-this-session.
. "$PSScriptRoot\never-guess-lib.ps1"

try {
    $payload = Read-HookPayload
    if (-not $payload) { exit 0 }

    if ($payload.tool_name -ne 'Bash') { exit 0 }
    $cmd = "$($payload.tool_input.command)"
    if ([string]::IsNullOrWhiteSpace($cmd)) { exit 0 }

    if ($cmd -notmatch $Script:DestructiveBashPattern) { exit 0 }

    $entries = Get-RecentTranscriptEntries -Path $payload.transcript_path -TailLines 200
    $toolUses = Get-RecentToolUses -Entries $entries -Max 20

    $target = $null
    if ($cmd -match 'gh pr (close|merge)\s+(\d+)')            { $target = "pr #$($Matches[2])" }
    elseif ($cmd -match 'git push.*--force.*?(\S+)$')         { $target = "branch $($Matches[1])" }
    elseif ($cmd -match 'git branch -D\s+(\S+)')              { $target = "branch $($Matches[1])" }
    elseif ($cmd -match 'rm -rf\s+(\S+)')                     { $target = $Matches[1] }
    elseif ($cmd -match 'Remove-Item.*-Path\s+([^\s,]+)')     { $target = $Matches[1] }
    elseif ($cmd -match 'DROP\s+TABLE\s+(\S+)')               { $target = "table $($Matches[1])" }

    $hasRecentTouch = $false
    foreach ($t in $toolUses) {
        $blob = ($t | ConvertTo-Json -Depth 6 -Compress).ToLower()
        if ($target -and $blob.Contains($target.ToLower())) { $hasRecentTouch = $true; break }
        if ($t.name -eq 'Bash' -and "$($t.input.command)" -match '(?i)(gh pr view|git log|git status|git show|ls |Test-Path|Get-ChildItem)') {
            $hasRecentTouch = $true
        }
    }

    if ($hasRecentTouch) { exit 0 }

    Write-Violation -Kind 'pretool-destructive-unverified' -Detail $cmd -AssistantMsgPreview ''
    $msg = "Destructive command blocked: '$cmd'. No verification tool call for the target ($target) found in the recent transcript. Run a read/view command first (gh pr view, git log, ls, Test-Path, Read) to confirm the actual state, then retry."
    @{ hookSpecificOutput = @{ hookEventName='PreToolUse'; permissionDecision='deny'; permissionDecisionReason=$msg } } | ConvertTo-Json -Depth 5 -Compress | Write-Output
    exit 0
} catch {
    Write-HookError 'never-guess-pretool' $_.ToString()
    exit 0
}
