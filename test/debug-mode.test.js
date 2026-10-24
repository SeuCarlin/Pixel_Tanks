import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../server/rooms.js';
import { debugAction, nextTurn, tickRoom } from '../server/game.js';

function debugRoom() {
  const rooms = new RoomManager();
  const { room } = rooms.create({}, { nickname: 'Tester', debugMode: true });
  room.game.rouletteEndsAt = Date.now() - 1;
  tickRoom(room);
  return room;
}

test('TEST creates a separate live practice room with a passive bot and unrestricted arsenal', () => {
  const room = debugRoom();
  const [player, bot] = room.game.players;
  assert.equal(room.rules.debugMode, true);
  assert.equal(room.game.phase, 'playing');
  assert.equal(room.game.openingRestrictionsActive, false);
  assert.equal(room.game.turnIndex, 0);
  assert.equal(room.rules.debugBotPassive, true);
  assert.equal(bot.isBot, true);
  assert.ok(player.arsenal.length > 20);
  assert.ok(room.game.turnEndsAt - Date.now() > 60 * 60 * 1000);
  nextTurn(room);
  assert.equal(room.game.players[room.game.turnIndex].isBot, true);
  room.game.botActAt = Date.now() - 1;
  tickRoom(room);
  assert.equal(room.game.players[room.game.turnIndex].id, player.id);
});

test('debug controls grant weapons and powerups, change classes and bot behavior, and reset', () => {
  const room = debugRoom();
  const id = room.hostId;
  const player = room.game.players[0];
  debugAction(room, id, { action: 'class', type: 'amphibian' });
  assert.equal(player.classType, 'amphibian');
  assert.ok(player.arsenal.includes('waterCannon'));
  debugAction(room, id, { action: 'weapon', type: 'waterCannon' });
  assert.ok(player.ammo.waterCannon >= 2);
  debugAction(room, id, { action: 'powerup', type: 'guidedBullet' });
  assert.ok(player.inventory.filter((type) => type === 'guidedBullet').length >= 2);
  debugAction(room, id, { action: 'bot', behavior: 'active', difficulty: 'hard', classType: 'ninja', health: 100 });
  assert.equal(room.rules.debugBotPassive, false);
  assert.equal(room.rules.botDifficulty, 'hard');
  assert.equal(room.game.players[1].classType, 'ninja');
  assert.equal(room.game.players[1].health, 100);
  debugAction(room, id, { action: 'map', type: 'archipelago' });
  assert.equal(room.game.terrain.type, 'archipelago');
  assert.ok(room.game.waterZones.length > 0);
  assert.equal(room.game.players[0].classType, 'amphibian');
  debugAction(room, id, { action: 'reset' });
  assert.equal(room.game.phase, 'roulette');
  assert.equal(room.game.players[0].classType, 'amphibian');
  assert.equal(room.game.players[1].health, 100);
});

test('ordinary rooms and other players cannot use debug commands', () => {
  const rooms = new RoomManager();
  const { room } = rooms.create({}, { nickname: 'Normal', rules: { botCount: 1 } });
  assert.throws(() => debugAction(room, room.hostId, { action: 'powerup', type: 'guidedBullet' }), /modo TESTE/);
  const debug = debugRoom();
  assert.throws(() => debugAction(debug, debug.game.players[1].id, { action: 'reset' }), /modo TESTE/);
  assert.throws(() => debugAction(debug, debug.hostId, { action: 'weapon', type: 'elementalFire' }), /inválida/);
  assert.throws(() => debugAction(debug, debug.hostId, { action: 'map', type: '../invalid' }), /inválido/);
});

test('TEST lets the Elementalist choose any element before the next shot', () => {
  const room = debugRoom();
  const id = room.hostId;
  assert.throws(() => debugAction(room, id, { action: 'element', type: 'elementalWater' }), /Elementalista/);
  debugAction(room, id, { action: 'class', type: 'elementalist' });
  debugAction(room, id, { action: 'element', type: 'elementalWater' });
  assert.equal(room.game.players[0].elementalCurrent, 'elementalWater');
  assert.equal(room.game.players[0].lastElementalDraw.type, 'elementalWater');
  assert.throws(() => debugAction(room, id, { action: 'element', type: 'invalid' }), /inválido/);
});
