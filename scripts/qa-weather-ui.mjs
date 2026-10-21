import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await mkdir('output/web-game/home-weather', { recursive: true });
try {
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(450);
  await page.locator('#audioPromptSkip').click();
  if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
  assert.match(await page.locator('#homeCycleLabel').textContent(), /CENÁRIO EM CICLO/);
  assert.ok(await page.locator('#createForm .primary').isVisible());
  assert.equal(await page.locator('.home-advanced').getAttribute('open'), null);
  await page.locator('.home-advanced > summary').click();
  assert.equal(await page.locator('#teamCountField').isVisible(), false);
  await page.locator('#createForm [name="gameMode"]').selectOption('teams');
  assert.equal(await page.locator('#teamCountField').isVisible(), true);
  await page.locator('#createForm [name="gameMode"]').selectOption('ffa');
  await page.locator('.home-advanced > summary').click();
  await page.locator('#libraryButton').click();
  await page.locator('#libraryTabs [data-library="events"]').click();
  const floodCard = page.locator('.library-card').filter({ has: page.locator('h3').filter({ hasText: /^INUNDAÇÃO$/ }) });
  assert.ok(await floodCard.isVisible());
  assert.match(await floodCard.locator('.art-flood').evaluate((node) => getComputedStyle(node).backgroundImage), /event-flood-v1\.png/);
  await page.locator('#libraryClose').click();
  await page.screenshot({ path: 'output/web-game/home-weather/full-home.png', fullPage: true });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mobile.on('pageerror', (error) => errors.push(error.message));
  await mobile.goto('http://localhost:3000'); await mobile.waitForTimeout(450);
  await mobile.locator('#audioPromptSkip').click();
  if (await mobile.locator('#tutorialModal').isVisible()) await mobile.locator('#tutorialClose').click();
  assert.ok(await mobile.locator('#createForm .primary').isVisible());
  await mobile.screenshot({ path: 'output/web-game/home-weather/mobile-home.png', fullPage: true });
  const mobileOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(mobileOverflow <= 2, `horizontal mobile overflow: ${mobileOverflow}px`);
  await mobile.close();

  await page.locator('#trainingStart').click();
  await page.waitForFunction(() => { try { return JSON.parse(window.render_game_to_text()).phase === 'playing'; } catch { return false; } }, { timeout: 22000 });
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(state.arsenal.selected, 'standard');
  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  const canvasSize = await canvas.evaluate((node) => ({ width: node.width, height: node.height }));
  const mapY = box.y + box.height * 36 / canvasSize.height;
  const mapLeft = box.x + box.width * 1110 / canvasSize.width;
  const mapRight = box.x + box.width * 1240 / canvasSize.width;
  await page.mouse.move(mapLeft, mapY); await page.mouse.down(); await page.mouse.move(mapRight, mapY, { steps: 8 }); await page.mouse.up();
  const moved = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.ok(moved.camera.x > state.camera.x + 250, `minimap did not pan: ${state.camera.x} -> ${moved.camera.x}`);
  await page.screenshot({ path: 'output/web-game/home-weather/game-minimap.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ homeCycle: true, mobileOverflow, standardSelected: true, minimapPan: [state.camera.x, moved.camera.x], errors }));
} finally {
  await browser.close();
}
