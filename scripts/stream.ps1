# scripts/stream.ps1 -- FS-030 bot SSE listener.
#
# Connects to /api/bots/stream with colony only. The server assigns a
# handle and returns it in the first your-role event. This script writes
# .bot-hive-identity (colony + handle) and .bot-hive-role-notice after
# receiving the assignment.
#
# Multi-bot isolation: each startup gets a request-scoped handoff file.
# If another stream already owns cwd, this script creates worktrees/<handle>/
# for the new bot and writes the handoff to .bot-hive-startups/<startup-id>.json.
# No shared root role pointer is used.
#
# Single role: hold the SSE connection. When this process dies the TCP
# socket closes and the server reaps the seat (15s grace).
#
# Diagnostic log: .bot-hive.log in cwd.

param(
    [string]$StartupId = ""
)

$ErrorActionPreference = "Stop"

$Script:logPath = (Join-Path (Get-Location).Path ".bot-hive.log")
$Script:pidFilePath = $null

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

function Remove-OwnPidFile {
    if (-not $Script:pidFilePath) { return }
    if (-not (Test-Path $Script:pidFilePath)) { return }
    try {
        $recordedPid = (Get-Content $Script:pidFilePath -ErrorAction Stop | Select-Object -First 1)
        if ($recordedPid -and [int]$recordedPid -eq $PID) {
            Remove-Item $Script:pidFilePath -Force -ErrorAction SilentlyContinue
            Write-StreamLog "removed stream pid file $Script:pidFilePath"
        }
    } catch { }
}

$cwdPath = (Get-Location).Path

function Write-StartupLaunch {
    if (-not $StartupId) { return }
    $launchDir = Join-Path $cwdPath ".bot-hive-launches"
    New-Item -ItemType Directory -Force -Path $launchDir | Out-Null
    $payload = [ordered]@{
        startupId = $StartupId
        pid = $PID
        cwd = (Resolve-Path $cwdPath | Select-Object -ExpandProperty Path)
        at = (Get-Date).ToUniversalTime().ToString('o')
    } | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText(
        (Join-Path $launchDir "$StartupId.json"),
        $payload,
        [System.Text.UTF8Encoding]::new($false)
    )
    Write-StreamLog "wrote startup launch .bot-hive-launches/$StartupId.json"
}

function Write-StartupResult {
    param(
        [string]$State,
        [string]$Reason = "",
        $Event = $null
    )
    if (-not $StartupId) { return }
    $handoffDir = Join-Path $cwdPath ".bot-hive-startups"
    New-Item -ItemType Directory -Force -Path $handoffDir | Out-Null
    $resolvedStateDir = ""
    $resolvedNoticePath = ""
    if ($Script:stateDir -and (Test-Path $Script:stateDir)) {
        $resolvedStateDir = Resolve-Path $Script:stateDir | Select-Object -ExpandProperty Path
        $resolvedNoticePath = Join-Path $resolvedStateDir ".bot-hive-role-notice"
    } elseif ($Script:stateDir) {
        $resolvedStateDir = $Script:stateDir
        $resolvedNoticePath = Join-Path $Script:stateDir ".bot-hive-role-notice"
    }
    $payload = [ordered]@{
        startupId = $StartupId
        state = $State
        stateDir = $resolvedStateDir
        noticePath = $resolvedNoticePath
        colony = $colony
        handle = $Script:handle
        role = if ($Event) { $Event.role } else { $null }
        seat = if ($Event) { $Event.seat } else { $null }
        total = if ($Event) { $Event.total } else { $null }
        skillFiles = if ($Event) { @($Event.skillFiles) } else { @() }
        sessionId = $Script:sessionId
        streamPid = $PID
        reason = $Reason
        at = (Get-Date).ToUniversalTime().ToString('o')
    } | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText(
        (Join-Path $handoffDir "$StartupId.json"),
        $payload,
        [System.Text.UTF8Encoding]::new($false)
    )
    Write-StreamLog "wrote startup result state=$State path=.bot-hive-startups/$StartupId.json reason='$Reason'"
}

function Fail-Startup {
    param(
        [string]$Reason,
        [int]$ExitCode,
        [string]$Message
    )
    Write-StartupResult -State "failed" -Reason $Reason
    Write-StreamLog "FATAL: $Message (reason=$Reason exit=$ExitCode)"
    Write-Error $Message
    exit $ExitCode
}

Write-StreamLog "starting (pid=$PID, cwd=$cwdPath, startup_id=$StartupId)"
Write-StartupLaunch
Write-StartupResult -State "pending"

