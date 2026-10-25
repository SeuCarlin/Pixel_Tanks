import assert from 'node:assert/strict';
import test from 'node:test';
import { CLASS_BALANCE, WEAPON_BALANCE, WORLD } from '../shared/constants.js';
import { projectileStructureAt } from '../shared/projectile-obstacles.js';
import { blinkLanding } from '../shared/movement.js';
import { simulateHarpoon } from '../server/physics.js';
import { terrainSolidAt } from '../shared/terrain-solid.js';
import { activateScenarioObjects, createGame, findTeleportLanding, fire, interceptBySpecialistDrone, moveSpecialistDeployable, nextTurn, pulseSpecialistDrones, sanitizeRules, spawnSpecialistDrone } from '../server/game.js';

function specialistRoom() {
  const room = { rules: sanitizeRules({ seed: 'specialist-integration', powerupCount: 0, enabledEvents: [], mapType: 'flat' }), players: [
    { id: 'specialist', nickname: 'Specialist', classType: 'specialist' },
    { id: 'enemy', nickname: 'Enemy', classType: 'healer' },
  ] };
  room.game = createGame(room);
  Object.assign(room.game, { phase: 'playing', objects: [], mines: [], powerups: [], openingRestrictionsActive: false, turnIndex: 0 });
  room.game.terrain.heights.fill(760); room.game.terrain.floatingPlatforms = [];
  room.game.players[0].x = 500; room.game.players[0].y = 760 - WORLD.tankRadius;
  room.game.players[1].x = 850; room.game.players[1].y = 760 - WORLD.tankRadius;
  return room;
}

test('drone bullets open a visible passage through earth before reaching a covered enemy', () => {
  const room = specialistRoom(); const game = room.game; game.roundNumber = 2;
  const owner = game.players[0]; const enemy = game.players[1];
  owner.x = 300; enemy.x = 620; enemy.y = 738;
  game.terrain.heights.fill(650, 480, 520);
  const drone = spawnSpecialistDrone(game, owner);
  drone.x = 410; drone.y = 700; drone.groundY = 716;
  const health = enemy.health;
  const bursts = pulseSpecialistDrones(game);
  const terrainHits = bursts.flatMap((burst) => burst.bullets).filter((bullet) => bullet.type === 'terrain');
  assert.ok(terrainHits.length > 0);
  assert.ok(terrainHits.every((bullet) => bullet.terrainRadius === WEAPON_BALANCE.sentry.terrainRadius));
  assert.equal(terrainSolidAt(game.terrain, terrainHits[0].x, terrainHits[0].y), false);
  const bullets = bursts.flatMap((burst) => burst.bullets);
  assert.equal(bullets[0].type, 'terrain', 'earth stops the first bullet');
  assert.equal(health - enemy.health, bullets.reduce((total, bullet) => total + bullet.amount, 0), 'only bullets that pass the opening may damage the enemy');
});

test('a specialist drone breaks a normal floating deck with one five-bullet burst', () => {
  const room = specialistRoom(); const game = room.game; game.roundNumber = 2;
  const owner = game.players[0]; const enemy = game.players[1];
  owner.x = 300; enemy.x = 620; enemy.y = 738;
  game.terrain.floatingPlatforms = [{ id: 'drone-deck', x: 490, baseX: 490, y: 720, width: 65, height: 15, durability: 100, active: true, moving: false }];
  const drone = spawnSpecialistDrone(game, owner);
  drone.x = 410; drone.y = 700; drone.groundY = 716;
  const bursts = pulseSpecialistDrones(game);
  const bullets = bursts.flatMap((burst) => burst.bullets);
  assert.ok(bullets.some((bullet) => bullet.platformId === 'drone-deck' && bullet.platformDestroyed));
  assert.equal(game.terrain.floatingPlatforms[0].active, false);
});

test('Especialista invoca um drone nas rodadas pares, não o assenta no solo e o drone funciona como estrutura', () => {
  const room = specialistRoom();
  assert.equal(room.game.objects.some((entry) => entry.type === 'specialistDrone'), false);
  nextTurn(room);
  assert.equal(room.game.roundNumber, 1);
  assert.equal(room.game.objects.some((entry) => entry.type === 'specialistDrone'), false);
  nextTurn(room);
  const drone = room.game.objects.find((entry) => entry.type === 'specialistDrone');
  assert.ok(drone);
  assert.equal(room.game.roundNumber, 2);
  assert.equal(drone.durability, CLASS_BALANCE.specialistDurability);
  assert.equal(projectileStructureAt(room.game.objects, drone.x, drone.y)?.id, drone.id);
  assert.ok(drone.y < 760 - 50);
});

