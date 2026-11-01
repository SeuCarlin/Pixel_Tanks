import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalSession } from '../client/offline/local-session.js';
import { RoomManager } from '../server/rooms.js';
import { PROTOCOL_VERSION } from '../shared/protocol.js';

function setup(humans, bots = 0) {
  const rooms = new RoomManager(), messages = [], actors = [];
  const session = new LocalSession(rooms, message => messages.push(message), PROTOCOL_VERSION);
  session.connect(socket => socket.on('message', raw => actors.push({ playerId: socket.playerId, ...JSON.parse(raw) })));
  const payload = { nickname: 'Comandante', rules: { localPlayers: humans, botCount: bots, maxPlayers: 2, mapType: 'flat', seed: 'hotseat', enabledEvents: [] } };
  session.prepare(payload, session.active);
  const { room } = rooms.create(session.active, payload);
  session.configure(room);
  return { rooms, room, session, messages, actors };
}

test('local multiplayer creates real human seats without forcing bots and respects total capacity', () => {
  const { room } = setup(3);
  assert.equal(room.players.length, 3);
  assert.equal(room.players.filter(p => p.isBot).length, 0);
  assert.equal(room.rules.localPlayers, 3);
  const capped = setup(8, 8).room;
  assert.equal(capped.players.length, 10);
  assert.equal(capped.players.filter(p => p.isBot).length, 2);
  assert.equal(setup(1).room.players.filter(p => p.isBot).length, 1);
});

test('each local player prepares separately and commands follow the current human turn', () => {
  const { rooms, room, session, messages, actors } = setup(2);
  const [one, two] = room.players;
  rooms.setClass(room.code, one.id, 'armored'); rooms.setArsenal(room.code, one.id, ['heavy', 'plasmaCore', 'waterTorpedo']);
  rooms.setReady(room.code, one.id);
  session.beforeSync(room);
  assert.equal(session.active.playerId, two.id);
  assert.equal(messages.at(-1).payload.playerId, two.id);
  assert.equal(two.arsenalSelected, false);
  rooms.setClass(room.code, two.id, 'amphibian'); rooms.setArsenal(room.code, two.id, ['cryoMortar', 'heavy', 'jump']);
  rooms.setReady(room.code, two.id);
  assert.ok(room.game);
  assert.equal(room.game.players.find(p => p.id === one.id).classType, 'armored');
  assert.equal(room.game.players.find(p => p.id === two.id).classType, 'amphibian');
  room.game.phase = 'playing';
  for (const player of [one, two, one]) {
    room.game.turnIndex = room.game.players.findIndex(p => p.id === player.id);
    session.beforeSync(room); session.dispatch({ type: 'FIRE', payload: { weapon: 'standard' } });
    assert.equal(actors.at(-1).playerId, player.id);
  }
  session.dispatch({ type: 'REMATCH' });
  assert.equal(actors.at(-1).playerId, room.hostId);
});

test('only the selected local seat receives its private state', () => {
  const { session, messages } = setup(2);
  messages.length = 0;
  session.sockets[1].send(JSON.stringify({ type: 'GAME_STATE', payload: { inventory: ['secret'] } }));
  assert.equal(messages.length, 0);
  session.active.send(JSON.stringify({ type: 'GAME_STATE', payload: { inventory: ['mine'] } }));
  assert.deepEqual(messages[0].payload.inventory, ['mine']);
});
