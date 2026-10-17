import test from 'node:test';
import assert from 'node:assert/strict';
import { activateScenarioObjects, createGame, fire, nextTurn, sanitizeRules, tickRoom } from '../server/game.js';
import { ATTACKER_ELIMINATION_BONUS, COLLECTIBLE_ITEMS, DESTRUCTION_POINTS, MEGA_CANNON_CHARGE, WORLD } from '../shared/constants.js';
import { settlePlayers } from '../server/physics.js';

function match(arsenal = ['seismicCharge', 'megaCannon', 'cluster'], classType = null) {
  const room = { rules: sanitizeRules({ seed: 'new-weapons-stable', powerupCount: 0, mines: false, classesEnabled: Boolean(classType) }), players: [{ id: 'one', nickname: 'One', arsenal, classType }, { id: 'two', nickname: 'Two', arsenal: ['heavy'] }] };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.terrain.heights.fill(760); room.game.terrain.floatingPlatforms = []; room.game.objects = [];
  room.game.players[0].x = 100; room.game.players[0].y = 751; room.game.players[1].x = WORLD.width - 100; room.game.players[1].y = 751;
  return room;
}

test('attacker no longer receives arsenal ammunition each turn', () => {
  const room = match(['heavy', 'cluster'], 'attacker'); const player = room.game.players[0];
  player.ammo.heavy = 0; player.ammo.cluster = 0;
  nextTurn(room); nextTurn(room);
  assert.equal(player.ammo.heavy, 0); assert.equal(player.ammo.cluster, 0);
});

test('seismic charge only destroys the marked ground after its two-second warning', () => {
  const room = match(); const before = [...room.game.terrain.heights];
  const [capsule] = fire(room, 'one', { angle: 30, power: 180, direction: 1, weapon: 'seismicCharge' });
  assert.equal(capsule.delayedStrike, true);
  assert.deepEqual(room.game.terrain.heights, before);
  assert.equal(room.game.delayedStrikes[0].executeAt - room.game.delayedStrikes[0].impactAt, 2000);
  room.game.delayedStrikes[0].executeAt = Date.now() - 1;
  const event = tickRoom(room);
  assert.equal(event.shot.detonation, true);
  assert.ok(event.shot.results[0].interactions.some((effect) => effect.type === 'seismicWave'));
  assert.notDeepEqual(room.game.terrain.heights, before);
});

test('mega cannon charges from destruction, then marks without an early crater', () => {
  const room = match(['seismicCharge', 'cluster', 'heavy'], 'attacker'); const player = room.game.players[0];
  assert.equal(MEGA_CANNON_CHARGE, 1000);
  assert.equal(player.ammo.megaCannon, undefined);
  assert.ok(!player.arsenal.includes('megaCannon'));
  assert.ok(!COLLECTIBLE_ITEMS.includes('megaCannon'));
  for (let index = 0; index < 9; index += 1) {
    const x = 400 + index * 240;
    room.game.objects.push({ id: `charge-radar-${index}`, type: 'radar', x, groundY: 760, width: 100, height: 100, durability: 1, active: true });
    activateScenarioObjects(room.game, x, 700, 100, new Set(), player.id);
  }
  assert.equal(player.ammo.megaCannon, undefined);
  assert.equal(player.megaCannonCharge, 9 * DESTRUCTION_POINTS.radar);
  const lastX = 400 + 9 * 240;
  room.game.objects.push({ id: 'charge-radar-9', type: 'radar', x: lastX, groundY: 760, width: 100, height: 100, durability: 1, active: true });
  activateScenarioObjects(room.game, lastX, 700, 100, new Set(), player.id);
  assert.ok(player.stats.destruction >= MEGA_CANNON_CHARGE);
  assert.equal(player.ammo.megaCannon, 1);
  assert.ok(player.arsenal.includes('megaCannon'));
  assert.equal(player.lastPickup.type, 'megaCannon');
  assert.equal(player.lastPickup.category, 'classReward');
  const before = [...room.game.terrain.heights];
  const [marker] = fire(room, player.id, { angle: 30, power: 180, direction: 1, weapon: 'megaCannon' });
  assert.equal(marker.delayedStrike, true);
  assert.deepEqual(room.game.terrain.heights, before);
  assert.equal(player.ammo.megaCannon, 0);
  assert.equal(player.megaCannonCharge, 0);
  assert.equal(room.game.delayedStrikes[0].executeAt - room.game.delayedStrikes[0].impactAt, 3000);
  room.game.objects.push({ id: 'beam-target', type: 'building', x: marker.impact.x, groundY: 760, width: 90, height: 120, durability: 3, active: true });
  room.game.delayedStrikes[0].executeAt = Date.now() - 1;
  const event = tickRoom(room);
  assert.equal(event.shot.results[0].weapon, 'megaCannon');
  assert.equal(room.game.objects.find((object) => object.id === 'beam-target').active, false);
  assert.notDeepEqual(room.game.terrain.heights, before);
});

