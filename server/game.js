import crypto from 'node:crypto';
import { ARSENAL_ITEMS, COLLECTIBLE_ITEMS, DEFAULT_ARSENAL, DEFAULT_RULES, GAME_TIMING, POWERUPS, SHOT_PATH_RATE, WORLD, clamp } from '../shared/constants.js';
import { seededRandom } from './random.js';
import { carveTerrain, findSpawns, generateTerrain, movingPlatformX, terrainY } from './terrain.js';
import { applyExplosion, settlePlayers, simulateBouncingGrenade, simulateShot, simulateVerticalStrike } from './physics.js';

const SELECTABLE_POWERUPS = new Set(['extraShot', 'doubleShot', 'tripleShot', 'bigExplosion', 'megaMissile', 'freeze', 'guidedBullet', 'teleport', 'excavator', 'armorPiercer', 'shockwave', 'bunkerBuster', 'rocketDash', 'lightningStep', 'bridgeKit', 'molotov', 'laser']);
const SUPPLY_LOOTBOX_CHANCE = 18;

export function createGame(room) {
  const seed = room.rules.seed || crypto.randomInt(100000, 999999);
  const terrain = generateTerrain(seed, room.rules.mapType);
  const spawns = findSpawns(terrain, room.players.length);
  const players = room.players.map((p, i) => ({
    id: p.id, nickname: p.nickname, color: p.color, x: spawns[i].x, y: spawns[i].y,
    health: room.rules.health, maxHealth: room.rules.health, alive: true, connected: p.connected, isBot: Boolean(p.isBot), team: p.isBot ? 'bots' : 'humans',
    facing: i < room.players.length / 2 ? 1 : -1, inventory: [], selectedPowerup: null, rewardOffer: null, turnsPlayed: 0, arsenalOffer: [...(p.arsenalOffer || ARSENAL_ITEMS)], arsenal: [...(p.arsenal || DEFAULT_ARSENAL)], ammo: Object.fromEntries((p.arsenal || DEFAULT_ARSENAL).map((type) => [type, 1])), shield: false, shieldCharges: 0, frozenTurns: 0, powerupBlockedTurns: 0, invisibleTurns: 0, invisibilityFresh: false, regenTurns: 0, airborne: null, spiderMoves: 0, spiderClimb: false, lastPickup: null, lastLaunch: null, lastSafeX: spawns[i].x, lastSafeY: spawns[i].y, graveRecorded: false, supportPlatformId: null, platformOffset: null, stats: { damage: 0, shots: 0 },
  }));
  const rand = seededRandom(`${seed}-items`);
  const validX = () => {
    if (terrain.platforms?.length && rand() < .72) {
      const platform = terrain.platforms[Math.floor(rand() * terrain.platforms.length)];
      return platform.x + 15 + rand() * Math.max(1, platform.width - 30);
    }
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const candidate = 70 + rand() * (WORLD.width - 140);
      if (safeGroundAt(terrain, candidate)) return candidate;
    }
    return WORLD.width / 2;
  };
  const powerups = Array.from({ length: room.rules.powerupCount }, (_, i) => {
    const x = validX(); const surface = terrainY(terrain, x); const buriedY = surface + 16 + Math.round(rand() * 22);
    return { id: `p${i}`, type: COLLECTIBLE_ITEMS[Math.floor(rand() * COLLECTIBLE_ITEMS.length)], x, y: buriedY, buriedY, revealed: false, active: false };
  });
  const mines = room.rules.mines ? Array.from({ length: Math.max(2, Math.floor(room.players.length * 1.5)) }, (_, i) => {
    const x = validX();
    return { id: `m${i}`, x, y: terrainY(terrain, x) - 3, active: true };
  }) : [];
  const objects = createScenarioObjects(terrain, spawns, rand);
  const now = Date.now();
  return {
    phase: 'arsenal', mode: room.rules.gameMode, seed, gravity: room.rules.gravity, speed: room.rules.gameSpeed, wind: windForTurn(seed, 1), terrain, players, powerups, mines, platformEpoch: now, turnIndex: 0, turnNumber: 1,
    arsenalEndsAt: now + GAME_TIMING.arsenalMs, rouletteStartedAt: null, rouletteSpinEndsAt: null, rouletteEndsAt: null, rouletteSequence: [], turnEndsAt: null,
    actions: { movesLeft: 2, attackAvailable: true }, winner: null, winningTeam: null, events: [], objects, graves: [], fireZones: [], interactionSerial: 0, pickupSerial: 0, shotEndsAt: null, pendingShot: null, botActAt: null,
  };
}

export function publicGame(game, viewerId = null) {
  const players = game.players.map((player) => player.alive && player.invisibleTurns > 0 && player.id !== viewerId
    ? { ...player, x: null, y: null, platformOffset: null, supportPlatformId: null, hidden: true }
    : { ...player, hidden: false });
  return { ...game, players, terrain: { ...game.terrain, heights: game.terrain.heights }, serverTime: Date.now() };
}

function currentPlayer(game) { return game.players[game.turnIndex]; }

export function nextTurn(room) {
  const game = room.game;
  if (!game || game.phase === 'finished') return;
  game.shotEndsAt = null; game.pendingShot = null;
  const departing = currentPlayer(game);
  if (departing?.rewardOffer) autoClaimReward(game, departing);
  if (departing?.invisibilityFresh) departing.invisibilityFresh = false;
  else if (departing?.invisibleTurns > 0) departing.invisibleTurns -= 1;
  if (departing?.frozenTurns > 0) departing.frozenTurns -= 1;
  if (departing?.powerupBlockedTurns > 0) departing.powerupBlockedTurns -= 1;
  if (departing?.regenTurns > 0 && departing.alive) { departing.health = Math.min(departing.maxHealth, departing.health + 12); departing.regenTurns -= 1; }
  if (departing?.airborne) landPlayer(game, departing);
  applyFireZones(game);
  if (evaluateVictory(game)) return;
  let attempts = 0;
  do { game.turnIndex = (game.turnIndex + 1) % game.players.length; attempts += 1; }
  while (!currentPlayer(game).alive && attempts <= game.players.length);
  game.turnNumber += 1;
  applyArenaPulse(room);
  if (!currentPlayer(game)?.alive) {
    const survivor = game.players.findIndex((player) => player.alive);
    if (survivor < 0) { game.phase = 'finished'; game.winner = null; return; }
    game.turnIndex = survivor;
  }
  const active = currentPlayer(game); active.turnsPlayed = (active.turnsPlayed || 0) + 1; offerPowerupChoice(room, active);
  game.wind = windForTurn(game.seed, game.turnNumber);
  const excavatorMoves = active.selectedPowerup === 'excavator' ? active.inventory.filter((type) => type === 'excavator').length : 0;
  game.actions = { movesLeft: active.frozenTurns > 0 ? 0 : excavatorMoves > 0 ? 3 : 2, attackAvailable: true };
  game.turnEndsAt = Date.now() + room.rules.turnSeconds * 1000 / room.rules.gameSpeed;
  game.botActAt = Date.now() + botDelay(room.rules.botDifficulty) / room.rules.gameSpeed;
}

