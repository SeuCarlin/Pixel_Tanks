import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const output = 'output/web-game/haptics-check';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
await context.addInitScript(() => {
  window.__hapticCalls = [];
  Object.defineProperty(navigator, 'vibrate', { configurable: true, writable: true, value: (pattern) => { window.__hapticCalls.push(pattern); return true; } });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
try {
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.locator('#audioPromptSkip').click();
  if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
  await page.locator('#createForm [name="nickname"]').fill('Teste Vibração');
  await page.locator('#createForm [name="maxPlayers"]').selectOption('2');
  await page.locator('#createForm [name="botCount"]').selectOption('1');
  await page.locator('#createForm [name="classesEnabled"]').evaluate((input) => { input.checked = false; });
  await page.locator('#createForm button[type="submit"]').click();
  await page.locator('#roomScreen.active').waitFor();
  await page.locator('#arsenalButton').click();
  for (const type of ['heavy', 'cluster', 'jump']) await page.locator(`#arsenalCatalog [data-arsenal="${type}"]`).click();
  await page.locator('#arsenalSave').click();
  await page.locator('#startButton').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', null, { timeout: 30000 });
  await page.locator('#mobileSettingsButton').click();
  await page.locator('#hapticTestButton').click();
  const accepted = await page.evaluate(() => ({ calls: window.__hapticCalls, status: document.querySelector('#hapticStatus').textContent }));
  assert.deepEqual(accepted.calls.at(-1), [140, 80, 140]);
  assert.match(accepted.status, /Comando enviado/);
  await page.screenshot({ path: `${output}/mobile-haptics-supported.png` });
  await page.evaluate(() => { navigator.vibrate = undefined; Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }); });
  await page.locator('#hapticTestButton').click();
  const unsupported = await page.evaluate(() => ({ status: document.querySelector('#hapticStatus').textContent, fallback: document.body.classList.contains('haptic-fallback') }));
  assert.match(unsupported.status, /iPhone.*não oferecem vibração física/);
  assert.equal(unsupported.fallback, true);
  await page.screenshot({ path: `${output}/mobile-haptics-unavailable.png` });
  assert.deepEqual(errors, []);
  await writeFile(`${output}/result.json`, JSON.stringify({ accepted, unsupported, errors }, null, 2));
} finally {
  await browser.close();
}
