import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createGame, publicGame, pulseSpecialistDrones, sanitizeRules, spawnSpecialistDrone } from '../server/game.js';

const room = { rules: sanitizeRules({ seed: 'specialist-visual-qa', powerupCount: 0, enabledEvents: [], mapType: 'flat' }), players: [
  { id: 'pilot', nickname: 'Especialista', classType: 'specialist', color: '#72c9ff' },
  { id: 'target', nickname: 'Alvo', classType: 'armored', color: '#ff775a' },
] };
room.game = createGame(room);
Object.assign(room.game, { phase: 'playing', roundNumber: 2, turnIndex: 0, objects: [], powerups: [], mines: [] });
room.game.terrain.heights.fill(780); room.game.terrain.floatingPlatforms = [];
room.game.players[0].x = 500; room.game.players[0].y = 771;
room.game.players[1].x = 840; room.game.players[1].y = 771;
const drone = spawnSpecialistDrone(room.game, room.game.players[0]);
drone.x = 610; drone.y = 650; drone.groundY = 666;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const destination = 'output/web-game/specialist';
await mkdir(destination, { recursive: true });
try {
  const origin = process.env.QA_URL || 'http://localhost:3109';
  await page.route(`${origin}/qa-specialist`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;background:#08121f"><canvas id="scene" width="1280" height="720" style="width:1280px;height:720px"></canvas></body></html>' }));
  await page.goto(`${origin}/qa-specialist`);
  const state = publicGame(room.game, 'pilot');
  const start = await page.evaluate(async (snapshot) => {
    const { Renderer } = await import('/renderer.js');
    const renderer = new Renderer(document.querySelector('#scene'));
    renderer.setPlayer('pilot'); renderer.setGame(snapshot); renderer.cameraMode = 'fixed'; renderer.fixedCameraInitialized = true;
    renderer.camera = { x: 250, y: 210, zoom: 1 }; renderer.userZoom = 1;
    renderer.specialistSelection = snapshot.objects.find((object) => object.type === 'specialistDrone').id;
    renderer.specialistTarget = { x: 720, y: 540 };
    renderer.draw(performance.now()); window.qaSpecialistRenderer = renderer;
    window.render_game_to_text = () => JSON.stringify({ drones: renderer.game.objects.filter((object) => object.type === 'specialistDrone' && object.active).length, selection: renderer.specialistSelection, bursts: renderer.sentryBursts.length });
    return document.querySelector('canvas').toDataURL('image/png').split(',')[1];
  }, state);
  await writeFile(`${destination}/control-preview.png`, Buffer.from(start, 'base64'));
  const bursts = pulseSpecialistDrones(room.game);
  assert.ok(bursts.length);
  const firing = await page.evaluate((snapshot) => {
    const renderer = window.qaSpecialistRenderer; renderer.specialistSelection = null; renderer.setGame(snapshot);
    renderer.draw(performance.now() + 430);
    return { image: document.querySelector('canvas').toDataURL('image/png').split(',')[1], state: window.render_game_to_text() };
  }, publicGame(room.game, 'pilot'));
  await writeFile(`${destination}/drone-fire.png`, Buffer.from(firing.image, 'base64'));
  assert.equal(JSON.parse(firing.state).drones, 1);
  assert.ok(JSON.parse(firing.state).bursts > 0);
  assert.deepEqual(errors, []);
  console.log(firing.state);
} finally { await browser.close(); }
