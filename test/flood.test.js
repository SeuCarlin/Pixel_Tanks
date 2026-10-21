import test from 'node:test';
import assert from 'node:assert/strict';
import { carveFloodBasin, equalizeConnectedLakes, LAKE_DRAIN_MS, lakeHasBreach, visibleWaterColumns, waterDepthAt, waterSurfaceAt } from '../shared/flood.js';
import { WORLD } from '../shared/constants.js';
import { applyArenaPulse, createGame, sanitizeRules, tickRoom, updateWaterPhysics } from '../server/game.js';

test('flood basin cuts microblock terrain and preserves a bounded water surface', () => {
  const terrain = { heights: Array(WORLD.width).fill(650) };
  const lake = carveFloodBasin(terrain, 900, 160, 70);
  assert.equal(lake.x, 900);
  assert.ok(terrain.heights[900] > terrain.heights[740]);
  assert.ok(terrain.heights[900] > lake.surfaceY);
  assert.equal(terrain.heights[200], 650);
});

test('overlapping lakes render one surface per column, matching the deeper water', () => {
  const lakes = [
    { x: 100, radius: 65, surfaceY: 440 },
    { x: 160, radius: 65, surfaceY: 400 },
  ];
  const columns = visibleWaterColumns(lakes, 50, 230, 1000);
  const at = (x) => columns.surfaces[(x - columns.firstX) / columns.step];
  assert.equal(at(50), 440);
  assert.equal(at(95), 440);
  assert.equal(at(125), 400);
  assert.equal(at(210), 400);
  assert.equal(at(225), Infinity);
  assert.equal(waterDepthAt({ heights: Array(WORLD.width).fill(500) }, lakes, 125, 500, 1000), 100);
  lakes[1].drainingAt = 1000;
  const draining = visibleWaterColumns(lakes, 100, 150, 1000 + LAKE_DRAIN_MS / 2);
  assert.equal(draining.surfaces[(125 - draining.firstX) / draining.step], 440);
});

test('connected flood basins equalize while a dry ridge keeps lakes separate', () => {
  const terrain = { heights: Array(WORLD.width).fill(650) };
  const lakes = [
    { x: 100, radius: 65, surfaceY: 590 },
    { x: 160, radius: 65, surfaceY: 610 },
    { x: 220, radius: 65, surfaceY: 620 },
  ];
  assert.equal(equalizeConnectedLakes(terrain, lakes), true);
  assert.deepEqual(lakes.map((lake) => lake.surfaceY), [590, 590, 590]);
  assert.equal(equalizeConnectedLakes(terrain, lakes), false);
  const dry = [{ x: 100, radius: 65, surfaceY: 590 }, { x: 160, radius: 65, surfaceY: 610 }];
  terrain.heights.fill(580, 100, 161);
  assert.equal(equalizeConnectedLakes(terrain, dry), false);
  assert.deepEqual(dry.map((lake) => lake.surfaceY), [590, 610]);
});

test('inundation warns with rain, then leaves lakes and extinguishes overlapping fire', () => {
  const room = { rules: sanitizeRules({ seed: 'flood-test', enabledEvents: ['flood'], powerupCount: 0 }), players: [{ id: 'one', nickname: 'One', color: '#fff' }, { id: 'two', nickname: 'Two', color: '#f77' }] };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.turnNumber = 3;
  room.game.terrain.heights.fill(650); room.game.terrain.floatingPlatforms = [];
  const event = applyArenaPulse(room);
  assert.equal(event.type, 'flood'); assert.equal(event.warning, true);
  assert.equal(room.game.weather.kind, 'rain'); assert.equal(room.game.waterZones.length, 0);
  const impact = event.impacts[0]; room.game.fireZones.push({ id: 'test-fire', x: impact.x, y: impact.y, radius: 45, turnsLeft: 3 });
  event.executeAt = Date.now() - 1; room.game.pendingArenaEvent.executeAt = Date.now() - 1;
  tickRoom(room);
  assert.equal(event.warning, false);
  assert.ok(room.game.waterZones.length >= 3);
  assert.ok(room.game.terrain.heights[Math.round(impact.x)] > 650);
  assert.ok(!room.game.fireZones.some((zone) => zone.id === 'test-fire'));
});

