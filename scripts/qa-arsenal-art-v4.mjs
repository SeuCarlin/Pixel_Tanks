import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const destination = 'output/web-game/arsenal-art-v4';
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
try {
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.locator('#audioPromptSkip').click();
  if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
  await page.locator('#libraryButton').click();
  await page.locator('[data-library="arsenal"]').click();
  const artwork = await page.locator('#libraryGrid .atlas-arsenal').evaluateAll(async (nodes) => Promise.all(nodes.map(async (node) => {
    const image = getComputedStyle(node).backgroundImage;
    const url = image.match(/url\("?([^"\)]+)"?\)/)?.[1];
    if (!url) return { image, width: 0 };
    const bitmap = new Image(); bitmap.src = url; await bitmap.decode();
    return { image, width: bitmap.naturalWidth, height: bitmap.naturalHeight };
  })));
  if (artwork.length !== 22 || artwork.some((entry) => !entry.image.includes('arsenal-v4') || entry.width !== 320 || entry.height !== 320)) throw new Error('Alguma das 22 artes do arsenal não foi carregada corretamente.');
  for (let row = 0; row < 3; row += 1) {
    await page.locator('#libraryGrid').evaluate((grid, index) => { grid.scrollTop = index * 640; }, row);
    await page.screenshot({ path: `${destination}/library-${row}.png` });
  }
  await page.locator('#libraryClose').click();
  await page.locator('#createForm [name="nickname"]').fill('QA Arte');
  await page.locator('#createForm [name="maxPlayers"]').selectOption('2');
  await page.locator('#createForm [name="botCount"]').selectOption('1');
  await page.locator('#createForm [name="classesEnabled"]').evaluate((input) => { input.checked = false; });
  await page.locator('#createForm button[type="submit"]').click();
  await page.locator('#roomScreen.active').waitFor({ timeout: 10000 });
  await page.locator('#arsenalButton').click();
  for (const type of ['heavy', 'soapBomb', 'harpoon']) await page.locator(`#arsenalCatalog [data-arsenal="${type}"]`).click();
  await page.screenshot({ path: `${destination}/arsenal-selection.png` });
  await page.locator('#arsenalSave').click();
  await page.locator('#startButton').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', null, { timeout: 25000 });
  await page.screenshot({ path: `${destination}/hud-desktop.png` });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({ path: `${destination}/hud-mobile.png` });
  const mobile = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  mobile.on('pageerror', (error) => errors.push(error.message));
  await mobile.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await mobile.locator('#audioPromptSkip').click();
  if (await mobile.locator('#tutorialModal').isVisible()) await mobile.locator('#tutorialClose').click();
  await mobile.locator('#createForm [name="nickname"]').fill('QA Toque');
  await mobile.locator('#createForm [name="maxPlayers"]').selectOption('2');
  await mobile.locator('#createForm [name="botCount"]').selectOption('1');
  await mobile.locator('#createForm [name="classesEnabled"]').evaluate((input) => { input.checked = false; });
  await mobile.locator('#createForm button[type="submit"]').click();
  await mobile.locator('#roomScreen.active').waitFor({ timeout: 10000 });
  await mobile.locator('#arsenalButton').click();
  await mobile.screenshot({ path: `${destination}/arsenal-mobile.png` });
  await mobile.close();
  await writeFile(`${destination}/state.json`, await page.evaluate(() => window.render_game_to_text()));
  await writeFile(`${destination}/errors.json`, JSON.stringify(errors, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
