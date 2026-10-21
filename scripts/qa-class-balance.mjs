import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createGame, fire, publicGame, sanitizeRules, spawnSpecialistDrone } from '../server/game.js';

const origin = process.env.QA_URL || 'http://localhost:3127';
const destination = 'output/web-game/class-balance';
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
try {
  await page.route(`${origin}/qa-class-balance`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;background:#08121f"><canvas id="scene" width="1280" height="720"></canvas></body></html>' }));
  await page.goto(`${origin}/qa-class-balance`);
  const room = { rules: sanitizeRules({ seed: 'qa-flames', mapType: 'flat', classesEnabled: true, powerupCount: 0, mines: false, enabledEvents: [] }), players: [
    { id: 'pilot', nickname: 'Incendiário', classType: 'incendiary', color: '#ff8246', arsenal: ['heavy', 'jump', 'zeus'] },
    { id: 'target', nickname: 'Alvo', classType: 'armored', color: '#ff755c', arsenal: ['heavy', 'jump', 'zeus'] },
  ] };
  room.game = createGame(room); Object.assign(room.game, { phase: 'playing', roundNumber: 2, turnIndex: 0, openingRestrictionsActive: false, objects: [], powerups: [], mines: [] });
  room.game.terrain.heights.fill(760); room.game.terrain.floatingPlatforms = [];
  const [pilot, target] = room.game.players; pilot.x = 260; pilot.y = 751; pilot.facing = 1; target.x = 480; target.y = 732; target.health = target.maxHealth = 500;
  const results = fire(room, 'pilot', { weapon: 'standard', angle: 5, power: 280, direction: 1 });
  assert.equal(results[0].incendiaryVolley.rays.length, 3);
  const state = publicGame(room.game, 'pilot');
  const visual = await page.evaluate(async ({ state, results }) => {
    const { Renderer } = await import('/renderer.js');
    const renderer = new Renderer(document.querySelector('#scene')); window.qaRenderer = renderer;
    renderer.setPlayer('pilot'); renderer.setGame(state);
    renderer.cameraMode = 'fixed'; renderer.fixedCameraInitialized = true; renderer.camera = { x: 0, y: 200, zoom: 1 }; renderer.userZoom = 1;
    renderer.playShot({ shooterId: 'pilot', results });
    renderer.draw(performance.now() + 310);
    window.render_game_to_text = () => JSON.stringify({ class: renderer.game.players[0].classType, flameRays: renderer.flameVolleys.length, arenaWidth: renderer.game.terrain.arenaWidth });
    return { state: window.render_game_to_text(), image: document.querySelector('#scene').toDataURL('image/png').split(',')[1] };
  }, { state, results });
  await writeFile(`${destination}/incendiary-flames.png`, Buffer.from(visual.image, 'base64'));
  assert.equal(JSON.parse(visual.state).flameRays, 1);

  const archipelago = { rules: sanitizeRules({ seed: 'qa-archipelago', mapType: 'archipelago', classesEnabled: true, powerupCount: 0, mines: false, enabledEvents: [] }), players: room.players };
  archipelago.game = createGame(archipelago); archipelago.game.phase = 'playing';
  const islandImage = await page.evaluate((snapshot) => {
    const renderer = window.qaRenderer; renderer.flameVolleys = []; renderer.shots = []; renderer.muzzleBursts = []; renderer.floaters = []; renderer.setPlayer('pilot'); renderer.setGame(snapshot);
    renderer.cameraMode = 'fixed'; renderer.fixedCameraInitialized = true; renderer.camera = { x: 0, y: 0, zoom: .4 }; renderer.userZoom = .4; renderer.clampCamera();
    renderer.draw(performance.now());
    window.render_game_to_text = () => JSON.stringify({ biome: snapshot.terrain.type, width: snapshot.terrain.arenaWidth, lakes: snapshot.waterZones.length });
    return document.querySelector('#scene').toDataURL('image/png').split(',')[1];
  }, publicGame(archipelago.game, 'pilot'));
  await writeFile(`${destination}/archipelago.png`, Buffer.from(islandImage, 'base64'));
  const lobbyPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  lobbyPage.on('pageerror', (error) => errors.push(error.message));
  lobbyPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await lobbyPage.goto(origin);
  await lobbyPage.click('#audioPromptSkip');
  if (await lobbyPage.locator('#tutorialModal').isVisible()) await lobbyPage.click('#tutorialClose');
  await lobbyPage.fill('#createForm [name="nickname"]', 'QA Cenário');
  await lobbyPage.selectOption('#createForm [name="maxPlayers"]', '2');
  await lobbyPage.click('#createForm .home-advanced > summary');
  await lobbyPage.selectOption('#createForm [name="mapType"]', 'archipelago');
  await lobbyPage.click('#createForm button.primary[type="submit"]');
  await lobbyPage.waitForFunction(() => document.querySelector('#scenarioName')?.textContent?.includes('ARQUIPÉLAGO'));
  assert.match(await lobbyPage.locator('#scenarioDetails').innerText(), /3200 BLOCOS.*CANAIS DE ÁGUA/);
  await lobbyPage.screenshot({ path: `${destination}/lobby-scenario.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log(visual.state);
} finally { await browser.close(); }
