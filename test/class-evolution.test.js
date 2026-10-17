import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseClassEvolution, createGame, fire, nextTurn, sanitizeRules } from '../server/game.js';
import { applyExplosion } from '../server/physics.js';
import { CLASS_DEFS, classEvolutionRounds } from '../shared/constants.js';
import { searchableCard } from '../shared/card-catalog.js';

function match(rules = {}, secondBot = false) {
  const room = {
    rules: sanitizeRules({ seed: 'class-evolution-stable', powerupCount: 0, roundLimit: 10, ...rules }),
    players: [
      { id: 'one', nickname: 'One', color: '#fff', connected: true, classType: 'armored' },
      { id: 'two', nickname: 'Two', color: '#f55', connected: true, classType: 'attacker', isBot: secondBot, personality: 'defensive' },
    ],
  };
  room.game = createGame(room); room.game.phase = 'playing';
  return room;
}

function advanceTurns(room, count) { for (let i = 0; i < count; i += 1) nextTurn(room); }

test('class milestones offer one permanent choice at one and two thirds of the round limit', () => {
  assert.deepEqual(classEvolutionRounds(10), [4, 7]);
  assert.deepEqual(classEvolutionRounds(50), [17, 34]);
  assert.match(searchableCard('armored', CLASS_DEFS.armored), /fortificar/);
  assert.match(searchableCard('ninja', CLASS_DEFS.ninja), /sobrecarga/);
  const room = match(); const first = room.game.players[0];
  assert.throws(() => chooseClassEvolution(room, first.id, 'fortify'), /Nenhuma evolução/);
  advanceTurns(room, 6);
  assert.equal(room.game.roundNumber, 4);
  assert.equal(first.pendingClassEvolutions, 1);
  assert.throws(() => chooseClassEvolution(room, first.id, 'unknown'), /inválida/);
  assert.equal(first.pendingClassEvolutions, 1);
  const originalHealth = first.health; const originalMax = first.maxHealth;
  chooseClassEvolution(room, first.id, 'fortify');
  assert.equal(first.health, originalHealth + 30);
  assert.equal(first.maxHealth, originalMax + 30);
  assert.deepEqual(first.classEvolutions, ['fortify']);
  assert.throws(() => chooseClassEvolution(room, first.id, 'fortify'), /Nenhuma evolução/);
  advanceTurns(room, 6);
  assert.equal(room.game.roundNumber, 7);
  assert.equal(first.pendingClassEvolutions, 1);
  chooseClassEvolution(room, first.id, 'fortify');
  assert.equal(first.maxHealth, originalMax + 60);
});

test('overdrive adds damage to enemy explosions, but not self-damage or arena events', () => {
  const room = match(); advanceTurns(room, 6);
  const [shooter, target] = room.game.players;
  room.game.terrain.heights.fill(700); room.game.terrain.floatingPlatforms = []; room.game.objects = [];
  const reset = () => { shooter.x = 200; shooter.y = 691; shooter.health = shooter.maxHealth; target.x = 280; target.y = 691; target.health = target.maxHealth; room.game.terrain.heights.fill(700); };
  reset(); const baseline = applyExplosion(room.game, 280, 691, 80, 40, { sourcePlayerId: shooter.id });
  chooseClassEvolution(room, shooter.id, 'overdrive');
  reset(); const boosted = applyExplosion(room.game, 280, 691, 80, 40, { sourcePlayerId: shooter.id });
  assert.equal(boosted.find((hit) => hit.playerId === target.id).amount - baseline.find((hit) => hit.playerId === target.id).amount, 6);
  assert.equal(boosted.find((hit) => hit.playerId === shooter.id).amount, baseline.find((hit) => hit.playerId === shooter.id).amount);
  reset(); const event = applyExplosion(room.game, 280, 691, 80, 40, { eventType: 'bombardment' });
  assert.equal(event.find((hit) => hit.playerId === target.id).amount, 40);
});

test('overdrive also increases direct laser damage by six per enemy hit', () => {
  const baseline = match(); const boosted = match();
  boosted.game.players[0].pendingClassEvolutions = 1;
  chooseClassEvolution(boosted, 'one', 'overdrive');
  const shoot = (room) => {
    room.game.terrain.heights.fill(850); room.game.terrain.floatingPlatforms = []; room.game.objects = [];
    const [shooter, target] = room.game.players;
    shooter.x = 200; shooter.y = 400; shooter.facing = 1;
    target.x = 520; target.y = 372;
    shooter.inventory.push('laser'); shooter.selectedPowerup = 'laser';
    const before = target.health;
    fire(room, shooter.id, { angle: 5, power: 400, direction: 1, weapon: 'standard' });
    return before - target.health;
  };
  assert.equal(shoot(boosted) - shoot(baseline), 6);
});

test('bots choose automatically; classes-disabled matches never offer evolutions', () => {
  const bots = match({}, true); advanceTurns(bots, 6);
  assert.deepEqual(bots.game.players[1].classEvolutions, ['fortify']);
  assert.equal(bots.game.players[1].pendingClassEvolutions, 0);
  const plain = match({ classesEnabled: false }); advanceTurns(plain, 6);
  assert.ok(plain.game.players.every((player) => !player.classType && player.pendingClassEvolutions === 0));
});
