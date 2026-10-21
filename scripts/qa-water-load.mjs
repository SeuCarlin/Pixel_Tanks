import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createGame, publicGame, sanitizeRules } from '../server/game.js';
import { carveFloodBasin, equalizeConnectedLakes } from '../shared/flood.js';

const room = {
  rules: sanitizeRules({ seed: 'water-load', mapType: 'platforms', enabledEvents: ['flood'], powerupCount: 0 }),
  players: [{ id: 'one', nickname: 'One', color: '#57e389' }, { id: 'two', nickname: 'Two', color: '#ff7b72' }],
};
room.game = createGame(room);
room.game.phase = 'playing';
room.game.waterZones = [];
for (let index = 0; index < 24; index += 1) {
  const lake = carveFloodBasin(room.game.terrain, 155 + index * 185, 106, 54 + index % 4 * 9);
  room.game.waterZones.push({ ...lake, id: `qa-lake-${index}` });
}
equalizeConnectedLakes(room.game.terrain, room.game.waterZones);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await mkdir('output/web-game/water-load', { recursive: true });
try {
  await page.goto(`${process.env.QA_URL || 'http://localhost:3001'}/health`);
  await page.evaluate(async (state) => {
    document.body.innerHTML = '<div style="width:1280px;height:720px"><canvas id="scene" width="1280" height="720" style="width:1280px;height:720px;image-rendering:pixelated"></canvas></div>';
    document.body.style.margin = '0';
    const { Renderer } = await import('/renderer.js');
    window.qaRenderer = new Renderer(document.querySelector('#scene'));
    window.qaRenderer.setPlayer('one');
    window.qaRenderer.setGame(state);
    window.qaRenderer.fitWorld();
  }, publicGame(room.game, 'one'));
  await page.waitForTimeout(250);
  await page.locator('#scene').screenshot({ path: 'output/web-game/water-load/full-map.png' });
  const results = await page.evaluate(() => {
    const renderer = window.qaRenderer;
    const iterations = 240;
    const measure = () => {
      const start = performance.now();
      for (let index = 0; index < iterations; index += 1) renderer.drawWaterZones(renderer.ctx, performance.now());
      return Math.round((performance.now() - start) / iterations * 1000) / 1000;
    };
    const countRects = () => {
      let count = 0;
      renderer.drawWaterZones({ save() {}, restore() {}, fillRect() { count += 1; }, set fillStyle(_value) {} }, performance.now());
      return count;
    };
    const fullMapRects = countRects();
    const fullMapMs = measure();
    renderer.cameraMode = 'fixed';
    renderer.fixedCameraInitialized = true;
    renderer.camera.x = 2500;
    renderer.camera.zoom = 1.1;
    renderer.clampCamera();
    const closeUpRects = countRects();
    const closeUpMs = measure();
    renderer.draw(performance.now());
    return { lakes: renderer.game.waterZones.length, fullMapRects, closeUpRects, fullMapMs, closeUpMs };
  });
  await page.locator('#scene').screenshot({ path: 'output/web-game/water-load/close-up.png' });
  console.log(JSON.stringify({ ...results, errors }));
  assert.equal(results.lakes, 24);
  // Close-up uses finer microblocks than the full map, so rect counts are not proportional to visible width.
  assert.ok(results.closeUpRects < results.fullMapRects, 'off-screen lakes should not be painted');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
