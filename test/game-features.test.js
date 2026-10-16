import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, fire, nextTurn, claimReward, movePlayer, sanitizeRules, tickRoom, useArsenal } from '../server/game.js';
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

test('each player receives three unique powerups only on their own third turn', () => {
  const match = room(); match.game = createGame(match); match.game.players[0].turnsPlayed = 1;
  nextTurn(match); nextTurn(match); nextTurn(match); nextTurn(match);
  const player = match.game.players[0];
  assert.equal(match.game.players[match.game.turnIndex].id, player.id);
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
  const offered = lobby.players[0].arsenalOffer;
  assert.equal(offered.length, 6); assert.equal(new Set(offered).size, 6);
  manager.setArsenal(lobby.code, socket.playerId, offered.slice(0, 3));
  assert.deepEqual(lobby.players[0].arsenal, offered.slice(0, 3));
  assert.throws(() => manager.setArsenal(lobby.code, socket.playerId, ['zeus']), /exatamente 3/);
  const unavailable = ['heavy', 'cluster', 'fireworks', 'zeus', 'gravity', 'jump', 'spider'].find((type) => !offered.includes(type));
  assert.throws(() => manager.setArsenal(lobby.code, socket.playerId, [offered[0], offered[1], unavailable]), /6 cartas/);
});

test('arsenal charges refresh every three turns', () => {
  const match = room(); match.players[0].arsenal = ['fireworks', 'zeus', 'jump']; match.game = createGame(match);
  match.game.players[0].turnsPlayed = 1;
  match.game.players[0].ammo.fireworks = 0; match.game.players[0].ammo.zeus = 0; match.game.players[0].ammo.jump = 0;
  nextTurn(match); nextTurn(match); nextTurn(match); nextTurn(match);
  assert.equal(match.game.players[0].ammo.fireworks, 1);
  assert.equal(match.game.players[0].ammo.zeus, 1);
  assert.equal(match.game.players[0].ammo.jump, 1);
});

test('jump launches toward the aim and Enter action opens the parachute', () => {
  const match = room(); match.players[0].arsenal = ['jump', 'spider', 'heavy']; match.game = createGame(match); match.game.phase = 'playing';
  useArsenal(match, 'one', { type: 'jump', angle: 50, power: 300, direction: 1 });
  assert.equal(match.game.players[0].ammo.jump, 0); assert.ok(match.game.players[0].airborne.vx > 0);
  useArsenal(match, 'one', { type: 'parachute' });
  assert.equal(match.game.players[0].airborne.parachute, true); assert.equal(match.game.players[0].airborne.vx, 0);
});

test('spider charge grants and consumes one of three climbing movements', () => {
  const match = room(); match.players[0].arsenal = ['spider', 'jump', 'heavy']; match.game = createGame(match); match.game.phase = 'playing';
  movePlayer(match, 'one', 1, 'spider');
  assert.equal(match.game.players[0].ammo.spider, 0); assert.equal(match.game.players[0].spiderMoves, 2);
});

test('fireworks consumes its charge and creates three secondary blasts', () => {
  const match = room(); match.players[0].arsenal = ['fireworks', 'zeus', 'gravity']; match.game = createGame(match); match.game.phase = 'playing';
  const shots = fire(match, 'one', { angle: 45, power: 260, direction: 1, weapon: 'fireworks' });
  assert.equal(match.game.players[0].ammo.fireworks, 0);
  assert.equal(shots.flatMap((shot) => shot.interactions).filter((entry) => entry.type === 'firework').length, 3);
});

test('pregame waits fifteen seconds, runs roulette, then starts with its winner', () => {
  const match = room(); match.game = createGame(match);
  assert.equal(match.game.phase, 'arsenal');
  assert.ok(match.game.arsenalEndsAt - Date.now() > 14000);
  match.game.arsenalEndsAt = Date.now() - 1; tickRoom(match);
  assert.equal(match.game.phase, 'roulette');
  const winner = match.game.turnIndex; assert.equal(match.game.rouletteSequence.at(-1), winner);
  match.game.rouletteEndsAt = Date.now() - 1; tickRoom(match);
  assert.equal(match.game.phase, 'playing'); assert.equal(match.game.turnIndex, winner);
});
