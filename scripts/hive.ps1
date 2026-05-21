# scripts/hive.ps1 -- bot-hive CLI helper.
#
# Usage:
#   .\scripts\hive.ps1 start           Start this bot session (primary or secondary)
#   .\scripts\hive.ps1 add             Human-facing alias for start
#   .\scripts\hive.ps1 stop            Stop this bot: kill SSE listener, clean state, print all-clear
#   .\scripts\hive.ps1 shutdown        Human-facing alias for stop

$ErrorActionPreference = "Stop"

function Show-Usage {
    Write-Output "Usage:"
    Write-Output "  .\scripts\hive.ps1 start           Start this bot session"
    Write-Output "  .\scripts\hive.ps1 add             Alias: add a bot via the canonical startup path"
    Write-Output "  .\scripts\hive.ps1 stop            Stop this bot + clean local state"
    Write-Output "  .\scripts\hive.ps1 shutdown        Alias: sign off this bot via the canonical shutdown path"
    Write-Output ""
    Write-Output "Human-facing bot commands: 'hive add a bot' to start, 'hive shutdown' to sign off."
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
    $recordEnv = (& node ./scripts/bot-session.mjs current-record-env 2>$null)
    $recordStreamPid = $null
    if ($LASTEXITCODE -eq 0 -and $recordEnv) {
        foreach ($line in @($recordEnv)) {
            if ($line -match '^state_dir=(.+)$' -and $Matches[1]) { $stateDir = $Matches[1] }
            if ($line -match '^stream_pid=(.+)$' -and $Matches[1]) { $recordStreamPid = $Matches[1] }
        }
    }

    $logPath = (Join-Path $stateDir '.bot-hive.log')
    function _hiveStopLog {
        param([string]$msg)
        try {
            $ts = (Get-Date).ToUniversalTime().ToString('o')
            [System.IO.File]::AppendAllText($logPath, "$ts [hive-stop] $msg" + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
        } catch { }
    }

    _hiveStopLog "invoked in $((Get-Location).Path); stateDir=$stateDir"

    $activePath = Join-Path $stateDir '.bot-hive-session-active'
    if (Test-Path $activePath) {
        Remove-Item $activePath -ErrorAction SilentlyContinue
        _hiveStopLog 'deleted .bot-hive-session-active to request stream self-exit'
    } else {
        _hiveStopLog 'no .bot-hive-session-active found'
    }

    $pidPath = Join-Path $stateDir '.bot-hive-stream.pid'
    $pidFileStreamPid = $null
    if (Test-Path $pidPath) {
        $pidFileStreamPid = (Get-Content $pidPath -ErrorAction SilentlyContinue | Select-Object -First 1)
        _hiveStopLog "found .bot-hive-stream.pid -> PID $(if ($pidFileStreamPid) { $pidFileStreamPid } else { '<empty>' })"
    } else {
        _hiveStopLog 'no .bot-hive-stream.pid found'
    }

    foreach ($streamPid in @($recordStreamPid, $pidFileStreamPid) | Where-Object { $_ } | Select-Object -Unique) {
        $alive = $false
        try { Get-Process -Id $streamPid -ErrorAction Stop | Out-Null; $alive = $true } catch { $alive = $false }
        if ($alive) {
            try {
                Stop-Process -Id $streamPid -Force -ErrorAction Stop
                _hiveStopLog "sent TERM to PID $streamPid"
            } catch {
                _hiveStopLog "TERM to PID $streamPid failed: $($_.Exception.Message)"
            }
        } else {
            _hiveStopLog "PID $streamPid not killable from this runtime; relying on session-active self-exit"
        }
    }

    if (Test-Path $pidPath) {
        $waited = 0
        while ((Test-Path $pidPath) -and $waited -lt 20) {
            Start-Sleep -Seconds 1
            $waited += 1
        }
        if (Test-Path $pidPath) {
            _hiveStopLog "stream pid file still present after ${waited}s; deleting stale marker locally"
            Remove-Item $pidPath -ErrorAction SilentlyContinue
        } else {
            _hiveStopLog "stream pid file cleared after ${waited}s"
        }
    }

    foreach ($f in @('.bot-hive-role-notice','.bot-hive-role-bootannounced','.bot-hive-role-cache','.bot-hive-heartbeat.pid')) {
        $full = Join-Path $stateDir $f
        if (Test-Path $full) {
            Remove-Item $full -ErrorAction SilentlyContinue
            _hiveStopLog "deleted $f"
        }
    }

    try { & node ./scripts/bot-session.mjs clear-current *> $null } catch { }
    _hiveStopLog 'cleared current session registry entry'
    _hiveStopLog 'done; printing all-clear'
    Write-Output 'Signed off. Safe to close this window.'
}

$cmd = if ($args.Count -gt 0) { $args[0] } else { '' }

switch ($cmd) {
    'add'       { Invoke-StartBot }
    'add-a-bot' { Invoke-StartBot }
    'start'  { Invoke-StartBot }
    'shutdown' { Invoke-StopBot }
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
