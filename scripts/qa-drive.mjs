import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const output = 'output/web-game/drive-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
try {
  await page.goto(process.env.GAME_URL || 'http://localhost:3100');
  await page.evaluate(async () => {
    const { GameNetwork } = await import('/network.js');
    const originalEmit = GameNetwork.prototype.emit;
    GameNetwork.prototype.emit = function (type, detail) {
      if (type === 'GAME_STATE') {
        window.__qaNetwork = this;
        window.__qaLatestState = structuredClone(detail);
        if (window.__qaFreeze && !window.__qaInjecting) return;
      }
      return originalEmit.call(this, type, detail);
    };
    const originalSend = GameNetwork.prototype.send;
    GameNetwork.prototype.send = function (type, payload) {
      (window.__qaSent ||= []).push({ type, payload });
      if (!window.__qaFreeze) return originalSend.call(this, type, payload);
    };
  });
  await page.locator('#audioPromptSkip').click();
  if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
  await page.locator('#trainingStart').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', null, { timeout: 15000 });
  if (await page.locator('#trainingClose').isVisible()) await page.locator('#trainingClose').click();
  await page.waitForFunction(() => { const s = JSON.parse(window.render_game_to_text()); return s.phase === 'playing' && s.currentPlayerId === s.localPlayerId; }, null, { timeout: 30000 });
  const before = await state();
  const self = before.players.find((player) => player.id === before.localPlayerId);
  await page.screenshot({ path: `${output}/before.png` });
  await page.keyboard.down('d');
  await page.waitForTimeout(650);
  await page.keyboard.up('d');
  await page.waitForTimeout(180);
  let after = await state();
  let moved = after.players.find((player) => player.id === after.localPlayerId);
  if (moved.x === self.x && moved.y === self.y) {
    await page.keyboard.down('a'); await page.waitForTimeout(650); await page.keyboard.up('a'); await page.waitForTimeout(180);
    after = await state(); moved = after.players.find((player) => player.id === after.localPlayerId);
  }
  await page.screenshot({ path: `${output}/after.png` });
  console.log(JSON.stringify({ before: { x: self.x, y: self.y, fuel: self.fuel, phase: before.phase, turn: before.turn }, after: { x: moved.x, y: moved.y, fuel: moved.fuel, phase: after.phase, turn: after.turn }, errors }, null, 2));
  assert.ok(moved.fuel < self.fuel, `fuel should decrease: ${self.fuel} -> ${moved.fuel}`);
  assert.ok(Math.hypot(moved.x - self.x, moved.y - self.y) > 8, 'held key should move the tank gradually');
  assert.ok(Math.abs(moved.x - self.x) < 180, 'held key should not teleport the tank');
  assert.ok(await page.locator('#fuelFill').evaluate((element) => parseFloat(element.style.width) < 100));
  await page.evaluate(() => {
    const snapshot = structuredClone(window.__qaLatestState);
    const me = snapshot.players.find((player) => player.id === JSON.parse(window.render_game_to_text()).localPlayerId);
    me.arsenal = ['heavy', 'cluster', 'zeus', 'jump'];
    me.ammo = { ...me.ammo, heavy: 1, cluster: 1, zeus: 1, jump: 1 };
    me.inventory = ['doubleShot'];
    snapshot.phase = 'playing'; snapshot.roundNumber = 2; snapshot.openingRestrictionsActive = false; snapshot.turnIndex = snapshot.players.indexOf(me);
    snapshot.actions = { movesLeft: 2, attackAvailable: true }; snapshot.shotEndsAt = null;
    window.__qaFreeze = true; window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', snapshot); window.__qaInjecting = false;
  });
  for (const [key, expected] of [['q', 'heavy'], ['e', 'cluster'], ['r', 'zeus'], ['t', 'jump']]) {
    await page.keyboard.press(key);
    assert.equal((await state()).arsenal.selected, expected, `${key.toUpperCase()} should select ${expected}`);
  }
  await page.keyboard.press('v');
  assert.equal((await state()).arsenal.selected, 'standard', 'V should select standard shot');
  await page.keyboard.press('1');
  const numericCommand = await page.evaluate(() => window.__qaSent.filter((entry) => entry.type === 'SELECT_POWERUP').at(-1));
  assert.equal(numericCommand?.payload?.type, 'doubleShot', '1 should activate the first powerup');
  await page.keyboard.press('y');
  assert.ok(await page.locator('#chatInput').evaluate((input) => document.activeElement === input), 'Y should focus chat');
  assert.deepEqual(errors, []);
  const mobile = await browser.newPage({ viewport: { width: 932, height: 430 }, isMobile: true, hasTouch: true });
  mobile.on('pageerror', (error) => errors.push(String(error)));
  await mobile.goto(process.env.GAME_URL || 'http://localhost:3100');
  await mobile.evaluate(async () => {
    const { GameNetwork } = await import('/network.js');
    const originalEmit = GameNetwork.prototype.emit;
    GameNetwork.prototype.emit = function (type, detail) {
      if (type === 'GAME_STATE') {
        window.__qaNetwork = this; window.__qaLatestState = structuredClone(detail);
        if (window.__qaFreeze && !window.__qaInjecting) return;
      }
      return originalEmit.call(this, type, detail);
    };
    const originalSend = GameNetwork.prototype.send;
    GameNetwork.prototype.send = function (type, payload) {
      (window.__qaSent ||= []).push({ type, payload });
      if (!window.__qaFreeze) return originalSend.call(this, type, payload);
    };
  });
  await mobile.locator('#audioPromptSkip').click();
  if (await mobile.locator('#tutorialModal').isVisible()) await mobile.locator('#tutorialClose').click();
  await mobile.locator('#trainingStart').click();
  await mobile.waitForFunction(() => { const s = JSON.parse(window.render_game_to_text()); return s.phase === 'playing' && s.currentPlayerId === s.localPlayerId; }, null, { timeout: 30000 });
  if (await mobile.locator('#trainingClose').isVisible()) await mobile.locator('#trainingClose').click();
  const mobileBefore = JSON.parse(await mobile.evaluate(() => window.render_game_to_text()));
  const button = mobile.locator('#moveStickRing'); assert.ok(await button.isVisible(), 'movement joystick should be visible on mobile'); const box = await button.boundingBox();
  await mobile.mouse.move(box.x + box.width - 7, box.y + box.height / 2);
  await mobile.mouse.down(); await mobile.waitForTimeout(560); await mobile.mouse.up(); await mobile.waitForTimeout(160);
  const mobileAfter = JSON.parse(await mobile.evaluate(() => window.render_game_to_text()));
  await mobile.screenshot({ path: `${output}/mobile.png` });
  const mobileFuelBefore = mobileBefore.players.find((player) => player.id === mobileBefore.localPlayerId).fuel;
  const mobileFuelAfter = mobileAfter.players.find((player) => player.id === mobileAfter.localPlayerId).fuel;
  assert.ok(mobileFuelAfter < mobileFuelBefore, `mobile joystick should spend fuel: ${mobileFuelBefore} -> ${mobileFuelAfter}`);
  await mobile.evaluate(() => { window.__qaSent = []; });
  const dragBox = await button.boundingBox();
  await mobile.mouse.move(dragBox.x + dragBox.width - 6, dragBox.y + dragBox.height / 2);
  await mobile.mouse.down(); await mobile.waitForTimeout(140);
  await mobile.mouse.move(dragBox.x + 6, dragBox.y + dragBox.height - 8, { steps: 5 });
  await mobile.waitForTimeout(320);
  const dragState = JSON.parse(await mobile.evaluate(() => window.render_game_to_text()));
  await mobile.mouse.up();
  const dragCommands = await mobile.evaluate(() => window.__qaSent.filter((entry) => entry.type === 'MOVE').map((entry) => entry.payload.direction));
  assert.equal(dragState.movement.joystickDirection, 'left', 'ground stick should prioritize horizontal movement despite a vertical finger drift');
  assert.ok(dragCommands.includes(1) && dragCommands.includes(-1), `changing direction during one drag must keep movement packets flowing: ${dragCommands}`);
  await mobile.evaluate(() => {
    const snapshot = structuredClone(window.__qaLatestState);
    const me = snapshot.players.find((player) => player.id === JSON.parse(window.render_game_to_text()).localPlayerId);
    const ground = snapshot.terrain.heights[Math.round(me.x)];
    me.y = ground - 43; me.swimming = true; me.airborne = null; me.motionState = 'swimming'; me.fuel = 120;
    snapshot.waterZones = [{ id: 'qa-lake', x: me.x, radius: 240, surfaceY: ground - 75 }];
    snapshot.turnIndex = snapshot.players.indexOf(me); snapshot.phase = 'playing'; snapshot.shotEndsAt = null;
    window.__qaFreeze = true; window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', snapshot); window.__qaInjecting = false;
  });
  const waterStick = await button.boundingBox();
  for (const [name, y, expected] of [['up', waterStick.y + 7, -1], ['down', waterStick.y + waterStick.height - 7, 1]]) {
    await mobile.mouse.move(waterStick.x + waterStick.width / 2, y);
    await mobile.mouse.down(); await mobile.waitForTimeout(120); await mobile.mouse.up();
    const command = await mobile.evaluate(() => window.__qaSent.filter((entry) => entry.type === 'MOVE').at(-1));
    assert.equal(command?.payload?.vertical, expected, `mobile joystick ${name} should send vertical movement`);
  }
  await mobile.screenshot({ path: `${output}/mobile-water-stick.png` });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ desktop: { before: self.fuel, after: moved.fuel }, mobile: { before: mobileFuelBefore, after: mobileFuelAfter }, errors }, null, 2));
} finally { await browser.close(); }
