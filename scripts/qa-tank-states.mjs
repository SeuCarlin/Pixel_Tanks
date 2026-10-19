import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const output = 'output/web-game/tank-states';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

try {
  await page.goto(process.env.GAME_URL || 'http://localhost:3100');
  await page.locator('#audioPromptSkip').click();
  if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
  await page.locator('#createForm [name=nickname]').fill('Aranha QA');
  await page.locator('#createForm [name=maxPlayers]').selectOption('2');
  await page.locator('#createForm [name=botCount]').selectOption('1');
  await page.locator('#createForm [name=mapType]').selectOption('flat');
  await page.locator('#createForm [name=powerupCount]').selectOption('0');
  await page.locator('#createForm [name=classesEnabled]').evaluate((input) => { input.checked = false; input.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.locator('#createForm button[type=submit]').click();
  await page.locator('#arsenalButton').click();
  for (const weapon of ['spider', 'heavy', 'jump']) await page.locator(`#arsenalCatalog [data-arsenal=${weapon}]`).click();
  await page.locator('#arsenalSave').click();
  await page.locator('#startButton').click();
  await page.waitForFunction(() => { const s = JSON.parse(window.render_game_to_text()); return s.phase === 'playing' && s.currentPlayerId === s.localPlayerId; }, null, { timeout: 50000 });
  const before = await state();
  const self = before.players.find((player) => player.id === before.localPlayerId);
  assert.equal(before.tankStates.find((entry) => entry.id === self.id).motion, 'grounded');
  await page.locator('#weaponSelector [data-weapon=spider]').click();
  const direction = self.x < 1600 ? 'ArrowRight' : 'ArrowLeft';
  await page.keyboard.down(direction);
  await page.waitForTimeout(1700);
  await page.keyboard.up(direction);
  await page.waitForTimeout(250);
  const after = await state();
  const moved = after.players.find((player) => player.id === after.localPlayerId);
  await page.screenshot({ path: `${output}/spider.png` });
  assert.ok(Math.hypot(moved.x - self.x, moved.y - self.y) > 8, 'Spider should jump or climb while the direction is held');
  assert.ok(['grounded', 'moving', 'wall', 'falling', 'airborne'].includes(after.tankStates.find((entry) => entry.id === self.id).motion));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ before: { x: self.x, y: self.y, state: before.tankStates.find((entry) => entry.id === self.id) }, after: { x: moved.x, y: moved.y, state: after.tankStates.find((entry) => entry.id === self.id) }, errors }, null, 2));
} finally {
  await browser.close();
}
