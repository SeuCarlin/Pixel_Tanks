import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const destination = 'output/web-game/oct18-physics-cards';
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
try {
  await page.goto(process.env.QA_URL || 'http://localhost:3001', { waitUntil: 'domcontentloaded' });
  await page.locator('#audioPrompt').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#audioPromptSkip').click();
  if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
  await page.locator('#libraryButton').click();
  await page.locator('#librarySearch').fill('CAIXA DE MUNIÇÃO');
  await page.locator('.library-card').first().waitFor();
  await page.screenshot({ path: `${destination}/ammo-card-desktop.png` });
  await page.locator('[data-library="arsenal"]').click();
  await page.locator('#librarySearch').fill('INTERVENÇÃO');
  await page.screenshot({ path: `${destination}/intervention-card-desktop.png` });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.locator('#librarySearch').fill('ARPÃO');
  await page.screenshot({ path: `${destination}/harpoon-card-mobile.png` });
  await page.locator('#libraryClose').click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#createForm [name="nickname"]').fill('QA Física');
  await page.locator('#createForm [name="maxPlayers"]').selectOption('2');
  await page.locator('#createForm [name="botCount"]').selectOption('1');
  await page.locator('#createForm [name="classesEnabled"]').evaluate((input) => { input.checked = false; });
  await page.locator('#createForm button[type="submit"]').click();
  await page.locator('#roomScreen.active').waitFor({ timeout: 10000 });
  await page.locator('#arsenalButton').click();
  for (const type of ['heavy', 'zeus', 'gravity']) await page.locator(`#arsenalCatalog [data-arsenal="${type}"]`).click();
  await page.screenshot({ path: `${destination}/arsenal-selection.png` });
  await page.locator('#arsenalSave').click();
  await page.locator('#startButton').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', null, { timeout: 30000 });
  await page.screenshot({ path: `${destination}/game-desktop.png` });
  if (await page.locator('#rewardModal').isVisible()) await page.locator('#rewardChoices [data-reward]').first().click();
  await page.locator('#weaponSelector [data-weapon="heavy"]').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).fire.enabled, null, { timeout: 10000 });
  await page.locator('#fireButton').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).shots.some((shot) => shot.weapon === 'heavy'), null, { timeout: 15000 });
  await page.screenshot({ path: `${destination}/heavy-shot.png` });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).shots.some((shot) => shot.weapon === 'heavy' && shot.exploded), null, { timeout: 15000 });
  await page.screenshot({ path: `${destination}/heavy-impact.png` });
  await page.evaluate(async () => {
    const { Renderer } = await import('/renderer.js');
    const original = Renderer.prototype.drawDrills;
    Renderer.prototype.drawDrills = function (context, time) {
      if (!this.__qaDrill) {
        const x = this.camera.x + this.canvas.width / (2 * this.camera.zoom);
        const y = this.camera.y + this.canvas.height / (2 * this.camera.zoom);
        this.drillAnimations.push({ x, y, started: performance.now(), duration: 4000 });
        this.spawnImpactEcho(x, y, 'shockwave', 115, 2200);
        this.__qaDrill = true;
      }
      return original.call(this, context, time);
    };
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${destination}/drill-shock-preview.png` });
  await writeFile(`${destination}/state.json`, await page.evaluate(() => window.render_game_to_text()));
  await writeFile(`${destination}/errors.json`, JSON.stringify(errors, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