export function movePlayer(room, playerId, direction, arsenalType = null) {
  const game = room.game;
  if (game.arenaWarningUntil > Date.now()) throw new Error('Aguarde o impacto do evento da arena.');
  updateMovingPlatforms(game);
  const player = currentPlayer(game);
  if (game.shotEndsAt) throw new Error('Aguarde o projétil concluir a trajetória.');
  if (game.phase !== 'playing' || player?.id !== playerId) throw new Error('Não é seu turno.');
  if (player.frozenTurns > 0) throw new Error(`Tanque congelado por mais ${player.frozenTurns} turno(s).`);
  if (game.actions.movesLeft <= 0) throw new Error('Sem movimentos restantes.');
  if (player.airborne) throw new Error('Abra o paraquedas ou aguarde o pouso.');
  const armoredDash = arsenalType === 'armoredDash';
  if (armoredDash && (!player.arsenal?.includes('armoredDash') || (player.ammo?.armoredDash || 0) <= 0)) throw new Error('Investida indisponível.');
  let spiderLeap = false;
  if (arsenalType === 'spider' && !player.spiderClimb) {
    if (!player.arsenal?.includes('spider') || (player.ammo?.spider || 0) <= 0) throw new Error('Aranha indisponível.');
    player.ammo.spider -= 1; player.spiderClimb = true; player.spiderMoves = 2; game.actions.movesLeft = Math.max(game.actions.movesLeft, 3); spiderLeap = true;
  }
  const dir = direction < 0 ? -1 : 1;
  const boostStacks = player.inventory.filter((type) => type === 'movementBoost').length;
  const dashIndex = player.powerupBlockedTurns <= 0 && player.selectedPowerup === 'rocketDash' ? player.inventory.indexOf('rocketDash') : -1;
  const distance = armoredDash ? 285 : spiderLeap ? 230 : dashIndex >= 0 ? 230 : Math.min(138, 72 + boostStacks * 22); const excavatorIndex = player.powerupBlockedTurns <= 0 && player.selectedPowerup === 'excavator' ? player.inventory.indexOf('excavator') : -1;
  const targetX = clamp(player.x + dir * distance, 12, WORLD.width - 12);
  const startX = player.x; const startY = player.y; let x = player.x; let feet = player.y + WORLD.tankRadius; let supportId = player.supportPlatformId; let moved = false; let wallDestroyed = false; const dashContacts = new Set();
  while (Math.abs(targetX - x) > .1) {
    const nextX = x + dir * Math.min(3, Math.abs(targetX - x));
    const support = game.terrain.floatingPlatforms?.find((platform) => platform.id === supportId && platform.active && nextX >= platform.x && nextX <= platform.x + platform.width);
    let nextFeet = support ? support.y : terrainY(game.terrain, nextX);
    const climb = feet - nextFeet;
    if (climb > 6 && excavatorIndex >= 0 && !support) { excavateWall(game.terrain, nextX, dir, feet); nextFeet = terrainY(game.terrain, nextX); }
    else if (climb > 6 && armoredDash && !wallDestroyed && !support) { excavateWall(game.terrain, nextX, dir, feet); nextFeet = terrainY(game.terrain, nextX); wallDestroyed = true; }
    if (feet - nextFeet > 6 && !player.spiderClimb) break;
    x = nextX; feet = nextFeet; moved = true;
    if (armoredDash) for (const target of game.players) if (target.alive && target.id !== player.id && (game.mode !== 'coop' || target.team !== player.team) && Math.abs(target.x - x) <= 21 && Math.abs(target.y - (feet - WORLD.tankRadius)) <= 34) dashContacts.add(target.id);
    if (!support) supportId = null;
    if (feet > WORLD.height) break;
  }
  if (!moved) throw new Error('Inclinação muito alta.');
  player.x = x; player.facing = dir; player.y = feet - WORLD.tankRadius; player.supportPlatformId = supportId;
  if (supportId) {
    const support = game.terrain.floatingPlatforms.find((platform) => platform.id === supportId);
    player.platformOffset = player.x - support.x;
  } else player.platformOffset = null;
  game.actions.movesLeft -= 1;
  if (armoredDash) {
    const hitPlayerIds = [];
    for (const targetId of dashContacts) {
      const target = game.players.find((entry) => entry.id === targetId && entry.alive); if (!target) continue;
      const previousHealth = target.health; let damage = 38;
      if (target.shieldCharges > 0) { damage = Math.ceil(damage * .35); target.shieldCharges -= 1; target.shield = target.shieldCharges > 0; }
      target.health = Math.max(0, target.health - damage); target.alive = target.health > 0; target.x = clamp(target.x + dir * 96, 12, WORLD.width - 12); target.y = terrainY(game.terrain, target.x) - WORLD.tankRadius; target.supportPlatformId = null; target.platformOffset = null;
      player.stats.damage += previousHealth - target.health; hitPlayerIds.push(target.id);
    }
    player.ammo.armoredDash -= 1; game.interactionSerial += 1; player.lastLaunch = { serial: game.interactionSerial, kind: 'armoredDash', fromX: startX, fromY: startY, toX: player.x, toY: player.y, wallDestroyed, hitPlayerIds };
  }
  if (spiderLeap) { game.interactionSerial += 1; player.lastLaunch = { serial: game.interactionSerial, kind: 'spiderLeap', fromX: startX, fromY: startY, toX: player.x, toY: player.y, direction: dir }; }
  if (player.spiderClimb) player.spiderMoves = Math.max(0, game.actions.movesLeft);
  if (excavatorIndex >= 0) { player.inventory.splice(excavatorIndex, 1); if (!player.inventory.includes('excavator')) player.selectedPowerup = null; }
  if (dashIndex >= 0) { player.inventory.splice(dashIndex, 1); if (!player.inventory.includes('rocketDash')) player.selectedPowerup = null; }
  collectPowerups(game, player);
  triggerLauncher(game, player, dir);
  triggerMines(game, player.x, player.y, 22, new Set(), player.id);
  settlePlayers(game);
  if (player.alive) { player.lastSafeX = player.x; player.lastSafeY = player.y; }
  recordEliminations(game);
  if (!player.alive) { nextTurn(room); return; }
  if (game.actions.movesLeft === 0) nextTurn(room);
}

function collectPowerups(game, player) {
  for (const item of game.powerups) {
    if (!item.active || Math.abs(item.x - player.x) > 30 || Math.abs(item.y - player.y) > 110) continue;
    item.active = false;
    grantPowerup(game, player, item.type, item);
  }
}

function grantPowerup(game, player, type, item = null, announce = true) {
  const arsenalPickup = ARSENAL_ITEMS.includes(type);
  if (announce) { game.pickupSerial += 1; player.lastPickup = { serial: game.pickupSerial, type, category: arsenalPickup ? 'arsenal' : 'powerup', contents: item?.loot || null }; }
  if (type === 'lootbox') {
    for (const reward of item?.loot || []) grantPowerup(game, player, reward, null, false);
    return;
  }
  if (arsenalPickup) { if (!player.arsenal.includes(type)) player.arsenal.push(type); player.ammo[type] = (player.ammo[type] || 0) + 1; }
  else if (type === 'heal') player.health = Math.min(player.maxHealth, player.health + 50);
  else if (type === 'shield') { player.shieldCharges = (player.shieldCharges || 0) + 1; player.shield = true; }
  else if (type === 'invisibility') { player.invisibleTurns = (player.invisibleTurns || 0) + 2; player.invisibilityFresh = true; }
  else if (type === 'excavator') player.inventory.push('excavator', 'excavator', 'excavator');
  else if (type === 'ammoCrate') { player.ammo.heavy += 1; player.ammo.cluster += 1; }
  else if (type === 'repairDrone') player.regenTurns = (player.regenTurns || 0) + 3;
  else if (type === 'overcharge') for (const power of player.arsenal || []) player.ammo[power] = 1;
  else player.inventory.push(type);
}

function offerPowerupChoice(room, player) {
  const game = room.game;
  if (!player?.alive || player.turnsPlayed % 3 !== 0) return;
  for (const type of player.arsenal || []) player.ammo[type] = 1;
  const random = seededRandom(`${game.seed}-reward-${player.turnsPlayed}-${player.id}`); const pool = [...POWERUPS]; const choices = [];
  while (choices.length < 3 && pool.length) choices.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  player.rewardOffer = { turn: game.turnNumber, playerTurn: player.turnsPlayed, choices, expiresAt: Date.now() + GAME_TIMING.rewardMs };
  if (player.isBot) autoClaimReward(game, player, random);
}

function autoClaimReward(game, player, random = seededRandom(`${game.seed}-auto-reward-${player.id}-${player.rewardOffer?.playerTurn}`)) { if (!player.rewardOffer) return; grantPowerup(game, player, player.rewardOffer.choices[Math.floor(random() * player.rewardOffer.choices.length)]); player.rewardOffer = null; }

export function claimReward(room, playerId, type) {
  const player = room.game?.players.find((entry) => entry.id === playerId);
  if (!player?.alive || currentPlayer(room.game)?.id !== playerId || !player.rewardOffer?.choices.includes(type)) throw new Error('Recompensa indisponível.');
  grantPowerup(room.game, player, type); player.rewardOffer = null;
}

function createScenarioObjects(terrain, spawns, random) {
  const objects = []; const occupied = [...spawns.map((spawn) => spawn.x)];
  const position = (minimumDistance = 100) => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const x = Math.round(90 + random() * (WORLD.width - 180));
      if (!safeGroundAt(terrain, x) || occupied.some((entry) => Math.abs(entry - x) < minimumDistance)) continue;
      occupied.push(x); return x;
    }
    return null;
  };
  for (let index = 0; index < 8; index += 1) { const x = position(115); if (x) objects.push({ id: `barrel-${index}`, type: 'barrel', x, y: terrainY(terrain, x) - 8, active: true }); }
  for (let index = 0; index < 4; index += 1) { const x = position(150); if (x) objects.push({ id: `launcher-${index}`, type: 'launcher', x, y: terrainY(terrain, x) - 4, direction: random() < .5 ? -1 : 1, active: true, cooldownUntilTurn: 0 }); }
  for (let index = 0; index < 3; index += 1) {
    const switchX = position(190); if (!switchX) continue; const direction = random() < .5 ? -1 : 1; const rampX = Math.round(clamp(switchX + direction * (115 + random() * 100), 65, WORLD.width - 235));
    const ramp = { id: `ramp-${index}`, type: 'ramp', x: rampX, y: terrainY(terrain, rampX), width: 170, direction, active: false };
    objects.push(ramp, { id: `switch-${index}`, type: 'switch', x: switchX, y: terrainY(terrain, switchX) - 5, targetId: ramp.id, active: true, pressed: false });
  }
  for (let index = 0; index < 5; index += 1) { const x = position(180); if (!x) continue; const groundY = terrainY(terrain, x); const height = 58 + Math.round(random() * 38); objects.push({ id: `building-${index}`, type: 'building', x, y: groundY - height / 2, groundY, width: 42 + Math.round(random() * 24), height, durability: 2, active: true }); }
  for (let index = 0; index < 3; index += 1) { const x = position(130); if (!x) continue; const groundY = terrainY(terrain, x); const direction = random() < .5 ? -1 : 1; objects.push({ id: `crane-${index}`, type: 'crane', x, y: groundY - 55, groundY, direction, ballX: x + direction * 72, ballY: groundY - 42, active: true }); }
  for (let index = 0; index < 6; index += 1) { const x = position(90); if (!x) continue; const groundY = terrainY(terrain, x); objects.push({ id: `concrete-${index}`, type: 'concrete', x, y: groundY - 48, groundY, width: 52 + Math.round(random() * 34), active: true }); }
  return objects;
}

