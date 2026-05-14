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

    $logPath = (Join-Path (Get-Location).Path '.bot-hive.log')
    function _hiveAddLog {
        param([string]$msg)
        try {
            $ts = (Get-Date).ToUniversalTime().ToString('o')
            [System.IO.File]::AppendAllText($logPath, "$ts [hive-add] $msg" + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
        } catch { }
    }

    _hiveAddLog "invoked: intendedRole=$IntendedRole cwd=$((Get-Location).Path)"

    $activeCount = Get-ActiveBotCount
    _hiveAddLog "active bot count across worktrees: $activeCount"

    if ($activeCount -eq 0) {
        _hiveAddLog "refusing: no active bot in colony"
        Write-Output "Error: no active bot in this colony."
        Write-Output "Run 'start the hive' in a Claude session at the bot-hive root first to create the PM bot, then retry."
        exit 1
    }

    # Per hive/roles.md: -coder needs >=1 active bot; -tester needs >=2.
    if ($IntendedRole -eq 'tester' -and $activeCount -lt 2) {
        _hiveAddLog "refusing: tester needs >=2 active bots (have $activeCount)"
        Write-Output "Error: cannot spawn a tester with only $activeCount bot(s) active."
        Write-Output "Spawn a coder first: '.\scripts\hive.ps1 add coder'"
        Write-Output "(Per hive/roles.md the tester is seat 3 in the colony -- the PM and a coder must exist first.)"
        exit 1
    }

    $colony = $null
    try { $colony = (gh api user --jq .login 2>$null) } catch { }
    if (-not $colony) {
        _hiveAddLog "refusing: could not resolve colony via 'gh api user'"
        Write-Output "Error: could not determine colony from 'gh api user'. Make sure 'gh' is authenticated."
        exit 1
    }
    _hiveAddLog "resolved colony=$colony"

    $handlesFile = "hive/handles.txt"
    if (-not (Test-Path $handlesFile)) {
        _hiveAddLog "refusing: $handlesFile missing"
        Write-Output "Error: $handlesFile not found"
        exit 1
    }

    # Pick the first handle in hive/handles.txt that is free OR orphaned.
    # "Free"    = no events log AND no worktree directory.
    # "Orphaned" = worktree exists with .bot-hive-kickoff but no active stream pid —
    #              a prior spawn ran but the bot session never connected. Reuse it.
    $handle = $null
    $reuseWorktree = $false
    foreach ($line in Get-Content $handlesFile) {
        $trimmed = $line.Trim()
        if (-not $trimmed) { continue }
        if ($trimmed.StartsWith('#')) { continue }
        $eventsLog = "hive/events/$colony.$trimmed.log"
        if (Test-Path $eventsLog) {
            _hiveAddLog "skipping '$trimmed': events log exists at $eventsLog"
            continue
        }
        $worktreeDir = "worktrees/$trimmed"
        if (Test-Path $worktreeDir) {
            $kickoffFile = Join-Path $worktreeDir '.bot-hive-kickoff'
            $pidFile     = Join-Path $worktreeDir '.bot-hive-stream.pid'
            if (Test-Path $kickoffFile) {
                $alive = $false
                if (Test-Path $pidFile) {
                    $pidVal = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
                    if ($pidVal) {
                        try { Get-Process -Id $pidVal -ErrorAction Stop | Out-Null; $alive = $true } catch { }
                    }
                }
                if (-not $alive) {
                    _hiveAddLog "reusing orphaned worktree '$trimmed' at $worktreeDir (kickoff present, no active stream)"
                    $handle = $trimmed
                    $reuseWorktree = $true
                    break
                }
            }
            _hiveAddLog "skipping '$trimmed': active worktree exists at $worktreeDir"
            continue
        }
        $handle = $trimmed
        break
    }

    if (-not $handle) {
        _hiveAddLog "refusing: no free handles in pool"
        Write-Output "Error: no free handles in $handlesFile (every pool handle has an events log or an existing worktree)."
        exit 1
    }
    _hiveAddLog "picked handle='$handle'"

    $worktreePath = "worktrees/$handle"

    if (-not $reuseWorktree) {
        if (Test-Path $worktreePath) {
            _hiveAddLog "refusing: worktree at $worktreePath unexpectedly exists (race condition?)"
            Write-Output "Error: worktree at $worktreePath already exists."
            exit 1
        }

        # Create the worktree on its own branch off main.
        _hiveAddLog "git worktree add $worktreePath -b $handle-work main"
        git worktree add $worktreePath -b "$handle-work" main
        if ($LASTEXITCODE -ne 0) {
            _hiveAddLog "git worktree add failed (exit $LASTEXITCODE)"
            Write-Output "Error: git worktree add failed"
            exit 1
        }
        _hiveAddLog "worktree created"

        # Identity file -- write UTF-8 WITHOUT BOM (PowerShell 5.1's Set-Content -Encoding utf8 adds one; HV-136 lesson).
        $identityPath = Join-Path $worktreePath '.bot-hive-identity'
        $identityContent = "colony=$colony`nhandle=$handle`n"
        [System.IO.File]::WriteAllText($identityPath, $identityContent, [System.Text.UTF8Encoding]::new($false))
        _hiveAddLog "wrote $identityPath (colony=$colony handle=$handle, UTF-8 no BOM)"

        # One-shot kickoff marker -- empty file, bootstrap consumes it.
        $kickoffPath = Join-Path $worktreePath '.bot-hive-kickoff'
        [System.IO.File]::WriteAllText($kickoffPath, "", [System.Text.UTF8Encoding]::new($false))
        _hiveAddLog "wrote $kickoffPath (kickoff marker)"
    }

    _hiveAddLog "spawn complete: worktrees/$handle"

    Write-Output ""
    Write-Output "Spawned bot: worktrees/$handle"
    Write-Output "  colony=$colony, handle=$handle"
    Write-Output "  intended role: $IntendedRole (server confirms based on consolidation rules)"
    Write-Output ""
    Write-Output "Next: open a new terminal at the repo root and type:"
    Write-Output "  hive add $IntendedRole"
    Write-Output "That session will connect as '$handle' and receive its role from the server."
}

