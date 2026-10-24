import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, fire, sanitizeRules, tickRoom, updateWindVortices } from '../server/game.js';
import { ELEMENTAL_BOMBS, SELECTABLE_ARSENAL_ITEMS, WORLD } from '../shared/constants.js';
import { visibleWaterColumns, waterSurfaceAt } from '../shared/flood.js';

function elementalRoom(element) {
  const room = { rules: sanitizeRules({ seed: `element-${element}`, powerupCount: 0, enabledEvents: [], mapType: 'flat' }), players: [
    { id: 'element', nickname: 'Element', classType: 'elementalist', arsenal: ['heavy', 'jump', 'zeus'] },
    { id: 'enemy', nickname: 'Enemy', classType: 'healer' },
  ] };
  room.game = createGame(room);
  Object.assign(room.game, { phase: 'playing', roundNumber: 2, turnNumber: 2, turnIndex: 0, openingRestrictionsActive: false, objects: [], mines: [], powerups: [] });
  room.game.terrain.heights.fill(700); room.game.terrain.floatingPlatforms = [];
  room.game.players[0].x = 500; room.game.players[0].y = 700 - WORLD.tankRadius;
  room.game.players[1].x = 3200; room.game.players[1].y = 700 - WORLD.tankRadius;
  room.game.players[0].elementalCurrent = element;
  return room;
}

const launch = (room, weapon = 'standard') => fire(room, 'element', { weapon, angle: 35, power: 300, direction: 1 });

test('elemento sorteado modifica o tiro comum sem ocupar arsenal', () => {
  const room = elementalRoom('elementalFire');
  const player = room.game.players[0];
  assert.equal(player.arsenal.length, 3);
  assert.ok(player.arsenal.every((weapon) => !ELEMENTAL_BOMBS.includes(weapon)));
  assert.ok(ELEMENTAL_BOMBS.every((weapon) => !SELECTABLE_ARSENAL_ITEMS.includes(weapon)));
  const [shot] = launch(room);
  assert.ok(shot.impact);
  assert.equal(shot.weapon, 'standard');
  assert.equal(shot.elementalType, 'elementalFire');
  assert.equal(shot.elementalBurst, true);
  assert.ok(room.game.fireZones.some((zone) => zone.source === 'elementalFire' && zone.turnsLeft === 3));
  assert.throws(() => launch(elementalRoom('elementalFire'), 'elementalFire'), /não são armas separadas/);
});

test('elemento também acompanha arma do arsenal', () => {
  const room = elementalRoom('elementalFire');
  const [shot] = launch(room, 'heavy');
  assert.equal(shot.weapon, 'heavy');
  assert.equal(shot.elementalType, 'elementalFire');
  assert.equal(room.game.fireZones.filter((zone) => zone.source === 'elementalFire').length, 1);
});

test('água, vento, terra e gelo preservam os efeitos físicos das antigas bombas', () => {
  const waterRoom = elementalRoom('elementalWater');
  assert.ok(launch(waterRoom)[0].impact);
  const lake = waterRoom.game.waterZones.find((zone) => zone.id.startsWith('elemental-lake-'));
  assert.ok(lake);
  assert.ok(waterSurfaceAt(lake, lake.fillStartedAt) > waterSurfaceAt(lake, lake.fillStartedAt + lake.fillDurationMs));
  const early = visibleWaterColumns([lake], lake.x - lake.radius, lake.x + lake.radius, lake.fillStartedAt + 100, 5);
  const full = visibleWaterColumns([lake], lake.x - lake.radius, lake.x + lake.radius, lake.fillStartedAt + lake.fillDurationMs, 5);
  assert.ok(early.surfaces.filter(Number.isFinite).length < full.surfaces.filter(Number.isFinite).length);

  const windRoom = elementalRoom('elementalWind');
  const [windShot] = launch(windRoom);
  assert.ok(windShot.impact && windShot.elementalBurst);
  const vortex = windRoom.game.windVortices[0];
  assert.equal(vortex.height, 600);
  assert.equal(vortex.width, 200);
  assert.equal(vortex.expiresRound, 3);
  assert.ok(vortex.appearsAt > Date.now());
  windRoom.game.fireZones.push({ x: vortex.x, y: vortex.y, radius: 60, turnsLeft: 3 });
  updateWindVortices(windRoom.game, vortex.appearsAt - 1);
  assert.equal(vortex.fire, false);
  updateWindVortices(windRoom.game, vortex.updatedAt + 30);
  assert.equal(vortex.fire, true);

  const earthRoom = elementalRoom('elementalEarth');
  const [earthShot] = launch(earthRoom);
  assert.ok(earthShot.impact && earthShot.elementalBurst);
  const afterStandardImpact = [...earthRoom.game.terrain.heights];
  assert.ok(earthRoom.game.delayedStrikes.length, 'a deformação elemental espera a marca detonar');
  const earthTarget = earthRoom.game.players[1];
  earthTarget.x = Math.round(earthShot.impact.x); earthTarget.y = earthRoom.game.terrain.heights[earthTarget.x] - WORLD.tankRadius;
  earthTarget.airborne = null; earthTarget.supportPlatformId = null;
  earthRoom.game.delayedStrikes[0].executeAt = Date.now() - 1;
  const earthDetonation = tickRoom(earthRoom);
  assert.ok(earthDetonation.shot.results[0].interactions.some((entry) => entry.type === 'elementalEarth' && entry.crushedIds.includes(earthTarget.id)));
  assert.ok(earthDetonation.shot.results[0].damage.some((hit) => hit.playerId === earthTarget.id && hit.earthCrush));
  assert.equal(earthTarget.armorFractureTurns, 1);
  assert.ok(earthRoom.game.terrain.heights.some((height, x) => height !== afterStandardImpact[x]));

  const iceRoom = elementalRoom('elementalIce');
  const [iceShot] = launch(iceRoom);
  assert.ok(iceShot.impact && iceShot.elementalBurst);
  assert.equal(iceRoom.game.iceZones.length, 1);
  assert.equal(iceRoom.game.iceZones[0].expiresRound, 5);
});

test('outras classes não recebem efeitos elementais', () => {
  const room = elementalRoom('elementalWind');
  room.game.players[0].classType = 'healer';
  const [shot] = launch(room);
  assert.equal(shot.elementalType, undefined);
  assert.equal(room.game.windVortices.length, 0);
});
