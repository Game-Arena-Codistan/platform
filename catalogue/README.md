# Game catalogue import

Source: Google Sheet `19DD1Bby9Zm0A4WZ6MZGXrOyW-8lzPfajbIPKGGFKVJ0`.

The import combines the submission tab, the `Games QA` tab, and the updated artwork tab.

- `live`: QA passed and a usable HTTPS game URL is present.
- `quarantined`: not working, unavailable, duplicate, wrong build, missing URL, insecure URL, or title/URL mismatch.
- Quarantined rows remain in the API catalogue modules for audit but are never returned by the public catalogue endpoint.
- Direct third-party game URLs are allow-listed and loaded only in sandboxed iframes.
- A later ingestion phase should copy approved builds to the dedicated Game Arena game origin and add integrity/version metadata.
