import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, fire, nextTurn, claimReward, sanitizeRules } from '../server/game.js';
import { simulateShot } from '../server/physics.js';
import { WORLD } from '../shared/constants.js';
import { RoomManager } from '../server/rooms.js';

function room(rules = {}) {
  return {
    rules: sanitizeRules({ powerupCount: 20, ...rules }),
    players: [
      { id: 'one', nickname: 'One', color: '#fff', connected: true },
      { id: 'two', nickname: 'Two', color: '#000', connected: true },
    ],
  };
}

test('game speed is sanitized and exposed by the game', () => {
  const match = room({ gameSpeed: 2 }); match.game = createGame(match);
  assert.equal(match.game.speed, 2);
  assert.equal(sanitizeRules({ gameSpeed: 99 }).gameSpeed, 1);
});

test('every third turn offers three unique powerups and accepts one choice', () => {
  const match = room(); match.game = createGame(match); nextTurn(match); nextTurn(match);
  const player = match.game.players[0];
  assert.equal(player.rewardOffer.choices.length, 3);
  assert.equal(new Set(player.rewardOffer.choices).size, 3);
  const choice = player.rewardOffer.choices[0]; claimReward(match, player.id, choice);
  assert.equal(player.rewardOffer, null);
});

test('a projectile collects a powerup without stopping its trajectory', () => {
  const terrain = { heights: Array(WORLD.width).fill(800), floatingPlatforms: [] };
  const result = simulateShot({ terrain, x: 10, y: 100, angle: 5, power: 300, gravity: 120, powerups: [{ id: 'p', x: 55, y: 95, active: true, revealed: true }] });
  assert.deepEqual(result.collectedPowerupIds, ['p']);
  assert.ok(result.path.length > 10);
});

test('each player can configure exactly three arsenal powers in the lobby', () => {
  const manager = new RoomManager(); const socket = {};
  const { room: lobby } = manager.create(socket, { nickname: 'Arsenal' });
  manager.setArsenal(lobby.code, socket.playerId, ['fireworks', 'zeus', 'gravity']);
  assert.deepEqual(lobby.players[0].arsenal, ['fireworks', 'zeus', 'gravity']);
  assert.throws(() => manager.setArsenal(lobby.code, socket.playerId, ['zeus']), /exatamente 3/);
});

test('arsenal charges refresh every three turns', () => {
  const match = room(); match.players[0].arsenal = ['fireworks', 'zeus', 'blink']; match.game = createGame(match);
  match.game.players[0].ammo.fireworks = 0; match.game.players[0].ammo.zeus = 0; match.game.players[0].ammo.blink = 0;
  nextTurn(match); nextTurn(match);
  assert.equal(match.game.players[0].ammo.fireworks, 1);
  assert.equal(match.game.players[0].ammo.zeus, 1);
  assert.equal(match.game.players[0].ammo.blink, 1);
});

test('fireworks consumes its charge and creates three secondary blasts', () => {
  const match = room(); match.players[0].arsenal = ['fireworks', 'zeus', 'gravity']; match.game = createGame(match);
  const shots = fire(match, 'one', { angle: 45, power: 260, direction: 1, weapon: 'fireworks' });
  assert.equal(match.game.players[0].ammo.fireworks, 0);
  assert.equal(shots.flatMap((shot) => shot.interactions).filter((entry) => entry.type === 'firework').length, 3);
});
