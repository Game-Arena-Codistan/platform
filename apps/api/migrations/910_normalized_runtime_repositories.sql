DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'ga_runtime_users','ga_runtime_identities','ga_runtime_otp','ga_runtime_sessions',
    'ga_runtime_devices','ga_runtime_entitlements','ga_runtime_entitlement_history',
    'ga_runtime_transactions','ga_runtime_payment_events','ga_runtime_reconciliation_cases',
    'ga_runtime_coin_ledger','ga_runtime_games','ga_runtime_play_sessions',
    'ga_runtime_score_events','ga_runtime_rate_limits','ga_runtime_challenges',
    'ga_runtime_tournaments','ga_runtime_tournament_entries','ga_runtime_adjustments',
    'ga_runtime_multiplayer_rooms','ga_runtime_support_tickets',
    'ga_runtime_voucher_redemptions','ga_runtime_plan_versions',
    'ga_runtime_benefit_ledger','ga_runtime_report_exports','ga_runtime_audit_events'
  ]
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I (
        record_key text PRIMARY KEY,
        revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
        record jsonb NOT NULL CHECK (jsonb_typeof(record) = ''object''),
        deleted_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
      )', table_name
    );
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(updated_at,record_key)',table_name||'_updated_idx',table_name);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ga_runtime_identities_value_uq
  ON ga_runtime_identities((record->>'type'),(record->>'value')) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_identities_user_idx
  ON ga_runtime_identities((record->>'userId')) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ga_runtime_otp_identity_idx
  ON ga_runtime_otp((record#>>'{identity,type}'),(record#>>'{identity,value}'),(record->>'expiresAt')) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_otp_expiry_idx
  ON ga_runtime_otp((record->>'expiresAt')) WHERE deleted_at IS NULL AND COALESCE((record->>'consumed')::boolean,false)=false;

CREATE UNIQUE INDEX IF NOT EXISTS ga_runtime_sessions_id_uq
  ON ga_runtime_sessions((record->>'id')) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_sessions_user_idx
  ON ga_runtime_sessions((record->>'userId'),(record->>'expiresAt')) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_devices_user_idx
  ON ga_runtime_devices((record->>'userId'),(record->>'lastSeenAt')) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ga_runtime_entitlements_user_uq
  ON ga_runtime_entitlements((record->>'userId')) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_entitlements_status_idx
  ON ga_runtime_entitlements((record->>'status'),(record->>'expiresAt')) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_entitlement_history_user_idx
  ON ga_runtime_entitlement_history((record->>'userId'),(record->>'createdAt')) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ga_runtime_transactions_idempotency_uq
  ON ga_runtime_transactions((record->>'idempotencyKey')) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ga_runtime_transactions_provider_ref_uq
  ON ga_runtime_transactions((record->>'providerReference')) WHERE deleted_at IS NULL AND NULLIF(record->>'providerReference','') IS NOT NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_transactions_user_idx
  ON ga_runtime_transactions((record->>'userId'),(record->>'createdAt')) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_transactions_report_idx
  ON ga_runtime_transactions((record->>'kind'),(record->>'purpose'),(record->>'status'),(COALESCE(record->>'completedAt',record->>'paidAt'))) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ga_runtime_payment_events_provider_uq
  ON ga_runtime_payment_events((COALESCE(NULLIF(record->>'providerEventId',''),record->>'id'))) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_payment_events_transaction_idx
  ON ga_runtime_payment_events((record->>'transactionId'),(record->>'receivedAt')) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_reconciliation_queue_idx
  ON ga_runtime_reconciliation_cases((record->>'status'),(record->>'reason'),(record->>'createdAt')) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ga_runtime_coin_ledger_idempotency_uq
  ON ga_runtime_coin_ledger((record->>'idempotencyKey')) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_coin_ledger_user_idx
  ON ga_runtime_coin_ledger((record->>'userId'),(record->>'createdAt')) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ga_runtime_games_slug_uq
  ON ga_runtime_games((COALESCE(NULLIF(record->>'slug',''),record->>'id'))) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_games_catalogue_idx
  ON ga_runtime_games((record->>'status'),(record->>'tier'),record_key) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_play_sessions_user_idx
  ON ga_runtime_play_sessions((record->>'userId'),(record->>'startedAt')) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_play_sessions_game_idx
  ON ga_runtime_play_sessions((record->>'gameId'),(record->>'status'),(record->>'completedAt')) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ga_runtime_score_events_play_uq
  ON ga_runtime_score_events((record->>'playSessionId')) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_score_events_leaderboard_idx
  ON ga_runtime_score_events((record->>'gameId'),(record->>'status'),((record->>'score')::bigint) DESC,(record->>'completedAt')) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ga_runtime_tournament_entry_uq
  ON ga_runtime_tournament_entries((record->>'userId'),(record->>'tournamentId')) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_multiplayer_rooms_open_idx
  ON ga_runtime_multiplayer_rooms((record->>'status'),(record->>'expiresAt')) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_support_tickets_queue_idx
  ON ga_runtime_support_tickets((record->>'status'),(record->>'createdAt')) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ga_runtime_voucher_redemptions_user_code_uq
  ON ga_runtime_voucher_redemptions((record->>'userId'),(record->>'code')) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ga_runtime_plan_versions_version_uq
  ON ga_runtime_plan_versions((record->>'version')) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_plan_versions_status_idx
  ON ga_runtime_plan_versions((record->>'id'),(record->>'status')) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_benefit_ledger_report_idx
  ON ga_runtime_benefit_ledger((record->>'type'),(record->>'status'),(record->>'createdAt')) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_report_exports_actor_idx
  ON ga_runtime_report_exports((record->>'actor'),(record->>'generatedAt')) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_audit_actor_idx
  ON ga_runtime_audit_events((record->>'actor'),(record->>'at')) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ga_runtime_audit_action_idx
  ON ga_runtime_audit_events((record->>'action'),(record->>'at')) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ga_runtime_schema_state (
  id text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO ga_runtime_schema_state(id,value)
VALUES('persistence-model','{"name":"normalized-postgres-v1","legacyPlatformState":false,"multiWriter":"optimistic-row-versioning"}'::jsonb)
ON CONFLICT(id) DO UPDATE SET value=EXCLUDED.value,updated_at=clock_timestamp();
