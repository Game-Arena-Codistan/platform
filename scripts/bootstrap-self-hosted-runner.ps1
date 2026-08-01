#Requires -Version 5.1
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$requiredCommands = @('git', 'node', 'npm', 'docker', 'bash', 'tofu', 'jq', 'curl')
$missing = @()

foreach ($command in $requiredCommands) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        $missing += $command
    }
}

if ($missing.Count -gt 0) {
    throw "Missing required commands: $($missing -join ', ')"
}

$nodeMajor = (& node -p "process.versions.node.split('.')[0]").Trim()
if ($nodeMajor -ne '22') {
    throw "Node.js major 22 is required. Found: $(& node --version)"
}

& docker info *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'Docker Desktop is not running or Linux containers are unavailable.'
}

& docker compose version *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'Docker Compose v2 is required.'
}

$tofuJson = & tofu version -json | ConvertFrom-Json
if ($tofuJson.terraform_version -ne '1.12.5') {
    throw "OpenTofu 1.12.5 is required. Found: $($tofuJson.terraform_version)"
}

$drive = Get-PSDrive -Name ([System.IO.Path]::GetPathRoot((Get-Location).Path).TrimEnd(':\'))
if ($drive.Free -lt 10GB) {
    throw 'At least 10 GiB of free disk space is required.'
}

Write-Host 'Windows runner prerequisites passed.' -ForegroundColor Green
Write-Host "Node:      $(& node --version)"
Write-Host "Docker:    $(& docker --version)"
Write-Host "Compose:   $(& docker compose version --short)"
Write-Host "OpenTofu:  $($tofuJson.terraform_version)"
Write-Host ''
Write-Host 'Register the runner from:' -ForegroundColor Cyan
Write-Host 'https://github.com/organizations/Game-Arena-Codistan/settings/actions/runners/new'
Write-Host ''
Write-Host 'Choose Windows and x64.'
Write-Host 'Runner name: game-arena-ci-01'
Write-Host 'Custom label: game-arena-ci'
Write-Host 'Work folder: _work'
Write-Host ''
Write-Host 'Do not copy the temporary registration token into chat or GitHub issues.' -ForegroundColor Yellow
