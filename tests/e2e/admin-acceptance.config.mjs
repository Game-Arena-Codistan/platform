import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'admin-acceptance.qa.mjs',workers:1,retries:0,timeout:90000,reporter:'list',use:{baseURL:'http://127.0.0.1:8095',browserName:'chromium',acceptDownloads:true}});
