import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASS_DEFS, SELECTABLE_ARSENAL_ITEMS } from '../shared/constants.js';
import { BOT_ARSENAL_SYNERGY, chooseBotArsenal } from '../server/bot-loadout.js';
import { createGame } from '../server/game.js';
import { RoomManager } from '../server/rooms.js';

function seededRandom(seed = 1) {
  let value = seed;
  return () => ((value = (1664525 * value + 1013904223) >>> 0) / 4294967296);
}

test('bot arsenal draws are unique, selectable, and class-favored in 40% of slots', () => {
  const random = seededRandom(329);
  for (const [classType, favored] of Object.entries(BOT_ARSENAL_SYNERGY)) {
    assert.ok(CLASS_DEFS[classType]);
    assert.ok(favored.every((item) => SELECTABLE_ARSENAL_ITEMS.includes(item)));
    let matches = 0;
    const draws = 3000;
    for (let index = 0; index < draws; index += 1) {
      const arsenal = chooseBotArsenal(classType, random);
      assert.equal(arsenal.length, 3);
      assert.equal(new Set(arsenal).size, 3);
      assert.ok(arsenal.every((item) => SELECTABLE_ARSENAL_ITEMS.includes(item)));
      matches += arsenal.filter((item) => favored.includes(item)).length;
    }
    assert.ok(matches / (draws * 3) > 0.37 && matches / (draws * 3) < 0.43, `${classType}: ${matches / (draws * 3)}`);
  }
});

test('bots begin with random loadouts and no duplicate classes among teammates', () => {
  const manager = new RoomManager();
  const { room } = manager.create({}, { nickname: 'Host', rules: { gameMode: 'teams', teamCount: 2, botCount: 9, maxPlayers: 10 } });
  for (const team of ['team-1', 'team-2']) {
    const bots = room.players.filter((player) => player.isBot && player.team === team);
    assert.equal(new Set(bots.map((bot) => bot.classType)).size, bots.length);
    assert.ok(bots.every((bot) => bot.arsenal.length === 3));
  }
  assert.ok(new Set(room.players.filter((player) => player.isBot).map((bot) => bot.arsenal.join(','))).size > 1);
});

test('choosing a class rerolls only conflicting allied bots and their arsenal', () => {
  const manager = new RoomManager(); const host = {};
  const { room } = manager.create(host, { nickname: 'Host', rules: { gameMode: 'teams', teamCount: 2, botCount: 5, maxPlayers: 8 } });
  const teammate = room.players.find((player) => player.isBot && player.team === 'team-1');
  const originalClass = teammate.classType;
  const otherBots = room.players.filter((player) => player.isBot && player.id !== teammate.id).map((bot) => ({ id: bot.id, classType: bot.classType, arsenal: [...bot.arsenal] }));
  manager.setClass(room.code, host.playerId, originalClass);
  assert.notEqual(teammate.classType, originalClass);
  assert.deepEqual(teammate.arsenal.length, 3);
  for (const old of otherBots) {
    const current = room.players.find((player) => player.id === old.id);
    assert.equal(current.classType, old.classType);
    assert.deepEqual(current.arsenal, old.arsenal);
  }
  const allied = room.players.filter((player) => player.team === 'team-1');
  assert.equal(new Set(allied.map((player) => player.classType)).size, allied.length);
});

test('human teammates may share a class; bots still avoid it after teams change', () => {
  const manager = new RoomManager(); const host = {};
  const { room } = manager.create(host, { nickname: 'Host', rules: { gameMode: 'teams', teamCount: 2, botCount: 5, maxPlayers: 8 } });
  const teammate = {};
  manager.join(teammate, { code: room.code, nickname: 'Friend' });
  assert.equal(room.players.at(-1).team, 'team-1');
  manager.setClass(room.code, host.playerId, 'healer');
  manager.setClass(room.code, teammate.playerId, 'healer');
  const allies = room.players.filter((player) => player.team === 'team-1');
  assert.equal(allies.filter((player) => !player.isBot && player.classType === 'healer').length, 2);
  assert.ok(allies.filter((player) => player.isBot).every((bot) => bot.classType !== 'healer'));
});

test('rerolled bot loadout also updates a match still in class selection', () => {
  const manager = new RoomManager(); const host = {};
  const { room } = manager.create(host, { nickname: 'Host', rules: { gameMode: 'teams', teamCount: 2, botCount: 3, maxPlayers: 6 } });
  room.game = createGame(room); room.game.phase = 'class';
  const bot = room.players.find((player) => player.isBot && player.team === 'team-1');
  const conflict = bot.classType;
  manager.setClass(room.code, host.playerId, conflict);
  const gameBot = room.game.players.find((player) => player.id === bot.id);
  assert.equal(gameBot.classType, bot.classType);
  assert.ok(bot.arsenal.every((item) => gameBot.arsenal.includes(item)));
  assert.equal(gameBot.maxHealth, room.rules.health + (bot.classType === 'armored' ? 50 : 0));
});
