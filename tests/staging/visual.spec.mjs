import {mkdir} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

const captureDir=process.env.VISUAL_CAPTURE_DIR||'visual-captures';

test.beforeAll(async()=>{await mkdir(captureDir,{recursive:true});});

test('@visual player critical surfaces',async({page})=>{
  for(const [name,hash,heading] of [
    ['home','#/home',/Play instantly/i],
    ['library','#/library',/Games/i],
    ['premium','#/premium',/More games/i],
    ['support','#/support',/How can we help/i]
  ]){
    await page.goto(`/${hash}`);
    await expect(page.getByRole('heading',{name:heading}).first()).toBeVisible();
    await page.screenshot({path:`${captureDir}/player-${name}.png`,fullPage:true,animations:'disabled'});
  }
});
