import test from 'node:test';
import assert from 'node:assert/strict';
import { activateHarpoon, createGame, finishPendingShot, fire, nextTurn, sanitizeRules, tickRoom, useArsenal } from '../server/game.js';
import { applyExplosion, simulateHarpoon, simulateMarkerBomb, simulateShot } from '../server/physics.js';
import { ARSENAL_COOLDOWN_TURNS, SHOT_PATH_RATE, VECTOR_FLIGHT_RATE, WEAPON_BALANCE, WORLD } from '../shared/constants.js';
import { tankMotionState, TANK_STATE } from '../shared/tank-states.js';

function matchWith(arsenal = ['soapBomb', 'markerBomb', 'harpoon'], count = 2) {
  const room = { rules: sanitizeRules({ seed: 'new-arsenal-physics', powerupCount: 0, enabledEvents: [], classesEnabled: false }), players: Array.from({ length: count }, (_, index) => ({ id: `p${index}`, nickname: `P${index}`, arsenal })) };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.terrain.heights.fill(760); room.game.terrain.floatingPlatforms = []; room.game.objects = []; room.game.mines = [];
  for (const player of room.game.players) { player.x = 180 + Number(player.id.slice(1)) * 900; player.y = 760 - WORLD.tankRadius; player.turnsPlayed = 1; player.classType = null; }
  return room;
}

test('new arsenal trio has distinct impact mechanics', () => {
  const kineticRoom = matchWith(['kineticCannon']); const kineticShooter = kineticRoom.game.players[0];
  const kineticImpact = simulateShot({ terrain: kineticRoom.game.terrain, ignorePlayerId: kineticShooter.id, x: kineticShooter.x, y: kineticShooter.y, angle: 38, power: 285, gravity: kineticRoom.rules.gravity, players: [] }).impact;
  kineticRoom.game.players[1].x = kineticImpact.x; kineticRoom.game.players[1].y = 760 - WORLD.tankRadius;
  const [kinetic] = fire(kineticRoom, kineticShooter.id, { weapon: 'kineticCannon', angle: 38, power: 285, direction: 1 });
  assert.ok(kinetic.interactions.some((entry) => entry.type === 'kineticBurst'));
  assert.ok(kinetic.damage.some((hit) => hit.playerId === kineticRoom.game.players[1].id && hit.knockback > 0), 'kinetic impact must apply knockback');

  const cryoRoom = matchWith(['cryoMortar']); const cryoShooter = cryoRoom.game.players[0];
  const cryoImpact = simulateShot({ terrain: cryoRoom.game.terrain, ignorePlayerId: cryoShooter.id, x: cryoShooter.x, y: cryoShooter.y, angle: 38, power: 285, gravity: cryoRoom.rules.gravity, players: [] }).impact;
  cryoRoom.game.players[1].x = cryoImpact.x; cryoRoom.game.players[1].y = 760 - WORLD.tankRadius;
  const [cryo] = fire(cryoRoom, cryoShooter.id, { weapon: 'cryoMortar', angle: 38, power: 285, direction: 1 });
  assert.equal(cryoRoom.game.players[1].frozenTurns, 2); assert.equal(cryoRoom.game.iceZones.length, 1);
  assert.ok(cryo.interactions.some((entry) => entry.type === 'cryoBurst'));

  const meteorRoom = matchWith(['meteorSalvo']); const [meteor] = fire(meteorRoom, meteorRoom.game.players[0].id, { weapon: 'meteorSalvo', angle: 38, power: 285, direction: 1 });
  const meteorImpacts = meteor.interactions.filter((entry) => entry.type === 'meteorImpact');
  assert.equal(meteorImpacts.length, 2);
  assert.ok(meteorImpacts.every((entry) => entry.fromY < entry.y - 300), 'each side meteor must have a visible descent path');
  const flightMs = meteor.path.length / SHOT_PATH_RATE * 1000 / meteorRoom.rules.gameSpeed;
  assert.ok(meteorRoom.game.shotEndsAt - Date.now() >= flightMs + 3200, 'the turn stays open for the complete meteor salvo');
});

