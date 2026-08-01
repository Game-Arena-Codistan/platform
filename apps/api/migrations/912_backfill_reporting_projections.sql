CREATE OR REPLACE FUNCTION ga_parse_timestamp(value text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF value IS NULL OR btrim(value)='' THEN RETURN NULL; END IF;
  IF value ~ '^[0-9]+([.][0-9]+)?$' THEN
    RETURN to_timestamp(value::double precision / 1000.0);
  END IF;
  RETURN value::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Invalid Game Arena timestamp value: %',value USING ERRCODE='22007';
END;
$$;

INSERT INTO ga_plan_versions(version,plan_id,name,status,price_pkr,currency,duration_days,billing_mode,benefits_version,effective_at,scheduled_at,retired_at,snapshot,updated_at)
SELECT record->>'version',record->>'id',record->>'name',COALESCE(record->>'status','active'),
  COALESCE((record->>'pricePkr')::numeric,0),COALESCE(record->>'currency','PKR'),
  NULLIF(record->>'durationDays','')::integer,COALESCE(record->>'billingMode','single'),record->>'benefitsVersion',
  ga_parse_timestamp(record->>'effectiveAt'),ga_parse_timestamp(record->>'scheduledAt'),
  ga_parse_timestamp(record->>'retiredAt'),record,clock_timestamp()
FROM ga_runtime_plan_versions WHERE deleted_at IS NULL
ON CONFLICT(version) DO UPDATE SET plan_id=EXCLUDED.plan_id,name=EXCLUDED.name,status=EXCLUDED.status,
  price_pkr=EXCLUDED.price_pkr,currency=EXCLUDED.currency,duration_days=EXCLUDED.duration_days,
  billing_mode=EXCLUDED.billing_mode,benefits_version=EXCLUDED.benefits_version,effective_at=EXCLUDED.effective_at,
  scheduled_at=EXCLUDED.scheduled_at,retired_at=EXCLUDED.retired_at,snapshot=EXCLUDED.snapshot,updated_at=clock_timestamp();

INSERT INTO ga_payment_attempts(id,user_id,kind,purpose,plan_id,plan_snapshot,list_amount_pkr,charged_amount_pkr,discount_pkr,refund_amount_pkr,currency,internal_status,provider_status,provider_reference,subscription_period_id,created_at,initiated_at,completed_at,failed_at,cancelled_at,refunded_at,updated_at,safe_record)
SELECT (record->>'id')::uuid,(record->>'userId')::uuid,COALESCE(record->>'kind','membership'),
  COALESCE(record->>'purpose',CASE WHEN record->>'kind'='topup' THEN 'topup' ELSE 'activation' END),
  NULLIF(record->>'planId',''),record->'planSnapshot',
  COALESCE(NULLIF(record->>'listAmountPkr','')::numeric,NULLIF(record->>'amountPkr','')::numeric,0),
  COALESCE(NULLIF(record->>'amountPkr','')::numeric,0),COALESCE(NULLIF(record->>'discountPkr','')::numeric,0),
  COALESCE(NULLIF(record->>'refundAmountPkr','')::numeric,0),COALESCE(record->>'currency','PKR'),
  COALESCE(record->>'status','pending'),COALESCE(record->>'providerStatus',record->>'status','pending'),
  NULLIF(record->>'providerReference',''),NULLIF(record->>'subscriptionPeriodId','')::uuid,
  COALESCE(ga_parse_timestamp(record->>'createdAt'),clock_timestamp()),
  COALESCE(ga_parse_timestamp(record->>'initiatedAt'),ga_parse_timestamp(record->>'createdAt')),
  COALESCE(ga_parse_timestamp(record->>'completedAt'),ga_parse_timestamp(record->>'paidAt')),
  ga_parse_timestamp(record->>'failedAt'),ga_parse_timestamp(record->>'cancelledAt'),
  ga_parse_timestamp(record->>'refundedAt'),
  COALESCE(ga_parse_timestamp(record->>'updatedAt'),ga_parse_timestamp(record->>'createdAt'),clock_timestamp()),record
FROM ga_runtime_transactions WHERE deleted_at IS NULL
ON CONFLICT(id) DO UPDATE SET purpose=EXCLUDED.purpose,plan_id=EXCLUDED.plan_id,plan_snapshot=EXCLUDED.plan_snapshot,
  list_amount_pkr=EXCLUDED.list_amount_pkr,charged_amount_pkr=EXCLUDED.charged_amount_pkr,discount_pkr=EXCLUDED.discount_pkr,
  refund_amount_pkr=EXCLUDED.refund_amount_pkr,currency=EXCLUDED.currency,internal_status=EXCLUDED.internal_status,
  provider_status=EXCLUDED.provider_status,provider_reference=EXCLUDED.provider_reference,
  subscription_period_id=EXCLUDED.subscription_period_id,initiated_at=EXCLUDED.initiated_at,
  completed_at=EXCLUDED.completed_at,failed_at=EXCLUDED.failed_at,cancelled_at=EXCLUDED.cancelled_at,
  refunded_at=EXCLUDED.refunded_at,updated_at=EXCLUDED.updated_at,safe_record=EXCLUDED.safe_record;

INSERT INTO ga_payment_events(id,transaction_id,event_type,provider_status,signature_valid,received_at,processed_at,duplicate,protected_evidence_reference)
SELECT COALESCE(NULLIF(record->>'id',''),record_key)::uuid,(record->>'transactionId')::uuid,
  COALESCE(record->>'kind','unknown'),COALESCE(record->>'providerStatus',record->>'kind'),
  COALESCE((record->>'signatureValid')::boolean,false),COALESCE(ga_parse_timestamp(record->>'receivedAt'),clock_timestamp()),
  ga_parse_timestamp(record->>'processedAt'),COALESCE((record->>'duplicate')::boolean,false),record->>'protectedEvidenceReference'
FROM ga_runtime_payment_events WHERE deleted_at IS NULL
ON CONFLICT(id) DO UPDATE SET event_type=EXCLUDED.event_type,provider_status=EXCLUDED.provider_status,
  signature_valid=EXCLUDED.signature_valid,processed_at=EXCLUDED.processed_at,duplicate=EXCLUDED.duplicate;

WITH latest AS (
  SELECT DISTINCT ON (record->>'id') record
  FROM ga_runtime_entitlement_history
  WHERE deleted_at IS NULL AND record->>'tier'='premium'
  ORDER BY record->>'id',COALESCE(ga_parse_timestamp(record->>'updatedAt'),ga_parse_timestamp(record->>'createdAt')) DESC NULLS LAST
)
INSERT INTO ga_subscription_periods(id,user_id,plan_id,plan_snapshot,origin,purpose,status,activation_at,current_period_starts_at,current_period_ends_at,expires_at,grace_ends_at,cancelled_at,next_renewal_at,auto_renew,cancel_at_period_end,source_type,source_id,record,updated_at)
SELECT (record->>'id')::uuid,(record->>'userId')::uuid,NULLIF(record->>'planId',''),record->'planSnapshot',
  COALESCE(record->>'origin',CASE WHEN COALESCE(record->>'sourceType','') LIKE 'manual%' THEN 'manual_grant' ELSE 'paid' END),
  record->>'purpose',COALESCE(record->>'status','active'),
  COALESCE(ga_parse_timestamp(record->>'startsAt'),ga_parse_timestamp(record->>'createdAt')),
  COALESCE(ga_parse_timestamp(record->>'currentPeriodStartsAt'),ga_parse_timestamp(record->>'startsAt')),
  COALESCE(ga_parse_timestamp(record->>'currentPeriodEndsAt'),ga_parse_timestamp(record->>'expiresAt')),
  ga_parse_timestamp(record->>'expiresAt'),ga_parse_timestamp(record->>'graceEndsAt'),
  ga_parse_timestamp(record->>'cancelledAt'),ga_parse_timestamp(record->>'nextRenewalAt'),
  COALESCE((record->>'autoRenew')::boolean,false),COALESCE((record->>'cancelAtPeriodEnd')::boolean,false),
  record->>'sourceType',NULLIF(record->>'sourceId','')::uuid,record,clock_timestamp()
FROM latest
ON CONFLICT(id) DO UPDATE SET plan_id=EXCLUDED.plan_id,plan_snapshot=EXCLUDED.plan_snapshot,origin=EXCLUDED.origin,
  purpose=EXCLUDED.purpose,status=EXCLUDED.status,current_period_starts_at=EXCLUDED.current_period_starts_at,
  current_period_ends_at=EXCLUDED.current_period_ends_at,expires_at=EXCLUDED.expires_at,grace_ends_at=EXCLUDED.grace_ends_at,
  cancelled_at=EXCLUDED.cancelled_at,next_renewal_at=EXCLUDED.next_renewal_at,auto_renew=EXCLUDED.auto_renew,
  cancel_at_period_end=EXCLUDED.cancel_at_period_end,source_type=EXCLUDED.source_type,source_id=EXCLUDED.source_id,
  record=EXCLUDED.record,updated_at=clock_timestamp();

INSERT INTO ga_reconciliation_cases(id,transaction_id,reason,status,created_at,updated_at,owner_id,resolution_reference,safe_record)
SELECT (record->>'id')::uuid,NULLIF(record->>'transactionId','')::uuid,record->>'reason',COALESCE(record->>'status','open'),
  COALESCE(ga_parse_timestamp(record->>'createdAt'),clock_timestamp()),ga_parse_timestamp(record->>'updatedAt'),
  record->>'ownerId',record->>'resolutionReference',record
FROM ga_runtime_reconciliation_cases WHERE deleted_at IS NULL
ON CONFLICT(id) DO UPDATE SET reason=EXCLUDED.reason,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at,
  owner_id=EXCLUDED.owner_id,resolution_reference=EXCLUDED.resolution_reference,safe_record=EXCLUDED.safe_record;

INSERT INTO ga_benefit_ledger(id,user_id,transaction_id,subscription_period_id,benefit_type,status,issued_amount_pkr,redeemed_amount_pkr,credited_amount_pkr,failed_amount_pkr,reversal_required_amount_pkr,reversed_amount_pkr,created_at,updated_at,safe_record)
SELECT (record->>'id')::uuid,(record->>'userId')::uuid,NULLIF(record->>'transactionId','')::uuid,
  NULLIF(record->>'subscriptionPeriodId','')::uuid,record->>'type',record->>'status',
  COALESCE(NULLIF(record->>'issuedAmountPkr','')::numeric,0),COALESCE(NULLIF(record->>'redeemedAmountPkr','')::numeric,0),
  COALESCE(NULLIF(record->>'creditedAmountPkr','')::numeric,0),COALESCE(NULLIF(record->>'failedAmountPkr','')::numeric,0),
  COALESCE(NULLIF(record->>'reversalRequiredAmountPkr','')::numeric,0),COALESCE(NULLIF(record->>'reversedAmountPkr','')::numeric,0),
  COALESCE(ga_parse_timestamp(record->>'createdAt'),clock_timestamp()),
  COALESCE(ga_parse_timestamp(record->>'updatedAt'),ga_parse_timestamp(record->>'createdAt'),clock_timestamp()),record
FROM ga_runtime_benefit_ledger WHERE deleted_at IS NULL
ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,redeemed_amount_pkr=EXCLUDED.redeemed_amount_pkr,
  credited_amount_pkr=EXCLUDED.credited_amount_pkr,failed_amount_pkr=EXCLUDED.failed_amount_pkr,
  reversal_required_amount_pkr=EXCLUDED.reversal_required_amount_pkr,reversed_amount_pkr=EXCLUDED.reversed_amount_pkr,
  updated_at=EXCLUDED.updated_at,safe_record=EXCLUDED.safe_record;

INSERT INTO ga_report_export_audit(id,actor_id,report_type,selected_range,safe_filters,row_count,schema_version,content_hash,generated_at)
SELECT (record->>'id')::uuid,record->>'actor',record->>'reportType',
  jsonb_build_object('from',record#>>'{filters,from}','toExclusive',record#>>'{filters,toExclusive}'),
  COALESCE(record->'filters','{}'::jsonb),COALESCE((record->>'rowCount')::integer,0),record->>'schemaVersion',
  record->>'contentHash',COALESCE(ga_parse_timestamp(record->>'generatedAt'),clock_timestamp())
FROM ga_runtime_report_exports WHERE deleted_at IS NULL
ON CONFLICT(id) DO NOTHING;

INSERT INTO ga_audit_events(id,occurred_at,actor_id,action,target_type,target_id,request_id,metadata)
SELECT (record->>'id')::uuid,COALESCE(ga_parse_timestamp(record->>'at'),clock_timestamp()),record->>'actor',
  record->>'action',record->>'targetType',record->>'targetId',record->>'requestId',COALESCE(record->'metadata','{}'::jsonb)
FROM ga_runtime_audit_events WHERE deleted_at IS NULL
ON CONFLICT(id) DO NOTHING;
