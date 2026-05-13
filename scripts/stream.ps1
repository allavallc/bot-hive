# scripts/stream.ps1 -- HV-136 bot SSE listener with diagnostic logging.
#
# Opens a long-lived SSE connection to /api/bots/stream and writes
# .bot-hive-role-notice whenever the server pushes a `your-role` event.
# The UserPromptSubmit hook surfaces that notice on the bot's next
# operator prompt.
#
# Single script, single role: hold the connection open. When this
# process dies, the TCP socket closes and the server reaps the seat
# (15-second grace). No PID-file based heartbeat. No /join. No /leave.
#
# Diagnostic log: .bot-hive.log in cwd (same dir as the pid file).
# Tagged lines from this script use [stream]. Format:
#   <ISO8601-UTC> [stream] <message>

$ErrorActionPreference = "Stop"

# Resolve log path once at start so logging keeps working even if cwd shifts.
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
    } catch {
        # Logging must never break the script. Swallow.
    }
}

Write-StreamLog "starting (pid=$PID, cwd=$((Get-Location).Path))"

$apiBase = if ($env:BOT_HIVE_API_URL) { $env:BOT_HIVE_API_URL } else { "https://bot-hive-j0ax.onrender.com" }
Write-StreamLog "api base: $apiBase"

# Resolve identity from .bot-hive-identity at the worktree root.
if (-not (Test-Path ".bot-hive-identity")) {
    Write-StreamLog "FATAL: .bot-hive-identity not found in $((Get-Location).Path)"
    Write-Error "stream.ps1: .bot-hive-identity not found"
    exit 2
}
$colony = $null
$handle = $null
Get-Content ".bot-hive-identity" | ForEach-Object {
    if ($_ -match '^colony=(.+)$') { $colony = $Matches[1].Trim() }
    if ($_ -match '^handle=(.+)$') { $handle = $Matches[1].Trim() }
}
if (-not $colony -or -not $handle) {
    Write-StreamLog "FATAL: .bot-hive-identity must set colony= and handle= (got colony='$colony' handle='$handle')"
    Write-Error "stream.ps1: .bot-hive-identity must set colony= and handle="
    exit 2
}
Write-StreamLog "identity: colony=$colony handle=$handle"

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

# Write our PID so bot-shutdown.md can stop us cleanly.
$PID | Out-File -FilePath ".bot-hive-stream.pid" -Encoding ascii -Force
Write-StreamLog "wrote .bot-hive-stream.pid (PID=$PID)"

$noticeFile = ".bot-hive-role-notice"

Add-Type -AssemblyName System.Net.Http | Out-Null

$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [System.Threading.Timeout]::InfiniteTimeSpan

$retryDelaySeconds = 2
$maxRetryDelay = 30

try {
    while ($true) {
        try {
            $qs = "repo_full_name=$([uri]::EscapeDataString($repoFullName))&colony=$([uri]::EscapeDataString($colony))&handle=$([uri]::EscapeDataString($handle))"
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
            $retryDelaySeconds = 2  # reset on a clean open
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
                            Write-StreamLog "event: your-role role='$($evt.role)' seat=$($evt.seat) total=$($evt.total)"
                            $notice = "role=$($evt.role)`nseat=$($evt.seat)`ntotal=$($evt.total)`nskillFiles=$($evt.skillFiles -join ',')`nat=$((Get-Date).ToUniversalTime().ToString('o'))`n"
                            [System.IO.File]::WriteAllText((Resolve-Path -LiteralPath ".").Path + "\$noticeFile", $notice, [System.Text.UTF8Encoding]::new($false))
                            Write-StreamLog "wrote $noticeFile"
                        } else {
                            Write-StreamLog "event: type=$($evt.type) payload=$payload"
                        }
                    } catch {
                        Write-StreamLog "JSON parse error on payload: $payload -- $($_.Exception.Message)"
                    }
                } elseif ($line.StartsWith(":")) {
                    # SSE comment / keepalive. Log so we can see the connection is alive.
                    Write-StreamLog "keepalive: $($line.Trim())"
                }
                # Other lines (blank, `event:`, etc.) ignored.
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
    Write-StreamLog "script exiting (normal/exception/PowerShell shutdown)"
}
