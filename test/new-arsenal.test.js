import test from 'node:test';
import assert from 'node:assert/strict';
import { activateHarpoon, createGame, finishPendingShot, fire, nextTurn, sanitizeRules, tickRoom } from '../server/game.js';
import { simulateHarpoon, simulateMarkerBomb, simulateShot } from '../server/physics.js';
import { ARSENAL_COOLDOWN_TURNS, VECTOR_FLIGHT_RATE, WEAPON_BALANCE, WORLD } from '../shared/constants.js';

function matchWith(arsenal = ['soapBomb', 'markerBomb', 'harpoon'], count = 2) {
  const room = { rules: sanitizeRules({ seed: 'new-arsenal-physics', powerupCount: 0, enabledEvents: [], classesEnabled: false }), players: Array.from({ length: count }, (_, index) => ({ id: `p${index}`, nickname: `P${index}`, arsenal })) };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.terrain.heights.fill(760); room.game.terrain.floatingPlatforms = []; room.game.objects = []; room.game.mines = [];
  for (const player of room.game.players) { player.x = 180 + Number(player.id.slice(1)) * 900; player.y = 760 - WORLD.tankRadius; player.turnsPlayed = 1; player.classType = null; }
  return room;
}

test('marker bomb records three boosted contacts and schedules three 30-HP delayed blasts', () => {
  const room = matchWith(); const shooter = room.game.players[0];
  const physics = simulateMarkerBomb({ terrain: room.game.terrain, x: shooter.x, y: shooter.y, angle: 40, power: 320, gravity: room.rules.gravity, direction: 1 });
  assert.equal(physics.bounces.length, 3); assert.ok(physics.bounces.every((bounce, index) => index === 0 || bounce.pathIndex > physics.bounces[index - 1].pathIndex));
  const [shot] = fire(room, shooter.id, { weapon: 'markerBomb', angle: 40, power: 320, direction: 1 });
  assert.equal(shot.bounces.length, 3); assert.equal(room.game.delayedStrikes.length, 3);
  assert.ok(room.game.delayedStrikes.every((mark) => mark.executeAt - room.game.delayedStrikes[0].executeAt === 0));
  assert.equal(WEAPON_BALANCE.markerBomb.markDamage, 30);
});

test('marker bomb can rebound from a vertical terrain wall', () => {
  const room = matchWith(); room.game.terrain.heights.fill(520, 465, 495);
  const result = simulateMarkerBomb({ terrain: room.game.terrain, x: 180, y: 760 - WORLD.tankRadius, angle: 16, power: 345, gravity: room.rules.gravity, direction: 1 });
  assert.ok(result.bounces.some((bounce) => bounce.surface === 'wall'));
  assert.equal(result.bounces.length, 3);
});

test('soap bomb lifts at most three tanks, pops for 30 HP and releases them to fall', () => {
  const room = matchWith(['soapBomb'], 5); const shooter = room.game.players[0];
  const predicted = simulateShot({ terrain: room.game.terrain, ignorePlayerId: shooter.id, x: shooter.x, y: shooter.y, angle: 35, power: 280, gravity: room.rules.gravity, players: [] }).impact;
  for (let index = 1; index < 5; index += 1) { const target = room.game.players[index]; target.x = predicted.x + (index - 2) * 34; target.y = 760 - WORLD.tankRadius; }
  fire(room, shooter.id, { weapon: 'soapBomb', angle: 35, power: 280, direction: 1 });
  assert.equal(room.game.soapBubbles.length, 3);
  assert.equal(WEAPON_BALANCE.soapBomb.floatMs, 5000); assert.ok(WEAPON_BALANCE.soapBomb.radius >= 450);
  for (const bubble of room.game.soapBubbles) { bubble.impactAt = Date.now() - 2500; bubble.executeAt = bubble.impactAt + 5000; }
  tickRoom(room);
  assert.ok(room.game.soapBubbles.every((bubble) => bubble.y < bubble.startY - 100 && Math.abs(bubble.x - bubble.startX) > 25));
  for (const bubble of room.game.soapBubbles) { bubble.impactAt = Date.now() - 2600; bubble.executeAt = Date.now() - 50; }
  tickRoom(room);
  assert.equal(room.game.soapBubbles.length, 0);
  assert.equal(room.game.players.slice(1).filter((player) => player.health === player.maxHealth - 30).length, 3);
  assert.ok(room.game.lastSoapPop?.damage > 0);
});

test('harpoon flies straight up to its stated range and hooks the first structure', () => {
  const room = matchWith(['harpoon']); const origin = { x: 180, y: 530 }; const angle = 14;
  const open = simulateHarpoon({ terrain: room.game.terrain, x: origin.x, y: origin.y, angle, direction: 1 });
  assert.equal(open.impact, null);
  assert.ok(open.path.length > 30);
  assert.ok(open.path.every((point) => Math.abs((point.y - origin.y) + (point.x - origin.x) * Math.tan(angle * Math.PI / 180)) < 2));
  assert.ok(Math.hypot(open.path.at(-1).x - origin.x, open.path.at(-1).y - origin.y) <= WEAPON_BALANCE.harpoon.range + 3);
  const middle = open.path[12]; const structure = { id: 'tower', type: 'building', active: true, x: middle.x, groundY: middle.y + 30, width: 30, height: 60 };
  const hooked = simulateHarpoon({ terrain: room.game.terrain, objects: [structure], x: origin.x, y: origin.y, angle, direction: 1 });
  assert.equal(hooked.impact?.objectId, structure.id);
});

