import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createGame, publicGame, sanitizeRules } from '../server/game.js';
import { WORLD } from '../shared/constants.js';
import { carveFloodBasin } from '../shared/flood.js';

const room = { rules: sanitizeRules({ seed: 'fire-water-glacier', mapType: 'hills', powerupCount: 0, enabledEvents: [] }), players: [
  { id: 'fire', nickname: 'Incendiário', classType: 'incendiary', color: '#ff7b51' },
  { id: 'target', nickname: 'Alvo', classType: 'armored', color: '#77bfff' },
] };
room.game = createGame(room);
const game = room.game;
Object.assign(game, { phase: 'playing', roundNumber: 2, turnIndex: 0, wind: 8 });
game.terrain.type = 'hills'; game.terrain.heights.fill(780); game.terrain.floatingPlatforms = [];
game.players[0].x = 470; game.players[0].y = 780 - WORLD.tankRadius;
game.players[1].x = 690; game.players[1].y = 780 - WORLD.tankRadius;
game.players[1].lastFireHit = { round: 2, damage: 35, x: 690, y: game.players[1].y, zoneId: 'qa-fire' };
game.objects = [
  { id: 'snow-medium', type: 'treeMedium', treeSize: 'medium', x: 385, groundY: 780, y: 724, width: 62, height: 112, foliageSeed: 12, durability: 2, maxDurability: 2, active: true },
  { id: 'snow-large', type: 'treeLarge', treeSize: 'large', x: 870, groundY: 780, y: 580, width: 82, height: 390, crownWidth: 420, foliageSeed: 91, branchRows: [], durability: 2, maxDurability: 5, active: true },
];
game.fireZones = [{ id: 'qa-fire', x: 660, y: 780, radius: 110, turnsLeft: 3, source: 'incendiaryShot', incendiary: true, ownerId: 'fire' }];
const lake = carveFloodBasin(game.terrain, 1160, 165, 74);
Object.assign(lake, { id: 'qa-lake', fillStartedAt: Date.now() - 950, fillDurationMs: 1900, fillFromY: lake.surfaceY + 77 });
game.waterZones = [lake];

const origin = process.env.QA_URL || 'http://localhost:3100';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
try {
  await page.route(`${origin}/qa-fire-water-glacier`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;background:#08121f"><canvas id="scene" width="1280" height="720"></canvas></body></html>' }));
  await page.goto(`${origin}/qa-fire-water-glacier`);
  const visible = await page.evaluate(async (state) => {
    const { Renderer } = await import('/renderer.js');
    const renderer = new Renderer(document.querySelector('#scene'));
    renderer.setPlayer('fire');
    const pristine = structuredClone(state); delete pristine.players[1].lastFireHit;
    renderer.setGame(pristine); renderer.setGame(state);
    renderer.cameraMode = 'fixed'; renderer.fixedCameraInitialized = true;
    renderer.camera = { x: 190, y: 240, zoom: 1 }; renderer.userZoom = 1;
    renderer.spawnElementalWaterImpact({ impact: { x: 1160, y: 700 } });
    renderer.updateParticles(.35);
    renderer.draw(performance.now());
    return { trees: renderer.visualObjects.filter((object) => object.type.startsWith('tree')).length, fires: renderer.game.fireZones.length, lakes: renderer.game.waterZones.length, png: document.querySelector('#scene').toDataURL('image/png').split(',')[1] };
  }, publicGame(game, 'fire'));
  assert.deepEqual({ trees: visible.trees, fires: visible.fires, lakes: visible.lakes }, { trees: 2, fires: 1, lakes: 1 });
  await mkdir('output/web-game/fire-water-glacier', { recursive: true });
  await writeFile('output/web-game/fire-water-glacier/effects.png', Buffer.from(visible.png, 'base64'));
  assert.deepEqual(errors, []);
  console.log('Fire, filling water, and damaged snowy trees rendered without browser errors.');
} finally { await browser.close(); }
