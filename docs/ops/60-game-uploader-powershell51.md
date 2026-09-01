# 60-game uploader: Windows PowerShell 5.1 release probe

The 60-game portfolio uploader must treat `gh release view` returning `release not found` as the expected create-new-release branch, including under Windows PowerShell 5.1 where native stderr can be promoted to a PowerShell error when `$ErrorActionPreference = 'Stop'`.

The uploader therefore temporarily uses `ErrorActionPreference = Continue` only around the read-only release probe, captures `$LASTEXITCODE`, restores the prior preference immediately, and keeps all mutating `gh` calls behind `Invoke-Checked`.

This preserves fail-closed behavior for upload/create/dispatch while allowing a missing draft release to be created normally.

Tracks #74.
