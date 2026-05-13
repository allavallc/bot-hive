# scripts/hive.ps1 -- bot-hive CLI for spawning and stopping bots.
#
# Usage:
#   .\scripts\hive.ps1 add coder       Spawn a new bot intended as a coder
#   .\scripts\hive.ps1 add tester      Spawn a new bot intended as a tester
#   .\scripts\hive.ps1 stop            Stop this bot: kill SSE listener, clean state, print all-clear
#
# 'add' requires at least one active bot in the colony already (the PM).
# Run "start the hive" in a Claude session at the bot-hive root first to
# create the PM bot.
#
# Also see AGENTS.md "Spawn / shutdown chat phrases" -- 'hive add coder',
# 'hive add tester', and the sign-off phrases trigger an agent to invoke
# this script on the operator's behalf.

$ErrorActionPreference = "Stop"

function Show-Usage {
    Write-Output "Usage:"
    Write-Output "  .\scripts\hive.ps1 add coder       Spawn a coder bot"
    Write-Output "  .\scripts\hive.ps1 add tester      Spawn a tester bot"
    Write-Output "  .\scripts\hive.ps1 stop            Stop this bot + clean local state"
}

function Get-ActiveBotCount {
    $count = 0
    $worktreesOutput = git worktree list --porcelain
    $worktreePaths = @()
    foreach ($line in $worktreesOutput) {
        if ($line -like 'worktree *') {
            $worktreePaths += ($line -replace '^worktree ', '')
        }
    }
    foreach ($wt in $worktreePaths) {
        $pidFile = Join-Path $wt '.bot-hive-stream.pid'
        if (Test-Path $pidFile) {
            $pidValue = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
            if ($pidValue) {
                try {
                    Get-Process -Id $pidValue -ErrorAction Stop | Out-Null
                    $count++
                } catch { }
            }
        }
    }
    return $count
}

function Invoke-SpawnBot {
    param([string]$IntendedRole)

    $activeCount = Get-ActiveBotCount

    if ($activeCount -eq 0) {
        Write-Output "Error: no active bot in this colony."
        Write-Output "Run 'start the hive' in a Claude session at the bot-hive root first to create the PM bot, then retry."
        exit 1
    }

    # Per hive/roles.md: -coder needs >=1 active bot; -tester needs >=2.
    if ($IntendedRole -eq 'tester' -and $activeCount -lt 2) {
        Write-Output "Error: cannot spawn a tester with only $activeCount bot(s) active."
        Write-Output "Spawn a coder first: '.\scripts\hive.ps1 add coder'"
        Write-Output "(Per hive/roles.md the tester is seat 3 in the colony -- the PM and a coder must exist first.)"
        exit 1
    }

    $colony = $null
    try { $colony = (gh api user --jq .login 2>$null) } catch { }
    if (-not $colony) {
        Write-Output "Error: could not determine colony from 'gh api user'. Make sure 'gh' is authenticated."
        exit 1
    }

    $handlesFile = "hive/handles.txt"
    if (-not (Test-Path $handlesFile)) {
        Write-Output "Error: $handlesFile not found"
        exit 1
    }

    $handle = $null
    foreach ($line in Get-Content $handlesFile) {
        $trimmed = $line.Trim()
        if (-not $trimmed) { continue }
        if ($trimmed.StartsWith('#')) { continue }
        $eventsLog = "hive/events/$colony.$trimmed.log"
        if (-not (Test-Path $eventsLog)) {
            $handle = $trimmed
            break
        }
    }

    if (-not $handle) {
        Write-Output "Error: no free handles in $handlesFile (every pool handle has an events log)."
        exit 1
    }

    $worktreePath = "worktrees/$handle"
    if (Test-Path $worktreePath) {
        Write-Output "Error: worktree at $worktreePath already exists."
        exit 1
    }

    # Create the worktree on its own branch off main.
    git worktree add $worktreePath -b "$handle-work" main

    # Identity file -- write UTF-8 WITHOUT BOM (PowerShell 5.1's Set-Content -Encoding utf8 adds one; HV-136 lesson).
    $identityPath = Join-Path $worktreePath '.bot-hive-identity'
    $identityContent = "colony=$colony`nhandle=$handle`n"
    [System.IO.File]::WriteAllText($identityPath, $identityContent, [System.Text.UTF8Encoding]::new($false))

    # One-shot kickoff marker -- empty file, bootstrap consumes it.
    $kickoffPath = Join-Path $worktreePath '.bot-hive-kickoff'
    [System.IO.File]::WriteAllText($kickoffPath, "", [System.Text.UTF8Encoding]::new($false))

    Write-Output ""
    Write-Output "Spawned bot: worktrees/$handle"
    Write-Output "  colony=$colony, handle=$handle"
    Write-Output "  intended role: $IntendedRole (server confirms based on consolidation rules)"
    Write-Output ""
    Write-Output "Next: open a new terminal, cd $worktreePath, then start your agent (claude / codex / etc.)."
    Write-Output "The kickoff marker triggers bootstrap automatically."
}

function Invoke-StopBot {
    # Mirrors hive/bot-shutdown.md so the operator can run it without an agent.
    if (Test-Path .bot-hive-stream.pid) {
        $streamPid = (Get-Content .bot-hive-stream.pid -ErrorAction SilentlyContinue | Select-Object -First 1)
        if ($streamPid) {
            try { Stop-Process -Id $streamPid -Force -ErrorAction SilentlyContinue } catch { }
        }
        Remove-Item .bot-hive-stream.pid -ErrorAction SilentlyContinue
    }
    Remove-Item .bot-hive-role-notice,.bot-hive-role-bootannounced,.bot-hive-role-cache,.bot-hive-heartbeat.pid -ErrorAction SilentlyContinue
    Write-Output "Signed off. Safe to close this window."
}

$cmd = if ($args.Count -gt 0) { $args[0] } else { '' }
$role = if ($args.Count -gt 1) { $args[1] } else { '' }

switch ($cmd) {
    'add' {
        switch ($role) {
            'coder'  { Invoke-SpawnBot -IntendedRole 'coder' }
            'tester' { Invoke-SpawnBot -IntendedRole 'tester' }
            default {
                Write-Output "Error: 'add' requires 'coder' or 'tester'"
                Show-Usage
                exit 1
            }
        }
    }
    'stop'   { Invoke-StopBot }
    ''       { Show-Usage }
    'help'   { Show-Usage }
    '-h'     { Show-Usage }
    '--help' { Show-Usage }
    default {
        Write-Output "Error: unknown command '$cmd'"
        Show-Usage
        exit 1
    }
}
