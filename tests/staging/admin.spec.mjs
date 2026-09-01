import {mkdir} from 'node:fs/promises';
import {test,expect,request} from '@playwright/test';

const adminUrl=process.env.STAGING_ADMIN_URL;
const assertions=JSON.parse(process.env.STAGING_QA_ADMIN_ASSERTIONS_JSON||'{}');
const adminKey=String(process.env.STAGING_QA_ADMIN_KEY||'').trim();
const captureDir=process.env.VISUAL_CAPTURE_DIR||'visual-captures';
const signedRoles=['admin','operator','support','security','finance'];
const hasSignedMatrix=signedRoles.every(role=>Boolean(assertions[role]));

function headersFor(role){
  if(assertions[role])return assertions[role];
  if(role==='admin'&&adminKey)return{'x-admin-key':adminKey};
  if(role==='unauthorized')return{};
  throw new Error(`BLOCKED: missing staging QA credential for ${role}`);
}
async function adminCall(role,path,{method='GET',data}={}){const context=await request.newContext({baseURL:adminUrl,extraHTTPHeaders:headersFor(role)});try{return await context.fetch(`/api${path}`,{method,data});}finally{await context.dispose();}}
async function adminPage(browser,role='admin'){const context=await browser.newContext({baseURL:adminUrl,extraHTTPHeaders:headersFor(role)});const page=await context.newPage();await page.goto('/');await expect(page.locator('#console')).toBeVisible();return{context,page};}

test('@admin full admin credential resolves capabilities and renders operations console',async({browser})=>{
  test.skip(!assertions.admin&&!adminKey,'BLOCKED: no staging Admin credential is configured.');
  const {context,page}=await adminPage(browser,'admin');
  await expect(page.getByText('Game Arena',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Reports'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Exports'})).toBeVisible();
  const response=await context.request.get(`${adminUrl}/api/v1/admin/capabilities`);
  expect(response.status()).toBe(200);
  const payload=await response.json();
  expect(payload.roles).toContain('admin');
  expect(payload.capabilities).toContain('reports.export');
  expect(payload.capabilities).toContain('subscription.manage_plans');
  await mkdir(captureDir,{recursive:true});
  await page.screenshot({path:`${captureDir}/admin-shell.png`,fullPage:false,animations:'disabled',mask:[page.locator('#view')]});
  await context.close();
});

test('@admin full admin can traverse every operations section without client or authorization errors',async({browser})=>{
  test.skip(!assertions.admin&&!adminKey,'BLOCKED: no staging Admin credential is configured.');
  const {context,page}=await adminPage(browser,'admin');
  const browserErrors=[];
  page.on('pageerror',error=>browserErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')browserErrors.push(message.text());});
  const sections=['Overview','Reports','Plans','Payments','Paid passes','Recurring customers','Reconciliation','Benefit costs','Exports','Users','Games','Reviews','Audit'];
  for(const label of sections){
    const button=page.getByRole('button',{name:label,exact:true});
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.locator('#view h1')).toBeVisible();
    await expect(page.locator('#view')).not.toContainText(/Request failed|Forbidden|not authorized/i);
  }
  expect(browserErrors).toEqual([]);
  await context.close();
});

test('@admin reporting filters are interactive and exports download only for an authorized admin',async({browser})=>{
  test.skip(!assertions.admin&&!adminKey,'BLOCKED: no staging Admin credential is configured.');
  const {context,page}=await adminPage(browser,'admin');
  await page.getByRole('button',{name:'Reports',exact:true}).click();
  await expect(page.locator('#report-filters')).toBeVisible();
  await page.locator('#report-filters select[name="preset"]').selectOption('last7');
  const report=page.waitForResponse(response=>response.url().includes('/v1/admin/reports/subscriptions/summary')&&response.request().method()==='GET');
  await page.locator('#report-filters').getByRole('button',{name:'Apply'}).click();
  expect((await report).status()).toBe(200);
  await expect(page).toHaveURL(/preset=last7/);
  const exportButton=page.locator('[data-export="summary"]');
  await expect(exportButton).toBeVisible();
  const download=page.waitForEvent('download');
  await exportButton.click();
  const file=await download;
  expect(file.suggestedFilename()).toMatch(/\.csv$/i);
  await context.close();
});

test('@admin restricted roles enforce server capabilities independently of UI',async()=>{
  test.skip(!hasSignedMatrix,'BLOCKED: signed admin/operator/support/security/finance staging matrix is not configured.');
  const exportPath='/v1/admin/reports/exports/summary?preset=today';
  const cases=[
    {role:'operator',allowed:'/v1/admin/reports/payments?preset=today',denied:exportPath},
    {role:'support',allowed:'/v1/admin/plans',denied:exportPath},
    {role:'security',allowed:'/v1/admin/reports/subscriptions/summary?preset=today',denied:'/v1/admin/plans'},
    {role:'finance',allowed:exportPath,denied:'/v1/admin/plans/monthly',deniedMethod:'PATCH',deniedData:{action:'retire',reason:'AUTO-QA denied capability probe'}}
  ];
  for(const item of cases){
    const allowed=await adminCall(item.role,item.allowed);
    expect(allowed.status(),`${item.role} should access ${item.allowed}`).toBe(200);
    const denied=await adminCall(item.role,item.denied,{method:item.deniedMethod||'GET',data:item.deniedData});
    expect(denied.status(),`${item.role} must be forbidden from ${item.denied}`).toBe(403);
  }
});

test('@admin role-constrained UI never exposes export controls without reports.export',async({browser})=>{
  test.skip(!hasSignedMatrix,'BLOCKED: signed role UI matrix is not configured.');
  for(const role of ['operator','support','security']){
    const {context,page}=await adminPage(browser,role);
    await expect(page.getByRole('button',{name:'Exports',exact:true})).toHaveCount(0);
    await expect(page.locator('[data-export]')).toHaveCount(0);
    await context.close();
  }
});

test('@admin unmapped or unauthenticated identity cannot reach operational APIs',async()=>{
  const context=await request.newContext({baseURL:adminUrl});
  try{
    const response=await context.get('/api/v1/admin/capabilities');
    expect([401,403]).toContain(response.status());
  }finally{await context.dispose();}
});
