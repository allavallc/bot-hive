# scripts/hive.ps1 -- bot-hive CLI helper.
#
# Usage:
#   .\scripts\hive.ps1 start [local]   Start this bot and print the assigned role handoff
#   .\scripts\hive.ps1 stop            Stop this bot: kill SSE listener, clean state, print all-clear
#
# To add more bots: open a new terminal and type "start the hive".
# The server assigns each bot's role automatically.

$ErrorActionPreference = "Stop"

function Show-Usage {
    Write-Output "Usage:"
    Write-Output "  .\scripts\hive.ps1 start [local]   Start this bot + print assigned role"
    Write-Output "  .\scripts\hive.ps1 stop            Stop this bot + clean local state"
    Write-Output ""
    Write-Output "To add more bots: open a new terminal and type 'start the hive'."
    Write-Output "The server assigns each bot's role automatically."
}

function Invoke-StartBot {
    param([bool]$LocalMode = $false)

    $startupId = "startup-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())-$PID"
    $pidAlive = $false
    if (Test-Path .bot-hive-stream.pid) {
        $pidText = (Get-Content .bot-hive-stream.pid -Raw -ErrorAction SilentlyContinue).Trim()
        if ($pidText) {
            try {
                Get-Process -Id ([int]$pidText) -ErrorAction Stop | Out-Null
                $pidAlive = $true
            } catch {
                $pidAlive = $false
            }
        }
        if (-not $pidAlive) {
            Remove-Item -LiteralPath .bot-hive-stream.pid -Force -ErrorAction SilentlyContinue
        }
    }

    $startedAt = (Get-Date).ToUniversalTime()
    if ($LocalMode) {
        Start-Process powershell -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-WindowStyle","Hidden","-Command","`$env:BOT_HIVE_API_URL='http://localhost:3000'; & './scripts/stream.ps1' -StartupId '$startupId'" -WindowStyle Hidden
    } else {
        Start-Process powershell -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-WindowStyle","Hidden","-File","./scripts/stream.ps1","-StartupId",$startupId -WindowStyle Hidden
    }

    $deadline = (Get-Date).AddSeconds(30)
    $handoffPath = ".bot-hive-startups\$startupId.json"
    $noticePath = $null
    $handoffJson = $null
    while ((Get-Date) -lt $deadline) {
        if (Test-Path $handoffPath) {
            $handoffJson = Get-Content $handoffPath -Raw | ConvertFrom-Json
            $noticePath = $handoffJson.noticePath
            break
        }
        Start-Sleep -Milliseconds 200
    }

    if (-not $noticePath -or -not (Test-Path $noticePath)) {
        Write-Output "STARTUP_ID=$startupId"
        Write-Output "ERROR=no startup handoff appeared within 30s"
        if (Test-Path .bot-hive.log) { Get-Content .bot-hive.log -Tail 80 }
        exit 2
    }

    $noticeRaw = Get-Content $noticePath -Raw
    $sessionRoot = (Get-Location).Path
    if ($handoffJson -and $handoffJson.stateDir) {
        $sessionRoot = $handoffJson.stateDir
    }

    Write-Output "STARTUP_ID=$startupId"
    Write-Output "HANDOFF_PATH=$handoffPath"
    Write-Output "NOTICE_PATH=$noticePath"
    Write-Output "SESSION_ROOT=$sessionRoot"
    Write-Output "---NOTICE---"
    Write-Output $noticeRaw
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

    foreach ($f in @('.bot-hive-role-notice','.bot-hive-role-bootannounced','.bot-hive-role-cache','.bot-hive-heartbeat.pid','.bot-hive-session-active')) {
        if (Test-Path $f) {
            Remove-Item $f -ErrorAction SilentlyContinue
            _hiveStopLog "deleted $f"
        }
    }

    _hiveStopLog "done; printing all-clear"
    Write-Output "Signed off. Safe to close this window."
}

$cmd = if ($args.Count -gt 0) { $args[0] } else { '' }
$mode = if ($args.Count -gt 1) { $args[1] } else { '' }

switch ($cmd) {
    'add' {
        Write-Output "Role assignment is now server-side. Open a new terminal and type 'start the hive' -- the server will assign the correct role."
        exit 1
    }
    'start'  { Invoke-StartBot -LocalMode ($mode -in @('local','-local','--local')) }
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
