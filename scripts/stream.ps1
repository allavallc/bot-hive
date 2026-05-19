# scripts/stream.ps1 -- FS-030 bot SSE listener.
#
# Connects to /api/bots/stream with colony only. The server assigns a
# handle and returns it in the first your-role event. This script writes
# .bot-hive-identity (colony + handle) and .bot-hive-role-notice after
# receiving the assignment.
#
# Multi-bot isolation: if another bot's .bot-hive-stream.pid is already
# alive at cwd, this script creates worktrees/<handle>/ and writes all
# state files there. It also writes .bot-hive-role-ptr at cwd pointing
# to the worktree so the startup procedure knows where to look.
#
# Single role: hold the SSE connection. When this process dies the TCP
# socket closes and the server reaps the seat (15s grace).
#
# Diagnostic log: .bot-hive.log in cwd.

$ErrorActionPreference = "Stop"

$Script:ownerFile = Join-Path (Get-Location).Path ".bot-hive-session-owner"
$Script:logPath = (Join-Path (Get-Location).Path ".bot-hive.log")

function Write-StreamLog {
    param([string]$Message)
    try {
        $ts = (Get-Date).ToUniversalTime().ToString('o')
        [System.IO.File]::AppendAllText(
            $Script:logPath,
            "$ts [stream] $Message" + [Environment]::NewLine,
            [System.Text.UTF8Encoding]::new($false)
        )
    } catch { }
}

function Get-ClientSessionId {
    $currentPid = $PID
    for ($i = 0; $i -lt 12 -and $currentPid; $i++) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $currentPid" -ErrorAction SilentlyContinue
        if (-not $proc) { break }
        $name = [System.IO.Path]::GetFileNameWithoutExtension($proc.Name).ToLowerInvariant()
        $commandLine = if ($null -ne $proc.CommandLine) { [string]$proc.CommandLine } else { "" }
        $cmd = $commandLine.ToLowerInvariant()
        if ($name -match 'claude|codex|cursor|windows terminal|wezterm|ghostty|conhost|wt') {
            return "winproc:$($proc.ProcessId):${name}:$((Get-Location).Path)"
        }
        $currentPid = $proc.ParentProcessId
    }
    $selfProc = Get-CimInstance Win32_Process -Filter "ProcessId = $PID" -ErrorAction SilentlyContinue
    $parentPid = if ($selfProc) { $selfProc.ParentProcessId } else { 0 }
    return "ppid:${parentPid}:$((Get-Location).Path)"
}

$Script:clientSessionId = Get-ClientSessionId

function Remove-SessionOwner {
    try {
        if (Test-Path $Script:ownerFile) {
            $lines = Get-Content $Script:ownerFile -ErrorAction SilentlyContinue
            $ownerPid = ($lines | Where-Object { $_ -like 'pid=*' } | Select-Object -First 1)
            $ownerSession = ($lines | Where-Object { $_ -like 'client_session_id=*' } | Select-Object -First 1)
            if ($ownerPid -and $ownerSession) {
                $ownerPid = $ownerPid.Substring(4)
                $ownerSession = $ownerSession.Substring(18)
                if ($ownerPid -eq "$PID" -and $ownerSession -eq $Script:clientSessionId) {
                    Remove-Item $Script:ownerFile -Force -ErrorAction SilentlyContinue
                    Write-StreamLog "deleted .bot-hive-session-owner"
                }
            }
        }
    } catch { }
}

Write-StreamLog "starting (pid=$PID, cwd=$((Get-Location).Path))"
Write-StreamLog "client_session_id=$Script:clientSessionId"

if (Test-Path $Script:ownerFile) {
    try {
        $lines = Get-Content $Script:ownerFile -ErrorAction SilentlyContinue
        $ownerPid = ($lines | Where-Object { $_ -like 'pid=*' } | Select-Object -First 1)
        $ownerSession = ($lines | Where-Object { $_ -like 'client_session_id=*' } | Select-Object -First 1)
        if ($ownerPid -and $ownerSession) {
            $ownerPid = $ownerPid.Substring(4)
            $ownerSession = $ownerSession.Substring(18)
            if ($ownerPid -ne "$PID") {
                try {
                    Get-Process -Id $ownerPid -ErrorAction Stop | Out-Null
                    if ($ownerSession -eq $Script:clientSessionId) {
                        Write-StreamLog "duplicate startup refused for client_session_id=$Script:clientSessionId owner_pid=$ownerPid"
                        throw "stream.ps1: duplicate hive stream refused for this terminal session (owner pid $ownerPid)"
                    }
                } catch [System.Exception] {
                    if ($_.Exception.Message -like 'stream.ps1:*') { throw }
                }
            }
        }
    } catch {
        if ($_.Exception.Message -like 'stream.ps1:*') { throw }
    }
}

