import test from 'node:test';
import assert from 'node:assert/strict';
import { activateScenarioObjects, clipProjectileAtCrane, createGame, fire, movePlayer, nextTurn, sanitizeRules, selectPowerup, useArsenal, usePowerup } from '../server/game.js';
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
  const weather = match(['meteorologist', null]); assert.ok(!weather.game.players[0].arsenal.includes('lightningRod'));
  advanceRound(weather);
  assert.equal(weather.game.roundNumber, 2); assert.ok(weather.game.players[0].arsenal.includes('lightningRod')); assert.equal(weather.game.players[0].ammo.lightningRod, 1);
  weather.game.players[0].ammo.lightningRod = 0;
  advanceRound(weather); advanceRound(weather); advanceRound(weather);
  assert.ok(weather.game.players[0].ammo.lightningRod >= 1);

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

test('Saboteur pulse reaches 760 blocks, reports its visual wave and spares distant tanks', () => {
  const room = match(['saboteur', null, null]); const [saboteur, inRange, outOfRange] = room.game.players;
  saboteur.x = 300; inRange.x = 1000; outOfRange.x = 1100;
  advanceRound(room); advanceRound(room);
  assert.equal(room.game.roundNumber, 3);
  assert.equal(CLASS_BALANCE.saboteurPulseRadius, 760);
  assert.equal(inRange.powerupBlockedTurns, 1);
  assert.equal(outOfRange.powerupBlockedTurns, 0);
  assert.deepEqual(room.game.lastSaboteurPulses[0].targetIds, [inRange.id]);
  assert.equal(room.game.lastSaboteurPulses[0].radius, 760);
});

test('Tesla reaches distant enemies and leaves their next turn for ordinary movement only', () => {
  const room = match(['saboteur', 'healer', null]); const [shooter, target, far] = room.game.players;
  shooter.x = 100; target.x = 350; far.x = 1000; target.health = target.maxHealth - 40;
  shooter.arsenal.push('teslaOrb'); shooter.ammo.teslaOrb = 1;
  const shots = fire(room, shooter.id, { weapon: 'teslaOrb', angle: 20, power: 150, direction: 1 });
  assert.ok(shots.flatMap((shot) => shot.interactions).some((effect) => effect.type === 'teslaField'));
  assert.equal(target.teslaDisabledTurns, 1); assert.equal(far.teslaDisabledTurns, 0);
  const disabledHealth = target.health;
  room.game.shotEndsAt = null; nextTurn(room);
  assert.equal(room.game.players[room.game.turnIndex].id, target.id);
  assert.equal(room.game.actions.attackAvailable, false);
  assert.equal(target.health, disabledHealth, 'a passiva do Curandeiro não deve curar durante a pane');
  assert.throws(() => fire(room, target.id, { weapon: 'standard', angle: 20, power: 150 }), /Tesla/);
  assert.throws(() => useArsenal(room, target.id, { type: 'jump' }), /Tesla/);
  assert.throws(() => selectPowerup(room, target.id, 'heal'), /Tesla/);
  assert.throws(() => usePowerup(room, target.id, { type: 'teleport', x: 420 }), /Tesla/);
  assert.throws(() => movePlayer(room, target.id, 1, 'spider'), /Tesla/);
  const x = target.x; movePlayer(room, target.id, 1); assert.notEqual(target.x, x);
  nextTurn(room); assert.equal(target.teslaDisabledTurns, 0);
});

test('thrown Haste remains a destructible event anchor and zaps enemies for 10 per turn', () => {
  const room = match(['meteorologist', null, null]); const [owner, target] = room.game.players;
  owner.x = 100; target.x = 1150; assert.throws(() => fire(room, owner.id, { weapon: 'lightningRod', angle: 20, power: 150, direction: 1 }), /indisponível/);
  advanceRound(room); assert.equal(room.game.roundNumber, 2); room.game.arenaWarningUntil = 0; room.game.arenaEventReadyAt = 0;
  const shots = fire(room, owner.id, { weapon: 'lightningRod', angle: 20, power: 150, direction: 1 });
  assert.ok(shots.flatMap((shot) => shot.interactions).some((effect) => effect.type === 'lightningRod'));
  const rod = room.game.objects.find((object) => object.type === 'lightningRod'); assert.ok(rod?.active);
  assert.equal(rod.durability, 3); assert.equal(rod.ownerId, owner.id);
  target.x = rod.x + 80; target.y = rod.groundY - 9; const before = target.health;
  room.game.shotEndsAt = null; nextTurn(room);
  assert.equal(target.health, before - 10); assert.equal(room.game.lastRodPulse.arcs[0].amount, 10);
  room.game.roundNumber = 6; assert.equal(rod.active, true);
  for (let hit = 0; hit < 3; hit += 1) activateScenarioObjects(room.game, rod.x, rod.y, 6, new Set(), target.id);
  assert.equal(rod.active, false);
  assert.equal(target.stats.destruction, DESTRUCTION_POINTS.lightningRod);
});

test('Meteorologist combines Haste with double shot and impact expander', () => {
  const room = match(['meteorologist', null]); const [owner, target] = room.game.players;
  advanceRound(room); room.game.arenaWarningUntil = 0; room.game.arenaEventReadyAt = 0;
  owner.x = 100; target.x = 1400;
  owner.inventory.push('doubleShot', 'bigExplosion');
  selectPowerup(room, owner.id, 'doubleShot'); selectPowerup(room, owner.id, 'bigExplosion');
  const shots = fire(room, owner.id, { weapon: 'lightningRod', angle: 25, power: 200, direction: 1 });
  assert.equal(shots.length, 2);
  assert.ok(shots.every((shot) => shot.combo.includes('doubleShot') && shot.combo.includes('bigExplosion')));
  const rods = room.game.objects.filter((object) => object.type === 'lightningRod');
  assert.equal(rods.length, 2); assert.ok(rods.every((rod) => rod.zapRadius > 360));
  assert.ok(!owner.inventory.includes('doubleShot') && !owner.inventory.includes('bigExplosion'));
});

test('Backpacker attracts revealed pickups at a distance and shares them with teammates', () => {
  const room = match(['backpacker', null, null], { gameMode: 'teams', teamCount: 2 }); const [carrier, , ally] = room.game.players;
  carrier.x = 400; carrier.y = 751; ally.x = 460; ally.ammo.heavy = 0;
  room.game.powerups = [{ id: 'magnet-item', type: 'heavy', x: 580, y: 740, active: true, revealed: true }];
  room.game.turnIndex = 2; nextTurn(room);
  assert.equal(room.game.powerups[0].active, false); assert.equal(ally.ammo.heavy, 1);
  assert.equal(room.game.pickupAttractions.at(-1).playerId, carrier.id);
  const nextItem = { id: 'blocked-item', type: 'heavy', x: 580, y: 740, active: true, revealed: true };
  room.game.powerups.push(nextItem); carrier.teslaDisabledTurns = 1; room.game.turnIndex = 2; nextTurn(room);
  assert.equal(nextItem.active, true);
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
