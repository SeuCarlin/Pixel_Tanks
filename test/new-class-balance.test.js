import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, fire, nextTurn, sanitizeRules, spawnSpecialistDrone, updateWaterPhysics } from '../server/game.js';
import { CLASS_BALANCE, CLASS_DEFS, WORLD } from '../shared/constants.js';
import { mapWidthForPlayers } from '../shared/map-layout.js';

function match(classType, mapType = 'flat') {
  const room = { rules: sanitizeRules({ seed: `balance-${classType}`, mapType, classesEnabled: true, enabledEvents: [], powerupCount: 0, mines: false }), players: [
    { id: 'one', nickname: 'One', classType, arsenal: ['heavy', 'jump', 'zeus'], connected: true },
    { id: 'two', nickname: 'Two', classType: 'armored', arsenal: ['heavy', 'jump', 'zeus'], connected: true },
  ] };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.roundNumber = 2; room.game.openingRestrictionsActive = false;
  room.game.objects = []; room.game.powerups = []; room.game.mines = []; room.game.terrain.floatingPlatforms = [];
  return room;
}

test('Anfíbio regenera só na água e nunca acima da vida máxima', () => {
  const room = match('amphibian'); const [player] = room.game.players;
  room.game.terrain.heights.fill(650); player.x = 600; player.y = 650 - WORLD.tankRadius;
  room.game.waterZones = [{ id: 'lake', x: 600, radius: 220, surfaceY: 580 }];
  updateWaterPhysics(room.game); player.health = player.maxHealth - 6;
  nextTurn(room); nextTurn(room);
  assert.equal(player.health, player.maxHealth);
  assert.ok(room.game.lastClassPulses.some((pulse) => pulse.type === 'amphibian' && pulse.heals[0].amount === 6));
  room.game.waterZones = []; updateWaterPhysics(room.game); player.health -= 20;
  nextTurn(room); nextTurn(room);
  assert.equal(player.health, player.maxHealth - 20);
});

test('Especialista mantém no máximo três drones de um tiro', () => {
  const room = match('specialist'); const [player] = room.game.players;
  player.x = 900; player.y = 590;
  for (let index = 0; index < CLASS_BALANCE.specialistMaxDrones; index += 1) assert.ok(spawnSpecialistDrone(room.game, player));
  assert.equal(spawnSpecialistDrone(room.game, player), null);
  const drones = room.game.objects.filter((object) => object.type === 'specialistDrone' && object.active);
  assert.equal(drones.length, 3);
  assert.ok(drones.every((drone) => drone.durability === 1));
});

test('Incendiário lança três labaredas em cada tiro com alcance e dano controlados', () => {
  const room = match('incendiary'); const [shooter, target] = room.game.players;
  room.game.terrain.heights.fill(760); shooter.x = 200; shooter.y = 751; shooter.facing = 1;
  target.x = 350; target.y = 735; target.health = target.maxHealth = 500;
  const [shot] = fire(room, shooter.id, { weapon: 'standard', angle: 5, power: 240, direction: 1 });
  const volley = shot.incendiaryVolley;
  assert.equal(volley.rays.length, 3);
  assert.ok(volley.rays.every((ray) => ray.length > 1 && Math.hypot(ray.at(-1).x - volley.origin.x, ray.at(-1).y - volley.origin.y) <= CLASS_BALANCE.incendiaryFlameRange + 1));
  assert.ok(volley.hits.length >= 1);
  assert.ok(volley.hits.reduce((sum, hit) => sum + hit.amount, 0) <= CLASS_BALANCE.incendiaryFlameDamage * 3);
});

test('Engenheiro saiu do catálogo; duelos recebem arena menor e arquipélago com água', () => {
  assert.equal(CLASS_DEFS.engineer, undefined);
  assert.ok(mapWidthForPlayers(2) < mapWidthForPlayers(10));
  const room = match('amphibian', 'archipelago');
  assert.equal(room.game.terrain.arenaWidth, mapWidthForPlayers(2));
  assert.ok(room.game.waterZones.length >= 2);
  assert.ok(room.game.waterZones.every((zone) => zone.x < room.game.terrain.arenaWidth));
});
