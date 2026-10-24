import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, fire, sanitizeRules, tickRoom, updateWaterOrbs, updateWindVortices } from '../server/game.js';
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
  assert.equal(room.game.waterZones.some((lake) => lake.id.startsWith('elemental-lake-')), false);
  room.game.terrain.floatingPlatforms = [{ id: 'catch', x: orb.x - 65, y: orb.y + 70, width: 130, height: 8, active: true }];
  for (let step = 1; step <= 20 && room.game.waterOrbs.length; step += 1) updateWaterOrbs(room.game, orb.appearsAt + step * 100);
  assert.equal(room.game.waterOrbs.length, 0);
  assert.equal(room.game.lastWaterOrbLandings.at(-1)?.support, 'platform');
  assert.ok(room.game.platformWaterFlows.some((flow) => flow.platformId === 'catch'));
  assert.ok(room.game.waterZones.some((lake) => lake.id.startsWith('elemental-lake-')));
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