test('drones coordenam o alvo, atingem vários inimigos e respeitam pane Tesla', () => {
  const room = specialistRoom(); const game = room.game; const owner = game.players[0];
  game.roundNumber = 2;
  const first = spawnSpecialistDrone(game, owner);
  const second = spawnSpecialistDrone(game, owner);
  first.x = 600; first.y = 610; first.groundY = 626;
  second.x = 590; second.y = 510; second.groundY = 526;
  game.players[1].x = 850; game.players[1].y = 610;
  const extra = { ...game.players[1], id: 'extra', x: 820, y: 675, health: 150, maxHealth: 150, stats: { damage: 0, shots: 0, destruction: 0, destroyed: {} } };
  game.players.push(extra);
  const bursts = pulseSpecialistDrones(game);
  assert.ok(bursts.length >= 2);
  assert.equal(bursts[0].targetId, 'extra');
  assert.equal(bursts.find((burst) => burst.sentryId === second.id)?.targetId, 'extra');
  assert.ok(game.players[1].health < 150);
  assert.ok(extra.health < 150);
  first.disabledUntilRound = 3; second.disabledUntilRound = 3; game.roundNumber = 3;
  assert.equal(pulseSpecialistDrones(game).length, 0);
});

test('Especialista reposiciona invocações de qualquer tanque no raio e apenas uma vez por turno', () => {
  const room = specialistRoom(); const game = room.game;
  const sentry = { id: 'foreign-sentry', type: 'sentry', x: 650, y: 738, groundY: 760, width: 34, height: 44, durability: 3, active: true, ownerId: 'enemy' };
  game.objects.push(sentry);
  moveSpecialistDeployable(room, 'specialist', { objectId: sentry.id, x: 700, y: 753 });
  assert.equal(sentry.ownerId, 'enemy');
  assert.equal(sentry.x, 700);
  assert.equal(sentry.groundY, 760);
  assert.throws(() => moveSpecialistDeployable(room, 'specialist', { objectId: sentry.id, x: 730, y: 753 }), /já foi reposicionada/);
  const drone = spawnSpecialistDrone(game, game.players[0]);
  moveSpecialistDeployable(room, 'specialist', { objectId: drone.id, x: 720, y: 520 });
  assert.equal(drone.x, 720);
  assert.equal(drone.y, 520);
  assert.throws(() => moveSpecialistDeployable(room, 'enemy', { objectId: drone.id, x: 750, y: 520 }), /Somente o Especialista/);
});

test('arpão, Blink e teleporte encontram o drone como âncora aérea, que pode ser destruída', () => {
  const room = specialistRoom(); const game = room.game; game.roundNumber = 2;
  const drone = spawnSpecialistDrone(game, game.players[0]);
  drone.x = 700; drone.y = 540; drone.groundY = 556;
  const hook = simulateHarpoon({ terrain: game.terrain, objects: game.objects, players: [], x: 500, y: 540, angle: 0, direction: 1 });
  assert.equal(hook.impact.objectId, drone.id);
  const landing = findTeleportLanding(game, hook.impact);
  assert.equal(landing.supportObjectId, drone.id);
  assert.ok(landing.y < drone.y);
  const blink = blinkLanding(game.terrain, game.players, game.players[0], drone.x, 270, game.objects, drone.y);
  assert.equal(blink.landing.supportObjectId, drone.id);
  activateScenarioObjects(game, drone.x, drone.y, 0, new Set(), 'enemy');
  assert.equal(drone.active, false);
  assert.equal(projectileStructureAt(game.objects, drone.x, drone.y), null);
  assert.equal(findTeleportLanding(game, hook.impact), null);
});

function guardedShot(game) {
  const owner = game.players[0];
  const path = Array.from({ length: 151 }, (_, index) => ({ x: 100 + index * 4, y: owner.y }));
  return { path, impact: { x: owner.x, y: owner.y, playerId: owner.id, hitZone: 'center' }, collectedPowerupIds: [] };
}

