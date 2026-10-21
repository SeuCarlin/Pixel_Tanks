import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BIOMES } from '../shared/biomes.js';
import { ART_ATLASES, STANDALONE_CARD_ART, atlasCell, atlasStyle } from '../shared/card-art.js';
import { ARSENAL_DEFS, SHOT_PATH_RATE, WORLD } from '../shared/constants.js';
import { launcherDestination, movementDistance, specialMovePath, spiderLeapPath, walkPath } from '../shared/movement.js';
import { activateScenarioObjects, applyArenaPulse, createGame, fire, movePlayer, nextTurn, sanitizeRules, tickRoom } from '../server/game.js';
import { settlePlayers, settleScenarioObjects } from '../server/physics.js';
import { RoomManager } from '../server/rooms.js';

function room(seed = 'evolution-42', rules = {}) {
  return { rules: sanitizeRules({ seed, powerupCount: 0, ...rules }), players: [
    { id: 'one', nickname: 'One', color: '#fff', connected: true },
    { id: 'two', nickname: 'Two', color: '#f55', connected: true },
  ] };
}

test('all six biomes have deterministic geometry and their own interactive signature', () => {
  for (const [type, biome] of Object.entries(BIOMES)) {
    const first = createGame(room(`biome-${type}`, { mapType: type }));
    const second = createGame(room(`biome-${type}`, { mapType: type }));
    assert.equal(first.terrain.type, type);
    assert.deepEqual(first.terrain.heights, second.terrain.heights);
    assert.equal(first.objects.find((object) => object.id === 'biome-signature')?.type, biome.signature, type);
    assert.ok(biome.sky.length === 2 && biome.soil.length >= 4);
    if (type === 'highlands') assert.ok(first.terrain.heights.filter((height) => height > WORLD.height).length >= 128);
  }
});

test('movement preview uses the same walking path and wall rejection as the server', () => {
  const match = room('walk-42'); match.game = createGame(match); match.game.phase = 'playing';
  const game = match.game; game.terrain.heights.fill(700); game.terrain.floatingPlatforms = []; game.objects = []; game.mines = []; game.powerups = [];
  const player = game.players[0]; player.x = 100; player.y = 700 - WORLD.tankRadius;
  const preview = walkPath(game.terrain, player, 1, 72);
  movePlayer(match, player.id, 1);
  assert.equal(player.x, preview.x); assert.equal(player.y, preview.y);
  game.terrain.heights.fill(700); for (let x = 190; x < 230; x += 1) game.terrain.heights[x] = 620;
  const wall = walkPath(game.terrain, player, 1, 72);
  assert.equal(wall.blockedByWall, true);
  movePlayer(match, player.id, 1);
  assert.equal(player.x, wall.x);
});

test('special movement previews agree with server movement and terrain cuts', () => {
  for (const mode of ['rocketDash', 'excavator', 'armoredDash', 'spider']) {
    const match = room(`preview-${mode}`); match.players[0].arsenal = ['armoredDash', 'spider', 'jump']; match.game = createGame(match); match.game.phase = 'playing';
    const game = match.game; game.terrain.heights.fill(700); game.terrain.floatingPlatforms = []; game.objects = []; game.mines = []; game.powerups = [];
    for (let x = 190; x < 225; x += 1) game.terrain.heights[x] = 620;
    const player = game.players[0]; player.x = 100; player.y = 700 - WORLD.tankRadius;
    if (mode === 'rocketDash' || mode === 'excavator') { player.inventory.push(mode); player.selectedPowerups = [mode]; player.selectedPowerup = mode; }
    const armoredDash = mode === 'armoredDash'; const spiderLeap = mode === 'spider';
    const distance = movementDistance({ armoredDash, spiderLeap, rocketDash: mode === 'rocketDash' });
    const predictedTerrain = { ...game.terrain, heights: [...game.terrain.heights] };
    const prediction = spiderLeap ? spiderLeapPath(predictedTerrain, player, 1, distance) : armoredDash || mode === 'excavator' ? specialMovePath(predictedTerrain, player, 1, distance, { armoredDash, excavator: mode === 'excavator' }) : walkPath(predictedTerrain, player, 1, distance);
    movePlayer(match, player.id, 1, armoredDash || spiderLeap ? mode : null, spiderLeap ? { targetX: player.x + distance, targetY: player.y } : {});
    assert.equal(player.x, prediction.x, mode); assert.equal(player.y, prediction.y, mode);
    assert.deepEqual(game.terrain.heights.slice(180, 260), predictedTerrain.heights.slice(180, 260), mode);
    if (armoredDash) assert.equal(player.lastLaunch.wallsDestroyed, prediction.wallBreakPoints.length);
    if (spiderLeap) assert.equal(player.spiderClimb, true);
  }
});

