import test from 'node:test';
import assert from 'node:assert/strict';
import { activateHarpoon, createGame, movePlayer, sanitizeRules, tickRoom } from '../server/game.js';
import { settlePlayers } from '../server/physics.js';
import { WORLD } from '../shared/constants.js';

function roomForPhysics() {
  const room = { rules: sanitizeRules({ seed: 'continuous-physics', mapType: 'flat', enabledEvents: [], powerupCount: 0, mines: false }), players: [
    { id: 'first', nickname: 'First', classType: 'armored', arsenal: ['heavy', 'harpoon', 'jump'] },
    { id: 'second', nickname: 'Second', classType: 'ninja', arsenal: ['harpoon', 'jump', 'zeus'] },
  ] };
  room.game = createGame(room);
  Object.assign(room.game, { phase: 'playing', roundNumber: 2, turnIndex: 0, openingRestrictionsActive: false, objects: [], mines: [], powerups: [], turnEndsAt: Date.now() + 30000, botActAt: Date.now() + 30000 });
  room.game.terrain.heights.fill(700); room.game.terrain.floatingPlatforms = [];
  room.game.players[0].x = 300; room.game.players[0].y = 700 - WORLD.tankRadius;
  room.game.players[1].x = 900; room.game.players[1].y = 700 - WORLD.tankRadius;
  return room;
}

test('tanques caem durante a animação de projéteis e avisos de evento', () => {
  const room = roomForPhysics(); const tank = room.game.players[1];
  tank.y = 410; tank.airborne = { vx: 0, vy: 40, falling: true, startY: tank.y, minY: tank.y, updatedAt: Date.now() - 100 };
  room.game.shotEndsAt = Date.now() + 2500;
  const shotY = tank.y; tickRoom(room);
  assert.ok(tank.y > shotY, 'a queda deve continuar enquanto o tiro está em voo');
  room.game.shotEndsAt = null;
  room.game.pendingArenaEvent = { executeAt: Date.now() + 2500 };
  tank.airborne.updatedAt = Date.now() - 100;
  const eventY = tank.y; tickRoom(room);
  assert.ok(tank.y > eventY, 'a queda deve continuar durante o aviso do evento');
});

test('deslocamento normal usa combustível fora do turno sem consumir ações', () => {
  const room = roomForPhysics(); const game = room.game; const tank = game.players[1];
  const fuel = tank.fuel; const actions = { ...game.actions };
  const movement = movePlayer(room, tank.id, 1, null, { continuous: true });
  assert.ok(movement?.moved);
  assert.ok(tank.x > 900);
  assert.ok(tank.fuel < fuel);
  assert.deepEqual(game.actions, actions);
  assert.equal(game.turnIndex, 0);
  assert.throws(() => movePlayer(room, tank.id, 1, 'armoredDash', { continuous: true }), /Armas e movimentos especiais/);
});

test('Aranha permanece aderida à parede de uma estrutura após o puxão do Arpão', () => {
  const room = roomForPhysics(); const game = room.game; const spider = game.players[0];
  spider.spiderClimb = true;
  game.objects.push({ id: 'wall', type: 'building', x: 830, y: 610, groundY: 700, width: 90, height: 180, active: true, durability: 5, maxDurability: 5 });
  game.harpoonAnchor = { ownerId: spider.id, x: 785, y: 620, objectId: 'wall' };
  const pull = activateHarpoon(room, spider.id);
  assert.equal(pull.spiderAttachment?.surfaceClinging?.side, 'left');
  pull.startedAt = Date.now() - 900; pull.endsAt = Date.now() - 1;
  tickRoom(room);
  assert.equal(spider.surfaceClinging?.id, 'wall');
  assert.equal(spider.surfaceClinging?.side, 'left');
  assert.equal(spider.airborne, null);
  const y = spider.y; settlePlayers(game);
  assert.equal(spider.y, y);
});
