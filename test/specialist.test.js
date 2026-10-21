import assert from 'node:assert/strict';
import test from 'node:test';
import { CLASS_BALANCE, WORLD } from '../shared/constants.js';
import { projectileStructureAt } from '../shared/projectile-obstacles.js';
import { blinkLanding } from '../shared/movement.js';
import { simulateHarpoon } from '../server/physics.js';
import { activateScenarioObjects, createGame, findTeleportLanding, moveSpecialistDeployable, nextTurn, pulseSpecialistDrones, sanitizeRules, spawnSpecialistDrone } from '../server/game.js';

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