export function activateScenarioObjects(game, x, y, radius, visited = new Set()) {
  const interactions = releaseGraveLoot(game, x, y, radius);
  for (const object of game.objects || []) {
    const objectDistance = object.type === 'crane' ? Math.min(Math.hypot(object.x - x, object.y - y), Math.hypot(object.ballX - x, object.ballY - y)) : Math.hypot(object.x - x, object.y - y);
    if (visited.has(object.id) || objectDistance > radius + 18) continue;
    visited.add(object.id);
    if (object.type === 'barrel' && object.active) {
      object.active = false; const blastY = terrainY(game.terrain, object.x) - 5;
      applyExplosion(game, object.x, blastY, 58, 55, { pushMultiplier: 1.25 }); interactions.push({ type: 'barrel', id: object.id, x: object.x, y: blastY });
      interactions.push(...activateScenarioObjects(game, object.x, blastY, 78, visited));
    }
    if (object.type === 'switch' && !object.pressed) {
      object.pressed = true; const ramp = game.objects.find((entry) => entry.id === object.targetId);
      if (ramp) { raiseRamp(game.terrain, ramp); interactions.push({ type: 'ramp', id: ramp.id, x: ramp.x, y: ramp.y }); }
      interactions.push({ type: 'switch', id: object.id, x: object.x, y: object.y });
    }
    if (object.type === 'building' && object.active) {
      object.durability -= 1; interactions.push({ type: 'buildingHit', id: object.id, x: object.x, y: object.y });
      if (object.durability <= 0) { object.active = false; applyStructureCrush(game, object.x, object.groundY, object.width * .8, 64); interactions.push({ type: 'buildingCollapse', id: object.id, x: object.x, y: object.groundY, width: object.width }); }
    }
    if (object.type === 'crane' && object.active) {
      object.active = false; object.ballY = object.groundY - 5; applyStructureCrush(game, object.ballX, object.groundY, 55, 78); interactions.push({ type: 'wreckingBall', id: object.id, x: object.ballX, y: object.groundY });
    }
    if (object.type === 'concrete' && object.active) {
      object.active = false; object.y = object.groundY - 7; applyStructureCrush(game, object.x, object.groundY, object.width * .65, 70); interactions.push({ type: 'concreteFall', id: object.id, x: object.x, y: object.groundY, width: object.width });
    }
  }
  return interactions;
}

function applyStructureCrush(game, x, y, range, baseDamage) {
  for (const player of game.players) {
    if (!player.alive || Math.abs(player.x - x) > range || Math.abs(player.y - y) > 115) continue; let amount = Math.max(18, Math.round(baseDamage * (1 - Math.abs(player.x - x) / (range * 1.25))));
    if (player.shieldCharges > 0) { amount = Math.ceil(amount * .35); player.shieldCharges -= 1; player.shield = player.shieldCharges > 0; }
    player.health = Math.max(0, player.health - amount); player.alive = player.health > 0;
  }
  settlePlayers(game);
}

function releaseGraveLoot(game, x, y, radius) {
  const interactions = [];
  for (const grave of game.graves || []) {
    if (grave.active === false || Math.hypot(grave.x - x, grave.y - y) > radius + 18) continue;
    grave.active = false;
    const loot = grave.loot || [];
    loot.forEach((type, index) => {
      const dropX = clamp(grave.x + (index - (loot.length - 1) / 2) * 24, 18, WORLD.width - 18);
      const dropY = terrainY(game.terrain, dropX) - 12;
      game.interactionSerial += 1;
      game.powerups.push({ id: `grave-drop-${game.interactionSerial}`, type, x: dropX, y: dropY, anchorY: dropY, buriedY: dropY, revealed: true, active: true, source: 'grave' });
    });
    grave.loot = [];
    interactions.push({ type: 'graveLoot', id: grave.id, x: grave.x, y: grave.y, count: loot.length });
  }
  return interactions;
}

function raiseRamp(terrain, ramp) {
  if (ramp.active) return; ramp.active = true; const start = Math.round(ramp.x); const base = terrainY(terrain, start + ramp.width / 2);
  for (let offset = 0; offset <= ramp.width; offset += 1) {
    const progress = offset / ramp.width; const rise = ramp.direction > 0 ? progress : 1 - progress; const px = Math.round(clamp(start + offset, 0, WORLD.width - 1));
    terrain.heights[px] = Math.min(terrain.heights[px], Math.round(base - rise * 92));
  }
  ramp.y = base;
}

function triggerLauncher(game, player, movementDirection) {
  const launcher = (game.objects || []).find((object) => object.type === 'launcher' && object.active && object.cooldownUntilTurn <= game.turnNumber && Math.abs(object.x - player.x) <= 30 && Math.abs(object.y - player.y) <= 24);
  if (!launcher) return;
  const direction = launcher.direction || movementDirection; const fromX = player.x; const fromY = player.y; let landing = null;
  for (let distance = 240; distance >= 100 && !landing; distance -= 10) {
    const candidate = clamp(player.x + direction * distance, 45, WORLD.width - 45);
    for (let offset = 0; offset <= 70; offset += 5) for (const side of offset ? [1, -1] : [1]) { const x = clamp(candidate + side * offset, 45, WORLD.width - 45); if (safeGroundAt(game.terrain, x)) { landing = { x, y: terrainY(game.terrain, x) - WORLD.tankRadius }; break; } }
  }
  if (!landing) return;
  game.interactionSerial += 1; player.x = landing.x; player.y = landing.y; player.supportPlatformId = null; player.platformOffset = null; player.lastLaunch = { serial: game.interactionSerial, fromX, fromY, toX: landing.x, toY: landing.y, direction };
  launcher.cooldownUntilTurn = game.turnNumber + 2;
}

function recordEliminations(game) {
  for (const player of game.players) {
    if (player.alive || player.graveRecorded) continue;
    player.graveRecorded = true; const currentX = clamp(player.x, 12, WORLD.width - 12); const currentGround = terrainY(game.terrain, currentX); const x = currentGround <= WORLD.height ? currentX : clamp(player.lastSafeX ?? currentX, 12, WORLD.width - 12); const ground = terrainY(game.terrain, x); const y = ground <= WORLD.height ? ground - 7 : clamp(player.lastSafeY ?? player.y, 20, WORLD.height - 15);
    const loot = [...player.inventory];
    for (let index = 0; index < (player.shieldCharges || 0); index += 1) loot.push('shield');
    if (player.invisibleTurns > 0) loot.push('invisibility');
    player.inventory = []; player.selectedPowerup = null; player.shieldCharges = 0; player.shield = false;
    game.graves.push({ id: `grave-${player.id}`, playerId: player.id, nickname: player.nickname, color: player.color, x, y, active: true, loot });
  }
  if (game.phase === 'playing') evaluateVictory(game);
}

function evaluateVictory(game) {
  if (!game || game.phase !== 'playing') return game?.phase === 'finished';
  const alive = game.players.filter((player) => player.alive);
  const humans = game.players.filter((player) => player.team === 'humans' || !player.isBot);
  const aliveHumans = alive.filter((player) => player.team === 'humans' || !player.isBot);
  const aliveBots = alive.filter((player) => player.team === 'bots' || player.isBot);
  let finished = alive.length <= 1;
  if (game.mode === 'coop') finished ||= aliveHumans.length === 0 || aliveBots.length === 0;
  else if (humans.length === 1 && game.players.some((player) => player.isBot)) finished ||= aliveHumans.length === 0;
  if (!finished) return false;
  game.phase = 'finished'; game.winningTeam = game.mode === 'coop' ? (aliveHumans.length ? 'humans' : aliveBots.length ? 'bots' : null) : null;
  game.winner = game.mode === 'coop' ? (game.winningTeam === 'humans' ? aliveHumans[0]?.id : aliveBots[0]?.id) || null : alive[0]?.id || null;
  game.actions = { movesLeft: 0, attackAvailable: false }; game.turnEndsAt = null; game.botActAt = null; game.shotEndsAt = null; game.pendingShot = null;
  return true;
}

export function selectPowerup(room, playerId, type) {
  const game = room.game; const player = currentPlayer(game);
  if (game?.phase !== 'playing' || player?.id !== playerId) throw new Error('Escolha powerups somente no seu turno.');
  if (game.shotEndsAt) throw new Error('Aguarde o projétil concluir a trajetória.');
  if (player.powerupBlockedTurns > 0 && type) throw new Error('Circuitos em pane: powerups bloqueados neste turno.');
  if (type === null || type === '') { player.selectedPowerup = null; game.actions.movesLeft = Math.min(game.actions.movesLeft, 2); return; }
  if (!SELECTABLE_POWERUPS.has(type) || !player.inventory.includes(type)) throw new Error('Powerup indisponível.');
  player.selectedPowerup = type;
  if (type === 'excavator') game.actions.movesLeft = Math.max(game.actions.movesLeft, Math.min(3, player.inventory.filter((item) => item === 'excavator').length));
}

