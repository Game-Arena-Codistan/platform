[CmdletBinding()]
param(
    [string]$RootPath = "D:\60 Games Bundle by Muscle-SS",
    [string]$PreparedStatePath = "",
    [string]$Repository = "Game-Arena-Codistan/platform",
    [string]$WorkflowRef = "main",
    [string]$ReleaseTag = ("portfolio-ingress-60-" + (Get-Date -Format "yyyyMMdd-HHmmss")),
    [switch]$SkipWorkflowDispatch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ScriptVersion = "1.0.0"

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$ArgumentList
    )

    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($ArgumentList -join ' ')"
    }
}

function Get-Sha256Lower {
    param([Parameter(Mandatory = $true)][string]$LiteralPath)
    $value = [string](Get-FileHash -LiteralPath $LiteralPath -Algorithm SHA256).Hash
    if ([string]::IsNullOrWhiteSpace($value)) { throw "Unable to calculate SHA-256: $LiteralPath" }
    return $value.ToLowerInvariant()
}

function Write-JsonNoBom {
    param(
        [Parameter(Mandatory = $true)]$Value,
        [Parameter(Mandatory = $true)][string]$LiteralPath
    )
    $json = $Value | ConvertTo-Json -Depth 20
    [System.IO.File]::WriteAllText($LiteralPath, $json, [System.Text.UTF8Encoding]::new($false))
}

