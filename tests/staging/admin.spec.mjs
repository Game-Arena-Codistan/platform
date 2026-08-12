import {mkdir} from 'node:fs/promises';
import {test,expect,request} from '@playwright/test';

const adminUrl=process.env.STAGING_ADMIN_URL;
const assertions=JSON.parse(process.env.STAGING_QA_ADMIN_ASSERTIONS_JSON||'{}');
const captureDir=process.env.VISUAL_CAPTURE_DIR||'visual-captures';

function headersFor(role){const headers=assertions[role];if(!headers)throw new Error(`BLOCKED: missing staging QA signed assertion for ${role}`);return headers;}

async function adminGet(role,path){
  const context=await request.newContext({baseURL:adminUrl,extraHTTPHeaders:headersFor(role)});
  try{return await context.get(`/api${path}`);}finally{await context.dispose();}
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
  await page.screenshot({path:`${captureDir}/admin-shell.png`,fullPage:true,animations:'disabled'});
  await context.close();
});

test('@admin restricted roles enforce server capabilities independently of UI',async()=>{
  const expectations={
    operator:{allowed:'/v1/admin/reports/payments',denied:'/v1/admin/reports/exports'},
    support:{allowed:'/v1/admin/plans',denied:'/v1/admin/reports/exports'},
    security:{allowed:'/v1/admin/reports/subscriptions/summary',denied:'/v1/admin/plans'},
    finance:{allowed:'/v1/admin/reports/exports',denied:'/v1/admin/plans/monthly'}
  };
  for(const [role,paths] of Object.entries(expectations)){
    const allowed=await adminGet(role,paths.allowed);
    expect(allowed.status(),`${role} should access ${paths.allowed}`).toBe(200);
    const denied=await adminGet(role,paths.denied);
    expect([400,401,403,404,405].includes(denied.status()),`${role} must not gain unintended access to ${paths.denied}; got ${denied.status()}`).toBeTruthy();
  }
});

test('@admin unmapped or invalid identity cannot reach operational APIs',async()=>{
  const response=await adminGet('unauthorized','/v1/admin/capabilities');
  expect([401,403]).toContain(response.status());
});