test('movement preview includes the destination after stepping on a launcher', () => {
  const match = room('launcher-preview'); match.game = createGame(match); match.game.phase = 'playing';
  const game = match.game; game.terrain.heights.fill(700); game.terrain.floatingPlatforms = []; game.mines = []; game.powerups = [];
  game.objects = [{ id: 'launch-pad', type: 'launcher', x: 172, y: 696, direction: 1, active: true, cooldownUntilTurn: 0 }];
  const player = game.players[0]; player.x = 100; player.y = 691;
  const walked = walkPath(game.terrain, player, 1, movementDistance());
  const predicted = launcherDestination(game.terrain, game.objects, walked, 1, game.turnNumber);
  assert.equal(walked.x, 172); assert.equal(predicted.x, 412);
  movePlayer(match, player.id, 1);
  assert.equal(player.x, predicted.x); assert.equal(player.y, predicted.y);
  assert.equal(game.objects[0].cooldownUntilTurn, game.turnNumber + 2);
});

test('the volcanic biome has natural lava rivers for its signature eruption', () => {
  const match = room('volcano-42', { mapType: 'highlands', enabledEvents: ['eruption'] }); match.game = createGame(match); match.game.phase = 'playing'; match.game.turnNumber = 12;
  const event = applyArenaPulse(match);
  assert.equal(event.type, 'eruption'); assert.ok(event.lavaRivers.length >= 3); assert.ok(event.impacts.length > 0);
});

test('a heavy unsupported object lands once, scores one fall and deforms terrain', () => {
  const terrain = { heights: Array(WORLD.width).fill(700), floatingPlatforms: [{ id: 'pad', x: 220, y: 340, width: 160, height: 10, active: false }] };
  const object = { id: 'slab', type: 'concrete', x: 300, y: 333, groundY: 340, width: 110, supportPlatformId: 'pad', active: true };
  const game = { terrain, objects: [object], players: [], interactionSerial: 0 };
  const first = settleScenarioObjects(game);
  assert.equal(first.length, 1); assert.ok(first[0].damage > 100); assert.ok(terrain.heights[300] > 700);
  const serial = object.lastFall.serial;
  assert.deepEqual(settleScenarioObjects(game), []); assert.equal(object.lastFall.serial, serial);
});

test('a heavy landing fractures adjacent structures only once', () => {
  const terrain = { heights: Array(WORLD.width).fill(700), floatingPlatforms: [{ id: 'pad', x: 220, y: 340, width: 160, height: 10, active: false }] };
  const slab = { id: 'slab', type: 'concrete', x: 300, y: 333, groundY: 340, width: 110, supportPlatformId: 'pad', active: true };
  const nearby = { id: 'nearby', type: 'building', x: 380, y: 590, groundY: 700, width: 90, height: 220, durability: 2, active: true };
  const distant = { id: 'distant', type: 'building', x: 700, y: 590, groundY: 700, width: 90, height: 220, durability: 2, active: true };
  const game = { terrain, objects: [slab, nearby, distant], players: [], interactionSerial: 0 };
  const falls = settleScenarioObjects(game);
  assert.equal(falls[0].structures.length, 1); assert.equal(falls[0].structures[0].id, nearby.id);
  assert.equal(nearby.durability, 0); assert.equal(nearby.active, false); assert.ok(nearby.lastImpact?.serial > slab.lastFall.serial);
  assert.equal(distant.durability, 2); assert.equal(distant.active, true);
  const serial = nearby.lastImpact.serial;
  assert.deepEqual(settleScenarioObjects(game), []); assert.equal(nearby.lastImpact.serial, serial);
});