function New-PortableZip {
    param(
        [Parameter(Mandatory = $true)][string]$SourceDirectory,
        [Parameter(Mandatory = $true)][string]$DestinationZip
    )

    if (Test-Path -LiteralPath $DestinationZip) { Remove-Item -LiteralPath $DestinationZip -Force }
    $sourceRoot = (Resolve-Path -LiteralPath $SourceDirectory).Path.TrimEnd('\', '/')
    $stream = [System.IO.File]::Open($DestinationZip, [System.IO.FileMode]::CreateNew)
    $archive = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create, $false)

    try {
        $files = @(Get-ChildItem -LiteralPath $sourceRoot -Recurse -File | Sort-Object FullName)
        foreach ($file in $files) {
            if ($file.Directory.FullName -eq $sourceRoot -and $file.Name -eq 'game-manifest.json') { continue }
            $relative = $file.FullName.Substring($sourceRoot.Length).TrimStart('\', '/')
            $entryName = $relative.Replace('\', '/')
            if ([string]::IsNullOrWhiteSpace($entryName) -or $entryName.StartsWith('/') -or $entryName.Contains('\') -or $entryName.Split('/') -contains '..') {
                throw "Unsafe ZIP entry generated: $entryName"
            }

            $entry = $archive.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
            $input = [System.IO.File]::OpenRead($file.FullName)
            $output = $entry.Open()
            try { $input.CopyTo($output) }
            finally { $output.Dispose(); $input.Dispose() }
        }
    }
    finally {
        $archive.Dispose()
        $stream.Dispose()
    }

    $entries = @(& "$env:WINDIR\System32\tar.exe" -tf $DestinationZip)
    if ($LASTEXITCODE -ne 0) { throw "Unable to validate generated ZIP: $DestinationZip" }
    $bad = @($entries | Where-Object { $_ -match '\\' -or $_ -match '(^|/)\.\.(/|$)' })
    if ($bad.Count -gt 0) { throw "Generated ZIP contains unsafe paths: $($bad -join ', ')" }
}

function Convert-ToInputManifest {
    param([Parameter(Mandatory = $true)]$ReleaseManifest)

    $manifest = [ordered]@{
        schemaVersion = 1
        slug = [string]$ReleaseManifest.slug
        title = [string]$ReleaseManifest.title
        version = [string]$ReleaseManifest.version
        genres = @($ReleaseManifest.genres)
        orientation = [string]$ReleaseManifest.orientation
        tier = [string]$ReleaseManifest.tier
        inputModes = @($ReleaseManifest.inputModes)
        entryFile = [string]$ReleaseManifest.entryFile
        assets = @($ReleaseManifest.assets)
        permissions = $ReleaseManifest.permissions
        bridgeVersion = '1.0'
        minDeviceTier = [string]$ReleaseManifest.minDeviceTier
        rolloutPercentage = 0
        description = [string]$ReleaseManifest.description
    }
    return $manifest
}

if ([string]::IsNullOrWhiteSpace($PreparedStatePath)) {
    $candidate = Get-ChildItem -LiteralPath $RootPath -Directory -Filter '_game-arena-prepare-*' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($null -eq $candidate) { throw 'Unable to locate a prepared migration state. Pass -PreparedStatePath explicitly.' }
    $PreparedStatePath = $candidate.FullName
}

$preparedGamesRoot = Join-Path $PreparedStatePath 'prepared-artifacts\games'
if (-not (Test-Path -LiteralPath $preparedGamesRoot -PathType Container)) { throw "Prepared games directory not found: $preparedGamesRoot" }

$ghCommand = Get-Command gh.exe -ErrorAction SilentlyContinue
if ($null -eq $ghCommand) { $ghCommand = Get-Command gh -ErrorAction SilentlyContinue }
if ($null -eq $ghCommand) { throw 'GitHub CLI (gh) is required. Install it and run gh auth login.' }
$ghPath = [string]$ghCommand.Definition
Invoke-Checked $ghPath @('auth', 'status')

$work = Join-Path $env:TEMP $ReleaseTag
New-Item -ItemType Directory -Path $work -Force | Out-Null

try {
    Write-Host "Game Arena 60-game bundle publisher $ScriptVersion" -ForegroundColor Cyan
    Write-Host "Prepared state: $PreparedStatePath"

    $registryGames = @()
    $preparedVersionDirs = @(
        Get-ChildItem -LiteralPath $preparedGamesRoot -Directory |
            ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Directory } |
            Sort-Object FullName
    )

    if ($preparedVersionDirs.Count -ne 56) {
        throw "Expected exactly 56 prepared normal games; found $($preparedVersionDirs.Count)."
    }

    foreach ($versionDir in $preparedVersionDirs) {
        $releaseManifestPath = Join-Path $versionDir.FullName 'game-manifest.json'
        if (-not (Test-Path -LiteralPath $releaseManifestPath -PathType Leaf)) { throw "Missing prepared manifest: $releaseManifestPath" }
        $releaseManifest = Get-Content -LiteralPath $releaseManifestPath -Raw | ConvertFrom-Json
        $slug = [string]$releaseManifest.slug
        if ([string]::IsNullOrWhiteSpace($slug)) { throw "Prepared manifest has no slug: $releaseManifestPath" }

        Write-Host "Packaging $slug..." -ForegroundColor Cyan
        $assetName = "$slug.zip"
        $assetPath = Join-Path $work $assetName
        New-PortableZip -SourceDirectory $versionDir.FullName -DestinationZip $assetPath

        $assetInfo = Get-Item -LiteralPath $assetPath
        if ([int64]$assetInfo.Length -gt 134217728) { throw "Prepared asset exceeds protected 128 MiB bundle limit: $slug" }
        $assetHash = Get-Sha256Lower -LiteralPath $assetPath
        $registryGames += [pscustomobject][ordered]@{
            slug = $slug
            title = [string]$releaseManifest.title
            assetName = $assetName
            compressedBytes = [int64]$assetInfo.Length
            sha256 = $assetHash
            manifest = (Convert-ToInputManifest -ReleaseManifest $releaseManifest)
        }
    }

    $oversized = @(
        [ordered]@{
            slug='duck-hunter'; title='Duck Hunter'; assetName='duck-hunter.zip'; source='Modified (No - Links, MoreGames Button, Share Buttons)\01.Duck Hunter\Duck Hunter.zip'; bytes=31974209; sha256='33864d4654a9c7e96f1d073159b9fbcbc8df5f81c167530eca4575dfb08638c5';
            manifest=[ordered]@{schemaVersion=1;slug='duck-hunter';title='Duck Hunter';version='1.0.0-pilot.1';genres=@('arcade');orientation='any';tier='free';inputModes=@('touch','mouse');entryFile='index.html';bridgeVersion='1.0';minDeviceTier='standard';rolloutPercentage=0;description='Oversized-build migration pilot. Production activation disabled pending qualification.'}
        },
        [ordered]@{
            slug='ranger-vs-zombies'; title='Ranger vs Zombies'; assetName='ranger-vs-zombies.zip'; source='Modified (No - Links, MoreGames Button, Share Buttons)\13.Ranger vs Zombies\Ranger vs Zombies.zip'; bytes=29933802; sha256='b9b62c7835030049affe3b0989a2bce8bcca518e58d3b5436b7c24f93d3aeb1e';
            manifest=[ordered]@{schemaVersion=1;slug='ranger-vs-zombies';title='Ranger vs Zombies';version='1.0.0-pilot.1';genres=@('action');orientation='any';tier='free';inputModes=@('touch','mouse');entryFile='index.html';bridgeVersion='1.0';minDeviceTier='standard';rolloutPercentage=0;description='Oversized-build migration pilot. Production activation disabled pending qualification.'}
        },
        [ordered]@{
            slug='robotex'; title='Robotex'; assetName='robotex.zip'; source='Modified (No - Links, MoreGames Button, Share Buttons)\54.Robotex\ROBOTEX.zip'; bytes=40401437; sha256='4bc0f1cb49db2c22ece93acd3e8c563cceb9d267c10ea0efa7a488e365904bf7';
            manifest=[ordered]@{schemaVersion=1;slug='robotex';title='Robotex';version='1.0.0-pilot.1';genres=@('arcade');orientation='any';tier='free';inputModes=@('touch','mouse');entryFile='index.html';bridgeVersion='1.0';minDeviceTier='standard';rolloutPercentage=0;description='Oversized-build migration pilot. Production activation disabled pending qualification.'}
        },
        [ordered]@{
            slug='swat-vs-zombies'; title='Swat vs Zombies'; assetName='swat-vs-zombies.zip'; source='Modified (No - Links, MoreGames Button, Share Buttons)\02.Swat vs Zombies\SWAT VS ZOMBIES.zip'; bytes=86495953; sha256='e81b265da331ebe0ff0a2047200eebc2e1a20044e2d841f9a5ea42ba0b9fb129';
            manifest=[ordered]@{schemaVersion=1;slug='swat-vs-zombies';title='Swat vs Zombies';version='1.0.0-pilot.1';genres=@('action');orientation='any';tier='free';inputModes=@('touch','mouse');entryFile='index.html';bridgeVersion='1.0';minDeviceTier='high';rolloutPercentage=0;description='Oversized-build migration pilot. Production activation disabled pending qualification.'}
        }
    )

    foreach ($game in $oversized) {
        $sourcePath = Join-Path $RootPath ([string]$game.source)
        if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { throw "Missing oversized game ZIP: $sourcePath" }
        $sourceInfo = Get-Item -LiteralPath $sourcePath
        $sourceHash = Get-Sha256Lower -LiteralPath $sourcePath
        if ([int64]$sourceInfo.Length -ne [int64]$game.bytes) { throw "$($game.title) size mismatch." }
        if ($sourceHash -ne [string]$game.sha256) { throw "$($game.title) SHA-256 mismatch." }
        Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $work ([string]$game.assetName)) -Force
        $registryGames += [pscustomobject][ordered]@{
            slug = [string]$game.slug
            title = [string]$game.title
            assetName = [string]$game.assetName
            compressedBytes = [int64]$game.bytes
            sha256 = [string]$game.sha256
            manifest = $game.manifest
        }
    }

    if ($registryGames.Count -ne 60) { throw "Expected 60 registry games; found $($registryGames.Count)." }
    $duplicateSlugs = @($registryGames | Group-Object slug | Where-Object Count -gt 1)
    if ($duplicateSlugs.Count -gt 0) { throw "Duplicate slugs in bundle: $($duplicateSlugs.Name -join ', ')" }

    $registryPath = Join-Path $work 'bundle-registry.json'
    Write-JsonNoBom -Value ([ordered]@{
        schemaVersion = 1
        createdAt = [DateTime]::UtcNow.ToString('o')
        productionActivation = $false
        games = @($registryGames | Sort-Object slug)
    }) -LiteralPath $registryPath

    $draft = & $ghPath release view $ReleaseTag --repo $Repository --json isDraft --jq '.isDraft' 2>$null
    $probeExit = $LASTEXITCODE
    if ($probeExit -ne 0) {
        Invoke-Checked $ghPath @('release','create',$ReleaseTag,'--repo',$Repository,'--draft','--title','Game Arena 60-game staging ingress','--notes','Private 60-game staging ingress for issue #74. Binaries remain outside Git; rollout is 0 and production activation is disabled.')
    }
    elseif (([string]$draft).Trim() -ne 'true') {
        throw "Existing release must remain draft/private: $ReleaseTag"
    }
    else {
        Write-Host "Resuming existing draft release: $ReleaseTag" -ForegroundColor Yellow
    }

    $uploadFiles = @(Get-ChildItem -LiteralPath $work -File | Sort-Object Name)
    foreach ($asset in $uploadFiles) {
        Write-Host "Uploading $($asset.Name)..." -ForegroundColor Cyan
        Invoke-Checked $ghPath @('release','upload',$ReleaseTag,$asset.FullName,'--repo',$Repository,'--clobber')
    }

    Write-Host "Uploaded 60 game ZIPs plus bundle-registry.json to private draft release $ReleaseTag." -ForegroundColor Green
    Write-Host "https://github.com/$Repository/releases/tag/$ReleaseTag"

    if (-not $SkipWorkflowDispatch) {
        Invoke-Checked $ghPath @('workflow','run','game-content-portfolio-bundle.yml','--repo',$Repository,'--ref',$WorkflowRef,'-f',"release_tag=$ReleaseTag",'-f','publish_to_staging=true')
        Write-Host "Protected staging workflow dispatched on ref $WorkflowRef." -ForegroundColor Green
    }
}
finally {
    if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
}
