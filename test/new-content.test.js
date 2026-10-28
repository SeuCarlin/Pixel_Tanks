import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BIOMES } from '../shared/biomes.js';
import { ARSENAL_DEFS, POWERUP_DEFS, SELECTABLE_ARSENAL_ITEMS, WORLD } from '../shared/constants.js';
import { atlasStyle } from '../shared/card-art.js';
import { projectileStructureAt } from '../shared/projectile-obstacles.js';
import { activateScenarioObjects, claimReward, createGame, fire, sanitizeRules, selectPowerup, updateMovingPlatforms } from '../server/game.js';

const newStructures = ['crystalPylon', 'windTurbine', 'sporePod', 'cargoBalloon', 'hoverRelay'];
const newArsenal = ['plasmaCore', 'corrosionShell', 'rescueFlare'];
const newPowerups = ['ironheart', 'scoutPulse', 'overclockShell'];
function match(mapType = 'crystal') {
  const room = { rules: sanitizeRules({ seed: `new-content-${mapType}`, mapType, powerupCount: 8 }), players: [{ id: 'a', nickname: 'A', connected: true }, { id: 'b', nickname: 'B', connected: true }] };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.roundNumber = 2; room.game.openingRestrictionsActive = false;
  return room;
}

test('three new maps are selectable and all five structures have solid bodies', () => {
  for (const type of ['crystal', 'storm', 'spores']) {
    const { game } = match(type);
    assert.equal(game.terrain.type, type);
    assert.ok(BIOMES[type].sky.length === 2);
    for (const structure of newStructures) {
      const object = game.objects.find((entry) => entry.type === structure && entry.active);
      assert.ok(object, `${type}: ${structure}`);
      assert.equal(projectileStructureAt([object], object.x, object.y)?.id, object.id);
    }
    const airborne = game.objects.find((entry) => entry.type === 'cargoBalloon');
    const previousX = airborne.x; updateMovingPlatforms(game, Date.now() + 1200);
    assert.notEqual(airborne.x, previousX);
  }
});

test('new structures respond to hits with damage, healing, drops and electronic disruption', () => {
  const { game } = match(); const source = game.players[0]; const target = game.players[1];
  game.terrain.floatingPlatforms = []; game.terrain.heights.fill(700);
  const crystal = { id: 'crystal', type: 'crystalPylon', x: 300, y: 649, groundY: 700, width: 52, height: 102, durability: 2, active: true };
  game.objects = [crystal]; source.x = 100; source.y = 691; target.x = 320; target.y = 691;
  activateScenarioObjects(game, 300, 645, 10, new Set(), source.id);
  const health = target.health;
  const crystalBreak = activateScenarioObjects(game, 300, 645, 10, new Set(), source.id);
  assert.equal(crystal.active, false); assert.ok(target.health < health); assert.ok(crystalBreak.some((entry) => entry.type === 'crystalPylonBreak'));
  target.health = 70; target.alive = true;
  const pod = { id: 'pod', type: 'sporePod', x: 450, y: 658, groundY: 700, width: 68, height: 84, durability: 1, active: true };
  game.objects = [pod]; target.x = 450;
  activateScenarioObjects(game, 450, 658, 10, new Set(), source.id);
  assert.equal(target.health, 95);
  const balloon = { id: 'balloon', type: 'cargoBalloon', x: 600, y: 300, groundY: 334, width: 76, height: 68, durability: 1, active: true };
  game.objects = [balloon]; game.enabledPowerups = ['ironheart'];
  activateScenarioObjects(game, 600, 300, 8, new Set(), source.id);
  assert.ok(game.powerups.some((entry) => entry.id === 'balloon-drop' && entry.type === 'ironheart' && entry.revealed));
});

test('new pickups and shots are registered with individual card art and working effects', () => {
  for (const type of newArsenal) { assert.ok(SELECTABLE_ARSENAL_ITEMS.includes(type)); assert.ok(ARSENAL_DEFS[type]); const style = atlasStyle(type, 'arsenal'); assert.match(style, new RegExp(`${type}\\.png`)); const png = readFileSync(new URL(`../client/assets/arsenal-v4/${type}.png`, import.meta.url)); assert.equal(png.subarray(1, 4).toString(), 'PNG'); }
  for (const type of newPowerups) { assert.ok(POWERUP_DEFS[type]); assert.match(atlasStyle(type, 'powerups'), new RegExp(`${type}\\.png`)); }
  const room = match(); const game = room.game; const player = game.players[game.turnIndex];
  const initialMax = player.maxHealth;
  player.rewardOffer = { choices: ['ironheart'] }; claimReward(room, player.id, 'ironheart'); assert.equal(player.maxHealth, initialMax + 20);
  game.powerups.push({ id: 'hidden', type: 'heal', x: player.x + 40, y: player.y + 25, buriedY: player.y + 25, revealed: false, active: false });
  player.rewardOffer = { choices: ['scoutPulse'] }; claimReward(room, player.id, 'scoutPulse'); assert.equal(game.powerups.at(-1).revealed, true);
  player.rewardOffer = { choices: ['overclockShell'] }; claimReward(room, player.id, 'overclockShell'); selectPowerup(room, player.id, 'overclockShell');
  game.terrain.heights.fill(700); game.terrain.floatingPlatforms = []; game.objects = []; game.players.forEach((tank, index) => { tank.x = index ? 580 : 100; tank.y = 691; });
  const [shot] = fire(room, player.id, { angle: 42, power: 240, direction: 1, weapon: 'standard' });
  assert.equal(shot.impactDamage, 70); assert.ok(!player.inventory.includes('overclockShell'));
  assert.equal(WORLD.tankRadius, 9);
});

test('plasma spares terrain, corrosion persists and rescue heals allies', () => {
  for (const weapon of newArsenal) {
    const room = match('crystal'); const game = room.game; const shooter = game.players[game.turnIndex]; const ally = game.players.find((entry) => entry.id !== shooter.id);
    game.mode = 'teams'; shooter.team = 'team-1'; ally.team = 'team-1'; game.friendlyFire = false;
    game.terrain.heights.fill(700); game.terrain.floatingPlatforms = []; game.objects = []; game.powerups = [];
    shooter.x = 100; shooter.y = 691; ally.x = 225; ally.y = 691; ally.health = 80; shooter.health = 80;
    shooter.arsenal.push(weapon); shooter.ammo[weapon] = 1;
    const terrainBefore = [...game.terrain.heights];
    const [shot] = fire(room, shooter.id, { angle: 10, power: 100, direction: 1, weapon });
    assert.equal(shot.weapon, weapon); assert.ok(shot.impact);
    if (weapon === 'plasmaCore') assert.deepEqual(game.terrain.heights, terrainBefore);
    if (weapon === 'corrosionShell') assert.ok(game.fireZones.some((zone) => zone.source === 'corrosionShell' && zone.turnsLeft === 2));
    if (weapon === 'rescueFlare') { assert.equal(ally.health, 125); assert.equal(shooter.health, 125); assert.equal(shot.damage.length, 0); }
  }
});