export function usePowerup(room, playerId, input = {}) {
  const game = room.game; const player = currentPlayer(game);
  if (game?.phase !== 'playing' || player?.id !== playerId) throw new Error('Use powerups somente no seu turno.');
  if (game.shotEndsAt) throw new Error('Aguarde o projétil concluir a trajetória.');
  if (player.powerupBlockedTurns > 0) throw new Error('Circuitos em pane: powerups bloqueados neste turno.');
  const movementType = ['lightningStep', 'teleport'].includes(input.type) ? input.type : null;
  if (!movementType || player.selectedPowerup !== movementType || !player.inventory.includes(movementType)) throw new Error('Equipe um teleporte primeiro.');
  if (game.actions.movesLeft <= 0) throw new Error('Sem movimentos restantes.');
  const desiredX = Number(input.x);
  const maxRange = movementType === 'teleport' ? 580 : 270;
  if (!Number.isFinite(desiredX) || Math.abs(desiredX - player.x) > maxRange) throw new Error(`Escolha um ponto a até ${maxRange} blocos.`);
  let landing = null;
  for (let distance = 0; distance <= 70 && !landing; distance += 5) for (const direction of distance ? [1, -1] : [1]) {
    const x = Math.round(clamp(desiredX + distance * direction, 30, WORLD.width - 30));
    if (!safeGroundAt(game.terrain, x)) continue;
    const y = terrainY(game.terrain, x) - WORLD.tankRadius;
    if (game.players.some((entry) => entry.alive && entry.id !== player.id && Math.abs(entry.x - x) < 28 && Math.abs(entry.y - y) < 28)) continue;
    landing = { x, y };
  }
  if (!landing) throw new Error('Não há pouso seguro perto desse ponto.');
  const fromX = player.x; const fromY = player.y;
  player.x = landing.x; player.y = landing.y; player.supportPlatformId = null; player.platformOffset = null; player.lastSafeX = landing.x; player.lastSafeY = landing.y;
  game.interactionSerial += 1; player.lastBlink = { serial: game.interactionSerial, playerId: player.id, fromX, fromY, toX: landing.x, toY: landing.y };
  removeInventory(player, movementType); if (!player.inventory.includes(movementType)) player.selectedPowerup = null;
  game.actions.movesLeft -= 1; collectPowerups(game, player); triggerMines(game, player.x, player.y, 22, new Set(), player.id); recordEliminations(game);
  if (!player.alive || game.actions.movesLeft === 0) nextTurn(room);
  return player.lastBlink;
}

export function useArsenal(room, playerId, input = {}) {
  const game = room.game; const player = currentPlayer(game);
  if (game.arenaWarningUntil > Date.now()) throw new Error('Aguarde o impacto do evento da arena.');
  if (game?.phase !== 'playing' || player?.id !== playerId) throw new Error('Use o arsenal somente no seu turno.');
  if (input.type === 'parachute') { if (!player.airborne) throw new Error('O tanque não está no ar.'); player.airborne.parachute = true; player.airborne.vx = 0; player.airborne.vy = Math.min(player.airborne.vy, 28); return player.airborne; }
  if (input.type !== 'jump' || !player.arsenal?.includes('jump') || (player.ammo?.jump || 0) <= 0) throw new Error('Pulo indisponível.');
  if (game.actions.movesLeft <= 0 || player.airborne) throw new Error('Sem movimentos restantes.');
  const angle = clamp(Number(input.angle) || 45, 10, 80) * Math.PI / 180; const power = clamp(Number(input.power) || 260, 120, 480); const direction = Number(input.direction) === -1 ? -1 : 1;
  player.facing = direction; player.ammo.jump -= 1; game.actions.movesLeft -= 1; player.supportPlatformId = null; player.platformOffset = null;
  player.airborne = { vx: Math.cos(angle) * power * direction * .72, vy: -Math.sin(angle) * power * .72, parachute: false, updatedAt: Date.now() }; player.y -= 5;
  return player.airborne;
}

function excavateWall(terrain, startX, direction, feet) {
  for (let step = 0; step <= 34; step += 1) {
    const x = Math.round(clamp(startX + direction * step, 0, WORLD.width - 1)); const half = Math.max(3, 12 - Math.abs(step - 12) * .25);
    for (let dx = -half; dx <= half; dx += 1) { const px = Math.round(clamp(x + dx, 0, WORLD.width - 1)); terrain.heights[px] = Math.max(terrain.heights[px], Math.round(feet + 7)); }
  }
}

function triggerMines(game, x, y, range, visited = new Set(), triggeringPlayerId = null) {
  for (const mine of game.mines) {
    if (!mine.active || visited.has(mine.id) || (triggeringPlayerId && mine.ownerId === triggeringPlayerId) || Math.hypot(mine.x - x, mine.y - y) > range) continue;
    visited.add(mine.id); mine.active = false;
    applyExplosion(game, mine.x, mine.y, 38, 42, { sourcePlayerId: mine.ownerId });
    activateScenarioObjects(game, mine.x, mine.y, 38);
    triggerMines(game, mine.x, mine.y, 85, visited, triggeringPlayerId);
  }
}

function simulateMoleBomb(game, player) {
  const target = game.players.filter((entry) => entry.alive && entry.id !== player.id && entry.invisibleTurns <= 0 && (game.mode !== 'coop' || entry.team !== player.team)).sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0];
  const steps = Math.round(SHOT_PATH_RATE * 1.5); const maxTravel = 760; const desiredX = target ? player.x + clamp(target.x - player.x, -maxTravel, maxTravel) : player.x + player.facing * maxTravel; const destinationX = clamp(desiredX, 20, WORLD.width - 20); const path = []; let impact = null;
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps; const x = player.x + (destinationX - player.x) * progress; const ground = terrainY(game.terrain, x);
    if (ground > WORLD.height) { impact = { x: Math.round(x), y: WORLD.height - 8, fellIntoHole: true }; path.push({ x: Math.round(x), y: WORLD.height - 8, underground: true, falling: true }); break; }
    const y = ground + 10 + Math.sin(progress * Math.PI * 6) * 3; path.push({ x: Math.round(x), y: Math.round(y), underground: true });
    if (target && Math.abs(x - target.x) <= 12) { impact = { x: target.x, y: target.y, playerId: target.id }; break; }
  }
  impact ||= { x: path.at(-1)?.x ?? destinationX, y: path.at(-1)?.y ?? terrainY(game.terrain, destinationX), timedOut: true };
  return { path, collectedPowerupIds: [], burrow: true, impact };
}

function simulateLaser(game, player, angle, power) {
  const radians = angle * Math.PI / 180; const direction = player.facing; const distance = Math.min(1450, 620 + power * 1.35); const path = []; const hitPlayerIds = []; const collectedPowerupIds = [];
  for (let step = 0; step <= distance; step += 12) { const x = player.x + Math.cos(radians) * step * direction; const y = player.y - Math.sin(radians) * step; if (x < 2 || x >= WORLD.width - 2 || y < 2 || y > WORLD.height) break; path.push({ x: Math.round(x), y: Math.round(y), laser: true }); for (const target of game.players) if (target.alive && target.id !== player.id && !hitPlayerIds.includes(target.id) && Math.hypot(target.x - x, target.y - y) <= 18) hitPlayerIds.push(target.id); for (const item of game.powerups) if (item.active && item.revealed !== false && !collectedPowerupIds.includes(item.id) && Math.hypot(item.x - x, item.y - y) <= 16) collectedPowerupIds.push(item.id); }
  const impact = path.at(-1) || { x: player.x, y: player.y }; return { path, collectedPowerupIds, hitPlayerIds, laser: true, impact: { x: impact.x, y: impact.y } };
}

function applyLaserDamage(game, result, sourcePlayer) {
  for (let index = 4; index < result.path.length; index += 3) carveTerrain(game.terrain, result.path[index].x, result.path[index].y, 11);
  for (const platform of game.terrain.floatingPlatforms || []) if (platform.active && result.path.some((point) => point.x >= platform.x && point.x <= platform.x + platform.width && Math.abs(point.y - platform.y) < 16)) { platform.durability = Math.max(0, platform.durability - 95); if (!platform.durability) platform.active = false; }
  const damage = []; for (const id of result.hitPlayerIds || []) { const target = game.players.find((entry) => entry.id === id && entry.alive); if (!target || (game.mode === 'coop' && target.team === sourcePlayer.team)) continue; let amount = 72; if (target.shieldCharges > 0) { amount = Math.ceil(amount * .35); target.shieldCharges -= 1; target.shield = target.shieldCharges > 0; } target.health = Math.max(0, target.health - amount); if (!target.health) target.alive = false; damage.push({ playerId: target.id, amount, knockback: 0 }); }
  settlePlayers(game); return damage;
}

