import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'output/web-game/interactive-structures';
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
    const state = structuredClone(window.__qaLatestState); const local = state.players.find((entry) => entry.id === window.__qaRenderer.playerId);
    state.turnIndex = state.players.indexOf(local); state.roundNumber = 2; state.openingRestrictionsActive = false; state.actions = { movesLeft: 2, attackAvailable: true };
    state.terrain.heights.fill(780); state.terrain.floatingPlatforms = []; state.mines = []; state.powerups = [];
    state.players.forEach((player, index) => { player.x = 330 + index * 920; player.y = 771; player.airborne = null; player.supportPlatformId = null; });
    state.objects = [
      { id: 'qa-shield', type: 'shieldGenerator', x: 540, y: 737, groundY: 780, width: 72, height: 86, durability: 3, shieldEnergy: 3, shieldRadius: 185, active: true },
      { id: 'qa-repulsor', type: 'repulsor', x: 820, y: 742, groundY: 780, width: 70, height: 76, durability: 3, pulseRadius: 220, active: true },
      { id: 'qa-terminal', type: 'ammoTerminal', x: 1100, y: 746, groundY: 780, width: 68, height: 68, durability: 3, serviceRadius: 88, active: true },
    ];
    window.__qaState = state; window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', state); window.__qaInjecting = false;
    const renderer = window.__qaRenderer; renderer.setCameraMode('fixed'); renderer.camera.zoom = 1.18; renderer.camera.x = 250; renderer.camera.y = 505; renderer.clampCamera(); renderer.fixedCameraInitialized = true;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${output}/structures-idle.png` });

  await page.evaluate(() => {
    const state = structuredClone(window.__qaState); const shield = state.objects.find((entry) => entry.type === 'shieldGenerator'); const terminal = state.objects.find((entry) => entry.type === 'ammoTerminal');
    shield.shieldEnergy = 2; shield.lastShieldPulse = { serial: 8001, x: shield.x, y: shield.y, radius: 185, targetIds: [state.players[0].id], energy: 2, explosionX: 425, explosionY: 760 };
    terminal.lastRestock = { serial: 8002, playerId: state.players[1].id, weapon: 'heavy', fuel: 55 };
    window.__qaInjecting = true; window.__qaNetwork.emit('GAME_STATE', state); window.__qaInjecting = false;
    const renderer = window.__qaRenderer; renderer.spawnImpactEcho(820, 742, 'gravity', 180);
    renderer.floaters.push({ x: 820, y: 680, text: 'ONDA REPULSORA!', age: 0, life: 2, color: '#d29bff' });
    for (let i = 0; i < 72; i += 1) { const angle = i / 72 * Math.PI * 2; renderer.addParticle({ kind: 'spark', x: 820, y: 742, vx: Math.cos(angle) * 180, vy: Math.sin(angle) * 180, size: 2 + i % 4, color: i % 4 ? '#c89aff' : '#ffffff', gravity: 0, life: .9, bounce: 0, drag: .96 }); }
  });
  await page.waitForTimeout(240);
  await page.screenshot({ path: `${output}/structures-active.png` });
  const stateText = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const types = new Set(stateText.objects.map((object) => object.type));
  for (const type of ['shieldGenerator', 'repulsor', 'ammoTerminal']) if (!types.has(type)) errors.push(`${type} missing from rendered state`);
  if (stateText.objects.find((object) => object.type === 'shieldGenerator')?.shieldEnergy !== 2) errors.push('shield energy was not exposed to render_game_to_text');
  if (!stateText.objects.find((object) => object.type === 'ammoTerminal')?.lastRestock) errors.push('terminal restock was not exposed to render_game_to_text');
  await writeFile(`${output}/results.json`, JSON.stringify({ objects: stateText.objects, errors }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
