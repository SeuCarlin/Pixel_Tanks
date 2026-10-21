import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, fire, movePlayer, sanitizeRules, tickRoom, updateMovingPlatforms, updateWaterPhysics } from '../server/game.js';
import { WORLD } from '../shared/constants.js';

function roomAtLake() {
  const room = { rules: sanitizeRules({ seed: 'mine-swim-regression', powerupCount: 0, enabledEvents: [] }), players: [
    { id: 'amphibian', nickname: 'Anfíbio', classType: 'amphibian' },
    { id: 'target', nickname: 'Alvo', classType: 'healer' },
  ] };
  room.game = createGame(room);
  Object.assign(room.game, { phase: 'playing', roundNumber: 2, turnIndex: 0, openingRestrictionsActive: false });
  room.game.terrain.heights.fill(650); room.game.terrain.floatingPlatforms = [];
  room.game.objects = []; room.game.mines = []; room.game.powerups = [];
  room.game.waterZones = [{ id: 'lake', x: 590, radius: 260, surfaceY: 580 }];
  room.game.players[0].x = 500; room.game.players[0].y = 650 - WORLD.tankRadius;
  room.game.players[1].x = 720; room.game.players[1].y = 650 - WORLD.tankRadius;
  return room;
}

test('mina aquática lançada em terra fica inativa; quica, rola e causa 40 sem explosão', () => {
  const room = roomAtLake(); const game = room.game; game.waterZones = [];
  const source = game.players[0]; source.arsenal.push('waterMine'); source.ammo.waterMine = 1;
  const [shot] = fire(room, source.id, { weapon: 'waterMine', angle: 65, direction: 1, power: 230 });
  assert.ok(shot.impact);
  const mine = game.mines[0]; assert.ok(mine);
  assert.equal(mine.armed, false);
  assert.equal(game.mineDetonations.length, 0);
  const y = mine.y; mine.lastPhysicsAt = Date.now() - 70;
  updateWaterPhysics(game);
  assert.ok(mine.y < y || mine.vy !== 0, 'a mina ricocheteia em vez de ficar presa ao chão');
  const target = game.players[1]; target.x = mine.x + 12; target.y = mine.y;
  const health = target.health;
  mine.lastPhysicsAt = Date.now() - 70; updateWaterPhysics(game);
  assert.equal(target.health, health - 40);
  assert.equal(mine.active, true); assert.equal(mine.armed, false);
  assert.equal(game.mineDetonations.length, 0);
});

test('mina só arma ao tocar água; flutua e explode ao tocar estrutura', () => {
  const room = roomAtLake(); const game = room.game; const now = Date.now();
  const mine = { id: 'water-test', aquatic: true, active: true, armed: false, ownerId: 'amphibian', x: 610, y: 555, vx: 0, vy: 90, lastPhysicsAt: now - 70 };
  game.mines.push(mine);
  updateWaterPhysics(game, now);
  assert.equal(mine.armed, false);
  mine.y = 570; mine.lastPhysicsAt = now - 70;
  updateWaterPhysics(game, now);
  assert.equal(mine.armed, true); assert.equal(mine.y, 588);
  game.objects.push({ id: 'wall-test', type: 'building', x: 635, groundY: 615, width: 20, height: 70, durability: 100, active: true });
  mine.lastPhysicsAt = now + 370;
  updateWaterPhysics(game, now + 380);
  assert.equal(mine.active, false);
  assert.equal(game.mineDetonations.length, 1);
});

test('mina aquática cai de plataforma destruída em vez de desaparecer', () => {
  const room = roomAtLake(); const game = room.game; const now = Date.now();
  game.terrain.floatingPlatforms = [{ id: 'raft', x: 570, y: 520, width: 100, height: 10, active: true }];
  const mine = { id: 'falling-mine', aquatic: true, armed: false, active: true, ownerId: 'amphibian', x: 610, y: 503, vx: 0, vy: 0, supportPlatformId: 'raft', platformOffset: 40, lastPhysicsAt: now };
  game.mines.push(mine);
  updateMovingPlatforms(game, now);
  assert.equal(mine.y, 503);
  game.terrain.floatingPlatforms[0].active = false;
  updateMovingPlatforms(game, now);
  assert.equal(mine.active, true); assert.equal(mine.supportPlatformId, null);
  for (let step = 1; step < 45 && !mine.armed; step += 1) updateWaterPhysics(game, now + step * 80);
  assert.equal(mine.armed, true);
  assert.equal(mine.active, true);
});

test('mina armada detona ao tocar tanque ou parede da margem', () => {
  for (const contact of ['tank', 'wall']) {
    const room = roomAtLake(); const game = room.game; const now = Date.now();
    const mine = { id: `armed-${contact}`, aquatic: true, armed: true, active: true, ownerId: 'amphibian', x: 610, y: 588, vx: 0, vy: 0, armedAt: now - 600, lastPhysicsAt: now - 60 };
    game.mines.push(mine);
    if (contact === 'tank') { game.players[1].x = 632; game.players[1].y = 588; }
    else for (let x = 628; x <= 640; x += 1) game.terrain.heights[x] = 550;
    updateWaterPhysics(game, now);
    assert.equal(mine.active, false, contact);
    assert.equal(game.mineDetonations.length, 1, contact);
  }
});

test('queda em água não causa dano e subida rápida do Anfíbio gera salto curto', () => {
  const room = roomAtLake(); const game = room.game; const amphibian = game.players[0];
  amphibian.y = 300; amphibian.airborne = { vx: 0, vy: 280, startY: 300, minY: 300, falling: true, updatedAt: Date.now() - 350 };
  const health = amphibian.health;
  for (let step = 0; step < 35 && amphibian.airborne; step += 1) { amphibian.airborne.updatedAt = Date.now() - 350; tickRoom(room); }
  assert.equal(amphibian.airborne, null);
  assert.equal(amphibian.health, health);
  assert.equal(amphibian.lastLanding?.water, true);
  assert.equal(amphibian.lastLanding?.damage, 0);
  game.arenaWarningUntil = null; game.pendingArenaEvent = null; game.shotEndsAt = null; game.turnIndex = 0;
  amphibian.y = 622; amphibian.swimming = true; amphibian.swimDepth = 622 - (580 - WORLD.tankRadius * .45);
  for (let step = 0; step < 20 && !amphibian.airborne; step += 1) {
    amphibian.lastDriveAt = 0;
    movePlayer(room, amphibian.id, 0, null, { continuous: true, vertical: -1 });
  }
  assert.ok(amphibian.airborne?.fromSwimLeap);
  assert.ok(amphibian.airborne.vy < 0);
  assert.ok(amphibian.lastSwimLeap?.serial);
});

test('tanque comum também não sofre dano de queda quando pousa submerso', () => {
  const room = roomAtLake(); const game = room.game; const tank = game.players[1];
  tank.x = 700; tank.y = 290;
  tank.airborne = { vx: 0, vy: 290, startY: 290, minY: 290, falling: true, updatedAt: Date.now() - 350 };
  const health = tank.health;
  for (let step = 0; step < 35 && tank.airborne; step += 1) { tank.airborne.updatedAt = Date.now() - 350; tickRoom(room); }
  assert.equal(tank.airborne, null);
  assert.equal(tank.lastLanding?.water, true);
  assert.equal(tank.lastLanding?.damage, 0);
  assert.equal(tank.health, health);
});
