# Controlled game and artwork import

Game Arena does not publish a submitted URL directly into the controlled origin. Every build moves through a reviewable supply chain:

1. Read the real rich hyperlink from the Zip URL cell using a read-only Google service account.
2. Allow only public HTTPS sources and normalize supported Google Drive download links.
3. Limit redirects, compressed bytes and ZIP entry count.
4. Reject path traversal, symlinks, server-side executables, hidden server files, source-control directories and dependency trees.
5. Require `index.html` at the archive root or inside one top-level directory.
6. Run the existing static scanner and immutable package builder.
7. Hash the source archive and every extracted file.
8. Mirror validated artwork into the controlled origin and reject active SVG content.
9. Create audit reports and a pull request for human rights/runtime approval.
10. Publish only after the pull request and staging qualification are approved.

## One-game pilot

Run **Actions → Import game content** with:

- mode: `single`
- zip URL: one HTTPS or Google Drive archive
- manifest JSON: a valid game manifest with version `auto`
- dry run: `true`

After the dry run succeeds, rerun with dry run disabled. The workflow creates a content branch and review pull request; it never merges or publishes automatically.

## Spreadsheet import

Share the source workbook with a dedicated read-only Google service-account email. Store the service-account JSON as the repository secret `GOOGLE_SERVICE_ACCOUNT_JSON_B64`. Spreadsheet mode reads rich hyperlink metadata, so links displayed as `Link` remain recoverable.

Use a slug filter and limit `1` for the first pilot. Increase the limit only after the first build passes scanner, gameplay, mobile, rights and Game Bridge review.