test('King of the Hill scores only an uncontested zone and ends on its own objective', () => {
  const match = room('hill-42', { gameMode: 'hill', roundLimit: 10 }); match.game = createGame(match); match.game.phase = 'playing';
  const game = match.game; game.terrain.heights.fill(700); game.hill = { x: 300, y: 700, radius: 170, pointsToWin: 4 };
  game.players[0].x = 300; game.players[0].y = 691; game.players[1].x = 900; game.players[1].y = 691;
  nextTurn(match); nextTurn(match); assert.equal(game.players[0].hillScore, 1);
  game.players[1].x = 320; nextTurn(match); nextTurn(match); assert.equal(game.players[0].hillScore, 1); assert.equal(game.hill.contested, true);
  game.players[1].x = 900;
  for (let round = 0; round < 3; round += 1) { nextTurn(match); nextTurn(match); }
  assert.equal(game.phase, 'finished'); assert.equal(game.winner, 'one'); assert.equal(game.finishedByObjective, true); assert.equal(game.players[0].hillScore, 4);
});

test('a long timed match with arena events always reaches a terminal result', () => {
  const match = room('marathon-42', { roundLimit: 10 }); match.game = createGame(match); match.game.phase = 'playing';
  let steps = 0;
  while (match.game.phase === 'playing' && steps < 180) {
    match.game.turnEndsAt = Date.now() - 1;
    if (match.game.arenaEventReadyAt) match.game.arenaEventReadyAt = Date.now() - 1;
    if (match.game.pendingArenaEvent) match.game.pendingArenaEvent.executeAt = Date.now() - 1;
    if (match.game.weatherSequence?.readyAt) match.game.weatherSequence.readyAt = Date.now() - 1;
    if (match.game.lastBattleAnimationUntil) match.game.lastBattleAnimationUntil = Date.now() - 1;
    tickRoom(match); steps += 1;
  }
  assert.equal(match.game.phase, 'finished'); assert.ok(steps < 180); assert.ok(match.game.roundNumber <= 10);
});

