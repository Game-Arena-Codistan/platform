[CmdletBinding()]
param(
    [string]$RootPath = "D:\60 Games Bundle by Muscle-SS",
    [string]$Repository = "Game-Arena-Codistan/platform",
    [string]$WorkflowRef = "main",
    [string]$ReleaseTag = ("pilot-ingress-" + (Get-Date -Format "yyyyMMdd-HHmmss")),
    [switch]$SkipSourceSnapshots,
    [switch]$SkipWorkflowDispatch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-Checked {
    param([string]$FilePath,[string[]]$ArgumentList)
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($ArgumentList -join ' ')" }
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw "GitHub CLI (gh) is required. Install it, then run: gh auth login" }
Invoke-Checked gh @("auth","status")

$games = @(
    [ordered]@{ slug="duck-hunter"; title="Duck Hunter"; deploy="Modified (No - Links, MoreGames Button, Share Buttons)\01.Duck Hunter\Duck Hunter.zip"; original="Original\01.Duck Hunter"; modified="Modified (No - Links, MoreGames Button, Share Buttons)\01.Duck Hunter"; bytes=31974209; sha256="33864d4654a9c7e96f1d073159b9fbcbc8df5f81c167530eca4575dfb08638c5" },
    [ordered]@{ slug="ranger-vs-zombies"; title="Ranger vs Zombies"; deploy="Modified (No - Links, MoreGames Button, Share Buttons)\13.Ranger vs Zombies\Ranger vs Zombies.zip"; original="Original\13.Ranger vs Zombies"; modified="Modified (No - Links, MoreGames Button, Share Buttons)\13.Ranger vs Zombies"; bytes=29933802; sha256="b9b62c7835030049affe3b0989a2bce8bcca518e58d3b5436b7c24f93d3aeb1e" },
    [ordered]@{ slug="robotex"; title="Robotex"; deploy="Modified (No - Links, MoreGames Button, Share Buttons)\54.Robotex\ROBOTEX.zip"; original="Original\54.Robotex"; modified="Modified (No - Links, MoreGames Button, Share Buttons)\54.Robotex"; bytes=40401437; sha256="4bc0f1cb49db2c22ece93acd3e8c563cceb9d267c10ea0efa7a488e365904bf7" },
    [ordered]@{ slug="swat-vs-zombies"; title="Swat vs Zombies"; deploy="Modified (No - Links, MoreGames Button, Share Buttons)\02.Swat vs Zombies\SWAT VS ZOMBIES.zip"; original="Original\02.Swat vs Zombies"; modified="Modified (No - Links, MoreGames Button, Share Buttons)\02.Swat vs Zombies"; bytes=86495953; sha256="e81b265da331ebe0ff0a2047200eebc2e1a20044e2d841f9a5ea42ba0b9fb129" }
)

$work = Join-Path $env:TEMP $ReleaseTag
New-Item -ItemType Directory -Path $work -Force | Out-Null
$assets = [System.Collections.Generic.List[object]]::new()

try {
    foreach ($game in $games) {
        $source = Join-Path $RootPath $game.deploy
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing deployable ZIP: $source" }
        $info = Get-Item -LiteralPath $source
        $hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($info.Length -ne $game.bytes) { throw "$($game.title) size mismatch. Expected $($game.bytes), found $($info.Length)." }
        if ($hash -ne $game.sha256) { throw "$($game.title) SHA-256 mismatch. Expected $($game.sha256), found $hash." }
        $normalized = Join-Path $work ($game.slug + ".zip")
        Copy-Item -LiteralPath $source -Destination $normalized -Force
        $assets.Add([ordered]@{name=(Split-Path $normalized -Leaf);kind="deployable-html5";slug=$game.slug;bytes=$info.Length;sha256=$hash})

        if (-not $SkipSourceSnapshots) {
            foreach ($kind in @("original","modified")) {
                $folder = Join-Path $RootPath $game[$kind]
                if (-not (Test-Path -LiteralPath $folder -PathType Container)) { throw "Missing $kind source folder: $folder" }
                $archive = Join-Path $work ("{0}-{1}-source.zip" -f $game.slug,$kind)
                Invoke-Checked "$env:WINDIR\System32\tar.exe" @("-a","-c","-f",$archive,"-C",(Split-Path $folder -Parent),(Split-Path $folder -Leaf))
                $archiveInfo = Get-Item -LiteralPath $archive
                $archiveHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
                if ($archiveInfo.Length -ge 2GB) { throw "GitHub release asset exceeds 2 GiB: $archive" }
                $assets.Add([ordered]@{name=(Split-Path $archive -Leaf);kind=("{0}-source" -f $kind);slug=$game.slug;bytes=$archiveInfo.Length;sha256=$archiveHash})
            }
        }
    }

    $manifestPath = Join-Path $work "pilot-upload-manifest.json"
    [ordered]@{schemaVersion=1;releaseTag=$ReleaseTag;createdAt=(Get-Date).ToUniversalTime().ToString("o");productionActivation=$false;assets=$assets} |
        ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

    $isDraft = & gh release view $ReleaseTag --repo $Repository --json isDraft --jq .isDraft 2>$null
    if ($LASTEXITCODE -ne 0) {
        Invoke-Checked gh @("release","create",$ReleaseTag,"--repo",$Repository,"--draft","--title","Game Arena four-game pilot ingress","--notes","Private immutable ingress and source snapshots for issue #79. Production activation is disabled.")
    } elseif ($isDraft -ne "true") {
        throw "Existing release must remain draft/private: $ReleaseTag"
    } else {
        Write-Host "Resuming existing draft release: $ReleaseTag" -ForegroundColor Yellow
    }
    foreach ($asset in Get-ChildItem -LiteralPath $work -File | Sort-Object Name) {
        Invoke-Checked gh @("release","upload",$ReleaseTag,$asset.FullName,"--repo",$Repository,"--clobber")
    }

    Write-Host "Release created and uploaded: $ReleaseTag" -ForegroundColor Green
    Write-Host "https://github.com/$Repository/releases/tag/$ReleaseTag"

    if (-not $SkipWorkflowDispatch) {
        Invoke-Checked gh @("workflow","run","game-content-oversize-pilot.yml","--repo",$Repository,"--ref",$WorkflowRef,"-f","release_tag=$ReleaseTag","-f","publish_to_staging=true")
        Write-Host "Staging workflow dispatched on ref $WorkflowRef." -ForegroundColor Green
    }
}
finally {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
