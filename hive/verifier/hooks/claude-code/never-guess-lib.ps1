# never-guess-lib.ps1 — shared helpers for the never-guess hook family.
# Dot-source from each hook: . "$PSScriptRoot\never-guess-lib.ps1"

$Script:NeverGuessLogPath = Join-Path $env:USERPROFILE '.claude\hooks\never-guess-violations.log'
$Script:NeverGuessErrPath = Join-Path $env:USERPROFILE '.claude\hooks\never-guess-errors.log'

function Write-Violation {
    param([string]$Kind, [string]$Detail, [string]$AssistantMsgPreview)
    try {
        $line = "{0}`t{1}`t{2}`t{3}" -f (Get-Date -Format o), $Kind, $Detail, ($AssistantMsgPreview -replace "`t",' ' -replace "`r?`n",' \n ')
        [System.IO.File]::AppendAllText($Script:NeverGuessLogPath, $line + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
    } catch {
        try { [System.IO.File]::AppendAllText($Script:NeverGuessErrPath, "log-failed: $_`n", [System.Text.UTF8Encoding]::new($false)) } catch {}
    }
}

function Write-HookError {
    param([string]$Where, [string]$Message)
    try {
        $line = "{0}`t{1}`t{2}" -f (Get-Date -Format o), $Where, ($Message -replace "`r?`n",' \n ')
        [System.IO.File]::AppendAllText($Script:NeverGuessErrPath, $line + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
    } catch {}
}

function Read-HookPayload {
    try {
        $raw = [Console]::In.ReadToEnd()
        if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
        return $raw | ConvertFrom-Json
    } catch {
        Write-HookError "Read-HookPayload" $_.ToString()
        return $null
    }
}

function Get-RecentTranscriptEntries {
    param([string]$Path, [int]$TailLines = 200)
    if (-not (Test-Path -LiteralPath $Path)) { return @() }
    try {
        $lines = Get-Content -LiteralPath $Path -Tail $TailLines
    } catch {
        Write-HookError "Get-RecentTranscriptEntries" $_.ToString()
        return @()
    }
    $entries = @()
    foreach ($line in $lines) {
        try { $entries += ($line | ConvertFrom-Json) } catch { }
    }
    return $entries
}

function Get-LastAssistantText {
    param([object[]]$Entries)
    for ($i = $Entries.Count - 1; $i -ge 0; $i--) {
        $e = $Entries[$i]
        if ($e.type -ne 'assistant') { continue }
        $textBlocks = @()
        foreach ($block in $e.message.content) {
            if ($block.type -eq 'text') { $textBlocks += $block.text }
        }
        if ($textBlocks.Count -gt 0) { return ($textBlocks -join "`n") }
    }
    return $null
}

function Get-RecentToolUses {
    param([object[]]$Entries, [int]$Max = 30)
    $uses = @()
    $resultsById = @{}
    foreach ($e in $Entries) {
        if ($e.type -ne 'user') { continue }
        foreach ($block in $e.message.content) {
            if ($block.type -eq 'tool_result') {
                $resultsById[$block.tool_use_id] = $block.content
            }
        }
    }
    foreach ($e in $Entries) {
        if ($e.type -ne 'assistant') { continue }
        foreach ($block in $e.message.content) {
            if ($block.type -eq 'tool_use') {
                $uses += @{
                    name   = $block.name
                    input  = $block.input
                    output = $resultsById[$block.id]
                }
            }
        }
    }
    if ($uses.Count -gt $Max) { return $uses[-$Max..-1] }
    return $uses
}

function Strip-CodeAndThinking {
    param([string]$Text)
    if (-not $Text) { return '' }
    $t = [regex]::Replace($Text, '(?s)```.*?```', '')
    $t = [regex]::Replace($t, '(?s)<thinking>.*?</thinking>', '')
    return $t
}

# Cheap negative filter — if a message has zero of these AND no destructive keywords, skip deeper checks.
$Script:ClaimVerbPattern = '\b(is|was|are|were|has|have|already|never|superseded|merged|equivalent|identical|exists|missing|landed|shipped|fixed|done|broken|works|doesn''t|isn''t|aren''t|wasn''t|weren''t)\b'

# Risky claim patterns — strong signals of factual claims about repo/PR/file state.
$Script:RiskyClaimPatterns = @(
    '\bPR #\d+\s+(is|was|got|has been|is now)\s+(merged|closed|superseded|reverted|landed|open)\b',
    '\balready (merged|landed|shipped|done|fixed|accepted|in main|on main)\b',
    '\b(superseded|replaced|obsoleted)\s+by\b',
    '\b(identical|equivalent)\s+to\b',
    '\b(doesn''t|does not|isn''t|is not)\s+(exist|have|contain|reference)\b',
    '\bthere''?s no\s+\w+',
    '\bnever (existed|merged|landed|shipped)\b',
    '\bcurrently (merged|landed|on main|in main|in production)\b',
    '\bthe\s+\w+\s+(file|folder|directory|table|column|hook|skill|function|endpoint)\s+(is|does not|doesn''t)\b'
)

# Destructive operations — gating these is the highest-value catch.
$Script:DestructiveBashPattern = '(?i)\b(gh pr close|gh pr merge|gh issue close|git push.*(--force|-f\b)|git reset --hard|git branch -D|git clean -fd|rm -rf|Remove-Item.*-Recurse.*-Force|DROP TABLE|TRUNCATE|DROP DATABASE|DELETE FROM)\b'

function Test-Citation {
    param([string]$Text, [int]$MatchIndex, [int]$MatchLength, [int]$WindowChars = 350)
    $start = [Math]::Max(0, $MatchIndex - $WindowChars)
    $end   = [Math]::Min($Text.Length, $MatchIndex + $MatchLength + $WindowChars)
    $ctx   = $Text.Substring($start, $end - $start)
    return ($ctx -match '\(verified:|\bUnverified\s+(—|--|-)\s')
}

function Test-CitationBacked {
    param([string]$Text, [int]$MatchIndex, [int]$MatchLength, [object[]]$ToolUses, [int]$WindowChars = 350)
    $start = [Math]::Max(0, $MatchIndex - $WindowChars)
    $end   = [Math]::Min($Text.Length, $MatchIndex + $MatchLength + $WindowChars)
    $ctx   = $Text.Substring($start, $end - $start)
    $m = [regex]::Match($ctx, '\(verified:\s*([^)]+)\)')
    if (-not $m.Success) {
        return ($ctx -match '\bUnverified\s+(—|--|-)\s')
    }
    $claimedCmd = $m.Groups[1].Value.Trim().ToLower()
    foreach ($t in $ToolUses) {
        $cmdText = ''
        if ($t.name -eq 'Bash')    { $cmdText = "$($t.input.command)" }
        elseif ($t.name -eq 'Read') { $cmdText = "read $($t.input.file_path)" }
        elseif ($t.name -eq 'Grep') { $cmdText = "grep $($t.input.pattern) $($t.input.path)" }
        elseif ($t.name -eq 'Glob') { $cmdText = "glob $($t.input.pattern)" }
        else { $cmdText = "$($t.name) $($t.input | ConvertTo-Json -Compress)" }
        $cmdText = $cmdText.ToLower()
        if ($cmdText.Contains($claimedCmd) -or $claimedCmd.Contains($cmdText)) { return $true }
        $claimedTokens = $claimedCmd -split '\s+' | Where-Object { $_.Length -gt 2 }
        $cmdTokens     = $cmdText -split '\s+' | Where-Object { $_.Length -gt 2 }
        $overlap = ($claimedTokens | Where-Object { $cmdTokens -contains $_ }).Count
        if ($overlap -ge 2) { return $true }
    }
    return $false
}

function Get-AutoVerifyResult {
    param([string]$ClaimText)

    # PR state claims
    $m = [regex]::Match($ClaimText, '\bPR\s*#(\d+)\s+(is|was|got|has been|is now)\s+(merged|closed|open|superseded)', 'IgnoreCase')
    if ($m.Success) {
        $prNum = $m.Groups[1].Value
        $claimed = $m.Groups[3].Value.ToLower()
        try {
            $json = (gh pr view $prNum --json state,mergedAt 2>$null) | ConvertFrom-Json
            $actual = $json.state.ToLower()
            $verified = ($actual -eq $claimed)
            return @{ verified=$verified; truth="PR #$prNum state=$actual"; cmd="gh pr view $prNum --json state" }
        } catch { return $null }
    }

    # File existence claims
    $m = [regex]::Match($ClaimText, '\bfile\s+`?([^\s`]+)`?\s+(exists|doesn''t exist|does not exist|is missing|is gone)', 'IgnoreCase')
    if ($m.Success) {
        $path = $m.Groups[1].Value.Trim('"', "'")
        $claimedExists = ($m.Groups[2].Value.ToLower() -eq 'exists')
        $actualExists = Test-Path -LiteralPath $path
        return @{ verified=($claimedExists -eq $actualExists); truth="$path exists=$actualExists"; cmd="Test-Path $path" }
    }

    # Branch existence claims
    $m = [regex]::Match($ClaimText, '\bbranch\s+`?([^\s`]+)`?\s+(exists|doesn''t exist|does not exist|is gone)', 'IgnoreCase')
    if ($m.Success) {
        $branch = $m.Groups[1].Value.Trim('"', "'")
        $claimedExists = ($m.Groups[2].Value.ToLower() -eq 'exists')
        $actualExists = $false
        try { & git rev-parse --verify $branch 2>$null | Out-Null; $actualExists = $? } catch { $actualExists = $false }
        return @{ verified=($claimedExists -eq $actualExists); truth="branch $branch exists=$actualExists"; cmd="git rev-parse --verify $branch" }
    }

    return $null
}
