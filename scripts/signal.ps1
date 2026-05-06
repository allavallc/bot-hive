# Publish a signal to the SSE channel — generic helper for any signal type.
#
# Usage:
#   .\scripts\signal.ps1 -Type claim -Refs HV-085
#   .\scripts\signal.ps1 -Type done -Refs HV-085 -Message "tests green"

param(
    [Parameter(Mandatory = $true)]
    [string]$Type,
    [string]$Refs = "",
    [string]$Message = "",
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
    if (-not $email) { Write-Error "no git config user.email and no bot-hive.agent-id"; exit 2 }
    $hostnameStr = (hostname 2>$null) -join ""
    if (-not $hostnameStr) { $hostnameStr = "unknown" }
    $agentId = "$email@$hostnameStr"
}

# Handle.
if (-not $Handle) {
    $handles = @('buzz','scout','forager','drone','comb','pollen','nectar','waggle','sparrow','finch','robin','wren','fox','otter','badger','mole','squirrel','hare','sentinel','pilot','ranger','watcher','kestrel','falcon','tern','jay')
    $Handle = $handles | Get-Random
}

# Project.
if (-not $Project) { $Project = $env:BOT_HIVE_PROJECT_ID }
if (-not $Project) { $Project = (git config bot-hive.project-id 2>$null) -join "" }
if (-not $Project) {
    Write-Error "pass -Project <id> or set BOT_HIVE_PROJECT_ID / git config bot-hive.project-id"
    exit 2
}

# Token.
$token = $env:BOT_HIVE_TOKEN
if (-not $token) { $token = (git config bot-hive.token 2>$null) -join "" }
if (-not $token) {
    Write-Error "no bot token. Create one via scripts\create-bot-token.sh, then set BOT_HIVE_TOKEN env or git config bot-hive.token"
    exit 2
}

# Default message.
if (-not $Message) {
    switch ($Type) {
        'claim'    { $Message = "$agentId/$Handle claiming $Refs" }
        'done'     { $Message = "$agentId/$Handle done with $Refs" }
        'blocked'  { $Message = "$agentId/$Handle blocked on $Refs" }
        'presence' { $Message = "$agentId/$Handle online" }
        default    { $Message = "$agentId/$Handle $Type $Refs" }
    }
}

$bodyHash = @{
    type = $Type
    message = $Message
    bot = $Handle
}
if ($Refs) { $bodyHash.refs = @($Refs) }
$body = $bodyHash | ConvertTo-Json -Compress

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
