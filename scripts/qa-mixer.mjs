import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createGame, fire, publicGame, sanitizeRules } from '../server/game.js';

const room = { rules: sanitizeRules({ seed: 'qa-mixer', mapType: 'flat', classesEnabled: true, powerupCount: 0, mines: false, enabledEvents: [] }), players: [
  { id: 'pilot', nickname: 'Piloto', color: '#72eac1', classType: 'attacker', arsenal: ['heavy', 'elementalFire', 'mixer'] },
  { id: 'target', nickname: 'Alvo', color: '#ff765f', classType: 'healer', arsenal: ['heavy', 'jump', 'zeus'] },
] };
room.game = createGame(room);
Object.assign(room.game, { phase: 'playing', roundNumber: 2, turnIndex: 0, openingRestrictionsActive: false, objects: [], powerups: [], mines: [] });
room.game.terrain.heights.fill(850); room.game.terrain.floatingPlatforms = [];
const [pilot, target] = room.game.players; pilot.x = 200; pilot.y = 800; pilot.facing = 1; target.x = 820; target.y = 800;
const results = fire(room, pilot.id, { weapon: 'heavy', mixerPartner: 'elementalFire', angle: 25, power: 390, direction: 1 });
assert.ok(results[0].interactions?.some((item) => item.type === 'mixerFusion'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (error) => errors.push(error.message));
const destination = 'output/web-game/mixer'; await mkdir(destination, { recursive: true });
try {
  await page.route('http://localhost:3000/qa-mixer', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;background:#08121f"><canvas id="scene" width="1280" height="720"></canvas></body></html>' }));
  await page.goto('http://localhost:3000/qa-mixer');
  const capture = async (name, elapsed) => {
    const png = await page.evaluate(async ({ snapshot, shots, elapsed }) => {
      if (!window.qaRenderer) {
        const { Renderer } = await import('/renderer.js'); window.qaRenderer = new Renderer(document.querySelector('#scene')); window.qaRenderer.setPlayer('pilot');
      }
      const renderer = window.qaRenderer; renderer.setGame(snapshot);
      renderer.cameraMode = 'fixed'; renderer.fixedCameraInitialized = true; renderer.camera = { x: 0, y: 200, zoom: 1 }; renderer.userZoom = 1;
      if (!window.qaShotPlayed) { renderer.playShot({ shooterId: 'pilot', results: shots }); window.qaShotPlayed = true; }
      const time = performance.now() + elapsed; renderer.draw(time);
      window.render_game_to_text = () => JSON.stringify({ phase: renderer.game.phase, round: renderer.game.roundNumber, mixer: shots[0].interactions?.find((item) => item.type === 'mixerFusion'), cooling: renderer.game.players[0].mixerLastUsedRound, errors: [] });
      return document.querySelector('#scene').toDataURL('image/png').split(',')[1];
    }, { snapshot: publicGame(room.game, pilot.id), shots: results, elapsed });
    await writeFile(`${destination}/${name}.png`, Buffer.from(png, 'base64'));
  };
  await capture('flight', 180);
  await capture('fusion', 5000);
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(state.mixer.partner, 'elementalFire'); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ state, images: ['flight.png', 'fusion.png'] }));
} finally { await browser.close(); }