test('Blink, healing drone and split damage work reactively outside the owner turn', () => {
  const room = matchWith(['blink', 'healingDrone', 'splitDamage']); const owner = room.game.players[0]; const enemy = room.game.players[1];
  room.game.turnIndex = 1; owner.health = 10;
  const activeTurn = room.game.turnIndex; const activeAttack = room.game.actions.attackAvailable;
  useArsenal(room, owner.id, { type: 'splitDamage' });
  assert.equal(owner.splitDamageUntilRound, room.game.roundNumber + 1);
  assert.equal(room.game.turnIndex, activeTurn, 'reactive defense must not steal the active turn');
  assert.equal(room.game.actions.attackAvailable, activeAttack, 'reactive defense must not consume the active tank attack');
  useArsenal(room, owner.id, { type: 'healingDrone' });
  const drone = room.game.objects.find((object) => object.type === 'healingDrone' && object.ownerId === owner.id);
  assert.ok(drone?.active); assert.equal(drone.turnsLeft, 3);
  room.game.turnIndex = 0; nextTurn(room); assert.equal(owner.health, 40); assert.equal(drone.turnsLeft, 2);
  drone.disabledUntilRound = room.game.roundNumber; room.game.turnIndex = 0; nextTurn(room); assert.equal(owner.health, 40, 'disabled drone cannot heal');
  drone.disabledUntilRound = 0; room.game.turnIndex = 0; nextTurn(room); assert.equal(owner.health, 70); assert.equal(drone.active, false);

  owner.ammo.blink = 1; owner.arsenalLastUsed = {}; owner.x = 500; owner.y = 760 - WORLD.tankRadius; enemy.x = 150; enemy.y = owner.y;
  const random = Math.random; Math.random = () => 0;
  try { const damage = applyExplosion(room.game, owner.x, owner.y, 90, 80, { sourcePlayerId: enemy.id }); assert.ok(damage.some((hit) => hit.playerId === owner.id && hit.evaded)); assert.equal(owner.health, 70); assert.equal(owner.ammo.blink, 0); assert.equal(owner.lastBlink.kind, 'autoEvade'); } finally { Math.random = random; }
});

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
  const room = matchWith(['soapBomb'], 5); room.game.wind = 0; const shooter = room.game.players[0];
  const predicted = simulateShot({ terrain: room.game.terrain, ignorePlayerId: shooter.id, x: shooter.x, y: shooter.y, angle: 35, power: 280, gravity: room.rules.gravity, players: [] }).impact;
  for (let index = 1; index < 5; index += 1) { const target = room.game.players[index]; target.x = predicted.x + (index - 2) * 34; target.y = 760 - WORLD.tankRadius; }
  fire(room, shooter.id, { weapon: 'soapBomb', angle: 35, power: 280, direction: 1 });
  assert.equal(room.game.soapBubbles.length, 3);
  assert.equal(WEAPON_BALANCE.soapBomb.floatMs, 5000); assert.ok(WEAPON_BALANCE.soapBomb.radius >= 450);
  const lifted = room.game.players.find((player) => player.id === room.game.soapBubbles[0].playerId); lifted.spiderClimb = true; lifted.wallClinging = 1;
  for (const bubble of room.game.soapBubbles) { bubble.impactAt = Date.now() - 2500; bubble.executeAt = bubble.impactAt + 5000; }
  tickRoom(room);
  assert.equal(lifted.wallClinging, null, 'bubble flight detaches the Spider from its wall');
  assert.equal(tankMotionState(room.game, lifted), TANK_STATE.FLOATING);
  assert.ok(room.game.soapBubbles.every((bubble) => bubble.y < bubble.startY - 100 && Math.abs(bubble.x - bubble.startX) < 40));
  for (const bubble of room.game.soapBubbles) { bubble.impactAt = Date.now() - 2600; bubble.executeAt = Date.now() - 50; }
  tickRoom(room);
  assert.equal(room.game.soapBubbles.length, 0);
  assert.equal(room.game.players.slice(1).filter((player) => player.health === player.maxHealth - 30).length, 3);
  assert.ok(room.game.lastSoapPop?.damage > 0);
  const released = room.game.players.slice(1).filter((player) => player.airborne?.fromSoapBubble);
  assert.equal(released.length, 3);
  assert.ok(released.every((player) => !player.lastLanding), 'the pop must not count as a landing');
  for (let frame = 0; frame < 16 && released.some((player) => player.airborne); frame += 1) {
    for (const player of released) if (player.airborne) player.airborne.updatedAt = Date.now() - 350;
    tickRoom(room);
  }
  assert.ok(released.every((player) => !player.airborne && player.lastLanding), 'the tanks should fall and land only at real ground contact');
});

test('vento empurra bolhas com tanques na direção e intensidade corretas', () => {
  const positionWithWind = (wind) => {
    const room = matchWith(['soapBomb']); const target = room.game.players[1];
    const now = Date.now(); target.x = 900; target.y = 650; room.game.wind = wind;
    room.game.soapBubbles = [{ id: 'wind-bubble', ownerId: room.game.players[0].id, playerId: target.id, startX: 900, startY: 650, x: 900, y: 650, driftX: 0, phase: 0, impactAt: now - 2500, executeAt: now + 2500, updatedAt: now - 2500 }];
    tickRoom(room);
    return { x: target.x, y: target.y };
  };
  const calm = positionWithWind(0);
  const mild = positionWithWind(10);
  const strong = positionWithWind(28);
  const reverse = positionWithWind(-28);
  assert.ok(reverse.x < calm.x && calm.x < mild.x && mild.x < strong.x, 'a deriva deve seguir o vento e crescer com a força');
  assert.ok([calm, mild, strong, reverse].every((position) => position.y < 550), 'o vento não pode interromper a subida');
});