function applyGravityWell(game, x, y) {
  const radius = 230; const damage = [];
  for (const target of game.players) {
    if (!target.alive) continue; const distance = Math.hypot(target.x - x, target.y - y); if (distance > radius) continue;
    let amount = Math.max(4, Math.round(18 * (1 - distance / radius)));
    if (target.shieldCharges > 0) { amount = Math.ceil(amount * .35); target.shieldCharges -= 1; target.shield = target.shieldCharges > 0; }
    target.health = Math.max(0, target.health - amount); target.alive = target.health > 0; target.x = clamp(target.x + (x - target.x) * .68, 4, WORLD.width - 4); target.supportPlatformId = null; target.platformOffset = null; damage.push({ playerId: target.id, amount, knockback: -Math.round((radius - distance) * .68) });
  }
  settlePlayers(game); return damage;
}

export function fire(room, playerId, input) {
  const game = room.game;
  if (game.arenaWarningUntil > Date.now()) throw new Error('Aguarde o impacto do evento da arena.');
  updateMovingPlatforms(game);
  const player = currentPlayer(game);
  if (game.shotEndsAt) throw new Error('Já existe um projétil em voo.');
  if (game.phase !== 'playing' || player?.id !== playerId) throw new Error('Não é seu turno.');
  if (!game.actions.attackAvailable) throw new Error('Ataque indisponível.');
  const angle = clamp(Number(input.angle) || 45, 5, 85);
  const power = clamp(Number(input.power) || 260, 100, 580);
  if (Number(input.direction) === -1 || Number(input.direction) === 1) player.facing = Number(input.direction);
  const weapon = ['standard', ...ARSENAL_ITEMS.filter((type) => !['jump', 'spider', 'armoredDash'].includes(type))].includes(input.weapon) ? input.weapon : 'standard';
  if (weapon !== 'standard' && (!player.arsenal?.includes(weapon) || (player.ammo?.[weapon] || 0) <= 0)) throw new Error('Poder indisponível ou aguardando recarga.');
  if (weapon !== 'standard') player.ammo[weapon] -= 1;
  if (player.isBot && !player.selectedPowerup && player.powerupBlockedTurns <= 0) player.selectedPowerup = player.inventory.find((type) => SELECTABLE_POWERUPS.has(type) && !['excavator', 'rocketDash', 'lightningStep'].includes(type)) || null;
  const selected = player.powerupBlockedTurns > 0 ? null : player.inventory.includes(player.selectedPowerup) ? player.selectedPowerup : null;
  const megaIndex = selected === 'megaMissile' ? player.inventory.indexOf('megaMissile') : -1;
  const freezeIndex = selected === 'freeze' ? player.inventory.indexOf('freeze') : -1;
  const tripleIndex = selected === 'tripleShot' ? player.inventory.indexOf('tripleShot') : -1;
  const doubleIndex = selected === 'doubleShot' ? player.inventory.indexOf('doubleShot') : -1;
  const bigExplosionIndex = selected === 'bigExplosion' ? player.inventory.indexOf('bigExplosion') : -1;
  const armorPiercer = selected === 'armorPiercer'; const shockwave = selected === 'shockwave'; const bunkerBuster = selected === 'bunkerBuster'; const bridgeKit = selected === 'bridgeKit'; const molotov = selected === 'molotov'; const laser = selected === 'laser';
  const megaMissile = megaIndex >= 0;
  const shotModifier = tripleIndex >= 0 ? 'tripleShot' : doubleIndex >= 0 ? 'doubleShot' : null;
  const powerupShots = shotModifier === 'tripleShot' ? 3 : shotModifier === 'doubleShot' ? 2 : 1;
  const shots = megaMissile ? 1 : ['cluster', 'mineLayer'].includes(weapon) ? 3 : powerupShots;
  const spread = megaMissile ? [0] : weapon === 'mineLayer' ? [-12, 0, 12] : weapon === 'cluster' ? [-8, 0, 8] : shots === 3 ? [-5, 0, 5] : shots === 2 ? [-3, 3] : [0];
  const radius = bunkerBuster ? 92 : shockwave ? 82 : megaMissile ? 190 : weapon === 'heavy' ? 70 : weapon === 'moleBomb' ? 68 : weapon === 'grenade' ? 60 : weapon === 'cluster' ? 34 : weapon === 'gravity' ? 230 : bigExplosionIndex >= 0 ? 72 : 48;
  const baseDamage = shockwave ? 24 : bunkerBuster ? 58 : megaMissile ? 135 : weapon === 'heavy' ? 62 : weapon === 'moleBomb' ? 66 : weapon === 'grenade' ? 58 : weapon === 'cluster' ? 24 : weapon === 'gravity' ? 18 : ['fireworks', 'zeus', 'verticalStrike'].includes(weapon) ? 34 : 44;
  const guidedIndex = selected === 'guidedBullet' ? player.inventory.indexOf('guidedBullet') : -1;
  const teleportIndex = selected === 'teleport' ? player.inventory.indexOf('teleport') : -1;
  const guidedTarget = guidedIndex >= 0
    ? game.players.filter((p) => p.alive && p.id !== player.id && p.invisibleTurns <= 0 && (game.mode !== 'coop' || p.team !== player.team)).sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0]
    : null;
  const results = []; let teleported = false; let bridgeBuilt = false; const shotOrigin = { x: player.x, y: player.y };
  player.stats.shots += shots;
  for (const offset of spread) {
    const result = laser ? simulateLaser(game, player, angle + offset, power) : weapon === 'grenade'
      ? simulateBouncingGrenade({ terrain: game.terrain, powerups: game.powerups, x: shotOrigin.x, y: shotOrigin.y, angle: angle + offset, power, gravity: room.rules.gravity, wind: game.wind, direction: player.facing })
      : weapon === 'moleBomb' ? simulateMoleBomb(game, player) : weapon === 'verticalStrike' ? simulateVerticalStrike({ terrain: game.terrain, players: game.players, powerups: game.powerups, ignorePlayerId: player.id, x: shotOrigin.x, y: shotOrigin.y, angle: angle + offset, power, gravity: room.rules.gravity, wind: game.wind, direction: player.facing }) : simulateShot({ terrain: game.terrain, players: game.players, powerups: game.powerups, ignorePlayerId: player.id, guidedTarget, x: shotOrigin.x, y: shotOrigin.y, angle: angle + offset, power, gravity: room.rules.gravity, wind: game.wind, direction: player.facing });
    for (const id of result.collectedPowerupIds || []) { const item = game.powerups.find((entry) => entry.id === id && entry.active); if (item) { item.active = false; grantPowerup(game, player, item.type, item); } }
    if (result.impact) {
      const impactRadius = radius;
      const impactDamage = baseDamage;
      const before = new Map(game.players.map((p) => [p.id, p.health]));
      const deployMine = weapon === 'mineLayer'; const gravityWell = weapon === 'gravity'; const damage = laser ? applyLaserDamage(game, result, player) : deployMine ? [] : gravityWell ? applyGravityWell(game, result.impact.x, result.impact.y) : applyExplosion(game, result.impact.x, result.impact.y, impactRadius, impactDamage, { ignoreShield: armorPiercer, pushMultiplier: shockwave ? 2.8 : 1, sourcePlayerId: player.id });
      const interactions = laser ? [{ type: 'laser', x: result.impact.x, y: result.impact.y }] : deployMine || gravityWell ? [] : activateScenarioObjects(game, result.impact.x, result.impact.y, impactRadius);
      if (deployMine) { game.interactionSerial += 1; const mine = { id: `thrown-mine-${game.interactionSerial}`, x: result.impact.x, y: terrainY(game.terrain, result.impact.x) - 3, active: true, ownerId: player.id }; game.mines.push(mine); interactions.push({ type: 'mineDeploy', id: mine.id, x: mine.x, y: mine.y }); }
      if (molotov) { game.interactionSerial += 1; game.fireZones.push({ id: `fire-${game.interactionSerial}`, x: result.impact.x, y: result.impact.y, radius: 92, turnsLeft: 3, ownerId: player.id }); interactions.push({ type: 'molotov', x: result.impact.x, y: result.impact.y }); }
      if (weapon === 'fireworks') for (let burst = 0; burst < 3; burst += 1) { const a = (burst / 3) * Math.PI * 2 + game.turnNumber; const bx = clamp(result.impact.x + Math.cos(a) * 62, 5, WORLD.width - 5); const by = result.impact.y + Math.sin(a) * 28; applyExplosion(game, bx, by, 30, 20, { sourcePlayerId: player.id }); interactions.push({ type: 'firework', x: bx, y: by }); }
      if (weapon === 'zeus') { applyExplosion(game, result.impact.x, result.impact.y, 92, 18, { pushMultiplier: 3.2, sourcePlayerId: player.id }); interactions.push({ type: 'zeus', x: result.impact.x, y: result.impact.y }); }
      if (weapon === 'gravity') {
        interactions.push({ type: 'gravity', x: result.impact.x, y: result.impact.y, radius: 230 });
      }
      for (const item of game.powerups) if (item.active && item.revealed && Math.hypot(item.x - result.impact.x, item.y - result.impact.y) <= impactRadius) { item.active = false; grantPowerup(game, player, item.type, item); interactions.push({ type: 'powerupBurst', id: item.id, powerupType: item.type, x: item.x, y: item.y }); }
      if (bridgeKit && !bridgeBuilt) { interactions.push(buildBridge(game, result.impact)); bridgeBuilt = true; }
      const frozenPlayerIds = [];
      if (freezeIndex >= 0) for (const hit of damage) {
        const target = game.players.find((entry) => entry.id === hit.playerId);
        if (target?.alive && target.id !== player.id && hit.amount > 0) { target.frozenTurns = Math.max(target.frozenTurns || 0, 2); frozenPlayerIds.push(target.id); }
      }
      for (const hit of damage) if (hit.playerId !== player.id) player.stats.damage += before.get(hit.playerId) - game.players.find((p) => p.id === hit.playerId).health;
      if (!gravityWell) triggerMines(game, result.impact.x, result.impact.y, radius + 25);
      let teleport = null;
      if (!teleported && teleportIndex >= 0 && player.alive) {
        const landing = findTeleportLanding(game, result.impact);
        if (landing) {
          teleport = { playerId: player.id, fromX: player.x, fromY: player.y, toX: landing.x, toY: landing.y };
          player.x = landing.x; player.y = landing.y; player.supportPlatformId = landing.supportPlatformId; player.platformOffset = landing.platformOffset; teleported = true;
        }
      }
      results.push({ ...result, damage, radius: impactRadius, weapon, teleport, megaMissile, laser, freeze: freezeIndex >= 0, armorPiercer, shockwave, bunkerBuster, bridgeKit, noExplosion: deployMine || laser || gravityWell, interactions, frozenPlayerIds });
    } else results.push({ ...result, damage: [], radius, weapon, megaMissile, freeze: freezeIndex >= 0, armorPiercer, shockwave, bunkerBuster, interactions: [], frozenPlayerIds: [] });
  }
  if (shotModifier && !megaMissile) removeInventory(player, shotModifier);
  if (megaMissile) removeInventory(player, 'megaMissile');
  else if (bigExplosionIndex >= 0) removeInventory(player, 'bigExplosion');
  if (freezeIndex >= 0) removeInventory(player, 'freeze');
  if (guidedIndex >= 0) player.inventory.splice(player.inventory.indexOf('guidedBullet'), 1);
  if (teleported) player.inventory.splice(player.inventory.indexOf('teleport'), 1);
  if (['armorPiercer', 'shockwave', 'bunkerBuster'].includes(selected)) removeInventory(player, selected);
  if (bridgeBuilt) removeInventory(player, 'bridgeKit');
  if (molotov) removeInventory(player, 'molotov');
  // nextTurn decrements the departing player's counter immediately; two
  // charges therefore immobilize the shooter's next playable turn.
  if (laser) { removeInventory(player, 'laser'); player.frozenTurns = Math.max(player.frozenTurns || 0, 2); }
  const extra = selected === 'extraShot' ? player.inventory.indexOf('extraShot') : -1;
  const extraShot = extra >= 0 && player.alive && game.players.filter((p) => p.alive).length > 1;
  if (extra >= 0) player.inventory.splice(extra, 1);
  if (selected && !player.inventory.includes(selected)) player.selectedPowerup = null;
  recordEliminations(game);
  const longestPath = Math.max(...results.map((result) => result.path.length), 12);
  game.shotEndsAt = Date.now() + Math.ceil(longestPath / SHOT_PATH_RATE * 1000 / room.rules.gameSpeed);
  game.pendingShot = { shooterId: player.id, extraShot };
  game.actions = { movesLeft: 0, attackAvailable: false };
  game.turnEndsAt = game.shotEndsAt;
  return results;
}