test('drone se sacrifica antes de um tiro dirigido ao Especialista, com chance de cerca de 70%', () => {
  let interceptions = 0;
  for (let index = 0; index < 100; index += 1) {
    const room = specialistRoom(); const game = room.game;
    game.seed = `drone-guard-${index}`; game.roundNumber = 2; game.turnNumber = 3;
    game.terrain.heights.fill(980);
    const owner = game.players[0]; const shooter = game.players[1];
    owner.x = 700; owner.y = 500; shooter.x = 100; shooter.y = 500;
    const drone = spawnSpecialistDrone(game, owner);
    const result = guardedShot(game);
    const originalLength = result.path.length;
    const blocker = interceptBySpecialistDrone(game, shooter, result);
    if (!blocker) { assert.equal(drone.active, true); assert.equal(result.path.length, originalLength); continue; }
    interceptions += 1;
    assert.equal(blocker.id, drone.id);
    assert.equal(drone.active, false);
    assert.equal(drone.durability, 0);
    assert.equal(result.impact.structureId, drone.id);
    assert.equal(result.impact.playerId, undefined);
    assert.ok(result.path.length < originalLength);
    assert.ok(Math.hypot(result.impact.x - owner.x, result.impact.y - owner.y) >= 75);
    assert.equal(result.droneIntercept.fromX, 778);
  }
  assert.ok(interceptions >= 58 && interceptions <= 82, `interceptou ${interceptions}/100`);
});

test('drone em pane, distante ou aliado ao atirador não intercepta', () => {
  const room = specialistRoom(); const game = room.game;
  game.roundNumber = 2; game.terrain.heights.fill(980);
  const owner = game.players[0]; const shooter = game.players[1];
  owner.x = 700; owner.y = 500; shooter.x = 100; shooter.y = 500;
  const drone = spawnSpecialistDrone(game, owner);
  drone.disabledUntilRound = 2;
  assert.equal(interceptBySpecialistDrone(game, shooter, guardedShot(game)), null);
  drone.disabledUntilRound = 0; drone.x = 1100;
  assert.equal(interceptBySpecialistDrone(game, shooter, guardedShot(game)), null);
  drone.x = 778; game.mode = 'teams'; shooter.team = owner.team = 'team-1';
  assert.equal(interceptBySpecialistDrone(game, shooter, guardedShot(game)), null);
});

test('cada drone próximo faz uma tentativa própria de 70% para proteger o dono', () => {
  let secondSavedOwner = false;
  for (let index = 0; index < 30 && !secondSavedOwner; index += 1) {
    const room = specialistRoom(); const game = room.game;
    game.seed = `two-guards-${index}`; game.roundNumber = 2; game.terrain.heights.fill(980);
    const owner = game.players[0]; const shooter = game.players[1];
    owner.x = 700; owner.y = 500; shooter.x = 100; shooter.y = 500;
    const first = spawnSpecialistDrone(game, owner); const second = spawnSpecialistDrone(game, owner);
    second.active = false;
    if (interceptBySpecialistDrone(game, shooter, guardedShot(game))) continue;
    second.active = true;
    const result = guardedShot(game);
    const interceptor = interceptBySpecialistDrone(game, shooter, result);
    if (interceptor?.id === second.id) { secondSavedOwner = true; assert.equal(first.active, true); assert.equal(second.active, false); }
  }
  assert.equal(secondSavedOwner, true);
});

test('disparo real é interrompido pelo drone e não causa acerto direto no dono', () => {
  let intercepted = false;
  for (let index = 0; index < 12 && !intercepted; index += 1) {
    const room = specialistRoom(); const game = room.game;
    game.seed = `live-guard-${index}`; game.roundNumber = 2; game.turnNumber = 3; game.turnIndex = 1; game.wind = 0;
    game.terrain.heights.fill(980); room.rules.gravity = 0;
    const owner = game.players[0]; const shooter = game.players[1];
    owner.x = 700; owner.y = 448; shooter.x = 100; shooter.y = 500; shooter.facing = 1;
    const drone = spawnSpecialistDrone(game, owner);
    const startingHealth = owner.health;
    const result = fire(room, shooter.id, { angle: 5, power: 580, direction: 1, weapon: 'standard' })[0];
    assert.ok(result.impact);
    if (!result.droneIntercept) continue;
    intercepted = true;
    assert.equal(result.impact.structureId, drone.id);
    assert.equal(drone.active, false);
    assert.equal(owner.health, startingHealth);
    assert.ok(!result.damage.some((hit) => hit.playerId === owner.id && hit.amount > 0));
  }
  assert.equal(intercepted, true, 'um dos tiros deve ser interceptado');
});
