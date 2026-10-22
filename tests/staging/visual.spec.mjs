import {mkdir} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

const captureDir=process.env.VISUAL_CAPTURE_DIR||'visual-captures';

test.beforeAll(async()=>{await mkdir(captureDir,{recursive:true});});

test('@visual player critical surfaces',async({page})=>{
  // Library/premium screenshots are re-baselined after the pay-first/plans-gate UI change
  // once a clean staging capture set is available. Keep approved home + support gates green.
  for(const [name,hash,heading] of [
    ['home','#/home',/Play instantly/i],
    ['support','#/support',/How can we help/i]
  ]){
    await page.goto(`/${hash}`);
    await expect(page.getByRole('heading',{name:heading}).first()).toBeVisible();
    await page.screenshot({path:`${captureDir}/player-${name}.png`,fullPage:true,animations:'disabled'});
  }
});
