# scripts/stream.ps1 — HV-136 bot SSE listener.
#
# Opens a long-lived SSE connection to /api/bots/stream and writes
# .bot-hive-role-notice whenever the server pushes a `your-role` event.
# The UserPromptSubmit hook surfaces that notice on the bot's next
# operator prompt.
#
# Single script, single role: hold the connection open. When this
# process dies, the TCP socket closes and the server reaps the seat
# (15-second grace). No PID-file based heartbeat. No /join. No /leave.

$ErrorActionPreference = "Stop"

$apiBase = if ($env:BOT_HIVE_API_URL) { $env:BOT_HIVE_API_URL } else { "https://bot-hive-j0ax.onrender.com" }

# Resolve identity from .bot-hive-identity at the worktree root.
if (-not (Test-Path ".bot-hive-identity")) {
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
    Write-Error "stream.ps1: .bot-hive-identity must set colony= and handle="
    exit 2
}

# Repo full name from origin.
$originUrl = ""
try { $originUrl = (git remote get-url origin 2>$null) } catch { $originUrl = "" }
if (-not $originUrl) { Write-Error "stream.ps1: no 'origin' git remote"; exit 3 }
$repoFullName = $originUrl `
    -replace '\.git$', '' `
    -replace '^https?://[^/]+/', '' `
    -replace '^git@[^:]+:', ''

# Write our PID so bot-shutdown.md can stop us cleanly.
$PID | Out-File -FilePath ".bot-hive-stream.pid" -Encoding ascii -Force

$noticeFile = ".bot-hive-role-notice"

Add-Type -AssemblyName System.Net.Http | Out-Null

$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [System.Threading.Timeout]::InfiniteTimeSpan

$retryDelaySeconds = 2
$maxRetryDelay = 30

while ($true) {
    try {
        $qs = "repo_full_name=$([uri]::EscapeDataString($repoFullName))&colony=$([uri]::EscapeDataString($colony))&handle=$([uri]::EscapeDataString($handle))"
        $url = "$apiBase/api/bots/stream?$qs"
        $resp = $client.GetAsync($url, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        if (-not $resp.IsSuccessStatusCode) {
            Start-Sleep -Seconds $retryDelaySeconds
            $retryDelaySeconds = [Math]::Min($retryDelaySeconds * 2, $maxRetryDelay)
            continue
        }
        $retryDelaySeconds = 2  # reset on a clean open
        $stream = $resp.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
        $reader = New-Object System.IO.StreamReader($stream)

        while (-not $reader.EndOfStream) {
            $line = $reader.ReadLine()
            if ($null -eq $line) { break }
            if ($line.StartsWith("data: ")) {
                $payload = $line.Substring(6)
                try {
                    $evt = $payload | ConvertFrom-Json -ErrorAction Stop
                    if ($evt.type -eq "your-role") {
                        $notice = "role=$($evt.role)`nseat=$($evt.seat)`ntotal=$($evt.total)`nskillFiles=$($evt.skillFiles -join ',')`nat=$((Get-Date).ToUniversalTime().ToString('o'))`n"
                        # Write without BOM — bash/grep in the UserPromptSubmit hook
                        # can't parse a BOM-prefixed `role=...` first line.
                        [System.IO.File]::WriteAllText((Resolve-Path -LiteralPath ".").Path + "\$noticeFile", $notice, [System.Text.UTF8Encoding]::new($false))
                    }
                } catch {
                    # Malformed JSON; skip.
                }
            }
        }
    } catch {
        # Network blip / server restart: reconnect with backoff.
        Start-Sleep -Seconds $retryDelaySeconds
        $retryDelaySeconds = [Math]::Min($retryDelaySeconds * 2, $maxRetryDelay)
    }
}
