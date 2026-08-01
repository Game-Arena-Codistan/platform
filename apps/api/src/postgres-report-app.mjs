import {corsHeaders,send} from './lib/http.mjs';
import {authenticateAdmin} from './lib/admin-auth.mjs';
import {parseReportFilters,requireCapability} from './services/subscription-reports.mjs';
import {PostgresSubscriptionReportService} from './services/postgres-subscription-reports.mjs';

function sendCsv(res,result,cors){
  res.writeHead(200,{
    ...cors,
    'content-type':result.contentType,
    'content-disposition':`attachment; filename="${result.filename}"`,
    'cache-control':'no-store',
    'x-report-schema-version':result.audit.schemaVersion,
    'x-report-row-count':String(result.rowCount),
    'x-report-data-source':'postgresql-indexed'
  });
  res.end(result.body);
}

export function createPostgresReportApp({config,pool}){
  if(!pool)return null;
  const reports=new PostgresSubscriptionReportService({pool});
  const admin=(req,roles)=>authenticateAdmin(req,config,roles);
  return async function postgresReports(req,res){
    const url=new URL(req.url,'http://localhost');
    const path=url.pathname;const method=req.method||'GET';
    const isReport=path==='/v1/admin/payments'||path.startsWith('/v1/admin/reports/');
    if(method!=='GET'||!isReport)return false;
    const cors=corsHeaders(req.headers.origin,config.allowedOrigins);
    const reply=(status,payload,headers={})=>send(res,status,payload,{...cors,...headers,'x-report-data-source':'postgresql-indexed'});
    try{
      if(path==='/v1/admin/payments'){
        const principal=admin(req,['admin','finance','support']);requireCapability(principal,'reports.read');
        const filters=parseReportFilters(url.searchParams);
        const [ledger,reconciliation]=await Promise.all([
          reports.paymentLedger(filters),
          reports.reconciliation({...filters,cursor:0,limit:Math.min(filters.limit,100)})
        ]);
        return reply(200,{schemaVersion:ledger.schemaVersion,timeZone:ledger.timeZone,effectiveRange:ledger.effectiveRange,transactions:ledger.rows,reconciliationCases:reconciliation.rows,page:ledger.page,dataSource:'postgresql-indexed'});
      }
      if(path==='/v1/admin/reports/subscriptions/summary'){
        const principal=admin(req,['admin','finance','support','operator','security']);requireCapability(principal,'reports.read');
        return reply(200,await reports.summary(parseReportFilters(url.searchParams)));
      }
      if(path==='/v1/admin/reports/payments'){
        const principal=admin(req,['admin','finance','support','operator']);requireCapability(principal,'reports.read');
        return reply(200,await reports.paymentLedger(parseReportFilters(url.searchParams)));
      }
      if(path==='/v1/admin/reports/subscriptions'){
        const principal=admin(req,['admin','finance','support','operator']);requireCapability(principal,'reports.read');
        return reply(200,await reports.subscriptionLedger(parseReportFilters(url.searchParams)));
      }
      if(path==='/v1/admin/reports/recurring-customers'){
        const principal=admin(req,['admin','finance','support','operator']);requireCapability(principal,'reports.read');
        return reply(200,await reports.recurringCustomers(parseReportFilters(url.searchParams)));
      }
      if(path==='/v1/admin/reports/reconciliation'){
        const principal=admin(req,['admin','finance','support','operator']);requireCapability(principal,'reports.read');
        return reply(200,await reports.reconciliation(parseReportFilters(url.searchParams)));
      }
      if(path==='/v1/admin/reports/benefit-costs'){
        const principal=admin(req,['admin','finance','support','operator']);requireCapability(principal,'reports.read');
        return reply(200,await reports.benefitCosts(parseReportFilters(url.searchParams)));
      }
      if(path==='/v1/admin/reports/exports'){
        const principal=admin(req,['admin','finance']);requireCapability(principal,'reports.export');
        return reply(200,await reports.exportHistory(parseReportFilters(url.searchParams)));
      }
      const exportMatch=path.match(/^\/v1\/admin\/reports\/exports\/(summary|payments|subscriptions|recurring-customers|reconciliation|benefit-costs)$/);
      if(exportMatch){
        const principal=admin(req,['admin','finance']);requireCapability(principal,'reports.export');
        return sendCsv(res,await reports.export(exportMatch[1],parseReportFilters(url.searchParams),principal),cors);
      }
      return false;
    }catch(error){
      reply(error.status||500,{error:{code:error.code||'internal_error',message:error.status>=500?'Unexpected server error.':error.message,details:error.details}});
      return true;
    }
  };
}
