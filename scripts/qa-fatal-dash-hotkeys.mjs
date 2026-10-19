import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'output/web-game/fatal-dash-hotkeys';
await mkdir(output, { recursive: true });
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
      if (type === 'GAME_STATE') { if (window.__qaFrozen && !window.__qaInjecting) return; window.__qaLatestState = structuredClone(detail); }
      return originalEmit.call(this, type, detail);
    };
  });
  await page.locator('#audioPromptSkip').click();
  if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
  await page.locator('#createForm [name="nickname"]').fill('QA Corte');
  await page.locator('#createForm [name="maxPlayers"]').selectOption('2');
  await page.locator('#createForm [name="botCount"]').selectOption('1');
  await page.locator('#createForm button[type="submit"]').click();
  await page.locator('#roomScreen.active').waitFor();
  await page.locator('#arsenalButton').click();
  await page.locator('#classCatalog [data-class-type="ninja"]').click();
  await page.locator('#classNext').click();
  for (const type of ['heavy', 'cluster', 'jump']) await page.locator(`#arsenalCatalog [data-arsenal="${type}"]`).click();
  await page.locator('#arsenalSave').click();
  await page.locator('#startButton').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', null, { timeout: 40000 });

  await page.evaluate(() => {
    window.__qaFrozen = true;
    const state = structuredClone(window.__qaLatestState);
    const localId = JSON.parse(window.render_game_to_text()).localPlayerId;
    state.turnIndex = state.players.findIndex((player) => player.id === localId);
    state.turnNumber += 1; state.roundNumber = 2; state.openingRestrictionsActive = false;
    state.actions = { movesLeft: 2, attackAvailable: true }; state.shotEndsAt = null;
    window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', state); window.__qaInjecting = false;
  });
  const choices = [];
  for (const key of ['q', 'w', 'e', 'c']) {
    await page.keyboard.press(key);
    choices.push(JSON.parse(await page.evaluate(() => window.render_game_to_text())).arsenal.selected);
  }
  if (choices.join(',') !== 'heavy,cluster,jump,ninjaFatal') errors.push(`Keyboard arsenal order: ${choices.join(',')}`);
  await page.evaluate(() => {
    const state = structuredClone(window.__qaLatestState);
    const player = state.players.find((entry) => entry.id === window.__qaRenderer.playerId);
    player.inventory = ['teleport', 'bigExplosion', 'guidedBullet']; player.selectedPowerups = [];
    state.turnIndex = state.players.indexOf(player); state.roundNumber = 2; state.openingRestrictionsActive = false;
    state.actions = { movesLeft: 2, attackAvailable: true };
    window.__qaPowerKeys = [];
    const originalSend = window.__qaNetwork.send.bind(window.__qaNetwork);
    window.__qaNetwork.send = (type, payload) => type === 'SELECT_POWERUP' ? window.__qaPowerKeys.push(payload.type) : originalSend(type, payload);
    window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', state); window.__qaInjecting = false;
  });
  for (const key of ['1', '2', '3']) await page.keyboard.press(key);
  const powerKeys = await page.evaluate(() => window.__qaPowerKeys);
  if (powerKeys.join(',') !== 'teleport,bigExplosion,guidedBullet') errors.push(`Keyboard powerup order: ${powerKeys.join(',')}`);

  const preview = await page.evaluate(() => {
    const renderer = window.__qaRenderer; const player = renderer.game.players.find((entry) => entry.id === renderer.playerId);
    const world = { x: player.x + (player.x < 2000 ? 320 : -320), y: player.y };
    const rect = renderer.canvas.getBoundingClientRect();
    const screenX = rect.left + (world.x - renderer.camera.x) * renderer.camera.zoom * rect.width / renderer.canvas.width;
    const screenY = rect.top + (world.y - renderer.camera.y) * renderer.camera.zoom * rect.height / renderer.canvas.height;
    return renderer.setNinjaFatalTarget(screenX, screenY);
  });
  if (!preview?.length || preview.length > 340) errors.push(`Fatal preview invalid: ${JSON.stringify(preview)}`);
  await page.screenshot({ path: `${output}/aimed-dash.png` });

  await page.evaluate(() => {
    const state = structuredClone(window.__qaLatestState);
    const renderer = window.__qaRenderer;
    const ninja = state.players.find((entry) => entry.id === renderer.playerId);
    const victim = state.players.find((entry) => entry.id !== ninja.id);
    state.turnIndex = state.players.indexOf(ninja); state.turnNumber += 1; state.roundNumber = 2; state.openingRestrictionsActive = false;
    state.actions = { movesLeft: 0, attackAvailable: false };
    victim.x = ninja.x + 90; victim.y = ninja.y; victim.health = 0; victim.alive = false;
    state.lastNinjaStrike = { serial: 90001, sourceId: ninja.id, targetId: victim.id, activation: 2, fromX: ninja.x, fromY: ninja.y, toX: ninja.x + 130, toY: ninja.y, hitX: victim.x, hitY: victim.y, hits: [{ playerId: victim.id, x: victim.x, y: victim.y, damage: 80, eliminated: true }], damage: 80, startedAt: Date.now(), concealed: false, revealComplete: true };
    state.shotEndsAt = Date.now() + 5800;
    window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', state); window.__qaInjecting = false;
  });
  await page.waitForTimeout(2050);
  await page.screenshot({ path: `${output}/split-mid.png` });
  const during = await page.evaluate(() => { const r = window.__qaRenderer; const target = r.game.lastNinjaStrike.targetId; return Boolean(r.visualPlayers.get(target)?.splitDeath); });
  if (!during) errors.push('The split phase was not active before three seconds');
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `${output}/after-explosion.png` });
  const after = await page.evaluate(() => { const r = window.__qaRenderer; const target = r.game.lastNinjaStrike.targetId; const visual = r.visualPlayers.get(target); return { split: Boolean(visual?.splitDeath), alive: visual?.visualAlive }; });
  if (after.split || after.alive !== false) errors.push(`The split did not conclude into an explosion: ${JSON.stringify(after)}`);
  await writeFile(`${output}/results.json`, JSON.stringify({ choices, powerKeys, preview: { length: preview?.length, hits: preview?.hits?.length }, during, after, errors }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