function Invoke-StopBot {
    # Mirrors hive/bot-shutdown.md so the operator can run it without an agent.
    # Logs every step to .bot-hive.log [hive-stop] so the operator can audit
    # what got killed/deleted and when.
    $logPath = (Join-Path (Get-Location).Path '.bot-hive.log')
    function _hiveStopLog {
        param([string]$msg)
        try {
            $ts = (Get-Date).ToUniversalTime().ToString('o')
            [System.IO.File]::AppendAllText($logPath, "$ts [hive-stop] $msg" + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
        } catch { }
    }

    _hiveStopLog "invoked in $((Get-Location).Path)"

    if (Test-Path .bot-hive-stream.pid) {
        $streamPid = (Get-Content .bot-hive-stream.pid -ErrorAction SilentlyContinue | Select-Object -First 1)
        if ($streamPid) {
            $alive = $false
            try { Get-Process -Id $streamPid -ErrorAction Stop | Out-Null; $alive = $true } catch { $alive = $false }
            _hiveStopLog "found .bot-hive-stream.pid -> PID $streamPid (alive=$alive)"
            if ($alive) {
                try {
                    Stop-Process -Id $streamPid -Force -ErrorAction Stop
                    _hiveStopLog "killed PID $streamPid"
                } catch {
                    _hiveStopLog "kill of PID $streamPid failed: $($_.Exception.Message)"
                }
            } else {
                _hiveStopLog "PID $streamPid not alive; nothing to kill"
            }
        } else {
            _hiveStopLog "found .bot-hive-stream.pid but it was empty"
        }
        Remove-Item .bot-hive-stream.pid -ErrorAction SilentlyContinue
        _hiveStopLog "deleted .bot-hive-stream.pid"
    } else {
        _hiveStopLog "no .bot-hive-stream.pid found"
    }

    foreach ($f in @('.bot-hive-role-notice','.bot-hive-role-bootannounced','.bot-hive-role-cache','.bot-hive-heartbeat.pid')) {
        if (Test-Path $f) {
            Remove-Item $f -ErrorAction SilentlyContinue
            _hiveStopLog "deleted $f"
        }
    }

    _hiveStopLog "done; printing all-clear"
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