function buildBridge(game, impact) {
  const width = 220; const x = Math.round(clamp(impact.x - width / 2, 14, WORLD.width - width - 14));
  const y = Math.round(clamp(impact.y - 8, 150, WORLD.height - 32));
  game.interactionSerial += 1;
  const platform = { id: `bridge-${game.interactionSerial}`, kind: 'bridge', x, baseX: x, y, width, height: 9, moving: false, amplitude: 0, period: 1, phase: 0, durability: 155, active: true };
  game.terrain.floatingPlatforms ||= []; game.terrain.floatingPlatforms.push(platform);
  return { type: 'bridge', id: platform.id, x: x + width / 2, y, width };
}

function removeInventory(player, type) {
  const index = player.inventory.indexOf(type);
  if (index >= 0) player.inventory.splice(index, 1);
}

export function findTeleportLanding(game, impact) {
  const platform = impact.platformId && game.terrain.floatingPlatforms?.find((entry) => entry.id === impact.platformId && entry.active);
  if (platform) {
    const x = clamp(impact.x, platform.x + 14, platform.x + platform.width - 14);
    if (!game.players.some((player) => player.alive && Math.abs(player.x - x) < 24 && Math.abs(player.y - (platform.y - WORLD.tankRadius)) < 24)) return { x, y: platform.y - WORLD.tankRadius, supportPlatformId: platform.id, platformOffset: x - platform.x };
  }
  for (let distance = 0; distance <= 220; distance += 5) for (const direction of distance ? [1, -1] : [1]) {
    const x = Math.round(clamp(impact.x + distance * direction, 45, WORLD.width - 45));
    if (!safeGroundAt(game.terrain, x)) continue;
    const y = terrainY(game.terrain, x) - WORLD.tankRadius;
    if (game.players.some((player) => player.alive && Math.abs(player.x - x) < 26 && Math.abs(player.y - y) < 26)) continue;
    return { x, y, supportPlatformId: null, platformOffset: null };
  }
  return null;
}

export function windForTurn(seed, turnNumber) {
  const random = seededRandom(`${seed}-wind-${turnNumber}`);
  const value = Math.round((random() * 2 - 1) * 28);
  return Math.abs(value) < 4 ? 0 : value;
}

function landPlayer(game, player) {
  player.x = clamp(player.x, 12, WORLD.width - 12);
  const ground = terrainY(game.terrain, player.x);
  if (ground > WORLD.height) {
    player.alive = false; player.health = 0; player.airborne = null; player.supportPlatformId = null; player.platformOffset = null;
    recordEliminations(game); return;
  }
  player.y = ground - WORLD.tankRadius; player.airborne = null;
  player.lastSafeX = player.x; player.lastSafeY = player.y; collectPowerups(game, player); triggerMines(game, player.x, player.y, 22, new Set(), player.id);
}

function updateAirborne(game, now) {
  let changed = false; let playerFell = false;
  for (const player of game.players) {
    if (!player.alive || !player.airborne) continue;
    const flight = player.airborne; const dt = Math.min(.35, Math.max(.02, (now - flight.updatedAt) / 1000)); flight.updatedAt = now;
    if (flight.parachute) { flight.vx *= Math.pow(.04, dt); flight.vy = Math.min(52, flight.vy + 45 * dt); } else flight.vy += game.gravity * dt;
    const previousX = player.x; const previousY = player.y; const nextX = clamp(player.x + flight.vx * dt, 12, WORLD.width - 12); const nextY = player.y + flight.vy * dt; const nextGround = terrainY(game.terrain, nextX) - WORLD.tankRadius;
    const wallAhead = Math.abs(nextX - previousX) > .1 && nextGround < nextY - 4 && terrainY(game.terrain, previousX) - WORLD.tankRadius > nextY - 18;
    player.x = wallAhead ? previousX : nextX; if (wallAhead) flight.vx = 0; player.y = nextY;
    const terrainBelow = terrainY(game.terrain, player.x);
    if (terrainBelow > WORLD.height && player.y + WORLD.tankRadius >= WORLD.height) {
      player.alive = false; player.health = 0; player.airborne = null; player.supportPlatformId = null; player.platformOffset = null; playerFell = true; changed = true; continue;
    }
    const landingPlatform = flight.vy >= 0 ? game.terrain.floatingPlatforms?.filter((platform) => platform.active && player.x >= platform.x - WORLD.tankRadius && player.x <= platform.x + platform.width + WORLD.tankRadius && previousY + WORLD.tankRadius <= platform.y && player.y + WORLD.tankRadius >= platform.y).sort((a, b) => a.y - b.y)[0] : null;
    if (landingPlatform) { player.y = landingPlatform.y - WORLD.tankRadius; player.supportPlatformId = landingPlatform.id; player.platformOffset = player.x - landingPlatform.x; player.airborne = null; player.lastSafeX = player.x; player.lastSafeY = player.y; collectPowerups(game, player); }
    else { const ground = terrainY(game.terrain, player.x) - WORLD.tankRadius; if (player.y >= ground && flight.vy >= 0) landPlayer(game, player); }
    changed = true;
  }
  if (playerFell) recordEliminations(game);
  return changed;
}

function applyFireZones(game) {
  for (const zone of game.fireZones || []) {
    const owner = game.players.find((player) => player.id === zone.ownerId);
    for (const target of game.players) if (target.alive && (game.mode !== 'coop' || !owner || target.id === owner.id || target.team !== owner.team) && Math.hypot(target.x - zone.x, target.y - zone.y) <= zone.radius) target.health = Math.max(0, target.health - 12);
    zone.turnsLeft -= 1;
  }
  game.fireZones = (game.fireZones || []).filter((zone) => zone.turnsLeft > 0); recordEliminations(game);
}

