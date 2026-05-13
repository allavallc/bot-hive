# scripts/check-role.ps1 — HV-136 notice surfacer.
#
# Replaces the old /whoami-polling check-role with a one-shot read of
# .bot-hive-role-notice. stream.ps1 (the background SSE listener) writes
# that file whenever the server pushes a `your-role` event. This script
# runs from the UserPromptSubmit hook on every operator prompt:
# - If the notice file exists, print a one-line `[BOT-HIVE] Role …`
#   message (which the agent host injects into the next prompt) and
#   delete the file (one-shot).
# - Otherwise exit 0 silently.
#
# No /whoami call. No DB round-trip. Cheap.

$ErrorActionPreference = "SilentlyContinue"

$noticeFile = ".bot-hive-role-notice"
if (-not (Test-Path $noticeFile)) { exit 0 }

$role = $null
$seat = $null
$total = $null
Get-Content $noticeFile | ForEach-Object {
    if ($_ -match '^role=(.+)$')  { $role  = $Matches[1].Trim() }
    if ($_ -match '^seat=(.+)$')  { $seat  = $Matches[1].Trim() }
    if ($_ -match '^total=(.+)$') { $total = $Matches[1].Trim() }
}

# Consume the notice (one-shot — same event shouldn't re-fire).
Remove-Item $noticeFile -Force -ErrorAction SilentlyContinue

if (-not $role) { exit 0 }

# Suppress the very first notice (which arrives on stream open and
# matches the role the bot already announced at bootstrap). We detect
# "first" via a tiny stamp file.
$bootStamp = ".bot-hive-role-bootannounced"
if (-not (Test-Path $bootStamp)) {
    "role=$role" | Out-File -FilePath $bootStamp -Encoding utf8
    exit 0
}

# Compare against the last announced role.
$lastAnnounced = (Get-Content $bootStamp -ErrorAction SilentlyContinue | Where-Object { $_ -match '^role=' } | Select-Object -First 1) -replace '^role=', ''
if ($lastAnnounced -eq $role) { exit 0 }

"role=$role" | Out-File -FilePath $bootStamp -Encoding utf8

Write-Output "[BOT-HIVE] Role changed: you are now seat $seat of $total, role: $role."
Write-Output "Announce this to the operator before continuing."
