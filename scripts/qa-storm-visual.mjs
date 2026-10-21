import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { applyArenaPulse, createGame, publicGame, sanitizeRules, tickRoom } from '../server/game.js';

const room = { rules: sanitizeRules({ seed: 'storm-visual', mapType: 'platforms', enabledEvents: ['flood', 'lightning', 'gale'], powerupCount: 0 }), players: [{ id: 'one', nickname: 'One', color: '#57e389' }, { id: 'two', nickname: 'Two', color: '#ff7b72' }] };
room.game = createGame(room); room.game.phase = 'playing'; room.game.turnNumber = 9;
room.game.players.forEach((player) => { player.health = 1000; player.maxHealth = 1000; });
const storm = applyArenaPulse(room);
assert.ok(['flood', 'lightning'].includes(storm.type));
room.game.weather.startedAt = Date.now() - 3000;
storm.executeAt = Date.now() + 1500;
room.game.pendingArenaEvent.executeAt = storm.executeAt;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await mkdir('output/web-game/climate-cycle', { recursive: true });
try {
  await page.goto('http://localhost:3000/health');
  await page.evaluate(async (state) => {
    document.body.innerHTML = '<div style="width:1280px;height:720px"><canvas id="scene" width="1280" height="720" style="width:1280px;height:720px;image-rendering:pixelated"></canvas></div>';
    document.body.style.margin = '0';
    const { Renderer } = await import('/renderer.js');
    window.qaRenderer = new Renderer(document.querySelector('#scene'));
    window.qaRenderer.setPlayer('one');
    window.qaRenderer.setGame(state);
    window.qaRenderer.fitWorld();
  }, publicGame(room.game, 'one'));
  await page.evaluate((event) => window.qaRenderer.playArenaEvent(event), structuredClone(storm));
  await page.waitForTimeout(500);
  await page.locator('#scene').screenshot({ path: 'output/web-game/climate-cycle/storm-rain.png' });
  assert.equal(await page.evaluate(() => window.qaRenderer.arenaVisual?.event.weatherPrelude), true);

  room.game.pendingArenaEvent.executeAt = Date.now() - 1;
  tickRoom(room);
  const impact = structuredClone(storm);
  await page.evaluate(({ state, event }) => { window.qaRenderer.setGame(state, { deferWorld: event.type === 'flood' }); window.qaRenderer.playArenaEvent(event); }, { state: publicGame(room.game, 'one'), event: impact });
  await page.waitForTimeout(900);
  await page.locator('#scene').screenshot({ path: `output/web-game/climate-cycle/storm-${storm.type}.png` });

  room.game.weatherSequence.readyAt = Date.now() - 1;
  room.game.lastBattleAnimationUntil = 0;
  tickRoom(room);
  const gale = structuredClone(room.game.events.at(-1));
  assert.equal(gale.type, 'gale');
  await page.evaluate(({ state, event }) => { window.qaRenderer.setGame(state); window.qaRenderer.playArenaEvent(event); }, { state: publicGame(room.game, 'one'), event: gale });
  await page.waitForTimeout(500);
  await page.locator('#scene').screenshot({ path: 'output/web-game/climate-cycle/storm-gale.png' });
  room.game.pendingArenaEvent.executeAt = Date.now() - 1;
  tickRoom(room);
  assert.equal(room.game.weather.kind, 'clearing');
  const galeImpact = structuredClone(room.game.events.at(-1));
  await page.evaluate(({ state, event }) => { window.qaRenderer.setGame(state); window.qaRenderer.playArenaEvent(event); }, { state: publicGame(room.game, 'one'), event: galeImpact });
  await page.waitForTimeout(3200);
  await page.evaluate((state) => window.qaRenderer.setGame(state), publicGame(room.game, 'one'));
  await page.waitForTimeout(450);
  await page.locator('#scene').screenshot({ path: 'output/web-game/climate-cycle/storm-clearing.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ outcome: storm.type, chain: ['rain', storm.type, 'gale', 'clearing'], lakes: room.game.waterZones.length, errors }));
} finally {
  await browser.close();
}
