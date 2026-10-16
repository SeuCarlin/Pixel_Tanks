import test from 'node:test';
import assert from 'node:assert/strict';
import { applyArenaPulse, createGame, fire, nextTurn, claimReward, movePlayer, sanitizeRules, tickRoom, useArsenal } from '../server/game.js';
import { applyExplosion, simulateBouncingGrenade, simulateShot, simulateVerticalStrike } from '../server/physics.js';
import { ARSENAL_ITEMS, WORLD } from '../shared/constants.js';
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

test('each player can choose three powers from the complete initial arsenal', () => {
  const manager = new RoomManager(); const socket = {};
  const { room: lobby } = manager.create(socket, { nickname: 'Arsenal' });
  const offered = lobby.players[0].arsenalOffer;
  assert.equal(offered.length, ARSENAL_ITEMS.length); assert.equal(new Set(offered).size, ARSENAL_ITEMS.length);
  assert.deepEqual(new Set(offered), new Set(ARSENAL_ITEMS));
  manager.setArsenal(lobby.code, socket.playerId, offered.slice(0, 3));
  assert.deepEqual(lobby.players[0].arsenal, offered.slice(0, 3));
  assert.throws(() => manager.setArsenal(lobby.code, socket.playerId, ['zeus']), /exatamente 3/);
  assert.throws(() => manager.setArsenal(lobby.code, socket.playerId, [offered[0], offered[1], 'invalid']), /exatamente 3/);
});

