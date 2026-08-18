import {test,expect} from '@playwright/test';
import {signInFromAccount,runId} from './helpers.mjs';

test('@player competition hub loads leaderboards and protects premium tournament entry',async({page})=>{
  await page.goto('/#/compete');
  await expect(page.getByRole('heading',{name:/Compete across the Arena/i})).toBeVisible();
  const leaderboard=page.waitForResponse(response=>response.url().includes('/v1/leaderboards/')&&response.request().method()==='GET');
  await page.locator('#leaderboard-game').selectOption({index:1});
  expect((await leaderboard).status()).toBe(200);
  await expect(page.locator('.leaderboard-list')).toBeVisible();

  await page.getByRole('button',{name:'Tournaments'}).click();
  const premiumEntry=page.locator('[data-tournament][data-premium="true"]').first();
  await expect(premiumEntry).toBeVisible();
  await premiumEntry.click();
  await expect(page).toHaveURL(/#\/premium/);
  await expect(page.getByRole('heading',{name:/More games/i})).toBeVisible();
});

test('@player authenticated user can create and rejoin a supported multiplayer room',async({page},testInfo)=>{
  await signInFromAccount(page,testInfo,{label:'multiplayer-room'});
  await page.goto('/#/compete');
  await page.getByRole('button',{name:'Multiplayer'}).click();
  await page.getByRole('button',{name:'Create room'}).click();
  const dialog=page.getByRole('dialog',{name:/Create multiplayer room/i});
  await expect(dialog).toBeVisible();
  const name=`QA ${runId.slice(-12)}`;
  await dialog.locator('#room-name').fill(name);
  const gameOptions=await dialog.locator('#room-game option').count();
  test.skip(gameOptions===0,'No multiplayer-capable game is exposed to the deployed player.');
  await dialog.locator('#room-size').selectOption('2');
  const createResponse=page.waitForResponse(response=>response.url().endsWith('/v1/multiplayer/rooms')&&response.request().method()==='POST');
  await dialog.getByRole('button',{name:'Create room'}).click();
  const response=await createResponse;
  expect(response.status()).toBe(201);
  const payload=await response.json();
  expect(payload.room?.id).toBeTruthy();
  await expect(page.locator('.room-card').filter({hasText:name})).toBeVisible();

  const roomCard=page.locator('.room-card').filter({hasText:name});
  const joinResponse=page.waitForResponse(item=>item.url().includes(`/v1/multiplayer/rooms/${payload.room.id}/join`)&&item.request().method()==='POST');
  await roomCard.getByRole('button',{name:'Join'}).click();
  expect((await joinResponse).status()).toBe(200);
  await expect(roomCard.getByRole('button')).toHaveText('Joined');
  await expect(roomCard.getByRole('button')).toBeDisabled();
});