test('rain preludes a 50/50 flood or lightning outcome, then queues a separate gale', () => {
  const outcomes = new Set();
  for (let seed = 1; seed <= 28; seed += 1) {
    const room = { rules: sanitizeRules({ seed, enabledEvents: ['flood', 'lightning', 'gale'], powerupCount: 0 }), players: [{ id: 'one', nickname: 'One', color: '#fff' }, { id: 'two', nickname: 'Two', color: '#f77' }] };
    room.game = createGame(room); room.game.phase = 'playing'; room.game.turnNumber = 9;
    room.game.players.forEach((player) => { player.health = 1000; player.maxHealth = 1000; });
    const storm = applyArenaPulse(room);
    outcomes.add(storm.type);
    assert.ok(['flood', 'lightning'].includes(storm.type));
    assert.equal(storm.weatherPrelude, true);
    assert.equal(room.game.weather.kind, 'rain');
    assert.equal(room.game.pendingArenaEvent.eventId, storm.id);
    room.game.pendingArenaEvent.executeAt = Date.now() - 1;
    tickRoom(room);
    assert.equal(room.game.weatherSequence?.phase, 'galePending');
    assert.equal(storm.warning, false);
    room.game.weatherSequence.readyAt = Date.now() - 1;
    room.game.lastBattleAnimationUntil = 0;
    tickRoom(room);
    const gale = room.game.events.at(-1);
    assert.equal(gale.type, 'gale');
    assert.equal(gale.weatherChainStage, 'gale');
    assert.equal(gale.warning, true);
    assert.equal(room.game.weather.kind, 'wind');
    room.game.pendingArenaEvent.executeAt = Date.now() - 1;
    tickRoom(room);
    assert.equal(room.game.weatherSequence, null);
    assert.equal(room.game.weather.kind, 'clearing');
    assert.ok(room.game.weather.startedAt >= Date.now() + 2700);
  }
  assert.deepEqual([...outcomes].sort(), ['flood', 'lightning']);
});

test('lake depth slows only submerged spaces and drains through a broken floor', () => {
  const terrain = { heights: Array(WORLD.width).fill(650) };
  const lake = carveFloodBasin(terrain, 900, 160, 70);
  assert.ok(waterDepthAt(terrain, [lake], 900, terrain.heights[900]) >= 45);
  assert.equal(waterDepthAt(terrain, [lake], 900, lake.surfaceY - 30), 0);
  assert.equal(lakeHasBreach(terrain, lake), false);
  terrain.heights[900] = WORLD.height + 30;
  assert.equal(lakeHasBreach(terrain, lake), true);
  lake.drainingAt = 1000;
  assert.ok(waterSurfaceAt(lake, 1000 + LAKE_DRAIN_MS / 2) > lake.surfaceY);
  assert.equal(waterDepthAt(terrain, [lake], 900, lake.surfaceY + 10, 1000 + LAKE_DRAIN_MS), 0);
});

test('submerged mines short out and fires are doused without affecting platforms above water', () => {
  const terrain = { heights: Array(WORLD.width).fill(650), floatingPlatforms: [] };
  const lake = carveFloodBasin(terrain, 900, 160, 70);
  const game = { terrain, waterZones: [lake], mines: [{ id: 'wet', x: 900, y: terrain.heights[900] - 3, active: true }, { id: 'dry', x: 900, y: lake.surfaceY - 80, active: true }], objects: [], fireZones: [{ id: 'wet-fire', x: 900, y: terrain.heights[900] - 2, turnsLeft: 3 }, { id: 'high-fire', x: 900, y: lake.surfaceY - 80, turnsLeft: 3 }], roundNumber: 4 };
  assert.equal(updateWaterPhysics(game), true);
  assert.equal(game.mines[0].active, false);
  assert.equal(game.mines[1].active, true);
  assert.deepEqual(game.fireZones.map((zone) => zone.id), ['high-fire']);
  terrain.heights[900] = WORLD.height + 30;
  updateWaterPhysics(game, 1000);
  assert.equal(game.waterZones[0].drainingAt, 1000);
  updateWaterPhysics(game, 1000 + LAKE_DRAIN_MS);
  assert.equal(game.waterZones.length, 0);
});