function Read-LocalValue {
    param(
        [string]$Path,
        [string]$Key
    )
    if (-not (Test-Path $Path)) { return $null }
    try {
        $line = Get-Content $Path -ErrorAction Stop |
            Where-Object { $_ -match "^$([regex]::Escape($Key))=" } |
            Select-Object -First 1
        if (-not $line) { return $null }
        return ($line -replace "^$([regex]::Escape($Key))=", "").Trim()
    } catch {
        return $null
    }
}

$localApiBasePath = Join-Path $cwdPath ".bot-hive-api-url"
$localDevLogPath = Join-Path $cwdPath ".bot-hive-dev.log"
. (Join-Path $PSScriptRoot "lib/api-base.ps1")
$apiBaseDecision = Resolve-BotHiveApiBase `
    -PersistedApiBasePath $localApiBasePath `
    -DevLogPath $localDevLogPath `
    -EnvApiBase $env:BOT_HIVE_API_URL `
    -DefaultApiBase "https://bot-hive-j0ax.onrender.com"
$apiBase = $apiBaseDecision.ApiBase
if ($apiBaseDecision.CandidatesTried -and $apiBaseDecision.CandidatesTried.Count -gt 0) {
    Write-StreamLog "api base candidates: $($apiBaseDecision.CandidatesTried -join '; ')"
}
if ($apiBaseDecision.ReachabilityChecked -and -not $apiBaseDecision.Reachable) {
    Write-StreamLog "api base warning: no reachable candidate found; proceeding with '$apiBase' from source '$($apiBaseDecision.Source)'"
    if ($StartupId) {
        Fail-Startup -Reason "api-base-unreachable" -ExitCode 9 -Message "stream.ps1: no reachable API base candidate for startup (tried: $($apiBaseDecision.CandidatesTried -join '; '))"
    }
}
if (-not $env:BOT_HIVE_API_URL -and $apiBase) {
    [System.IO.File]::WriteAllText($localApiBasePath, "$apiBase`n", [System.Text.UTF8Encoding]::new($false))
    Write-StreamLog "api base persisted to .bot-hive-api-url: $apiBase (source=$($apiBaseDecision.Source))"
} elseif ($env:BOT_HIVE_API_URL) {
    Write-StreamLog "api base from BOT_HIVE_API_URL: $apiBase"
}
Write-StreamLog "api base: $apiBase"

# Colony from gh CLI, with a local identity-file fallback for already-bootstrapped
# local checkouts where gh credentials are unavailable to the spawned process.
$colony = $null
try { $colony = (gh api user --jq .login 2>$null) } catch { }
if (-not $colony) {
    $colony = Read-LocalValue -Path (Join-Path $cwdPath ".bot-hive-identity") -Key "colony"
    if ($colony) {
        Write-StreamLog "colony fallback: .bot-hive-identity"
    }
}
if (-not $colony) {
    Fail-Startup -Reason "colony-unresolved" -ExitCode 2 -Message "stream.ps1: could not resolve colony from 'gh api user' or .bot-hive-identity"
}
Write-StreamLog "colony: $colony"

