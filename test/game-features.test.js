import test from 'node:test';
import assert from 'node:assert/strict';
import { activateClusterShot, activateFireworksShot, activateScenarioObjects, activateVerticalShot, applyArenaPulse, clipProjectileAtCrane, createGame, fire, nextTurn, claimReward, movePlayer, sanitizeRules, selectPowerup, tickRoom, updateGravityWells, useArsenal, usePowerup } from '../server/game.js';
import { applyExplosion, settleScenarioObjects, simulateBouncingGrenade, simulateShot, simulateVerticalStrike } from '../server/physics.js';
import { CLUSTER_CAPSULE_SPEED, DESTRUCTION_POINTS, GAME_TIMING, MEGA_BOMB, NATIVE_MINE_DAMAGE, SELECTABLE_ARSENAL_ITEMS, SHOT_PATH_RATE, WEAPON_BALANCE, WORLD } from '../shared/constants.js';
import { RoomManager } from '../server/rooms.js';

function room(rules = {}) {
  return {
    rules: sanitizeRules({ seed: 'features-stable-v1', powerupCount: 20, ...rules }),
    players: [
      { id: 'one', nickname: 'One', color: '#fff', connected: true },
      { id: 'two', nickname: 'Two', color: '#000', connected: true },
    ],
  };
}

function splitCluster(match, capsule) {
  const choice = match.pendingClusterChoice;
  choice.startedAt = Date.now() - Math.ceil(Math.max(2, choice.path.length * .3) / SHOT_PATH_RATE * 1000 / match.rules.gameSpeed / CLUSTER_CAPSULE_SPEED);
  return activateClusterShot(match, choice.shooterId, capsule.clusterToken);
}

test('one-click guided training starts a small bot match without lobby setup', () => {
  const manager = new RoomManager(); const socket = {};
  const { room: training } = manager.create(socket, { nickname: 'Cadete', quickTraining: true });
  assert.equal(training.players.length, 2);
  assert.equal(training.players[1].isBot, true);
  assert.equal(training.rules.botDifficulty, 'easy');
  assert.equal(training.rules.roundLimit, 10);
  assert.equal(training.rules.training, true);
  assert.equal(training.game.training, true);
  assert.equal(training.game.phase, 'roulette');
  assert.deepEqual(training.game.players[0].arsenal, ['heavy', 'zeus', 'jump']);
  assert.equal(training.game.players[0].classType, 'armored');
  assert.ok(training.game.rouletteEndsAt - Date.now() <= 4200);
});

test('healing station restores 40 HP on contact and cannot be farmed immediately', () => {
  const match = room({ powerupCount: 0, enabledEvents: [] }); match.game = createGame(match); match.game.phase = 'playing';
  const player = match.game.players[0]; player.health -= 80;
  match.game.objects = [{ id: 'medic-test', type: 'healingStation', x: player.x, y: player.y - 27, groundY: player.y + WORLD.tankRadius, width: 70, height: 72, durability: 3, active: true }];
  nextTurn(match); nextTurn(match);
  assert.equal(player.health, player.maxHealth - 40);
  assert.equal(match.game.objects[0].lastHeal.amount, 40);
  nextTurn(match); nextTurn(match);
  assert.equal(player.health, player.maxHealth - 40);
});

test('solo Backpacker keeps passive pickups while active pickups heal 30 HP', () => {
  const match = room({ powerupCount: 0, enabledEvents: [] }); match.players[0].classType = 'backpacker'; match.game = createGame(match); match.game.phase = 'playing';
  const player = match.game.players[0]; player.health -= 70;
  match.game.powerups = ['shield', 'laser'].map((type, index) => ({ id: `backpacker-${index}`, type, x: player.x, y: player.y, active: true, revealed: true }));
  nextTurn(match); nextTurn(match);
  assert.equal(player.shieldCharges, 1);
  assert.ok(!player.inventory.includes('laser'));
  assert.equal(player.health, player.maxHealth - 40);
});

test('Engineer is no longer a selectable class or a source of free Sentries', () => {
  const match = room({ powerupCount: 0, enabledEvents: [], classesEnabled: true });
  match.players[0].classType = 'engineer'; match.players[0].arsenal = ['heavy', 'jump', 'zeus'];
  match.game = createGame(match); match.game.phase = 'playing';
  const player = match.game.players[0];
  assert.equal(player.classType, null);
  assert.deepEqual(player.arsenal, ['heavy', 'jump', 'zeus']);
});

test('Field Repair pickup heals the collector and restores allied deployables', () => {
  const match = room({ powerupCount: 0, enabledEvents: [], classesEnabled: true });
  match.players[0].classType = 'specialist'; match.game = createGame(match); match.game.phase = 'playing';
  const player = match.game.players[0]; player.health -= 40;
  const sentry = { id: 'repair-pickup', type: 'sentry', ownerId: player.id, active: true, x: player.x + 20, y: player.y, durability: 1, maxDurability: 4 };
  match.game.objects = [sentry]; match.game.powerups = [{ id: 'kit', type: 'fieldRepair', x: player.x, y: player.y, active: true, revealed: true }]; match.game.mines = [];
  nextTurn(match); nextTurn(match);
  assert.equal(player.health, player.maxHealth - 15);
  assert.equal(sentry.durability, 3);
  assert.equal(player.lastPickup?.type, 'fieldRepair');
});

test('Incendiary fire lasts four rounds, burns harder, spares its owner, and ignites every shot', () => {
  const match = room({ powerupCount: 0, enabledEvents: [], classesEnabled: true });
  match.players[0].classType = 'incendiary'; match.game = createGame(match); match.game.phase = 'playing';
  const [owner, target] = match.game.players;
  owner.x = 100; target.x = 145; owner.y = target.y = 691;
  match.game.objects = []; match.game.mines = []; match.game.powerups = [];
  match.game.fireZones = [{ id: 'hot', source: 'molotov', x: 120, y: 700, radius: 120, turnsLeft: 4, ownerId: owner.id, incendiary: true }];
  nextTurn(match);
  assert.equal(owner.health, owner.maxHealth);
  assert.equal(target.health, target.maxHealth - 35);
  assert.equal(match.game.fireZones[0].turnsLeft, 3);
  nextTurn(match);
  assert.equal(match.game.roundNumber, 2);
  assert.ok(!owner.inventory.includes('molotov'));
  match.game.arenaWarningUntil = 0;
  fire(match, owner.id, { weapon: 'standard', angle: 62, power: 190, direction: 1 });
  assert.ok(match.game.fireZones.some((zone) => zone.source === 'incendiaryShot' && zone.ownerId === owner.id && zone.incendiary && zone.turnsLeft === 4));
});

test('Combat Foam extinguishes nearby flames and prevents fire damage for two rounds only', () => {
  const match = room({ powerupCount: 0, enabledEvents: [], classesEnabled: true });
  match.game = createGame(match); match.game.phase = 'playing';
  const [player, enemy] = match.game.players;
  player.x = 100; enemy.x = 1000; player.y = enemy.y = 691;
  match.game.objects = []; match.game.mines = [];
  match.game.fireZones = [{ id: 'near', source: 'molotov', x: 110, y: 700, radius: 90, turnsLeft: 3, ownerId: enemy.id, ignitesAt: Date.now() + 2000 }, { id: 'far', source: 'molotov', x: 900, y: 700, radius: 90, turnsLeft: 3, ownerId: enemy.id }];
  match.game.powerups = [{ id: 'foam', type: 'fireFoam', x: player.x, y: player.y, active: true, revealed: true }];
  nextTurn(match); nextTurn(match);
  assert.equal(player.lastPickup?.type, 'fireFoam');
  assert.ok(!match.game.fireZones.some((zone) => zone.id === 'near'));
  assert.ok(match.game.fireZones.some((zone) => zone.id === 'far'));
  assert.equal(player.foamGuardUntilRound, match.game.roundNumber + 1);
  match.game.fireZones = [{ id: 'after', source: 'molotov', x: 110, y: 700, radius: 90, turnsLeft: 3, ownerId: enemy.id }];
  const health = player.health;
  nextTurn(match); nextTurn(match);
  assert.equal(player.health, health);
  nextTurn(match); nextTurn(match); nextTurn(match);
  assert.equal(player.health, health - 25);
});

test('lobby waits for every human to confirm class and arsenal, then starts a ten-second roulette', () => {
  const manager = new RoomManager();
  const host = {}; const guest = {};
  const { room: lobby } = manager.create(host, { nickname: 'Host', rules: { botCount: 1, maxPlayers: 3, classesEnabled: true } });
  manager.join(guest, { code: lobby.code, nickname: 'Guest' });
  assert.deepEqual(lobby.players.map((player) => player.ready), [false, true, false]);
  assert.throws(() => manager.setReady(lobby.code, host.playerId), /Escolha sua classe/);
  for (const socket of [host, guest]) {
    manager.setClass(lobby.code, socket.playerId, 'ninja');
    const player = lobby.players.find((entry) => entry.id === socket.playerId);
    manager.setArsenal(lobby.code, socket.playerId, player.arsenalOffer.slice(0, 3));
  }
  manager.setReady(lobby.code, host.playerId);
  assert.equal(lobby.game, null);
  manager.setReady(lobby.code, host.playerId);
  assert.equal(lobby.players[0].ready, false);
  manager.setReady(lobby.code, host.playerId);
  manager.setReady(lobby.code, guest.playerId);
  assert.equal(lobby.game.phase, 'roulette');
  assert.equal(lobby.game.rouletteEndsAt - lobby.game.rouletteStartedAt, GAME_TIMING.matchStartMs);
  assert.equal(lobby.game.players.find((player) => player.id === host.playerId).classType, 'ninja');
  assert.throws(() => manager.setReady(lobby.code, host.playerId), /já começou/);
});

