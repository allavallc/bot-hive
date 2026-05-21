param(
    [string]$StartupId = ""
)

$ErrorActionPreference = "Stop"

if (-not $StartupId) {
    throw "hive-start-windows.ps1 requires -StartupId"
}

$cwdPath = (Get-Location).Path
$logPath = Join-Path $cwdPath ".bot-hive.log"
$launchDir = Join-Path $cwdPath ".bot-hive-launches"
$handoffDir = Join-Path $cwdPath ".bot-hive-startups"
$launchPath = Join-Path $launchDir "$StartupId.json"
$handoffPath = Join-Path $handoffDir "$StartupId.json"
$stdoutPath = Join-Path $launchDir "$StartupId.stdout.log"
$stderrPath = Join-Path $launchDir "$StartupId.stderr.log"

function Write-LauncherLog {
    param([string]$Message)
    try {
        $ts = (Get-Date).ToUniversalTime().ToString('o')
        [System.IO.File]::AppendAllText(
            $logPath,
            "$ts [hive-start-win] $Message" + [Environment]::NewLine,
            [System.Text.UTF8Encoding]::new($false)
        )
    } catch { }
}

function Read-OptionalText {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return "" }
    try {
        return ((Get-Content $Path -Raw -ErrorAction Stop).Trim())
    } catch {
        return ""
    }
}

function Read-StartupResult {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    try {
        $result = Get-Content $Path -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
        if (-not $result.state) {
            $result | Add-Member -NotePropertyName state -NotePropertyValue 'live'
        }
        return $result
    } catch {
        return $null
    }
}

function Wait-ForStartupResult {
    param(
        [string]$Path,
        [int]$TimeoutMs,
        [System.Diagnostics.Process]$Process
    )

    $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
    while ((Get-Date) -lt $deadline) {
        $result = Read-StartupResult -Path $Path
        if ($result) {
            if ($result.state -eq 'live') {
                return $result
            }
            if ($result.state -eq 'failed') {
                $stderrText = Read-OptionalText -Path $stderrPath
                $stdoutText = Read-OptionalText -Path $stdoutPath
                $parts = @("startup failed (reason=$($result.reason))")
                if ($stderrText) { $parts += "stderr:`n$stderrText" }
                if ($stdoutText) { $parts += "stdout:`n$stdoutText" }
                throw ($parts -join "`n")
            }
        }

        try { $Process.Refresh() } catch { }
        if ($Process.HasExited) {
            $stderrText = Read-OptionalText -Path $stderrPath
            $stdoutText = Read-OptionalText -Path $stdoutPath
            $parts = @("stream.ps1 exited before startup reached live (exit code=$($Process.ExitCode))")
            if ($result -and $result.state -eq 'failed' -and $result.reason) {
                $parts += "reason=$($result.reason)"
            }
            if ($stderrText) { $parts += "stderr:`n$stderrText" }
            if ($stdoutText) { $parts += "stdout:`n$stdoutText" }
            throw ($parts -join "`n")
        }

        Start-Sleep -Milliseconds 200
    }

    throw "Timed out waiting for startup result at $Path to reach live"
}

New-Item -ItemType Directory -Force -Path $launchDir | Out-Null
New-Item -ItemType Directory -Force -Path $handoffDir | Out-Null
foreach ($path in @($launchPath, $handoffPath, $stdoutPath, $stderrPath)) {
    if (Test-Path $path) {
        Remove-Item $path -Force -ErrorAction SilentlyContinue
    }
}

$streamScriptPath = Join-Path $cwdPath "scripts/stream.ps1"
$argumentList = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $streamScriptPath,
    '-StartupId', $StartupId
)

Write-LauncherLog "launching stream.ps1 startupId=$StartupId"
$process = Start-Process -FilePath 'powershell' -ArgumentList $argumentList -WorkingDirectory $cwdPath -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
Write-LauncherLog "spawned stream pid=$($process.Id) startupId=$StartupId"

$result = Wait-ForStartupResult -Path $handoffPath -TimeoutMs 30000 -Process $process
Write-LauncherLog "observed startup result state=$($result.state) $handoffPath"

$lines = @(
    "stream_pid=$($process.Id)",
    "launch_path=$launchPath",
    "handoff_path=$handoffPath",
    "state_dir=$($result.stateDir)",
    "notice_path=$($result.noticePath)"
)
Write-Output ($lines -join "`n")
