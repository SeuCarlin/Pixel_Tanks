import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, movePlayer, nextTurn, sanitizeRules, useArsenal } from '../server/game.js';
import { DRIVE, driveStats, walkPath } from '../shared/movement.js';
import { WORLD } from '../shared/constants.js';
import { settlePlayers } from '../server/physics.js';

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
  assert.equal(driveStats(player).maxFuel, DRIVE.fuel + 95 + 65);
  assert.equal(driveStats(player).speed, DRIVE.speed + 35 + 8);
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
  player.spiderClimb = true;
  player.x = 195; player.y = 760 - WORLD.tankRadius;
  game.terrain.heights.fill(620, 200, 400);
  const first = walkPath(game.terrain, player, 1, 35);
  assert.equal(first.climbing, true);
  assert.ok(first.x < 200 && player.y - first.y <= 12);
  let actor = { ...player, x: first.x, y: first.y };
  for (let step = 0; step < 15; step += 1) { const path = walkPath(game.terrain, actor, 1, 20); actor = { ...actor, x: path.x, y: path.y }; }
  assert.ok(actor.x >= 200, 'tank reaches the top only after multiple climb ticks');
});

test('Aranha first leaps to the wall, then climbs with held-drive fuel without a second charge', () => {
  const room = driveRoom(); const game = room.game; const player = game.players[0];
  player.arsenal.push('spider'); player.ammo.spider = 1; player.x = 100; player.y = 760 - WORLD.tankRadius;
  game.terrain.heights.fill(620, 200, 420);
  const leap = movePlayer(room, player.id, 1, 'spider');
  assert.ok(leap.attachedToWall);
  assert.ok(player.x >= 190 && player.x < 200, `leap should approach the wall: ${player.x}`);
  assert.ok(player.y < 760 - WORLD.tankRadius);
  assert.equal(player.wallClinging, 1);
  assert.equal(player.ammo.spider, 0);
  assert.equal(player.lastLaunch.attachedToWall, true);
  const firstY = player.y; const firstFuel = player.fuel;
  settlePlayers(game);
  assert.equal(player.y, firstY, 'collision settling must not drop a wall-clinging tank');
  movePlayer(room, player.id, 1, null, { continuous: true, bot: true });
  assert.ok(player.y < firstY, 'the next held-drive tick climbs higher');
  assert.ok(player.fuel < firstFuel);
  assert.equal(player.ammo.spider, 0, 'climbing does not consume another card');
  for (let tick = 0; tick < 12 && player.x < 200; tick += 1) movePlayer(room, player.id, 1, null, { continuous: true, bot: true });
  assert.ok(player.x >= 200, 'the tank reaches the top by climbing');
});

test('Aranha can push off a wall into a ballistic jump without keeping stale wall grip', () => {
  const room = driveRoom(); const player = room.game.players[0];
  player.arsenal = ['spider', 'jump', 'heavy']; player.ammo.spider = 1; player.ammo.jump = 1;
  player.x = 100; player.y = 760 - WORLD.tankRadius;
  room.game.terrain.heights.fill(620, 200, 420);
  movePlayer(room, player.id, 1, 'spider');
  assert.equal(player.wallClinging, 1);
  useArsenal(room, player.id, { type: 'jump', angle: 45, power: 260, direction: -1 });
  assert.ok(player.airborne);
  assert.equal(player.wallClinging, null);
});

test('Aranha climbs short stepped inclines without treating them as a wall or sliding backward', () => {
  const room = driveRoom('ninja'); const player = room.game.players[0];
  player.spiderClimb = true;
  for (let x = 200; x < 500; x += 1) room.game.terrain.heights[x] = 760 - Math.floor((x - 200) / 12) * 9;
  for (let tick = 0; tick < 20 && player.x < 300; tick += 1) {
    const before = player.x;
    movePlayer(room, player.id, 1, null, { continuous: true, bot: true });
    assert.ok(player.x >= before, 'settling must not undo a climbable slope');
    assert.equal(player.wallClinging, null, 'short steps should remain ordinary ground movement');
    assert.equal(player.airborne, null);
  }
  assert.ok(player.x >= 300, 'the Spider should cross the entire stepped incline');
});

test('Aranha detects a wall on its left before the tank overlaps it', () => {
  const room = driveRoom(); const game = room.game; const player = game.players[0];
  player.arsenal.push('spider'); player.ammo.spider = 1; player.x = 300; player.y = 760 - WORLD.tankRadius;
  game.terrain.heights.fill(620, 80, 200);
  const leap = movePlayer(room, player.id, -1, 'spider');
  assert.equal(leap.attachedToWall, true);
  assert.ok(player.x > 200 && player.x <= 210);
  assert.equal(player.wallClinging, -1);
  settlePlayers(game);
  assert.equal(player.airborne, null, 'the wall grip must survive collision settling');
});
