# Game portfolio status

The project has multiple game counts that describe different stages of the same portfolio. They must not be treated as interchangeable.

## Current counts

| Scope | Count | Meaning |
|---|---:|---|
| Submitted catalogue rows | 61 | Rows imported from the supplied Google Sheet in PR #35. |
| QA-passed external source entries | 44 | HTTPS source entries retained after the original URL/safety QA. |
| Active external catalogue entries | 42 | Public external entries after Ranger vs Zombies and Robotex were reclassified into the controlled pilot lane. |
| Controlled runtime catalogue records | 46 | Forty-two active external records plus four private paused pilot records. |
| Quarantined submitted rows | 17 | Unsafe, incomplete or otherwise blocked source rows that were not published as external entries. Quarantine evidence is retained even when a separately supplied pilot build exists. |
| Current Vercel preview cards | 43 | The 42 active external entries plus the same-origin Arena Dash preview game. Controlled pilots are deliberately hidden. |
| Oversized private-ingress pilots | 4 | Duck Hunter, Ranger vs Zombies, Robotex and Swat vs Zombies; these are the first AWS controlled-origin publication pilots only. |
| Planned local migration | 140 | Broader one-time source inventory, backup, normalization and certification program tracked separately. |

The local source folder may be referred to operationally as the “60 Games Bundle,” but the imported sheet contained 61 submitted rows. The repository therefore uses evidence-based counts rather than the folder label.

## Staging interpretation

The first manual AWS backend deployment does not need to publish only four games forever. The correct sequence is:

1. deploy and qualify the normalized PostgreSQL-backed platform;
2. connect the staging frontend to the live staging API;
3. retain the 42 active external catalogue records for compatibility testing where their hosts remain usable;
4. publish the four oversized pilots through the private ingress and controlled-origin pipeline one at a time;
5. repair or replace the 17 quarantined submitted rows where source, rights and technical evidence permit;
6. migrate and certify the broader local portfolio in controlled batches.

The four pilot titles remain private, paused at rollout `0`, reward-disabled and competition-disabled until their immutable AWS builds and manual qualification evidence exist. Ranger vs Zombies and Robotex are not exposed through their former external catalogue entries while they are in the pilot lane. The four pilots are not the total Game Arena catalogue.

## Production boundary

A title being visible in the preview catalogue does not make it production-certified. Production activation still requires an immutable controlled-origin build, rights disposition, scanner/runtime qualification, rollback evidence and an approved rollout decision.
