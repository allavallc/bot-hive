# never-guess-stop.ps1 -- block end-of-turn if assistant made unverified factual claims.
. "$PSScriptRoot\never-guess-lib.ps1"

try {
    $payload = Read-HookPayload
    if (-not $payload) { exit 0 }
    if ($payload.stop_hook_active) { exit 0 }  # loop guard

    $entries = Get-RecentTranscriptEntries -Path $payload.transcript_path -TailLines 300
    if ($entries.Count -eq 0) { exit 0 }

    $msg = Get-LastAssistantText -Entries $entries
    if (-not $msg) { exit 0 }
    $clean = Strip-CodeAndThinking -Text $msg

    # Cheap negative filter: skip everything if no claim verbs and no destructive keywords.
    $hasVerbs       = ($clean -match $Script:ClaimVerbPattern)
    $hasDestructive = ($clean -match $Script:DestructiveBashPattern)
    if (-not $hasVerbs -and -not $hasDestructive) { exit 0 }

    $toolUses = Get-RecentToolUses -Entries $entries -Max 50
    $violations = @()
    $autoVerifyNotes = @()

    foreach ($pattern in $Script:RiskyClaimPatterns) {
        foreach ($m in [regex]::Matches($clean, $pattern, 'IgnoreCase')) {
            $auto = Get-AutoVerifyResult -ClaimText $m.Value
            if ($auto) {
                if (-not $auto.verified) {
                    $autoVerifyNotes += "Auto-verify says claim '$($m.Value)' is WRONG -- actual: $($auto.truth) (ran: $($auto.cmd))"
                } else {
                    $autoVerifyNotes += "Auto-verify confirmed: $($auto.truth)"
                }
                continue
            }
            $hasTag = Test-Citation -Text $clean -MatchIndex $m.Index -MatchLength $m.Length
            if (-not $hasTag) {
                $violations += @{ kind='no-tag'; claim=$m.Value }
                continue
            }
            $backed = Test-CitationBacked -Text $clean -MatchIndex $m.Index -MatchLength $m.Length -ToolUses $toolUses
            if (-not $backed) {
                $violations += @{ kind='unbacked-tag'; claim=$m.Value }
            }
        }
    }

    # Cap on "Unverified --" abuse
    $unverifiedCount = ([regex]::Matches($clean, '\bUnverified\s+(--|--|-)\s')).Count
    if ($unverifiedCount -gt 3) {
        $violations += @{ kind='unverified-overuse'; claim="Used 'Unverified --' $unverifiedCount times in one message" }
    }

    if ($violations.Count -eq 0 -and $autoVerifyNotes.Count -eq 0) { exit 0 }

    $preview = if ($msg.Length -gt 200) { $msg.Substring(0, 200) + '...' } else { $msg }

    if ($violations.Count -gt 0) {
        foreach ($v in $violations) { Write-Violation -Kind $v.kind -Detail $v.claim -AssistantMsgPreview $preview }
        $claimList = ($violations | Select-Object -First 5 | ForEach-Object { "- [$($_.kind)] $($_.claim)" }) -join "`n"
        $reason = @"
The never-guess hook caught unverified claims in your message:

$claimList

For each: either (a) run a tool call to verify and add (verified: <command>) right after the claim -- the tag must reference a command you actually ran this session; or (b) relabel as "Unverified --" if you genuinely cannot check (max 3 per message, not allowed for destructive recommendations).

Then resend.
"@
        if ($autoVerifyNotes.Count -gt 0) {
            $reason += "`n`nAuto-verify results to factor in:`n" + ($autoVerifyNotes -join "`n")
        }
        @{ decision='block'; reason=$reason } | ConvertTo-Json -Compress | Write-Output
        exit 0
    }

    # No violations but auto-verify ran -- block only if it found something WRONG
    if ($autoVerifyNotes.Count -gt 0) {
        $wrongs = $autoVerifyNotes | Where-Object { $_ -match 'WRONG' }
        if ($wrongs.Count -gt 0) {
            $reason = "[never-guess auto-verify ran]`n" + ($autoVerifyNotes -join "`n") + "`n`nCorrect the WRONG claims above and resend."
            @{ decision='block'; reason=$reason } | ConvertTo-Json -Compress | Write-Output
        }
    }
    exit 0
} catch {
    Write-HookError 'never-guess-stop' $_.ToString()
    exit 0
}
