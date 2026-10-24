import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, fire, sanitizeRules, tickRoom, updateIcePhysics, updateWaterOrbs, updateWaterPhysics, updateWindVortices } from '../server/game.js';
import { airPocketCurrents } from '../shared/flood.js';
import { deflectProjectile } from '../shared/wind-vortex.js';
import { WORLD } from '../shared/constants.js';

function duel(classType = null) {
  const room = { rules: sanitizeRules({ seed: 'water-orb-final', mapType: 'flat', enabledEvents: [], powerupCount: 0 }), players: [
    { id: 'one', nickname: 'One', classType, arsenal: ['heavy', 'jump', 'zeus'] },
    { id: 'two', nickname: 'Two', arsenal: ['heavy', 'jump', 'zeus'] },
  ] };
  room.game = createGame(room);
  Object.assign(room.game, { phase: 'playing', roundNumber: 2, turnNumber: 2, turnIndex: 0, openingRestrictionsActive: false, objects: [], powerups: [], mines: [] });
  room.game.terrain.heights.fill(700); room.game.terrain.floatingPlatforms = [];
  room.game.players[0].x = 500; room.game.players[0].y = 700 - WORLD.tankRadius;
  room.game.players[1].x = 3000; room.game.players[1].y = 700 - WORLD.tankRadius;
  return room;
}

test('match result waits for pending effects and then reaches finished without another turn', () => {
  const room = duel();
  room.game.players[1].alive = false; room.game.players[1].health = 0;
  room.game.delayedStrikes = [{ id: 'pending', executeAt: Date.now() + 10000 }];
  tickRoom(room);
  assert.equal(room.game.phase, 'playing');
  room.game.delayedStrikes = [];
  assert.equal(tickRoom(room)?.changed, true);
  assert.equal(room.game.phase, 'finished');
  assert.equal(room.game.winner, 'one');
  assert.ok(room.game.finalStandings?.length);
});

test('water bomb stays a falling orb until it strikes a platform, then spreads', () => {
  const room = duel('elementalist');
  room.game.players[0].elementalCurrent = 'elementalWater';
  const [shot] = fire(room, 'one', { weapon: 'standard', angle: 35, power: 300, direction: 1 });
  const orb = room.game.waterOrbs[0];
  assert.ok(shot.impact && orb);
  assert.equal(orb.x, shot.impact.x);
  assert.equal(orb.y, shot.impact.y, 'a esfera nasce no contato da bomba');
  assert.equal(room.game.waterZones.some((lake) => lake.id.startsWith('elemental-lake-')), false);
  updateWaterOrbs(room.game, orb.appearsAt + 100);
  assert.ok(orb.y < shot.impact.y && orb.vy < 0, 'a pressão lança a água antes da queda');
  const catchY = orb.y - 15;
  room.game.terrain.floatingPlatforms = [{ id: 'catch', x: orb.x - 65, y: catchY, width: 130, height: 8, active: true }];
  room.game.terrain.heights.fill(Math.min(WORLD.height - 80, catchY + 220));
  room.game.objects = [];
  for (let step = 1; step <= 20 && room.game.waterOrbs.length; step += 1) updateWaterOrbs(room.game, orb.appearsAt + step * 100);
  assert.equal(room.game.waterOrbs.length, 0);
  assert.equal(room.game.lastWaterOrbLandings.at(-1)?.support, 'platform');
  const flow = room.game.platformWaterFlows.find((entry) => entry.platformId === 'catch');
  assert.ok(flow);
  assert.equal(room.game.waterZones.some((lake) => lake.id.startsWith('elemental-lake-')), false, 'platform landing cannot flood the terrain below');
  for (let step = 1; step <= 20 && flow.phase !== 'falling'; step += 1) updateWaterPhysics(room.game, flow.startedAt + step * 100);
  assert.equal(flow.phase, 'falling');
  assert.equal(room.game.waterZones.some((lake) => lake.id.startsWith('elemental-lake-')), false, 'water remains above ground while cascading');
  for (let step = 21; step <= 60 && !room.game.waterZones.some((lake) => lake.id.startsWith('elemental-lake-')); step += 1) updateWaterPhysics(room.game, flow.startedAt + step * 100);
  assert.ok(room.game.waterZones.some((lake) => lake.id.startsWith('elemental-lake-')));
  assert.equal(room.game.lastWaterOrbLandings.at(-1)?.support, 'terrain');
  assert.ok(Math.abs(room.game.lastWaterOrbLandings.at(-1).x - (flow.direction < 0 ? room.game.terrain.floatingPlatforms[0].x : room.game.terrain.floatingPlatforms[0].x + 130)) < 65, 'the lake forms below the edge reached by water');
});

test('water runs across a second platform before reaching and flooding the ground', () => {
  const room = duel('elementalist'); const game = room.game;
  game.terrain.heights.fill(900); game.objects = []; game.waterZones = [];
  game.terrain.floatingPlatforms = [
    { id: 'upper', x: 500, y: 500, width: 200, height: 8, active: true },
    { id: 'lower', x: 700, y: 650, width: 140, height: 8, active: true },
  ];
  const flow = { id: 'cascade', phase: 'spreading', platformId: 'upper', supportObjectId: null, x: 650, y: 497, direction: 1, width: 100, lastSupportX: 500, startedAt: 1000, updatedAt: 1000, endsAt: 31000 };
  game.platformWaterFlows = [flow];
  for (let step = 1; step <= 25 && flow.platformId !== 'lower'; step += 1) updateWaterPhysics(game, 1000 + step * 100);
  assert.equal(flow.platformId, 'lower', 'the lower deck catches the falling stream');
  assert.equal(game.waterZones.length, 0, 'no lake appears below either deck');
  for (let step = 26; step <= 85 && !game.waterZones.length; step += 1) updateWaterPhysics(game, 1000 + step * 100);
  assert.equal(game.platformWaterFlows.length, 0);
  assert.equal(game.waterZones.length, 1);
  assert.equal(game.lastWaterOrbLandings.at(-1)?.support, 'terrain');
});

