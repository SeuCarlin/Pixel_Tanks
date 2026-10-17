import test from 'node:test';
import assert from 'node:assert/strict';
import { activateScenarioObjects, applyArenaPulse, clipProjectileAtCrane, createGame, fire, nextTurn, claimReward, movePlayer, sanitizeRules, tickRoom, useArsenal } from '../server/game.js';
import { applyExplosion, simulateBouncingGrenade, simulateShot, simulateVerticalStrike } from '../server/physics.js';
import { ARSENAL_ITEMS, GAME_TIMING, WORLD } from '../shared/constants.js';
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

test('spider leap grants two extra actions and permanent wall climbing', () => {
  const match = room(); match.players[0].arsenal = ['spider', 'jump', 'heavy']; match.game = createGame(match); match.game.phase = 'playing';
  movePlayer(match, 'one', 1, 'spider');
  assert.equal(match.game.players[0].ammo.spider, 0); assert.equal(match.game.players[0].spiderMoves, 2); assert.equal(match.game.players[0].spiderClimb, true); assert.equal(match.game.actions.movesLeft, 2); assert.equal(match.game.players[0].lastLaunch.kind, 'spiderLeap');
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

  const mole = room(); mole.players[0].arsenal = ['moleBomb', 'grenade', 'mineLayer']; mole.game = createGame(mole); mole.game.phase = 'playing'; mole.game.terrain.heights.fill(700); mole.game.players[0].x = 100; mole.game.players[0].y = 691; mole.game.players[1].x = 1000; mole.game.players[1].y = 691;
  const [burrow] = fire(mole, 'one', { angle: 45, power: 260, direction: 1, weapon: 'moleBomb' });
  assert.equal(burrow.burrow, true); assert.equal(burrow.path.length, 60); assert.ok(burrow.path.every((point) => point.underground));
});

test('gravity bomb preserves terrain and pulls every nearby tank including its shooter', () => {
  const match = room({ powerupCount: 0 }); match.players[0].arsenal = ['gravity', 'heavy', 'jump']; match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(700); const shooter = match.game.players[0]; const target = match.game.players[1]; shooter.x = 100; shooter.y = 691; target.x = 170; target.y = 691; const before = [...match.game.terrain.heights]; const shooterHealth = shooter.health; const targetStart = target.x;
  const [shot] = fire(match, 'one', { angle: 85, power: 100, direction: 1, weapon: 'gravity' });
  assert.equal(shot.noExplosion, true); assert.equal(shot.radius, 230); assert.deepEqual(match.game.terrain.heights, before); assert.ok(shooter.health < shooterHealth); assert.ok(Math.abs(target.x - shot.impact.x) < Math.abs(targetStart - shot.impact.x));
});

