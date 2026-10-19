import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, movePlayer, nextTurn, sanitizeRules } from '../server/game.js';
import { DRIVE, driveStats, walkPath } from '../shared/movement.js';
import { WORLD } from '../shared/constants.js';

function driveRoom(classType = null) {
  const room = { rules: sanitizeRules({ seed: 'drive-test', classesEnabled: Boolean(classType), powerupCount: 0, enabledEvents: [] }), players: [
    { id: 'one', nickname: 'One', classType, arsenal: ['heavy', 'cluster', 'jump'] },
    { id: 'two', nickname: 'Two', classType: null, arsenal: ['heavy', 'cluster', 'jump'] },
  ] };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.terrain.heights.fill(760); room.game.terrain.floatingPlatforms = []; room.game.objects = []; room.game.mines = []; room.game.powerups = [];
  room.game.players[0].x = 180; room.game.players[0].y = 760 - WORLD.tankRadius;
  room.game.players[1].x = 900; room.game.players[1].y = 760 - WORLD.tankRadius;
  return room;
}

test('continuous driving spends fuel gradually without consuming a special movement action', () => {
  const room = driveRoom(); const player = room.game.players[0]; const initialFuel = player.fuel;
  const start = player.x;
  movePlayer(room, player.id, 1, null, { continuous: true, bot: true });
  assert.ok(player.x > start && player.x - start < 50);
  assert.ok(player.fuel < initialFuel);
  assert.equal(room.game.actions.movesLeft, 2);
  player.fuel = 0;
  assert.throws(() => movePlayer(room, player.id, 1, null, { continuous: true, bot: true }), /combustível/i);
});

test('fuel refills after two completed rounds; classes and Impulso alter the drive', () => {
  const room = driveRoom('ninja'); const player = room.game.players[0];
  assert.ok(driveStats(player).speed > DRIVE.speed);
  assert.ok(driveStats(player).maxFuel > DRIVE.fuel);
  player.inventory.push('movementBoost');
  assert.equal(driveStats(player).maxFuel, DRIVE.fuel + 70 + 65);
  assert.equal(driveStats(player).speed, DRIVE.speed + 24 + 8);
  player.fuel = 4;
  nextTurn(room); nextTurn(room);
  assert.equal(room.game.roundNumber, 2);
  assert.equal(player.fuel, 4);
  nextTurn(room); nextTurn(room);
  assert.equal(room.game.roundNumber, 3);
  assert.equal(player.fuel, driveStats(player).maxFuel);
});

test('Aranha climbs a wall in vertical increments and does not teleport through it', () => {
  const room = driveRoom('ninja'); const game = room.game; const player = game.players[0];
  player.x = 195; player.y = 760 - WORLD.tankRadius;
  game.terrain.heights.fill(620, 200, 400);
  const first = walkPath(game.terrain, player, 1, 35);
  assert.equal(first.climbing, true);
  assert.ok(first.x < 200 && player.y - first.y <= 12);
  let actor = { ...player, x: first.x, y: first.y };
  for (let step = 0; step < 15; step += 1) { const path = walkPath(game.terrain, actor, 1, 20); actor = { ...actor, x: path.x, y: path.y }; }
  assert.ok(actor.x >= 200, 'tank reaches the top only after multiple climb ticks');
});