test('the art atlases retain one cell per published card', () => {
  const atlases = [['powerup-art-atlas-v3.png', 7, 4], ['arsenal-art-atlas-v3.png', 4, 4], ['class-art-atlas-v1.png', 4, 2], ['event-art-atlas-v1.png', 3, 3]];
  for (const [filename, columns, rows] of atlases) {
    const png = readFileSync(new URL(`../client/assets/${filename}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.ok(png.readUInt32BE(16) / columns >= 180 && png.readUInt32BE(20) / rows >= 180, filename);
  }
});

test('standalone art does not displace Haste or any other atlas card', () => {
  for (const [section, atlas] of Object.entries(ART_ATLASES)) {
    assert.ok(atlas.types.length <= atlas.columns * atlas.rows, section);
    for (const type of atlas.types) assert.ok(atlasCell(type, section), `${section}:${type}`);
    for (const type of STANDALONE_CARD_ART[section] || []) assert.equal(atlasCell(type, section), null, `${section}:${type}`);
  }
  assert.deepEqual(atlasCell('lightningRod', 'arsenal'), { column: 3, row: 3 });
  assert.match(atlasStyle('lightningRod', 'arsenal'), /--atlas-x:100%;--atlas-y:100%/);
  assert.equal(atlasCell('flyingHunter', 'arsenal'), null);
  assert.equal(atlasCell('engineer', 'classes'), null);
  assert.equal(atlasCell('fieldRepair', 'powerups'), null);
  for (const [type, section, file] of [['fieldRepair', 'powerups', 'field-repair-card-v1.png'], ['incendiary', 'classes', 'incendiary-class-v1.png'], ['fireFoam', 'powerups', 'fire-foam-card-v1.png']]) {
    assert.match(atlasStyle(type, section), new RegExp(file.replace('.', '\\.')));
    assert.equal(readFileSync(new URL(`../client/assets/${file}`, import.meta.url)).subarray(1, 4).toString(), 'PNG');
  }
});

test('every arsenal weapon has its own optimized powerup-style artwork', () => {
  for (const type of Object.keys(ARSENAL_DEFS)) {
    const file = type === 'harpoon' ? 'harpoon-simple' : ['cryoMortar', 'kineticCannon', 'meteorSalvo'].includes(type) ? `${type}-v2` : type;
    assert.match(atlasStyle(type, 'arsenal'), new RegExp(`arsenal-v4/${file}\\.png`));
    const image = readFileSync(new URL(`../client/assets/arsenal-v4/${file}.png`, import.meta.url));
    assert.equal(image.subarray(1, 4).toString(), 'PNG', type);
    assert.ok(image.readUInt32BE(16) >= 320, type);
    assert.equal(image.readUInt32BE(16), image.readUInt32BE(20), type);
  }
});

test('a room supports nine bots and offers sky spawns plus destructible sky structures', () => {
  const manager = new RoomManager();
  const lobby = manager.create({}, { nickname: 'Pilot', rules: { maxPlayers: 10, botCount: 9, mapType: 'platforms', seed: 'sky-check' } }).room;
  assert.equal(lobby.players.length, 10);
  assert.equal(lobby.players.filter((player) => player.isBot).length, 9);
  const game = createGame(lobby);
  assert.ok(game.terrain.floatingPlatforms.some((platform) => platform.skyDeck));
  assert.ok(game.players.some((player) => player.supportPlatformId?.startsWith('sky')));
  assert.ok(game.objects.some((object) => object.supportPlatformId?.startsWith('sky')));
  const skyBarrel = game.objects.find((object) => object.supportPlatformId?.startsWith('sky') && object.type === 'barrel');
  if (skyBarrel) {
    const blast = activateScenarioObjects(game, skyBarrel.x, skyBarrel.y, 10).find((entry) => entry.type === 'barrel');
    assert.equal(blast.y, skyBarrel.groundY - 5);
  }
});

test('a tank falls through the air when its sky support is destroyed', () => {
  const match = room('falling-sky-deck'); match.game = createGame(match);
  const game = match.game; const player = game.players[0];
  game.phase = 'playing'; game.turnEndsAt = Date.now() + 60000;
  game.terrain.heights.fill(850);
  game.terrain.floatingPlatforms = [{ id: 'test-sky', x: 100, baseX: 100, y: 260, width: 220, height: 14, active: false, skyDeck: true }];
  game.objects = [];
  player.x = 200; player.y = 251; player.supportPlatformId = 'test-sky'; player.platformOffset = 100;
  settlePlayers(game);
  assert.equal(player.airborne?.falling, true);
  assert.equal(player.y, 251);
  player.airborne.updatedAt -= 300;
  tickRoom(match);
  assert.ok(player.y > 251);
  assert.equal(player.alive, true);
  for (let step = 0; step < 35 && player.airborne; step += 1) { player.airborne.updatedAt -= 350; tickRoom(match); }
  assert.equal(player.airborne, null);
  assert.equal(player.y, 850 - WORLD.tankRadius);
  assert.equal(player.alive, true);
});

test('Ira de Zeus keeps the shot turn open for its two-second lightning animation', () => {
  const match = room('zeus-duration'); match.players[0].arsenal = ['zeus']; match.game = createGame(match);
  const game = match.game; game.phase = 'playing'; game.terrain.heights.fill(760); game.terrain.floatingPlatforms = []; game.objects = [];
  const shooter = game.players[0]; shooter.x = 100; shooter.y = 751; game.players[1].x = 1600; game.players[1].y = 751;
  const started = Date.now(); const [shot] = fire(match, shooter.id, { angle: 45, power: 230, direction: 1, weapon: 'zeus' });
  assert.ok(shot.interactions.some((interaction) => interaction.type === 'zeusMark'));
  assert.ok(game.delayedStrikes.some((strike) => strike.weapon === 'zeus' && strike.executeAt - strike.impactAt === 2000));
  assert.ok(game.shotEndsAt - started >= shot.path.length / SHOT_PATH_RATE * 1000 + 1900);
});
