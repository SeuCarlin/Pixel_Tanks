import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createGame, publicGame, sanitizeRules } from '../server/game.js';

const room = { rules: sanitizeRules({ seed: 'qa-weather-cloud-drift', powerupCount: 0, enabledEvents: [] }), players: [
  { id: 'met', nickname: 'Meteorologista', classType: 'meteorologist', color: '#59d9ee' },
  { id: 'enemy', nickname: 'Alvo', classType: null, color: '#ff755c' },
] };
room.game = createGame(room); room.game.phase = 'playing'; room.game.terrain.heights.fill(650);
room.game.terrain.floatingPlatforms = []; room.game.objects = []; room.game.powerups = []; room.game.mines = [];
room.game.players[0].x = 510; room.game.players[0].y = 640;
room.game.players[1].x = 930; room.game.players[1].y = 640;
room.game.weatherClouds[0].x = 615; room.game.weatherClouds[0].y = 360;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (error) => errors.push(error.message));
await mkdir('output/web-game/weather-cloud-rework', { recursive: true });
try {
  await page.goto(`${process.env.QA_URL || 'http://localhost:3000'}/health`);
  const render = async (name) => {
    await page.evaluate(async (snapshot) => {
      if (!window.qaRenderer) {
        document.body.innerHTML = '<canvas id="scene" width="1280" height="720" style="width:1280px;height:720px;image-rendering:pixelated"></canvas>';
        document.body.style.margin = '0';
        const { Renderer } = await import('/renderer.js');
        window.qaRenderer = new Renderer(document.querySelector('#scene'));
        window.qaRenderer.setPlayer('met');
      }
      const renderer = window.qaRenderer;
      renderer.setGame(snapshot); renderer.cameraMode = 'fixed'; renderer.fixedCameraInitialized = true;
      renderer.camera.x = 150; renderer.camera.y = 120; renderer.camera.zoom = 1;
      renderer.clampCamera(); renderer.draw(performance.now());
    }, publicGame(room.game, 'met'));
    await page.waitForTimeout(120);
    await page.locator('#scene').screenshot({ path: `output/web-game/weather-cloud-rework/${name}.png` });
  };
  await render('cloud-idle');
  room.game.turnNumber = 2; room.game.wind = 22; room.game.weatherClouds[0].x = 800;
  await render('cloud-drifting');
  await page.waitForTimeout(1050);
  await page.locator('#scene').screenshot({ path: 'output/web-game/weather-cloud-rework/cloud-arrived.png' });
  room.game.weatherClouds = [];
  room.game.lastWeatherCloudDispersals.push({ serial: 1, id: 'weather-cloud-met', ownerId: 'met', x: 800, y: 360, startedAt: Date.now() });
  await render('cloud-dispersed');
  assert.deepEqual(errors, []);
  assert.ok((await page.evaluate(() => window.qaRenderer.particles.length)) > 0);
  console.log(JSON.stringify({ screenshots: ['cloud-idle', 'cloud-drifting', 'cloud-arrived', 'cloud-dispersed'], errors }));
} finally { await browser.close(); }
