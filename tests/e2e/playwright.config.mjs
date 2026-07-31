import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'.',
  testMatch:'*.spec.mjs',
  timeout:30000,
  expect:{timeout:5000},
  retries:process.env.CI?1:0,
  reporter:process.env.CI?[['line'],['html',{open:'never',outputFolder:'report'}]]:'list',
  use:{baseURL:process.env.BASE_URL||'http://127.0.0.1:4173',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[
    {name:'mobile-chromium',use:{...devices['Pixel 7']}},
    {name:'desktop-chromium',use:{...devices['Desktop Chrome']}},
    {name:'desktop-firefox',use:{...devices['Desktop Firefox']}},
    {name:'mobile-webkit',use:{...devices['iPhone 15']}},
    {name:'desktop-webkit',use:{...devices['Desktop Safari']}}
  ],
  webServer:process.env.BASE_URL?undefined:{command:'node ../../apps/web/scripts/dev.mjs',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI,timeout:30000}
});
