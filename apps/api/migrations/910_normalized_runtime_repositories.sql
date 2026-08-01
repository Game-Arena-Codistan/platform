CREATE TABLE IF NOT EXISTS ga_runtime_users (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  user_id uuid GENERATED ALWAYS AS ((record->>'id')::uuid) STORED,
  status text GENERATED ALWAYS AS (record->>'status') STORED,
  created_at timestamptz GENERATED ALWAYS AS (NULLIF(record->>'createdAt','')::timestamptz) STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(user_id)
);
CREATE INDEX IF NOT EXISTS ga_runtime_users_status_idx ON ga_runtime_users(status,created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_identities (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  user_id uuid GENERATED ALWAYS AS ((record->>'userId')::uuid) STORED,
  identity_type text GENERATED ALWAYS AS (record->>'type') STORED,
  normalized_value text GENERATED ALWAYS AS (record->>'value') STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(identity_type,normalized_value)
);
CREATE INDEX IF NOT EXISTS ga_runtime_identities_user_idx ON ga_runtime_identities(user_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_otp (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  identity_type text GENERATED ALWAYS AS (record#>>'{identity,type}') STORED,
  identity_value text GENERATED ALWAYS AS (record#>>'{identity,value}') STORED,
  expires_at timestamptz GENERATED ALWAYS AS (to_timestamp((record->>'expiresAt')::double precision / 1000.0)) STORED,
  consumed boolean GENERATED ALWAYS AS (COALESCE((record->>'consumed')::boolean,false)) STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS ga_runtime_otp_identity_idx ON ga_runtime_otp(identity_type,identity_value,expires_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_otp_expiry_idx ON ga_runtime_otp(expires_at) WHERE deleted_at IS NULL AND consumed=false;

CREATE TABLE IF NOT EXISTS ga_runtime_sessions (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  session_id uuid GENERATED ALWAYS AS ((record->>'id')::uuid) STORED,
  user_id uuid GENERATED ALWAYS AS ((record->>'userId')::uuid) STORED,
  expires_at timestamptz GENERATED ALWAYS AS (to_timestamp((record->>'expiresAt')::double precision / 1000.0)) STORED,
  revoked_at timestamptz GENERATED ALWAYS AS (CASE WHEN NULLIF(record->>'revokedAt','') IS NULL THEN NULL ELSE to_timestamp((record->>'revokedAt')::double precision / 1000.0) END) STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(session_id)
);
CREATE INDEX IF NOT EXISTS ga_runtime_sessions_user_idx ON ga_runtime_sessions(user_id,expires_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_sessions_active_idx ON ga_runtime_sessions(expires_at) WHERE deleted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_devices (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  user_id uuid GENERATED ALWAYS AS ((record->>'userId')::uuid) STORED,
  last_seen_at timestamptz GENERATED ALWAYS AS (to_timestamp((record->>'lastSeenAt')::double precision / 1000.0)) STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS ga_runtime_devices_user_idx ON ga_runtime_devices(user_id,last_seen_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_entitlements (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  entitlement_id uuid GENERATED ALWAYS AS ((record->>'id')::uuid) STORED,
  user_id uuid GENERATED ALWAYS AS ((record->>'userId')::uuid) STORED,
  tier text GENERATED ALWAYS AS (record->>'tier') STORED,
  status text GENERATED ALWAYS AS (record->>'status') STORED,
  expires_at timestamptz GENERATED ALWAYS AS (CASE WHEN NULLIF(record->>'expiresAt','') IS NULL THEN NULL ELSE to_timestamp((record->>'expiresAt')::double precision / 1000.0) END) STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(entitlement_id),
  UNIQUE(user_id)
);
CREATE INDEX IF NOT EXISTS ga_runtime_entitlements_status_idx ON ga_runtime_entitlements(status,expires_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_entitlement_history (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  entitlement_id uuid GENERATED ALWAYS AS ((record->>'id')::uuid) STORED,
  user_id uuid GENERATED ALWAYS AS ((record->>'userId')::uuid) STORED,
  status text GENERATED ALWAYS AS (record->>'status') STORED,
  created_at timestamptz GENERATED ALWAYS AS (to_timestamp((record->>'createdAt')::double precision / 1000.0)) STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(entitlement_id)
);
CREATE INDEX IF NOT EXISTS ga_runtime_entitlement_history_user_idx ON ga_runtime_entitlement_history(user_id,created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_transactions (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  transaction_id uuid GENERATED ALWAYS AS ((record->>'id')::uuid) STORED,
  user_id uuid GENERATED ALWAYS AS ((record->>'userId')::uuid) STORED,
  idempotency_key text GENERATED ALWAYS AS (record->>'idempotencyKey') STORED,
  provider_reference text GENERATED ALWAYS AS (NULLIF(record->>'providerReference','')) STORED,
  kind text GENERATED ALWAYS AS (record->>'kind') STORED,
  purpose text GENERATED ALWAYS AS (record->>'purpose') STORED,
  status text GENERATED ALWAYS AS (record->>'status') STORED,
  created_at timestamptz GENERATED ALWAYS AS (NULLIF(record->>'createdAt','')::timestamptz) STORED,
  completed_at timestamptz GENERATED ALWAYS AS (COALESCE(NULLIF(record->>'completedAt','')::timestamptz,NULLIF(record->>'paidAt','')::timestamptz)) STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(transaction_id),
  UNIQUE(idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS ga_runtime_transactions_provider_ref_idx ON ga_runtime_transactions(provider_reference) WHERE deleted_at IS NULL AND provider_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_transactions_user_idx ON ga_runtime_transactions(user_id,created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_transactions_report_idx ON ga_runtime_transactions(kind,purpose,status,completed_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_payment_events (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  transaction_id uuid GENERATED ALWAYS AS (NULLIF(record->>'transactionId','')::uuid) STORED,
  provider_event_id text GENERATED ALWAYS AS (COALESCE(NULLIF(record->>'providerEventId',''),record->>'id')) STORED,
  received_at timestamptz GENERATED ALWAYS AS (NULLIF(record->>'receivedAt','')::timestamptz) STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(provider_event_id)
);
CREATE INDEX IF NOT EXISTS ga_runtime_payment_events_transaction_idx ON ga_runtime_payment_events(transaction_id,received_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_reconciliation_cases (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  case_id uuid GENERATED ALWAYS AS ((record->>'id')::uuid) STORED,
  transaction_id text GENERATED ALWAYS AS (record->>'transactionId') STORED,
  status text GENERATED ALWAYS AS (record->>'status') STORED,
  reason text GENERATED ALWAYS AS (record->>'reason') STORED,
  created_at timestamptz GENERATED ALWAYS AS (NULLIF(record->>'createdAt','')::timestamptz) STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(case_id)
);
CREATE INDEX IF NOT EXISTS ga_runtime_reconciliation_queue_idx ON ga_runtime_reconciliation_cases(status,reason,created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_coin_ledger (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  ledger_id uuid GENERATED ALWAYS AS ((record->>'id')::uuid) STORED,
  user_id uuid GENERATED ALWAYS AS ((record->>'userId')::uuid) STORED,
  idempotency_key text GENERATED ALWAYS AS (record->>'idempotencyKey') STORED,
  amount bigint GENERATED ALWAYS AS ((record->>'amount')::bigint) STORED,
  created_at timestamptz GENERATED ALWAYS AS (NULLIF(record->>'createdAt','')::timestamptz) STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(ledger_id),
  UNIQUE(idempotency_key)
);
CREATE INDEX IF NOT EXISTS ga_runtime_coin_ledger_user_idx ON ga_runtime_coin_ledger(user_id,created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_games (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  game_id text GENERATED ALWAYS AS (record->>'id') STORED,
  slug text GENERATED ALWAYS AS (COALESCE(NULLIF(record->>'slug',''),record->>'id')) STORED,
  tier text GENERATED ALWAYS AS (record->>'tier') STORED,
  status text GENERATED ALWAYS AS (record->>'status') STORED,
  rollout_percentage integer GENERATED ALWAYS AS (COALESCE((record->>'rolloutPercentage')::integer,0)) STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(game_id),
  UNIQUE(slug)
);
CREATE INDEX IF NOT EXISTS ga_runtime_games_catalogue_idx ON ga_runtime_games(status,tier,game_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_play_sessions (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  play_session_id uuid GENERATED ALWAYS AS ((record->>'id')::uuid) STORED,
  user_id uuid GENERATED ALWAYS AS ((record->>'userId')::uuid) STORED,
  game_id text GENERATED ALWAYS AS (record->>'gameId') STORED,
  status text GENERATED ALWAYS AS (record->>'status') STORED,
  started_at timestamptz GENERATED ALWAYS AS (to_timestamp((record->>'startedAt')::double precision / 1000.0)) STORED,
  completed_at timestamptz GENERATED ALWAYS AS (CASE WHEN NULLIF(record->>'completedAt','') IS NULL THEN NULL ELSE to_timestamp((record->>'completedAt')::double precision / 1000.0) END) STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(play_session_id)
);
CREATE INDEX IF NOT EXISTS ga_runtime_play_sessions_user_idx ON ga_runtime_play_sessions(user_id,started_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_play_sessions_game_idx ON ga_runtime_play_sessions(game_id,status,completed_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_score_events (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  play_session_id uuid GENERATED ALWAYS AS ((record->>'playSessionId')::uuid) STORED,
  user_id uuid GENERATED ALWAYS AS ((record->>'userId')::uuid) STORED,
  game_id text GENERATED ALWAYS AS (record->>'gameId') STORED,
  status text GENERATED ALWAYS AS (record->>'status') STORED,
  score bigint GENERATED ALWAYS AS ((record->>'score')::bigint) STORED,
  completed_at timestamptz GENERATED ALWAYS AS (to_timestamp((record->>'completedAt')::double precision / 1000.0)) STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(play_session_id)
);
CREATE INDEX IF NOT EXISTS ga_runtime_score_events_leaderboard_idx ON ga_runtime_score_events(game_id,status,score DESC,completed_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_rate_limits (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS ga_runtime_challenges (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  status text GENERATED ALWAYS AS (record->>'status') STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS ga_runtime_challenges_status_idx ON ga_runtime_challenges(status,record_key) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_tournaments (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  status text GENERATED ALWAYS AS (record->>'status') STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS ga_runtime_tournaments_status_idx ON ga_runtime_tournaments(status,record_key) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_tournament_entries (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  entry_id uuid GENERATED ALWAYS AS ((record->>'id')::uuid) STORED,
  user_id uuid GENERATED ALWAYS AS ((record->>'userId')::uuid) STORED,
  tournament_id text GENERATED ALWAYS AS (record->>'tournamentId') STORED,
  status text GENERATED ALWAYS AS (record->>'status') STORED,
  joined_at timestamptz GENERATED ALWAYS AS (to_timestamp((record->>'joinedAt')::double precision / 1000.0)) STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(entry_id),
  UNIQUE(user_id,tournament_id)
);
CREATE INDEX IF NOT EXISTS ga_runtime_tournament_entries_tournament_idx ON ga_runtime_tournament_entries(tournament_id,joined_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_adjustments (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  user_id uuid GENERATED ALWAYS AS (NULLIF(record->>'userId','')::uuid) STORED,
  status text GENERATED ALWAYS AS (record->>'status') STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS ga_runtime_adjustments_user_idx ON ga_runtime_adjustments(user_id,updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_multiplayer_rooms (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  room_id uuid GENERATED ALWAYS AS ((record->>'id')::uuid) STORED,
  game_id text GENERATED ALWAYS AS (record->>'gameId') STORED,
  status text GENERATED ALWAYS AS (record->>'status') STORED,
  expires_at timestamptz GENERATED ALWAYS AS (to_timestamp((record->>'expiresAt')::double precision / 1000.0)) STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(room_id)
);
CREATE INDEX IF NOT EXISTS ga_runtime_multiplayer_rooms_open_idx ON ga_runtime_multiplayer_rooms(status,expires_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_support_tickets (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  user_id uuid GENERATED ALWAYS AS (NULLIF(record->>'userId','')::uuid) STORED,
  status text GENERATED ALWAYS AS (record->>'status') STORED,
  created_at timestamptz GENERATED ALWAYS AS (NULLIF(record->>'createdAt','')::timestamptz) STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS ga_runtime_support_tickets_queue_idx ON ga_runtime_support_tickets(status,created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_voucher_redemptions (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  redemption_id uuid GENERATED ALWAYS AS ((record->>'id')::uuid) STORED,
  user_id uuid GENERATED ALWAYS AS ((record->>'userId')::uuid) STORED,
  code text GENERATED ALWAYS AS (record->>'code') STORED,
  redeemed_at timestamptz GENERATED ALWAYS AS (NULLIF(record->>'redeemedAt','')::timestamptz) STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(redemption_id),
  UNIQUE(user_id,code)
);
CREATE INDEX IF NOT EXISTS ga_runtime_voucher_redemptions_user_idx ON ga_runtime_voucher_redemptions(user_id,redeemed_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_plan_versions (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  version text GENERATED ALWAYS AS (record->>'version') STORED,
  plan_id text GENERATED ALWAYS AS (record->>'id') STORED,
  status text GENERATED ALWAYS AS (record->>'status') STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(version)
);
CREATE INDEX IF NOT EXISTS ga_runtime_plan_versions_status_idx ON ga_runtime_plan_versions(plan_id,status) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_benefit_ledger (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  benefit_id uuid GENERATED ALWAYS AS ((record->>'id')::uuid) STORED,
  user_id uuid GENERATED ALWAYS AS ((record->>'userId')::uuid) STORED,
  status text GENERATED ALWAYS AS (record->>'status') STORED,
  benefit_type text GENERATED ALWAYS AS (record->>'type') STORED,
  created_at timestamptz GENERATED ALWAYS AS (NULLIF(record->>'createdAt','')::timestamptz) STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(benefit_id)
);
CREATE INDEX IF NOT EXISTS ga_runtime_benefit_ledger_report_idx ON ga_runtime_benefit_ledger(benefit_type,status,created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_report_exports (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  export_id uuid GENERATED ALWAYS AS ((record->>'id')::uuid) STORED,
  actor_id text GENERATED ALWAYS AS (record->>'actor') STORED,
  report_type text GENERATED ALWAYS AS (record->>'reportType') STORED,
  generated_at timestamptz GENERATED ALWAYS AS (NULLIF(record->>'generatedAt','')::timestamptz) STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(export_id)
);
CREATE INDEX IF NOT EXISTS ga_runtime_report_exports_actor_idx ON ga_runtime_report_exports(actor_id,generated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_report_exports_type_idx ON ga_runtime_report_exports(report_type,generated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_audit_events (
  record_key text PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  record jsonb NOT NULL,
  event_id uuid GENERATED ALWAYS AS ((record->>'id')::uuid) STORED,
  actor_id text GENERATED ALWAYS AS (record->>'actor') STORED,
  action text GENERATED ALWAYS AS (record->>'action') STORED,
  occurred_at timestamptz GENERATED ALWAYS AS (NULLIF(record->>'at','')::timestamptz) STORED,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(event_id)
);
CREATE INDEX IF NOT EXISTS ga_runtime_audit_actor_idx ON ga_runtime_audit_events(actor_id,occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_audit_action_idx ON ga_runtime_audit_events(action,occurred_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_schema_state (
  id text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO ga_runtime_schema_state(id,value)
VALUES('persistence-model','{"name":"normalized-postgres-v1","legacyPlatformState":false,"multiWriter":"optimistic-row-versioning"}'::jsonb)
ON CONFLICT(id) DO UPDATE SET value=EXCLUDED.value,updated_at=clock_timestamp();
