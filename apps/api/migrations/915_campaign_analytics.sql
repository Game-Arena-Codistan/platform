CREATE TABLE IF NOT EXISTS ga_campaign_configs (
  id uuid PRIMARY KEY, snapshot jsonb NOT NULL, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ga_campaign_attributions (
  id uuid PRIMARY KEY, token_hash text NOT NULL UNIQUE, anonymous_id uuid NOT NULL,
  user_id uuid, snapshot jsonb NOT NULL, first_seen_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS ga_campaign_attribution_expiry_idx ON ga_campaign_attributions(expires_at);
CREATE INDEX IF NOT EXISTS ga_campaign_attribution_user_idx ON ga_campaign_attributions(user_id,expires_at);
CREATE TABLE IF NOT EXISTS ga_campaign_events (
  event_key text PRIMARY KEY, event_name text NOT NULL,
  occurred_at timestamptz NOT NULL, attribution_id uuid, anonymous_id uuid, user_id uuid,
  attempt_id text, order_id text, snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_code text, consent text NOT NULL CHECK (consent IN ('granted','denied','unknown'))
);
CREATE INDEX IF NOT EXISTS ga_campaign_events_time_idx ON ga_campaign_events(occurred_at,event_name);
CREATE INDEX IF NOT EXISTS ga_campaign_events_attempt_idx ON ga_campaign_events(attempt_id) WHERE attempt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ga_campaign_events_platform_idx ON ga_campaign_events((snapshot->>'platform'),occurred_at);
CREATE INDEX IF NOT EXISTS ga_campaign_events_campaign_idx ON ga_campaign_events((snapshot->>'campaign_id'),occurred_at);