test('game speed is sanitized and exposed by the game', () => {
  const match = room({ gameSpeed: 2 }); match.game = createGame(match);
  assert.equal(match.game.speed, 2);
  assert.equal(sanitizeRules({ gameSpeed: 99 }).gameSpeed, 1);
});

test('passive classes alter health, damage, movement and starting equipment', () => {
  const armored = room({ classesEnabled: true, powerupCount: 0 }); armored.players[0].classType = 'armored'; armored.players[1].classType = 'attacker'; armored.game = createGame(armored);
  assert.equal(armored.game.players[0].maxHealth, armored.rules.health + 50);
  armored.game.terrain.heights.fill(700); armored.game.objects = []; armored.game.mines = []; armored.game.terrain.floatingPlatforms = []; armored.game.players[0].x = 100; armored.game.players[1].x = 130; armored.game.players.forEach((player) => { player.y = 691; }); const before = armored.game.players[0].health;
  applyExplosion(armored.game, 100, 691, 80, 30, { sourcePlayerId: armored.game.players[1].id });
  assert.equal(before - armored.game.players[0].health, 70);
  armored.game.terrain.heights.fill(700); armored.game.players.forEach((player, index) => { player.x = 100 + index * 30; player.y = 691; }); armored.game.players[0].shield = true; armored.game.players[0].shieldCharges = 1; const shieldedBefore = armored.game.players[0].health; applyExplosion(armored.game, 100, 691, 80, 30, { sourcePlayerId: armored.game.players[1].id }); assert.equal(shieldedBefore - armored.game.players[0].health, 70); assert.equal(armored.game.players[0].shieldCharges, 1);
  const ninja = room({ classesEnabled: true, powerupCount: 0 }); ninja.players[0].classType = 'ninja'; ninja.game = createGame(ninja); assert.equal(ninja.game.players[0].spiderClimb, false);
  const weather = room({ classesEnabled: true, powerupCount: 0 }); weather.players[0].classType = 'meteorologist'; weather.game = createGame(weather); assert.ok(!weather.game.players[0].arsenal.includes('lightningRod'));
  assert.ok(!SELECTABLE_ARSENAL_ITEMS.includes('lightningRod')); assert.ok(SELECTABLE_ARSENAL_ITEMS.includes('flyingHunter'));
});

test('match filters preserve explicitly enabled events and collectible cards', () => {
  const rules = sanitizeRules({ enabledEvents: ['gale'], enabledPowerups: ['heal', 'fireworks'], classesEnabled: false });
  assert.deepEqual(rules.enabledEvents, ['gale']); assert.deepEqual(rules.enabledPowerups, ['heal', 'fireworks']); assert.equal(rules.classesEnabled, false);
  const match = room({ enabledEvents: ['gale'], enabledPowerups: ['heal'], powerupCount: 8 }); match.game = createGame(match); assert.ok(match.game.powerups.every((item) => item.type === 'heal')); match.game.phase = 'playing'; match.game.turnNumber = 3; const event = applyArenaPulse(match); assert.equal(event.type, 'gale'); assert.equal(event.actionDuration, 3000);
  const quiet = room({ enabledEvents: [], enabledPowerups: [], powerupCount: 8 }); quiet.game = createGame(quiet); quiet.game.phase = 'playing'; quiet.game.turnNumber = 3; assert.equal(quiet.game.powerups.length, 0); assert.equal(applyArenaPulse(quiet), null);
});

test('VS Equipes balances two to four teams and disables friendly fire', () => {
  const match = room({ gameMode: 'teams', teamCount: 2, powerupCount: 0 });
  match.players.push({ id: 'three', nickname: 'Three', color: '#f00', connected: true }, { id: 'four', nickname: 'Four', color: '#0f0', connected: true });
  match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(700); match.game.objects = []; match.game.mines = []; match.game.terrain.floatingPlatforms = [];
  assert.deepEqual(match.game.players.map((player) => player.team), ['team-1', 'team-2', 'team-1', 'team-2']);
  const shooter = match.game.players[0]; const ally = match.game.players[2]; const enemy = match.game.players[1]; shooter.x = 100; ally.x = 130; enemy.x = 140; shooter.y = ally.y = enemy.y = 691;
  const allyHealth = ally.health; const enemyHealth = enemy.health; applyExplosion(match.game, 135, 691, 80, 50, { sourcePlayerId: shooter.id });
  assert.equal(ally.health, allyHealth); assert.ok(enemy.health < enemyHealth);
  match.game.players.filter((player) => player.team === 'team-2').forEach((player) => { player.alive = false; player.health = 0; });
  fire(match, shooter.id, { angle: 80, power: 100, direction: -1, weapon: 'standard' });
  assert.equal(match.game.phase, 'finished'); assert.equal(match.game.winningTeam, 'team-1');
});

test('multiple equipped powerups stack and Espelho repeats the complete volley', () => {
  const match = room({ powerupCount: 0 }); match.players[0].arsenal = ['zeus', 'heavy', 'jump']; match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(760); const player = match.game.players[0]; player.x = 100; player.y = 751; match.game.players[1].x = 1400; match.game.players[1].y = 751;
  player.inventory.push('tripleShot', 'megaMissile', 'mirror'); selectPowerup(match, player.id, 'tripleShot'); selectPowerup(match, player.id, 'megaMissile'); selectPowerup(match, player.id, 'mirror');
  const shots = fire(match, player.id, { angle: 55, power: 230, direction: 1, weapon: 'zeus' });
  assert.equal(shots.length, 6); assert.equal(shots.filter((shot) => shot.mirrorCopy).length, 3); assert.ok(shots.every((shot) => shot.megaMissile && shot.combo.includes('zeus'))); assert.deepEqual(player.selectedPowerups, []);
});

test('Carta Sacana swaps two grounded tanks and Caça Voadora seeks an enemy', () => {
  const swap = room({ powerupCount: 0 }); swap.game = createGame(swap); swap.game.phase = 'playing'; swap.game.terrain.heights.fill(700); const first = swap.game.players[0]; const second = swap.game.players[1]; first.x = 120; first.y = 691; second.x = 620; second.y = 691; first.inventory.push('trickster'); selectPowerup(swap, first.id, 'trickster'); usePowerup(swap, first.id, { type: 'trickster', targetPlayerId: second.id }); assert.equal(first.x, 620); assert.equal(second.x, 120);
  const hunt = room({ powerupCount: 0 }); hunt.players[0].arsenal = ['flyingHunter', 'heavy', 'jump']; hunt.game = createGame(hunt); hunt.game.phase = 'playing'; hunt.game.terrain.heights.fill(820); hunt.game.terrain.floatingPlatforms = []; hunt.game.objects = []; const hunter = hunt.game.players[0]; hunter.x = 100; hunter.y = 811; hunt.game.players[1].x = 620; hunt.game.players[1].y = 811; hunter.inventory.push('doubleShot'); selectPowerup(hunt, hunter.id, 'doubleShot'); const shots = fire(hunt, hunter.id, { angle: 35, power: 260, direction: 1, weapon: 'flyingHunter' }); const [shot] = shots; assert.equal(shots.length, 2); assert.equal(shot.flyingHunter, true); assert.ok(shot.path.some((point) => point.diving)); assert.ok(Math.min(...shot.path.slice(0, shot.huntStartIndex).map((point) => point.y)) < hunter.y - 350); assert.ok(shot.radius <= 40); assert.equal(hunter.ammo.flyingHunter, 0);
});

test('Vendaval announces a direction and pushes grounded tanks', () => {
  const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(700); match.game.turnNumber = 30; match.game.players.forEach((player, index) => { player.x = 500 + index * 200; player.y = 691; }); const before = match.game.players.map((player) => player.x); const event = applyArenaPulse(match, { forcedType: 'gale' }); assert.equal(event.type, 'gale'); match.game.pendingArenaEvent.executeAt = Date.now() - 1; tickRoom(match); assert.ok(event.galeMoves.length === 2); assert.ok(match.game.players.every((player, index) => player.x !== before[index]));
});

