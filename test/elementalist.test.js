import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, fire, sanitizeRules, updateWindVortices } from '../server/game.js';
import { ELEMENTAL_BOMBS, WORLD } from '../shared/constants.js';
import { visibleWaterColumns, waterSurfaceAt } from '../shared/flood.js';

function elementalRoom(weapon) {
  const room = { rules: sanitizeRules({ seed: `element-${weapon}`, powerupCount: 0, enabledEvents: [], mapType: 'flat' }), players: [
    { id: 'element', nickname: 'Element', classType: 'elementalist' },
    { id: 'enemy', nickname: 'Enemy', classType: 'healer' },
  ] };
  room.game = createGame(room);
  Object.assign(room.game, { phase: 'playing', roundNumber: 2, turnIndex: 0, openingRestrictionsActive: false, objects: [], mines: [], powerups: [] });
  room.game.terrain.heights.fill(700); room.game.terrain.floatingPlatforms = [];
  room.game.players[0].x = 500; room.game.players[0].y = 700 - WORLD.tankRadius;
  room.game.players[1].x = 3200; room.game.players[1].y = 700 - WORLD.tankRadius;
  room.game.players[0].elementalCurrent = weapon;
  for (const type of ELEMENTAL_BOMBS) room.game.players[0].ammo[type] = type === weapon ? 1 : 0;
  return room;
}

test('cada bomba elemental produz seu efeito físico próprio', () => {
  const fireRoom = elementalRoom('elementalFire');
  assert.ok(fire(fireRoom, 'element', { weapon: 'elementalFire', angle: 35, power: 300, direction: 1 })[0].impact);
  assert.ok(fireRoom.game.fireZones.some((zone) => zone.source === 'elementalFire' && zone.turnsLeft === 3));

  const waterRoom = elementalRoom('elementalWater');
  assert.ok(fire(waterRoom, 'element', { weapon: 'elementalWater', angle: 35, power: 300, direction: 1 })[0].impact);
  assert.ok(waterRoom.game.waterZones.some((zone) => zone.id.startsWith('elemental-lake-')));
  const lake = waterRoom.game.waterZones.find((zone) => zone.id.startsWith('elemental-lake-'));
  assert.ok(waterSurfaceAt(lake, lake.fillStartedAt) > waterSurfaceAt(lake, lake.fillStartedAt + lake.fillDurationMs));
  const early = visibleWaterColumns([lake], lake.x - lake.radius, lake.x + lake.radius, lake.fillStartedAt + 100, 5);
  const full = visibleWaterColumns([lake], lake.x - lake.radius, lake.x + lake.radius, lake.fillStartedAt + lake.fillDurationMs, 5);
  assert.ok(early.surfaces.filter(Number.isFinite).length < full.surfaces.filter(Number.isFinite).length);
  const surgeRoom = elementalRoom('elementalWater');
  surgeRoom.game.players[1].x = waterRoom.game.waterZones[0].x + 35;
  surgeRoom.game.players[1].y = 700 - WORLD.tankRadius;
  fire(surgeRoom, 'element', { weapon: 'elementalWater', angle: 35, power: 300, direction: 1 });
  assert.equal(surgeRoom.game.players[1].airborne?.fromWaterSurge, true, 'the water blast drags a nearby tank into the air');

  const windRoom = elementalRoom('elementalWind');
  const [windShot] = fire(windRoom, 'element', { weapon: 'elementalWind', angle: 35, power: 300, direction: 1 });
  assert.ok(windShot.impact);
  assert.equal(windRoom.game.windVortices[0].height, 600);
  assert.equal(windRoom.game.windVortices[0].width, 200);
  assert.equal(windRoom.game.windVortices[0].expiresRound, 3);
  const vortex = windRoom.game.windVortices[0];
  assert.ok(vortex.appearsAt > Date.now(), 'the vortex waits for the projectile to land');
  windRoom.game.fireZones.push({ x: vortex.x, y: vortex.y, radius: 60, turnsLeft: 3 });
  updateWindVortices(windRoom.game, vortex.appearsAt - 1);
  assert.equal(vortex.fire, false);
  updateWindVortices(windRoom.game, vortex.updatedAt + 30);
  assert.equal(vortex.fire, true);

  const earthRoom = elementalRoom('elementalEarth');
  const before = [...earthRoom.game.terrain.heights];
  assert.ok(fire(earthRoom, 'element', { weapon: 'elementalEarth', angle: 35, power: 300, direction: 1 })[0].impact);
  assert.ok(earthRoom.game.terrain.heights.some((height, x) => height !== before[x]));

  const iceRoom = elementalRoom('elementalIce');
  const [iceShot] = fire(iceRoom, 'element', { weapon: 'elementalIce', angle: 35, power: 300, direction: 1 });
  assert.ok(iceShot.impact); assert.equal(iceRoom.game.iceZones.length, 1); assert.equal(iceRoom.game.iceZones[0].expiresRound, 5);
});

test('outra classe não pode equipar bombas elementais exclusivas', () => {
  const room = elementalRoom('elementalWind');
  room.game.players[0].classType = 'healer';
  assert.throws(() => fire(room, 'element', { weapon: 'elementalWind', angle: 35, power: 300, direction: 1 }));
});
