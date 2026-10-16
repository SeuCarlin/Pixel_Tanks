import crypto from 'node:crypto';
import { ARSENAL_ITEMS, DEFAULT_ARSENAL, DEFAULT_RULES, POWERUPS, SHOT_PATH_RATE, WORLD, clamp } from '../shared/constants.js';
import { seededRandom } from './random.js';
import { carveTerrain, findSpawns, generateTerrain, movingPlatformX, terrainY } from './terrain.js';
import { applyExplosion, settlePlayers, simulateShot } from './physics.js';

const SELECTABLE_POWERUPS = new Set(['extraShot', 'doubleShot', 'tripleShot', 'bigExplosion', 'megaMissile', 'freeze', 'guidedBullet', 'teleport', 'excavator', 'armorPiercer', 'shockwave', 'bunkerBuster', 'rocketDash', 'lightningStep', 'bridgeKit']);

export function createGame(room) {
  const seed = room.rules.seed || crypto.randomInt(100000, 999999);
  const terrain = generateTerrain(seed, room.rules.mapType);
  const spawns = findSpawns(terrain, room.players.length);
  const players = room.players.map((p, i) => ({
    id: p.id, nickname: p.nickname, color: p.color, x: spawns[i].x, y: spawns[i].y,
    health: room.rules.health, maxHealth: room.rules.health, alive: true, connected: p.connected, isBot: Boolean(p.isBot),
    facing: i < room.players.length / 2 ? 1 : -1, inventory: [], selectedPowerup: null, rewardOffer: null, arsenal: [...(p.arsenal || DEFAULT_ARSENAL)], ammo: Object.fromEntries((p.arsenal || DEFAULT_ARSENAL).map((type) => [type, 1])), shield: false, shieldCharges: 0, frozenTurns: 0, invisibleTurns: 0, invisibilityFresh: false, lastPickup: null, lastLaunch: null, lastSafeX: spawns[i].x, lastSafeY: spawns[i].y, graveRecorded: false, supportPlatformId: null, platformOffset: null, stats: { damage: 0, shots: 0 },
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
    return { id: `p${i}`, type: POWERUPS[Math.floor(rand() * POWERUPS.length)], x, y: buriedY, buriedY, revealed: false, active: false };
  });
  const mines = room.rules.mines ? Array.from({ length: Math.max(2, Math.floor(room.players.length * 1.5)) }, (_, i) => {
    const x = validX();
    return { id: `m${i}`, x, y: terrainY(terrain, x) - 3, active: true };
  }) : [];
  const objects = createScenarioObjects(terrain, spawns, rand);
  return {
    phase: 'playing', seed, gravity: room.rules.gravity, speed: room.rules.gameSpeed, wind: windForTurn(seed, 1), terrain, players, powerups, mines, platformEpoch: Date.now(), turnIndex: 0, turnNumber: 1,
    turnEndsAt: Date.now() + room.rules.turnSeconds * 1000 / room.rules.gameSpeed,
    actions: { movesLeft: 2, attackAvailable: true }, winner: null, events: [], objects, graves: [], interactionSerial: 0, pickupSerial: 0, shotEndsAt: null, pendingShot: null, botActAt: Date.now() + botDelay(room.rules.botDifficulty) / room.rules.gameSpeed,
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
  game.shotEndsAt = null; game.pendingShot = null;
  const departing = currentPlayer(game);
  if (departing?.invisibilityFresh) departing.invisibilityFresh = false;
  else if (departing?.invisibleTurns > 0) departing.invisibleTurns -= 1;
  if (departing?.frozenTurns > 0) departing.frozenTurns -= 1;
  const alive = game.players.filter((p) => p.alive);
  if (alive.length <= 1) {
    game.phase = 'finished';
    game.winner = alive[0]?.id || null;
    return;
  }
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
  offerPowerupChoices(room);
  game.wind = windForTurn(game.seed, game.turnNumber);
  const active = currentPlayer(game); const excavatorMoves = active.selectedPowerup === 'excavator' ? active.inventory.filter((type) => type === 'excavator').length : 0;
  game.actions = { movesLeft: active.frozenTurns > 0 ? 0 : excavatorMoves > 0 ? 3 : 2, attackAvailable: true };
  game.turnEndsAt = Date.now() + room.rules.turnSeconds * 1000 / room.rules.gameSpeed;
  game.botActAt = Date.now() + botDelay(room.rules.botDifficulty) / room.rules.gameSpeed;
}

export function movePlayer(room, playerId, direction) {
  const game = room.game;
  updateMovingPlatforms(game);
  const player = currentPlayer(game);
  if (game.shotEndsAt) throw new Error('Aguarde o projétil concluir a trajetória.');
  if (game.phase !== 'playing' || player?.id !== playerId) throw new Error('Não é seu turno.');
  if (player.frozenTurns > 0) throw new Error(`Tanque congelado por mais ${player.frozenTurns} turno(s).`);
  if (game.actions.movesLeft <= 0) throw new Error('Sem movimentos restantes.');
  const dir = direction < 0 ? -1 : 1;
  const boostStacks = player.inventory.filter((type) => type === 'movementBoost').length;
  const dashIndex = player.selectedPowerup === 'rocketDash' ? player.inventory.indexOf('rocketDash') : -1;
  const distance = dashIndex >= 0 ? 230 : Math.min(138, 72 + boostStacks * 22); const excavatorIndex = player.selectedPowerup === 'excavator' ? player.inventory.indexOf('excavator') : -1;
  const targetX = clamp(player.x + dir * distance, 12, WORLD.width - 12);
  let x = player.x; let feet = player.y + WORLD.tankRadius; let supportId = player.supportPlatformId; let moved = false;
  while (Math.abs(targetX - x) > .1) {
    const nextX = x + dir * Math.min(3, Math.abs(targetX - x));
    const support = game.terrain.floatingPlatforms?.find((platform) => platform.id === supportId && platform.active && nextX >= platform.x && nextX <= platform.x + platform.width);
    let nextFeet = support ? support.y : terrainY(game.terrain, nextX);
    const climb = feet - nextFeet;
    if (climb > 6 && excavatorIndex >= 0 && !support) { excavateWall(game.terrain, nextX, dir, feet); nextFeet = terrainY(game.terrain, nextX); }
    if (feet - nextFeet > 6) break;
    x = nextX; feet = nextFeet; moved = true;
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
  if (excavatorIndex >= 0) { player.inventory.splice(excavatorIndex, 1); if (!player.inventory.includes('excavator')) player.selectedPowerup = null; }
  if (dashIndex >= 0) { player.inventory.splice(dashIndex, 1); if (!player.inventory.includes('rocketDash')) player.selectedPowerup = null; }
  collectPowerups(game, player);
  triggerLauncher(game, player, dir);
  triggerMines(game, player.x, player.y, 22);
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
    grantPowerup(game, player, item.type);
  }
}

function grantPowerup(game, player, type) {
  game.pickupSerial += 1; player.lastPickup = { serial: game.pickupSerial, type };
  if (type === 'heal') player.health = Math.min(player.maxHealth, player.health + 50);
  else if (type === 'shield') { player.shieldCharges = (player.shieldCharges || 0) + 1; player.shield = true; }
  else if (type === 'invisibility') { player.invisibleTurns = (player.invisibleTurns || 0) + 2; player.invisibilityFresh = true; }
  else if (type === 'excavator') player.inventory.push('excavator', 'excavator', 'excavator');
  else if (type === 'ammoCrate') { player.ammo.heavy += 1; player.ammo.cluster += 1; }
  else player.inventory.push(type);
}

function offerPowerupChoices(room) {
  const game = room.game;
  if (game.turnNumber % 3 !== 0) return;
  for (const player of game.players.filter((entry) => entry.alive)) {
    for (const type of player.arsenal || []) player.ammo[type] = 1;
    const random = seededRandom(`${game.seed}-reward-${game.turnNumber}-${player.id}`); const pool = [...POWERUPS]; const choices = [];
    while (choices.length < 3 && pool.length) choices.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    player.rewardOffer = { turn: game.turnNumber, choices };
    if (player.isBot) { grantPowerup(game, player, choices[Math.floor(random() * choices.length)]); player.rewardOffer = null; }
  }
}

export function claimReward(room, playerId, type) {
  const player = room.game?.players.find((entry) => entry.id === playerId);
  if (!player?.alive || !player.rewardOffer?.choices.includes(type)) throw new Error('Recompensa indisponível.');
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
  return objects;
}

export function activateScenarioObjects(game, x, y, radius, visited = new Set()) {
  const interactions = releaseGraveLoot(game, x, y, radius);
  for (const object of game.objects || []) {
    if (visited.has(object.id) || Math.hypot(object.x - x, object.y - y) > radius + 18) continue;
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
  }
  return interactions;
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
}

export function selectPowerup(room, playerId, type) {
  const game = room.game; const player = currentPlayer(game);
  if (game?.phase !== 'playing' || player?.id !== playerId) throw new Error('Escolha powerups somente no seu turno.');
  if (game.shotEndsAt) throw new Error('Aguarde o projétil concluir a trajetória.');
  if (type === null || type === '') { player.selectedPowerup = null; game.actions.movesLeft = Math.min(game.actions.movesLeft, 2); return; }
  if (!SELECTABLE_POWERUPS.has(type) || !player.inventory.includes(type)) throw new Error('Powerup indisponível.');
  player.selectedPowerup = type;
  if (type === 'excavator') game.actions.movesLeft = Math.max(game.actions.movesLeft, Math.min(3, player.inventory.filter((item) => item === 'excavator').length));
}

export function usePowerup(room, playerId, input = {}) {
  const game = room.game; const player = currentPlayer(game);
  if (game?.phase !== 'playing' || player?.id !== playerId) throw new Error('Use powerups somente no seu turno.');
  if (game.shotEndsAt) throw new Error('Aguarde o projétil concluir a trajetória.');
  if (input.type !== 'lightningStep' || player.selectedPowerup !== 'lightningStep' || !player.inventory.includes('lightningStep')) throw new Error('Equipe o Passo Relâmpago primeiro.');
  if (game.actions.movesLeft <= 0) throw new Error('Sem movimentos restantes.');
  const desiredX = Number(input.x);
  if (!Number.isFinite(desiredX) || Math.abs(desiredX - player.x) > 270) throw new Error('Escolha um ponto a até 270 blocos.');
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
  removeInventory(player, 'lightningStep'); if (!player.inventory.includes('lightningStep')) player.selectedPowerup = null;
  game.actions.movesLeft -= 1; collectPowerups(game, player); triggerMines(game, player.x, player.y, 22); recordEliminations(game);
  if (!player.alive || game.actions.movesLeft === 0) nextTurn(room);
  return player.lastBlink;
}

export function useArsenal(room, playerId, input = {}) {
  const game = room.game; const player = currentPlayer(game);
  if (game?.phase !== 'playing' || player?.id !== playerId) throw new Error('Use o arsenal somente no seu turno.');
  if (input.type !== 'blink' || !player.arsenal?.includes('blink') || (player.ammo?.blink || 0) <= 0) throw new Error('Teleporte tático indisponível.');
  if (game.actions.movesLeft <= 0) throw new Error('Sem movimentos restantes.');
  const desiredX = Number(input.x); if (!Number.isFinite(desiredX) || Math.abs(desiredX - player.x) > 360) throw new Error('Escolha um ponto a até 360 blocos.');
  let landing = null;
  for (let distance = 0; distance <= 90 && !landing; distance += 5) for (const direction of distance ? [1, -1] : [1]) {
    const x = Math.round(clamp(desiredX + distance * direction, 30, WORLD.width - 30)); if (!safeGroundAt(game.terrain, x)) continue;
    const y = terrainY(game.terrain, x) - WORLD.tankRadius; if (!game.players.some((entry) => entry.alive && entry.id !== player.id && Math.abs(entry.x - x) < 28 && Math.abs(entry.y - y) < 28)) landing = { x, y };
  }
  if (!landing) throw new Error('Não há pouso seguro perto desse ponto.');
  const fromX = player.x; const fromY = player.y; player.x = landing.x; player.y = landing.y; player.supportPlatformId = null; player.platformOffset = null; player.lastSafeX = landing.x; player.lastSafeY = landing.y; player.ammo.blink -= 1; game.actions.movesLeft -= 1;
  game.interactionSerial += 1; player.lastBlink = { serial: game.interactionSerial, playerId: player.id, fromX, fromY, toX: landing.x, toY: landing.y };
  collectPowerups(game, player); triggerMines(game, player.x, player.y, 22); recordEliminations(game); if (!player.alive || game.actions.movesLeft === 0) nextTurn(room); return player.lastBlink;
}

function excavateWall(terrain, startX, direction, feet) {
  for (let step = 0; step <= 34; step += 1) {
    const x = Math.round(clamp(startX + direction * step, 0, WORLD.width - 1)); const half = Math.max(3, 12 - Math.abs(step - 12) * .25);
    for (let dx = -half; dx <= half; dx += 1) { const px = Math.round(clamp(x + dx, 0, WORLD.width - 1)); terrain.heights[px] = Math.max(terrain.heights[px], Math.round(feet + 7)); }
  }
}

function triggerMines(game, x, y, range, visited = new Set()) {
  for (const mine of game.mines) {
    if (!mine.active || visited.has(mine.id) || Math.hypot(mine.x - x, mine.y - y) > range) continue;
    visited.add(mine.id); mine.active = false;
    applyExplosion(game, mine.x, mine.y, 38, 42);
    activateScenarioObjects(game, mine.x, mine.y, 38);
    triggerMines(game, mine.x, mine.y, 85, visited);
  }
}

export function fire(room, playerId, input) {
  const game = room.game;
  updateMovingPlatforms(game);
  const player = currentPlayer(game);
  if (game.shotEndsAt) throw new Error('Já existe um projétil em voo.');
  if (game.phase !== 'playing' || player?.id !== playerId) throw new Error('Não é seu turno.');
  if (!game.actions.attackAvailable) throw new Error('Ataque indisponível.');
  const angle = clamp(Number(input.angle) || 45, 5, 85);
  const power = clamp(Number(input.power) || 260, 100, 580);
  if (Number(input.direction) === -1 || Number(input.direction) === 1) player.facing = Number(input.direction);
  const weapon = ['standard', ...ARSENAL_ITEMS.filter((type) => type !== 'blink')].includes(input.weapon) ? input.weapon : 'standard';
  if (weapon !== 'standard' && (!player.arsenal?.includes(weapon) || (player.ammo?.[weapon] || 0) <= 0)) throw new Error('Poder indisponível ou aguardando recarga.');
  if (weapon !== 'standard') player.ammo[weapon] -= 1;
  if (player.isBot && !player.selectedPowerup) player.selectedPowerup = player.inventory.find((type) => SELECTABLE_POWERUPS.has(type) && !['excavator', 'rocketDash', 'lightningStep'].includes(type)) || null;
  const selected = player.inventory.includes(player.selectedPowerup) ? player.selectedPowerup : null;
  const megaIndex = selected === 'megaMissile' ? player.inventory.indexOf('megaMissile') : -1;
  const freezeIndex = selected === 'freeze' ? player.inventory.indexOf('freeze') : -1;
  const tripleIndex = selected === 'tripleShot' ? player.inventory.indexOf('tripleShot') : -1;
  const doubleIndex = selected === 'doubleShot' ? player.inventory.indexOf('doubleShot') : -1;
  const bigExplosionIndex = selected === 'bigExplosion' ? player.inventory.indexOf('bigExplosion') : -1;
  const armorPiercer = selected === 'armorPiercer'; const shockwave = selected === 'shockwave'; const bunkerBuster = selected === 'bunkerBuster'; const bridgeKit = selected === 'bridgeKit';
  const megaMissile = megaIndex >= 0;
  const shotModifier = tripleIndex >= 0 ? 'tripleShot' : doubleIndex >= 0 ? 'doubleShot' : null;
  const powerupShots = shotModifier === 'tripleShot' ? 3 : shotModifier === 'doubleShot' ? 2 : 1;
  const shots = megaMissile ? 1 : weapon === 'cluster' ? 3 : powerupShots;
  const spread = megaMissile ? [0] : weapon === 'cluster' ? [-8, 0, 8] : shots === 3 ? [-5, 0, 5] : shots === 2 ? [-3, 3] : [0];
  const radius = bunkerBuster ? 92 : shockwave ? 82 : megaMissile ? 108 : weapon === 'heavy' ? 70 : weapon === 'cluster' ? 34 : weapon === 'gravity' ? 76 : bigExplosionIndex >= 0 ? 72 : 48;
  const baseDamage = shockwave ? 24 : bunkerBuster ? 58 : megaMissile ? 92 : weapon === 'heavy' ? 62 : weapon === 'cluster' ? 24 : ['fireworks', 'zeus', 'gravity'].includes(weapon) ? 34 : 44;
  const guidedIndex = selected === 'guidedBullet' ? player.inventory.indexOf('guidedBullet') : -1;
  const teleportIndex = selected === 'teleport' ? player.inventory.indexOf('teleport') : -1;
  const guidedTarget = guidedIndex >= 0
    ? game.players.filter((p) => p.alive && p.id !== player.id && p.invisibleTurns <= 0).sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0]
    : null;
  const results = []; let teleported = false; let bridgeBuilt = false; const shotOrigin = { x: player.x, y: player.y };
  player.stats.shots += shots;
  for (const offset of spread) {
    const result = simulateShot({ terrain: game.terrain, players: game.players, powerups: game.powerups, ignorePlayerId: player.id, guidedTarget, x: shotOrigin.x, y: shotOrigin.y, angle: angle + offset, power, gravity: room.rules.gravity, wind: game.wind, direction: player.facing });
    for (const id of result.collectedPowerupIds || []) { const item = game.powerups.find((entry) => entry.id === id && entry.active); if (item) { item.active = false; grantPowerup(game, player, item.type); } }
    if (result.impact) {
      const impactRadius = radius;
      const impactDamage = baseDamage;
      const before = new Map(game.players.map((p) => [p.id, p.health]));
      const damage = applyExplosion(game, result.impact.x, result.impact.y, impactRadius, impactDamage, { ignoreShield: armorPiercer, pushMultiplier: shockwave ? 2.8 : 1 });
      const interactions = activateScenarioObjects(game, result.impact.x, result.impact.y, impactRadius);
      if (weapon === 'fireworks') for (let burst = 0; burst < 3; burst += 1) { const a = (burst / 3) * Math.PI * 2 + game.turnNumber; const bx = clamp(result.impact.x + Math.cos(a) * 62, 5, WORLD.width - 5); const by = result.impact.y + Math.sin(a) * 28; applyExplosion(game, bx, by, 30, 20); interactions.push({ type: 'firework', x: bx, y: by }); }
      if (weapon === 'zeus') { applyExplosion(game, result.impact.x, result.impact.y, 92, 18, { pushMultiplier: 3.2 }); interactions.push({ type: 'zeus', x: result.impact.x, y: result.impact.y }); }
      if (weapon === 'gravity') {
        for (const target of game.players) { if (!target.alive || target.id === player.id) continue; const distance = Math.hypot(target.x - result.impact.x, target.y - result.impact.y); if (distance > 145) continue; target.x = clamp(target.x + (result.impact.x - target.x) * .55, 4, WORLD.width - 4); }
        settlePlayers(game); interactions.push({ type: 'gravity', x: result.impact.x, y: result.impact.y });
      }
      for (const item of game.powerups) if (item.active && item.revealed && Math.hypot(item.x - result.impact.x, item.y - result.impact.y) <= impactRadius) { item.active = false; grantPowerup(game, player, item.type); interactions.push({ type: 'powerupBurst', id: item.id, powerupType: item.type, x: item.x, y: item.y }); }
      if (bridgeKit && !bridgeBuilt) { interactions.push(buildBridge(game, result.impact)); bridgeBuilt = true; }
      const frozenPlayerIds = [];
      if (freezeIndex >= 0) for (const hit of damage) {
        const target = game.players.find((entry) => entry.id === hit.playerId);
        if (target?.alive && target.id !== player.id && hit.amount > 0) { target.frozenTurns = Math.max(target.frozenTurns || 0, 2); frozenPlayerIds.push(target.id); }
      }
      for (const hit of damage) if (hit.playerId !== player.id) player.stats.damage += before.get(hit.playerId) - game.players.find((p) => p.id === hit.playerId).health;
      triggerMines(game, result.impact.x, result.impact.y, radius + 25);
      let teleport = null;
      if (!teleported && teleportIndex >= 0 && player.alive) {
        const landing = findTeleportLanding(game, result.impact);
        if (landing) {
          teleport = { playerId: player.id, fromX: player.x, fromY: player.y, toX: landing.x, toY: landing.y };
          player.x = landing.x; player.y = landing.y; player.supportPlatformId = landing.supportPlatformId; player.platformOffset = landing.platformOffset; teleported = true;
        }
      }
      results.push({ ...result, damage, radius: impactRadius, weapon, teleport, megaMissile, freeze: freezeIndex >= 0, armorPiercer, shockwave, bunkerBuster, bridgeKit, interactions, frozenPlayerIds });
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

export function tickRoom(room) {
  const game = room.game;
  if (game?.phase !== 'playing') return null;
  updateMovingPlatforms(game);
  if (game.shotEndsAt) {
    if (Date.now() < game.shotEndsAt) return null;
    finishPendingShot(room); return { changed: true };
  }
  if (Date.now() >= game.turnEndsAt) { nextTurn(room); return { changed: true }; }
  const bot = currentPlayer(game);
  if (!bot?.isBot || Date.now() < game.botActAt) return null;
  const targets = game.players.filter((player) => player.alive && player.id !== bot.id && player.invisibleTurns <= 0);
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

export function applyArenaPulse(room) {
  const game = room.game;
  if (!game || game.phase !== 'playing' || game.turnNumber % 3 !== 0) return null;
  const random = seededRandom(`${game.seed}-arena-${game.turnNumber}`);
  const dropCount = game.players.length >= 5 ? 4 : 3; const drops = [];
  for (let i = 0; i < dropCount; i += 1) {
    const x = arenaGroundX(game, random); const type = POWERUPS[Math.floor(random() * POWERUPS.length)]; const buriedY = terrainY(game.terrain, x) + 16 + Math.round(random() * 22);
    const item = { id: `drop-${game.seed}-${game.turnNumber}-${i}`, type, x, y: buriedY, buriedY, revealed: false, active: false };
    game.powerups.push(item); drops.push({ id: item.id, type, x: item.x, y: item.y, buried: true });
  }
  const impacts = []; let eventType = 'supply';
  if (game.turnNumber >= 9) {
    const longEvents = ['bombardment', 'lightning', 'collapse']; eventType = longEvents[Math.floor(random() * longEvents.length)];
    const count = eventType === 'bombardment' ? 5 : eventType === 'lightning' ? 4 : 7;
    for (let i = 0; i < count; i += 1) {
      const x = arenaGroundX(game, random, eventType === 'lightning' ? 60 : 150); const y = terrainY(game.terrain, x); const radius = eventType === 'collapse' ? 42 : 24 + Math.round(random() * 15);
      impacts.push({ x, y, radius, kind: eventType });
      applyExplosion(game, x, y, radius, eventType === 'lightning' ? 28 : eventType === 'bombardment' ? 22 : 8);
    }
    settlePlayers(game); recordEliminations(game);
  } else if (game.turnNumber % 6 === 0) {
    eventType = 'quake';
    for (let i = 0; i < 2; i += 1) {
      const x = arenaGroundX(game, random, 210); const y = terrainY(game.terrain, x); const radius = 20 + Math.round(random() * 8);
      carveTerrain(game.terrain, x, y, radius); impacts.push({ x, y, radius });
    }
    settlePlayers(game); recordEliminations(game);
  }
  const labels = { supply: `NOVOS SINAIS • ${dropCount} CÁPSULAS`, quake: `ABALO DA ARENA • ${dropCount} CÁPSULAS`, bombardment: 'CHUVA DE BOMBARDEIO!', lightning: 'TEMPESTADE DE RAIOS!', collapse: 'COLAPSO DO CENÁRIO!' };
  const event = { id: `arena-${game.seed}-${game.turnNumber}`, turn: game.turnNumber, type: eventType, drops, impacts, label: labels[eventType] };
  game.events.push(event); if (game.events.length > 8) game.events.shift(); return event;
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
    gameSpeed: [0.75, 1, 1.5, 2].includes(Number(rules.gameSpeed)) ? Number(rules.gameSpeed) : 1,
    mines: rules.mines !== false,
    mapType: ['random', 'flat', 'hills', 'highlands', 'islands', 'canyon', 'platforms'].includes(rules.mapType) ? rules.mapType : 'random',
    seed: rules.seed ? String(rules.seed).slice(0, 30) : '',
  };
}
