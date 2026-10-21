import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createGame, fire, publicGame, sanitizeRules, spawnSpecialistDrone } from '../server/game.js';

const output = 'output/web-game/specialist-guard';
await mkdir(output, { recursive: true });
let before; let after; let shot;
for (let index = 0; index < 16 && !shot; index += 1) {
  const room = { rules: sanitizeRules({ seed: `guard-qa-${index}`, mapType: 'flat', powerupCount: 0, enabledEvents: [] }), players: [
    { id: 'specialist', nickname: 'Especialista', classType: 'specialist', color: '#72c9ff' },
    { id: 'enemy', nickname: 'Atirador', classType: 'healer', color: '#ff715e' },
  ] };
  room.game = createGame(room);
  const game = room.game;
  Object.assign(game, { phase: 'playing', objects: [], mines: [], powerups: [], openingRestrictionsActive: false, roundNumber: 2, turnNumber: 3, turnIndex: 1, wind: 0 });
  game.terrain.heights.fill(980); game.terrain.floatingPlatforms = []; room.rules.gravity = 0;
  game.players[0].x = 700; game.players[0].y = 448;
  game.players[1].x = 100; game.players[1].y = 500; game.players[1].facing = 1;
  spawnSpecialistDrone(game, game.players[0]);
  before = publicGame(game, 'enemy');
  const result = fire(room, 'enemy', { angle: 5, power: 580, direction: 1, weapon: 'standard' })[0];
  if (result.droneIntercept) { shot = result; after = publicGame(game, 'enemy'); }
}
assert.ok(shot?.droneIntercept, 'expected a drone interception');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
try {
  await page.route('http://localhost:3101/qa-specialist-guard', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;background:#07111c"><main style="width:1280px;height:720px"><canvas id="scene" width="1280" height="720"></canvas></main></body></html>' }));
  await page.goto('http://localhost:3101/qa-specialist-guard');
  const visual = await page.evaluate(async ({ before, after, shot }) => {
    const { Renderer } = await import('/renderer.js');
    const renderer = new Renderer(document.querySelector('#scene'));
    renderer.setPlayer('enemy'); renderer.setGame(before);
    renderer.cameraMode = 'fixed'; renderer.fixedCameraInitialized = true;
    renderer.camera = { x: 0, y: 70, zoom: 1 }; renderer.userZoom = 1;
    renderer.playShot({ shooterId: 'enemy', results: [shot] });
    renderer.setGame(after, { deferWorld: true });
    const index = Math.max(0, shot.path.length - 6);
    renderer.shots[0].started = performance.now() - index / 60 * 1000;
    window.guardRenderer = renderer;
    return { index, pathLength: shot.path.length, droneId: shot.droneIntercept.droneId, ownerHealth: after.players.find((player) => player.id === 'specialist').health };
  }, { before, after, shot });
  await page.waitForTimeout(50);
  await page.screenshot({ path: `${output}/guard-dash.png` });
  const state = await page.evaluate(() => ({ index: window.guardRenderer.shotIndex(window.guardRenderer.shots[0], performance.now()), interceptor: window.guardRenderer.shots[0].droneIntercept?.droneId, errorAt: window.guardRenderer.lastRenderErrorAt }));
  await page.waitForTimeout(170);
  await page.screenshot({ path: `${output}/guard-impact.png` });
  const impact = await page.evaluate(() => ({ message: window.guardRenderer.floaters.some((entry) => entry.text === 'DRONE INTERCEPTOU!'), exploded: window.guardRenderer.shots[0]?.exploded }));
  assert.equal(state.interceptor, visual.droneId);
  assert.equal(impact.message, true);
  assert.equal(impact.exploded, true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ visual, state, impact, errors }));
} finally { await browser.close(); }
