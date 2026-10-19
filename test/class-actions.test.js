import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, finishPendingShot, fire, movePlayer, nextTurn, ninjaFatal, publicGame, rerollBackpackerArsenal, sanitizeRules, tickRoom, useArsenal } from '../server/game.js';
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

test('fatal strike deals 100 and shows only the slash to enemies while the Ninja is cloaked', () => {
  const room = match(); const [ninja, target] = room.game.players; ninja.invisibleTurns = 2;
  const strike = ninjaFatal(room, ninja.id, target.id);
  assert.equal(strike.damage, 100);
  assert.equal(target.health, 50);
  assert.equal(ninja.invisibleTurns, 2);
  assert.equal(ninja.lastNinjaReveal, undefined);
  assert.equal(room.game.actions.attackAvailable, false);
  assert.ok(room.game.shotEndsAt >= Date.now() + 1500);
  assert.equal(strike.concealed, true);
  assert.equal(publicGame(room.game, target.id).players[0].hidden, true);
  assert.equal(publicGame(room.game, ninja.id).players[0].hidden, false);
  assert.equal(publicGame(room.game, target.id).players[0].x, null);
  strike.startedAt = Date.now() - CLASS_BALANCE.ninjaFatalDurationMs - 1;
  tickRoom(room);
  assert.equal(strike.revealComplete, true);
  assert.equal(publicGame(room.game, target.id).players[0].hidden, true);
  assert.throws(() => ninjaFatal(room, ninja.id, target.id), /Aguarde|j[aá] foi usado/);
});

test('fatal strike preserves stealth and delays the next passive cloak by two safe rounds', () => {
  const room = match(); const [ninja, target] = room.game.players;
  room.game.roundNumber = 3; ninja.lastClassRound = 3; target.lastClassRound = 3; ninja.turnsPlayed = 2;
  ninja.invisibleTurns = 1;
  ninja.invisibilityFresh = true;
  ninjaFatal(room, ninja.id, target.id);
  assert.equal(ninja.lastNinjaRevealRound, 3);
  room.game.lastNinjaStrike.startedAt = Date.now() - CLASS_BALANCE.ninjaFatalDurationMs - 1;
  tickRoom(room);
  assert.equal(publicGame(room.game, target.id).players[0].hidden, true);
  nextTurn(room); nextTurn(room);
  assert.equal(room.game.roundNumber, 4);
  assert.equal(ninja.invisibleTurns, 1);
  assert.equal(publicGame(room.game, target.id).players[0].hidden, true);
  nextTurn(room); nextTurn(room);
  assert.equal(room.game.roundNumber, 5);
  assert.equal(ninja.invisibleTurns, 2);
  assert.equal(publicGame(room.game, target.id).players[0].hidden, true);
});

test('Ninja passive cloak begins only after two completed personal turns', () => {
  const room = match(); const ninja = room.game.players[0];
  ninja.turnsPlayed = 1;
  nextTurn(room); nextTurn(room);
  assert.equal(room.game.roundNumber, 2);
  assert.equal(ninja.invisibleTurns, 0);
  nextTurn(room); nextTurn(room);
  assert.equal(room.game.roundNumber, 3);
  assert.equal(ninja.invisibleTurns, 2);
});

test('visible Ninja stays visible during a fatal strike', () => {
  const room = match(); const [ninja, target] = room.game.players;
  const strike = ninjaFatal(room, ninja.id, target.id);
  assert.equal(strike.concealed, false);
  assert.equal(publicGame(room.game, target.id).players[0].hidden, false);
});

test('an invisible Ninja leaves only a fixed firing ghost and stays hidden after moving', () => {
  const shotRoom = match(); const [shooter, enemy] = shotRoom.game.players;
  enemy.x = 1100; shooter.invisibleTurns = 2;
  const firedFrom = { x: shooter.x, y: shooter.y };
  fire(shotRoom, shooter.id, { weapon: 'standard', angle: 70, power: 220, direction: 1 });
  assert.equal(shooter.invisibleTurns, 2);
  assert.equal(shooter.lastNinjaReveal.reason, 'ghost');
  assert.deepEqual({ x: shooter.lastNinjaReveal.x, y: shooter.lastNinjaReveal.y }, firedFrom);
  finishPendingShot(shotRoom); nextTurn(shotRoom); shotRoom.game.arenaWarningUntil = 0; shotRoom.game.arenaEventReadyAt = null;
  movePlayer(shotRoom, shooter.id, 1, null, { continuous: true, bot: true });
  assert.ok(shooter.x > firedFrom.x);
  const enemyView = publicGame(shotRoom.game, enemy.id).players[0];
  assert.equal(enemyView.hidden, true);
  assert.equal(enemyView.x, null);
  assert.equal(enemyView.lastSafeX, null);
  assert.equal(enemyView.lastMove, null);
  assert.deepEqual({ x: enemyView.lastNinjaReveal.x, y: enemyView.lastNinjaReveal.y }, firedFrom);
  assert.equal(publicGame(shotRoom.game, shooter.id).players[0].x, shooter.x);
  useArsenal(shotRoom, shooter.id, { type: 'jump', angle: 45, power: 260, direction: 1 });
  assert.equal(publicGame(shotRoom.game, enemy.id).players[0].hidden, true, 'jumping after the shot must not expose the new position');
  assert.deepEqual({ x: shooter.lastNinjaReveal.x, y: shooter.lastNinjaReveal.y }, firedFrom);
});

test('fatal strike ignores shields and passive armor', () => {
  const slashRoom = match(); const [ninja, target] = slashRoom.game.players; target.shieldCharges = 1;
  target.armorAuraActive = true;
  const strike = ninjaFatal(slashRoom, ninja.id, target.id);
  assert.equal(strike.damage, 100);
  assert.equal(target.shieldCharges, 1);
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
