# Windows PowerShell 5.1 local release-probe fix

Observed on 2026-09-01 while running the 60-game bundle uploader: the first `gh release view` for a new tag prints `release not found` to stderr. Under Windows PowerShell 5.1 with `$ErrorActionPreference = 'Stop'`, that stderr can terminate the script before `$LASTEXITCODE` is evaluated.

The local safe fix is to temporarily set `$ErrorActionPreference = 'Continue'` only around the read-only `gh release view` probe, capture `$LASTEXITCODE`, then restore the previous preference. Create/upload/dispatch remain fail-closed through `Invoke-Checked`.

Tracks #74.
