$env:BOT_HIVE_API_URL = "http://localhost:3000"
Set-Location (Split-Path $MyInvocation.MyCommand.Path -Parent | Split-Path -Parent)
& "$PSScriptRoot\stream.ps1"
