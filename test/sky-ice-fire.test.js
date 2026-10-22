import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, sanitizeRules, tickRoom, updateFireZonePhysics, updateWaterPhysics } from '../server/game.js';
import { generateTerrain, findSpawns } from '../server/terrain.js';
import { WORLD } from '../shared/constants.js';
import { waterDepthAt } from '../shared/flood.js';

function match(type = 'skylands', count = 2, seed = `qa-${type}-${count}`) {
  const room = { rules: sanitizeRules({ mapType: type, seed, enabledEvents: [], powerupCount: 8 }), players: Array.from({ length: count }, (_, index) => ({ id: `p${index}`, nickname: `P${index}`, color: '#fff', connected: true })) };
  room.game = createGame(room);
  return room.game;
}

test('four sky islands spread ten safe spawns and provide moving launch pads', () => {
  const terrain = generateTerrain('sky-10', 'skylands', 10);
  const islands = terrain.floatingPlatforms.filter((platform) => platform.kind === 'skyIsland');
  const pads = terrain.floatingPlatforms.filter((platform) => platform.kind === 'rescuePad');
  assert.equal(islands.length, 4); assert.equal(pads.length, 8);
  const spawns = findSpawns(terrain, 10);
  assert.equal(new Set(spawns.map((spawn) => spawn.x)).size, 10);
  assert.ok(spawns.every((spawn) => islands.some((island) => island.id === spawn.supportPlatformId && spawn.x >= island.x + 25 && spawn.x <= island.x + island.width - 25)));
  assert.ok(terrain.heights.slice(0, terrain.arenaWidth).every((height) => height > WORLD.height));
  const game = match('skylands', 2);
  assert.ok(game.powerups.every((item) => item.y < WORLD.height && item.supportPlatformId));
  assert.ok(game.mines.every((item) => item.y < WORLD.height && item.supportPlatformId));
});

test('a lower rescue pad bounces a falling tank; missing the arena eliminates it', () => {
  const game = match('skylands'); game.phase = 'playing';
  const pad = game.terrain.floatingPlatforms.find((platform) => platform.kind === 'rescuePad');
  const tank = game.players[0]; const now = Date.now();
  tank.x = pad.x + pad.width / 2; tank.y = pad.y - WORLD.tankRadius - 8; tank.supportPlatformId = null; tank.platformOffset = null;
  tank.airborne = { vx: 0, vy: 280, falling: true, startY: tank.y - 100, minY: tank.y - 100, updatedAt: now - 90 };
  tickRoom({ game, rules: { turnSeconds: 30, gameSpeed: 1, botDifficulty: 'normal' } });
  assert.ok(tank.alive); assert.ok(tank.airborne?.vy < -500); assert.equal(tank.lastLaunch?.kind, 'rescuePad');
  tank.x = Math.max(20, pad.x - 130); tank.y = WORLD.height - 12;
  tank.airborne = { vx: 0, vy: 240, falling: true, startY: 500, minY: 500, updatedAt: Date.now() - 90 };
  tickRoom({ game, rules: { turnSeconds: 30, gameSpeed: 1, botDifficulty: 'normal' } });
  assert.equal(tank.alive, false);
});

test('technological terrain is nearly level with many ramps and flying carriers', () => {
  const terrain = generateTerrain('technology-10', 'technology', 10);
  const heights = terrain.heights.slice(0, terrain.arenaWidth);
  assert.ok(Math.max(...heights) - Math.min(...heights) < 200);
  assert.ok(terrain.platforms.length >= 25);
  assert.ok(terrain.floatingPlatforms.filter((platform) => platform.kind === 'hoverCarrier').length >= 4);
});

test('flat field keeps a truly level floor while retaining platforms and structures', () => {
  const game = match('plains', 6);
  assert.ok(game.terrain.heights.slice(0, game.terrain.arenaWidth).every((height) => height === 780));
  assert.ok(game.terrain.floatingPlatforms.filter((platform) => platform.active).length >= 10);
  assert.ok(game.objects.some((object) => object.type === 'building'));
  assert.ok(game.objects.some((object) => object.type === 'crane'));
});

test('lake ice becomes a breakable physical platform and does not instantly respawn', () => {
  const game = match('flat'); game.terrain.heights.fill(850);
  game.waterZones = [{ id: 'frozen-test', x: 500, radius: 120, surfaceY: 760, frozenUntilRound: 4, fluid: true }];
  updateWaterPhysics(game, 1000);
  const ice = game.terrain.floatingPlatforms.find((platform) => platform.kind === 'iceSheet');
  assert.ok(ice?.active); assert.equal(ice.y, 760);
  ice.active = false; updateWaterPhysics(game, 1100);
  assert.equal(ice.active, false); assert.equal(game.waterZones[0].iceBrokenUntilRound, 4);
});

test('flames stay on their own supports until destruction finishes, then fall independently', () => {
  const game = match('flat'); game.terrain.heights.fill(800); game.terrain.floatingPlatforms = [
    { id: 'left', x: 450, baseX: 450, y: 590, width: 55, height: 12, active: true, durability: 100 },
    { id: 'right', x: 505, baseX: 505, y: 590, width: 55, height: 12, active: true, durability: 100 },
  ];
  game.fireZones = [{ id: 'split', x: 505, y: 590, radius: 52, turnsLeft: 3, source: 'molotov' }];
  updateFireZonePhysics(game, 1000);
  const left = game.fireZones[0].flames.find((flame) => flame.supportId === 'left');
  const right = game.fireZones[0].flames.find((flame) => flame.supportId === 'right');
  assert.ok(left && right);
  game.lastBattleAnimationUntil = 1450; game.terrain.floatingPlatforms[0].active = false;
  updateFireZonePhysics(game, 1100);
  assert.equal(left.y, 590); assert.equal(right.y, 590);
  updateFireZonePhysics(game, 1400);
  assert.equal(left.y, 590); assert.equal(right.y, 590);
  for (let now = 1530; now <= 2630; now += 100) updateFireZonePhysics(game, now);
  assert.ok(left.y > 590); assert.equal(right.y, 590);
});

test('archipelago buildings never overlap submerged lake columns', () => {
  for (let seed = 0; seed < 12; seed += 1) {
    const game = match('archipelago', 2, `lake-buildings-${seed}`);
    const buildings = game.objects.filter((object) => object.type === 'building' && object.active && !object.supportPlatformId);
    for (const building of buildings) for (let x = building.x - building.width / 2; x <= building.x + building.width / 2; x += 8) {
      assert.ok(waterDepthAt(game.terrain, game.waterZones, x, game.terrain.heights[Math.round(x)]) < 8, `${building.id} occupies a lake`);
    }
  }
});
