# Game portfolio status

The project has multiple game counts that describe different stages of the same portfolio. They must not be treated as interchangeable.

## Current counts

| Scope | Count | Meaning |
|---|---:|---|
| Submitted catalogue rows | 61 | Rows imported from the supplied Google Sheet in PR #35. |
| QA-passed external catalogue entries | 44 | HTTPS games currently retained after URL/safety QA. |
| Quarantined submitted rows | 17 | Unsafe, incomplete or otherwise blocked rows that were not published. |
| Current Vercel preview cards | 45 | The 44 external catalogue entries plus the same-origin Arena Dash preview game. |
| Oversized private-ingress pilots | 4 | Duck Hunter, Ranger vs Zombies, Robotex and Swat vs Zombies; these are the first AWS controlled-origin publication pilots only. |
| Planned local migration | 140 | Broader one-time source inventory, backup, normalization and certification program tracked separately. |

The local source folder may be referred to operationally as the “60 Games Bundle,” but the imported sheet contained 61 submitted rows. The repository therefore uses evidence-based counts rather than the folder label.

## Staging interpretation

The first manual AWS backend deployment does not need to publish only four games forever. The correct sequence is:

1. deploy and qualify the normalized PostgreSQL-backed platform;
2. connect the staging frontend to the live staging API;
3. retain the existing 44 external catalogue records for compatibility testing where their hosts remain usable;
4. publish the four oversized pilots through the new private ingress and controlled-origin pipeline one at a time;
5. repair or replace the 17 quarantined submitted rows where source, rights and technical evidence permit;
6. migrate and certify the broader local portfolio in controlled batches.

The four pilot titles remain paused at rollout `0` until their immutable AWS builds and manual qualification evidence exist. They are not the total Game Arena catalogue.

## Production boundary

A title being visible in the preview catalogue does not make it production-certified. Production activation still requires an immutable controlled-origin build, rights disposition, scanner/runtime qualification, rollback evidence and an approved rollout decision.
