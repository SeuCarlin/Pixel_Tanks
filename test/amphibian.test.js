import test from 'node:test';
import assert from 'node:assert/strict';
import { aquaticHunterPath, createGame, fire, movePlayer, sanitizeRules, tickRoom, updateWaterCannonStreams, updateWaterPhysics } from '../server/game.js';
import { WEAPON_BALANCE, WORLD } from '../shared/constants.js';
import { tankMotionState, TANK_STATE } from '../shared/tank-states.js';

function roomWithAmphibian() {
  const room = { rules: sanitizeRules({ seed: 'amphibian-test', powerupCount: 0, enabledEvents: [] }), players: [
    { id: 'amphibian', nickname: 'Anfíbio', classType: 'amphibian', color: '#67deff' },
    { id: 'first', nickname: 'Primeiro', classType: 'armored', color: '#ff755c' },
    { id: 'second', nickname: 'Segundo', classType: 'healer', color: '#b7ec58' },
  ] };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.roundNumber = 2; room.game.turnIndex = 0; room.game.openingRestrictionsActive = false;
  room.game.terrain.heights.fill(650); room.game.terrain.floatingPlatforms = []; room.game.objects = []; room.game.mines = []; room.game.powerups = [];
  for (const player of room.game.players) { player.supportPlatformId = null; player.platformOffset = null; }
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
  assert.equal(shot.durationMs, WEAPON_BALANCE.waterCannon.durationMs);
  const stream = game.waterCannonStreams[0];
  assert.ok(stream);
  const speedBefore = game.players[1].airborne.vx;
  updateWaterCannonStreams(game, stream.startedAt + 300);
  assert.ok(game.players[1].airborne.vx > speedBefore, 'o jato continua empurrando durante a emissão');
  updateWaterCannonStreams(game, stream.endsAt + 1);
  assert.equal(game.waterCannonStreams.length, 0);
});

test('a continuous water jet quenches ground fire, a tree and a platform along its path', () => {
  const room = roomWithAmphibian(); const game = room.game; const player = game.players[0];
  player.x = 600; player.y = 590; player.facing = 1;
  for (const target of game.players.slice(1)) { target.x = 2600; target.y = 600; }
  fire(room, player.id, { weapon: 'waterCannon', angle: 0, direction: 1, power: 300 });
  game.fireZones = [{ id: 'wet-fire', source: 'molotov', x: 750, y: 583, radius: 70, turnsLeft: 3 }];
  game.objects = [{ id: 'wet-tree', type: 'tree', x: 780, groundY: 650, height: 120, width: 34, active: true, burningUntilRound: 5 }];
  game.terrain.floatingPlatforms = [{ id: 'wet-platform', x: 800, y: 583, width: 100, height: 8, active: true, burningUntilRound: 5 }];
  const stream = game.waterCannonStreams[0];
  updateWaterCannonStreams(game, stream.startedAt + 300);
  assert.equal(game.fireZones.length, 0);
  assert.equal(game.objects[0].burningUntilRound, 0);
  assert.equal(game.terrain.floatingPlatforms[0].burningUntilRound, 0);
});

test('water cannon keeps its two-second emission even in a fast match', () => {
  const room = roomWithAmphibian(); room.rules.gameSpeed = 2;
  const player = room.game.players[0]; player.x = 600; player.y = 590; player.facing = 1;
  for (const target of room.game.players.slice(1)) { target.x = 2600; target.y = 600; }
  const [shot] = fire(room, player.id, { weapon: 'waterCannon', angle: 0, direction: 1, power: 300 });
  assert.equal(shot.durationMs, 2000);
  assert.equal(room.game.waterCannonStreams[0].endsAt - room.game.waterCannonStreams[0].startedAt, 2000);
});

test('a tank entering the active water jet is hit once and then continuously pushed', () => {
  const room = roomWithAmphibian(); const game = room.game; const player = game.players[0]; const target = game.players[1];
  player.x = 600; player.y = 590; player.facing = 1;
  target.x = 750; target.y = 500; target.health = 150; target.shieldCharges = 0;
  game.players[2].x = 2600; game.players[2].y = 600;
  const [shot] = fire(room, player.id, { weapon: 'waterCannon', angle: 0, direction: 1, power: 300 });
  assert.equal(shot.damage.length, 0);
  target.y = 583;
  const stream = game.waterCannonStreams[0];
  updateWaterCannonStreams(game, stream.startedAt + 300);
  assert.equal(target.health, 110);
  assert.ok(target.airborne?.vx > 0);
  assert.equal(game.lastWaterCannonHits[0].amount, 40);
  const speed = target.airborne.vx;
  updateWaterCannonStreams(game, stream.startedAt + 420);
  assert.equal(target.health, 110, 'the same jet cannot damage one tank twice');
  assert.ok(target.airborne.vx > speed);
});

test('Caçador Aquático patrulha o lago, vira nas margens e morde tanques na beira', () => {
  const room = roomWithAmphibian(); const game = room.game; const owner = game.players[0]; const target = game.players[1];
  game.waterZones = [{ id: 'shark-lake', x: 700, radius: 360, surfaceY: 580 }]; owner.x = 430; owner.y = 610;
  target.x = 965; target.y = 580 - WORLD.tankRadius; game.players[2].alive = false;
  const hunt = aquaticHunterPath(game, owner, { x: 470, y: 610 });
  assert.ok(hunt.path.filter((point) => point.sharkPatrol).length > 20, 'o tubarão deve nadar antes de atacar');
  assert.equal(hunt.targetId, target.id); assert.equal(hunt.bite, true); assert.ok(hunt.path.some((point) => point.sharkCharge));
  target.alive = false;
  const patrol = aquaticHunterPath(game, owner, { x: 700, y: 610 });
  assert.equal(patrol.targetId, null); assert.ok(new Set(patrol.path.map((point) => point.direction)).size > 1, 'a patrulha deve virar ao alcançar as margens');
});

test('water jet force and extinguishing stop at the first solid structure', () => {
  const room = roomWithAmphibian(); const game = room.game; const player = game.players[0]; const target = game.players[1];
  player.x = 600; player.y = 590; player.facing = 1;
  target.x = 800; target.y = 583; target.health = 150; target.shieldCharges = 0;
  game.players[2].x = 2600; game.players[2].y = 600;
  game.objects = [{ id: 'water-wall', type: 'building', x: 700, groundY: 650, height: 120, width: 60, durability: 3, active: true }];
  const [shot] = fire(room, player.id, { weapon: 'waterCannon', angle: 0, direction: 1, power: 300 });
  assert.ok(shot.impact.x < target.x - 40);
  game.fireZones = [{ id: 'behind-wall', source: 'molotov', x: 800, y: 583, radius: 50, turnsLeft: 3 }];
  const stream = game.waterCannonStreams[0];
  updateWaterCannonStreams(game, stream.startedAt + 300);
  assert.equal(target.health, 150);
  assert.equal(target.airborne, null);
  assert.equal(game.fireZones.length, 1);
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
