# scripts/install-statusline.ps1 - one-shot setup for the orchestrator's
# main checkout. See install-statusline.sh for the canonical version.

$ErrorActionPreference = "Stop"

if (Test-Path ".bot-hive-identity") {
    Write-Warning ".bot-hive-identity exists - looks like a bot worktree, not the orchestrator's main checkout. Aborting."
    exit 1
}

if (-not (Test-Path ".claude")) {
    New-Item -ItemType Directory -Path ".claude" | Out-Null
}

$settings = @"
{
  "statusLine": {
    "type": "command",
    "command": "powershell -NoProfile -File ./scripts/claude-statusline.ps1"
  }
}
"@

Set-Content -Path ".claude/settings.json" -Value $settings -Encoding UTF8

Write-Output "wrote .claude/settings.json - restart Claude Code to see 'orchestrator' in the statusline."
