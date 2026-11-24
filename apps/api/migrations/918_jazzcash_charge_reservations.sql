DO $$ DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ga_runtime_jazzcash_link_intents','ga_runtime_jazzcash_wallets','ga_runtime_jazzcash_subscriptions','ga_runtime_jazzcash_charge_reservations'] LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (record_key text PRIMARY KEY,revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),record jsonb NOT NULL CHECK(jsonb_typeof(record)=''object''),deleted_at timestamptz,updated_at timestamptz NOT NULL DEFAULT clock_timestamp())',table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(updated_at,record_key)',table_name||'_updated_idx',table_name);
  END LOOP;
END $$;
