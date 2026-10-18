import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'output/web-game/roulette-construction';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
try {
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.locator('#audioPromptSkip').click();
  if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
  await page.locator('#createForm [name="nickname"]').fill('QA Mobile');
  await page.locator('#createForm [name="maxPlayers"]').selectOption('10');
  await page.locator('#createForm [name="botCount"]').selectOption('9');
  await page.locator('#createForm [name="classesEnabled"]').evaluate((input) => { input.checked = false; });
  await page.locator('#createForm button[type="submit"]').click();
  await page.locator('#roomScreen.active').waitFor({ timeout: 10000 });
  await page.locator('#arsenalButton').click();
  for (const type of ['heavy', 'cluster', 'jump']) await page.locator(`#arsenalCatalog [data-arsenal="${type}"]`).click();
  await page.locator('#arsenalSave').click();
  await page.locator('#startButton').click();
  await page.locator('#rouletteModal').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${output}/terrain-mobile.png` });
  await page.waitForTimeout(6400);
  await page.screenshot({ path: `${output}/ten-tanks-mobile.png` });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', null, { timeout: 15000 });
  await page.screenshot({ path: `${output}/match-started-mobile.png` });
  await writeFile(`${output}/errors.json`, JSON.stringify(errors, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