test('water falls from a destroyed support instead of flooding under it immediately', () => {
  const room = duel('elementalist'); const game = room.game;
  game.terrain.heights.fill(810); game.objects = []; game.waterZones = [];
  game.terrain.floatingPlatforms = [{ id: 'broken', x: 500, y: 530, width: 180, height: 8, active: false }];
  const flow = { id: 'falling-support', phase: 'spreading', platformId: 'broken', supportObjectId: null, x: 580, y: 527, direction: 1, width: 100, startedAt: 1000, updatedAt: 1000, endsAt: 31000 };
  game.platformWaterFlows = [flow];
  updateWaterPhysics(game, 1100);
  assert.equal(flow.phase, 'falling');
  assert.equal(game.waterZones.length, 0);
  for (let step = 2; step <= 30 && !game.waterZones.length; step += 1) updateWaterPhysics(game, 1000 + step * 100);
  assert.equal(game.waterZones.length, 1);
  assert.ok(game.lastWaterOrbLandings.at(-1).y >= 800);
});

test('ice appears only at impact and allocates points only on actual supports', () => {
  const room = duel('elementalist');
  room.game.players[0].elementalCurrent = 'elementalIce';
  const [shot] = fire(room, 'one', { weapon: 'standard', angle: 35, power: 300, direction: 1 });
  assert.ok(shot.impact && room.game.pendingIceBursts.length);
  assert.equal(room.game.iceZones.length, 0);
  const burst = room.game.pendingIceBursts[0];
  const left = Math.floor(burst.x);
  for (let x = left; x < left + 70; x += 1) room.game.terrain.heights[x] = WORLD.height + 100;
  room.game.terrain.floatingPlatforms = [{ id: 'ice-catch', x: left + 20, y: burst.y - 45, width: 60, height: 8, active: true }];
  updateIcePhysics(room.game, burst.appearsAt - 1);
  assert.equal(room.game.iceZones.length, 0);
  updateIcePhysics(room.game, burst.appearsAt + 1);
  const zone = room.game.iceZones[0];
  assert.ok(zone.points.length > 0);
  assert.ok(zone.points.some((point) => point.supportId === 'ice-catch'));
  assert.ok(zone.points.every((point) => point.support !== 'terrain' || room.game.terrain.heights[Math.round(point.x)] < WORLD.height - 4));
  room.game.terrain.floatingPlatforms[0].active = false;
  const falling = zone.points.find((point) => point.supportId === 'ice-catch');
  const beforeY = falling.y;
  updateIcePhysics(room.game, burst.appearsAt + 301);
  assert.ok(falling.y > beforeY);
});

test('water orb falls out of an opened void instead of creating a floating lake', () => {
  const room = duel('elementalist');
  room.game.players[0].elementalCurrent = 'elementalWater';
  fire(room, 'one', { weapon: 'standard', angle: 35, power: 300, direction: 1 });
  const orb = room.game.waterOrbs[0];
  room.game.terrain.heights.fill(WORLD.height + 300);
  for (let step = 1; step <= 70 && room.game.waterOrbs.length; step += 1) updateWaterOrbs(room.game, orb.appearsAt + step * 100);
  assert.equal(room.game.waterOrbs.length, 0);
  assert.equal(room.game.lastWaterOrbLandings.length, 0);
  assert.equal(room.game.waterZones.some((lake) => lake.id.startsWith('elemental-lake-')), false);
});

test('air pockets bend submerged projectiles; supported tornado falls after its platform breaks', () => {
  const room = duel();
  const lake = { id: 'lake', x: 600, radius: 170, surfaceY: 560, airPockets: [{ id: 'air', x: 600, radius: 42 }] };
  const [current] = airPocketCurrents(room.game.terrain, [lake]);
  assert.equal(current.kind, 'airPocket');
  const bent = deflectProjectile([current], 620, 640, 120, 10, .1);
  assert.ok(bent.vx !== 120 && bent.vy < 10);
  const platform = { id: 'floating', x: 500, y: 500, width: 200, height: 8, active: true };
  room.game.terrain.floatingPlatforms = [platform];
  const now = Date.now();
  const tornado = { id: 'tornado', source: 'gale', x: 600, y: 500, width: 170, height: 340, supportPlatformId: 'floating', appearsAt: now, updatedAt: now, driftDirection: 1, expiresTurn: 10, hitRounds: {} };
  room.game.windVortices = [tornado]; room.game.wind = 0;
  updateWindVortices(room.game, now + 100);
  assert.equal(tornado.y, 500);
  platform.active = false;
  for (let step = 2; step <= 24; step += 1) updateWindVortices(room.game, now + step * 100);
  assert.ok(tornado.y > 500);
  assert.equal(tornado.y, 700);
  const grounded = { id: 'grounded', source: 'windPlate', x: 900, y: 500, width: 130, height: 300, appearsAt: now, updatedAt: now, expiresRound: 3, hitRounds: {} };
  room.game.windVortices = [grounded]; room.game.terrain.heights[900] = 500;
  updateWindVortices(room.game, now + 100);
  room.game.terrain.heights[900] = 700;
  updateWindVortices(room.game, now + 200);
  assert.ok(grounded.y > 500, 'a placa cai quando o solo que a apoiava é destruído');
});
