import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const destination = 'output/web-game/ninja-bomber-reveal';
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
  await page.locator('#createForm [name="nickname"]').fill('QA Ninja');
  await page.locator('#createForm [name="maxPlayers"]').selectOption('4');
  await page.locator('#createForm [name="botCount"]').selectOption('2');
  await page.locator('#createForm button[type="submit"]').click();
  await page.locator('#roomScreen.active').waitFor();
  await page.locator('#arsenalButton').click();
  await page.locator('#classCatalog [data-class-type="ninja"]').click();
  await page.locator('#classNext').click();
  for (const type of ['heavy', 'cluster', 'jump']) await page.locator(`#arsenalCatalog [data-arsenal="${type}"]`).click();
  await page.locator('#arsenalSave').click();
  await page.locator('#startButton').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', null, { timeout: 35000 });

  await page.evaluate(() => {
    window.__qaFrozen = true;
    const state = structuredClone(window.__qaLatestState);
    const ninja = state.players.find((player) => player.isBot);
    const target = state.players.find((player) => !player.isBot);
    const fromX = ninja.x; const fromY = ninja.y;
    ninja.classType = 'ninja'; ninja.invisibleTurns = 2; ninja.hidden = true; ninja.x = null; ninja.y = null;
    target.x = fromX + 80; target.y = fromY;
    state.lastNinjaStrike = { serial: 900, sourceId: ninja.id, targetId: target.id, fromX, fromY, toX: target.x, toY: target.y, damage: 100, concealed: true, revealComplete: false, startedAt: Date.now() };
    window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', state); window.__qaInjecting = false;
  });
  await page.waitForTimeout(740);
  await page.screenshot({ path: `${destination}/ninja-hidden-slash.png` });
  const hiddenState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const hiddenVisual = await page.evaluate(() => { const ninja = window.__qaRenderer.game.players.find((player) => player.classType === 'ninja' && player.isBot); return window.__qaRenderer.visualPlayers.get(ninja.id)?.hidden; });
  if (!hiddenVisual || hiddenState.players.find((player) => player.classType === 'ninja' && player.id !== hiddenState.localPlayerId)?.x !== null) errors.push('Cloaked Ninja leaked a visible position during the slash');

  await page.evaluate(() => {
    window.__qaRenderer.ninjaSlashes = []; window.__qaRenderer.floaters = []; window.__qaRenderer.particles = [];
    const state = structuredClone(window.__qaLatestState);
    const ninja = state.players.find((player) => player.isBot);
    const local = state.players.find((player) => !player.isBot);
    const oldX = local.x + 85; const oldY = local.y;
    ninja.classType = 'ninja'; ninja.invisibleTurns = 2; ninja.hidden = true;
    ninja.x = null; ninja.y = null; ninja.lastSafeX = null; ninja.lastSafeY = null;
    ninja.lastNinjaReveal = { serial: 905, x: oldX, y: oldY, reason: 'shot', expiresRound: state.roundNumber + 2 };
    state.lastNinjaStrike = null;
    window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', state); window.__qaInjecting = false;
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${destination}/ninja-fixed-ghost.png` });
  const ghostState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  if (ghostState.ninjaGhosts.length !== 1 || ghostState.players.find((player) => player.id === ghostState.ninjaGhosts[0].id)?.x !== null) errors.push('The firing ghost did not remain fixed while the Ninja stayed hidden');

  await page.evaluate(() => {
    window.__qaRenderer.ninjaSlashes = [];
    window.__qaRenderer.floaters = [];
    window.__qaRenderer.particles = [];
    const state = structuredClone(window.__qaLatestState);
    const ninja = state.players.find((player) => player.classType === 'ninja' && !player.isBot);
    const target = state.players.find((player) => player.id !== ninja.id);
    ninja.invisibleTurns = 0;
    ninja.lastNinjaRevealRound = state.roundNumber;
    target.x = ninja.x + 85; target.y = ninja.y; target.health = Math.max(1, target.health - 100);
    state.lastNinjaStrike = { serial: 902, sourceId: ninja.id, targetId: target.id, fromX: ninja.x, fromY: ninja.y, toX: target.x, toY: target.y, damage: 100 };
    window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', state); window.__qaInjecting = false;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${destination}/ninja-reveal.png` });
  const ninjaState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  if (ninjaState.lastNinjaStrike?.damage !== 100 || !ninjaState.players.some((player) => player.classType === 'ninja' && player.x != null)) errors.push('Ninja reveal did not reach browser state');

  await page.evaluate(() => {
    const state = structuredClone(window.__qaLatestState);
    window.__qaRenderer.shots = [];
    window.__qaRenderer.ninjaSlashes = [];
    window.__qaRenderer.particles = [];
    window.__qaRenderer.impactEchoes = [];
    window.__qaRenderer.floaters = [];
    const bomber = state.players.find((player) => player.isBot);
    const ninja = state.players.find((player) => player.classType === 'ninja' && !player.isBot);
    bomber.classType = 'bomber'; bomber.x = ninja.x + 90; bomber.y = ninja.y; bomber.health = 0; bomber.alive = false;
    state.bomberDetonations = [{ serial: 903, playerId: bomber.id, x: bomber.x, y: bomber.y, radius: 160, damage: 80, hits: [{ playerId: ninja.id, amount: 80 }], interactions: [] }];
    window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', state); window.__qaInjecting = false;
  });
  await page.waitForFunction(() => document.querySelector('#combatFeedEntries')?.textContent.includes('BOMBARDEIRO: DETONAÇÃO'), null, { timeout: 20000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${destination}/bomber-detonation.png` });
  const bomberState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  if (bomberState.bomberDetonations?.at(-1)?.damage !== 80) errors.push('Bomber detonation did not reach browser state');
  await writeFile(`${destination}/states.json`, JSON.stringify({ hidden: hiddenState, ghost: ghostState, ninja: ninjaState, bomber: bomberState, errors }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
