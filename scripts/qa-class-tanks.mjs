import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { CLASS_DEFS } from '../shared/constants.js';
import { createGame, publicGame, recordEliminations, sanitizeRules } from '../server/game.js';

const output = 'output/web-game/class-tanks';
await mkdir(output, { recursive: true });
const room = {
  rules: sanitizeRules({ seed: 'class-tank-gallery', mapType: 'flat', powerupCount: 0, enabledEvents: [] }),
  players: [{ id: 'qa', nickname: 'QA', classType: 'armored' }, { id: 'other', nickname: 'Other', classType: 'attacker' }],
};
room.game = createGame(room);
room.game.phase = 'playing';
const snapshot = publicGame(room.game, 'qa');
const classes = Object.entries(CLASS_DEFS).map(([type, definition]) => ({ type, name: definition.name, color: definition.color }));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
try {
  await page.route('http://localhost:3100/qa-class-tanks', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;background:#07111c"><canvas id="scene" width="1200" height="720"></canvas></body></html>' }));
  await page.goto('http://localhost:3100/qa-class-tanks');
  const rendered = await page.evaluate(async ({ snapshot, classes }) => {
    const { Renderer } = await import('/renderer.js');
    const canvas = document.querySelector('#scene');
    const renderer = Object.create(Renderer.prototype);
    renderer.game = snapshot;
    renderer.visualPlayers = new Map();
    renderer.camera = { x: 0, y: 0, zoom: .3 };
    renderer.serverClockOffset = 0;
    renderer.terrainHeights = new Array(3200).fill(500);
    const c = canvas.getContext('2d'); c.fillStyle = '#091725'; c.fillRect(0, 0, canvas.width, canvas.height);
    const details = [];
    for (const [index, entry] of classes.entries()) {
      const column = index % 4; const row = Math.floor(index / 4);
      const x = 145 + column * 300; const y = 140 + row * 225;
      const tank = { ...snapshot.players[0], id: entry.type, classType: entry.type, color: entry.color, x, y, renderX: x, renderY: y, alive: true, visualAlive: true, facing: index % 2 ? -1 : 1, moving: index % 3 === 0, movingUntil: Date.now() + 1000, airborne: null, supportPlatformId: null };
      renderer.visualPlayers.set(tank.id, tank);
      details.push(tank);
    }
    renderer.game.players = details;
    for (const [index, tank] of details.entries()) {
      const column = index % 4; const row = Math.floor(index / 4);
      const x = 145 + column * 300; const y = 140 + row * 225;
      c.fillStyle = '#102339'; c.fillRect(x - 130, y - 95, 260, 180);
      c.strokeStyle = '#31506c'; c.strokeRect(x - 130, y - 95, 260, 180);
      c.save(); c.translate(x, y + 4); c.scale(1.55, 1.55); c.translate(-x, -y);
      renderer.drawTank(c, tank, false, performance.now() + 220);
      c.restore();
      c.fillStyle = tank.color; c.fillRect(x - 105, y + 47, 210, 3);
      c.fillStyle = '#e9f6ff'; c.font = 'bold 16px monospace'; c.textAlign = 'center'; c.fillText(classes[index].name, x, y + 72);
    }
    return { count: details.length, errors: renderer.lastRenderErrorAt };
  }, { snapshot, classes });
  await page.screenshot({ path: `${output}/all-classes.png` });
  assert.equal(rendered.count, classes.length);
  const bomberRoom = { rules: sanitizeRules({ seed: 'bomber-flight-qa', mapType: 'flat', powerupCount: 0, enabledEvents: [] }), players: [
    { id: 'bomber', nickname: 'Bombardeiro', classType: 'bomber', color: '#ff9c4a' },
    { id: 'target', nickname: 'Alvo', classType: 'armored', color: '#9eb1c3' },
  ] };
  bomberRoom.game = createGame(bomberRoom); bomberRoom.game.phase = 'playing'; bomberRoom.game.terrain.heights.fill(760); bomberRoom.game.terrain.floatingPlatforms = []; bomberRoom.game.objects = [];
  bomberRoom.game.players[0].x = 550; bomberRoom.game.players[0].y = 751;
  bomberRoom.game.players[1].x = 900; bomberRoom.game.players[1].y = 751;
  bomberRoom.game.players[0].health = 0; bomberRoom.game.players[0].alive = false;
  recordEliminations(bomberRoom.game);
  const now = Date.now();
  bomberRoom.game.bomberGrenades.forEach((grenade) => { grenade.launchedAt = now - 650; grenade.impactAt = now + 800; });
  const flightPage = await browser.newPage({ viewport: { width: 1200, height: 720 } });
  flightPage.on('pageerror', (error) => errors.push(error.message));
  flightPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await flightPage.route('http://localhost:3100/qa-bomber-flight', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;background:#07111c"><canvas id="scene" width="1200" height="720"></canvas></body></html>' }));
  await flightPage.goto('http://localhost:3100/qa-bomber-flight');
  await flightPage.evaluate(async (state) => {
    const { Renderer } = await import('/renderer.js');
    const renderer = Object.create(Renderer.prototype);
    renderer.game = state; renderer.serverClockOffset = 0;
    const c = document.querySelector('#scene').getContext('2d');
    c.fillStyle = '#142a40'; c.fillRect(0, 0, 1200, 720);
    c.save(); c.translate(0, -350);
    c.fillStyle = '#496078'; c.fillRect(0, 760, 1200, 300);
    c.fillStyle = '#ff9c4a'; c.fillRect(538, 739, 24, 18);
    renderer.drawBomberGrenades(c, performance.now());
    c.restore();
  }, publicGame(bomberRoom.game, 'target'));
  await flightPage.screenshot({ path: `${output}/bomber-grenades.png` });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ classes: rendered.count, errors }));
} finally { await browser.close(); }
