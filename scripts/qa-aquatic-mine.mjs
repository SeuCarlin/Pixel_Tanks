import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createGame, publicGame, sanitizeRules } from '../server/game.js';

const room = { rules: sanitizeRules({ seed: 'aquatic-mine-visual', mapType: 'archipelago', powerupCount: 0, enabledEvents: [] }), players: [
  { id: 'swimmer', nickname: 'Anfíbio', classType: 'amphibian', color: '#67deff' },
  { id: 'target', nickname: 'Alvo', classType: 'healer', color: '#ff755c' },
] };
room.game = createGame(room); room.game.phase = 'playing';
room.game.terrain.heights.fill(650); room.game.terrain.floatingPlatforms = [];
room.game.objects = []; room.game.powerups = []; room.game.mines = [];
room.game.players[0].x = 520; room.game.players[0].y = 570; room.game.players[0].swimming = true;
room.game.players[1].x = 750; room.game.players[1].y = 630;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await mkdir('output/web-game/aquatic-mine-visual', { recursive: true });
try {
  await page.goto(`${process.env.QA_URL || 'http://localhost:3000'}/health`);
  const render = async (state, name) => {
    await page.evaluate(async (snapshot) => {
      if (!window.qaRenderer) {
        document.body.innerHTML = '<canvas id="scene" width="1280" height="720" style="width:1280px;height:720px;image-rendering:pixelated"></canvas>';
        document.body.style.margin = '0';
        const { Renderer } = await import('/renderer.js');
        window.qaRenderer = new Renderer(document.querySelector('#scene'));
        window.qaRenderer.setPlayer('swimmer');
      }
      const renderer = window.qaRenderer;
      renderer.setGame(snapshot);
      renderer.cameraMode = 'fixed'; renderer.fixedCameraInitialized = true;
      renderer.camera.x = 340; renderer.camera.y = 250; renderer.camera.zoom = 1.7;
      renderer.clampCamera(); renderer.draw(performance.now());
    }, state);
    await page.locator('#scene').screenshot({ path: `output/web-game/aquatic-mine-visual/${name}.png` });
  };
  room.game.waterZones = [];
  room.game.mines = [{ id: 'qa-mine', aquatic: true, active: true, armed: false, x: 625, y: 630, vx: 45, vy: -60 }];
  await render(publicGame(room.game, 'swimmer'), 'inactive');
  room.game.waterZones = [{ id: 'qa-water', x: 610, radius: 240, surfaceY: 580 }];
  room.game.mines[0] = { ...room.game.mines[0], armed: true, armedAt: Date.now() - 500, x: 625, y: 588, vx: 0, vy: 0 };
  await render(publicGame(room.game, 'swimmer'), 'armed');
  await page.waitForTimeout(1250);
  await page.locator('#scene').screenshot({ path: 'output/web-game/aquatic-mine-visual/armed-steady.png' });
  room.game.players[0].y = 555; room.game.players[0].swimming = false;
  room.game.players[0].airborne = { vx: 32, vy: -180, startY: 570, fromSwimLeap: true };
  room.game.players[0].lastSwimLeap = { serial: 2, x: 520, y: 570, surfaceY: 580 };
  await render(publicGame(room.game, 'swimmer'), 'swim-leap');
  room.game.players[0].y = 570; room.game.players[0].swimming = true; room.game.players[0].airborne = null;
  room.game.players[0].lastLanding = { serial: 3, x: 520, y: 570, water: true, damage: 0, speed: 120, distance: 30 };
  room.game.mines[0].active = false;
  room.game.mineDetonations.push({ serial: 1, x: 625, y: 588, radius: 105 });
  await render(publicGame(room.game, 'swimmer'), 'detonation');
  console.log(JSON.stringify({ states: ['inactive', 'armed', 'detonation'], errors }));
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
