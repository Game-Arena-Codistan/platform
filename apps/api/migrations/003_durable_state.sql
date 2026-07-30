BEGIN;
CREATE TABLE IF NOT EXISTS platform_state(
  id text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 0,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE platform_state IS 'Atomic operational snapshot used by the synchronous service repository; normalized tables remain the reporting and migration target.';
COMMIT;
