import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createGame, fire, publicGame, sanitizeRules } from '../server/game.js';
import { WORLD } from '../shared/constants.js';

const room = { rules: sanitizeRules({ seed: 'elemental-physics-status', mapType: 'flat', enabledEvents: [], powerupCount: 0, mines: false }), players: [
  { id: 'element', nickname: 'Elemento', classType: 'elementalist', color: '#64dec8', arsenal: ['heavy', 'zeus', 'jump'] },
  { id: 'target', nickname: 'Alvo', classType: 'ninja', color: '#ff765f' },
] };
room.game = createGame(room);
Object.assign(room.game, { phase: 'playing', roundNumber: 2, turnNumber: 2, turnIndex: 0, openingRestrictionsActive: false, objects: [], powerups: [], mines: [] });
room.game.terrain.heights.fill(650); room.game.terrain.floatingPlatforms = [];
room.game.players[0].x = 320; room.game.players[0].y = 650 - WORLD.tankRadius;
room.game.players[0].elementalCurrent = 'elementalFire';
room.game.players[1].x = 1050; room.game.players[1].y = 650 - WORLD.tankRadius;
const before = publicGame(room.game, 'element');
const shots = fire(room, 'element', { weapon: 'heavy', angle: 39, power: 340, direction: 1 });
assert.equal(shots[0].elementalType, 'elementalFire');
const after = publicGame(room.game, 'element');
const destination = 'output/web-game/elemental-physics-status';
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
try {
  const origin = process.env.QA_URL || 'http://localhost:3109';
  await page.route(`${origin}/qa-elemental-physics-status`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;background:#08121f"><canvas id="scene" width="1280" height="720"></canvas></body></html>' }));
  await page.goto(`${origin}/qa-elemental-physics-status`);
  const result = await page.evaluate(async ({ before, after, shots }) => {
    const { Renderer } = await import('/renderer.js');
    const renderer = new Renderer(document.querySelector('#scene'));
    renderer.setPlayer('element'); renderer.setGame(before);
    renderer.cameraMode = 'fixed'; renderer.fixedCameraInitialized = true;
    renderer.camera = { x: 0, y: 60, zoom: 1 }; renderer.userZoom = 1;
    renderer.draw(performance.now());
    const capture = () => document.querySelector('canvas').toDataURL('image/png').split(',')[1];
    const active = capture();
    renderer.playShot({ shooterId: 'element', results: shots });
    renderer.setGame(after);
    renderer.shots[0].started = performance.now() - Math.min(800, shots[0].path.length / 40 * 250);
    renderer.draw(performance.now());
    const projectile = capture();
    const airborne = { ...after, players: after.players.map((player) => player.id === 'target' ? { ...player, y: 380, airborne: { vx: 0, vy: 180, falling: true, updatedAt: Date.now() }, health: player.health - 20 } : player) };
    renderer.setGame(airborne);
    const movingWhileShot = renderer.visualPlayers.get('target').targetY === 380;
    const damageHeld = renderer.visualPlayers.get('target').health === after.players.find((player) => player.id === 'target').health;
    renderer.shots.length = 0; renderer.flushPendingState();
    const shielded = { ...after, players: after.players.map((player) => player.id === 'element' ? { ...player, shieldCharges: 1, invisibleTurns: 2 } : player) };
    renderer.setGame(shielded); renderer.draw(performance.now());
    const shieldAndCloak = capture();
    return { active, projectile, shieldAndCloak, movingWhileShot, damageHeld,
      shieldCue: renderer.floaters.some((floater) => floater.text === 'ESCUDO ATIVO'),
      cloakCue: renderer.floaters.some((floater) => floater.text === 'VOCÊ ESTÁ INVISÍVEL') };
  }, { before, after, shots });
  for (const key of ['active', 'projectile', 'shieldAndCloak']) await writeFile(`${destination}/${key}.png`, Buffer.from(result[key], 'base64'));
  assert.equal(result.movingWhileShot, true);
  assert.equal(result.damageHeld, true);
  assert.equal(result.shieldCue, true);
  assert.equal(result.cloakCue, true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ movingWhileShot: result.movingWhileShot, damageHeld: result.damageHeld, shieldCue: result.shieldCue, cloakCue: result.cloakCue }));
} finally { await browser.close(); }
