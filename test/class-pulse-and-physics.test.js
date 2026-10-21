import test from 'node:test';
import assert from 'node:assert/strict';
import { applyArenaPulse, createGame, fire, movePlayer, nextTurn, ninjaFatal, publicGame, sanitizeRules, tickRoom, updateFireZonePhysics, usePowerup } from '../server/game.js';
import { applyExplosion } from '../server/physics.js';
import { fallDamage } from '../shared/fall-damage.js';

function match(classes, mode = 'teams') {
  const room = { rules: sanitizeRules({ seed: `pulse-${classes.join('-')}`, gameMode: mode, teamCount: 2, powerupCount: 0, mines: false, enabledEvents: [] }), players: classes.map((classType, index) => ({ id: `p${index}`, nickname: `P${index}`, classType, arsenal: ['heavy', 'jump', 'zeus'], connected: true })) };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.turnIndex = 0; room.game.terrain.heights.fill(760); room.game.terrain.floatingPlatforms = []; room.game.objects = []; room.game.powerups = [];
  room.game.players.forEach((player, index) => { player.x = 300 + index * 65; player.y = 751; player.airborne = null; });
  return room;
}

test('armored pulse reduces ally explosion damage by 40% for that round, without consuming charges', () => {
  const room = match(['armored', null, null, null]); const [armored, enemy, ally] = room.game.players;
  for (let index = 0; index < 4; index += 1) nextTurn(room);
  assert.equal(room.game.roundNumber, 2);
  assert.equal(ally.armorAuraActive, true);
  room.game.friendlyFire = true;
  const before = ally.health;
  const hits = applyExplosion(room.game, ally.x, ally.y, 55, 50, { noTerrain: true, sourcePlayerId: enemy.id });
  assert.equal(before - ally.health, 30);
  assert.equal(hits.find((hit) => hit.playerId === ally.id).amount, 30);
  assert.equal(ally.shieldCharges, 0);
  armored.teslaDisabledTurns = 1;
});

test('healer pulse restores 25 HP to self and nearby allies once per round', () => {
  const room = match(['healer', null, null, null]); const [healer, , ally] = room.game.players;
  healer.health -= 35; ally.health -= 40;
  for (let index = 0; index < 4; index += 1) nextTurn(room);
  assert.equal(healer.health, healer.maxHealth - 10);
  assert.equal(ally.health, ally.maxHealth - 15);
  assert.equal(room.game.lastClassPulses.filter((pulse) => pulse.type === 'healer').length, 1);
});

test('an active vortex cannot prevent an expired player turn from advancing', () => {
  const room = match([null, null], 'ffa'); const game = room.game;
  game.wind = 15;
  game.windVortices = [{ id: 'turn-vortex', ownerId: game.players[0].id, x: 500, y: 760, width: 200, height: 600, startRound: 1, expiresRound: 2, updatedAt: Date.now() - 100, fire: false, hitRounds: {} }];
  game.turnEndsAt = Date.now() - 1;
  const before = game.turnNumber;
  const result = tickRoom(room);
  assert.equal(result?.changed, true);
  assert.equal(game.turnNumber, before + 1);
  assert.ok(game.windVortices.length > 0);
});

test('backpacker grants each active pickup to exactly one allied tank', () => {
  const room = match(['backpacker', null, null, null, null]); const [carrier, , nearer, , farther] = room.game.players;
  nearer.x = carrier.x + 65; farther.x = carrier.x + 145;
  room.game.powerups.push({ id: 'gift', type: 'extraShot', x: carrier.x + 15, y: carrier.y, active: true, revealed: true });
  movePlayer(room, carrier.id, 1, null, { continuous: true });
  assert.equal(nearer.inventory.filter((item) => item === 'extraShot').length, 1);
  assert.equal(farther.inventory.filter((item) => item === 'extraShot').length, 0);
  assert.equal(carrier.lastSharedPickup.toId, nearer.id);
});

test('fatal slash works airborne and hits two tanks along one 340-block dash, ignoring shields', () => {
  const room = match(['ninja', null, null], 'ffa'); const [ninja, first, second] = room.game.players;
  ninja.x = 300; first.x = 375; second.x = 435; ninja.y = first.y = second.y = 660;
  ninja.airborne = { vx: 0, vy: 30, startY: 660, minY: 660, updatedAt: Date.now() };
  first.shieldCharges = 1; second.armorAuraActive = true;
  const strike = ninjaFatal(room, ninja.id, first.id);
  assert.deepEqual(strike.hits.map((hit) => hit.playerId), [first.id, second.id]);
  assert.equal(first.health, first.maxHealth - 80); assert.equal(second.health, second.maxHealth - 80);
  assert.equal(first.shieldCharges, 1);
  assert.ok(ninja.x > second.x && ninja.airborne);
  assert.equal(fallDamage(800, 'ninja'), 0); assert.equal(fallDamage(800, 'armored'), 0);
});

