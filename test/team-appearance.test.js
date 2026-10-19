import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAM_COLORS } from '../shared/constants.js';
import { createGame, fire, sanitizeRules } from '../server/game.js';
import { applyExplosion } from '../server/physics.js';
import { generateTerrain } from '../server/terrain.js';
import { RoomManager } from '../server/rooms.js';

function match(mode = 'teams', teamCount = 2, friendlyFire = false, count = 6) {
  const players = Array.from({ length: count }, (_, index) => ({ id: `p${index}`, nickname: `P${index}`, color: '#ffffff', connected: true, classType: 'attacker', arsenal: ['heavy', 'jump', 'zeus'] }));
  const room = { rules: sanitizeRules({ seed: `team-appearance-${mode}-${count}`, gameMode: mode, teamCount, friendlyFire, powerupCount: 0, mines: false }), players };
  room.game = createGame(room);
  return room;
}

test('team colors and safe spawn territories stay grouped from lobby into the match', () => {
  const manager = new RoomManager(); const host = {};
  const { room } = manager.create(host, { nickname: 'Host', rules: { gameMode: 'teams', teamCount: 2, botCount: 3, maxPlayers: 6 } });
  assert.deepEqual(room.players.map((player) => player.color), [TEAM_COLORS[0], TEAM_COLORS[1], TEAM_COLORS[0], TEAM_COLORS[1]]);
  assert.deepEqual(room.players.map((player) => player.team), ['team-1', 'team-2', 'team-1', 'team-2']);
  manager.join({}, { code: room.code, nickname: 'Friend' });
  assert.equal(room.players[4].color, TEAM_COLORS[0]);
  const game = createGame(room);
  assert.ok(Math.max(...game.players.filter((player) => player.team === 'team-1').map((player) => player.x)) < Math.min(...game.players.filter((player) => player.team === 'team-2').map((player) => player.x)));
  assert.ok(game.players.some((player) => player.supportPlatformId));
  for (const player of game.players) assert.equal(player.color, TEAM_COLORS[Number(player.team.at(-1)) - 1]);
});

test('four teams occupy four ordered map territories', () => {
  const game = match('teamHill', 4, false, 8).game;
  const bounds = [1, 2, 3, 4].map((number) => game.players.filter((player) => player.team === `team-${number}`).map((player) => player.x));
  for (let index = 0; index < bounds.length - 1; index += 1) assert.ok(Math.max(...bounds[index]) < Math.min(...bounds[index + 1]));
});

test('friendly fire is optional, defaults off, and affects allied explosion damage', () => {
  assert.equal(sanitizeRules({ gameMode: 'teams' }).friendlyFire, false);
  for (const enabled of [false, true]) {
    const game = match('teams', 2, enabled, 4).game;
    game.terrain.heights.fill(700); game.terrain.floatingPlatforms = []; game.objects = [];
    const [shooter, , ally] = game.players;
    shooter.x = 100; shooter.y = 691; ally.x = 145; ally.y = 691;
    applyExplosion(game, ally.x, ally.y, 54, 45, { sourcePlayerId: shooter.id });
    assert.equal(ally.health < ally.maxHealth, enabled);
    assert.equal(game.friendlyFire, enabled);
  }
});

test('friendly fire also controls a manually aimed laser crossing an ally', () => {
  for (const enabled of [false, true]) {
    const room = match('teams', 2, enabled, 4); const game = room.game;
    game.phase = 'playing'; game.terrain.heights.fill(850); game.terrain.floatingPlatforms = []; game.objects = [];
    const [shooter, enemy, ally, otherEnemy] = game.players;
    shooter.x = 200; shooter.y = 400; shooter.facing = 1;
    ally.x = 520; ally.y = 372; enemy.x = 2000; otherEnemy.x = 2400;
    shooter.inventory.push('laser'); shooter.selectedPowerup = 'laser';
    fire(room, shooter.id, { angle: 5, power: 400, direction: 1, weapon: 'standard' });
    assert.equal(ally.health < ally.maxHealth, enabled);
  }
});

test('cooperative teams use a shared color and opposite spawn sides', () => {
  const room = match('coop', 2, false, 4);
  room.players[1].isBot = true; room.players[3].isBot = true;
  const game = createGame(room);
  const humans = game.players.filter((player) => player.team === 'humans');
  const bots = game.players.filter((player) => player.team === 'bots');
  assert.ok(Math.max(...humans.map((player) => player.x)) < Math.min(...bots.map((player) => player.x)));
  assert.ok(humans.every((player) => player.color === TEAM_COLORS[0]));
  assert.ok(bots.every((player) => player.color === TEAM_COLORS[1]));
});

test('new high platforms add safe elevated positions throughout the arena', () => {
  const terrain = generateTerrain('team-high-platforms', 'flat');
  const upper = terrain.floatingPlatforms.filter((platform) => platform.upperDeck);
  assert.ok(upper.length >= 5);
  assert.ok(upper.every((platform) => !platform.moving && platform.width >= 135 && platform.y <= 450));
  assert.ok(new Set(upper.map((platform) => Math.floor(platform.x / 700))).size >= 5);
});