export function tickRoom(room) {
  const game = room.game;
  if (!game) return null;
  const now = Date.now();
  if (game.phase === 'arsenal') {
    if (now < game.arsenalEndsAt) return null;
    const random = seededRandom(`${game.seed}-first-player`); const eligible = game.players.map((_, index) => index); const winnerIndex = eligible[Math.floor(random() * eligible.length)];
    const sequence = Array.from({ length: 18 }, () => eligible[Math.floor(random() * eligible.length)]); sequence.push(winnerIndex);
    game.turnIndex = winnerIndex; game.rouletteSequence = sequence; game.rouletteStartedAt = now; game.rouletteSpinEndsAt = now + GAME_TIMING.rouletteSpinMs; game.rouletteEndsAt = game.rouletteSpinEndsAt + GAME_TIMING.rouletteRevealMs; game.phase = 'roulette'; return { changed: true };
  }
  if (game.phase === 'roulette') {
    if (now < game.rouletteEndsAt) return null;
    game.phase = 'playing'; const starter = currentPlayer(game); starter.turnsPlayed = 1; game.turnEndsAt = now + room.rules.turnSeconds * 1000 / room.rules.gameSpeed; game.botActAt = now + botDelay(room.rules.botDifficulty) / room.rules.gameSpeed; return { changed: true };
  }
  if (game.phase !== 'playing') return null;
  if (game.pendingArenaEvent) {
    if (now < game.pendingArenaEvent.executeAt) return null;
    resolveArenaEvent(game); return { changed: true };
  }
  let rewardsChanged = false;
  for (const player of game.players) if (player.rewardOffer && now >= player.rewardOffer.expiresAt) { autoClaimReward(game, player); rewardsChanged = true; }
  if (rewardsChanged) return { changed: true };
  const airborneChanged = updateAirborne(game, now);
  if (game.phase !== 'playing') return { changed: true };
  if (airborneChanged && !currentPlayer(game)?.alive) { nextTurn(room); return { changed: true }; }
  updateMovingPlatforms(game);
  if (game.shotEndsAt) {
    if (Date.now() < game.shotEndsAt) return airborneChanged ? { changed: true } : null;
    finishPendingShot(room); return { changed: true };
  }
  if (airborneChanged) return { changed: true };
  if (Date.now() >= game.turnEndsAt) { nextTurn(room); return { changed: true }; }
  const bot = currentPlayer(game);
  if (!bot?.isBot || Date.now() < game.botActAt) return null;
  const targets = game.players.filter((player) => player.alive && player.id !== bot.id && player.invisibleTurns <= 0 && (game.mode !== 'coop' || player.team !== bot.team));
  if (!targets.length) { nextTurn(room); return { changed: true }; }
  const target = targets.sort((a, b) => Math.abs(a.x - bot.x) - Math.abs(b.x - bot.x))[0];
  const difficulty = room.rules.botDifficulty;
  const random = seededRandom(`${game.seed}-bot-${game.turnNumber}-${bot.id}-${game.actions.movesLeft}`);
  let direction = target.x < bot.x ? -1 : 1;
  let shouldMove = difficulty === 'easy' ? random() > .68 : Math.abs(target.x - bot.x) > 180;
  if (difficulty === 'hard') {
    const item = game.powerups.filter((entry) => entry.active).sort((a, b) => Math.abs(a.x - bot.x) - Math.abs(b.x - bot.x))[0];
    if (item && Math.abs(item.x - bot.x) < 320) { direction = item.x < bot.x ? -1 : 1; shouldMove = true; }
  }
  if (game.actions.movesLeft === 2 && shouldMove) {
    if (difficulty === 'easy' && random() > .55) direction *= -1;
    try { movePlayer(room, bot.id, direction); } catch { game.actions.movesLeft = 1; }
    game.botActAt = Date.now() + Math.round(botDelay(difficulty) * .58);
    return { changed: true };
  }
  const aim = chooseBotShot(room, bot, target, difficulty);
  bot.facing = aim.direction;
  const weapon = chooseBotWeapon(game, bot, target, difficulty, random);
  const results = fire(room, bot.id, { angle: aim.angle, power: aim.power, direction: aim.direction, weapon });
  return { changed: true, shot: { shooterId: bot.id, results } };
}

export function finishPendingShot(room) {
  const game = room.game; const pending = game.pendingShot;
  game.shotEndsAt = null; game.pendingShot = null;
  const shooter = game.players.find((player) => player.id === pending?.shooterId);
  if (game.players.filter((player) => player.alive).length <= 1 || !pending?.extraShot || !shooter?.alive) { nextTurn(room); return; }
  game.actions = { movesLeft: 0, attackAvailable: true };
  game.turnEndsAt = Date.now() + room.rules.turnSeconds * 1000 / room.rules.gameSpeed;
  game.botActAt = Date.now() + botDelay(room.rules.botDifficulty) / room.rules.gameSpeed;
}

export function updateMovingPlatforms(game, now = Date.now()) {
  if (!game?.terrain?.floatingPlatforms) return;
  for (const platform of game.terrain.floatingPlatforms) {
    platform.x = movingPlatformX(platform, game.platformEpoch, now);
    if (!platform.active) continue;
    for (const player of game.players) {
      if (!player.alive || player.supportPlatformId !== platform.id) continue;
      player.x = clamp(platform.x + player.platformOffset, 4, WORLD.width - 4);
      player.y = platform.y - WORLD.tankRadius;
    }
  }
}

function safeGroundAt(terrain, x) {
  const samples = []; for (let dx = -28; dx <= 28; dx += 4) samples.push(terrainY(terrain, x + dx));
  return samples.every((y) => y < WORLD.height - 18) && Math.max(...samples) - Math.min(...samples) <= 26;
}

function arenaGroundX(game, random, minimumPlayerDistance = 90) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const x = Math.round(70 + random() * (WORLD.width - 140));
    if (!safeGroundAt(game.terrain, x)) continue;
    if (game.players.some((player) => player.alive && Math.abs(player.x - x) < minimumPlayerDistance)) continue;
    return x;
  }
  return findSpawns(game.terrain, 1)[0].x;
}

function arenaImpactX(game, random, playerChance = .55, scatter = 90, minimumPlayerDistance = 0) {
  const alive = game.players.filter((player) => player.alive && Number.isFinite(player.x));
  if (alive.length && random() < playerChance) {
    const target = alive[Math.floor(random() * alive.length)];
    const x = Math.round(clamp(target.x + (random() - .5) * scatter * 2, 35, WORLD.width - 35));
    if (terrainY(game.terrain, x) <= WORLD.height) return x;
  }
  return arenaGroundX(game, random, minimumPlayerDistance);
}

function randomLootboxContents(random, count = 3) {
  const pool = [...COLLECTIBLE_ITEMS]; const rewards = [];
  while (rewards.length < count && pool.length) rewards.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return rewards;
}

export function applyArenaPulse(room) {
  const game = room.game;
  if (!game || game.phase !== 'playing' || game.turnNumber % 3 !== 0) return null;
  const random = seededRandom(`${game.seed}-arena-${game.turnNumber}`);
  const drops = []; const impacts = []; let eventType = 'supply';
  if (game.turnNumber >= 9) {
    const longEvents = ['supply', 'bombardment', 'lightning', 'collapse', 'tectonic', 'luckyWinds']; eventType = longEvents[Math.floor(random() * longEvents.length)];
  } else if (game.turnNumber % 6 === 0) eventType = 'quake';

  if (eventType === 'supply') {
    const dropCount = game.players.length >= 5 ? 5 : 4; const hasLootbox = random() * 100 < SUPPLY_LOOTBOX_CHANCE; const lootboxIndex = hasLootbox ? Math.floor(random() * dropCount) : -1;
    for (let index = 0; index < dropCount; index += 1) {
      const x = arenaGroundX(game, random, 55); const type = index === lootboxIndex ? 'lootbox' : COLLECTIBLE_ITEMS[Math.floor(random() * COLLECTIBLE_ITEMS.length)];
      drops.push({ id: `airdrop-${game.seed}-${game.turnNumber}-${index}`, type, x, y: terrainY(game.terrain, x) - 12, buried: false, loot: type === 'lootbox' ? randomLootboxContents(random) : null, releaseProgress: .24 + index * (.52 / Math.max(1, dropCount - 1)) });
    }
  } else {
    const count = eventType === 'bombardment' ? 6 : eventType === 'lightning' ? 4 : eventType === 'tectonic' ? 3 : eventType === 'luckyWinds' ? 3 : eventType === 'quake' ? 2 : 7;
    for (let index = 0; index < count; index += 1) {
      const x = eventType === 'lightning' ? arenaImpactX(game, random, .82, 58) : eventType === 'bombardment' ? arenaImpactX(game, random, .48, 130) : eventType === 'luckyWinds' ? arenaImpactX(game, random, .85, 120) : arenaGroundX(game, random, eventType === 'tectonic' ? 250 : 110);
      const y = terrainY(game.terrain, x);
      const radius = eventType === 'bombardment' ? 32 + index * 9 : eventType === 'lightning' ? 74 : eventType === 'tectonic' ? 185 + Math.round(random() * 70) : eventType === 'luckyWinds' ? 270 + Math.round(random() * 80) : eventType === 'collapse' ? 44 : 22 + Math.round(random() * 9);
      impacts.push({ x, y, radius, kind: eventType, damage: eventType === 'bombardment' ? 16 + index * 5 : eventType === 'lightning' ? 24 : 8, heal: eventType === 'luckyWinds' ? 40 : 0, delay: eventType === 'bombardment' ? index * .09 : index * .04, tectonicMode: eventType === 'tectonic' ? ['mountain', 'rise', 'sink'][index % 3] : null, magnitude: eventType === 'tectonic' ? 90 + Math.round(random() * 75) : null });
    }
  }
  const labels = { supply: `SUPRIMENTOS AÉREOS • ${drops.length} CARGAS`, quake: 'ABALO DA ARENA!', bombardment: 'BOMBARDEIO PROGRESSIVO!', lightning: 'TEMPESTADE ELÉTRICA!', collapse: 'COLAPSO DO CENÁRIO!', tectonic: 'EVENTO TECTÔNICO!', luckyWinds: 'VENTOS DE SORTE!' };
  const startedAt = Date.now(); const warningMs = eventType === 'supply' ? GAME_TIMING.supplyFlyoverMs : GAME_TIMING.arenaWarningMs;
  const event = { id: `arena-${game.seed}-${game.turnNumber}`, turn: game.turnNumber, type: eventType, drops, impacts, label: labels[eventType], warning: true, warningStartedAt: startedAt, executeAt: startedAt + warningMs, lootboxChance: eventType === 'supply' ? SUPPLY_LOOTBOX_CHANCE : undefined, helicopter: eventType === 'supply' ? { direction: random() < .5 ? 1 : -1, altitude: 115 } : undefined };
  game.arenaWarningUntil = event.executeAt; game.pendingArenaEvent = { eventId: event.id, executeAt: event.executeAt };
  game.events.push(event); if (game.events.length > 8) game.events.shift(); return event;
}

