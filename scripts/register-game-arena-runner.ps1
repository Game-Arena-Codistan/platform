[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path $_ -PathType Leaf })]
    [string]$RunnerArchive,

    [string]$InstallDirectory = 'C:\actions-runner\game-arena-ci-01',
    [string]$OrganizationUrl = 'https://github.com/Game-Arena-Codistan',
    [string]$RunnerName = 'game-arena-ci-01',
    [string]$WorkDirectory = '_work'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Run this script from Administrator PowerShell.'
    }
}

function Assert-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command is missing: $Name"
    }
}

Assert-Administrator
foreach ($command in @('git', 'node', 'npm', 'docker', 'tofu', 'bash', 'jq', 'curl')) {
    Assert-Command $command
}

$nodeMajor = (& node -p "process.versions.node.split('.')[0]").Trim()
if ($nodeMajor -ne '22') { throw "Node.js 22 is required; found $(& node --version)." }
& docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop Linux-container engine is not running.' }
$tofuVersion = ((& tofu version -json | ConvertFrom-Json).terraform_version)
if ($tofuVersion -ne '1.12.5') { throw "OpenTofu 1.12.5 is required; found $tofuVersion." }

if (Test-Path $InstallDirectory) {
    $existing = Get-ChildItem $InstallDirectory -Force -ErrorAction SilentlyContinue
    if ($existing.Count -gt 0) { throw "Install directory is not empty: $InstallDirectory" }
} else {
    New-Item -ItemType Directory -Path $InstallDirectory -Force | Out-Null
}

if ($PSCmdlet.ShouldProcess($InstallDirectory, 'Extract the official GitHub Actions runner archive')) {
    Expand-Archive -Path (Resolve-Path $RunnerArchive) -DestinationPath $InstallDirectory -Force
}

$config = Join-Path $InstallDirectory 'config.cmd'
if (-not (Test-Path $config -PathType Leaf)) {
    throw 'The archive does not contain config.cmd. Download the Windows x64 runner archive from the organization runner page.'
}

$secureToken = Read-Host 'Paste the temporary GitHub runner registration token' -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
    if ([string]::IsNullOrWhiteSpace($token)) { throw 'Registration token is empty.' }
    Push-Location $InstallDirectory
    try {
        & .\config.cmd --unattended `
            --url $OrganizationUrl `
            --token $token `
            --name $RunnerName `
            --labels 'game-arena-ci' `
            --work $WorkDirectory `
            --runasservice `
            --replace
        if ($LASTEXITCODE -ne 0) { throw "Runner registration failed with exit code $LASTEXITCODE." }
    } finally {
        Pop-Location
    }
} finally {
    if ($tokenPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    }
    Remove-Variable token -ErrorAction SilentlyContinue
    Remove-Variable secureToken -ErrorAction SilentlyContinue
}

$service = Get-Service | Where-Object { $_.Name -like 'actions.runner.Game-Arena-Codistan*' -and $_.DisplayName -like "*$RunnerName*" } | Select-Object -First 1
if (-not $service) { throw 'Runner service was not found after registration.' }
Set-Service -Name $service.Name -StartupType Automatic
Start-Service -Name $service.Name
$service.WaitForStatus('Running', [TimeSpan]::FromSeconds(30))

Write-Host "Runner registered as $RunnerName and service $($service.Name) is running."
Write-Host 'Restrict the organization runner group to private Game Arena repositories, then enable SELF_HOSTED_CI_ENABLED and dispatch Runner Smoke.'
