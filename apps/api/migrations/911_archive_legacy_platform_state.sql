CREATE TABLE IF NOT EXISTS ga_legacy_state_archive (
  id text PRIMARY KEY,
  source_revision bigint NOT NULL,
  state jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  imported_at timestamptz
);

DO $$
BEGIN
  IF to_regclass('public.platform_state') IS NOT NULL THEN
    INSERT INTO ga_legacy_state_archive(id,source_revision,state,archived_at)
    SELECT id,revision,state,clock_timestamp()
    FROM platform_state
    ON CONFLICT(id) DO UPDATE
      SET source_revision=EXCLUDED.source_revision,
          state=EXCLUDED.state,
          archived_at=clock_timestamp(),
          imported_at=NULL;
    DROP TABLE platform_state;
  END IF;
END $$;