test('a bubble detours around overhead platforms before continuing its lift', () => {
  const room = matchWith(['soapBomb']); room.game.wind = 0; const target = room.game.players[1];
  target.x = 500; target.y = 600;
  room.game.terrain.floatingPlatforms = [{ id: 'roof', x: 440, y: 420, width: 120, height: 12, durability: 200, active: true }];
  const now = Date.now(); room.game.soapBubbles = [{ id: 'bubble-test', ownerId: room.game.players[0].id, playerId: target.id, startX: 500, startY: 600, x: 500, y: 600, driftX: 10, phase: 0, impactAt: now - 4300, executeAt: now + 700, updatedAt: now - 4300 }];
  tickRoom(room);
  assert.ok(target.y < 412, `the tank should rise above the roof, at ${target.y}`);
  assert.ok(Math.abs(target.x - 500) < 100, 'the detour should stay local');
  assert.equal(target.airborne, null, 'the bubble, not gravity, controls flight until it pops');
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
  finishPendingShot(room);
  enemy.spiderClimb = true; enemy.wallClinging = 1;
  const now = Date.now(); room.game.soapBubbles.push({ id: 'harpoon-bubble', playerId: enemy.id, x: enemy.x, y: enemy.y, impactAt: now - 100, executeAt: now + 3000 });
  const pull = activateHarpoon(room, owner.id);
  assert.equal(enemy.wallClinging, null);
  assert.ok(!room.game.soapBubbles.some((bubble) => bubble.playerId === enemy.id));
  assert.equal(tankMotionState(room.game, enemy), TANK_STATE.AIRBORNE);
  assert.equal(enemy.airborne?.fromHarpoon, true);
  assert.equal(pull.endsAt - pull.startedAt, WEAPON_BALANCE.harpoon.enemyPullMs);
  const initialDistance = Math.abs(enemy.x - owner.x);
  room.game.harpoonPull.startedAt = Date.now() - 260; room.game.harpoonPull.endsAt = room.game.harpoonPull.startedAt + WEAPON_BALANCE.harpoon.enemyPullMs;
  tickRoom(room);
  assert.ok(Math.abs(enemy.x - owner.x) < initialDistance - 100, 'enemy should be yanked strongly toward the shooter halfway through');
  assert.equal(enemy.health, enemy.maxHealth, 'damage waits for contact with the shooter');
  room.game.harpoonPull.startedAt = Date.now() - 1300; room.game.harpoonPull.endsAt = Date.now() - 10; tickRoom(room);
  assert.equal(enemy.health, enemy.maxHealth - 30); assert.equal(room.game.actions.attackAvailable, true);
  assert.equal(enemy.airborne?.fromHarpoon, true);
  assert.ok(Math.hypot(enemy.x - owner.x, enemy.y - owner.y) <= 24);
});

test('frozen and actionless bots pass immediately, without waiting for their AI delay', () => {
  for (const frozen of [true, false]) {
    const room = matchWith(['heavy']); const bot = room.game.players[1]; bot.isBot = true;
    room.game.turnIndex = 1; room.game.botActAt = Date.now() + 10000; room.game.turnEndsAt = Date.now() + 20000;
    if (frozen) bot.frozenTurns = 2;
    else { room.game.actions = { movesLeft: 0, attackAvailable: false }; bot.fuel = 0; }
    tickRoom(room);
    assert.equal(room.game.turnIndex, 0);
    if (frozen) assert.equal(bot.frozenTurns, 1);
  }
  const humanRoom = matchWith(['heavy']); humanRoom.game.turnIndex = 1;
  humanRoom.game.actions = { movesLeft: 0, attackAvailable: false }; humanRoom.game.turnEndsAt = Date.now() + 20000;
  tickRoom(humanRoom);
  assert.equal(humanRoom.game.turnIndex, 1, 'a human still controls when to pass');

  const trappedRoom = matchWith(['heavy']); const trappedBot = trappedRoom.game.players[1]; trappedBot.isBot = true;
  trappedRoom.game.turnIndex = 1; trappedRoom.game.actions = { movesLeft: 2, attackAvailable: false };
  trappedRoom.game.botActAt = Date.now() + 10000; trappedRoom.game.turnEndsAt = Date.now() + 20000;
  trappedBot.teslaDisabledTurns = 1;
  trappedRoom.game.terrain.heights.fill(600, Math.round(trappedBot.x) - 50, Math.round(trappedBot.x) - 1);
  trappedRoom.game.terrain.heights.fill(600, Math.round(trappedBot.x) + 1, Math.round(trappedBot.x) + 50);
  tickRoom(trappedRoom);
  assert.equal(trappedRoom.game.turnIndex, 0, 'Tesla-disabled bot surrounded by walls should not wait');
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