function resolveArenaEvent(game) {
  const pending = game.pendingArenaEvent; const event = game.events.find((entry) => entry.id === pending?.eventId); if (!event) { game.pendingArenaEvent = null; game.arenaWarningUntil = null; return; }
  if (event.type === 'supply') for (const drop of event.drops || []) game.powerups.push({ ...drop, y: terrainY(game.terrain, drop.x) - 12, anchorY: terrainY(game.terrain, drop.x) - 12, buriedY: terrainY(game.terrain, drop.x) - 12, revealed: true, active: true, source: 'helicopter' });
  for (const impact of event.impacts || []) {
    if (event.type === 'tectonic') applyTectonicShift(game.terrain, impact);
    else if (event.type === 'quake') carveTerrain(game.terrain, impact.x, impact.y, impact.radius);
    else if (event.type === 'lightning') {
      const nearby = game.players.filter((player) => player.alive && Math.hypot(player.x - impact.x, player.y - impact.y) <= impact.radius * 1.55);
      for (const player of nearby) player.powerupBlockedTurns = Math.max(player.powerupBlockedTurns || 0, 1);
      event.blockedPlayerIds ||= []; event.blockedPlayerIds.push(...nearby.map((player) => player.id));
      applyExplosion(game, impact.x, impact.y, impact.radius, impact.damage);
    } else if (event.type !== 'luckyWinds') applyExplosion(game, impact.x, impact.y, impact.radius, impact.damage);
  }
  if (event.type === 'luckyWinds') {
    const healed = game.players.filter((player) => player.alive && (event.impacts || []).some((zone) => Math.hypot(player.x - zone.x, player.y - zone.y) <= zone.radius));
    for (const player of healed) player.health = Math.min(player.maxHealth, player.health + 40);
    event.healedPlayerIds = healed.map((player) => player.id);
  }
  if (event.type === 'tectonic') {
    const random = seededRandom(`${event.id}-tank-shift`); event.tectonicMoves = [];
    for (const player of game.players) {
      if (!player.alive || player.airborne) continue; const fromX = player.x; const shift = (random() < .5 ? -1 : 1) * (16 + Math.round(random() * 22));
      player.x = clamp(player.x + shift, 4, WORLD.width - 4); player.supportPlatformId = null; player.platformOffset = null; event.tectonicMoves.push({ playerId: player.id, fromX, toX: player.x });
    }
  }
  settlePlayers(game); recordEliminations(game); const pausedFor = Math.max(0, Date.now() - (event.warningStartedAt || Date.now())); if (game.turnEndsAt) game.turnEndsAt += pausedFor; if (game.botActAt) game.botActAt += pausedFor; event.id += '-impact'; event.warning = false; event.label = `${event.label} • ${event.type === 'supply' ? 'CARGA ENTREGUE' : event.type === 'luckyWinds' ? 'CURA APLICADA' : 'IMPACTO'}`; game.pendingArenaEvent = null; game.arenaWarningUntil = null;
}

function applyTectonicShift(terrain, impact) {
  const radius = Math.max(60, impact.radius); const magnitude = impact.magnitude || 80;
  for (let offset = -radius; offset <= radius; offset += 1) {
    const x = Math.round(clamp(impact.x + offset, 0, WORLD.width - 1)); const falloff = (1 + Math.cos(Math.PI * offset / radius)) / 2;
    const ridge = impact.tectonicMode === 'mountain' ? (1 - Math.abs(offset) / radius) * magnitude : falloff * magnitude;
    const delta = impact.tectonicMode === 'sink' ? ridge : -ridge; terrain.heights[x] = Math.round(clamp(terrain.heights[x] + delta, 105, WORLD.height + 80));
  }
}

function botDelay(difficulty) { return difficulty === 'easy' ? 2100 : difficulty === 'hard' ? 650 : 1250; }

export function chooseBotShot(room, bot, target, difficulty = 'normal') {
  const direction = target.x < bot.x ? -1 : 1; const distance = Math.abs(target.x - bot.x); const heightDelta = bot.y - target.y;
  const random = seededRandom(`${room.game.seed}-aim-${room.game.turnNumber}-${bot.id}`);
  if (difficulty !== 'hard') {
    const baseAngle = clamp(45 + heightDelta / 22, 24, 72); const sine = Math.max(.2, Math.sin(baseAngle * Math.PI / 90)); const basePower = Math.sqrt(distance * room.rules.gravity / sine);
    const angleError = difficulty === 'easy' ? (random() - .5) * 24 : (random() - .5) * 8;
    const powerError = difficulty === 'easy' ? (random() - .5) * 130 : (random() - .5) * 38;
    return { direction, angle: clamp(baseAngle + angleError, 10, 82), power: clamp(basePower + powerError, 120, 580) };
  }
  let best = { direction, angle: 45, power: clamp(Math.sqrt(distance * room.rules.gravity), 160, 580), score: Infinity };
  for (let angle = 22; angle <= 78; angle += 7) for (let power = 170; power <= 580; power += 35) {
    const result = simulateShot({ terrain: room.game.terrain, players: room.game.players, powerups: room.game.powerups, ignorePlayerId: bot.id, x: bot.x, y: bot.y, angle, power, gravity: room.rules.gravity, wind: room.game.wind, direction });
    const score = result.impact?.playerId === target.id ? -1000 : result.impact ? Math.hypot(result.impact.x - target.x, result.impact.y - target.y) : 5000;
    if (score < best.score) best = { direction, angle, power, score };
  }
  return best;
}

function chooseBotWeapon(game, bot, target, difficulty, random) {
  if (difficulty === 'easy') return 'standard';
  const distance = Math.abs(target.x - bot.x);
  const ready = (type) => bot.arsenal?.includes(type) && (bot.ammo?.[type] || 0) > 0;
  if (difficulty === 'hard' && ready('heavy') && (target.health > 55 || distance > 900)) return 'heavy';
  const grouped = game.players.filter((player) => player.alive && player.id !== bot.id && Math.abs(player.x - target.x) < 150).length > 1;
  if (difficulty === 'hard' && grouped && ready('cluster')) return 'cluster';
  const special = ['zeus', 'gravity', 'fireworks'].find(ready);
  if (difficulty === 'hard' && special && random() > .45) return special;
  if (difficulty === 'normal' && random() > .82 && ready('heavy')) return 'heavy';
  return 'standard';
}

export function sanitizeRules(rules = {}) {
  return {
    ...DEFAULT_RULES,
    maxPlayers: clamp(Number(rules.maxPlayers) || 10, 2, 10),
    health: clamp(Number(rules.health) || DEFAULT_RULES.health, 50, 300),
    turnSeconds: clamp(Number(rules.turnSeconds) || 30, 10, 90),
    gravity: clamp(Number(rules.gravity) || 120, 50, 250),
    powerupCount: clamp(Number.isFinite(Number(rules.powerupCount)) ? Number(rules.powerupCount) : DEFAULT_RULES.powerupCount, 0, 20),
    botCount: clamp(Number(rules.botCount) || 0, 0, 9),
    botDifficulty: ['easy', 'normal', 'hard'].includes(rules.botDifficulty) ? rules.botDifficulty : 'normal',
    gameMode: ['ffa', 'coop'].includes(rules.gameMode) ? rules.gameMode : 'ffa',
    gameSpeed: [0.75, 1, 1.5, 2].includes(Number(rules.gameSpeed)) ? Number(rules.gameSpeed) : 1,
    mines: rules.mines !== false,
    mapType: ['random', 'flat', 'hills', 'highlands', 'islands', 'canyon', 'platforms'].includes(rules.mapType) ? rules.mapType : 'random',
    seed: rules.seed ? String(rules.seed).slice(0, 30) : '',
  };
}
