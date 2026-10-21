import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'output/web-game/spider-ninja';
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
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', null, { timeout: 25000 });
  if (await page.locator('#trainingClose').isVisible()) await page.locator('#trainingClose').click();

  await page.evaluate(() => {
    window.__qaFrozen = true;
    const state = structuredClone(window.__qaLatestState);
    const player = state.players.find((entry) => entry.id === window.__qaRenderer.playerId);
    state.turnIndex = state.players.indexOf(player); state.roundNumber = 2; state.openingRestrictionsActive = false;
    state.actions = { movesLeft: 3, attackAvailable: true }; state.shotEndsAt = null; state.arenaWarningUntil = 0;
    state.terrain.heights.fill(760);
    state.terrain.floatingPlatforms = [{ id: 'qa-deck', x: 550, baseX: 550, y: 500, width: 210, height: 10, active: true, durability: 100, moving: false }];
    state.objects = []; player.x = 400; player.y = 751; player.airborne = null; player.supportPlatformId = null; player.platformOffset = null;
    player.wallClinging = null; player.ceilingClinging = null; player.surfaceClinging = null; player.spiderClimb = false;
    player.arsenal = ['spider', 'jump', 'heavy']; player.ammo.spider = 1;
    window.__qaMoves = [];
    const originalSend = window.__qaNetwork.send.bind(window.__qaNetwork);
    window.__qaNetwork.send = (type, payload) => type === 'MOVE' ? window.__qaMoves.push(payload) : originalSend(type, payload);
    window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', state); window.__qaInjecting = false;
    const renderer = window.__qaRenderer; renderer.setCameraMode('fixed'); renderer.camera.zoom = 1.1;
    renderer.camera.x = 220; renderer.camera.y = 250; renderer.clampCamera(); renderer.fixedCameraInitialized = true;
  });

  await page.locator('#weaponSelector [data-weapon="spider"]').click();
  const target = await page.evaluate(() => {
    const renderer = window.__qaRenderer; const rect = renderer.canvas.getBoundingClientRect();
    return { x: rect.left + (700 - renderer.camera.x) * renderer.camera.zoom * rect.width / renderer.canvas.width,
      y: rect.top + (519 - renderer.camera.y) * renderer.camera.zoom * rect.height / renderer.canvas.height };
  });
  await page.mouse.move(target.x, target.y);
  await page.waitForTimeout(350);
  const preview = await page.evaluate(() => ({ preview: window.__qaRenderer.spiderLeapPreview(), text: JSON.parse(window.render_game_to_text()), coach: document.querySelector('#aimCoach small')?.textContent }));
  if (!preview.preview?.valid || preview.preview.path.surface !== 'platform-bottom' || preview.preview.path.ceilingClinging !== 'qa-deck') errors.push(`Spider underside preview: ${JSON.stringify(preview.preview)}`);
  if (!preview.coach?.includes('380')) errors.push(`Spider range coach: ${preview.coach}`);
  await page.screenshot({ path: `${output}/underside-preview.png` });
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(150);
  const moves = await page.evaluate(() => window.__qaMoves);
  if (moves.length !== 1 || moves[0].arsenal !== 'spider' || Math.round(moves[0].targetX) !== 700 || Math.round(moves[0].targetY) !== 519) errors.push(`Spider command: ${JSON.stringify(moves)}`);

  const transitions = await page.evaluate(async () => {
    const { walkPath } = await import('/shared/movement.js');
    const state = structuredClone(window.__qaLatestState); const player = state.players.find((entry) => entry.id === window.__qaRenderer.playerId);
    const underside = window.__qaRenderer.spiderLeapPreview({ x: 700, y: 519 }).path;
    Object.assign(player, { x: underside.x, y: underside.y, spiderClimb: true, ceilingClinging: underside.ceilingClinging, surfaceClinging: null, supportPlatformId: null,
      lastLaunch: { serial: 9101, kind: 'spiderLeap', fromX: 400, fromY: 751, toX: underside.x, toY: underside.y, surface: underside.surface, arcHeight: underside.arcHeight } });
    window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', state); window.__qaInjecting = false;
    const top = walkPath(state.terrain, player, -1, 200, state.objects);
    window.__qaTopState = structuredClone(state); Object.assign(window.__qaTopState.players.find((entry) => entry.id === player.id), top, { spiderClimb: true });
    return { underside: { x: underside.x, y: underside.y, surface: underside.surface, ceilingClinging: underside.ceilingClinging }, top };
  });
  await page.waitForTimeout(1050);
  await page.screenshot({ path: `${output}/clinging-under-platform.png` });
  if (transitions.top.supportPlatformId !== 'qa-deck' || transitions.top.ceilingClinging !== null || transitions.top.y !== 491) errors.push(`Underside-to-top transition: ${JSON.stringify(transitions)}`);
  await page.evaluate(() => { window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', window.__qaTopState); window.__qaInjecting = false; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${output}/returned-to-top.png` });

  const ninja = await page.evaluate(async () => {
    const { CLASS_DEFS, CLASS_POWERUP_SYNERGY } = await import('/shared/constants.js');
    return { description: CLASS_DEFS.ninja.description, affinity: CLASS_POWERUP_SYNERGY.ninja };
  });
  if (/blink/i.test(ninja.description) || ninja.affinity.includes('lightningStep')) errors.push(`Ninja still grants Blink: ${JSON.stringify(ninja)}`);
  const finalText = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  if (finalText.players.find((entry) => entry.id === finalText.localPlayerId)?.surfaceClinging) errors.push('Top transition left a stale surface grip.');
  await writeFile(`${output}/results.json`, JSON.stringify({ preview: { surface: preview.preview?.path?.surface, range: preview.preview?.range, coach: preview.coach }, moves, transitions, ninja, finalText, errors }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