@(
    "client_session_id=$Script:clientSessionId",
    "pid=$PID",
    "cwd=$((Get-Location).Path)",
    "at=$((Get-Date).ToUniversalTime().ToString('o'))"
) | Out-File -FilePath $Script:ownerFile -Encoding utf8 -Force
Write-StreamLog "wrote .bot-hive-session-owner (client_session_id=$Script:clientSessionId pid=$PID)"

$apiBase = if ($env:BOT_HIVE_API_URL) { $env:BOT_HIVE_API_URL } else { "https://bot-hive-j0ax.onrender.com" }
Write-StreamLog "api base: $apiBase"

# Colony from gh CLI.
$colony = $null
try { $colony = (gh api user --jq .login 2>$null) } catch { }
if (-not $colony) {
    Write-StreamLog "FATAL: could not resolve colony via 'gh api user'"
    Write-Error "stream.ps1: could not resolve colony from 'gh api user'"
    exit 2
}
Write-StreamLog "colony: $colony"

# Repo full name from origin.
$originUrl = ""
try { $originUrl = (git remote get-url origin 2>$null) } catch { $originUrl = "" }
if (-not $originUrl) {
    Write-StreamLog "FATAL: no 'origin' git remote"
    Write-Error "stream.ps1: no 'origin' git remote"
    exit 3
}
$repoFullName = $originUrl `
    -replace '\.git$', '' `
    -replace '^https?://[^/]+/', '' `
    -replace '^git@[^:]+:', ''
Write-StreamLog "repo: $repoFullName"

# Detect if cwd already has a live stream (secondary bot scenario).
$cwdPath = (Get-Location).Path
$existingPidFile = Join-Path $cwdPath ".bot-hive-stream.pid"
$isSecondary = $false
if (Test-Path $existingPidFile) {
    $existingPid = (Get-Content $existingPidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($existingPid) {
        try { Get-Process -Id $existingPid -ErrorAction Stop | Out-Null; $isSecondary = $true } catch { }
    }
}
Write-StreamLog "secondary=$isSecondary"

# Write PID to cwd now (primary) or skip until we know the handle (secondary).
if (-not $isSecondary) {
    $PID | Out-File -FilePath (Join-Path $cwdPath ".bot-hive-stream.pid") -Encoding ascii -Force
    Write-StreamLog "wrote .bot-hive-stream.pid (PID=$PID)"
}

# State paths — set after we know the handle (secondary) or immediately (primary).
$Script:stateDir = $cwdPath
$Script:handle = $null
$Script:worktreeCreated = $false

function Set-StatePaths {
    param([string]$Handle)
    if ($isSecondary) {
        $worktreePath = Join-Path $cwdPath "worktrees\$Handle"
        if (-not (Test-Path $worktreePath)) {
            Write-StreamLog "creating worktree at $worktreePath"
            git worktree add $worktreePath -b "$Handle-work" main 2>&1 | ForEach-Object { Write-StreamLog "git: $_" }
            $Script:worktreeCreated = $true
        } else {
            Write-StreamLog "worktree $worktreePath already exists"
        }
        $Script:stateDir = $worktreePath
        # Write PID to worktree.
        $PID | Out-File -FilePath (Join-Path $worktreePath ".bot-hive-stream.pid") -Encoding ascii -Force
        Write-StreamLog "wrote $worktreePath\.bot-hive-stream.pid (PID=$PID)"
        # Write ptr at cwd so startup procedure can find the notice.
        [System.IO.File]::WriteAllText(
            (Join-Path $cwdPath ".bot-hive-role-ptr"),
            "worktrees/$Handle",
            [System.Text.UTF8Encoding]::new($false)
        )
        Write-StreamLog "wrote .bot-hive-role-ptr -> worktrees/$Handle"
    }
    # Write identity file.
    $identityContent = "colony=$colony`nhandle=$Handle`n"
    [System.IO.File]::WriteAllText(
        (Join-Path $Script:stateDir ".bot-hive-identity"),
        $identityContent,
        [System.Text.UTF8Encoding]::new($false)
    )
    Write-StreamLog "wrote .bot-hive-identity (colony=$colony handle=$Handle)"
}

function Write-RoleNotice {
    param($Event)
    $notice = "handle=$($Script:handle)`nrole=$($Event.role)`nseat=$($Event.seat)`ntotal=$($Event.total)`nskillFiles=$($Event.skillFiles -join ',')`nat=$((Get-Date).ToUniversalTime().ToString('o'))`n"
    [System.IO.File]::WriteAllText(
        (Join-Path $Script:stateDir ".bot-hive-role-notice"),
        $notice,
        [System.Text.UTF8Encoding]::new($false)
    )
    Write-StreamLog "wrote .bot-hive-role-notice (role='$($Event.role)' seat=$($Event.seat) total=$($Event.total))"
}

Add-Type -AssemblyName System.Net.Http | Out-Null

$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [System.Threading.Timeout]::InfiniteTimeSpan

$retryDelaySeconds = 2
$maxRetryDelay = 30

try {
    while ($true) {
        try {
            $qs = "repo_full_name=$([uri]::EscapeDataString($repoFullName))&colony=$([uri]::EscapeDataString($colony))&client_session_id=$([uri]::EscapeDataString($Script:clientSessionId))"
            $url = "$apiBase/api/bots/stream?$qs"
            Write-StreamLog "connecting to $url"
            $resp = $client.GetAsync($url, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
            Write-StreamLog "response status: $([int]$resp.StatusCode) $($resp.StatusCode)"
            if (-not $resp.IsSuccessStatusCode) {
                Write-StreamLog "non-success status; sleeping ${retryDelaySeconds}s then retrying"
                Start-Sleep -Seconds $retryDelaySeconds
                $retryDelaySeconds = [Math]::Min($retryDelaySeconds * 2, $maxRetryDelay)
                continue
            }
            Write-StreamLog "SSE stream open"
            $retryDelaySeconds = 2
            $stream = $resp.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
            $reader = New-Object System.IO.StreamReader($stream)

            while (-not $reader.EndOfStream) {
                $line = $reader.ReadLine()
                if ($null -eq $line) {
                    Write-StreamLog "reader returned null line; treating as server-side close"
                    break
                }
                if ($line.StartsWith("data: ")) {
                    $payload = $line.Substring(6)
                    try {
                        $evt = $payload | ConvertFrom-Json -ErrorAction Stop
                        if ($evt.type -eq "your-role") {
                            Write-StreamLog "event: your-role handle='$($evt.handle)' role='$($evt.role)' seat=$($evt.seat) total=$($evt.total)"
                            if (-not $Script:handle) {
                                # First your-role: set up identity + state paths.
                                $Script:handle = $evt.handle
                                Set-StatePaths -Handle $evt.handle
                            }
                            Write-RoleNotice -Event $evt
                        } else {
                            Write-StreamLog "event: type=$($evt.type) payload=$payload"
                        }
                    } catch {
                        Write-StreamLog "JSON parse error on payload: $payload -- $($_.Exception.Message)"
                    }
                } elseif ($line.StartsWith(":")) {
                    Write-StreamLog "keepalive: $($line.Trim())"
                }
            }
            Write-StreamLog "inner loop exited (EndOfStream); will reconnect"
        } catch {
            Write-StreamLog "EXCEPTION in connection loop: $($_.Exception.GetType().FullName): $($_.Exception.Message)"
            if ($_.Exception.InnerException) {
                Write-StreamLog "  inner: $($_.Exception.InnerException.GetType().FullName): $($_.Exception.InnerException.Message)"
            }
            Write-StreamLog "  sleeping ${retryDelaySeconds}s before reconnect"
            Start-Sleep -Seconds $retryDelaySeconds
            $retryDelaySeconds = [Math]::Min($retryDelaySeconds * 2, $maxRetryDelay)
        }
    }
} finally {
    Remove-SessionOwner
    Write-StreamLog "script exiting (normal/exception/PowerShell shutdown)"
}
