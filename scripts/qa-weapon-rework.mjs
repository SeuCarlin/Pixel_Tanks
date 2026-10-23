import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createGame, fire, publicGame, sanitizeRules, tickRoom } from '../server/game.js';
import { WORLD } from '../shared/constants.js';

const output = 'output/web-game/weapon-rework-live';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

function roomFor(weapon) {
  const room = { rules: sanitizeRules({ seed: `qa-${weapon}`, powerupCount: 0, enabledEvents: [], mapType: 'flat' }), players: [
    { id: 'one', nickname: 'UM', arsenal: [weapon], color: '#b7ec58' },
    { id: 'two', nickname: 'ALVO', color: '#ff755c' },
  ] };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.roundNumber = 2; room.game.openingRestrictionsActive = false;
  room.game.terrain.heights.fill(700); room.game.terrain.floatingPlatforms = []; room.game.objects = []; room.game.mines = []; room.game.powerups = [];
  room.game.players[0].x = 430; room.game.players[0].y = 700 - WORLD.tankRadius;
  room.game.players[1].x = 860; room.game.players[1].y = 700 - WORLD.tankRadius;
  room.game.players[0].ammo[weapon] = 1;
  return room;
}

async function capture(room, name, impact, shot = null) {
  const state = publicGame(room.game, 'one');
  await page.evaluate(async ({ state, impact, shot }) => {
    if (!window.qaRenderer) {
      document.body.innerHTML = '<div style="width:1280px;height:720px"><canvas id="scene" width="1280" height="720" style="width:1280px;height:720px;image-rendering:pixelated"></canvas></div>';
      document.body.style.margin = '0';
      const { Renderer } = await import('/renderer.js');
      window.qaRenderer = new Renderer(document.querySelector('#scene'));
      window.qaRenderer.setPlayer('one');
    }
    const renderer = window.qaRenderer;
    renderer.setGame(state);
    renderer.setCameraMode('fixed');
    renderer.fixedCameraInitialized = true;
    renderer.particles = []; renderer.floaters = []; renderer.impactEchoes = []; renderer.shots = []; renderer.structureAnimations = [];
    renderer.camera = { x: Math.max(0, impact.x - 650), y: 150, zoom: 1 };
    renderer.clampCamera();
    if (shot) renderer.spawnExplosion(shot);
    renderer.draw(performance.now());
  }, { state, impact, shot });
  await page.locator('#scene').screenshot({ path: `${output}/${name}.png` });
}

try {
  await page.goto(`${process.env.QA_URL || 'http://localhost:3000'}/health`);
  for (const weapon of ['droneStrike', 'elementalEarth']) {
    const room = roomFor(weapon);
    const [marker] = fire(room, 'one', { weapon, angle: weapon === 'elementalEarth' ? 55 : 35, power: 300, direction: 1 });
    assert.ok(marker.delayedStrike);
    for (const strike of room.game.delayedStrikes) { strike.impactAt = Date.now() - 110; strike.executeAt = Date.now() + (weapon === 'elementalEarth' ? 650 : 850 + strike.missile * 420); }
    await capture(room, `${weapon}-marker`, marker.impact);
    if (weapon === 'elementalEarth') { room.game.players[1].x = marker.impact.x; room.game.players[1].y = 700 - WORLD.tankRadius; }
    for (const strike of room.game.delayedStrikes) strike.executeAt = Date.now() - 1;
    const event = tickRoom(room);
    assert.ok(event.shot?.results?.length);
    await capture(room, `${weapon}-impact`, marker.impact, event.shot.results[0]);
  }
  for (const weapon of ['kineticCannon', 'cryoMortar']) {
    const room = roomFor(weapon);
    const [shot] = fire(room, 'one', { weapon, angle: 35, power: 300, direction: 1 });
    assert.ok(shot.impact);
    await capture(room, `${weapon}-impact`, shot.impact, shot);
  }
  const mineRoom = roomFor('waterMine');
  mineRoom.game.waterZones = [{ id: 'qa-water', x: 760, radius: 240, surfaceY: 590 }];
  mineRoom.game.mines = [{ id: 'qa-mine', aquatic: true, active: true, armed: true, x: 760, y: 590, vx: 0, vy: 0 }];
  await capture(mineRoom, 'waterMine-armed', { x: 760, y: 590 });
  mineRoom.game.mines[0].armed = false; mineRoom.game.mines[0].y = 665;
  await capture(mineRoom, 'waterMine-inactive', { x: 760, y: 665 });
  assert.deepEqual(errors, []);
  console.log('Weapon markers, impacts, ice and aquatic mine rendered without page errors.');
} finally { await browser.close(); }
