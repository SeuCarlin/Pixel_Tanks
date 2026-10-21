import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createGame, publicGame, sanitizeRules, updateWaterPhysics } from '../server/game.js';
import { advanceFlowLake } from '../shared/flood.js';
import { applyExplosion } from '../server/physics.js';

const room = {
  rules: sanitizeRules({ seed: 'water-impact-qa', mapType: 'flat', powerupCount: 0, enabledEvents: [] }),
  players: [{ id: 'one', nickname: 'Anfíbio', classType: 'amphibian', color: '#67deff' }, { id: 'two', nickname: 'Alvo', classType: 'armored', color: '#ff755c' }],
};
room.game = createGame(room);
const game = room.game; game.phase = 'playing'; game.terrain.heights.fill(650);
game.terrain.floatingPlatforms = []; game.objects = []; game.mines = [];
game.players[0].x = 720; game.players[0].y = 639;
game.players[1].x = 1320; game.players[1].y = 639;
const lake = { id: 'qa-lake', x: 1000, radius: 270, surfaceY: 574, fluid: true };
game.waterZones = [lake]; advanceFlowLake(game.terrain, lake, Date.now()); updateWaterPhysics(game);
applyExplosion(game, 1000, 608, 80, 70, { noTerrain: true });
const snapshot = publicGame(game, 'one');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await mkdir('output/web-game/water-impact', { recursive: true });
try {
  await page.route('**/qa-water-impact', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;background:#081626"><div style="width:1280px;height:720px"><canvas id="scene" width="1280" height="720" style="width:1280px;height:720px;image-rendering:pixelated"></canvas></div></body></html>' }));
  await page.goto(`${process.env.QA_URL || 'http://localhost:3101'}/qa-water-impact`);
  const result = await page.evaluate(async (state) => {
    const { Renderer } = await import('/renderer.js');
    const renderer = new Renderer(document.querySelector('#scene'));
    renderer.setPlayer('one'); renderer.setGame(state);
    renderer.cameraMode = 'fixed'; renderer.fixedCameraInitialized = true;
    renderer.camera.zoom = 1.1; renderer.camera.x = 420; renderer.camera.y = 130;
    renderer.clampCamera();
    window.qaRenderer = renderer;
    return { phase: renderer.game.phase, impacts: renderer.game.waterZones[0].surfaceImpacts.length };
  }, snapshot);
  await page.waitForTimeout(450);
  const canvasState = await page.evaluate(() => { const canvas = document.querySelector('#scene'); const rect = canvas.getBoundingClientRect(); return { width: canvas.width, height: canvas.height, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, pixel: [...canvas.getContext('2d').getImageData(640, 400, 1, 1).data], renderErrorAt: window.qaRenderer.lastRenderErrorAt }; });
  await page.screenshot({ path: 'output/web-game/water-impact/underwater-explosion.png', animations: 'disabled' });
  assert.equal(result.phase, 'playing');
  assert.equal(result.impacts, 1);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ...result, canvasState, errors }));
} finally {
  await browser.close();
}
