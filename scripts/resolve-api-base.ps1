param(
    [string]$CwdPath,
    [string]$PersistedApiBasePath = '',
    [string]$DevLogPath = '',
    [string]$EnvApiBase = '',
    [string]$DefaultApiBase = 'https://bot-hive-j0ax.onrender.com'
)

$ErrorActionPreference = 'Stop'

if (-not $CwdPath) {
    $CwdPath = (Get-Location).Path
}
if (-not $PersistedApiBasePath) {
    $PersistedApiBasePath = Join-Path $CwdPath '.bot-hive-api-url'
}
if (-not $DevLogPath) {
    $DevLogPath = Join-Path $CwdPath '.bot-hive-dev.log'
}
if (-not $EnvApiBase) {
    $EnvApiBase = $env:BOT_HIVE_API_URL
}

. (Join-Path $PSScriptRoot 'lib/api-base.ps1')

$result = Resolve-BotHiveApiBase `
    -PersistedApiBasePath $PersistedApiBasePath `
    -DevLogPath $DevLogPath `
    -EnvApiBase $EnvApiBase `
    -DefaultApiBase $DefaultApiBase

$result | ConvertTo-Json -Compress
