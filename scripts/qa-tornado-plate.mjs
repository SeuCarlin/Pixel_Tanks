import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { applyArenaPulse, createGame, fire, publicGame, sanitizeRules, tickRoom } from '../server/game.js';

const output = 'output/web-game/tornado-plate';
await mkdir(output, { recursive: true });
const room = { rules: sanitizeRules({ seed: 'qa-tornado-plate', mapType: 'flat', powerupCount: 0, enabledEvents: ['gale'] }), players: [
  { id: 'one', nickname: 'QA', classType: 'healer', color: '#5de0e5', arsenal: ['windPlate', 'heavy', 'jump'] },
  { id: 'two', nickname: 'Alvo', classType: 'attacker', color: '#ff805c' },
] };
room.game = createGame(room);
Object.assign(room.game, { phase: 'playing', turnIndex: 0, roundNumber: 2, turnNumber: 3, openingRestrictionsActive: false, objects: [], mines: [], powerups: [] });
room.game.terrain.heights.fill(700); room.game.terrain.floatingPlatforms = [];
room.game.players[0].x = 500; room.game.players[0].y = 691;
room.game.players[1].x = 1800; room.game.players[1].y = 691;
room.game.players[0].ammo.windPlate = 1;
const [shot] = fire(room, 'one', { weapon: 'windPlate', angle: 36, power: 300, direction: 1 });
const plate = room.game.windVortices[0];
plate.appearsAt = Date.now() - 1000; plate.updatedAt = plate.appearsAt;
const plateState = publicGame(room.game, 'one');
let gale;
for (let seed = 0; seed < 50 && !gale; seed += 1) {
  room.game.seed = `qa-gale-${seed}`;
  const event = applyArenaPulse(room, { forcedType: 'gale' });
  if (event.tornadoes.length) gale = event;
}
assert.ok(gale);
room.game.pendingArenaEvent = { eventId: gale.id, executeAt: Date.now() - 1 };
tickRoom(room);
for (const tornado of room.game.windVortices.filter((entry) => entry.source === 'gale')) tornado.appearsAt = Date.now() - 500;
const galeState = publicGame(room.game, 'one');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
try {
  const url = process.env.QA_URL || 'http://localhost:3000';
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('#audioPromptSkip').click();
  if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
  await page.locator('#libraryButton').click();
  await page.locator('[data-library="arsenal"]').click();
  await page.locator('#librarySearch').fill('PLACA TORNADO');
  const plateCard = page.locator('#libraryGrid .library-card');
  assert.equal(await plateCard.count(), 1);
  assert.ok((await plateCard.locator('.atlas-art').evaluate((node) => getComputedStyle(node).backgroundImage)).includes('windPlate.png'));
  await plateCard.screenshot({ path: `${output}/plate-card.png` });
  await page.locator('[data-library="events"]').click();
  await page.locator('#librarySearch').fill('TEMPO DE FLORA');
  const floraCard = page.locator('#libraryGrid .library-card');
  assert.equal(await floraCard.count(), 1);
  assert.ok((await floraCard.locator('.atlas-art').evaluate((node) => getComputedStyle(node).backgroundImage)).includes('flora-event-v1.png'));
  await floraCard.screenshot({ path: `${output}/flora-card.png` });

  await page.route('**/qa-tornado-plate', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;background:#081626"><div style="width:1280px;height:720px"><canvas id="scene" width="1280" height="720" style="width:1280px;height:720px;image-rendering:pixelated"></canvas></div></body></html>' }));
  await page.goto(`${url}/qa-tornado-plate`);
  await page.evaluate(async ({ state, x }) => {
    const { Renderer } = await import('/renderer.js');
    const renderer = new Renderer(document.querySelector('#scene'));
    renderer.setPlayer('one'); renderer.setGame(state);
    renderer.cameraMode = 'fixed'; renderer.fixedCameraInitialized = true;
    renderer.camera.zoom = 1; renderer.camera.x = x - 640; renderer.camera.y = 0; renderer.clampCamera();
    window.qaRenderer = renderer;
  }, { state: plateState, x: plate.x });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${output}/plate-active.png` });
  assert.equal(await page.evaluate(() => window.qaRenderer.lastRenderErrorAt), -Infinity);

  await page.evaluate(({ state, event }) => {
    const renderer = window.qaRenderer;
    renderer.setGame(state);
    renderer.cameraMode = 'dynamic'; renderer.camera.zoom = .48; renderer.camera.x = 0; renderer.camera.y = 0; renderer.clampCamera();
    renderer.playArenaEvent({ ...event, warning: false, galeMoves: [] });
  }, { state: galeState, event: gale });
  await page.waitForTimeout(1250);
  await page.screenshot({ path: `${output}/gale-two-tornadoes.png` });
  assert.equal(await page.evaluate(() => window.qaRenderer.lastRenderErrorAt), -Infinity);
  assert.deepEqual(errors, []);
  await writeFile(`${output}/qa-state.json`, JSON.stringify({ plate: { x: plate.x, y: plate.y, width: plate.width, height: plate.height, expiresRound: plate.expiresRound, shotImpact: shot.impact }, gale: { sites: gale.tornadoes, ids: gale.tornadoIds }, errors }, null, 2));
} finally { await browser.close(); }
