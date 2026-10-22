import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, matchScore, sanitizeRules, setSoloControl, tickRoom } from '../server/game.js';

function soloRoom() {
  const room = { rules: sanitizeRules({ seed: 'solo-control-score', botCount: 1, powerupCount: 0, enabledEvents: [] }), players: [
    { id: 'human', nickname: 'Human', connected: true, arsenal: ['heavy'] },
    { id: 'bot', nickname: 'Bot', connected: true, isBot: true, arsenal: ['heavy'] },
  ] };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.turnIndex = 1; room.game.turnEndsAt = Date.now() + 20_000; room.game.botActAt = Date.now() + 4_000;
  return room;
}

test('solo player can pause the authoritative timeline and accelerate bot turns', () => {
  const room = soloRoom(); const originalTurnEnd = room.game.turnEndsAt;
  setSoloControl(room, 'human', { action: 'pause', paused: true });
  assert.equal(room.game.paused, true); assert.equal(tickRoom(room), null);
  room.game.pausedAt -= 2_000; setSoloControl(room, 'human', { action: 'pause', paused: false });
  assert.ok(room.game.turnEndsAt >= originalTurnEnd + 1_900);
  const before = room.game.botActAt; setSoloControl(room, 'human', { action: 'botSpeed', speed: 4 });
  assert.equal(room.game.botSpeed, 4); assert.ok(room.game.botActAt - Date.now() < (before - Date.now()) / 2);
  assert.throws(() => setSoloControl(room, 'bot', { action: 'pause', paused: true }), /solo/);
});

test('final score rewards objective, survival, health, damage, destruction and eliminations', () => {
  const room = soloRoom(); const player = room.game.players[0]; player.alive = true; player.health = 80; player.hillScore = 2; player.stats = { damage: 120, destruction: 75, shots: 3, destroyed: { tank: 1 } }; room.game.mode = 'hill';
  assert.equal(matchScore(player, room.game), 2 * 1200 + 1000 + 80 * 3 + 120 + 75 + 500);
});
