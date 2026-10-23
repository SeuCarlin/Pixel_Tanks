import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, fire, sanitizeRules } from '../server/game.js';

function mixerRoom() {
  const room = { rules: sanitizeRules({ seed: 'mixer-test', mapType: 'flat', powerupCount: 0, mines: false }), players: [
    { id: 'a', nickname: 'A', connected: true, color: '#fff', classType: 'attacker', arsenal: ['heavy', 'elementalFire', 'mixer'] },
    { id: 'b', nickname: 'B', connected: true, color: '#f55', classType: 'healer', arsenal: ['heavy', 'jump', 'zeus'] },
  ] };
  room.game = createGame(room);
  room.game.phase = 'playing'; room.game.roundNumber = 2; room.game.turnIndex = 0;
  room.game.terrain.heights.fill(850); room.game.terrain.floatingPlatforms = [];
  room.game.objects = []; room.game.mines = []; room.game.powerups = [];
  const [shooter, target] = room.game.players;
  shooter.x = 200; shooter.y = 800; shooter.facing = 1;
  target.x = 750; target.y = 800;
  return room;
}

test('Misturador fuses two selected impact weapons, spends both and creates a secondary fire effect', () => {
  const room = mixerRoom();
  const results = fire(room, 'a', { weapon: 'heavy', mixerPartner: 'elementalFire', angle: 25, power: 390, direction: 1 });
  assert.equal(room.game.players[0].ammo.heavy, 0);
  assert.equal(room.game.players[0].ammo.elementalFire, 0);
  assert.equal(room.game.players[0].ammo.mixer, 0);
  assert.equal(room.game.players[0].mixerLastUsedRound, 2);
  assert.ok(results.some((shot) => shot.interactions?.some((entry) => entry.type === 'mixerFusion' && entry.partner === 'elementalFire')));
  assert.ok(room.game.fireZones.some((zone) => zone.source === 'mixer'));
});

test('Misturador rejects same, unavailable and cooling partners without consuming ammunition', () => {
  const room = mixerRoom(); const shooter = room.game.players[0];
  const input = { weapon: 'heavy', angle: 25, power: 390, direction: 1 };
  assert.throws(() => fire(room, 'a', { ...input, mixerPartner: 'heavy' }), /duas armas/);
  assert.throws(() => fire(room, 'a', { ...input, mixerPartner: 'zeus' }), /Segunda arma/);
  shooter.mixerLastUsedRound = 1;
  assert.throws(() => fire(room, 'a', { ...input, mixerPartner: 'elementalFire' }), /recarregando/);
  assert.equal(shooter.ammo.heavy, 1);
  assert.equal(shooter.ammo.elementalFire, 1);
});
