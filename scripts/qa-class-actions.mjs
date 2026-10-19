import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const destination = 'output/web-game/class-actions';
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
try {
  await page.goto('http://localhost:3001', { waitUntil: 'domcontentloaded' });
  await page.locator('#audioPromptSkip').click();
  if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
  await page.locator('#createForm [name="nickname"]').fill('QA Ninja');
  await page.locator('#createForm [name="maxPlayers"]').selectOption('2');
  await page.locator('#createForm [name="botCount"]').selectOption('1');
  await page.locator('#createForm [name="classesEnabled"]').evaluate((input) => { input.checked = true; });
  await page.locator('#createForm button[type="submit"]').click();
  await page.locator('#roomScreen.active').waitFor({ timeout: 10000 });
  await page.locator('#arsenalButton').click();
  await page.locator('#classCatalog [data-class-type="ninja"]').click();
  await page.locator('#classNext').click();
  for (const type of ['heavy', 'cluster', 'jump']) await page.locator(`#arsenalCatalog [data-arsenal="${type}"]`).click();
  await page.locator('#arsenalSave').click();
  await page.locator('#startButton').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', null, { timeout: 30000 });
  await page.screenshot({ path: `${destination}/gameplay-desktop.png` });
  await page.evaluate(async () => {
    const { Renderer } = await import('/renderer.js');
    const original = Renderer.prototype.drawNinjaSlashes;
    Renderer.prototype.drawNinjaSlashes = function (context, time) {
      if (!this.__slashProbe && this.game?.phase === 'playing') {
        const target = this.game.players.find((player) => player.id !== this.playerId && player.alive && Number.isFinite(player.x));
        if (target) { this.__slashProbe = true; this.spawnNinjaSlash({ sourceId: this.playerId, targetId: target.id, fromX: target.x - 72, fromY: target.y, toX: target.x, toY: target.y, damage: 80 }); }
      }
      original.call(this, context, time);
    };
  });
  await page.waitForTimeout(480);
  await page.screenshot({ path: `${destination}/ninja-slash-desktop.png` });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => { const button = document.querySelector('#classActionButton'); button.hidden = false; button.disabled = false; button.dataset.action = 'ninjaFatal'; button.innerHTML = '◆ CORTE FATAL <small>BOT • 80 DANO • REVELA VOCÊ</small>'; });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${destination}/class-action-mobile.png` });
  await page.evaluate(() => { const button = document.querySelector('#classActionButton'); button.dataset.action = 'backpackerReroll'; button.innerHTML = '▣ TROCAR ARSENAL <small>3 CARTAS ALEATÓRIAS • 1× NESTA RODADA</small>'; });
  await page.screenshot({ path: `${destination}/backpacker-action-mobile.png` });
  await writeFile(`${destination}/state.json`, await page.evaluate(() => window.render_game_to_text()));
  await writeFile(`${destination}/errors.json`, JSON.stringify(errors, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
