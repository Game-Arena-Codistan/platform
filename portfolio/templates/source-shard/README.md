# Game Arena source shard

This private repository stores reviewable source and non-sensitive metadata for a bounded set of games that share an engine or source format.

## Boundaries

- Maximum 50 titles per shard unless a reviewed exception lowers the count.
- Maximum target Git size: 2 GiB before creating the next shard.
- Complete original/modified archives belong in the encrypted S3 source vault, not Git.
- Generated exports, dependency trees, mobile binaries, signing material and large archives are excluded.
- Each title lives under `games/<slug>/` and has `game-source.json` conforming to the platform source-manifest schema.
- Repository metadata may reference rights records but must never contain signed agreements, credentials, customer data or private keys.

## Layout

```text
games/<slug>/
  game-source.json
  README.md
  src/                 # reviewable source only
  docs/                # non-sensitive build/runtime notes
catalogue/
  records.jsonl        # records assigned to this shard
scripts/
  verify.mjs
```

## Sparse checkout

```bash
git sparse-checkout init --cone
git sparse-checkout set games/<slug> catalogue scripts
```

## Review requirements

Every source change must preserve:

- stable slug and source manifest reference;
- source provenance and archive SHA-256;
- engine and runtime classification;
- no generated or prohibited files;
- no rights elevation or release activation through a source repository.

Publishing remains a protected platform workflow. A source-shard merge cannot activate a game.
