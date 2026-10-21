import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createGame, publicGame, sanitizeRules } from '../server/game.js';
import { simulateShot } from '../server/physics.js';
import { WORLD } from '../shared/constants.js';

const room = { rules: sanitizeRules({ seed: 'vortex-visual-qa', powerupCount: 0, enabledEvents: [], mapType: 'flat' }), players: [
  { id: 'pilot', nickname: 'Elementalista', classType: 'elementalist', color: '#88e8d8' },
  { id: 'target', nickname: 'Alvo', classType: 'armored', color: '#ff775a' },
] };
room.game = createGame(room);
Object.assign(room.game, { phase: 'playing', roundNumber: 2, turnIndex: 0, objects: [], powerups: [], mines: [] });
room.game.terrain.heights.fill(850); room.game.terrain.floatingPlatforms = [{ id: 'qa-deck', x: 440, baseX: 440, y: 530, width: 120, height: 8, durability: 100, active: true }];
room.game.players[0].x = 500; room.game.players[0].y = 530 - WORLD.tankRadius; room.game.players[0].supportPlatformId = 'qa-deck'; room.game.players[0].platformOffset = 60;
room.game.players[1].x = 1130; room.game.players[1].y = 850 - WORLD.tankRadius;
room.game.windVortices = [{ id: 'qa-vortex', ownerId: 'pilot', x: 700, y: 760, width: 200, height: 600, expiresRound: 3, startRound: 2, fire: false, hitRounds: {} }];
const flight = simulateShot({ terrain: room.game.terrain, players: [], x: 500, y: 500, angle: 0, power: 300, gravity: 120, wind: 0, windVortices: room.game.windVortices });
const liftIndex = flight.path.findIndex((point) => point.vortexLift);
assert.ok(liftIndex > 0);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const destination = 'output/web-game/elemental-vortex';
await mkdir(destination, { recursive: true });
try {
  const origin = process.env.QA_URL || 'http://localhost:3109';
  await page.route(`${origin}/qa-elemental-vortex`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;background:#08121f"><canvas id="scene" width="1280" height="720" style="width:1280px;height:720px"></canvas></body></html>' }));
  await page.goto(`${origin}/qa-elemental-vortex`);
  const preview = await page.evaluate(async ({ state, shot, liftIndex }) => {
    const { Renderer } = await import('/renderer.js');
    const renderer = new Renderer(document.querySelector('#scene'));
    renderer.setPlayer('pilot'); renderer.setGame(state);
    renderer.cameraMode = 'fixed'; renderer.fixedCameraInitialized = true;
    renderer.camera = { x: 250, y: 80, zoom: 1 }; renderer.userZoom = 1;
    renderer.setAim({ angle: 0, power: 300, direction: 1 });
    renderer.draw(performance.now());
    const aimPreview = { image: document.querySelector('canvas').toDataURL('image/png').split(',')[1], impact: renderer.aimPreviewImpact };
    renderer.playShot({ shooterId: 'pilot', results: [{ weapon: 'standard', path: shot.path, impact: shot.impact, radius: 48 }] });
    renderer.shots[0].started = performance.now() - liftIndex / 40 * 1000;
    renderer.draw(performance.now());
    window.qaVortexRenderer = renderer;
    window.render_game_to_text = () => JSON.stringify({ vortices: renderer.game.windVortices.length, lifted: renderer.shots[0]?.vortexDeflected || false, pathLength: shot.path.length, aimImpact: renderer.aimPreviewImpact });
    return aimPreview;
  }, { state: publicGame(room.game, 'pilot'), shot: flight, liftIndex });
  await writeFile(`${destination}/aim-preview.png`, Buffer.from(preview.image, 'base64'));
  assert.ok(Number.isFinite(preview.impact?.x) && Number.isFinite(preview.impact?.y));
  await page.waitForTimeout(150);
  const capture = await page.evaluate(() => { window.qaVortexRenderer.draw(performance.now()); return { image: document.querySelector('canvas').toDataURL('image/png').split(',')[1], state: window.render_game_to_text() }; });
  await writeFile(`${destination}/deflected-shot.png`, Buffer.from(capture.image, 'base64'));
  const fireState = publicGame(room.game, 'pilot');
  fireState.windVortices = fireState.windVortices.map((vortex) => ({ ...vortex, fire: true }));
  const fireCapture = await page.evaluate((state) => { window.qaVortexRenderer.setGame(state); window.qaVortexRenderer.draw(performance.now()); return document.querySelector('canvas').toDataURL('image/png').split(',')[1]; }, fireState);
  await writeFile(`${destination}/fire-vortex.png`, Buffer.from(fireCapture, 'base64'));
  console.log(capture.state);
  assert.equal(JSON.parse(capture.state).vortices, 1);
  assert.equal(JSON.parse(capture.state).lifted, true);
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
