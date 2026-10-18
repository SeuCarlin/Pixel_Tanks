import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const destination = 'output/web-game/impact-effects';
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
  await page.locator('#createForm [name="nickname"]').fill('QA Impacto');
  await page.locator('#createForm [name="maxPlayers"]').selectOption('2');
  await page.locator('#createForm [name="botCount"]').selectOption('1');
  await page.locator('#createForm [name="classesEnabled"]').evaluate((input) => { input.checked = false; });
  await page.locator('#createForm button[type="submit"]').click();
  await page.locator('#roomScreen.active').waitFor({ timeout: 10000 });
  await page.locator('#arsenalButton').click();
  for (const type of ['heavy', 'zeus', 'gravity']) await page.locator(`#arsenalCatalog [data-arsenal="${type}"]`).click();
  await page.locator('#arsenalSave').click();
  await page.locator('#startButton').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', null, { timeout: 30000 });
  await page.evaluate(async () => {
    const { Renderer } = await import('/renderer.js');
    const original = Renderer.prototype.drawImpactEchoes;
    Renderer.prototype.drawImpactEchoes = function (context, time) {
      if (!window.__impactProbe && this.__impactProbe) { this.__impactProbe = null; this.impactEchoes.length = 0; }
      if (window.__impactProbe && this.__impactProbe !== window.__impactProbe) {
        this.__impactProbe = window.__impactProbe;
        this.impactEchoes.length = 0;
        const x = this.camera.x + this.canvas.width / (2 * this.camera.zoom);
        const y = this.camera.y + this.canvas.height / (2 * this.camera.zoom);
        this.spawnImpactEcho(x, y, window.__impactProbe.split(':')[0], 105, 2400);
      }
      return original.call(this, context, time);
    };
  });
  for (const kind of ['heavy', 'zeus', 'freeze', 'gravity', 'fireworks', 'seismicCharge']) {
    await page.evaluate((value) => { window.__impactProbe = value; }, kind);
    await page.waitForTimeout(360);
    await page.screenshot({ path: `${destination}/${kind}-desktop.png` });
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(350);
  await page.evaluate(() => { window.__impactProbe = 'freeze:mobile'; });
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${destination}/mobile.png` });
  await page.evaluate(() => { window.__impactProbe = null; });
  if (await page.locator('#rewardModal').isVisible()) await page.locator('#rewardChoices [data-reward]').first().click();
  await page.waitForFunction(() => { const state = JSON.parse(window.render_game_to_text()); return state.currentPlayerId === state.localPlayerId; }, null, { timeout: 35000 });
  await page.locator('#weaponSelector [data-weapon="heavy"]').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).fire.enabled, null, { timeout: 10000 });
  await page.locator('#fireButton').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).shots.some((shot) => shot.weapon === 'heavy'), null, { timeout: 15000 });
  await page.screenshot({ path: `${destination}/real-heavy-shot-mobile.png` });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).shots.some((shot) => shot.weapon === 'heavy' && shot.exploded), null, { timeout: 15000 });
  await page.screenshot({ path: `${destination}/real-heavy-impact-mobile.png` });
  await writeFile(`${destination}/state.json`, await page.evaluate(() => window.render_game_to_text()));
  await writeFile(`${destination}/errors.json`, JSON.stringify(errors, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