test('mega cannon beam passes through a floating platform and clears structures and ground below it', () => {
  const room = match(['heavy'], 'attacker'); const game = room.game; const x = 500;
  game.terrain.floatingPlatforms = [{ id: 'cover', x: x - 80, y: 350, width: 160, height: 10, durability: 300, active: true }];
  game.objects = [{ id: 'ground-building', type: 'building', x, y: 650, groundY: 760, width: 110, height: 220, durability: 3, active: true }];
  const target = game.players[1]; target.x = x + 115; target.y = 751;
  game.delayedStrikes = [{ id: 'beam-test', weapon: 'megaCannon', ownerId: game.players[0].id, x, y: 350, impactAt: Date.now() - 4000, executeAt: Date.now() - 1, radius: 225 }];
  const event = tickRoom(room);
  assert.equal(event.shot.detonation, true);
  assert.equal(game.terrain.floatingPlatforms[0].active, false);
  assert.equal(game.objects[0].active, false);
  assert.ok(game.terrain.heights[x] > WORLD.height, 'beam core should reach below the ground');
  assert.ok(target.health < target.maxHealth || !target.alive, 'vertical blast must reach a tank under the platform');
});

test('a tank pushed against a cliff is moved to a clear full-width footprint', () => {
  const room = match(['heavy']); const player = room.game.players[0];
  room.game.terrain.heights.fill(760);
  for (let x = 205; x < 245; x += 1) room.game.terrain.heights[x] = 500;
  player.x = 201; player.y = 751;
  settlePlayers(room.game);
  assert.ok(player.x + WORLD.tankRadius + 2 < 205, `tank intersects cliff at x=${player.x}`);
  assert.equal(player.y, 760 - WORLD.tankRadius);
});

test('a tank on a platform shifts away from terrain crossing its hull', () => {
  const room = match(['heavy']); const game = room.game; const player = game.players[0];
  game.terrain.heights.fill(760);
  for (let x = 205; x < 245; x += 1) game.terrain.heights[x] = 500;
  game.terrain.floatingPlatforms = [{ id: 'shelf', x: 150, y: 600, width: 180, height: 10, durability: 100, active: true }];
  player.x = 202; player.y = 600 - WORLD.tankRadius; player.supportPlatformId = 'shelf';
  settlePlayers(game);
  assert.ok(player.x + WORLD.tankRadius + 2 < 205, `platform tank intersects cliff at x=${player.x}`);
  assert.equal(player.y, 600 - WORLD.tankRadius);
  assert.equal(player.supportPlatformId, 'shelf');
});

test('attacker gains 50 extra points per tank elimination; other classes cannot equip Mega Cannon', () => {
  assert.equal(DESTRUCTION_POINTS.tank, 200);
  assert.equal(ATTACKER_ELIMINATION_BONUS, 50);
  const attackerMatch = match(['heavy', 'cluster', 'megaCannon'], 'attacker');
  const attacker = attackerMatch.game.players[0]; const victim = attackerMatch.game.players[1];
  assert.ok(!attacker.arsenal.includes('megaCannon'));
  attacker.x = 100; attacker.y = 751; victim.x = 150; victim.y = 751; victim.health = 1;
  fire(attackerMatch, attacker.id, { angle: 12, power: 100, direction: 1, weapon: 'standard' });
  assert.equal(victim.alive, false);
  assert.equal(attacker.lastDestruction.type, 'tank');
  assert.equal(attacker.lastDestruction.points, 250);
  assert.equal(attacker.stats.destroyed.tank, 1);
  const otherMatch = match(['heavy', 'cluster', 'megaCannon'], 'armored'); const other = otherMatch.game.players[0];
  assert.ok(!other.arsenal.includes('megaCannon'));
  assert.throws(() => fire(otherMatch, other.id, { angle: 30, power: 180, direction: 1, weapon: 'megaCannon' }), /Poder indisponível/);
});
