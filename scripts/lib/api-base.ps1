function Normalize-ApiBase {
    param([string]$Base)
    if (-not $Base) { return $null }
    $trimmed = $Base.Trim()
    if (-not $trimmed) { return $null }
    return $trimmed.TrimEnd('/')
}

function Read-DevLogApiBases {
    param([string]$Path)
    $result = [ordered]@{ Local = $null; Network = $null }
    if (-not (Test-Path $Path)) { return $result }
    try {
        $text = Get-Content $Path -Raw -ErrorAction Stop
        $localMatches = [regex]::Matches($text, 'Local:\s+(http://localhost:\d+)')
        if ($localMatches.Count -gt 0) {
            $result.Local = Normalize-ApiBase $localMatches[$localMatches.Count - 1].Groups[1].Value
        }
        $networkMatches = [regex]::Matches($text, 'Network:\s+(http://\S+)')
        if ($networkMatches.Count -gt 0) {
            $result.Network = Normalize-ApiBase $networkMatches[$networkMatches.Count - 1].Groups[1].Value
        }
    } catch { }
    return $result
}

function Test-ApiBaseReachable {
    param([string]$Base)
    $normalized = Normalize-ApiBase $Base
    if (-not $normalized) { return $false }
    try {
        Add-Type -AssemblyName System.Net.Http -ErrorAction Stop | Out-Null
        $probeClient = New-Object System.Net.Http.HttpClient
        $probeClient.Timeout = [TimeSpan]::FromSeconds(2)
        $resp = $probeClient.GetAsync("$normalized/").GetAwaiter().GetResult()
        return $resp.IsSuccessStatusCode
    } catch {
        return $false
    } finally {
        if ($probeClient) { $probeClient.Dispose() }
    }
}

function Resolve-BotHiveApiBase {
    param(
        [string]$PersistedApiBasePath,
        [string]$DevLogPath,
        [string]$EnvApiBase,
        [string]$DefaultApiBase = 'https://bot-hive-j0ax.onrender.com'
    )

    $devLogApiBases = Read-DevLogApiBases -Path $DevLogPath
    $persistedApiBase = $null
    if ($PersistedApiBasePath -and (Test-Path $PersistedApiBasePath)) {
        try {
            $persistedApiBase = Normalize-ApiBase (Get-Content $PersistedApiBasePath -Raw -ErrorAction Stop)
        } catch {
            $persistedApiBase = $null
        }
    }

    $envBase = Normalize-ApiBase $EnvApiBase
    if ($envBase) {
        return [pscustomobject]@{
            ApiBase = $envBase
            Source = 'env'
            Reachable = $true
            ReachabilityChecked = $false
            CandidatesTried = @('env')
        }
    }

    $candidates = New-Object System.Collections.Generic.List[object]
    $seen = New-Object System.Collections.Generic.HashSet[string]([System.StringComparer]::OrdinalIgnoreCase)

    function Add-Candidate {
        param([string]$Base, [string]$Source)
        $normalized = Normalize-ApiBase $Base
        if (-not $normalized) { return }
        if ($seen.Add($normalized)) {
            $candidates.Add([pscustomobject]@{ ApiBase = $normalized; Source = $Source }) | Out-Null
        }
    }

    Add-Candidate -Base $devLogApiBases.Local -Source 'dev-log-local'
    Add-Candidate -Base $persistedApiBase -Source 'persisted'
    Add-Candidate -Base $devLogApiBases.Network -Source 'dev-log-network'
    Add-Candidate -Base $DefaultApiBase -Source 'default'

    $tried = New-Object System.Collections.Generic.List[string]
    foreach ($candidate in $candidates) {
        $tried.Add("$($candidate.Source)=$($candidate.ApiBase)") | Out-Null
        if (Test-ApiBaseReachable -Base $candidate.ApiBase) {
            return [pscustomobject]@{
                ApiBase = $candidate.ApiBase
                Source = $candidate.Source
                Reachable = $true
                ReachabilityChecked = $true
                CandidatesTried = @($tried)
            }
        }
    }

    if ($candidates.Count -gt 0) {
        $fallback = $candidates[0]
        return [pscustomobject]@{
            ApiBase = $fallback.ApiBase
            Source = $fallback.Source
            Reachable = $false
            ReachabilityChecked = $true
            CandidatesTried = @($tried)
        }
    }

    $normalizedDefault = Normalize-ApiBase $DefaultApiBase
    return [pscustomobject]@{
        ApiBase = $normalizedDefault
        Source = 'default'
        Reachable = $false
        ReachabilityChecked = $false
        CandidatesTried = @('default')
    }
}
