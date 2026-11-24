CREATE TABLE IF NOT EXISTS ga_runtime_admin_sessions (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'),
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS ga_runtime_admin_sessions_updated_idx ON ga_runtime_admin_sessions(updated_at,record_key);
CREATE INDEX IF NOT EXISTS ga_runtime_admin_sessions_expiry_idx ON ga_runtime_admin_sessions((record->>'expiresAt')) WHERE deleted_at IS NULL;
