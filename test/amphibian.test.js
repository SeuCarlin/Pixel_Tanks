import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, fire, movePlayer, sanitizeRules, tickRoom, updateWaterPhysics } from '../server/game.js';
import { WORLD } from '../shared/constants.js';
import { tankMotionState, TANK_STATE } from '../shared/tank-states.js';

function roomWithAmphibian() {
  const room = { rules: sanitizeRules({ seed: 'amphibian-test', powerupCount: 0, enabledEvents: [] }), players: [
    { id: 'amphibian', nickname: 'Anfíbio', classType: 'amphibian', color: '#67deff' },
    { id: 'first', nickname: 'Primeiro', classType: 'armored', color: '#ff755c' },
    { id: 'second', nickname: 'Segundo', classType: 'healer', color: '#b7ec58' },
  ] };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.roundNumber = 2; room.game.turnIndex = 0; room.game.openingRestrictionsActive = false;
  room.game.terrain.heights.fill(650); room.game.terrain.floatingPlatforms = []; room.game.objects = []; room.game.mines = []; room.game.powerups = [];
  return room;
}

test('Anfíbio flutua no lago, nada sem a penalidade de tração e cai quando a água drena', () => {
  const room = roomWithAmphibian(); const game = room.game; const player = game.players[0];
  player.x = 600; player.y = 650 - WORLD.tankRadius;
  game.waterZones = [{ id: 'lake-test', x: 600, radius: 220, surfaceY: 580 }];
  updateWaterPhysics(game);
  assert.equal(player.swimming, true);
  assert.equal(tankMotionState(game, player), TANK_STATE.SWIMMING);
  assert.ok(player.y < 590);
  const x = player.x; const fuel = player.fuel;
  movePlayer(room, player.id, 1, null, { continuous: true });
  assert.ok(player.x > x);
  assert.equal(player.fuel, fuel, 'Anfíbio nada sem gastar combustível');
  player.lastDriveAt = 0; player.fuel = 0;
  const freeX = player.x;
  movePlayer(room, player.id, 1, null, { continuous: true });
  assert.ok(player.x > freeX, 'continua nadando sem combustível');
  player.lastDriveAt = 0;
  const freeY = player.y;
  movePlayer(room, player.id, 0, null, { continuous: true, vertical: 1 });
  assert.ok(player.y > freeY, 'também mergulha sem combustível');
  assert.equal(player.fuel, 0);
  game.waterZones = [];
  updateWaterPhysics(game);
  assert.equal(player.swimming, false);
  assert.ok(player.airborne?.falling);
});

test('Canhão de Água atinge dois tanques na reta por 40 HP e lança ambos no ar', () => {
  const room = roomWithAmphibian(); const game = room.game; const player = game.players[0];
  player.x = 600; player.y = 590; player.facing = 1;
  for (const [index, target] of game.players.slice(1).entries()) { target.x = 730 + index * 120; target.y = 583; target.health = 150; target.maxHealth = 150; target.shieldCharges = 0; target.armorAuraActive = false; }
  assert.ok(player.arsenal.includes('waterCannon'));
  const [shot] = fire(room, player.id, { weapon: 'waterCannon', angle: 0, direction: 1, power: 300 });
  assert.equal(shot.damage.length, 2);
  assert.deepEqual(shot.damage.map((entry) => entry.amount), [40, 40]);
  assert.ok(game.players.slice(1).every((target) => target.airborne?.vx > 0));
  assert.ok(game.shotEndsAt > Date.now());
  assert.equal(player.ammo.waterCannon, 0);
});

test('jato contra o chão próximo impulsiona o atirador apenas após o impacto', () => {
  const room = roomWithAmphibian(); const game = room.game; const player = game.players[0];
  player.x = 600; player.y = 650 - WORLD.tankRadius; player.facing = 1;
  for (const target of game.players.slice(1)) { target.x += 1100; target.y = 600; }
  const [shot] = fire(room, player.id, { weapon: 'waterCannon', angle: -65, direction: 1, power: 300 });
  assert.equal(shot.recoilBoost, true);
  assert.equal(shot.impactKind, 'ground');
  assert.equal(player.airborne, null);
  game.pendingWaterCannonBoost.activateAt = Date.now() - 1;
  tickRoom(room);
  assert.ok(player.airborne?.fromWaterCannonRecoil);
  assert.ok(player.airborne.vy < -200);
});
