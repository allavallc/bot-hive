# HV-122 regression test for scripts/whoami.ps1
#
# Mirrors whoami-role-override.sh: reproduces the returning-bot-out-
# ranks-fresh-PM scenario and asserts role= override on .bot-hive-
# identity routes the role correctly.

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition)
$repoRoot = Split-Path -Parent $scriptDir
$tmp = New-Item -ItemType Directory -Path ([System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "hv122-$(New-Guid)"))

try {
    New-Item -ItemType Directory -Path (Join-Path $tmp "hive/events") | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $tmp "hive/skills") | Out-Null
    Set-Content -Path (Join-Path $tmp "hive/skills/pm.md")     -Value ""
    Set-Content -Path (Join-Path $tmp "hive/skills/coder.md")  -Value ""
    Set-Content -Path (Join-Path $tmp "hive/skills/tester.md") -Value ""

    $now    = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $recent = (Get-Date).ToUniversalTime().AddMinutes(-30).ToString("yyyy-MM-ddTHH:mm:ssZ")
    $old    = (Get-Date).ToUniversalTime().AddDays(-2).ToString("yyyy-MM-ddTHH:mm:ssZ")

    @"
$old HV-001 claim testco.alpha
$recent HV-099 in-progress testco.alpha
"@ | Set-Content -Path (Join-Path $tmp "hive/events/testco.alpha.log")

    "$now presence beta online" | Set-Content -Path (Join-Path $tmp "hive/events/testco.beta.log")

    function Invoke-Whoami {
        $prev = Get-Location
        Set-Location $tmp
        try {
            & powershell -NoProfile -File (Join-Path $repoRoot "scripts/whoami.ps1") 2>&1
        } finally {
            Set-Location $prev
        }
    }

    function Assert-Match {
        param([string[]]$Output, [string]$Pattern, [string]$Label)
        if (-not ($Output -match $Pattern)) {
            Write-Error "FAIL: $Label - expected match for '$Pattern' in output:`n$($Output -join `"`n`")"
            exit 1
        }
    }

    # Scenario 1: no role= override - heuristic puts beta at coder (bug).
    "colony=testco`nhandle=beta" | Set-Content -Path (Join-Path $tmp ".bot-hive-identity")
    $out = Invoke-Whoami
    Write-Host "[scenario 1 - no role override]"
    $out | ForEach-Object { Write-Host $_ }
    Assert-Match $out '^role: coder$' "scenario 1: expected role=coder under heuristic"
    Assert-Match $out '^role source: heuristic$' "scenario 1: expected role source=heuristic"
    Write-Host ""

    # Scenario 2: role=pm override.
    "colony=testco`nhandle=beta`nrole=pm" | Set-Content -Path (Join-Path $tmp ".bot-hive-identity")
    $out = Invoke-Whoami
    Write-Host "[scenario 2 - role=pm override]"
    $out | ForEach-Object { Write-Host $_ }
    Assert-Match $out '^role: PM$' "scenario 2: expected role=PM under explicit override"
    Assert-Match $out '^role source: explicit ' "scenario 2: expected role source=explicit"
    Write-Host ""

    # Scenario 3: role=coder override on the older bot.
    "colony=testco`nhandle=alpha`nrole=coder" | Set-Content -Path (Join-Path $tmp ".bot-hive-identity")
    $out = Invoke-Whoami
    Write-Host "[scenario 3 - role=coder override on older bot]"
    $out | ForEach-Object { Write-Host $_ }
    Assert-Match $out '^role: coder$' "scenario 3: expected role=coder under explicit override"
    Write-Host ""

    # Scenario 4: invalid role= - warn + fallback to heuristic.
    "colony=testco`nhandle=beta`nrole=overlord" | Set-Content -Path (Join-Path $tmp ".bot-hive-identity")
    $out = Invoke-Whoami
    Write-Host "[scenario 4 - invalid role= value]"
    $out | ForEach-Object { Write-Host $_ }
    Assert-Match $out "unknown role 'overlord'" "scenario 4: expected warning about unknown role"
    Assert-Match $out '^role: coder$' "scenario 4: expected fallback to heuristic"
    Assert-Match $out '^role source: heuristic$' "scenario 4: expected role source=heuristic after fallback"
    Write-Host ""

    Write-Host "PASS: HV-122 whoami.ps1 role= override behaves correctly across all 4 scenarios."
} finally {
    Remove-Item -Recurse -Force $tmp
}