test('spectators can join an active room without taking a player slot', () => {
  const manager = new RoomManager(); const hostSocket = {}; const watcherSocket = {};
  const { room: lobby } = manager.create(hostSocket, { nickname: 'Host', rules: { botCount: 1 } }); manager.start(lobby.code, hostSocket.playerId); const playerCount = lobby.players.length;
  const watched = manager.watch(watcherSocket, { code: lobby.code, nickname: 'Viewer' });
  assert.equal(lobby.players.length, playerCount); assert.equal(lobby.spectators.length, 1); assert.equal(watched.spectator.nickname, 'Viewer'); assert.equal(manager.publicRoom(lobby).spectatorCount, 1);
  manager.disconnect(watcherSocket); assert.equal(manager.publicRoom(lobby).spectatorCount, 0);
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

test('player can fire while jumping or descending with a parachute', () => {
  const jumping = room(); jumping.players[0].arsenal = ['jump', 'heavy', 'zeus']; jumping.game = createGame(jumping); jumping.game.phase = 'playing';
  useArsenal(jumping, 'one', { type: 'jump', angle: 55, power: 280, direction: 1 });
  assert.doesNotThrow(() => fire(jumping, 'one', { angle: 40, power: 240, direction: 1, weapon: 'standard' }));

  const parachuting = room(); parachuting.players[0].arsenal = ['jump', 'heavy', 'zeus']; parachuting.game = createGame(parachuting); parachuting.game.phase = 'playing';
  useArsenal(parachuting, 'one', { type: 'jump', angle: 55, power: 280, direction: 1 }); useArsenal(parachuting, 'one', { type: 'parachute' });
  assert.doesNotThrow(() => fire(parachuting, 'one', { angle: 40, power: 240, direction: 1, weapon: 'heavy' }));
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

test('grenade bounces three times and keeps a three-second fuse path', () => {
  const terrain = { heights: Array(WORLD.width).fill(500), floatingPlatforms: [] };
  const result = simulateBouncingGrenade({ terrain, x: 180, y: 240, angle: 48, power: 260, gravity: 120, direction: 1 });
  assert.equal(result.bounces.length, 3); assert.equal(result.path.filter((point) => point.fuse).length, 120); assert.ok(result.impact);
});

test('mine launcher deploys three proximity mines and mole bomb burrows', () => {
  const mines = room(); mines.players[0].arsenal = ['mineLayer', 'grenade', 'moleBomb']; mines.game = createGame(mines); mines.game.phase = 'playing'; const originalMineCount = mines.game.mines.length;
  const mineShots = fire(mines, 'one', { angle: 58, power: 260, direction: 1, weapon: 'mineLayer' });
  assert.equal(mineShots.length, 3); assert.equal(mines.game.mines.length, originalMineCount + 3); assert.ok(mineShots.every((shot) => shot.noExplosion));

  const mole = room(); mole.players[0].arsenal = ['moleBomb', 'grenade', 'mineLayer']; mole.game = createGame(mole); mole.game.phase = 'playing';
  const [burrow] = fire(mole, 'one', { angle: 45, power: 260, direction: 1, weapon: 'moleBomb' });
  assert.equal(burrow.burrow, true); assert.equal(burrow.path.length, 120); assert.ok(burrow.path.every((point) => point.underground));
});

test('armored dash damages and pushes enemies while breaking one wall', () => {
  const match = room(); match.players[0].arsenal = ['armoredDash', 'heavy', 'jump']; match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(700); const player = match.game.players[0]; const target = match.game.players[1]; player.x = 200; player.y = 691; target.x = 310; target.y = 691; for (let x = 370; x <= 405; x += 1) match.game.terrain.heights[x] = 620; const targetHealth = target.health;
  movePlayer(match, 'one', 1, 'armoredDash'); assert.ok(player.x > 405); assert.equal(player.ammo.armoredDash, 0); assert.equal(player.lastLaunch.wallDestroyed, true); assert.deepEqual(player.lastLaunch.hitPlayerIds, ['two']); assert.ok(target.health < targetHealth); assert.ok(target.x > 310); assert.ok(match.game.terrain.heights[375] > 620);
  const platform = { id: 'test-platform', x: 300, baseX: 300, y: 300, width: 180, height: 10, durability: 30, active: true }; const game = { terrain: { heights: Array(WORLD.width).fill(700), floatingPlatforms: [platform] }, powerups: [], players: [] };
  applyExplosion(game, 380, 300, 70, 40); assert.equal(platform.active, false);
});

test('vertical activation changes the projectile into a straight downward fall', () => {
  const terrain = { heights: Array(WORLD.width).fill(700), floatingPlatforms: [] };
  const result = simulateVerticalStrike({ terrain, x: 100, y: 400, angle: 55, power: 280, gravity: 120, direction: 1 }); const vertical = result.path.slice(result.activationIndex + 1);
  assert.ok(result.activationIndex > 0); assert.ok(vertical.length > 2); assert.ok(vertical.every((point) => Math.abs(point.x - vertical[0].x) <= 1));
});

test('laser crosses multiple enemies, damages terrain and immobilizes its shooter', () => {
  const match = room(); match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(850); const shooter = match.game.players[0]; const target = match.game.players[1]; shooter.x = 200; shooter.y = 400; shooter.facing = 1; target.x = 520; target.y = 372; shooter.inventory.push('laser'); shooter.selectedPowerup = 'laser'; const health = target.health;
  const [beam] = fire(match, 'one', { angle: 5, power: 400, direction: 1, weapon: 'standard' });
  assert.equal(beam.laser, true); assert.ok(target.health < health); assert.equal(shooter.frozenTurns, 2); assert.ok(!shooter.inventory.includes('laser'));
});

test('airborne tanks land on solid platforms', () => {
  const match = room(); match.game = createGame(match); match.game.phase = 'playing'; const player = match.game.players[0]; const platform = { id: 'landing', x: 100, baseX: 100, y: 300, width: 220, height: 12, durability: 100, active: true }; match.game.terrain.floatingPlatforms = [platform]; player.x = 180; player.y = 260; player.airborne = { vx: 0, vy: 160, parachute: false, updatedAt: Date.now() - 300 };
  tickRoom(match); assert.equal(player.airborne, null); assert.equal(player.supportPlatformId, platform.id); assert.equal(player.y, platform.y - WORLD.tankRadius);
});

test('a tank is eliminated immediately when it falls out of the scenario', () => {
  const match = room(); match.game = createGame(match); match.game.phase = 'playing'; const player = match.game.players[0];
  match.game.terrain.heights.fill(WORLD.height + 80); player.x = 180; player.y = WORLD.height - WORLD.tankRadius - 2; player.airborne = { vx: 0, vy: 180, parachute: false, updatedAt: Date.now() - 100 };
  tickRoom(match); assert.equal(player.alive, false); assert.equal(player.health, 0); assert.equal(player.airborne, null); assert.equal(match.game.phase, 'finished'); assert.equal(match.game.winner, 'two');
});

test('ballistic jump cannot cross a solid terrain wall', () => {
  const match = room(); match.game = createGame(match); match.game.phase = 'playing'; const player = match.game.players[0]; match.game.terrain.heights.fill(800); player.x = 200; player.y = 380; for (let x = 205; x < 400; x += 1) match.game.terrain.heights[x] = 260; player.airborne = { vx: 220, vy: -20, parachute: false, updatedAt: Date.now() - 100 };
  tickRoom(match); assert.ok(player.x < 205); assert.equal(player.airborne.vx, 0);
});

test('pregame waits fifteen seconds, runs roulette, then starts with its winner', () => {
  const match = room(); match.game = createGame(match);
  assert.equal(match.game.phase, 'arsenal');
  assert.ok(match.game.arsenalEndsAt - Date.now() > 14000);
  match.game.arsenalEndsAt = Date.now() - 1; tickRoom(match);
  assert.equal(match.game.phase, 'roulette');
  assert.ok(match.game.rouletteSpinEndsAt - match.game.rouletteStartedAt >= 4500);
  assert.equal(match.game.rouletteEndsAt, match.game.rouletteSpinEndsAt);
  const winner = match.game.turnIndex; assert.equal(match.game.rouletteSequence.at(-1), winner);
  match.game.rouletteEndsAt = Date.now() - 1; tickRoom(match);
  assert.equal(match.game.phase, 'playing'); assert.equal(match.game.turnIndex, winner);
});

test('tectonic arena event warns before reshaping the terrain', () => {
  let match; let event;
  for (let seed = 1; seed < 100 && event?.type !== 'tectonic'; seed += 1) { match = room(); match.game = createGame(match); match.game.phase = 'playing'; match.game.turnNumber = 9; match.game.seed = seed; event = applyArenaPulse(match); }
  assert.equal(event.type, 'tectonic'); assert.equal(event.warning, true); assert.ok(match.game.pendingArenaEvent.executeAt - Date.now() > 1900); const before = [...match.game.terrain.heights];
  match.game.pendingArenaEvent.executeAt = Date.now() - 1; tickRoom(match);
  assert.equal(match.game.events.at(-1).warning, false); assert.notDeepEqual(match.game.terrain.heights, before);
});
