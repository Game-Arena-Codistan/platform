# Game catalogue import

The Google Sheet supplied on 2026-07-30 contains 61 game submissions. The import combines the submission, QA, and updated artwork tabs.

## Result

- 44 games are eligible for the platform catalogue.
- 17 submissions are quarantined.
- 17 live games are in the Free catalogue.
- 27 live games require Game Arena+.

Quarantine reasons include QA failure, unavailable builds, duplicate rows, wrong uploaded builds, missing or insecure game URLs, and title/URL mismatches. The machine-readable audit is in `catalogue/import-summary.json`.

## Runtime policy

Validated games currently load from `https://games.codistan.org` in sandboxed iframes. The frontend allow-lists that host and the Game Bridge verifies message origin. Direct URLs are an interim integration; production ingestion should copy approved versioned builds to a dedicated Game Arena origin, run static and behavioral checks, and retain a kill switch.

## Source handling

The source spreadsheet remains read-only. No rows were changed. Missing values were not silently invented. Updated artwork values were used only when the artwork tab explicitly supplied them.
