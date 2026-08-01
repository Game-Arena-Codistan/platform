import {existsSync,readFileSync} from 'node:fs';

const required=[
  'apps/api/src/services/postgres-subscription-reports.mjs',
  'apps/api/src/postgres-report-app.mjs',
  'apps/api/migrations/912_backfill_reporting_projections.sql',
  'apps/api/test/postgres-reports.test.mjs',
  '.github/workflows/qualification.yml'
];
const failures=[];
const text=path=>readFileSync(path,'utf8');
const assert=(condition,message)=>{if(!condition)failures.push(message);};
for(const path of required)assert(existsSync(path),`Missing indexed-report artifact: ${path}`);

if(existsSync('apps/api/src/services/postgres-subscription-reports.mjs')){
  const service=text('apps/api/src/services/postgres-subscription-reports.mjs');
  for(const marker of [
    'MAX_REPORT_ROWS=10000',
    'ga_payment_attempts',
    'ga_subscription_periods',
    'ga_reconciliation_cases',
    'ga_benefit_ledger',
    "dataSource:'postgresql-indexed'"
  ])assert(service.includes(marker),`PostgreSQL report service is missing: ${marker}`);
  assert(!service.includes('platform_state'),'PostgreSQL report service must not access legacy platform_state.');
}

if(existsSync('apps/api/src/postgres-report-app.mjs')){
  const routes=text('apps/api/src/postgres-report-app.mjs');
  for(const marker of [
    '/v1/admin/reports/subscriptions/summary',
    '/v1/admin/reports/payments',
    '/v1/admin/reports/subscriptions',
    '/v1/admin/reports/recurring-customers',
    '/v1/admin/reports/reconciliation',
    '/v1/admin/reports/benefit-costs',
    'reports.export',
    'postgresql-indexed'
  ])assert(routes.includes(marker),`PostgreSQL report route layer is missing: ${marker}`);
}

if(existsSync('apps/api/src/server.mjs')){
  const server=text('apps/api/src/server.mjs');
  assert(server.includes('createPostgresReportApp'),'API server must create the PostgreSQL report route layer.');
  assert(server.indexOf('postgresReports(req,res)')<server.indexOf('supplemental(req,res)'),'PostgreSQL report routes must run before in-memory supplemental routes.');
}

if(existsSync('apps/api/migrations/912_backfill_reporting_projections.sql')){
  const migration=text('apps/api/migrations/912_backfill_reporting_projections.sql');
  for(const marker of [
    'ga_parse_timestamp',
    'ga_runtime_transactions',
    'ga_runtime_entitlement_history',
    'ga_payment_attempts',
    'ga_subscription_periods',
    'ga_report_export_audit'
  ])assert(migration.includes(marker),`Reporting projection backfill is missing: ${marker}`);
}

if(existsSync('apps/api/test/postgres-reports.test.mjs')){
  const tests=text('apps/api/test/postgres-reports.test.mjs');
  for(const marker of [
    'projection backfill converts runtime epoch timestamps',
    'grossCollectionsPkr',
    'lifetimeCollectedPkr',
    'ga_report_export_audit',
    'postgresql-indexed'
  ])assert(tests.includes(marker),`PostgreSQL report integration coverage is missing: ${marker}`);
}

if(existsSync('.github/workflows/qualification.yml')){
  const workflow=text('.github/workflows/qualification.yml');
  assert(workflow.includes('--test-concurrency=1 test/postgres*.test.mjs'),'Release qualification must run the complete serialized PostgreSQL test suite.');
}

if(failures.length){
  console.error(`Indexed PostgreSQL report gate failed with ${failures.length} finding(s):`);
  failures.forEach(item=>console.error(`- ${item}`));
  process.exit(1);
}
console.log('Indexed PostgreSQL report gate passed for issues #52 and #20.');
