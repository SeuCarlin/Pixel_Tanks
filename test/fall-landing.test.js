import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame, sanitizeRules, tickRoom } from '../server/game.js';
import { WORLD } from '../shared/constants.js';

function fallingRoom(classType, platform = false) {
  const room = { rules: sanitizeRules({ seed: `fall-${classType}-${platform}`, powerupCount: 0, enabledEvents: [], classesEnabled: true }), players: [
    { id: 'falling', nickname: 'Queda', classType, arsenal: [] },
    { id: 'other', nickname: 'Outro', classType: 'healer', arsenal: [] },
  ] };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.terrain.heights.fill(720);
  room.game.terrain.floatingPlatforms = platform ? [{ id: 'landing', x: 120, y: 500, width: 130, height: 12, durability: 200, active: true }] : [];
  room.game.objects = []; room.game.mines = []; room.game.powerups = []; room.game.wind = 0;
  const tank = room.game.players[0]; tank.x = 180; tank.y = 280; tank.health = tank.maxHealth;
  tank.airborne = { vx: 0, vy: 10, startY: tank.y, minY: tank.y, falling: true, parachute: false, updatedAt: Date.now() - 350 };
  return { room, tank };
}

function land(room, tank) {
  for (let step = 0; step < 60 && tank.airborne; step += 1) { tank.airborne.updatedAt = Date.now() - 350; tickRoom(room); }
  assert.equal(tank.airborne, null, 'o tanque deve pousar');
  return tank.lastLanding;
}

test('pouso no solo aplica dano de queda uma vez, com proteção da classe', () => {
  const armored = fallingRoom('armored'); const attacker = fallingRoom('attacker');
  const armoredLanding = land(armored.room, armored.tank);
  const attackerLanding = land(attacker.room, attacker.tank);
  assert.ok(attackerLanding.damage > armoredLanding.damage > 0);
  assert.equal(attacker.tank.health, attacker.tank.maxHealth - attackerLanding.damage);
  const health = attacker.tank.health;
  tickRoom(attacker.room);
  assert.equal(attacker.tank.health, health, 'sem dano repetido após aterrissar');
});

test('plataforma também causa dano apenas após contato real', () => {
  const { room, tank } = fallingRoom('ninja', true);
  assert.equal(tank.lastLanding, undefined);
  const landing = land(room, tank);
  assert.equal(tank.supportPlatformId, 'landing');
  assert.equal(tank.y, 500 - WORLD.tankRadius);
  assert.ok(landing.damage > 0);
  assert.ok(landing.distance >= 180 && landing.distance <= 230);
});

test('queda fatal elimina no contato e registra a lápide', () => {
  const { room, tank } = fallingRoom('attacker');
  tank.health = 15;
  const landing = land(room, tank);
  assert.ok(landing.damage > 15);
  assert.equal(tank.alive, false);
  assert.equal(tank.health, 0);
  assert.ok(room.game.graves.some((grave) => grave.playerId === tank.id));
});
