import test from 'node:test';
import assert from 'node:assert/strict';
import { activateScenarioObjects, clipProjectileAtCrane, createGame, nextTurn, sanitizeRules } from '../server/game.js';
import { applyExplosion } from '../server/physics.js';
import { CLASS_BALANCE, DESTRUCTION_POINTS } from '../shared/constants.js';
import { safeGroundAt } from '../shared/movement.js';

function match(classes, rules = {}) {
  const room = {
    rules: sanitizeRules({ seed: 'class-structures-v1', classesEnabled: true, powerupCount: 0, enabledEvents: [], enabledPowerups: ['heal', 'shield'], ...rules }),
    players: classes.map((classType, index) => ({ id: `player-${index}`, nickname: `Player ${index}`, classType, arsenal: ['heavy', 'cluster', 'jump'], connected: true })),
  };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.terrain.heights.fill(760); room.game.terrain.floatingPlatforms = []; room.game.objects = [];
  room.game.players.forEach((player, index) => { player.x = 300 + index * 250; player.y = 760 - 9; });
  return room;
}

function advanceRound(room) { for (let index = 0; index < room.game.players.length; index += 1) nextTurn(room); }

test('new structures are generated on safe terrain and away from tank spawns', () => {
  for (let seed = 0; seed < 10; seed += 1) {
    const room = { rules: sanitizeRules({ seed: `structure-${seed}`, powerupCount: 0 }), players: [{ id: 'a', nickname: 'A', connected: true }, { id: 'b', nickname: 'B', bot: true, connected: true }] };
    const game = createGame(room);
    for (const type of ['supplyCache', 'shockCoil']) {
      const structures = game.objects.filter((object) => object.type === type);
      assert.equal(structures.length, 3, `${type} missing on seed ${seed}`);
      for (const structure of structures) {
        assert.ok(safeGroundAt(game.terrain, structure.x));
        assert.ok(game.players.every((player) => Math.abs(player.x - structure.x) >= 150));
      }
    }
  }
});

test('armored protects itself and nearby allies; healer restores nearby teammates on its turn', () => {
  const armored = match(['armored', null, 'healer'], { gameMode: 'teams', teamCount: 2 });
  const [tank, enemy, ally] = armored.game.players; tank.x = 400; ally.x = 460; enemy.x = 1600;
  advanceRound(armored);
  assert.equal(armored.game.roundNumber, 2); assert.equal(tank.shieldCharges, 1); assert.equal(ally.shieldCharges, 1); assert.equal(enemy.shieldCharges, 0);

  const healer = match(['healer', null, null], { gameMode: 'teams', teamCount: 2 });
  const [medic, , friend] = healer.game.players; medic.x = 400; friend.x = 450; friend.health -= 25;
  advanceRound(healer);
  assert.equal(friend.health, friend.maxHealth - 25 + CLASS_BALANCE.healerAllyAura);
  assert.ok(medic.health <= medic.maxHealth);
});

test('bomber blast is wider and stronger, but bomber armor absorbs explosions', () => {
  const offense = match(['bomber', null]); const [bomber, target] = offense.game.players;
  bomber.x = 200; target.x = 300; const damage = applyExplosion(offense.game, 200, 751, 80, 40, { noTerrain: true, sourcePlayerId: bomber.id });
  assert.ok(damage.find((hit) => hit.playerId === target.id)?.amount >= CLASS_BALANCE.bomberDamage);
  const defense = match([null, 'bomber']); const [attacker, armoredBomber] = defense.game.players; attacker.x = 200; armoredBomber.x = 300;
  const absorbed = applyExplosion(defense.game, 300, 751, 80, 40, { noTerrain: true, sourcePlayerId: attacker.id });
  assert.equal(absorbed.find((hit) => hit.playerId === armoredBomber.id).amount, 40 - CLASS_BALANCE.bomberResistance);
});

