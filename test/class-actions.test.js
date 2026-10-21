import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, finishPendingShot, fire, movePlayer, nextTurn, ninjaFatal, publicGame, rerollBackpackerArsenal, sanitizeRules, tickRoom, useArsenal, usePowerup } from '../server/game.js';
import { backpackerRerollAvailable, ninjaFatalPath, ninjaFatalTarget } from '../shared/class-actions.js';
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

test('fatal strike reaches a visible enemy and passes through terrain', () => {
  const room = match(); const [ninja, target] = room.game.players;
  assert.equal(ninjaFatalTarget(room.game, ninja)?.id, target.id);
  target.x = ninja.x + CLASS_BALANCE.ninjaFatalRadius + 1;
  assert.equal(ninjaFatalTarget(room.game, ninja), null);
  assert.throws(() => ninjaFatal(room, ninja.id, target.id), /Escolha uma direção/);
  target.x = ninja.x + 80; target.invisibleTurns = 1;
  assert.equal(ninjaFatalTarget(room.game, ninja), null);
  target.invisibleTurns = 0; room.game.terrain.heights[340] = 710;
  assert.equal(ninjaFatalTarget(room.game, ninja)?.id, target.id);
});

test('fatal strike deals 80 and shows only the slash to enemies while the Ninja is cloaked', () => {
  const room = match(); const [ninja, target] = room.game.players; ninja.invisibleTurns = 2;
  const strike = ninjaFatal(room, ninja.id, target.id);
  assert.equal(strike.damage, 80);
  assert.equal(target.health, 70);
  assert.equal(ninja.invisibleTurns, 2);
  assert.equal(ninja.lastNinjaReveal, undefined);
  assert.equal(room.game.actions.attackAvailable, false);
  assert.ok(room.game.shotEndsAt >= Date.now() + 1400);
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
  room.game.enabledPowerups = [];
  room.game.roundNumber = 3; ninja.lastClassRound = 3; target.lastClassRound = 3; ninja.turnsPlayed = 2;
  ninja.invisibleTurns = 1;
  ninja.invisibilityFresh = true;
  ninja.ninjaFirstCloakActivated = true;
  ninja.ninjaOtherTurnsWaited = 1;
  ninjaFatal(room, ninja.id, target.id);
  assert.equal(ninja.lastNinjaRevealRound, 3);
  assert.equal(ninja.ninjaOtherTurnsWaited, 0);
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

test('Ninja first cloak activates after two other players finish their turns, still in round one', () => {
  const room = { rules: sanitizeRules({ seed: 'ninja-opening-cloak', gameMode: 'ffa', enabledEvents: [], powerupCount: 0, mines: false }), players: Array.from({ length: 4 }, (_, index) => ({ id: `tank${index}`, nickname: `Tank ${index}`, classType: index === 0 ? 'ninja' : null, arsenal: ['heavy', 'jump'] })) };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.turnIndex = 0; room.game.objects = []; room.game.powerups = []; room.game.mines = [];
  const ninja = room.game.players[0];
  assert.equal(ninja.invisibleTurns, 0);
  nextTurn(room);
  assert.equal(room.game.turnNumber, 2);
  assert.equal(ninja.invisibleTurns, 0);
  assert.equal(ninja.ninjaOtherTurnsWaited, 0);
  nextTurn(room);
  assert.equal(room.game.roundNumber, 1);
  assert.equal(room.game.turnNumber, 3);
  assert.equal(ninja.ninjaOtherTurnsWaited, 1);
  assert.equal(ninja.invisibleTurns, 0);
  nextTurn(room);
  assert.equal(room.game.roundNumber, 1);
  assert.equal(room.game.turnNumber, 4);
  assert.equal(ninja.invisibleTurns, 2);
  assert.equal(ninja.ninjaFirstCloakActivated, true);
  assert.equal(publicGame(room.game, room.game.players[2].id).players[0].hidden, true);
});

test('damage postpones the first cloak until two more other players finish turns', () => {
  const room = { rules: sanitizeRules({ seed: 'ninja-opening-reset', gameMode: 'ffa', enabledEvents: [], powerupCount: 0, mines: false }), players: Array.from({ length: 5 }, (_, index) => ({ id: `tank${index}`, nickname: `Tank ${index}`, classType: index === 0 ? 'ninja' : null, arsenal: ['heavy', 'jump'] })) };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.turnIndex = 0; room.game.objects = []; room.game.powerups = []; room.game.mines = [];
  const ninja = room.game.players[0];
  nextTurn(room);
  ninja.lastDamageRound = 1; ninja.health -= 10;
  nextTurn(room);
  assert.equal(ninja.invisibleTurns, 0);
  assert.equal(ninja.ninjaOtherTurnsWaited, 0);
  nextTurn(room);
  assert.equal(room.game.roundNumber, 1);
  assert.equal(room.game.turnNumber, 4);
  assert.equal(ninja.invisibleTurns, 0);
  nextTurn(room);
  assert.equal(room.game.roundNumber, 1);
  assert.equal(room.game.turnNumber, 5);
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
  assert.equal(strike.damage, 80);
  assert.equal(target.shieldCharges, 1);
});

test('fatal slash has two aimed dashes, returns through a wall, and delays victory for the split animation', () => {
  const room = match(); const [ninja, target] = room.game.players;
  for (let x = 335; x <= 365; x += 1) room.game.terrain.heights[x] = 700;
  room.game.objects.push({ id: 'wall-building', type: 'building', x: 350, width: 28, height: 80, groundY: 760, active: true });
  const first = ninjaFatalPath(room.game, ninja, null, { x: 640, y: 751 });
  assert.ok(first.length > 300);
  assert.deepEqual(first.hits.map((hit) => hit.id), [target.id]);
  const strike = ninjaFatal(room, ninja.id, null, { x: 640, y: 751 });
  assert.equal(strike.activation, 1); assert.equal(target.health, 70);
  assert.equal(room.game.ninjaFatalStage.activation, 1);
  assert.equal(publicGame(room.game, target.id).ninjaFatalStage.returnX, undefined, 'the hidden origin must not leak to opponents');
  finishPendingShot(room);
  assert.equal(room.game.actions.attackAvailable, true);
  const second = ninjaFatal(room, ninja.id, null, { x: 300, y: 751 });
  assert.equal(second.activation, 2); assert.equal(second.damage, 70);
  assert.equal(target.alive, false);
  assert.ok(room.game.shotEndsAt - second.startedAt >= CLASS_BALANCE.ninjaFatalSplitMs + 2800);
  assert.equal(room.game.phase, 'playing', 'victory must wait for the three-second split and explosion');
  finishPendingShot(room);
  assert.equal(room.game.phase, 'finished');
});

test('blink, teleport, and harpoon can activate during airborne and parachute states', () => {
  const room = match(); const [player] = room.game.players;
  player.airborne = { vx: 20, vy: 35, parachute: true, startY: 620, updatedAt: Date.now() }; player.y = 620;
  player.inventory.push('lightningStep', 'teleport'); player.selectedPowerups = ['lightningStep'];
  const blink = usePowerup(room, player.id, { type: 'lightningStep', x: 330 });
  assert.equal(blink.toX, 330); assert.equal(player.airborne, null); assert.equal(room.game.turnIndex, 0);
  player.airborne = { vx: 15, vy: 20, parachute: false, startY: 610, updatedAt: Date.now() }; player.y = 610;
  player.selectedPowerups = ['teleport'];
  const teleport = usePowerup(room, player.id, { type: 'teleport', x: 400 });
  assert.ok(Math.abs(teleport.toX - 400) <= 70); assert.equal(player.airborne, null);
  player.arsenal.push('harpoon'); player.ammo.harpoon = 1;
  player.airborne = { vx: 0, vy: 20, parachute: true, startY: 600, updatedAt: Date.now() }; player.y = 600;
  fire(room, player.id, { weapon: 'harpoon', angle: 45, power: 230, direction: 1 });
  assert.equal(room.game.pendingShot.weapon, 'harpoon');
});

test('Carta Sacana swaps airborne and grounded tanks without leaving either inside terrain', () => {
  const room = match(); const [player, target] = room.game.players;
  player.airborne = { vx: 12, vy: 20, parachute: true, startY: 630, updatedAt: Date.now() }; player.y = 630;
  player.inventory.push('trickster'); player.selectedPowerups = ['trickster'];
  const result = usePowerup(room, player.id, { type: 'trickster', targetPlayerId: target.id });
  assert.equal(result.targetPlayerId, target.id);
  assert.equal(player.airborne, null);
  assert.equal(player.y, 751);
  assert.equal(target.airborne?.parachute, true);
  assert.equal(target.y, 630);
  assert.equal(room.game.turnIndex, 0);
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
  assert.ok(player.arsenal.every((type) => player.ammo[type] === (type === 'superheat' ? 0 : 1)));
  assert.equal(backpackerRerollAvailable(room.game, player), false);
  assert.throws(() => rerollBackpackerArsenal(room, player.id), /uma vez/);
  room.game.roundNumber = 6;
  assert.equal(backpackerRerollAvailable(room.game, player), true);
});
