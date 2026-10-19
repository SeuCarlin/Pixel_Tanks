import test from 'node:test';
import assert from 'node:assert/strict';
import { applyArenaPulse, createGame, fire, nextTurn, ninjaFatal, sanitizeRules, selectPowerup, tickRoom, useArsenal } from '../server/game.js';
import { applyExplosion, settlePlayers } from '../server/physics.js';
import { ARSENAL_DEFS, WORLD } from '../shared/constants.js';
import { walkPath } from '../shared/movement.js';

function match(arsenal = ['heavy', 'jump', 'splitDamage'], classes = ['ninja', 'attacker']) {
  const room = { rules: sanitizeRules({ seed: 'new-cards-2026', powerupCount: 0, enabledEvents: ['supply'] }), players: classes.map((classType, index) => ({ id: `tank${index}`, nickname: `Tank ${index}`, classType, arsenal })) };
  room.game = createGame(room);
  room.game.phase = 'playing'; room.game.turnIndex = 0;
  room.game.terrain.heights.fill(760); room.game.terrain.floatingPlatforms = []; room.game.objects = []; room.game.mines = []; room.game.powerups = [];
  room.game.players.forEach((player, index) => { player.x = 180 + index * 450; player.y = 760 - WORLD.tankRadius; });
  return room;
}

test('real opening round allows standard shot and movement, then unlocks arsenal', () => {
  const room = match(); const player = room.game.players[0]; room.game.openingRestrictionsActive = true;
  assert.throws(() => fire(room, player.id, { weapon: 'heavy', angle: 45, power: 260, direction: 1 }), /Rodada 1/);
  player.inventory.push('megaMissile');
  assert.throws(() => selectPowerup(room, player.id, 'megaMissile'), /segunda rodada/);
  assert.ok(fire(room, player.id, { weapon: 'standard', angle: 45, power: 260, direction: 1 }).length);
  const second = match(); second.game.openingRestrictionsActive = true; second.game.roundNumber = 2;
  assert.ok(fire(second, second.game.players[0].id, { weapon: 'heavy', angle: 45, power: 260, direction: 1 }).length);
});

test('fatal Ninja dash crosses the target and lethal strike restores Blink', () => {
  const room = match(); const [ninja, target] = room.game.players;
  target.x = ninja.x + 55; target.y = ninja.y; target.health = 75;
  const start = ninja.x;
  ninjaFatal(room, ninja.id, target.id);
  assert.equal(target.alive, false);
  assert.ok(ninja.x > target.x && ninja.x > start);
  assert.ok(ninja.inventory.includes('lightningStep'));
  assert.ok(room.game.lastNinjaStrike.toX > room.game.lastNinjaStrike.hitX);
});

test('split damage reflects half of an explosion and expires after two rounds', () => {
  const room = match(['splitDamage', 'heavy', 'jump'], ['armored', 'attacker']); const [defender, shooter] = room.game.players;
  room.game.roundNumber = 2; defender.health = defender.maxHealth; shooter.health = shooter.maxHealth;
  useArsenal(room, defender.id, { type: 'splitDamage' });
  assert.equal(defender.splitDamageUntilRound, 3);
  const before = shooter.health;
  const hits = applyExplosion(room.game, defender.x, defender.y, 70, 40, { sourcePlayerId: shooter.id, noTerrain: true });
  const taken = hits.find((hit) => hit.playerId === defender.id)?.amount || 0;
  assert.equal(before - shooter.health, Math.ceil(taken / 2));
  room.game.roundNumber = 4; const later = shooter.health;
  applyExplosion(room.game, defender.x, defender.y, 70, 20, { sourcePlayerId: shooter.id, noTerrain: true });
  assert.equal(shooter.health, later);
});

test('fire ticks once per round for three rounds, burns structures and platforms', () => {
  const room = match(); const [owner, target] = room.game.players;
  owner.x = 1600; target.x = 600; target.y = 760 - WORLD.tankRadius;
  room.game.objects.push({ id: 'fire-building', type: 'building', x: 600, y: 710, groundY: 760, width: 70, height: 50, durability: 4, active: true });
  room.game.terrain.floatingPlatforms.push({ id: 'fire-platform', x: 570, y: 760, width: 70, height: 8, durability: 100, active: true });
  room.game.fireZones.push({ id: 'test-fire', x: 600, y: 760, radius: 90, turnsLeft: 3, ownerId: owner.id, source: 'molotov' });
  const health = target.health;
  nextTurn(room); assert.equal(target.health, health - 25); assert.equal(room.game.fireZones[0].turnsLeft, 2);
  nextTurn(room); assert.equal(target.health, health - 25);
  nextTurn(room); assert.equal(target.health, health - 50);
  assert.equal(room.game.objects[0].durability, 2);
  assert.equal(room.game.terrain.floatingPlatforms[0].durability, 56);
});

test('new cards keep distinct definitions and supply can rest on an elevated platform', () => {
  for (const type of ['vitalRecycling', 'superheat', 'splitDamage']) assert.ok(ARSENAL_DEFS[type]);
  const room = match(); room.game.terrain.floatingPlatforms.push({ id: 'sky-drop', x: 0, y: 440, width: WORLD.width, height: 8, durability: 100, active: true });
  room.game.turnNumber = 3; const event = applyArenaPulse(room);
  assert.equal(event.type, 'supply'); event.executeAt = Date.now() - 1; room.game.pendingArenaEvent.executeAt = Date.now() - 1;
  tickRoom(room);
  assert.ok(room.game.powerups.some((item) => item.y === 428 && item.supportPlatformId === 'sky-drop'));
});

test('Spider can pass around a platform edge and cling upside down to its underside', () => {
  const room = match(); const spider = room.game.players[0];
  const deck = { id: 'spider-deck', x: 300, y: 500, width: 180, height: 10, durability: 100, active: true };
  room.game.terrain.floatingPlatforms.push(deck);
  spider.spiderClimb = true; spider.supportPlatformId = deck.id; spider.x = 465; spider.y = deck.y - WORLD.tankRadius;
  const edge = walkPath(room.game.terrain, spider, 1, 40);
  assert.equal(edge.ceilingClinging, deck.id);
  Object.assign(spider, { x: edge.x, y: edge.y, supportPlatformId: null, ceilingClinging: deck.id });
  settlePlayers(room.game);
  assert.equal(spider.airborne, null);
  assert.equal(spider.y, deck.y + deck.height + WORLD.tankRadius);
  const crawl = walkPath(room.game.terrain, spider, -1, 30);
  assert.ok(crawl.x < spider.x && crawl.ceilingClinging === deck.id);
});
