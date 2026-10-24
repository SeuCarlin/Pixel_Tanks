import test from 'node:test';
import assert from 'node:assert/strict';
import { barrelRadians, easeBarrelAngle } from '../shared/tank-barrel.js';
import { createGame, fire, publicGame, sanitizeRules, setPlayerAim } from '../server/game.js';

test('barrel direction follows positive and downward aim on both sides', () => {
  const right = barrelRadians(45, 1);
  const left = barrelRadians(45, -1);
  assert.ok(Math.cos(right) > 0 && Math.sin(right) < 0);
  assert.ok(Math.cos(left) < 0 && Math.sin(left) < 0);
  assert.ok(Math.cos(barrelRadians(-35, 1)) > 0 && Math.sin(barrelRadians(-35, 1)) > 0);
  assert.ok(Math.cos(barrelRadians(-35, -1)) < 0 && Math.sin(barrelRadians(-35, -1)) > 0);
});

test('barrel takes shortest smooth path when the player reverses aim', () => {
  const from = barrelRadians(45, 1); const to = barrelRadians(45, -1);
  const first = easeBarrelAngle(from, to, 16);
  assert.ok(Math.abs(first - from) > 0 && Math.abs(first - from) < .5);
  assert.ok(Math.abs(Math.atan2(Math.sin(to - first), Math.cos(to - first))) < Math.abs(Math.atan2(Math.sin(to - from), Math.cos(to - from))));
  assert.equal(easeBarrelAngle(first, to, 120), first + Math.atan2(Math.sin(to - first), Math.cos(to - first)));
});

test('server accepts only current tank aim and exposes it to other players', () => {
  const room = { rules: sanitizeRules({ seed: 'barrel-aim', mapType: 'flat', powerupCount: 0 }), players: [
    { id: 'a', nickname: 'A', color: '#fff', connected: true },
    { id: 'b', nickname: 'B', color: '#f55', connected: true },
  ] };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.turnIndex = 0;
  assert.equal(setPlayerAim(room, 'b', { angle: 50, direction: -1 }), null);
  assert.deepEqual(setPlayerAim(room, 'a', { angle: 37, direction: -1 }), { playerId: 'a', angle: 37, direction: -1 });
  assert.equal(setPlayerAim(room, 'a', { angle: 37, direction: -1 }), null);
  assert.equal(publicGame(room.game, 'b').players[0].aimAngle, 37);
  assert.equal(publicGame(room.game, 'b').players[0].aimDirection, -1);
  room.game.shotEndsAt = Date.now() + 1000;
  assert.equal(setPlayerAim(room, 'a', { angle: 60, direction: 1 }), null);
  room.game.shotEndsAt = 0;
  fire(room, 'a', { angle: 50, power: 310, direction: -1, weapon: 'standard' });
  assert.equal(room.game.players[0].aimAngle, 50);
  assert.equal(room.game.players[0].aimDirection, -1);
});
