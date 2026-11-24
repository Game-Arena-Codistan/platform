CREATE TABLE IF NOT EXISTS ga_campaign_daily_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enabled boolean NOT NULL DEFAULT false,
  recipient text NOT NULL DEFAULT '',
  send_time text NOT NULL DEFAULT '09:00',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ga_campaign_daily_settings(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS ga_campaign_daily_delivery (
  report_date date PRIMARY KEY,
  recipient text NOT NULL,
  status text NOT NULL CHECK(status IN ('reserved','sent','uncertain')),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  provider_message_id text
);