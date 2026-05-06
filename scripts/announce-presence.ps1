# Publish a `presence` signal to the SSE channel for this clone's agent (HV-081).
#
# Resolves agent-id from `git config bot-hive.agent-id` or `<email>@<hostname>`.
# Resolves token from `git config bot-hive.token` or `BOT_HIVE_TOKEN` env.
#
# Usage:
#   .\scripts\announce-presence.ps1
#   .\scripts\announce-presence.ps1 -Focus FS-007 -Handle wren

param(
    [string]$Focus = "",
    [string]$Handle = "",
    [string]$Project = "",
    [string]$BaseUrl = "",
    [switch]$DryRun
)

$repoRoot = git rev-parse --show-toplevel 2>$null
if (-not $repoRoot) { Write-Error "not in a git repository"; exit 2 }
Set-Location $repoRoot

if (-not $BaseUrl) {
    $BaseUrl = if ($env:BOT_HIVE_BASE_URL) { $env:BOT_HIVE_BASE_URL } else { "https://bot-hive-j0ax.onrender.com" }
}

# Agent-id.
$agentId = (git config bot-hive.agent-id 2>$null) -join ""
if (-not $agentId) {
    $email = (git config user.email 2>$null) -join ""
    if (-not $email) { Write-Error "no git config user.email and no bot-hive.agent-id set"; exit 2 }
    $hostnameStr = (hostname 2>$null) -join ""
    if (-not $hostnameStr) { $hostnameStr = "unknown" }
    $agentId = "$email@$hostnameStr"
}

# Focus.
if (-not $Focus -and (Test-Path "hive/focus.md")) {
    $line = Select-String -Path "hive/focus.md" -Pattern '^current\s*=' | Select-Object -First 1
    if ($line) { $Focus = ($line.Line -replace '^current\s*=\s*', '').Trim() }
}

# Handle.
if (-not $Handle) {
    $handles = @('buzz','scout','forager','drone','comb','pollen','nectar','waggle','sparrow','finch','robin','wren','fox','otter','badger','mole','squirrel','hare','sentinel','pilot','ranger','watcher','kestrel','falcon','tern','jay')
    $Handle = $handles | Get-Random
}

# Project.
if (-not $Project) {
    $Project = (git config bot-hive.project-id 2>$null) -join ""
    if (-not $Project) {
        Write-Error "pass -Project <id> or set git config bot-hive.project-id"
        exit 2
    }
}

# Token.
$token = $env:BOT_HIVE_TOKEN
if (-not $token) { $token = (git config bot-hive.token 2>$null) -join "" }
if (-not $token) {
    Write-Error "no bot token. Create one via scripts\create-bot-token.sh, then set BOT_HIVE_TOKEN env or git config bot-hive.token"
    exit 2
}

$message = "$agentId/$Handle online"
if ($Focus) { $message = "$message (focus: $Focus)" }

$body = @{
    type = "presence"
    message = $message
    bot = $Handle
} | ConvertTo-Json

if ($DryRun) {
    Write-Output "Would POST to $BaseUrl/api/projects/$Project/signals:"
    Write-Output $body
    exit 0
}

$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
}

Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/projects/$Project/signals" -Headers $headers -Body $body