test('meteorologist, ninja, saboteur and backpacker gain refreshed class tools', () => {
  const weather = match(['meteorologist', null]); weather.game.players[0].ammo.lightningRod = 0;
  advanceRound(weather); advanceRound(weather);
  assert.equal(weather.game.players[0].ammo.lightningRod, 1);

  const ninja = match(['ninja', null]); advanceRound(ninja);
  assert.ok(ninja.game.players[0].inventory.includes('lightningStep'));
  assert.ok(ninja.game.players[0].inventory.includes('rocketDash'));

  const saboteur = match(['saboteur', null]); saboteur.game.players[0].ammo.teslaOrb = 0; saboteur.game.players[1].x = saboteur.game.players[0].x + 490;
  advanceRound(saboteur); assert.equal(saboteur.game.players[0].ammo.teslaOrb, 1);
  advanceRound(saboteur); assert.ok(saboteur.game.players[1].powerupBlockedTurns > 0);

  const backpacker = match(['backpacker', null, null], { gameMode: 'teams', teamCount: 2 });
  const [carrier, , ally] = backpacker.game.players; carrier.x = 400; ally.x = 450; carrier.ammo.heavy = 0; ally.ammo.heavy = 0;
  advanceRound(backpacker); assert.equal(carrier.ammo.heavy, 1); assert.equal(ally.ammo.heavy, 1);
});

test('supply caches release visible collectibles and projectiles collide with their hull', () => {
  const room = match([null, null]); const game = room.game; const shooter = game.players[0];
  game.objects = [{ id: 'test-cache', type: 'supplyCache', x: 500, y: 738, groundY: 760, width: 54, height: 44, durability: 2, active: true }];
  const trajectory = { path: [{ x: 480, y: 730 }, { x: 490, y: 730 }, { x: 500, y: 730 }, { x: 530, y: 730 }] };
  assert.equal(clipProjectileAtCrane(game, trajectory).structure, 'supplyCache');
  assert.equal(activateScenarioObjects(game, 500, 730, 5, new Set(), shooter.id).some((item) => item.type === 'supplyCacheOpen'), false);
  const effects = activateScenarioObjects(game, 500, 730, 5, new Set(), shooter.id);
  assert.equal(effects.find((item) => item.type === 'supplyCacheOpen').drops.length, 2);
  assert.equal(game.powerups.filter((item) => item.active && item.revealed).length, 2);
  assert.equal(shooter.stats.destruction, DESTRUCTION_POINTS.supplyCache);
});

test('shock coils stun nearby tanks without carving ground or harming saboteurs', () => {
  const room = match([null, null, 'saboteur']); const game = room.game; const [shooter, target, saboteur] = game.players;
  shooter.x = 100; target.x = 755; saboteur.x = 730;
  game.objects = [{ id: 'test-coil', type: 'shockCoil', x: 700, y: 722, groundY: 760, width: 54, height: 76, durability: 2, active: true }];
  game.terrain.floatingPlatforms = [{ id: 'cover', x: 650, y: 620, width: 150, durability: 100, active: true }];
  const beforeTerrain = game.terrain.heights.slice(); const targetHealth = target.health; const saboteurHealth = saboteur.health;
  activateScenarioObjects(game, 700, 720, 5, new Set(), shooter.id);
  const effects = activateScenarioObjects(game, 700, 720, 5, new Set(), shooter.id);
  assert.ok(effects.some((item) => item.type === 'shockCoilBurst'));
  assert.ok(target.health < targetHealth); assert.ok(target.powerupBlockedTurns > 0);
  assert.equal(saboteur.health, saboteurHealth); assert.equal(saboteur.powerupBlockedTurns, 0);
  assert.deepEqual(game.terrain.heights, beforeTerrain); assert.equal(game.terrain.floatingPlatforms[0].durability, 100);
  assert.equal(shooter.stats.destruction >= DESTRUCTION_POINTS.shockCoil, true);
});
