import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, drainConnectedWater, fire, movePlayer, sanitizeRules, simulateWaterTorpedoes, updateWaterPhysics, usePowerup } from '../server/game.js';
import { WORLD } from '../shared/constants.js';

function aquaticRoom(firstClass = 'armored') {
  const room = { rules: sanitizeRules({ seed: 'aquatic-combat', powerupCount: 0, enabledEvents: [] }), players: [
    { id: 'first', nickname: 'First', classType: firstClass, color: '#67deff' },
    { id: 'second', nickname: 'Second', classType: 'healer', color: '#ff755c' },
  ] };
  room.game = createGame(room); Object.assign(room.game, { phase: 'playing', roundNumber: 2, turnIndex: 0, openingRestrictionsActive: false });
  room.game.terrain.heights.fill(650); room.game.terrain.floatingPlatforms = []; room.game.objects = []; room.game.mines = []; room.game.powerups = [];
  room.game.waterZones = [{ id: 'lake-a', x: 630, radius: 280, surfaceY: 580 }];
  room.game.players[0].x = 540; room.game.players[0].y = 650 - WORLD.tankRadius;
  room.game.players[1].x = 710; room.game.players[1].y = 650 - WORLD.tankRadius;
  return room;
}

test('tanque comum afunda, desloca-se lentamente e a Boia o faz flutuar sem combustível', () => {
  const room = aquaticRoom(); const tank = room.game.players[0];
  updateWaterPhysics(room.game);
  assert.equal(Boolean(tank.swimming), false);
  const x = tank.x; const fuel = tank.fuel;
  movePlayer(room, tank.id, 1, null, { continuous: true });
  assert.ok(tank.x > x && tank.x - x < 12, 'deslocamento submerso é lento');
  assert.ok(tank.fuel < fuel);
  tank.inventory.push('buoy');
  usePowerup(room, tank.id, { type: 'buoy' });
  assert.equal(tank.buoyActive, true);
  assert.equal(tank.swimming, true);
  assert.ok(tank.y < 590);
  tank.lastDriveAt = 0; tank.fuel = 0;
  const afloatX = tank.x;
  movePlayer(room, tank.id, 1, null, { continuous: true });
  assert.ok(tank.x > afloatX);
  assert.equal(tank.fuel, 0);
});

test('W/S move verticalmente na água; Anfíbio mantém profundidade e tanque comum volta a afundar', () => {
  const amphibianRoom = aquaticRoom('amphibian'); const amphibian = amphibianRoom.game.players[0];
  updateWaterPhysics(amphibianRoom.game); const surfaceY = amphibian.y;
  movePlayer(amphibianRoom, amphibian.id, 0, null, { continuous: true, vertical: 1 });
  assert.ok(amphibian.y > surfaceY, 'S mergulha');
  const divingY = amphibian.y;
  updateWaterPhysics(amphibianRoom.game, Date.now() + 120);
  assert.equal(amphibian.y, divingY, 'a flutuação não cancela o mergulho');
  amphibian.lastDriveAt = 0;
  movePlayer(amphibianRoom, amphibian.id, 1, null, { continuous: true });
  assert.ok(amphibian.x > 540 && amphibian.y > surfaceY, 'A/D preserva a profundidade');
  amphibian.lastDriveAt = 0;
  movePlayer(amphibianRoom, amphibian.id, 0, null, { continuous: true, vertical: -1 });
  assert.ok(amphibian.y < divingY, 'W sobe');

  const ordinaryRoom = aquaticRoom(); const ordinary = ordinaryRoom.game.players[0];
  const groundY = ordinary.y;
  movePlayer(ordinaryRoom, ordinary.id, 0, null, { continuous: true, vertical: -1 });
  assert.ok(ordinary.y < groundY, 'tanque comum consegue nadar para cima lentamente');
  updateWaterPhysics(ordinaryRoom.game, Date.now() + 400);
  assert.ok(ordinary.y > groundY - 4, 'sem impulso, ele volta a afundar');
});

test('três torpedos exigem submersão e perseguem o mesmo alvo por 30 HP cada', () => {
  const room = aquaticRoom('healer'); const [source, target] = room.game.players;
  room.game.waterZones[0].fluid = true;
  source.arsenal.push('waterTorpedo'); source.ammo.waterTorpedo = 1;
  assert.equal(simulateWaterTorpedoes(room.game, source).length, 3);
  const shots = fire(room, source.id, { weapon: 'waterTorpedo', angle: 25, direction: 1, power: 300 });
  assert.equal(shots.length, 3);
  assert.ok(shots.every((shot) => shot.targetId === target.id && shot.hit));
  assert.equal(shots.reduce((sum, shot) => sum + shot.damage.reduce((hitSum, hit) => hitSum + hit.amount, 0), 0), 90);
  assert.equal(target.health, target.maxHealth - 90);
  assert.ok(room.game.shotEndsAt > Date.now());
  assert.ok(room.game.waterZones[0].surfaceImpacts?.length >= 1, 'os impactos submersos agitam a água');
});

test('propulsão drena o lago atingido e os lagos conectados, sem drenar o isolado', () => {
  const room = aquaticRoom(); const game = room.game;
  game.waterZones.push({ id: 'lake-b', x: 980, radius: 180, surfaceY: 585 });
  game.waterZones.push({ id: 'lake-c', x: 1650, radius: 140, surfaceY: 590 });
  const count = drainConnectedWater(game, 560, 610, 180, 1000);
  assert.equal(count, 2);
  assert.ok(game.waterZones[0].drainingAt);
  assert.ok(game.waterZones[1].drainingAt);
  assert.equal(game.waterZones[2].drainingAt, undefined);
});

test('jato de baixo para cima lança o inimigo para o alto', () => {
  const room = aquaticRoom('amphibian'); const [source, target] = room.game.players;
  room.game.waterZones = []; source.x = 500; source.y = 620; target.x = 610; target.y = 570; source.facing = 1;
  const [shot] = fire(room, source.id, { weapon: 'waterCannon', angle: 25, direction: 1, power: 300 });
  assert.ok(shot.damage.some((hit) => hit.playerId === target.id));
  assert.ok(target.airborne.vy < -100);
});
