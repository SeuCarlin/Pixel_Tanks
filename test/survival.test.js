import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, nextTurn, sanitizeRules } from '../server/game.js';
import { survivalLavaLevel, WORLD } from '../shared/constants.js';

function match(mode = 'survival') {
  const room = {
    rules: sanitizeRules({ seed: 'survival-stable-v1', gameMode: mode, roundLimit: 10, powerupCount: 0, enabledEvents: [] }),
    players: [
      { id: 'low', nickname: 'Low', color: '#f55', connected: true },
      { id: 'high', nickname: 'High', color: '#5ff', connected: true },
    ],
  };
  room.game = createGame(room); room.game.phase = 'playing';
  return room;
}

test('survival mode has a predictable, accelerating lava level and exposes the next tide', () => {
  assert.equal(sanitizeRules({ gameMode: 'survival' }).gameMode, 'survival');
  assert.equal(survivalLavaLevel(1, 10), WORLD.height - 24);
  assert.ok(survivalLavaLevel(2, 10) > survivalLavaLevel(3, 10));
  assert.ok(survivalLavaLevel(8, 10) - survivalLavaLevel(9, 10) > survivalLavaLevel(2, 10) - survivalLavaLevel(3, 10));
  const room = match(); const before = room.game.lavaLevel;
  assert.equal(room.game.survival.nextLevel, survivalLavaLevel(2, 10));
  nextTurn(room); nextTurn(room);
  assert.equal(room.game.roundNumber, 2);
  assert.equal(room.game.lavaLevel, survivalLavaLevel(2, 10));
  assert.deepEqual(room.game.survival.lastRise, { serial: 2, round: 2, from: before, to: room.game.lavaLevel });
  assert.equal(room.game.survival.nextLevel, survivalLavaLevel(3, 10));
});

test('a survival tide eliminates submerged tanks and ends the match immediately', () => {
  const room = match(); const [low, high] = room.game.players;
  room.game.roundNumber = 5; room.game.lavaLevel = survivalLavaLevel(5, 10); low.y = 900; high.y = 500;
  nextTurn(room); nextTurn(room);
  assert.equal(room.game.roundNumber, 6);
  assert.equal(low.alive, false);
  assert.equal(high.alive, true);
  assert.equal(room.game.phase, 'finished');
  assert.equal(room.game.winner, high.id);
  assert.ok(room.game.graves.some((grave) => grave.playerId === low.id));
});

test('the ordinary duel does not gain a survival tide', () => {
  const room = match('ffa'); const before = room.game.lavaLevel;
  nextTurn(room); nextTurn(room);
  assert.equal(room.game.roundNumber, 2);
  assert.equal(room.game.lavaLevel, before);
  assert.equal(room.game.survival, null);
});