# Repo full name from origin.
$originUrl = ""
try { $originUrl = (git remote get-url origin 2>$null) } catch { $originUrl = "" }
if (-not $originUrl) {
    Fail-Startup -Reason "origin-remote-missing" -ExitCode 3 -Message "stream.ps1: no 'origin' git remote"
}
$repoFullName = $originUrl `
    -replace '\.git$', '' `
    -replace '^https?://[^/]+/', '' `
    -replace '^git@[^:]+:', ''
Write-StreamLog "repo: $repoFullName"

# If cwd already has a live stream, this startup becomes a secondary bot
# with state isolated under worktrees/<handle>/. The StartupId disambiguates
# the foreground handoff so simultaneous Bot 2 / Bot 3 startups do not race.
$existingPidFile = Join-Path $cwdPath ".bot-hive-stream.pid"
$isSecondary = $false
if (Test-Path $existingPidFile) {
    $existingPid = (Get-Content $existingPidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($existingPid) {
        $pidAlive = $false
        try { Get-Process -Id $existingPid -ErrorAction Stop | Out-Null; $pidAlive = $true } catch { }
        if ($pidAlive) {
            if (-not $StartupId) {
                Fail-Startup -Reason "startup-id-required-for-secondary" -ExitCode 6 -Message "stream.ps1: live .bot-hive-stream.pid already exists; startup must pass -StartupId for same-root multi-bot startup."
            }
            $isSecondary = $true
            Write-StreamLog "live root stream detected (PID=$existingPid); secondary startup id=$StartupId"
        } else {
            Remove-Item $existingPidFile -Force -ErrorAction SilentlyContinue
            Write-StreamLog "removed stale .bot-hive-stream.pid (PID=$existingPid was not alive)"
        }
    }
}

if (-not $isSecondary) {
    foreach ($stalePath in @(
        (Join-Path $cwdPath ".bot-hive-role-notice"),
        (Join-Path $cwdPath ".bot-hive-role-bootannounced")
    )) {
        if (Test-Path $stalePath) {
            Remove-Item $stalePath -Force -ErrorAction SilentlyContinue
            Write-StreamLog "removed stale cwd artifact: $([System.IO.Path]::GetFileName($stalePath))"
        }
    }

    $PID | Out-File -FilePath (Join-Path $cwdPath ".bot-hive-stream.pid") -Encoding ascii -Force
    $Script:pidFilePath = (Join-Path $cwdPath ".bot-hive-stream.pid")
    Write-StreamLog "wrote .bot-hive-stream.pid (PID=$PID)"
}

# For a primary bot whose previous stream process died: reclaim the previously-assigned
# handle so the server rebinds the same seat instead of assigning a new one on top of a
# ghost-active row. Secondary bots must NOT read the root identity file — they get their
# handle from the server and write it into their own worktree.
$Script:preferredReconnectHandle = $null
if (-not $isSecondary) {
    $prevHandle = Read-LocalValue -Path (Join-Path $cwdPath ".bot-hive-identity") -Key "handle"
    if ($prevHandle) {
        $Script:preferredReconnectHandle = $prevHandle
        Write-StreamLog "primary restart: will request reclaim of handle '$prevHandle'"
    }
}

$Script:stateDir = $cwdPath
$Script:handle = $null
$Script:sessionId = $null
$Script:sessionActiveEverSeen = $false

function Set-StatePaths {
    param([string]$Handle)
    if ($isSecondary) {
        $worktreePath = Join-Path $cwdPath "worktrees\$Handle"
        if (-not (Test-Path $worktreePath)) {
            Write-StreamLog "creating worktree at $worktreePath"
            $gitExitCode = 1
            for ($attempt = 1; $attempt -le 5; $attempt++) {
                $oldErrorActionPreference = $ErrorActionPreference
                $ErrorActionPreference = "Continue"
                $gitOutput = & git worktree add $worktreePath -B "$Handle-work" main 2>&1
                $gitExitCode = $LASTEXITCODE
                $ErrorActionPreference = $oldErrorActionPreference
                foreach ($line in @($gitOutput)) {
                    Write-StreamLog "git attempt ${attempt}: $line"
                }
                if ($gitExitCode -eq 0) { break }
                Start-Sleep -Milliseconds (250 * $attempt)
            }
            if ($gitExitCode -ne 0) {
                Write-StreamLog "git worktree add failed with exit $gitExitCode; falling back to local shared clone"
                $oldErrorActionPreference = $ErrorActionPreference
                $ErrorActionPreference = "Continue"
                $cloneOutput = & git clone --shared --no-checkout $cwdPath $worktreePath 2>&1
                $cloneExitCode = $LASTEXITCODE
                $ErrorActionPreference = $oldErrorActionPreference
                foreach ($line in @($cloneOutput)) {
                    Write-StreamLog "git clone fallback: $line"
                }
                if ($cloneExitCode -eq 0) {
                    $oldErrorActionPreference = $ErrorActionPreference
                    $ErrorActionPreference = "Continue"
                    $checkoutOutput = & git -C $worktreePath checkout -B "$Handle-work" HEAD 2>&1
                    $checkoutExitCode = $LASTEXITCODE
                    $ErrorActionPreference = $oldErrorActionPreference
                    foreach ($line in @($checkoutOutput)) {
                        Write-StreamLog "git clone checkout fallback: $line"
                    }
                } else {
                    $checkoutExitCode = 1
                }
                if ($cloneExitCode -ne 0 -or $checkoutExitCode -ne 0) {
                    Fail-Startup -Reason "worktree-create-failed" -ExitCode 8 -Message "stream.ps1: fallback checkout failed (clone=$cloneExitCode checkout=$checkoutExitCode)"
                }
            }
        } else {
            Write-StreamLog "worktree $worktreePath already exists"
        }
        $Script:stateDir = $worktreePath
        $PID | Out-File -FilePath (Join-Path $worktreePath ".bot-hive-stream.pid") -Encoding ascii -Force
        $Script:pidFilePath = (Join-Path $worktreePath ".bot-hive-stream.pid")
        Write-StreamLog "wrote $worktreePath\.bot-hive-stream.pid (PID=$PID)"
    }
    # Write identity file.
    $sid = if ($Script:sessionId) { $Script:sessionId } else { "" }
    $identityContent = "colony=$colony`nhandle=$Handle`nsession_id=$sid`n"
    [System.IO.File]::WriteAllText(
        (Join-Path $Script:stateDir ".bot-hive-identity"),
        $identityContent,
        [System.Text.UTF8Encoding]::new($false)
    )
    Write-StreamLog "wrote .bot-hive-identity (colony=$colony handle=$Handle session_id=$sid)"
}

