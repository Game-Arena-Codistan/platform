CREATE TABLE IF NOT EXISTS ga_legacy_state_archive (
  id text PRIMARY KEY,
  source_revision bigint NOT NULL,
  state jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  imported_at timestamptz
);

DO $$
DECLARE
  legacy_state jsonb;
  mapping record;
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
  END IF;

  SELECT state INTO legacy_state
  FROM ga_legacy_state_archive
  WHERE id='primary' AND imported_at IS NULL;

  IF legacy_state IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM ga_runtime_users
      UNION ALL SELECT 1 FROM ga_runtime_transactions
      UNION ALL SELECT 1 FROM ga_runtime_games
      UNION ALL SELECT 1 FROM ga_runtime_coin_ledger
      LIMIT 1
    ) THEN
      RAISE EXCEPTION 'Normalized runtime rows already exist while the legacy import is incomplete.';
    END IF;

    FOR mapping IN
      SELECT * FROM (VALUES
        ('users','ga_runtime_users'),
        ('identities','ga_runtime_identities'),
        ('otp','ga_runtime_otp'),
        ('sessions','ga_runtime_sessions'),
        ('devices','ga_runtime_devices'),
        ('entitlements','ga_runtime_entitlements'),
        ('transactions','ga_runtime_transactions'),
        ('paymentEvents','ga_runtime_payment_events'),
        ('playSessions','ga_runtime_play_sessions'),
        ('rateLimits','ga_runtime_rate_limits'),
        ('challenges','ga_runtime_challenges'),
        ('tournaments','ga_runtime_tournaments'),
        ('adjustments','ga_runtime_adjustments'),
        ('multiplayerRooms','ga_runtime_multiplayer_rooms')
      ) AS fields(field_name,table_name)
    LOOP
      EXECUTE format(
        'INSERT INTO %I(record_key,record)
         SELECT element->>0,element->1
         FROM jsonb_array_elements(COALESCE($1->%L,''[]''::jsonb)) AS element
         WHERE jsonb_typeof(element)=''array'' AND jsonb_array_length(element)=2
         ON CONFLICT(record_key) DO NOTHING',
        mapping.table_name,mapping.field_name
      ) USING legacy_state;
    END LOOP;

    FOR mapping IN
      SELECT * FROM (VALUES
        ('entitlementHistory','ga_runtime_entitlement_history','(element->>''id'') || '':'' || COALESCE(element->>''updatedAt'',element->>''createdAt'',ordinality::text)'),
        ('reconciliationCases','ga_runtime_reconciliation_cases','element->>''id'''),
        ('ledger','ga_runtime_coin_ledger','element->>''id'''),
        ('games','ga_runtime_games','element->>''id'''),
        ('scoreEvents','ga_runtime_score_events','element->>''playSessionId'''),
        ('tournamentEntries','ga_runtime_tournament_entries','element->>''id'''),
        ('supportTickets','ga_runtime_support_tickets','element->>''id'''),
        ('voucherRedemptions','ga_runtime_voucher_redemptions','element->>''id'''),
        ('planVersions','ga_runtime_plan_versions','element->>''version'''),
        ('benefitLedger','ga_runtime_benefit_ledger','element->>''id'''),
        ('reportExports','ga_runtime_report_exports','element->>''id'''),
        ('audit','ga_runtime_audit_events','element->>''id''')
      ) AS fields(field_name,table_name,key_expression)
    LOOP
      EXECUTE format(
        'INSERT INTO %I(record_key,record)
         SELECT %s,element
         FROM jsonb_array_elements(COALESCE($1->%L,''[]''::jsonb)) WITH ORDINALITY AS rows(element,ordinality)
         WHERE jsonb_typeof(element)=''object'' AND NULLIF(%s,'''') IS NOT NULL
         ON CONFLICT(record_key) DO NOTHING',
        mapping.table_name,mapping.key_expression,mapping.field_name,mapping.key_expression
      ) USING legacy_state;
    END LOOP;

    UPDATE ga_legacy_state_archive SET imported_at=clock_timestamp() WHERE id='primary';
    INSERT INTO ga_runtime_schema_state(id,value)
    VALUES('legacy-import-complete',jsonb_build_object('source','ga_legacy_state_archive','completedAt',clock_timestamp()))
    ON CONFLICT(id) DO UPDATE SET value=EXCLUDED.value,updated_at=clock_timestamp();
  ELSE
    INSERT INTO ga_runtime_schema_state(id,value)
    VALUES('legacy-import-complete',jsonb_build_object('source','none','completedAt',clock_timestamp()))
    ON CONFLICT(id) DO NOTHING;
  END IF;

  IF to_regclass('public.platform_state') IS NOT NULL THEN
    DROP TABLE platform_state;
  END IF;
END $$;
