import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../server/rooms.js';
import { deflectProjectile } from '../shared/wind-vortex.js';

test('host can reroll the scenario once before the match, and everyone sees the result', () => {
  const manager = new RoomManager(); const host = {};
  const { room } = manager.create(host, { nickname: 'Host', rules: { mapType: 'random', botCount: 1, seed: 12345 } });
  const firstSeed = room.mapSeed; const firstBiome = room.mapTypeResolved;
  assert.equal(manager.publicRoom(room).scenarioRerollsLeft, 1);
  manager.rerollScenario(room.code, host.playerId);
  assert.notEqual(room.mapSeed, firstSeed);
  assert.notEqual(room.mapTypeResolved, firstBiome);
  assert.equal(manager.publicRoom(room).mapTypeResolved, room.mapTypeResolved);
  assert.equal(manager.publicRoom(room).mapSeed, room.mapSeed);
  assert.equal(manager.publicRoom(room).scenarioRerollsLeft, 0);
  assert.throws(() => manager.rerollScenario(room.code, host.playerId), /já foi usado/);
  room.game = { phase: 'playing' };
  assert.throws(() => manager.rerollScenario(room.code, host.playerId), /antes da partida/);
});

test('fixed biome reroll changes terrain seed and rejects non-host requests', () => {
  const manager = new RoomManager(); const host = {};
  const { room } = manager.create(host, { nickname: 'Host', rules: { mapType: 'archipelago', botCount: 1, seed: 10001 } });
  assert.throws(() => manager.rerollScenario(room.code, room.players[1].id), /anfitrião/);
  manager.rerollScenario(room.code, host.playerId);
  assert.equal(room.mapTypeResolved, 'archipelago');
  assert.notEqual(room.mapSeed, 10001);
});

test('vortex does not lift projectiles until the elemental bomb lands', () => {
  const vortex = { x: 300, y: 700, width: 200, height: 600, appearsAt: 5000 };
  assert.equal(deflectProjectile([vortex], 300, 400, 100, 50, 1 / 60, 4999).vortex, null);
  assert.equal(deflectProjectile([vortex], 300, 400, 100, 50, 1 / 60, 5000).vortex, vortex);
});
