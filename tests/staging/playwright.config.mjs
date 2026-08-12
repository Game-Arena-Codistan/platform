import {defineConfig,devices} from '@playwright/test';

const playerUrl=process.env.STAGING_PLAYER_URL;
const adminUrl=process.env.STAGING_ADMIN_URL;
if(!playerUrl)throw new Error('STAGING_PLAYER_URL is required.');

export default defineConfig({
  testDir:'.',
  testMatch:'*.spec.mjs',
  timeout:45000,
  expect:{timeout:7000},
  retries:0,
  workers:1,
  reporter:[['line'],['html',{open:'never',outputFolder:'report'}],['json',{outputFile:'results.json'}]],
  use:{
    baseURL:playerUrl,
    trace:'off',
    video:'off',
    screenshot:'only-on-failure',
    actionTimeout:10000,
    navigationTimeout:20000
  },
  projects:[
    {name:'desktop-chromium',grep:/@player/,use:{...devices['Desktop Chrome']}},
    {name:'mobile-chromium',grep:/@critical-mobile/,use:{...devices['Pixel 7']}},
    ...(adminUrl?[{name:'admin-chromium',grep:/@admin/,use:{...devices['Desktop Chrome'],baseURL:adminUrl}}]:[])
  ]
});
