import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, movePlayer, sanitizeRules, useArsenal } from '../server/game.js';
import { WORLD } from '../shared/constants.js';

test('movement and jump audio markers exist only after accepted actions', () => {
  const room = { rules: sanitizeRules({ seed: 'audio-action-confirmation', powerupCount: 0, enabledEvents: [] }), players: [
    { id: 'one', nickname: 'One', color: '#fff', connected: true },
    { id: 'two', nickname: 'Two', color: '#f66', connected: true },
  ] };
  room.game = createGame(room); room.game.phase = 'playing';
  const player = room.game.players[0]; room.game.terrain.heights.fill(800); room.game.terrain.floatingPlatforms = []; room.game.objects = []; room.game.mines = []; player.x = 200; player.y = 800 - WORLD.tankRadius; room.game.players[1].x = 1500; room.game.players[1].y = 800 - WORLD.tankRadius;
  room.game.actions.movesLeft = 0;
  assert.throws(() => movePlayer(room, player.id, 1), /Sem movimentos/);
  assert.equal(player.lastMove, undefined);
  room.game.actions.movesLeft = 2;
  movePlayer(room, player.id, 1);
  assert.equal(player.lastMove?.kind, 'tracks');
  assert.ok(player.lastMove.serial > 0);
  const moveSerial = player.lastMove.serial;
  useArsenal(room, player.id, { type: 'jump', angle: 45, power: 280, direction: 1 });
  assert.equal(player.lastJump?.kind, 'jump');
  assert.ok(player.lastJump.serial > moveSerial);
  const jumpSerial = player.lastJump.serial;
  useArsenal(room, player.id, { type: 'parachute' });
  assert.equal(player.lastJump?.kind, 'parachute');
  assert.ok(player.lastJump.serial > jumpSerial);
});
