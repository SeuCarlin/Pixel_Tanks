import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createGame, publicGame, sanitizeRules } from '../server/game.js';
import { WORLD } from '../shared/constants.js';

const room = { rules: sanitizeRules({ seed: 'fire-visual-qa', powerupCount: 0, enabledEvents: [], mapType: 'flat' }), players: [
  { id: 'pilot', nickname: 'Pilot', classType: 'incendiary', color: '#ff8246' },
  { id: 'target', nickname: 'Target', classType: 'armored', color: '#71c8ff' },
] };
room.game = createGame(room); room.game.phase = 'playing'; room.game.roundNumber = 2;
room.game.terrain.heights.fill(710); room.game.terrain.floatingPlatforms = []; room.game.objects = []; room.game.mines = [];
room.game.players[0].x = 600; room.game.players[0].y = 710 - WORLD.tankRadius;
room.game.players[1].x = 765; room.game.players[1].y = 710 - WORLD.tankRadius;
room.game.players[1].foamGuardUntilRound = 3;
room.game.fireZones = [{ id: 'flame-qa', source: 'molotov', x: 690, y: 710, radius: 120, turnsLeft: 4, ownerId: 'pilot', incendiary: true }];
room.game.powerups = [{ id: 'foam-qa', type: 'fireFoam', x: 900, y: 688, revealed: true, active: true }];
room.game.lastClassPulses = [{ serial: 1, type: 'fireFoam', x: 765, y: 701, radius: 280, round: 2, extinguished: 1 }];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await mkdir('output/web-game/fire-visual', { recursive: true });
try {
  const origin = process.env.QA_URL || 'http://localhost:3001';
  await page.route(`${origin}/qa-fire-visual`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
  await page.goto(`${origin}/qa-fire-visual`);
  await page.evaluate(async (state) => {
    document.body.innerHTML = '<canvas id="scene" width="1280" height="720"></canvas>';
    document.body.style.margin = '0';
    const { Renderer } = await import('/renderer.js');
    const renderer = new Renderer(document.querySelector('#scene'));
    renderer.setPlayer('pilot');
    renderer.setGame({ ...state, lastClassPulses: [] });
    renderer.setGame(state);
    renderer.cameraMode = 'fixed'; renderer.fixedCameraInitialized = true;
    renderer.camera.x = 120; renderer.camera.y = 60; renderer.camera.zoom = 1;
    renderer.draw(performance.now());
    window.qaFireRenderer = renderer;
  }, publicGame(room.game, 'pilot'));
  await page.waitForTimeout(300);
  const canvasPng = await page.evaluate(() => { window.qaFireRenderer.draw(performance.now()); return document.querySelector('canvas').toDataURL('image/png').split(',')[1]; });
  await writeFile('output/web-game/fire-visual/incendiary-and-foam.png', Buffer.from(canvasPng, 'base64'));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ fireZones: room.game.fireZones.length, foamGuard: room.game.players[1].foamGuardUntilRound, errors }));
} finally { await browser.close(); }
