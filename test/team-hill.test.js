import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, nextTurn, sanitizeRules } from '../server/game.js';
import { applyExplosion } from '../server/physics.js';

function match() {
  const room = {
    rules: sanitizeRules({ seed: 'team-hill-stable', gameMode: 'teamHill', teamCount: 2, roundLimit: 10, powerupCount: 0, enabledEvents: [] }),
    players: Array.from({ length: 4 }, (_, index) => ({ id: `p${index}`, nickname: `P${index}`, color: `#${index}${index}${index}`, connected: true })),
  };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.terrain.heights.fill(700); room.game.objects = [];
  room.game.hill = { x: 300, y: 700, radius: 170, pointsToWin: 4, teamScores: { 'team-1': 0, 'team-2': 0 }, contested: false };
  room.game.players.forEach((player, index) => { player.x = index % 2 === 0 ? 280 + index * 20 : 950 + index * 20; player.y = 691; });
  return room;
}

function passRound(room) { for (let index = 0; index < room.game.players.length && room.game.phase === 'playing'; index += 1) nextTurn(room); }

test('team hill shares one capture point among allies and stops when contested', () => {
  assert.equal(sanitizeRules({ gameMode: 'teamHill' }).gameMode, 'teamHill');
  const room = match(); const game = room.game;
  assert.equal(game.teamCount, 2); assert.equal(game.players[0].team, game.players[2].team);
  passRound(room);
  assert.equal(game.hill.teamScores['team-1'], 1);
  assert.equal(game.hill.lastCaptureTeam, 'team-1');
  game.players[1].x = 320;
  passRound(room);
  assert.equal(game.hill.teamScores['team-1'], 1);
  assert.equal(game.hill.contested, true);
  game.players[1].x = 1000;
  passRound(room); passRound(room); passRound(room);
  assert.equal(game.hill.teamScores['team-1'], 4);
  assert.equal(game.phase, 'finished');
  assert.equal(game.winningTeam, 'team-1');
  assert.equal(game.finishedByObjective, true);
});

test('team hill disables friendly fire and can end by eliminating a team', () => {
  const room = match(); const game = room.game;
  const [attacker, enemy, ally, otherEnemy] = game.players;
  attacker.x = 200; attacker.y = 691; ally.x = 240; ally.y = 691;
  applyExplosion(game, 240, 691, 50, 50, { sourcePlayerId: attacker.id });
  assert.equal(ally.health, ally.maxHealth);
  enemy.alive = false; otherEnemy.alive = false;
  nextTurn(room);
  assert.equal(game.phase, 'finished');
  assert.equal(game.winningTeam, 'team-1');
});
