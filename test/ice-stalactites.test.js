import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, fire, sanitizeRules, updateIcePhysics } from '../server/game.js';
import { WORLD } from '../shared/constants.js';

function iceRoom() {
  const room = { rules: sanitizeRules({ seed: 'ice-support-qa', mapType: 'flat', enabledEvents: [], powerupCount: 0 }), players: [
    { id: 'ice', nickname: 'Ice', classType: 'elementalist', arsenal: ['heavy', 'jump', 'zeus'] },
    { id: 'target', nickname: 'Target', arsenal: ['heavy', 'jump', 'zeus'] },
  ] };
  room.game = createGame(room);
  Object.assign(room.game, { phase: 'playing', roundNumber: 2, turnNumber: 2, turnIndex: 0, openingRestrictionsActive: false, objects: [], powerups: [], mines: [] });
  room.game.terrain.heights.fill(650); room.game.terrain.floatingPlatforms = [{ id: 'ice-deck', x: 550, baseX: 550, y: 500, width: 180, height: 12, active: true, durability: 100 }];
  room.game.players[0].x = 300; room.game.players[0].y = 650 - WORLD.tankRadius; room.game.players[0].elementalCurrent = 'elementalIce';
  room.game.players[1].x = 2500; room.game.players[1].y = 650 - WORLD.tankRadius;
  return room;
}

function burst(game, at) {
  game.pendingIceBursts.push({ id: `burst-${at}`, x: 630, y: 500, ownerId: 'ice', radius: 185, appearsAt: at, expiresRound: 5 });
  updateIcePhysics(game, at);
  return game.iceZones.at(-1);
}

test('ice lands on the upper deck without forming an early layer on the hidden ground', () => {
  const { game } = iceRoom(); game.players[1].x = 630; game.players[1].y = 650 - WORLD.tankRadius; const zone = burst(game, 1000);
  assert.ok(zone.points.some((point) => point.supportId === 'ice-deck' && point.kind === 'surface'));
  assert.ok(zone.points.some((point) => point.supportId === 'ice-deck' && point.kind === 'stalactite'));
  assert.equal(zone.points.some((point) => point.support === 'terrain' && point.x >= 550 && point.x <= 730), false);
  assert.equal(game.players[1].frozenTurns, 0, 'the deck also blocks the freeze pulse below it');
});

test('a second ice burst stacks layers; broken support releases damaging stalactites', () => {
  const { game } = iceRoom(); burst(game, 1000); const second = burst(game, 1200);
  assert.ok(second.points.some((point) => point.supportId === 'ice-deck' && point.kind === 'surface' && point.layer === 2));
  const spike = second.points.find((point) => point.kind === 'stalactite');
  const target = game.players[1]; target.x = spike.x; target.y = spike.y + 65; target.health = 150;
  game.terrain.floatingPlatforms[0].active = false;
  for (let time = 1300; time < 2200 && target.health === 150; time += 100) updateIcePhysics(game, time);
  assert.ok(target.health < 150, 'a falling spike damages the tank below');
  assert.ok(game.lastIceStalactiteHits.some((hit) => hit.playerId === target.id));
});

test('an ice shot damages a tank without pushing or launching it', () => {
  const probe = iceRoom(); probe.game.terrain.floatingPlatforms = [];
  const impact = fire(probe, 'ice', { weapon: 'standard', angle: 35, power: 300, direction: 1 })[0].impact;
  const room = iceRoom(); room.game.terrain.floatingPlatforms = []; const target = room.game.players[1];
  target.x = impact.x; target.y = 650 - WORLD.tankRadius; const beforeX = target.x;
  const shot = fire(room, 'ice', { weapon: 'standard', angle: 35, power: 300, direction: 1 })[0];
  assert.ok(shot.damage.some((hit) => hit.playerId === target.id && hit.amount > 0));
  assert.equal(target.x, beforeX); assert.equal(target.airborne?.vx || 0, 0, 'ground collapse may cause a fall, but ice adds no impulse');
});

test('a projectile striking a hanging spike releases it before the platform breaks', () => {
  const probe = iceRoom(); probe.game.terrain.floatingPlatforms = []; probe.game.players[0].elementalCurrent = 'elementalFire';
  const route = fire(probe, 'ice', { weapon: 'standard', angle: 35, power: 300, direction: 1 })[0].path;
  const crossing = route[Math.floor(route.length / 2)];
  const room = iceRoom(); room.game.terrain.floatingPlatforms = []; room.game.players[0].elementalCurrent = 'elementalFire';
  const spike = { x: crossing.x, y: crossing.y - 8, length: 28, kind: 'stalactite', support: 'platform', supportId: 'synthetic', vy: 0 };
  room.game.iceZones = [{ id: 'hanging-test', x: crossing.x, y: crossing.y, radius: 60, expiresRound: 5, ownerId: 'target', points: [spike] }];
  const shot = fire(room, 'ice', { weapon: 'standard', angle: 35, power: 300, direction: 1 })[0];
  assert.equal(shot.impact.iceStalactite, true);
  assert.ok(spike.triggeredAt > 0);
  updateIcePhysics(room.game, spike.triggeredAt + 100);
  assert.equal(spike.support, null);
});
