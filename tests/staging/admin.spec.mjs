import {mkdir} from 'node:fs/promises';
import {test,expect,request} from '@playwright/test';

const adminUrl=process.env.STAGING_ADMIN_URL;
const assertions=JSON.parse(process.env.STAGING_QA_ADMIN_ASSERTIONS_JSON||'{}');
const captureDir=process.env.VISUAL_CAPTURE_DIR||'visual-captures';

function headersFor(role){const headers=assertions[role];if(!headers)throw new Error(`BLOCKED: missing staging QA signed assertion for ${role}`);return headers;}

async function adminCall(role,path,{method='GET',data}={}){
  const context=await request.newContext({baseURL:adminUrl,extraHTTPHeaders:headersFor(role)});
  try{return await context.fetch(`/api${path}`,{method,data});}finally{await context.dispose();}
}

test('@admin full admin assertion resolves capabilities and renders operations console',async({browser})=>{
  const context=await browser.newContext({baseURL:adminUrl,extraHTTPHeaders:headersFor('admin')});
  const page=await context.newPage();
  await page.goto('/');
  await expect(page.getByText('Game Arena',{exact:true})).toBeVisible();
  await expect(page.locator('#console')).toBeVisible();
  await expect(page.getByRole('button',{name:'Reports'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Exports'})).toBeVisible();
  const response=await context.request.get(`${adminUrl}/api/v1/admin/capabilities`);
  expect(response.status()).toBe(200);
  const payload=await response.json();
  expect(payload.roles).toContain('admin');
  expect(payload.capabilities).toContain('reports.export');
  expect(payload.capabilities).toContain('subscription.manage_plans');
  await mkdir(captureDir,{recursive:true});
  await page.screenshot({path:`${captureDir}/admin-shell.png`,fullPage:true,animations:'disabled',mask:[page.locator('#view')]});
  await context.close();
});

test('@admin restricted roles enforce server capabilities independently of UI',async()=>{
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

test('@admin unmapped or invalid identity cannot reach operational APIs',async()=>{
  const response=await adminCall('unauthorized','/v1/admin/capabilities');
  expect([401,403]).toContain(response.status());
});
