import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, fire, ninjaFatal, publicGame, rerollBackpackerArsenal, sanitizeRules } from '../server/game.js';
import { backpackerRerollAvailable, ninjaFatalTarget } from '../shared/class-actions.js';
import { ARSENAL_DEFS, CLASS_BALANCE } from '../shared/constants.js';

function match(firstClass = 'ninja', mode = 'ffa') {
  const room = { rules: sanitizeRules({ seed: 'class-action-test', gameMode: mode, classesEnabled: true, enabledEvents: [], powerupCount: 0, mines: false }), players: [
    { id: 'one', nickname: 'One', classType: firstClass, arsenal: ['heavy', 'cluster', 'jump'] },
    { id: 'two', nickname: 'Two', classType: null, arsenal: ['heavy', 'cluster', 'jump'] },
  ] };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.turnIndex = 0;
  room.game.terrain.heights.fill(760); room.game.terrain.floatingPlatforms = []; room.game.objects = [];
  room.game.players.forEach((player, index) => { player.x = 300 + index * 80; player.y = 751; player.invisibleTurns = 0; });
  return room;
}

test('fatal strike requires a nearby visible enemy and a clear path', () => {
  const room = match(); const [ninja, target] = room.game.players;
  assert.equal(ninjaFatalTarget(room.game, ninja)?.id, target.id);
  target.x = ninja.x + CLASS_BALANCE.ninjaFatalRadius + 1;
  assert.equal(ninjaFatalTarget(room.game, ninja), null);
  assert.throws(() => ninjaFatal(room, ninja.id, target.id), /Aproxime-se/);
  target.x = ninja.x + 80; target.invisibleTurns = 1;
  assert.equal(ninjaFatalTarget(room.game, ninja), null);
  target.invisibleTurns = 0; room.game.terrain.heights[340] = 710;
  assert.equal(ninjaFatalTarget(room.game, ninja), null);
});

test('fatal strike deals 100, reveals the Ninja and holds the turn for its animation', () => {
  const room = match(); const [ninja, target] = room.game.players; ninja.invisibleTurns = 2;
  const strike = ninjaFatal(room, ninja.id, target.id);
  assert.equal(strike.damage, 100);
  assert.equal(target.health, 50);
  assert.equal(ninja.invisibleTurns, 0);
  assert.equal(ninja.lastNinjaReveal.reason, 'fatal');
  assert.equal(room.game.actions.attackAvailable, false);
  assert.ok(room.game.shotEndsAt >= Date.now() + 1500);
  assert.equal(publicGame(room.game, target.id).players[0].hidden, false);
  assert.throws(() => ninjaFatal(room, ninja.id, target.id), /Aguarde|j[aá] foi usado/);
});

test('Ninja reveals on a regular shot and shields reduce the fatal strike', () => {
  const shotRoom = match(); const [shooter, enemy] = shotRoom.game.players;
  enemy.x = 1100; shooter.invisibleTurns = 2;
  fire(shotRoom, shooter.id, { weapon: 'standard', angle: 70, power: 220, direction: 1 });
  assert.equal(shooter.invisibleTurns, 0);
  assert.equal(shooter.lastNinjaReveal.reason, 'shot');
  const slashRoom = match(); const [ninja, target] = slashRoom.game.players; target.shieldCharges = 1;
  const strike = ninjaFatal(slashRoom, ninja.id, target.id);
  assert.equal(strike.damage, Math.ceil(100 * .35));
  assert.equal(target.shieldCharges, 0);
});

test('Backpacker may reroll once in each third round, preserving two shots and one movement card', () => {
  const room = match('backpacker'); const player = room.game.players[0];
  assert.equal(backpackerRerollAvailable(room.game, player), false);
  room.game.roundNumber = 3;
  assert.equal(backpackerRerollAvailable(room.game, player), true);
  const reroll = rerollBackpackerArsenal(room, player.id);
  assert.equal(reroll.round, 3);
  assert.equal(new Set(player.arsenal).size, 3);
  assert.equal(player.arsenal.filter((type) => ARSENAL_DEFS[type].kind === 'movement').length, 1);
  assert.ok(player.arsenal.some((type) => !reroll.previous.includes(type)));
  assert.ok(player.arsenal.every((type) => player.ammo[type] === 1));
  assert.equal(backpackerRerollAvailable(room.game, player), false);
  assert.throws(() => rerollBackpackerArsenal(room, player.id), /uma vez/);
  room.game.roundNumber = 6;
  assert.equal(backpackerRerollAvailable(room.game, player), true);
});