test('mega bomb has atomic scale and falling structures damage tanks', () => {
  const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(700); const shooter = match.game.players[0]; shooter.x = 100; shooter.y = 691; shooter.inventory.push('megaMissile'); shooter.selectedPowerup = 'megaMissile'; const [atomic] = fire(match, 'one', { angle: 70, power: 140, direction: 1, weapon: 'standard' }); assert.equal(atomic.megaMissile, true); assert.equal(atomic.radius, 190);
  const crush = room({ powerupCount: 0 }); crush.game = createGame(crush); crush.game.phase = 'playing'; crush.game.terrain.heights.fill(700); const victim = crush.game.players[1]; victim.x = 320; victim.y = 691; const health = victim.health; crush.game.objects = [{ id: 'slab', type: 'concrete', x: 320, y: 652, groundY: 700, width: 70, active: true }]; const interactions = activateScenarioObjects(crush.game, 320, 652, 30); assert.ok(interactions.some((entry) => entry.type === 'concreteFall')); assert.ok(victim.health < health);
  victim.health = victim.maxHealth; victim.alive = true; const terrainBefore = crush.game.terrain.heights[320]; crush.game.objects = [{ id: 'crane', type: 'crane', x: 248, y: 560, groundY: 700, height: 260, armLength: 110, direction: 1, ballX: 320, ballY: 470, ballRadius: 28, towerDurability: 2, cableIntact: true, active: true }]; const craneHit = activateScenarioObjects(crush.game, 320, 470, 12); const ballDrop = craneHit.find((entry) => entry.type === 'wreckingBall'); assert.ok(ballDrop); assert.equal(ballDrop.cause, 'cable'); assert.ok(ballDrop.dropHeight > 200); assert.ok(ballDrop.damage > 100); assert.ok(crush.game.terrain.heights[320] > terrainBefore); assert.ok(victim.health < victim.maxHealth); assert.equal(crush.game.objects[0].active, true); assert.equal(crush.game.objects[0].cableIntact, false);
  const tower = room({ powerupCount: 0 }); tower.game = createGame(tower); tower.game.phase = 'playing'; tower.game.terrain.heights.fill(700); tower.game.objects = [{ id: 'crane', type: 'crane', x: 300, y: 570, groundY: 700, height: 260, armLength: 180, direction: 1, ballX: 456, ballY: 520, ballRadius: 28, towerDurability: 2, cableIntact: true, active: true }]; activateScenarioObjects(tower.game, 300, 570, 18); assert.equal(tower.game.objects[0].towerDurability, 1); const collapse = activateScenarioObjects(tower.game, 300, 570, 18, new Set()); assert.ok(collapse.some((entry) => entry.type === 'craneCollapse')); assert.equal(tower.game.objects[0].active, false);
  const flight = { path: [{ x: 420, y: 430 }, { x: 438, y: 448 }, { x: 456, y: 466 }, { x: 474, y: 490 }, { x: 492, y: 520 }], impact: { x: 492, y: 520 }, collectedPowerupIds: [] }; tower.game.objects[0] = { ...tower.game.objects[0], active: true, cableIntact: true, towerDurability: 2, ballY: 520 }; const clipped = clipProjectileAtCrane(tower.game, flight); assert.ok(clipped); assert.equal(clipped.structure, 'crane'); assert.ok(flight.path.length < 5);
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

test('large rooms can spawn tanks and structures on elevated platforms', () => {
  const match = room({ maxPlayers: 4, mapType: 'platforms' }); match.players.push({ id: 'three', nickname: 'Three', color: '#0ff', connected: true }, { id: 'four', nickname: 'Four', color: '#f0f', connected: true }); match.game = createGame(match);
  const elevatedPlayers = match.game.players.filter((player) => player.supportPlatformId); assert.ok(elevatedPlayers.length >= 1);
  for (const player of elevatedPlayers) { const platform = match.game.terrain.floatingPlatforms.find((entry) => entry.id === player.supportPlatformId); assert.ok(platform?.active); assert.equal(player.y, platform.y - WORLD.tankRadius); }
  assert.ok(match.game.objects.some((object) => object.supportPlatformId));
});

test('unsupported structures fall with terrain and damage tanks below', () => {
  const game = { terrain: { heights: Array(WORLD.width).fill(700), floatingPlatforms: [{ id: 'sky', x: 240, baseX: 240, y: 300, width: 140, height: 10, durability: 1, active: true }] }, powerups: [], interactionSerial: 0, players: [{ id: 'victim', x: 310, y: 691, health: 150, maxHealth: 150, alive: true, shieldCharges: 0 }], objects: [{ id: 'falling-building', type: 'building', x: 310, y: 240, groundY: 300, width: 100, height: 120, durability: 3, active: true, supportPlatformId: 'sky', platformOffset: 70 }] };
  applyExplosion(game, 310, 300, 48, 1); const building = game.objects[0]; assert.equal(game.terrain.floatingPlatforms[0].active, false); assert.ok(building.groundY > 600); assert.ok(building.lastFall?.distance > 300); assert.ok(game.players[0].health < 150);
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

test('pregame gives time to choose arsenal and shows the roulette winner before starting', () => {
  const match = room(); match.game = createGame(match);
  assert.equal(match.game.phase, 'arsenal');
  assert.ok(match.game.arsenalEndsAt - Date.now() > GAME_TIMING.arsenalMs - 1000);
  match.game.arsenalEndsAt = Date.now() - 1; tickRoom(match);
  assert.equal(match.game.phase, 'roulette');
  assert.equal(match.game.rouletteSpinEndsAt - match.game.rouletteStartedAt, GAME_TIMING.rouletteSpinMs);
  assert.equal(match.game.rouletteEndsAt - match.game.rouletteSpinEndsAt, GAME_TIMING.rouletteRevealMs);
  const winner = match.game.turnIndex; assert.equal(match.game.rouletteSequence.at(-1), winner);
  match.game.rouletteEndsAt = Date.now() - 1; tickRoom(match);
  assert.equal(match.game.phase, 'playing'); assert.equal(match.game.turnIndex, winner);
});

test('arsenal abilities can spawn and be collected as map powerups', () => {
  const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; const shooter = match.game.players[0]; const target = match.game.players[1];
  match.game.terrain.heights.fill(700); shooter.x = 100; shooter.y = 691; target.x = 900; target.y = 691; match.game.powerups = [{ id: 'arsenal-zeus', type: 'zeus', x: 140, y: 688, active: true, revealed: true }];
  fire(match, shooter.id, { angle: 5, power: 200, direction: 1, weapon: 'standard' });
  assert.ok(shooter.arsenal.includes('zeus')); assert.equal(shooter.ammo.zeus, 1); assert.equal(shooter.lastPickup.category, 'arsenal'); assert.equal(match.game.powerups[0].active, false);
});

test('single human elimination ends a match against bots immediately', () => {
  const match = room(); match.players = [{ id: 'human', nickname: 'Human', color: '#fff', connected: true }, { id: 'bot', nickname: 'Bot', color: '#f00', connected: true, isBot: true }]; match.game = createGame(match); match.game.phase = 'playing';
  match.game.players[0].alive = false; match.game.players[0].health = 0; nextTurn(match);
  assert.equal(match.game.phase, 'finished'); assert.equal(match.game.winner, 'bot');
});

test('coop ends when one team is eliminated and protects human allies', () => {
  const match = room({ gameMode: 'coop' }); match.players.push({ id: 'bot', nickname: 'Bot', color: '#f00', connected: true, isBot: true }); match.game = createGame(match); match.game.phase = 'playing'; match.game.objects = [];
  const [human, ally, bot] = match.game.players; const allyHealth = ally.health; human.x = 100; human.y = 691; ally.x = 105; ally.y = 691; match.game.terrain.heights.fill(700);
  applyExplosion(match.game, 105, 691, 48, 55, { sourcePlayerId: human.id }); assert.equal(ally.health, allyHealth);
  bot.alive = false; bot.health = 0; nextTurn(match);
  assert.equal(match.game.phase, 'finished'); assert.equal(match.game.winningTeam, 'humans');
});

test('tectonic arena event warns before reshaping the terrain', () => {
  let match; let event;
  for (let seed = 1; seed < 100 && event?.type !== 'tectonic'; seed += 1) { match = room(); match.game = createGame(match); match.game.phase = 'playing'; match.game.turnNumber = 18; match.game.seed = seed; event = applyArenaPulse(match); }
  assert.equal(event.type, 'tectonic'); assert.equal(event.warning, true); assert.ok(match.game.pendingArenaEvent.executeAt - Date.now() > 1900); const before = [...match.game.terrain.heights];
  match.game.pendingArenaEvent.executeAt = Date.now() - 1; tickRoom(match);
  assert.equal(match.game.events.at(-1).warning, false); assert.notDeepEqual(match.game.terrain.heights, before);
});

test('supply event performs a helicopter flyover before revealing its drops', () => {
  const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.turnNumber = 3;
  const event = applyArenaPulse(match);
  assert.equal(event.type, 'supply'); assert.equal(event.warning, true); assert.ok(event.helicopter); assert.equal(event.lootboxChance, 18); assert.equal(match.game.powerups.length, 0);
  match.game.pendingArenaEvent.executeAt = Date.now() - 1; tickRoom(match);
  assert.ok(match.game.powerups.length >= 4); assert.ok(match.game.powerups.every((item) => item.active && item.revealed && item.source === 'helicopter'));
});

test('rare supply lootbox stores and grants three different upgrades', () => {
  let event;
  for (let seed = 1; seed < 200 && !event?.drops.some((drop) => drop.type === 'lootbox'); seed += 1) { const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.turnNumber = 3; match.game.seed = seed; event = applyArenaPulse(match); }
  const box = event.drops.find((drop) => drop.type === 'lootbox'); assert.ok(box); assert.equal(box.loot.length, 3); assert.equal(new Set(box.loot).size, 3);
  const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(700); match.game.objects = []; const shooter = match.game.players[0]; shooter.x = 100; shooter.y = 691; shooter.health = 50; match.game.players[1].x = 900; match.game.players[1].y = 691; match.game.powerups = [{ id: 'loot', type: 'lootbox', loot: ['heal', 'heavy', 'megaMissile'], x: 140, y: 688, active: true, revealed: true }];
  fire(match, shooter.id, { angle: 5, power: 300, direction: 1, weapon: 'standard' });
  assert.equal(shooter.lastPickup.type, 'lootbox'); assert.equal(shooter.health, 100); assert.equal(shooter.ammo.heavy, 2); assert.ok(shooter.inventory.includes('megaMissile'));
});

test('lightning blocks nearby tank powerups for its next turn', () => {
  let match; let event;
  for (let seed = 1; seed < 200 && event?.type !== 'lightning'; seed += 1) { match = room(); match.game = createGame(match); match.game.phase = 'playing'; match.game.turnNumber = 12; match.game.seed = seed; event = applyArenaPulse(match); }
  assert.equal(event.type, 'lightning'); const target = match.game.players[0]; target.x = event.impacts[0].x; target.y = event.impacts[0].y; match.game.pendingArenaEvent.executeAt = Date.now() - 1; tickRoom(match);
  assert.equal(target.powerupBlockedTurns, 1); assert.ok(match.game.events.at(-1).blockedPlayerIds.includes(target.id)); target.inventory.push('megaMissile'); target.selectedPowerup = 'megaMissile'; const shot = fire(match, target.id, { angle: 45, power: 260, direction: 1, weapon: 'standard' }); assert.equal(shot[0].megaMissile, false); assert.ok(target.inventory.includes('megaMissile'));
});

test('tectonic impact nudges tanks after reshaping the arena', () => {
  let match; let event;
  for (let seed = 1; seed < 200 && event?.type !== 'tectonic'; seed += 1) { match = room(); match.game = createGame(match); match.game.phase = 'playing'; match.game.turnNumber = 18; match.game.seed = seed; event = applyArenaPulse(match); }
  const before = match.game.players.map((player) => player.x); match.game.pendingArenaEvent.executeAt = Date.now() - 1; tickRoom(match);
  assert.ok(match.game.players.some((player, index) => player.x !== before[index])); assert.equal(match.game.events.at(-1).tectonicMoves.length, match.game.players.length);
});

test('lucky winds heal tanks inside large golden zones', () => {
  let match; let event;
  for (let seed = 1; seed < 250 && event?.type !== 'luckyWinds'; seed += 1) { match = room(); match.game = createGame(match); match.game.phase = 'playing'; match.game.turnNumber = 21; match.game.seed = seed; event = applyArenaPulse(match); }
  assert.equal(event.type, 'luckyWinds'); const target = match.game.players[0]; target.health = 40; target.x = event.impacts[0].x; target.y = event.impacts[0].y; match.game.pendingArenaEvent.executeAt = Date.now() - 1; tickRoom(match);
  assert.equal(target.health, 80); assert.ok(match.game.events.at(-1).healedPlayerIds.includes(target.id)); assert.ok(event.impacts.every((zone) => zone.radius >= 270));
});

test('bombardment grows in radius and damage with every projectile', () => {
  let event;
  for (let seed = 1; seed < 200 && event?.type !== 'bombardment'; seed += 1) { const match = room(); match.game = createGame(match); match.game.phase = 'playing'; match.game.turnNumber = 9; match.game.seed = seed; event = applyArenaPulse(match); }
  assert.equal(event.type, 'bombardment'); for (let index = 1; index < event.impacts.length; index += 1) { assert.ok(event.impacts[index].radius > event.impacts[index - 1].radius); assert.ok(event.impacts[index].damage > event.impacts[index - 1].damage); }
});

test('eruption rises through terrain holes and launches damaging fireballs', () => {
  const match = room({ mapType: 'islands', powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.turnNumber = 27;
  const event = applyArenaPulse(match); assert.equal(event.type, 'eruption'); assert.ok(event.lavaRivers.length >= 1); assert.ok(event.impacts.length >= 5);
  assert.ok(event.impacts.every((fireball) => [-1, 1].includes(fireball.direction) && fireball.originY < WORLD.height && fireball.radius >= 48));
  const lavaTarget = match.game.players[0]; const river = event.lavaRivers[0]; lavaTarget.x = river.x; lavaTarget.y = river.surfaceY + 8; lavaTarget.health = 150;
  const fireballTarget = match.game.players[1]; const fireball = event.impacts[0]; fireballTarget.x = fireball.x; fireballTarget.y = fireball.y - WORLD.tankRadius; const fireballHealth = fireballTarget.health;
  match.game.pendingArenaEvent.executeAt = Date.now() - 1; tickRoom(match);
  assert.ok(match.game.events.at(-1).lavaHitPlayerIds.includes(lavaTarget.id)); assert.ok(fireballTarget.health < fireballHealth); assert.equal(match.game.events.at(-1).warning, false);
});