function Write-StartupHandoff {
    param($Event)
    Write-StartupResult -State "live" -Event $Event
}

function Write-RoleNotice {
    param($Event)
    $sid = if ($Script:sessionId) { $Script:sessionId } else { "" }
    $lines = @(
        "handle=$($Script:handle)",
        "role=$($Event.role)",
        "seat=$($Event.seat)",
        "total=$($Event.total)",
        "skillFiles=$($Event.skillFiles -join ',')",
        "session_id=$sid",
        "at=$((Get-Date).ToUniversalTime().ToString('o'))"
    )
    if ($Event.departed) { $lines += "departed=$($Event.departed)" }
    $notice = ($lines -join "`n") + "`n"
    [System.IO.File]::WriteAllText(
        (Join-Path $Script:stateDir ".bot-hive-role-notice"),
        $notice,
        [System.Text.UTF8Encoding]::new($false)
    )
    Write-StreamLog "wrote .bot-hive-role-notice (role='$($Event.role)' seat=$($Event.seat) total=$($Event.total) departed='$($Event.departed)')"
}

Add-Type -AssemblyName System.Net.Http | Out-Null

$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [System.Threading.Timeout]::InfiniteTimeSpan

$retryDelaySeconds = 2
$maxRetryDelay = 30

try {
    while ($true) {
        try {
            # Reconnect with the confirmed handle once one has been assigned.
            # On first connect use the previously-assigned handle from .bot-hive-identity
            # (primary only) so the server rebinds the same seat instead of creating a
            # ghost-inflated new one. Secondary bots never use the root identity file.
            $preferredHandle = if ($Script:handle) { $Script:handle } else { $Script:preferredReconnectHandle }
            $qs = "repo_full_name=$([uri]::EscapeDataString($repoFullName))&colony=$([uri]::EscapeDataString($colony))"
            if ($preferredHandle) {
                $qs = "$qs&handle=$([uri]::EscapeDataString($preferredHandle))"
            }
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
                            Write-StreamLog "event: your-role handle='$($evt.handle)' role='$($evt.role)' seat=$($evt.seat) total=$($evt.total) sessionId='$($evt.sessionId)'"
                            if (-not $Script:handle) {
                                # First your-role: capture sessionId, set up identity + state paths.
                                $Script:sessionId = $evt.sessionId
                                $Script:handle = $evt.handle
                                Set-StatePaths -Handle $evt.handle
                                # Stamp the boot role now so check-role.ps1 can detect a role
                                # change if the colony shifts before the first operator prompt.
                                # Without this, stream overwrites the notice and check-role sees
                                # no bootStamp, suppresses what is actually a real role change.
                                $bootStampPath = Join-Path $Script:stateDir ".bot-hive-role-bootannounced"
                                "role=$($evt.role)" | Out-File -FilePath $bootStampPath -Encoding utf8
                                Write-StreamLog "wrote boot bootannounced stamp (role='$($evt.role)')"
                            } elseif ($Script:handle -ne $evt.handle) {
                                Fail-Startup -Reason "handle-mismatch" -ExitCode 7 -Message "stream.ps1: server returned handle '$($evt.handle)' for existing stream handle '$Script:handle'"
                            }
                            Write-RoleNotice -Event $evt
                            Write-StartupHandoff -Event $evt
                        } else {
                            Write-StreamLog "event: type=$($evt.type) payload=$payload"
                        }
                    } catch {
                        Write-StreamLog "JSON parse error on payload: $payload -- $($_.Exception.Message)"
                    }
                } elseif ($line.StartsWith(":")) {
                    Write-StreamLog "keepalive: $($line.Trim())"
                    # Dead-man's switch: exit if the agent session is gone.
                    if ($Script:handle) {
                        $actFile = Join-Path $Script:stateDir ".bot-hive-session-active"
                        if (Test-Path $actFile) {
                            $Script:sessionActiveEverSeen = $true
                            $ageMin = ((Get-Date).ToUniversalTime() - (Get-Item $actFile).LastWriteTimeUtc).TotalMinutes
                            if ($ageMin -gt 15) {
                                Write-StreamLog "session-active is $([math]::Round($ageMin, 1))m stale (>15m); agent is gone, exiting"
                                [Environment]::Exit(0)
                            }
                        } elseif ($Script:sessionActiveEverSeen) {
                            # File was present before but is now gone — shutdown ran but kill failed,
                            # or the terminal closed mid-cleanup. Exit so the server can reclaim the seat.
                            Write-StreamLog "session-active gone after being seen; agent exited without killing stream; exiting"
                            [Environment]::Exit(0)
                        }
                    }
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
    Remove-OwnPidFile
    Write-StreamLog "script exiting (normal/exception/PowerShell shutdown)"
}