test('harpoon anchors first, pull costs one move but preserves attack, passing refunds the charge', () => {
  const room = matchWith(['harpoon', 'heavy']); const owner = room.game.players[0]; room.game.players[1].x = 1900;
  const [shot] = fire(room, owner.id, { weapon: 'harpoon', angle: -12, power: 390, direction: 1 });
  assert.ok(shot.impact); assert.ok(room.game.harpoonAnchor); assert.equal(owner.ammo.harpoon, 0);
  finishPendingShot(room); assert.equal(room.game.turnIndex, 0); assert.equal(room.game.actions.attackAvailable, true);
  const pull = activateHarpoon(room, owner.id); assert.equal(room.game.actions.movesLeft, 1); assert.ok(pull.toX > owner.x);
  room.game.harpoonPull.startedAt = Date.now() - 1300; room.game.harpoonPull.endsAt = Date.now() - 10; tickRoom(room);
  assert.equal(room.game.harpoonPull, null); assert.equal(room.game.actions.attackAvailable, true);
  assert.ok(owner.x > 180);
  fire(room, owner.id, { weapon: 'heavy', angle: 45, power: 250, direction: 1 });

  const cancel = matchWith(['harpoon']); cancel.game.players[1].x = 1900; const canceller = cancel.game.players[0];
  fire(cancel, canceller.id, { weapon: 'harpoon', angle: -12, power: 350, direction: 1 }); finishPendingShot(cancel); nextTurn(cancel);
  assert.equal(canceller.ammo.harpoon, 1); assert.equal(cancel.game.harpoonAnchor, null);
});

test('harpoon hooked on an enemy pulls the target to the shooter before dealing 30 HP', () => {
  const room = matchWith(['harpoon']); const owner = room.game.players[0]; const enemy = room.game.players[1];
  const path = simulateHarpoon({ terrain: room.game.terrain, players: [], ignorePlayerId: owner.id, x: owner.x, y: owner.y, angle: 28, power: 400, gravity: room.rules.gravity });
  const point = path.path[Math.floor(path.path.length * .55)]; enemy.x = point.x; enemy.y = point.y;
  fire(room, owner.id, { weapon: 'harpoon', angle: 28, power: 400, direction: 1 });
  assert.equal(room.game.harpoonAnchor?.playerId, enemy.id);
  finishPendingShot(room); activateHarpoon(room, owner.id);
  room.game.harpoonPull.startedAt = Date.now() - 1300; room.game.harpoonPull.endsAt = Date.now() - 10; tickRoom(room);
  assert.equal(enemy.health, enemy.maxHealth - 30); assert.equal(room.game.actions.attackAvailable, true);
});

test('arsenal cooldowns are per weapon and vector flight remains normal physics at lower playback rate', () => {
  const room = matchWith(['heavy', 'gravity', 'jump']); const owner = room.game.players[0];
  owner.ammo.heavy = 0; owner.ammo.gravity = 0; owner.ammo.jump = 0; owner.arsenalLastUsed = { heavy: 1, gravity: 1, jump: 1 };
  nextTurn(room); nextTurn(room); assert.equal(owner.turnsPlayed, 2); assert.equal(owner.ammo.heavy, 0);
  nextTurn(room); nextTurn(room); assert.equal(owner.turnsPlayed, 3); assert.equal(owner.ammo.heavy, 1); assert.equal(owner.ammo.jump, 1); assert.equal(owner.ammo.gravity, 0);
  assert.equal(ARSENAL_COOLDOWN_TURNS.gravity, 4); assert.ok(VECTOR_FLIGHT_RATE < 1);
});

test('explosive modifiers affect the new bombs without being silently spent on a harpoon', () => {
  const soap = matchWith(['soapBomb']); const owner = soap.game.players[0]; soap.game.players[1].x = 1900;
  owner.inventory = ['bigExplosion']; owner.selectedPowerups = ['bigExplosion'];
  fire(soap, owner.id, { weapon: 'soapBomb', angle: 35, power: 280, direction: 1 });
  assert.ok(!owner.inventory.includes('bigExplosion'));
  const harpoon = matchWith(['harpoon']); const hooker = harpoon.game.players[0]; harpoon.game.players[1].x = 1900;
  hooker.inventory = ['megaMissile']; hooker.selectedPowerups = ['megaMissile'];
  fire(harpoon, hooker.id, { weapon: 'harpoon', angle: 38, power: 350, direction: 1 });
  assert.ok(hooker.inventory.includes('megaMissile'));
});