test('round limit is sanitized and a round advances after every living player acts', () => {
  assert.equal(sanitizeRules({ roundLimit: 30 }).roundLimit, 30); assert.equal(sanitizeRules({ roundLimit: 13 }).roundLimit, 20);
  const match = room({ roundLimit: 10, powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.roundParticipants = match.game.players.map((player) => player.id); match.game.roundCompleted = [];
  nextTurn(match); assert.equal(match.game.roundNumber, 1); nextTurn(match); assert.equal(match.game.roundNumber, 2);
});

test('final round ends by score and late arena events are more destructive', () => {
  const finale = room({ roundLimit: 10, powerupCount: 0 }); finale.game = createGame(finale); finale.game.phase = 'playing'; finale.game.roundNumber = 10; finale.game.roundLimit = 10; finale.game.roundParticipants = finale.game.players.map((player) => player.id); finale.game.roundCompleted = []; finale.game.players[0].health = 120; finale.game.players[1].health = 80; nextTurn(finale); nextTurn(finale); assert.equal(finale.game.phase, 'finished'); assert.equal(finale.game.winner, 'one'); assert.equal(finale.game.finishedByRounds, true);
  const early = room({ roundLimit: 10 }); early.game = createGame(early); early.game.phase = 'playing'; early.game.turnNumber = 9; early.game.roundNumber = 1; const earlyEvent = applyArenaPulse(early, { forcedType: 'bombardment' });
  const late = room({ roundLimit: 10 }); late.game = createGame(late); late.game.phase = 'playing'; late.game.turnNumber = 9; late.game.roundNumber = 10; const lateEvent = applyArenaPulse(late, { forcedType: 'bombardment' }); assert.equal(earlyEvent.type, 'bombardment'); assert.equal(lateEvent.type, 'bombardment'); assert.ok(lateEvent.impacts.length > earlyEvent.impacts.length); assert.ok(lateEvent.impacts[0].damage > earlyEvent.impacts[0].damage);
});

test('arena events wait until movement and combat animations have finished', () => {
  const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.roundNumber = 1; match.game.roundParticipants = [match.game.players[0].id]; match.game.roundCompleted = [];
  const animationEnd = Date.now() + 5_000; match.game.lastBattleAnimationUntil = animationEnd;
  nextTurn(match);
  assert.ok(match.game.arenaEventReadyAt >= animationEnd);
  assert.equal(match.game.pendingArenaEvent, undefined);
  assert.deepEqual(match.game.events, []);
  match.game.arenaEventReadyAt = Date.now() - 1;
  tickRoom(match);
  assert.ok(match.game.pendingArenaEvent);
  assert.equal(match.game.events.at(-1)?.warning, true);
});

test('arena schedules one event every two completed rounds', () => {
  const match = room({ enabledEvents: ['flood', 'lightning', 'gale', 'blizzard'], powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing';
  const game = match.game; game.roundNumber = 1; game.roundParticipants = [game.players[0].id]; game.roundCompleted = [];
  nextTurn(match); assert.equal(game.roundNumber, 2); assert.ok(game.arenaEventReadyAt); const scheduledAt = game.arenaEventReadyAt;
  nextTurn(match); assert.equal(game.arenaEventReadyAt, scheduledAt, 'a second turn in the same round must not queue another event');
  game.arenaEventReadyAt = Date.now() - 1; tickRoom(match); const first = game.events.at(-1); assert.equal(first.round, 2);
  game.pendingArenaEvent.executeAt = Date.now() - 1; tickRoom(match); assert.equal(game.events.length, 1); assert.equal(game.weatherSequence, null);
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

test('a tank only collects revealed powerups after physical contact', () => {
  const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(700); const player = match.game.players[0]; player.x = 200; player.y = 691; match.game.players[1].x = 900; match.game.players[1].y = 691;
  match.game.powerups = [{ id: 'upper-item', type: 'rocketDash', x: 270, y: 600, revealed: true, active: true }, { id: 'ground-item', type: 'rocketDash', x: 340, y: 691, revealed: true, active: true }];
  movePlayer(match, player.id, 1); assert.equal(match.game.powerups[0].active, true); assert.ok(!player.inventory.includes('rocketDash'));
  movePlayer(match, player.id, 1); assert.equal(match.game.powerups[1].active, false); assert.ok(player.inventory.includes('rocketDash'));
});

test('each player can choose three powers from the complete initial arsenal', () => {
  const manager = new RoomManager(); const socket = {};
  const { room: lobby } = manager.create(socket, { nickname: 'Arsenal' });
  manager.setClass(lobby.code, socket.playerId, 'ninja');
  assert.equal(lobby.players[0].classType, 'ninja');
  assert.throws(() => manager.setClass(lobby.code, socket.playerId, 'invalid'), /classe válida/);
  const offered = lobby.players[0].arsenalOffer;
  assert.equal(offered.length, SELECTABLE_ARSENAL_ITEMS.length); assert.equal(new Set(offered).size, SELECTABLE_ARSENAL_ITEMS.length);
  assert.deepEqual(new Set(offered), new Set(SELECTABLE_ARSENAL_ITEMS));
  assert.ok(!offered.includes('megaCannon'));
  manager.setArsenal(lobby.code, socket.playerId, offered.slice(0, 3));
  assert.deepEqual(lobby.players[0].arsenal, offered.slice(0, 3));
  assert.equal(lobby.players[0].classType, 'ninja');
  assert.throws(() => manager.setArsenal(lobby.code, socket.playerId, ['zeus']), /exatamente 3/);
  assert.throws(() => manager.setArsenal(lobby.code, socket.playerId, [offered[0], offered[1], 'invalid']), /exatamente 3/);
  assert.throws(() => manager.setArsenal(lobby.code, socket.playerId, [offered[0], offered[1], 'megaCannon']), /exatamente 3/);
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

test('jump combos with rocket and armored dashes for an extra airborne impulse', () => {
  const match = room(); match.players[0].arsenal = ['jump', 'armoredDash', 'heavy']; match.game = createGame(match); match.game.phase = 'playing'; const player = match.game.players[0]; player.inventory.push('rocketDash'); player.selectedPowerup = 'rocketDash';
  useArsenal(match, player.id, { type: 'jump', angle: 50, power: 260, direction: 1 }); const initialVx = player.airborne.vx;
  movePlayer(match, player.id, 1, 'armoredDash');
  assert.ok(player.airborne.vx > initialVx + 500); assert.ok(player.airborne.vy <= -72); assert.equal(player.lastAirBoost.kind, 'doubleDash'); assert.equal(match.game.actions.movesLeft, 0); assert.equal(match.game.actions.attackAvailable, true); assert.equal(player.ammo.armoredDash, 0); assert.ok(!player.inventory.includes('rocketDash'));
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
  const spider = match.game.players[0];
  match.game.terrain.heights.fill(spider.y + WORLD.tankRadius); match.game.terrain.floatingPlatforms = []; match.game.objects = [];
  movePlayer(match, 'one', 1, 'spider', { targetX: spider.x + 160, targetY: spider.y });
  assert.equal(match.game.players[0].ammo.spider, 0); assert.equal(match.game.players[0].spiderMoves, 2); assert.equal(match.game.players[0].spiderClimb, true); assert.equal(match.game.actions.movesLeft, 2); assert.equal(match.game.players[0].lastLaunch.kind, 'spiderLeap');
});

test('fireworks consumes its charge and sends twelve micro rockets in all directions', () => {
  const match = room(); match.players[0].arsenal = ['fireworks', 'zeus', 'gravity']; match.game = createGame(match); match.game.phase = 'playing';
  match.game.terrain.heights.fill(760); match.game.terrain.floatingPlatforms = []; match.game.objects = []; const shooter = match.game.players[0]; const target = match.game.players[1]; shooter.x = 100; shooter.y = 751; const predicted = simulateShot({ terrain: match.game.terrain, x: shooter.x, y: shooter.y, angle: 45, power: 260, gravity: match.rules.gravity, wind: match.game.wind, direction: 1 }); const intercept = predicted.path[Math.min(20, predicted.path.length - 2)]; target.x = intercept.x; target.y = intercept.y; const healthBefore = target.health;
  const shots = fire(match, 'one', { angle: 45, power: 260, direction: 1, weapon: 'fireworks' });
  assert.equal(match.game.players[0].ammo.fireworks, 0);
  const bursts = shots.flatMap((shot) => shot.interactions).filter((entry) => entry.type === 'firework'); assert.equal(bursts.length, 12); assert.ok(bursts.every((entry) => entry.radius === WEAPON_BALANCE.fireworks.secondaryRadius && entry.path.length > 1)); assert.ok(bursts.some((entry) => Math.min(...entry.path.map((point) => point.y)) < entry.originY - 70)); assert.ok(bursts.some((entry) => entry.x < entry.originX - 30)); assert.ok(bursts.some((entry) => entry.x > entry.originX + 30));
  assert.equal(shots[0].damage.find((hit) => hit.playerId === target.id)?.amount, healthBefore - match.game.players[1].health);
});

test('fireworks can be detonated manually while airborne', () => {
  const match = room({ powerupCount: 0 }); match.players[0].arsenal = ['fireworks', 'heavy', 'jump']; match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(850); match.game.terrain.floatingPlatforms = []; match.game.objects = []; match.game.players[0].x = 100; match.game.players[0].y = 841; match.game.players[1].x = 1600; match.game.players[1].y = 841;
  const [shell] = fire(match, 'one', { angle: 65, power: 300, direction: 1, weapon: 'fireworks' }); assert.equal(shell.canActivateFireworks, true);
  const choice = match.pendingFireworksChoice; const index = Math.max(2, Math.floor(choice.path.length * .3)); choice.startedAt = Date.now() - index / SHOT_PATH_RATE * 1000; choice.expiresAt = Date.now() + 2000;
  const [detonated] = activateFireworksShot(match, 'one', shell.fireworksToken); assert.equal(detonated.fireworksActivated, true); assert.ok(detonated.impact.y < 800); assert.equal(detonated.interactions.filter((entry) => entry.type === 'firework').length, 12); assert.equal(match.pendingFireworksChoice, null);
});

test('grenade bounces three times and keeps a three-second fuse path', () => {
  const terrain = { heights: Array(WORLD.width).fill(500), floatingPlatforms: [] };
  const result = simulateBouncingGrenade({ terrain, x: 180, y: 240, angle: 48, power: 260, gravity: 120, direction: 1 });
  assert.equal(result.bounces.length, 3); assert.equal(result.path.filter((point) => point.fuse).length, 120); assert.ok(result.impact);
});

test('grenade passes through a platform underside instead of bouncing upward from it', () => {
  const terrain = { heights: Array(WORLD.width).fill(700), floatingPlatforms: [{ id: 'shelf', x: 100, width: 160, y: 430, height: 9, active: true }] };
  const result = simulateBouncingGrenade({ terrain, x: 150, y: 480, angle: 90, power: 60, gravity: 120 });
  assert.ok(result.bounces.length > 0);
  assert.ok(result.bounces[0].y > 600, `underside caused a false bounce at ${result.bounces[0].y}`);
});

test('a grenade keeps rolling during its fuse and drops off an unsupported ledge', () => {
  const terrain = { heights: Array(WORLD.width).fill(700), floatingPlatforms: [{ id: 'ledge', x: 100, width: 138, y: 430, height: 9, active: true }] };
  const result = simulateBouncingGrenade({ terrain, x: 130, y: 480, angle: 80, power: 150, gravity: 120 });
  const fuse = result.path.filter((point) => point.fuse);
  assert.equal(fuse.length, 120);
  assert.ok(fuse.at(-1).x > 238, 'the grenade should roll beyond the platform edge');
  assert.ok(fuse.at(-1).y > 480, 'the grenade should fall after losing its support');
  assert.ok(Math.abs(result.impact.x - fuse.at(-1).x) < 1);
});

test('mine launcher deploys three proximity mines and mole bomb burrows', () => {
  const mines = room(); mines.players[0].arsenal = ['mineLayer', 'grenade', 'moleBomb']; mines.game = createGame(mines); mines.game.phase = 'playing'; const originalMineCount = mines.game.mines.length;
  const mineShots = fire(mines, 'one', { angle: 58, power: 260, direction: 1, weapon: 'mineLayer' });
  assert.equal(mineShots.length, 3); assert.equal(mines.game.mines.length, originalMineCount + 3); assert.ok(mineShots.every((shot) => shot.noExplosion));

  const mole = room(); mole.players[0].arsenal = ['moleBomb', 'grenade', 'mineLayer']; mole.game = createGame(mole); mole.game.phase = 'playing'; mole.game.terrain.heights.fill(700); mole.game.players[0].x = 100; mole.game.players[0].y = 691; mole.game.players[1].x = 1000; mole.game.players[1].y = 691;
  const [burrow] = fire(mole, 'one', { angle: 45, power: 260, direction: 1, weapon: 'moleBomb' });
  assert.equal(burrow.burrow, true); assert.equal(burrow.path.length, 60); assert.ok(burrow.path.every((point) => point.underground));
});

test('gravity bomb carves terrain and pulls every nearby tank including its shooter', () => {
  const match = room({ powerupCount: 0 }); match.players[0].arsenal = ['gravity', 'heavy', 'jump']; match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(700); const shooter = match.game.players[0]; const target = match.game.players[1]; shooter.x = 100; shooter.y = 691; target.x = 170; target.y = 691; const before = [...match.game.terrain.heights]; const shooterHealth = shooter.health; const targetStart = target.x;
  match.game.objects = [{ id: 'pullable-barrel', type: 'barrel', x: 200, y: 675, groundY: 700, width: 28, height: 30, active: true }];
  target.spiderClimb = true; target.wallClinging = 1;
  const now = Date.now(); match.game.soapBubbles.push({ id: 'gravity-bubble', playerId: target.id, x: target.x, y: target.y, impactAt: now - 100, executeAt: now + 5000 });
  const [shot] = fire(match, 'one', { angle: 85, power: 100, direction: 1, weapon: 'gravity' });
  assert.equal(shot.noExplosion, true); assert.equal(shot.radius, WEAPON_BALANCE.gravity.radius); assert.ok(match.game.terrain.heights.some((height, index) => height > before[index])); assert.ok(shooter.health < shooterHealth); assert.ok(Math.abs(target.x - shot.impact.x) < Math.abs(targetStart - shot.impact.x));
  assert.ok(match.game.objects[0].lastDisplacement?.serial);
  assert.equal(target.wallClinging, null, 'gravity must tear the Spider off a wall');
  assert.ok(!match.game.soapBubbles.some((bubble) => bubble.playerId === target.id), 'gravity must pop the bubble before pulling its tank');
  const well = match.game.gravityWells[0];
  assert.ok(well && well.endsAt - well.activateAt === WEAPON_BALANCE.gravity.durationMs);
  assert.ok(!target.airborne?.fromGravityWell, 'the sustained pull starts when the projectile arrives');
  updateGravityWells(match.game, well.activateAt + 120);
  assert.ok(target.airborne?.fromGravityWell === well.id, 'the vortex lifts a grounded tank');
  assert.ok(target.airborne.vy < 0);
  const firstSpeed = Math.abs(target.airborne.vx);
  updateGravityWells(match.game, well.activateAt + 240);
  assert.ok(Math.abs(target.airborne.vx) > firstSpeed, 'pull accelerates for as long as the vortex remains active');
  updateGravityWells(match.game, well.endsAt + 1);
  assert.equal(match.game.gravityWells.length, 0);
});

test('mega bomb has atomic scale and falling structures damage tanks', () => {
  const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(700); const shooter = match.game.players[0]; shooter.x = 100; shooter.y = 691; shooter.inventory.push('megaMissile'); shooter.selectedPowerup = 'megaMissile'; const [atomic] = fire(match, 'one', { angle: 70, power: 140, direction: 1, weapon: 'standard' }); assert.equal(atomic.megaMissile, true); assert.equal(atomic.radius, MEGA_BOMB.radius); assert.equal(atomic.impactDamage, MEGA_BOMB.damage);
  const crush = room({ powerupCount: 0 }); crush.game = createGame(crush); crush.game.phase = 'playing'; crush.game.terrain.heights.fill(700); const victim = crush.game.players[1]; victim.x = 320; victim.y = 691; const health = victim.health; crush.game.objects = [{ id: 'slab', type: 'concrete', x: 320, y: 652, groundY: 700, width: 70, active: true }]; const interactions = activateScenarioObjects(crush.game, 320, 652, 30); assert.ok(interactions.some((entry) => entry.type === 'concreteFall')); assert.ok(victim.health < health);
  victim.health = victim.maxHealth; victim.alive = true; const terrainBefore = crush.game.terrain.heights[320]; crush.game.objects = [{ id: 'crane', type: 'crane', x: 248, y: 560, groundY: 700, height: 260, armLength: 110, direction: 1, ballX: 320, ballY: 470, ballRadius: 28, towerDurability: 2, cableIntact: true, active: true }]; const craneHit = activateScenarioObjects(crush.game, 320, 470, 12); const ballDrop = craneHit.find((entry) => entry.type === 'wreckingBall'); assert.ok(ballDrop); assert.equal(ballDrop.cause, 'cable'); assert.ok(ballDrop.dropHeight > 200); assert.ok(ballDrop.damage > 100); assert.ok(crush.game.terrain.heights[320] > terrainBefore); assert.ok(victim.health < victim.maxHealth); assert.equal(crush.game.objects[0].active, true); assert.equal(crush.game.objects[0].cableIntact, false);
  const tower = room({ powerupCount: 0 }); tower.game = createGame(tower); tower.game.phase = 'playing'; tower.game.terrain.heights.fill(700); tower.game.objects = [{ id: 'crane', type: 'crane', x: 300, y: 570, groundY: 700, height: 260, armLength: 180, direction: 1, ballX: 456, ballY: 520, ballRadius: 28, towerDurability: 2, cableIntact: true, active: true }]; activateScenarioObjects(tower.game, 300, 570, 18); assert.equal(tower.game.objects[0].towerDurability, 1); const collapse = activateScenarioObjects(tower.game, 300, 570, 18, new Set()); assert.ok(collapse.some((entry) => entry.type === 'craneCollapse')); assert.equal(tower.game.objects[0].active, false);
  const flight = { path: [{ x: 420, y: 430 }, { x: 438, y: 448 }, { x: 456, y: 466 }, { x: 474, y: 490 }, { x: 492, y: 520 }], impact: { x: 492, y: 520 }, collectedPowerupIds: [] }; tower.game.objects[0] = { ...tower.game.objects[0], active: true, cableIntact: true, towerDurability: 2, ballY: 520 }; const clipped = clipProjectileAtCrane(tower.game, flight); assert.ok(clipped); assert.equal(clipped.structure, 'crane'); assert.ok(flight.path.length < 5);
  const buildingFlight = { path: [{ x: 180, y: 430 }, { x: 220, y: 450 }, { x: 260, y: 470 }, { x: 300, y: 490 }], impact: { x: 300, y: 490 }, collectedPowerupIds: [] }; tower.game.objects = [{ id: 'solid-building', type: 'building', x: 260, groundY: 700, width: 100, height: 260, durability: 3, active: true }]; const buildingImpact = clipProjectileAtCrane(tower.game, buildingFlight); assert.equal(buildingImpact.structure, 'building'); assert.equal(buildingImpact.structureId, 'solid-building'); assert.ok(buildingFlight.path.length < 4);
});

test('mega bomb combines with cluster and mole arsenal weapons', () => {
  const cluster = room({ powerupCount: 0 }); cluster.players[0].arsenal = ['cluster', 'moleBomb', 'heavy']; cluster.game = createGame(cluster); cluster.game.phase = 'playing'; cluster.game.terrain.heights.fill(760); cluster.game.terrain.floatingPlatforms = []; cluster.game.objects = []; const shooter = cluster.game.players[0]; shooter.x = 100; shooter.y = 751; cluster.game.players[1].x = WORLD.width - 100; cluster.game.players[1].y = 751; shooter.inventory.push('megaMissile'); shooter.selectedPowerup = 'megaMissile';
  const [capsule] = fire(cluster, shooter.id, { angle: 65, power: 180, direction: 1, weapon: 'cluster' }); assert.equal(capsule.canActivateCluster, true); const fragments = splitCluster(cluster, capsule); assert.equal(fragments.length, 3); assert.ok(fragments.every((shot) => shot.megaMissile && shot.radius === MEGA_BOMB.clusterRadius)); assert.ok(fragments.every((shot) => shot.combo?.includes('cluster'))); assert.ok(!cluster.game.players[0].inventory.includes('megaMissile'));
  const mole = room({ powerupCount: 0 }); mole.players[0].arsenal = ['moleBomb', 'cluster', 'heavy']; mole.game = createGame(mole); mole.game.phase = 'playing'; mole.game.terrain.heights.fill(760); const moleShooter = mole.game.players[0]; moleShooter.x = 100; moleShooter.y = 751; moleShooter.inventory.push('megaMissile'); moleShooter.selectedPowerup = 'megaMissile'; const [atomicMole] = fire(mole, moleShooter.id, { angle: 45, power: 220, direction: 1, weapon: 'moleBomb' }); assert.equal(atomicMole.burrow, true); assert.equal(atomicMole.megaMissile, true); assert.equal(atomicMole.radius, MEGA_BOMB.radius);
});

test('shot modifiers combine with special arsenal weapons', () => {
  const fragmented = room({ powerupCount: 0 }); fragmented.players[0].arsenal = ['cluster', 'heavy', 'grenade']; fragmented.game = createGame(fragmented); fragmented.game.phase = 'playing'; fragmented.game.terrain.heights.fill(780); const clusterShooter = fragmented.game.players[0]; clusterShooter.x = 100; clusterShooter.y = 771; clusterShooter.inventory.push('tripleShot'); clusterShooter.selectedPowerup = 'tripleShot'; const [capsule] = fire(fragmented, clusterShooter.id, { angle: 65, power: 180, direction: 1, weapon: 'cluster' }); const fragments = splitCluster(fragmented, capsule); assert.equal(fragments.length, 9); assert.ok(fragments.every((shot) => shot.combo?.[0] === 'tripleShot'));
  const expanded = room({ powerupCount: 0 }); expanded.players[0].arsenal = ['heavy', 'grenade', 'cluster']; expanded.game = createGame(expanded); expanded.game.phase = 'playing'; expanded.game.terrain.heights.fill(780); const heavyShooter = expanded.game.players[0]; heavyShooter.x = 100; heavyShooter.y = 771; heavyShooter.inventory.push('bigExplosion'); heavyShooter.selectedPowerup = 'bigExplosion'; const [heavy] = fire(expanded, heavyShooter.id, { angle: 65, power: 180, direction: 1, weapon: 'heavy' }); assert.ok(heavy.radius > Math.round(WEAPON_BALANCE.heavy.radius * 1.5)); assert.ok(heavy.damageMultiplier > 1); assert.deepEqual(heavy.combo, ['bigExplosion', 'heavy']); assert.ok(!heavyShooter.inventory.includes('bigExplosion'));

  const incompatible = room({ powerupCount: 0 }); incompatible.players[0].arsenal = ['gravity', 'heavy', 'grenade']; incompatible.game = createGame(incompatible); incompatible.game.phase = 'playing'; incompatible.game.terrain.heights.fill(780); const gravityShooter = incompatible.game.players[0]; gravityShooter.x = 100; gravityShooter.y = 771; gravityShooter.inventory.push('bigExplosion'); gravityShooter.selectedPowerup = 'bigExplosion'; const [gravity] = fire(incompatible, gravityShooter.id, { angle: 65, power: 180, direction: 1, weapon: 'gravity' }); assert.equal(gravity.radius, WEAPON_BALANCE.gravity.radius); assert.equal(gravity.combo, null); assert.ok(gravityShooter.inventory.includes('bigExplosion'));
});

test('destruction score values terrain, objects and eliminated tanks differently', () => {
  const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(700); const shooter = match.game.players[0]; const target = match.game.players[1]; shooter.x = 100; shooter.y = 691; target.x = 150; target.y = 691; target.health = 1; match.game.objects = [{ id: 'score-barrel', type: 'barrel', x: 145, y: 692, groundY: 700, active: true }];
  fire(match, shooter.id, { angle: 12, power: 100, direction: 1, weapon: 'standard' });
  assert.equal(target.alive, false); assert.equal(shooter.stats.destroyed.tank, 1); assert.equal(shooter.stats.destroyed.barrel, 1); assert.ok(shooter.stats.destroyed.terrainChunk > 0); assert.equal(shooter.stats.destruction, 200 + DESTRUCTION_POINTS.barrel + shooter.stats.destroyed.terrainChunk * DESTRUCTION_POINTS.terrainChunk);
});

test('armored dash deals 80 damage, pushes enemies and breaks up to three walls', () => {
  const match = room(); match.players[0].arsenal = ['armoredDash', 'heavy', 'jump']; match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(700); match.game.terrain.floatingPlatforms = []; match.game.objects = []; match.game.mines = []; match.game.powerups = []; const player = match.game.players[0]; const target = match.game.players[1]; player.x = 200; player.y = 691; target.x = 240; target.y = 691; for (const start of [285, 350, 415, 460]) for (let x = start; x <= start + 14; x += 1) match.game.terrain.heights[x] = 620; const targetHealth = target.health;
  movePlayer(match, 'one', 1, 'armoredDash'); assert.ok(player.x > 430 && player.x < 460); assert.equal(player.ammo.armoredDash, 0); assert.equal(player.lastLaunch.wallDestroyed, true); assert.equal(player.lastLaunch.wallsDestroyed, 3); assert.equal(player.lastLaunch.wallBreakPoints.length, 3); assert.deepEqual(player.lastLaunch.hitPlayerIds, ['two']); assert.equal(targetHealth - target.health, 80); assert.ok(target.x > 240); assert.ok(match.game.terrain.heights[290] > 620); assert.equal(match.game.terrain.heights[465], 620);
  const platform = { id: 'test-platform', x: 300, baseX: 300, y: 300, width: 180, height: 10, durability: 30, active: true }; const game = { terrain: { heights: Array(WORLD.width).fill(700), floatingPlatforms: [platform] }, powerups: [], players: [] };
  applyExplosion(game, 380, 300, 70, 40); assert.equal(platform.active, false);
});

test('armored dash is immune to enemy mines and chained scenario damage while advancing', () => {
  const match = room({ powerupCount: 0 }); match.players[0].arsenal = ['armoredDash', 'heavy', 'jump']; match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(700); const player = match.game.players[0]; player.x = 200; player.y = 691; match.game.players[1].x = 900; match.game.players[1].y = 691; match.game.mines = [{ id: 'enemy-mine', x: 255, y: 697, active: true, ownerId: 'two' }]; match.game.objects = [{ id: 'dash-barrel', type: 'barrel', x: 268, y: 692, groundY: 700, active: true }]; const health = player.health;
  movePlayer(match, player.id, 1, 'armoredDash'); assert.equal(player.health, health); assert.equal(match.game.mines[0].active, false); assert.equal(match.game.objects[0].active, false); assert.equal(match.game.damageImmunePlayerIds, undefined);
});

test('vertical activation changes the projectile into a straight downward fall', () => {
  const terrain = { heights: Array(WORLD.width).fill(700), floatingPlatforms: [] };
  const result = simulateVerticalStrike({ terrain, x: 100, y: 400, angle: 55, power: 280, gravity: 120, direction: 1 }); const vertical = result.path.slice(result.activationIndex + 1);
  assert.ok(result.activationIndex > 0); assert.ok(vertical.length > 2); assert.ok(vertical.every((point) => Math.abs(point.x - vertical[0].x) <= 1));
});

test('vector arsenal shot stays ballistic unless its owner selects a new straight heading', () => {
  const match = room({ powerupCount: 0 }); match.players[0].arsenal = ['verticalStrike', 'heavy', 'jump']; match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(760); match.game.terrain.floatingPlatforms = []; match.game.objects = []; const shooter = match.game.players[0]; shooter.x = 100; shooter.y = 751; match.game.players[1].x = WORLD.width - 100; match.game.players[1].y = 751;
  const [ballistic] = fire(match, shooter.id, { angle: 58, power: 260, direction: 1, weapon: 'verticalStrike' }); assert.equal(ballistic.canActivateVertical, true); assert.ok(ballistic.path.every((point) => !point.vertical)); const normalImpactX = ballistic.impact.x;
  const [activated] = activateVerticalShot(match, shooter.id, ballistic.verticalToken, { x: 1100, y: 900 }); const redirected = activated.path; assert.equal(activated.verticalActivated, true); assert.ok(redirected.length > 2); assert.ok(redirected.every((point) => point.vertical)); assert.ok(redirected[2].x > redirected[0].x); assert.notEqual(activated.impact.x, normalImpactX);
});

test('Sentry fires five physical 5-HP bullets every two turns and can be destroyed', () => {
  const match = room({ powerupCount: 0 }); match.players[0].arsenal = ['sentry', 'heavy', 'jump']; match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(760); match.game.terrain.floatingPlatforms = []; match.game.objects = [];
  const shooter = match.game.players[0]; const enemy = match.game.players[1]; shooter.x = 100; shooter.y = 751; enemy.x = 800; enemy.y = 751;
  const [shot] = fire(match, shooter.id, { angle: 20, power: 230, direction: 1, weapon: 'sentry' });
  const sentry = match.game.objects.find((object) => object.type === 'sentry'); assert.ok(sentry); assert.equal(sentry.durability, 3); assert.equal(shot.noExplosion, true);
  enemy.x = sentry.x + 110; enemy.y = sentry.y; const initialHealth = enemy.health;
  nextTurn(match); assert.equal(enemy.health, initialHealth); assert.equal(match.game.lastSentryPulse, null);
  nextTurn(match);
  assert.equal(enemy.health, initialHealth - WEAPON_BALANCE.sentry.damage * WEAPON_BALANCE.sentry.projectiles);
  assert.equal(match.game.lastSentryPulse.bursts[0].targetId, enemy.id);
  assert.equal(match.game.lastSentryPulse.bursts[0].bullets.length, 5);
  assert.ok(match.game.lastSentryPulse.bursts[0].bullets.every((bullet) => bullet.type === 'tank' && bullet.amount === 5));
  const firstSerial = match.game.sentryPulseSerial; nextTurn(match); assert.equal(match.game.sentryPulseSerial, firstSerial); nextTurn(match); assert.equal(match.game.sentryPulseSerial, firstSerial + 1);
  for (let hit = 0; hit < 3; hit += 1) activateScenarioObjects(match.game, sentry.x, sentry.y, 20);
  assert.equal(sentry.active, false);
});

test('Sentry bullets stop at terrain, carve it, and cannot damage a hidden enemy', () => {
  const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(760); match.game.terrain.floatingPlatforms = []; match.game.objects = [];
  const owner = match.game.players[0]; const enemy = match.game.players[1]; owner.x = 340; owner.y = 751; enemy.x = 620; enemy.y = 738;
  match.game.terrain.heights.fill(650, 480, 515);
  match.game.objects.push({ id: 'test-sentry', type: 'sentry', x: 410, y: 738, groundY: 760, width: 34, height: 44, durability: 3, active: true, ownerId: owner.id, disabledUntilRound: 0, lastFiredTurn: match.game.turnNumber });
  const before = match.game.terrain.heights[483]; const health = enemy.health;
  nextTurn(match); nextTurn(match);
  const bullets = match.game.lastSentryPulse.bursts[0].bullets;
  assert.ok(bullets.some((bullet) => bullet.type === 'terrain'));
  assert.equal(enemy.health, health);
  assert.ok(match.game.terrain.heights[483] > before);
});

test('Sentry machine-gun bullets damage a blocking structure individually', () => {
  const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(760); match.game.terrain.floatingPlatforms = [];
  const owner = match.game.players[0]; const enemy = match.game.players[1]; owner.x = 340; owner.y = 751; enemy.x = 620; enemy.y = 738;
  match.game.objects = [
    { id: 'test-sentry', type: 'sentry', x: 410, y: 738, groundY: 760, width: 34, height: 44, durability: 3, active: true, ownerId: owner.id, disabledUntilRound: 0, lastFiredTurn: match.game.turnNumber },
    { id: 'target-building', type: 'building', x: 520, y: 690, groundY: 760, width: 50, height: 140, durability: 6, active: true },
  ];
  const health = enemy.health;
  nextTurn(match); nextTurn(match);
  const bullets = match.game.lastSentryPulse.bursts[0].bullets;
  assert.ok(bullets.every((bullet) => bullet.type === 'structure' && bullet.objectId === 'target-building'));
  assert.equal(match.game.objects[1].durability, 1);
  assert.equal(enemy.health, health);
});

test('Sentry microprojectiles wear down and break a floating platform in their path', () => {
  const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(760);
  const owner = match.game.players[0]; const enemy = match.game.players[1]; owner.x = 340; owner.y = 751; enemy.x = 620; enemy.y = 738;
  match.game.terrain.floatingPlatforms = [{ id: 'target-deck', x: 490, baseX: 490, y: 726, width: 60, height: 15, durability: 27, active: true, moving: false }];
  match.game.objects = [{ id: 'test-sentry', type: 'sentry', x: 410, y: 738, groundY: 760, width: 34, height: 44, durability: 3, active: true, ownerId: owner.id, disabledUntilRound: 0, lastFiredTurn: match.game.turnNumber }];
  nextTurn(match); nextTurn(match);
  assert.ok(match.game.lastSentryPulse.bursts[0].bullets.filter((bullet) => bullet.type === 'platform').length >= 3);
  assert.equal(match.game.terrain.floatingPlatforms[0].active, false);
});

test('AP fractures an unshielded tank track for its next turn', () => {
  const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(800); match.game.terrain.floatingPlatforms = []; match.game.objects = [];
  const shooter = match.game.players[0]; const enemy = match.game.players[1]; shooter.x = 200; shooter.y = 650; enemy.x = 300; enemy.y = 642; shooter.inventory.push('armorPiercer'); shooter.selectedPowerup = 'armorPiercer';
  const [shot] = fire(match, shooter.id, { angle: 5, power: 340, direction: 1, weapon: 'standard' });
  assert.ok(shot.damage.some((hit) => hit.playerId === enemy.id)); assert.equal(enemy.armorFractureTurns, 1);
  nextTurn(match); assert.equal(match.game.actions.movesLeft, 1);
});

test('AP bypasses a shield without applying the unshielded track fracture', () => {
  const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(800); match.game.terrain.floatingPlatforms = []; match.game.objects = [];
  const shooter = match.game.players[0]; const enemy = match.game.players[1]; shooter.x = 200; shooter.y = 650; enemy.x = 300; enemy.y = 642; enemy.shield = true; enemy.shieldCharges = 1; shooter.inventory.push('armorPiercer'); shooter.selectedPowerup = 'armorPiercer';
  const [shot] = fire(match, shooter.id, { angle: 5, power: 340, direction: 1, weapon: 'standard' });
  assert.ok(shot.damage.some((hit) => hit.playerId === enemy.id)); assert.equal(enemy.armorFractureTurns, 0);
});

test('GPS makes a strong homing correction toward an otherwise missed tank', () => {
  const terrain = { heights: Array(WORLD.width).fill(980), floatingPlatforms: [] }; const target = { id: 'target', alive: true, x: 750, y: 500 };
  const input = { terrain, players: [target], ignorePlayerId: 'shooter', x: 100, y: 740, angle: 70, power: 320, gravity: 120, direction: 1 };
  const ordinary = simulateShot(input); const guided = simulateShot({ ...input, guidedTarget: target });
  assert.notEqual(ordinary.impact?.playerId, target.id); assert.equal(guided.impact?.playerId, target.id);
});

test('Sentry interception has a deterministic 60% roll and Tesla disables the tower', () => {
  let intercepted = 0;
  for (let sample = 0; sample < 12; sample += 1) {
    const match = room({ seed: `intercept-${sample}`, powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(980); match.game.terrain.floatingPlatforms = [];
    match.game.objects = [{ id: 'tower', type: 'sentry', x: 550, y: 548, groundY: 570, width: 34, height: 44, durability: 3, active: true, ownerId: 'two', disabledUntilRound: 0 }];
    match.game.players[0].x = 100; match.game.players[0].y = 740; match.game.players[1].x = 1300; match.game.players[1].y = 740;
    const [shot] = fire(match, 'one', { angle: 70, power: 320, direction: 1, weapon: 'standard' });
    if (shot.interceptedBySentry) { intercepted += 1; assert.equal(shot.interceptedBySentry, 'tower'); assert.equal(shot.path.at(-1).x, Math.round(shot.impact.x)); }
  }
  assert.ok(intercepted >= 5 && intercepted <= 11);
  const match = room({ seed: 'tesla-sentry', powerupCount: 0 }); match.players[0].arsenal = ['teslaOrb', 'heavy', 'jump']; match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(980); match.game.terrain.floatingPlatforms = [];
  match.game.objects = [{ id: 'tower', type: 'sentry', x: 650, y: 878, groundY: 900, width: 34, height: 44, durability: 3, active: true, ownerId: 'two', disabledUntilRound: 1 }];
  match.game.players[0].x = 100; match.game.players[0].y = 740; match.game.players[1].x = 1300; match.game.players[1].y = 740;
  fire(match, 'one', { angle: 70, power: 320, direction: 1, weapon: 'teslaOrb' });
  assert.equal(match.game.objects[0].disabledUntilRound, 2);
});

test('a Sentry falls and takes structure physics when its ground is removed', () => {
  const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(760); match.game.terrain.floatingPlatforms = [];
  const sentry = { id: 'tower', type: 'sentry', x: 400, y: 738, groundY: 760, width: 34, height: 44, durability: 3, active: true, ownerId: 'one' };
  match.game.objects = [sentry]; match.game.terrain.heights.fill(930, 350, 451);
  const falls = settleScenarioObjects(match.game);
  assert.equal(sentry.groundY, 930); assert.ok(sentry.lastFall.distance >= 170); assert.ok(falls.some((fall) => fall.id === sentry.id));
});

test('heavy shell gains damage from height and distance without exceeding its cap', () => {
  const low = room({ powerupCount: 0 }); low.players[0].arsenal = ['heavy', 'jump', 'cluster']; low.game = createGame(low); low.game.phase = 'playing'; low.game.terrain.heights.fill(900); low.game.players[0].x = 100; low.game.players[0].y = 891; const [shortShot] = fire(low, 'one', { angle: 18, power: 120, direction: 1, weapon: 'heavy' });
  const high = room({ powerupCount: 0 }); high.players[0].arsenal = ['heavy', 'jump', 'cluster']; high.game = createGame(high); high.game.phase = 'playing'; high.game.terrain.heights.fill(900); high.game.players[0].x = 100; high.game.players[0].y = 891; const [longShot] = fire(high, 'one', { angle: 72, power: 500, direction: 1, weapon: 'heavy' });
  assert.ok(longShot.damageMultiplier > shortShot.damageMultiplier); assert.ok(longShot.impactDamage > shortShot.impactDamage); assert.ok(longShot.damageMultiplier <= WEAPON_BALANCE.heavy.maxMultiplier * WEAPON_BALANCE.heavy.criticalMultiplier);
});

test('laser crosses multiple enemies, damages terrain and immobilizes its shooter', () => {
  const match = room(); match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(850); match.game.terrain.floatingPlatforms = []; match.game.objects = []; const shooter = match.game.players[0]; const target = match.game.players[1]; shooter.x = 200; shooter.y = 400; shooter.facing = 1; target.x = 520; target.y = 372; shooter.inventory.push('laser'); shooter.selectedPowerup = 'laser'; const health = target.health;
  const [beam] = fire(match, 'one', { angle: 5, power: 400, direction: 1, weapon: 'standard' });
  assert.equal(beam.laser, true); assert.ok(target.health < health); assert.equal(shooter.frozenTurns, 2); assert.ok(!shooter.inventory.includes('laser'));
});

test('laser accepts a downward aim while regular projectiles remain upward', () => {
  const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(850); match.game.terrain.floatingPlatforms = []; match.game.objects = []; const shooter = match.game.players[0]; const target = match.game.players[1]; shooter.x = 200; shooter.y = 300; shooter.facing = 1; target.x = 520; target.y = 416; shooter.inventory.push('laser'); shooter.selectedPowerup = 'laser'; const health = target.health;
  const [beam] = fire(match, shooter.id, { angle: -20, power: 400, direction: 1, weapon: 'standard' }); assert.ok(beam.path.at(-1).y > beam.path[0].y); assert.ok(target.health < health);
  const regular = room({ powerupCount: 0 }); regular.game = createGame(regular); regular.game.phase = 'playing'; regular.game.terrain.heights.fill(850); regular.game.terrain.floatingPlatforms = []; regular.game.objects = []; regular.game.players[0].x = 200; regular.game.players[0].y = 300; const [shot] = fire(regular, regular.game.players[0].id, { angle: -20, power: 200, direction: 1, weapon: 'standard' }); assert.ok(shot.path[1].y < shot.path[0].y);
});

test('airborne tanks land on solid platforms', () => {
  const match = room(); match.game = createGame(match); match.game.phase = 'playing'; const player = match.game.players[0]; const platform = { id: 'landing', x: 100, baseX: 100, y: 300, width: 220, height: 12, durability: 100, active: true }; match.game.terrain.floatingPlatforms = [platform]; player.x = 180; player.y = 260; player.airborne = { vx: 0, vy: 160, parachute: false, updatedAt: Date.now() - 300 };
  tickRoom(match); assert.equal(player.airborne, null); assert.equal(player.supportPlatformId, platform.id); assert.equal(player.y, platform.y - WORLD.tankRadius);
});

test('fast airborne tanks cannot tunnel through a wall or a narrow platform', () => {
  const wallRoom = room({ powerupCount: 0, enabledEvents: [] }); wallRoom.game = createGame(wallRoom); wallRoom.game.phase = 'playing';
  wallRoom.game.objects = []; wallRoom.game.terrain.floatingPlatforms = []; wallRoom.game.terrain.heights.fill(700);
  wallRoom.game.terrain.heights.fill(450, 320, 420);
  const runner = wallRoom.game.players[0]; runner.x = 200; runner.y = 600;
  runner.airborne = { vx: 900, vy: 0, falling: true, startY: 600, updatedAt: Date.now() - 300 };
  tickRoom(wallRoom);
  assert.ok(runner.x < 320 - WORLD.tankRadius, `tank crossed the wall: ${runner.x}`);
  assert.equal(runner.airborne?.vx, 0);

  const platformRoom = room({ powerupCount: 0, enabledEvents: [] }); platformRoom.game = createGame(platformRoom); platformRoom.game.phase = 'playing';
  platformRoom.game.objects = []; platformRoom.game.terrain.heights.fill(700);
  platformRoom.game.terrain.floatingPlatforms = [{ id: 'thin-landing', x: 300, baseX: 300, y: 550, width: 120, height: 8, durability: 100, active: true }];
  const falling = platformRoom.game.players[0]; falling.x = 350; falling.y = 450;
  falling.airborne = { vx: 0, vy: 700, falling: true, startY: 450, updatedAt: Date.now() - 300 };
  tickRoom(platformRoom);
  assert.equal(falling.supportPlatformId, 'thin-landing');
  assert.equal(falling.y, 550 - WORLD.tankRadius);
  assert.ok(falling.lastLanding?.speed > 700);
  assert.ok(platformRoom.game.lastBattleAnimationUntil > Date.now(), 'turn must wait for the landing animation');
});

test('landing beside a cliff resolves the full tank footprint onto safe ground', () => {
  const match = room({ powerupCount: 0, enabledEvents: [] }); match.game = createGame(match); match.game.phase = 'playing';
  match.game.objects = []; match.game.terrain.floatingPlatforms = []; match.game.terrain.heights.fill(700);
  match.game.terrain.heights.fill(450, 300, 420);
  const tank = match.game.players[0]; tank.x = 294; tank.y = 670;
  tank.airborne = { vx: 0, vy: 140, falling: true, startY: 590, updatedAt: Date.now() - 300 };
  tickRoom(match);
  assert.equal(tank.airborne, null);
  assert.ok(tank.x + WORLD.tankRadius + 2 < 300, `tank footprint overlaps the cliff: ${tank.x}`);
  assert.equal(tank.y, 700 - WORLD.tankRadius);
  assert.ok(tank.lastLanding?.serial > 0);
});

test('large rooms can spawn tanks and structures on elevated platforms', () => {
  const match = room({ maxPlayers: 4, mapType: 'platforms' }); match.players.push({ id: 'three', nickname: 'Three', color: '#0ff', connected: true }, { id: 'four', nickname: 'Four', color: '#f0f', connected: true }); match.game = createGame(match);
  const elevatedPlayers = match.game.players.filter((player) => player.supportPlatformId); assert.ok(elevatedPlayers.length >= 1);
  for (const player of elevatedPlayers) { const platform = match.game.terrain.floatingPlatforms.find((entry) => entry.id === player.supportPlatformId); assert.ok(platform?.active); assert.equal(player.y, platform.y - WORLD.tankRadius); }
  assert.ok(match.game.objects.some((object) => object.supportPlatformId));
  for (const object of match.game.objects.filter((entry) => entry.supportPlatformId)) { const platform = match.game.terrain.floatingPlatforms.find((entry) => entry.id === object.supportPlatformId); assert.equal(platform?.moving, false); }
});

test('new structures react with distinct destruction behavior', () => {
  const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(700); const target = match.game.players[1]; target.x = 330; target.y = 691;
  match.game.objects = [{ id: 'fuel', type: 'fuelTank', x: 300, y: 678, groundY: 700, width: 34, height: 44, durability: 1, active: true }, { id: 'radar', type: 'radar', x: 520, y: 666, groundY: 700, width: 62, height: 68, durability: 1, active: true }, { id: 'tower', type: 'watchtower', x: 760, y: 630, groundY: 700, width: 72, height: 140, durability: 1, active: true }];
  assert.ok(activateScenarioObjects(match.game, 300, 678, 12).some((entry) => entry.type === 'fuelTankBlast')); assert.ok(target.health < target.maxHealth);
  target.x = 530; target.y = 691; assert.ok(activateScenarioObjects(match.game, 520, 666, 12).some((entry) => entry.type === 'radarPulse')); assert.ok(target.powerupBlockedTurns > 0);
  assert.ok(activateScenarioObjects(match.game, 760, 630, 12).some((entry) => entry.type === 'watchtowerCollapse'));
});

test('drone, tesla and seismic arsenal powers have unique effects', () => {
  for (const [weapon, interaction] of [['droneStrike', 'droneMissile'], ['teslaOrb', 'teslaChain'], ['seismicCharge', 'seismicWave']]) { const match = room({ powerupCount: 0 }); match.players[0].arsenal = [weapon]; match.game = createGame(match); match.game.phase = 'playing'; match.game.objects = []; match.game.terrain.heights.fill(700); const shooter = match.game.players[0]; const target = match.game.players[1]; shooter.x = 100; shooter.y = 691; target.x = 235; target.y = 691; const shots = fire(match, shooter.id, { angle: 20, power: 150, direction: 1, weapon }); if (weapon === 'seismicCharge') { assert.equal(shots[0].delayedStrike, true); assert.ok(!shots[0].interactions.length); match.game.delayedStrikes[0].executeAt = Date.now() - 1; const event = tickRoom(match); assert.ok(event.shot.results[0].interactions.some((entry) => entry.type === interaction)); } else assert.ok(shots.flatMap((shot) => shot.interactions).some((entry) => entry.type === interaction), `${weapon} did not create ${interaction}`); }
});

test('unsupported structures fall with terrain and damage tanks below', () => {
  const game = { terrain: { heights: Array(WORLD.width).fill(700), floatingPlatforms: [{ id: 'sky', x: 240, baseX: 240, y: 300, width: 140, height: 10, durability: 1, active: true }] }, powerups: [], interactionSerial: 0, players: [{ id: 'victim', x: 310, y: 691, health: 150, maxHealth: 150, alive: true, shieldCharges: 0 }], objects: [{ id: 'falling-building', type: 'building', x: 310, y: 240, groundY: 300, width: 100, height: 120, durability: 3, active: true, supportPlatformId: 'sky', platformOffset: 70 }] };
  applyExplosion(game, 310, 300, 48, 1); const building = game.objects[0]; assert.equal(game.terrain.floatingPlatforms[0].active, false); assert.ok(building.groundY > 600); assert.ok(building.lastFall?.distance > 300); assert.ok(game.players[0].health < 150);
});

test('a falling structure lands on the first intact lower platform', () => {
  const upper = { id: 'upper', x: 250, width: 160, y: 300, height: 10, active: false };
  const lower = { id: 'lower', x: 240, width: 180, y: 510, height: 10, active: true };
  const building = { id: 'stacked-building', type: 'building', x: 320, y: 240, groundY: 300, width: 100, height: 120, durability: 3, active: true, supportPlatformId: 'upper', platformOffset: 70 };
  const game = { terrain: { heights: Array(WORLD.width).fill(700), floatingPlatforms: [upper, lower] }, players: [], objects: [building], interactionSerial: 0 };
  const falls = settleScenarioObjects(game);
  assert.equal(building.supportPlatformId, 'lower');
  assert.equal(building.groundY, 510);
  assert.equal(building.y, 450);
  assert.equal(building.lastFall.distance, 210);
  assert.equal(falls.length, 1);
  assert.equal(settleScenarioObjects(game).length, 0, 'the structure must not keep falling through its new support');
});

test('buildings take hits across their full body and collapse into damaging terrain fragments', () => {
  const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(700); const target = match.game.players[1]; target.x = 420; target.y = 691; target.health = 150; match.game.objects = [{ id: 'tower-block', type: 'building', x: 400, y: 570, groundY: 700, width: 120, height: 240, durability: 3, active: true }]; const terrainBefore = [...match.game.terrain.heights];
  activateScenarioObjects(match.game, 350, 475, 14); activateScenarioObjects(match.game, 350, 475, 14); const collapse = activateScenarioObjects(match.game, 350, 475, 14).find((entry) => entry.type === 'buildingCollapse');
  assert.ok(collapse); assert.ok(collapse.fragments.length >= 8); assert.equal(match.game.objects[0].active, false); assert.ok(match.game.terrain.heights.some((height, index) => height > terrainBefore[index])); assert.ok(target.health < 150);
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

test('pregame gives separate 10-second class and arsenal phases before roulette', () => {
  const match = room(); match.game = createGame(match);
  assert.equal(match.game.phase, 'class'); assert.equal(match.game.classEndsAt - match.game.platformEpoch, GAME_TIMING.classMs);
  match.game.classEndsAt = Date.now() - 1; tickRoom(match);
  assert.equal(match.game.phase, 'arsenal'); assert.ok(match.game.arsenalEndsAt - Date.now() <= GAME_TIMING.arsenalMs);
  match.game.arsenalEndsAt = Date.now() - 1; tickRoom(match);
  assert.equal(match.game.phase, 'roulette');
  assert.equal(match.game.rouletteSpinEndsAt - match.game.rouletteStartedAt, GAME_TIMING.rouletteSpinMs);
  assert.equal(match.game.rouletteEndsAt - match.game.rouletteStartedAt, GAME_TIMING.matchStartMs);
  const winner = match.game.rouletteWinnerIndex; assert.equal(match.game.rouletteSequence.at(-1), winner);
  match.game.rouletteEndsAt = Date.now() - 1; tickRoom(match);
  assert.equal(match.game.phase, 'playing'); assert.equal(match.game.turnIndex, winner);
});

test('classless matches skip the class stage', () => {
  const match = room({ classesEnabled: false }); match.game = createGame(match);
  assert.equal(match.game.phase, 'arsenal');
  assert.equal(match.game.classEndsAt, null);
  assert.equal(match.game.arsenalEndsAt - match.game.platformEpoch, GAME_TIMING.arsenalMs);
});

test('class selection updates the active tank and cannot be changed during arsenal selection', () => {
  const manager = new RoomManager(); const socket = {};
  const { room: match } = manager.create(socket, { nickname: 'Pilot', rules: { botCount: 1 } });
  manager.start(match.code, socket.playerId);
  manager.setClass(match.code, socket.playerId, 'meteorologist');
  const tank = match.game.players.find((player) => player.id === socket.playerId);
  assert.equal(tank.classType, 'meteorologist');
  assert.ok(!tank.arsenal.includes('lightningRod'));
  match.game.classEndsAt = Date.now() - 1; tickRoom(match);
  assert.throws(() => manager.setClass(match.code, socket.playerId, 'ninja'), /tempo para escolher a classe/);
  manager.setArsenal(match.code, socket.playerId, match.players[0].arsenalOffer.slice(0, 3));
  assert.equal(tank.classType, 'meteorologist');
  assert.ok(!tank.arsenal.includes('lightningRod'));
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

test('blizzard warns, extinguishes fire and freezes lakes without carving terrain', () => {
  const match = room({ enabledEvents: ['blizzard'] }); match.game = createGame(match); match.game.phase = 'playing'; match.game.turnNumber = 3;
  match.game.fireZones = [{ id: 'fire', x: 500, y: 700, radius: 90, turnsLeft: 3 }]; match.game.waterZones = [{ id: 'lake', x: 500, radius: 180, surfaceY: 690 }];
  const before = [...match.game.terrain.heights]; const event = applyArenaPulse(match, { forcedType: 'blizzard' }); assert.equal(event.type, 'blizzard'); assert.equal(event.warning, true);
  match.game.pendingArenaEvent.executeAt = Date.now() - 1; tickRoom(match);
  assert.equal(match.game.fireZones.length, 0); assert.ok(match.game.waterZones[0].frozenUntilRound > match.game.roundNumber); assert.ok(match.game.iceZones.length > 0); assert.deepEqual(match.game.terrain.heights, before);
});

test('supply event performs a helicopter flyover before revealing its drops', () => {
  const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.turnNumber = 3;
  const event = applyArenaPulse(match, { forcedType: 'supply' });
  assert.equal(event.type, 'supply'); assert.equal(event.warning, true); assert.ok(event.helicopter); assert.equal(event.lootboxChance, 18); assert.equal(match.game.powerups.length, 0);
  match.game.pendingArenaEvent.executeAt = Date.now() - 1; tickRoom(match);
  assert.ok(match.game.powerups.length >= 4); assert.ok(match.game.powerups.every((item) => item.active && item.revealed && item.source === 'helicopter'));
});

test('rare supply lootbox stores and grants three different upgrades', () => {
  let event;
  for (let seed = 1; seed < 200 && !event?.drops.some((drop) => drop.type === 'lootbox'); seed += 1) { const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.turnNumber = 3; match.game.seed = seed; event = applyArenaPulse(match, { forcedType: 'supply' }); }
  const box = event.drops.find((drop) => drop.type === 'lootbox'); assert.ok(box); assert.equal(box.loot.length, 3); assert.equal(new Set(box.loot).size, 3);
  const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(700); match.game.objects = []; const shooter = match.game.players[0]; shooter.x = 100; shooter.y = 691; shooter.health = 50; match.game.players[1].x = 900; match.game.players[1].y = 691; match.game.powerups = [{ id: 'loot', type: 'lootbox', loot: ['heal', 'heavy', 'megaMissile'], x: 140, y: 688, active: true, revealed: true }];
  fire(match, shooter.id, { angle: 5, power: 300, direction: 1, weapon: 'standard' });
  assert.equal(shooter.lastPickup.type, 'lootbox'); assert.equal(shooter.health, 100); assert.equal(shooter.ammo.heavy, 2); assert.ok(shooter.inventory.includes('megaMissile'));
});

test('lightning blocks nearby tank powerups for its next turn', () => {
  let match; let event;
  match = room({ mapType: 'platforms' }); match.game = createGame(match); match.game.phase = 'playing'; event = applyArenaPulse(match, { forcedType: 'lightning' });
  assert.equal(event.type, 'lightning'); const target = match.game.players[0]; target.x = event.impacts[0].x; target.y = event.impacts[0].y; match.game.pendingArenaEvent.executeAt = Date.now() - 1; tickRoom(match);
  assert.equal(target.powerupBlockedTurns, 1); assert.ok(match.game.events.at(-1).blockedPlayerIds.includes(target.id));
  assert.equal(match.game.weatherSequence, null); assert.equal(match.game.events.length, 1);
  target.inventory.push('megaMissile'); target.selectedPowerup = 'megaMissile'; const shot = fire(match, target.id, { angle: 45, power: 260, direction: 1, weapon: 'standard' }); assert.equal(shot[0].megaMissile, false); assert.ok(target.inventory.includes('megaMissile'));
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
  assert.equal(event.type, 'bombardment'); assert.equal(event.impacts[0].damage, 24); assert.equal(event.impacts[1].damage, 31); for (let index = 1; index < event.impacts.length; index += 1) { assert.ok(event.impacts[index].radius > event.impacts[index - 1].radius); assert.ok(event.impacts[index].damage > event.impacts[index - 1].damage); }
});

test('native mines hit harder than throwable mines', () => {
  const match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.heights.fill(760); match.game.terrain.floatingPlatforms = []; match.game.objects = [];
  const player = match.game.players[0]; player.x = 400; player.y = 751; match.game.players[1].x = 1400; match.game.players[1].y = 751;
  match.game.mines = [{ id: 'native-test', x: 472, y: 751, active: true }];
  const before = player.health; movePlayer(match, player.id, 1);
  assert.equal(match.game.mines[0].active, false);
  assert.equal(before - player.health, NATIVE_MINE_DAMAGE);
  assert.ok(NATIVE_MINE_DAMAGE > WEAPON_BALANCE.mineLayer.damage);
});

test('destructive arena events also damage scenario structures', () => {
  let match; let event; for (let seed = 1; seed < 200 && event?.type !== 'bombardment'; seed += 1) { match = room({ powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.terrain.floatingPlatforms = []; match.game.turnNumber = 9; match.game.seed = seed; event = applyArenaPulse(match); }
  const impact = event.impacts[0]; match.game.objects = [{ id: 'event-fuel', type: 'fuelTank', x: impact.x, y: impact.y - 22, groundY: impact.y, width: 34, height: 44, durability: 1, active: true }]; match.game.pendingArenaEvent.executeAt = Date.now() - 1; tickRoom(match);
  assert.equal(match.game.objects[0].active, false); assert.ok(event.interactions.some((entry) => entry.type === 'fuelTankBlast'));
});

test('eruption launches physical fireballs that ignite their collision points', () => {
  const match = room({ mapType: 'islands', powerupCount: 0 }); match.game = createGame(match); match.game.phase = 'playing'; match.game.turnNumber = 27;
  const event = applyArenaPulse(match, { forcedType: 'eruption' }); assert.equal(event.type, 'eruption'); assert.ok(event.lavaRivers.length >= 1); assert.ok(event.impacts.length >= 5);
  assert.ok(event.impacts.every((fireball) => fireball.path.length >= 10 && Math.min(...fireball.path.map((point) => point.y)) < fireball.originY - 75 && fireball.radius >= 44));
  const lavaTarget = match.game.players[0]; const river = event.lavaRivers[0]; lavaTarget.x = river.x; lavaTarget.y = river.surfaceY + 8; lavaTarget.health = 150;
  const fireballTarget = match.game.players[1]; const fireball = event.impacts[0]; fireballTarget.x = fireball.x; fireballTarget.y = fireball.y - WORLD.tankRadius; const fireballHealth = fireballTarget.health;
  const previousLavaLevel = match.game.lavaLevel; match.game.pendingArenaEvent.executeAt = Date.now() - 1; tickRoom(match);
  assert.ok(match.game.events.at(-1).lavaHitPlayerIds.includes(lavaTarget.id)); assert.ok(fireballTarget.health < fireballHealth); assert.equal(match.game.events.at(-1).warning, false);
  assert.ok(match.game.lavaLevel < previousLavaLevel); assert.equal(lavaTarget.alive, false);
  assert.equal(match.game.fireZones.filter((zone) => zone.source === 'eruption').length, event.impacts.length); assert.ok(match.game.fireZones.filter((zone) => zone.source === 'eruption').every((zone) => zone.turnsLeft === 3 && zone.radius === 82 && Number.isFinite(zone.ignitesAt)));
});
