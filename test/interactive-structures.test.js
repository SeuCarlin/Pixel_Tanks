import test from 'node:test';
import assert from 'node:assert/strict';
import { activateScenarioObjects, createGame, nextTurn, sanitizeRules } from '../server/game.js';
import { applyExplosion } from '../server/physics.js';
import { MAP_STRUCTURE_BALANCE } from '../shared/constants.js';
import { projectileStructureAt } from '../shared/projectile-obstacles.js';

function match(seed = 'interactive-structures') {
  const room = {
    rules: sanitizeRules({ seed, classesEnabled: false, powerupCount: 0, enabledEvents: [] }),
    players: [{ id: 'one', nickname: 'One', connected: true }, { id: 'two', nickname: 'Two', connected: true }],
  };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.terrain.heights.fill(760); room.game.terrain.floatingPlatforms = []; room.game.objects = [];
  room.game.players.forEach((player, index) => { player.x = 200 + index * 500; player.y = 751; });
  return room;
}

test('maps generate shield, repulsor and ammo structures as solid interactive cover', () => {
  const room = { rules: sanitizeRules({ seed: 'interactive-map-generation', powerupCount: 0 }), players: [{ id: 'a', nickname: 'A', connected: true }, { id: 'b', nickname: 'B', connected: true }] };
  const game = createGame(room);
  for (const type of ['shieldGenerator', 'repulsor', 'ammoTerminal']) {
    const structures = game.objects.filter((object) => object.type === type);
    assert.ok(structures.length >= 1, `${type} was not generated`);
    const object = structures[0];
    assert.equal(projectileStructureAt(game.objects, object.x, object.y)?.id, object.id);
  }
});

test('shield generator spends one energy to halve explosion damage inside its dome', () => {
  const room = match('shield-dome'); const game = room.game; const [, target] = game.players;
  const balance = MAP_STRUCTURE_BALANCE.shieldGenerator;
  game.objects = [{ id: 'shield', type: 'shieldGenerator', x: 700, y: 717, groundY: 760, width: 72, height: 86, durability: 3, shieldEnergy: 3, shieldRadius: balance.radius, active: true }];
  const damage = applyExplosion(game, target.x, target.y, 80, 60, { noTerrain: true, sourcePlayerId: game.players[0].id });
  const hit = damage.find((entry) => entry.playerId === target.id);
  assert.equal(hit.amount, 30); assert.equal(hit.structureShieldId, 'shield');
  assert.equal(game.objects[0].shieldEnergy, 2); assert.deepEqual(game.objects[0].lastShieldPulse.targetIds, [target.id]);
  game.objects[0].shieldEnergy = 0; target.health = target.maxHealth; target.x = 700; target.y = 751;
  const unshielded = applyExplosion(game, target.x, target.y, 80, 60, { noTerrain: true, sourcePlayerId: game.players[0].id });
  assert.equal(unshielded.find((entry) => entry.playerId === target.id).amount, 60);
});

test('repulsor pushes nearby tanks on every hit and explodes when overloaded', () => {
  const room = match('repulsor-pulse'); const game = room.game; const target = game.players[1]; const balance = MAP_STRUCTURE_BALANCE.repulsor;
  game.objects = [{ id: 'repulsor', type: 'repulsor', x: 700, y: 722, groundY: 760, width: 70, height: 76, durability: 3, pulseRadius: balance.radius, active: true }];
  const beforeX = target.x;
  const first = activateScenarioObjects(game, 700, 722, 5, new Set(), game.players[0].id);
  assert.ok(first.some((entry) => entry.type === 'repulsorPulse' && entry.targetIds.includes(target.id)));
  assert.notEqual(target.x, beforeX); assert.equal(game.objects[0].durability, 2);
  activateScenarioObjects(game, 700, 722, 5, new Set(), game.players[0].id);
  const final = activateScenarioObjects(game, 700, 722, 5, new Set(), game.players[0].id);
  assert.ok(final.some((entry) => entry.type === 'repulsorBurst'));
  assert.equal(game.objects[0].active, false);
});

test('ammo terminal refills an empty weapon and fuel with a per-tank cooldown, then drops a crate when destroyed', () => {
  const room = match('ammo-terminal'); const game = room.game; const player = game.players[1]; const balance = MAP_STRUCTURE_BALANCE.ammoTerminal;
  player.ammo.heavy = 0; player.fuel = 10;
  game.objects = [{ id: 'terminal', type: 'ammoTerminal', x: player.x, y: 726, groundY: 760, width: 68, height: 68, durability: 3, serviceRadius: balance.radius, active: true }];
  nextTurn(room);
  assert.equal(game.players[game.turnIndex].id, player.id); assert.equal(player.ammo.heavy, 1); assert.equal(player.fuel, 10 + balance.fuel);
  assert.equal(game.objects[0].lastRestock.weapon, 'heavy');
  player.ammo.heavy = 0; player.fuel = 10; player.arsenalLastUsed ||= {}; player.arsenalLastUsed.heavy = player.turnsPlayed; nextTurn(room); nextTurn(room);
  assert.equal(player.ammo.heavy, 0, 'terminal cooldown must prevent an immediate second refill');
  nextTurn(room); nextTurn(room);
  assert.equal(player.ammo.heavy, 1);
  for (let hit = 0; hit < 3; hit += 1) activateScenarioObjects(game, 700, 726, 5, new Set(), game.players[0].id);
  assert.equal(game.objects[0].active, false);
  assert.equal(game.powerups.filter((item) => item.active && item.type === 'ammoCrate' && item.source === 'ammoTerminal').length, 1);
});
