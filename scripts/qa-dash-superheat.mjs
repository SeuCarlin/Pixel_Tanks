import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'output/web-game/dash-superheat';
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
  await page.locator('#trainingStart').click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', null, { timeout: 25000 });
  if (await page.locator('#trainingClose').isVisible()) await page.locator('#trainingClose').click();
  await page.evaluate(() => {
    window.__qaFrozen = true;
    const state = structuredClone(window.__qaLatestState);
    const player = state.players.find((entry) => entry.id === window.__qaRenderer.playerId);
    state.turnIndex = state.players.indexOf(player); state.roundNumber = 2; state.openingRestrictionsActive = false;
    state.actions = { movesLeft: 2, attackAvailable: true }; state.shotEndsAt = null;
    state.arenaWarningUntil = 0; player.airborne = null; player.arsenal = ['armoredDash', 'superheat', 'heavy'];
    player.ammo.armoredDash = 1; player.ammo.superheat = 0; player.superheatEnemyTurns = 1;
    window.__qaMoves = [];
    const originalSend = window.__qaNetwork.send.bind(window.__qaNetwork);
    window.__qaNetwork.send = (type, payload) => type === 'MOVE' ? window.__qaMoves.push(payload) : originalSend(type, payload);
    window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', state); window.__qaInjecting = false;
  });
  await page.locator('#weaponSelector [data-weapon="armoredDash"]').click();
  const point = await page.evaluate(() => {
    const renderer = window.__qaRenderer; const player = renderer.game.players.find((entry) => entry.id === renderer.playerId);
    const rect = renderer.canvas.getBoundingClientRect();
    return { x: rect.left + (player.x + 260 - renderer.camera.x) * renderer.camera.zoom * rect.width / renderer.canvas.width,
      y: rect.top + (player.y - renderer.camera.y) * renderer.camera.zoom * rect.height / renderer.canvas.height };
  });
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(250);
  const preview = await page.evaluate(() => ({ direction: window.__qaRenderer.armoredDashDirection(),
    landing: window.__qaRenderer.movementPreviewCache?.landings?.[1],
    hud: JSON.parse(window.render_game_to_text()).fire,
    passive: document.querySelector('#arsenalWeapons [data-weapon="superheat"] b')?.textContent }));
  if (preview.direction !== 1 || !preview.landing?.moved || !preview.hud.enabled || preview.passive !== '1/2') errors.push(`Dash/passive preview: ${JSON.stringify(preview)}`);
  await page.screenshot({ path: `${output}/dash-preview.png` });
  await page.locator('#fireButton').click();
  const moves = await page.evaluate(() => window.__qaMoves);
  if (moves.length !== 1 || moves[0].arsenal !== 'armoredDash' || moves[0].direction !== 1) errors.push(`Dash command: ${JSON.stringify(moves)}`);
  await page.evaluate(() => {
    const state = structuredClone(window.__qaLatestState); const player = state.players.find((entry) => entry.id === window.__qaRenderer.playerId);
    state.lastSuperheatPulse = { serial: 9009, ownerId: player.id, x: player.x, y: player.y, radius: 480, startedAt: Date.now(), duration: 2000 };
    player.superheatEnemyTurns = 0;
    window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', state); window.__qaInjecting = false;
  });
  await page.waitForTimeout(500);
  const heatVisual = await page.evaluate(() => window.__qaRenderer.heatPulses.some((pulse) => pulse.radius === 480));
  if (!heatVisual) errors.push('Expanded passive pulse did not reach the renderer');
  await page.screenshot({ path: `${output}/passive-pulse.png` });
  const mobileContext = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', (error) => errors.push(`mobile: ${error.message}`));
  await mobile.goto(process.env.QA_URL || 'http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await mobile.evaluate(async () => {
    const { GameNetwork } = await import('/network.js'); const { Renderer } = await import('/renderer.js');
    const originalSetGame = Renderer.prototype.setGame;
    Renderer.prototype.setGame = function (...args) { window.__qaRenderer = this; return originalSetGame.apply(this, args); };
    const originalEmit = GameNetwork.prototype.emit;
    GameNetwork.prototype.emit = function (type, detail) { window.__qaNetwork = this; if (type === 'GAME_STATE') { if (window.__qaFrozen && !window.__qaInjecting) return; window.__qaLatestState = structuredClone(detail); } return originalEmit.call(this, type, detail); };
  });
  await mobile.locator('#audioPromptSkip').click();
  if (await mobile.locator('#tutorialModal').isVisible()) await mobile.locator('#tutorialClose').click();
  await mobile.locator('#trainingStart').click();
  await mobile.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', null, { timeout: 25000 });
  if (await mobile.locator('#trainingClose').isVisible()) await mobile.locator('#trainingClose').click();
  await mobile.evaluate(() => {
    window.__qaFrozen = true; const state = structuredClone(window.__qaLatestState);
    const player = state.players.find((entry) => entry.id === window.__qaRenderer.playerId);
    state.turnIndex = state.players.indexOf(player); state.roundNumber = 2; state.openingRestrictionsActive = false;
    state.actions = { movesLeft: 2, attackAvailable: true }; state.shotEndsAt = null; state.arenaWarningUntil = 0;
    player.airborne = null; player.arsenal = ['armoredDash', 'superheat', 'heavy']; player.ammo.armoredDash = 1; player.ammo.superheat = 0;
    window.__qaMoves = []; const originalSend = window.__qaNetwork.send.bind(window.__qaNetwork);
    window.__qaNetwork.send = (type, payload) => type === 'MOVE' ? window.__qaMoves.push(payload) : originalSend(type, payload);
    window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', state); window.__qaInjecting = false;
    const renderer = window.__qaRenderer; renderer.setCameraMode('fixed'); renderer.camera.zoom = renderer.userZoom;
    renderer.camera.x = player.x - 310 / renderer.camera.zoom; renderer.camera.y = player.y - 145 / renderer.camera.zoom;
    renderer.clampCamera(); renderer.fixedCameraInitialized = true;
  });
  await mobile.locator('#weaponSelector [data-weapon="armoredDash"]').click();
  await mobile.waitForTimeout(120);
  const mobilePoint = await mobile.evaluate(() => { const renderer = window.__qaRenderer; const player = renderer.game.players.find((entry) => entry.id === renderer.playerId); const rect = renderer.canvas.getBoundingClientRect(); return { x: rect.left + (player.x - 90 - renderer.camera.x) * renderer.camera.zoom * rect.width / renderer.canvas.width, y: rect.top + (player.y - renderer.camera.y) * renderer.camera.zoom * rect.height / renderer.canvas.height }; });
  const mobileHit = await mobile.evaluate(({ x, y }) => ({ target: document.elementFromPoint(x, y)?.id || document.elementFromPoint(x, y)?.className, canvas: document.querySelector('#gameCanvas').getBoundingClientRect().toJSON(), fire: JSON.parse(window.render_game_to_text()).fire }), mobilePoint);
  await mobile.touchscreen.tap(mobilePoint.x, mobilePoint.y);
  const mobileMoves = await mobile.evaluate(() => window.__qaMoves);
  if (mobileMoves.length !== 1 || mobileMoves[0].direction !== -1 || mobileMoves[0].arsenal !== 'armoredDash') errors.push(`Mobile dash tap: ${JSON.stringify(mobileMoves)}`);
  await mobile.screenshot({ path: `${output}/mobile-dash.png` });
  await mobileContext.close();
  await writeFile(`${output}/results.json`, JSON.stringify({ preview: { direction: preview.direction, landingX: preview.landing?.x, fire: preview.hud, passive: preview.passive }, heatVisual, moves, mobilePoint, mobileHit, mobileMoves, errors }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
