CREATE TABLE IF NOT EXISTS ga_plan_versions (
  version text PRIMARY KEY,
  plan_id text NOT NULL,
  name text NOT NULL,
  status text NOT NULL,
  price_pkr numeric(14,2) NOT NULL,
  currency text NOT NULL,
  duration_days integer,
  billing_mode text NOT NULL,
  benefits_version text,
  effective_at timestamptz,
  scheduled_at timestamptz,
  retired_at timestamptz,
  snapshot jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ga_plan_versions_plan_status_idx ON ga_plan_versions(plan_id,status);
CREATE TABLE IF NOT EXISTS ga_payment_attempts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  purpose text NOT NULL,
  plan_id text,
  plan_snapshot jsonb,
  list_amount_pkr numeric(14,2),
  charged_amount_pkr numeric(14,2) NOT NULL,
  discount_pkr numeric(14,2) NOT NULL DEFAULT 0,
  refund_amount_pkr numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL,
  internal_status text NOT NULL,
  provider_status text,
  provider_reference text,
  subscription_period_id uuid,
  created_at timestamptz NOT NULL,
  initiated_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  updated_at timestamptz NOT NULL,
  safe_record jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS ga_payment_attempts_completed_idx ON ga_payment_attempts(completed_at DESC) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ga_payment_attempts_created_idx ON ga_payment_attempts(created_at DESC);
CREATE INDEX IF NOT EXISTS ga_payment_attempts_status_idx ON ga_payment_attempts(internal_status,provider_status,created_at DESC);
CREATE INDEX IF NOT EXISTS ga_payment_attempts_purpose_plan_idx ON ga_payment_attempts(purpose,plan_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ga_payment_attempts_user_idx ON ga_payment_attempts(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ga_payment_attempts_provider_reference_idx ON ga_payment_attempts(provider_reference) WHERE provider_reference IS NOT NULL;
CREATE TABLE IF NOT EXISTS ga_payment_events (
  id text PRIMARY KEY,
  transaction_id uuid NOT NULL,
  event_type text NOT NULL,
  provider_status text,
  signature_valid boolean NOT NULL,
  received_at timestamptz NOT NULL,
  processed_at timestamptz,
  duplicate boolean NOT NULL DEFAULT false,
  protected_evidence_reference text
);
CREATE INDEX IF NOT EXISTS ga_payment_events_transaction_idx ON ga_payment_events(transaction_id,received_at DESC);
CREATE INDEX IF NOT EXISTS ga_payment_events_status_idx ON ga_payment_events(provider_status,received_at DESC);
CREATE TABLE IF NOT EXISTS ga_subscription_periods (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  plan_id text,
  plan_snapshot jsonb,
  origin text NOT NULL,
  purpose text,
  status text NOT NULL,
  activation_at timestamptz,
  current_period_starts_at timestamptz,
  current_period_ends_at timestamptz,
  expires_at timestamptz,
  grace_ends_at timestamptz,
  cancelled_at timestamptz,
  next_renewal_at timestamptz,
  auto_renew boolean NOT NULL DEFAULT false,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  source_type text,
  source_id text,
  record jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ga_subscription_periods_status_idx ON ga_subscription_periods(status,expires_at DESC);
CREATE INDEX IF NOT EXISTS ga_subscription_periods_user_idx ON ga_subscription_periods(user_id,activation_at DESC);
CREATE INDEX IF NOT EXISTS ga_subscription_periods_plan_idx ON ga_subscription_periods(plan_id,status,expires_at DESC);
CREATE INDEX IF NOT EXISTS ga_subscription_periods_origin_idx ON ga_subscription_periods(origin,status,activation_at DESC);
CREATE INDEX IF NOT EXISTS ga_subscription_periods_renewal_idx ON ga_subscription_periods(next_renewal_at) WHERE next_renewal_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS ga_reconciliation_cases (
  id uuid PRIMARY KEY,
  transaction_id text,
  reason text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz,
  owner_id text,
  resolution_reference text,
  safe_record jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS ga_reconciliation_cases_queue_idx ON ga_reconciliation_cases(status,created_at DESC);
CREATE INDEX IF NOT EXISTS ga_reconciliation_cases_reason_idx ON ga_reconciliation_cases(reason,status,created_at DESC);
CREATE TABLE IF NOT EXISTS ga_benefit_ledger (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  transaction_id uuid,
  subscription_period_id uuid,
  benefit_type text NOT NULL,
  status text NOT NULL,
  issued_amount_pkr numeric(14,2) NOT NULL DEFAULT 0,
  redeemed_amount_pkr numeric(14,2) NOT NULL DEFAULT 0,
  credited_amount_pkr numeric(14,2) NOT NULL DEFAULT 0,
  failed_amount_pkr numeric(14,2) NOT NULL DEFAULT 0,
  reversal_required_amount_pkr numeric(14,2) NOT NULL DEFAULT 0,
  reversed_amount_pkr numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  safe_record jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS ga_benefit_ledger_status_idx ON ga_benefit_ledger(benefit_type,status,created_at DESC);
CREATE INDEX IF NOT EXISTS ga_benefit_ledger_user_idx ON ga_benefit_ledger(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS ga_report_export_audit (
  id uuid PRIMARY KEY,
  actor_id text NOT NULL,
  report_type text NOT NULL,
  selected_range jsonb NOT NULL,
  safe_filters jsonb NOT NULL,
  row_count integer NOT NULL,
  schema_version text NOT NULL,
  content_hash text NOT NULL,
  generated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ga_report_export_audit_actor_idx ON ga_report_export_audit(actor_id,generated_at DESC);
CREATE INDEX IF NOT EXISTS ga_report_export_audit_type_idx ON ga_report_export_audit(report_type,generated_at DESC);
CREATE TABLE IF NOT EXISTS ga_audit_events (
  id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  actor_id text NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  request_id text,
  metadata jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS ga_audit_events_actor_idx ON ga_audit_events(actor_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS ga_audit_events_action_idx ON ga_audit_events(action,occurred_at DESC);