test('fire falls from a destroyed platform and remains active on the lower ground', () => {
  const room = match([null, null], 'ffa'); const game = room.game;
  game.terrain.floatingPlatforms = [{ id: 'burning', x: 300, y: 450, width: 120, height: 10, active: false }];
  game.fireZones = [{ id: 'fire', x: 345, y: 450, radius: 70, turnsLeft: 3, platformId: 'burning', platformOffset: 45, physicsAt: 1000 }];
  for (let step = 1; step <= 30; step += 1) updateFireZonePhysics(game, 1000 + step * 100);
  assert.equal(game.fireZones[0].platformId, null);
  assert.equal(game.fireZones[0].y, 760);
  assert.equal(game.fireZones[0].turnsLeft, 3);
});

test('lightning rod forecasts the exact event selected for the coming pulse', () => {
  const room = match(['meteorologist', null], 'ffa'); const game = room.game;
  game.enabledEvents = ['supply', 'quake', 'lightning']; game.turnNumber = 6;
  game.objects.push({ id: 'rod', type: 'lightningRod', active: true, x: 500, groundY: 760, height: 90, durability: 3 });
  const forecast = publicGame(game, game.players[0].id).rodForecast;
  const event = applyArenaPulse(room);
  assert.equal(forecast.type, event.type);
  assert.equal(forecast.turnsUntil, 0);
});

test('meteorologist cloud pursues enemies each turn and its rain extinguishes fire', () => {
  const room = match(['meteorologist', null], 'ffa'); const [owner, enemy] = room.game.players; const cloud = room.game.weatherClouds[0];
  owner.x = 300; enemy.x = 1000; cloud.x = 300; room.game.fireZones = [{ id: 'under-cloud', x: 540, y: 760, radius: 35, turnsLeft: 3, bornRound: 0 }];
  nextTurn(room);
  assert.equal(cloud.x, 540); assert.equal(cloud.turn, room.game.turnNumber); assert.equal(room.game.fireZones.length, 0);
});

test('bot driving keeps one direction and stops before burning all fuel', () => {
  const room = match([null, null], 'ffa'); const [bot, enemy] = room.game.players;
  bot.isBot = true; bot.personality = 'aggressive'; bot.x = 300; enemy.x = 950;
  room.game.turnIndex = 0; room.game.botActAt = 0; room.game.turnEndsAt = Date.now() + 120000;
  const positions = [bot.x];
  for (let step = 0; step < 12 && room.game.phase === 'playing'; step += 1) { room.game.botActAt = 0; tickRoom(room); positions.push(bot.x); if (room.game.shotEndsAt) break; }
  assert.ok(positions.every((x, index) => index === 0 || x >= positions[index - 1]));
  assert.ok(Math.max(...positions) - positions[0] <= 170);
  assert.ok(bot.fuel > 0);
});

test('harpoon and short blink preserve Ninja cloak without broadcasting a new position', () => {
  const room = match(['ninja', null], 'ffa'); const [ninja, enemy] = room.game.players;
  ninja.invisibleTurns = 2; ninja.arsenal.push('harpoon'); ninja.ammo.harpoon = 1;
  enemy.x = 1000;
  fire(room, ninja.id, { weapon: 'harpoon', angle: 45, power: 300, direction: 1 });
  assert.equal(ninja.invisibleTurns, 2);
  assert.ok(ninja.lastNinjaReveal == null);

  const blinkRoom = match(['ninja', null], 'ffa'); const [blinking, watcher] = blinkRoom.game.players;
  blinking.invisibleTurns = 2; blinking.inventory.push('lightningStep'); blinking.selectedPowerup = 'lightningStep'; blinking.selectedPowerups = ['lightningStep'];
  usePowerup(blinkRoom, blinking.id, { type: 'lightningStep', x: blinking.x + 110 });
  assert.equal(blinking.invisibleTurns, 2);
  assert.ok(blinking.lastNinjaReveal == null);
  assert.equal(publicGame(blinkRoom.game, watcher.id).players[0].hidden, true);
});
