DO $$ DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ga_runtime_campaign_payment_links','ga_runtime_campaign_subscription_bindings'] LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (record_key text PRIMARY KEY,revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),record jsonb NOT NULL CHECK(jsonb_typeof(record)=''object''),deleted_at timestamptz,updated_at timestamptz NOT NULL DEFAULT clock_timestamp())',table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(updated_at,record_key)',table_name||'_updated_idx',table_name);
  END LOOP;
END $$;
