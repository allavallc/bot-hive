# scripts/hive.ps1 -- bot-hive CLI helper.
#
# Usage:
#   .\scripts\hive.ps1 start           Start this bot session (primary or secondary)
#   .\scripts\hive.ps1 stop            Stop this bot: kill SSE listener, clean state, print all-clear

$ErrorActionPreference = "Stop"

function Show-Usage {
    Write-Output "Usage:"
    Write-Output "  .\scripts\hive.ps1 start           Start this bot session"
    Write-Output "  .\scripts\hive.ps1 stop            Stop this bot + clean local state"
    Write-Output ""
    Write-Output "To add more bots: open a new terminal and type 'start the hive'."
    Write-Output "The server assigns each bot its handle and role automatically."
}

function Resolve-BotStateDir {
    try {
        $resolved = (& node ./scripts/bot-session.mjs state-dir 2>$null | Select-Object -First 1)
        if ($LASTEXITCODE -eq 0 -and $resolved) {
            return $resolved.Trim()
        }
    } catch { }
    return (Get-Location).Path
}

function Invoke-StartBot {
    & node ./scripts/hive-start.mjs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Invoke-StopBot {
    $stateDir = Resolve-BotStateDir
    $logPath = (Join-Path $stateDir '.bot-hive.log')
    function _hiveStopLog {
        param([string]$msg)
        try {
            $ts = (Get-Date).ToUniversalTime().ToString('o')
            [System.IO.File]::AppendAllText($logPath, "$ts [hive-stop] $msg" + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
        } catch { }
    }

    _hiveStopLog "invoked in $((Get-Location).Path); stateDir=$stateDir"

    $pidPath = Join-Path $stateDir '.bot-hive-stream.pid'
    if (Test-Path $pidPath) {
        $streamPid = (Get-Content $pidPath -ErrorAction SilentlyContinue | Select-Object -First 1)
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
        Remove-Item $pidPath -ErrorAction SilentlyContinue
        _hiveStopLog "deleted .bot-hive-stream.pid"
    } else {
        _hiveStopLog "no .bot-hive-stream.pid found"
    }

    foreach ($f in @('.bot-hive-role-notice','.bot-hive-role-bootannounced','.bot-hive-role-cache','.bot-hive-heartbeat.pid','.bot-hive-session-active')) {
        $full = Join-Path $stateDir $f
        if (Test-Path $full) {
            Remove-Item $full -ErrorAction SilentlyContinue
            _hiveStopLog "deleted $f"
        }
    }

    try { & node ./scripts/bot-session.mjs clear-current *> $null } catch { }
    _hiveStopLog "cleared current session registry entry"
    _hiveStopLog "done; printing all-clear"
    Write-Output "Signed off. Safe to close this window."
}

$cmd = if ($args.Count -gt 0) { $args[0] } else { '' }

switch ($cmd) {
    'add' {
        Write-Output "Role assignment is now server-side. Open a new terminal and type 'start the hive' -- the server will assign the correct role."
        exit 1
    }
    'start'  { Invoke-StartBot }
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
