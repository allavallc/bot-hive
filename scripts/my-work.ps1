# Print the tickets owned by *this* agent — the agent-id assigned to the
# current clone (HV-074). Use at session start to find work the previous
# session of the same agent left mid-flight.
#
# Resolution order for agent-id:
#   1. `git config bot-hive.agent-id`
#   2. Default-derive: `${git config user.email}@${HOSTNAME}`
#
# Usage:
#   .\scripts\my-work.ps1               # print my tickets
#   .\scripts\my-work.ps1 -Agent <id>   # print tickets for a different agent

param(
    [string]$Agent = ""
)

$repoRoot = git rev-parse --show-toplevel 2>$null
if (-not $repoRoot) {
    Write-Error "not in a git repository"
    exit 2
}
Set-Location $repoRoot

if (-not $Agent) {
    $Agent = (git config bot-hive.agent-id 2>$null) -join ""
}

if (-not $Agent) {
    $email = (git config user.email 2>$null) -join ""
    if (-not $email) {
        Write-Error "no git config user.email and no bot-hive.agent-id set"
        Write-Error "  set one of:"
        Write-Error "    git config user.email <email>"
        Write-Error "    git config bot-hive.agent-id <id>"
        exit 2
    }
    $hostname = (hostname 2>$null) -join ""
    if (-not $hostname) { $hostname = "unknown" }
    $Agent = "$email@$hostname"
}

Write-Output "Agent-id: $Agent"
Write-Output ""

$foundAny = $false
foreach ($stateDir in @('in-progress', 'in-review')) {
    $dir = Join-Path "hive" $stateDir
    if (-not (Test-Path $dir)) { continue }
    Get-ChildItem $dir -Filter '*.md' | ForEach-Object {
        $content = Get-Content $_.FullName -Raw
        $pattern = '(?m)^- \*\*Assigned to\*\*:\s*' + [regex]::Escape($Agent) + '(\s|\(|$)'
        if ($content -match $pattern) {
            $first = (Get-Content $_.FullName -TotalCount 1)
            if ($first -match '^# \[(HV-\d+)\]\s+(.*)$') {
                $ticketId = $Matches[1]
                $title = $Matches[2]
                Write-Output "  [$stateDir] $ticketId — $title"
                $script:foundAny = $true
            }
        }
    }
}

if (-not $foundAny) {
    Write-Output "  (no tickets currently assigned to this agent)"
}
