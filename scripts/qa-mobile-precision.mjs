import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import WebSocket from 'ws';
import { barrelRadians } from '../shared/tank-barrel.js';

const output = 'output/web-game/mobile-precision';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
let spectator;
const remoteAimUpdates = [];
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const aimDistance = (a, b) => {
  const vector = (aim) => ({ x: Math.cos(aim.angle * Math.PI / 180) * aim.power * aim.direction, y: -Math.sin(aim.angle * Math.PI / 180) * aim.power });
  const first = vector(a); const second = vector(b);
  return Math.hypot(second.x - first.x, second.y - first.y);
};
const barrelError = (state) => {
  const rendered = state.tankAim.find((tank) => tank.id === state.localPlayerId)?.renderedRadians;
  if (!Number.isFinite(rendered)) return Infinity;
  const expected = barrelRadians(state.aim.angle, state.aim.direction);
  return Math.abs(Math.atan2(Math.sin(rendered - expected), Math.cos(rendered - expected)));
};

async function dragTouch(x, y, dx, dy) {
  const session = await page.context().newCDPSession(page);
  const point = (offsetX, offsetY) => [{ x: Math.round(x + offsetX), y: Math.round(y + offsetY), id: 1 }];
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(0, 0) });
  for (let step = 1; step <= 5; step += 1) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(dx * step / 5, dy * step / 5) });
    await page.waitForTimeout(20);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}

try {
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.locator('#audioPromptSkip').click();
  if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
  await page.locator('#trainingStart').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', null, { timeout: 15000 });
  spectator = new WebSocket('ws://localhost:3000');
  spectator.on('message', (raw) => { const message = JSON.parse(String(raw)); if (message.type === 'AIM_UPDATE') remoteAimUpdates.push(message.payload); });
  await once(spectator, 'open');
  spectator.send(JSON.stringify({ type: 'WATCH_ROOM', payload: { code: (await state()).room } }));
  if (await page.locator('#trainingCoach').isVisible()) await page.locator('#trainingClose').click();
  await page.locator('#mobileSettingsButton').click();
  assert.equal((await state()).mobile.precision, 'normal');
  await page.screenshot({ path: `${output}/settings-normal.png` });
  await page.locator('#mobileSettings button[data-mobile-precision="fine"]').click();
  assert.equal((await state()).mobile.precision, 'fine');
  assert.equal(await page.locator('#mobileSettings button[data-mobile-precision="fine"]').getAttribute('aria-pressed'), 'true');
  await page.screenshot({ path: `${output}/settings-precise.png` });
  await page.locator('#mobileSettingsButton').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).fire.enabled, null, { timeout: 30000 });
  const beforeFlip = (await state()).aim;
  await page.locator('#mobileAimReadout').click();
  const afterFlipState = await state();
  const flipped = afterFlipState.aim;
  assert.equal(flipped.direction, -beforeFlip.direction, 'Mostrador deve inverter a direção.');
  assert.equal(flipped.angle, beforeFlip.angle);
  assert.equal(flipped.power, beforeFlip.power);
  await page.waitForTimeout(200);
  assert.ok(remoteAimUpdates.some((update) => update.playerId === afterFlipState.localPlayerId && update.direction === flipped.direction && update.angle === flipped.angle), 'Espectadores devem receber a direção e o ângulo da mira.');
  await page.waitForTimeout(500);
  assert.ok(barrelError(await state()) < .2, 'Cano deve acompanhar a direção invertida.');
  await page.screenshot({ path: `${output}/barrel-flipped.png` });
  await page.locator('#mobileAimReadout').click();
  assert.equal((await state()).aim.direction, beforeFlip.direction);

  const canvas = await page.locator('#gameCanvas').boundingBox();
  if (!canvas) throw new Error('Canvas indisponível.');
  const x = canvas.x + canvas.width * .55; const y = canvas.y + canvas.height * .42;
  const target = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, { x, y });
  assert.equal(target, 'gameCanvas', `Toque interceptado por ${target}`);
  const before = await state();
  await dragTouch(x, y, 115, -80);
  const after = await state();
  assert.ok(aimDistance(before.aim, after.aim) > 15, 'Arrasto preciso deve ajustar a mira.');
  assert.ok(Math.abs(after.aim.angle - before.aim.angle) <= 12, 'Arrasto preciso não pode girar bruscamente.');
  await page.waitForTimeout(350);
  assert.ok(barrelError(await state()) < .2, 'Cano deve acompanhar o ângulo após o arrasto.');
  await page.screenshot({ path: `${output}/aim-precise.png` });

  await page.locator('#mobileSettingsButton').click();
  await page.locator('#mobileSettings button[data-mobile-precision="normal"]').click();
  await page.locator('#mobileSettingsButton').click();
  const beforeNormal = await state();
  await dragTouch(x, y, 115, -80);
  const afterNormal = await state();
  assert.ok(aimDistance(beforeNormal.aim, afterNormal.aim) > aimDistance(before.aim, after.aim) * 1.7, 'Modo normal deve responder mais ao mesmo gesto.');

  await page.locator('#mobileSettingsButton').click();
  await page.locator('#mobileSettings button[data-mobile-aim="stick"]').click();
  await page.locator('#mobileSettings button[data-mobile-precision="fine"]').click();
  await page.locator('#mobileSettingsButton').click();
  const ring = await page.locator('#aimStickRing').boundingBox();
  assert.ok(ring && ring.width > 20, 'Alavanca de mira deve estar visível.');
  const beforeStick = await state();
  await dragTouch(ring.x + ring.width / 2, ring.y + ring.height / 2, 80, -45);
  const afterStick = await state();
  assert.notDeepEqual(afterStick.aim, beforeStick.aim, 'Alavanca em modo preciso deve ajustar a mira.');
  await page.locator('#mobileSettingsButton').click();
  await page.locator('#mobileSettings button[data-mobile-aim="drag"]').click();
  await page.locator('#mobileSettingsButton').click();
  await dragTouch(x, y, 0, 0);
  assert.deepEqual((await state()).aim, afterStick.aim, 'Toque sem arrasto não deve deslocar a mira.');
  await page.screenshot({ path: `${output}/aim-stick-precise.png` });
  await writeFile(`${output}/state.json`, JSON.stringify({ before: before.aim, precise: after.aim, normal: afterNormal.aim, stick: afterStick.aim, mobile: afterStick.mobile, errors }, null, 2));

  const desktop = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  desktop.on('pageerror', (error) => errors.push(error.message));
  await desktop.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await desktop.locator('#audioPromptSkip').click();
  if (await desktop.locator('#tutorialModal').isVisible()) await desktop.locator('#tutorialClose').click();
  await desktop.locator('#trainingStart').click();
  await desktop.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', null, { timeout: 15000 });
  if (await desktop.locator('#trainingCoach').isVisible()) await desktop.locator('#trainingClose').click();
  await desktop.waitForFunction(() => JSON.parse(window.render_game_to_text()).fire.enabled, null, { timeout: 30000 });
  await desktop.locator('#angle').evaluate((input) => { input.value = '70'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await desktop.waitForTimeout(500);
  const desktopState = await desktop.evaluate(() => JSON.parse(window.render_game_to_text()));
  assert.equal(desktopState.aim.angle, 70);
  assert.ok(barrelError(desktopState) < .2, 'Cano deve acompanhar o controle de ângulo no desktop.');
  await desktop.screenshot({ path: `${output}/barrel-desktop.png` });
  assert.deepEqual(errors, []);
} finally { spectator?.close(); await browser.close(); }
