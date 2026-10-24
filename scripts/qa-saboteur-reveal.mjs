import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const destination = 'output/web-game/saboteur-reveal';
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

try {
  await page.goto(process.env.QA_URL || 'http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const { GameNetwork } = await import('/network.js');
    const { Renderer } = await import('/renderer.js');
    const originalSetGame = Renderer.prototype.setGame;
    Renderer.prototype.setGame = function (...args) { window.__qaRenderer = this; return originalSetGame.apply(this, args); };
    const originalEmit = GameNetwork.prototype.emit;
    GameNetwork.prototype.emit = function (type, detail) {
      window.__qaNetwork = this;
      if (type === 'GAME_STATE') {
        if (window.__qaFrozen && !window.__qaInjecting) return;
        window.__qaLatestState = structuredClone(detail);
      }
      return originalEmit.call(this, type, detail);
    };
  });
  await page.locator('#audioPromptSkip').click();
  if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
  await page.locator('#trainingStart').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', null, { timeout: 15000 });
  if (await page.locator('#trainingCoach').isVisible()) await page.locator('#trainingClose').click();

  const before = await page.evaluate(() => {
    window.__qaFrozen = true;
    const state = structuredClone(window.__qaLatestState);
    const saboteur = state.players.find((player) => !player.isBot);
    const ninja = state.players.find((player) => player.isBot);
    const target = { x: saboteur.x + 115, y: saboteur.y };
    saboteur.classType = 'saboteur';
    ninja.classType = 'ninja'; ninja.hidden = true; ninja.invisibleTurns = 2;
    ninja.x = null; ninja.y = null;
    ninja.lastNinjaReveal = { serial: 1, x: target.x - 42, y: target.y, reason: 'ghost', expiresRound: state.roundNumber + 2 };
    state.lastSaboteurPulses = [];
    window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', state); window.__qaInjecting = false;
    return { saboteurId: saboteur.id, ninjaId: ninja.id, target };
  });
  await page.waitForTimeout(250);
  const hidden = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(hidden.players.find((player) => player.id === before.ninjaId)?.hidden, true);
  assert.equal(hidden.ninjaGhosts.length, 1);
  await page.screenshot({ path: `${destination}/before.png` });

  await page.evaluate(({ ninjaId, saboteurId, target }) => {
    const state = structuredClone(window.__qaLatestState);
    const ninja = state.players.find((player) => player.id === ninjaId);
    const saboteur = state.players.find((player) => player.id === saboteurId);
    ninja.x = target.x; ninja.y = target.y; ninja.hidden = false; ninja.invisibleTurns = 0;
    ninja.health -= 20;
    ninja.lastNinjaReveal = { serial: 2, x: target.x, y: target.y, reason: 'saboteurPulse' };
    state.lastSaboteurPulses = [{ serial: 1, sourceId: saboteur.id, x: saboteur.x, y: saboteur.y, radius: 760, targetIds: [ninja.id], hits: [{ playerId: ninja.id, amount: 20 }] }];
    window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', state); window.__qaInjecting = false;
  }, before);
  await page.waitForTimeout(650);
  const revealed = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const feedback = await page.evaluate(() => window.__qaRenderer.floaters.map((entry) => entry.text));
  assert.equal(revealed.players.find((player) => player.id === before.ninjaId)?.hidden, false);
  assert.equal(revealed.ninjaGhosts.length, 0);
  assert.ok(feedback.includes('NINJA REVELADO'));
  assert.equal(revealed.lastSaboteurPulses.at(-1).targetIds[0], before.ninjaId);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${destination}/revealed.png` });
  await writeFile(`${destination}/state.json`, JSON.stringify({ hidden: { ninjaGhosts: hidden.ninjaGhosts }, revealed: { ninjaGhosts: revealed.ninjaGhosts, pulse: revealed.lastSaboteurPulses.at(-1), feedback }, errors }, null, 2));
} finally {
  await browser.close();
}
