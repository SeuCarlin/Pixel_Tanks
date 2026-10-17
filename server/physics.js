import { CLASS_BALANCE, CLASS_EVOLUTIONS, SHOT_PATH_RATE, STRUCTURE_MATERIALS, WORLD, clamp } from '../shared/constants.js';
import { terrainY, carveTerrain } from './terrain.js';
import { resolveTankFootprint } from '../shared/movement.js';

export function simulateShot({ terrain, players = [], powerups = [], ignorePlayerId, guidedTarget = null, x, y, angle, power, gravity, wind = 0, direction = 1 }) {
  const radians = (angle * Math.PI) / 180;
  let px = x + Math.cos(radians) * 18 * direction;
  let py = y - Math.sin(radians) * 18;
  let vx = Math.cos(radians) * power * direction;
  let vy = -Math.sin(radians) * power;
  const path = [];
  const collectedPowerupIds = [];
  const dt = 1 / 60;
  for (let step = 0; step < 900; step += 1) {
    if (guidedTarget && step > 18 && step < 105) {
      vx += clamp((guidedTarget.x - px) * 0.003, -0.7, 0.7);
      vy += clamp((guidedTarget.y - py) * 0.002, -0.45, 0.45);
    }
    const previousY = py; px += vx * dt; py += vy * dt;
    vx += wind * dt;
    vy += gravity * dt;
    if (step % 3 === 0) path.push({ x: Math.round(px), y: Math.round(py) });
    if (px < 0 || px >= WORLD.width || py > WORLD.height + 30) return { path, collectedPowerupIds, impact: null };
    const hit = players.find((player) => player.alive && player.id !== ignorePlayerId && Math.hypot(player.x - px, player.y - py) <= WORLD.tankRadius + 3);
    if (hit) return { path, collectedPowerupIds, impact: { x: px, y: py, playerId: hit.id } };
    const powerup = powerups.find((item) => item.active && item.revealed !== false && !item.destroyed && !collectedPowerupIds.includes(item.id) && Math.hypot(item.x - px, item.y - py) <= 14);
    if (powerup) collectedPowerupIds.push(powerup.id);
    const platform = terrain.floatingPlatforms?.find((entry) => entry.active && px >= entry.x && px <= entry.x + entry.width && Math.min(previousY, py) <= entry.y + entry.height && Math.max(previousY, py) >= entry.y);
    if (platform) return { path, collectedPowerupIds, impact: { x: px, y: clamp(py, platform.y, platform.y + platform.height), platformId: platform.id } };
    if (py >= terrainY(terrain, px)) return { path, collectedPowerupIds, impact: { x: px, y: py } };
  }
  return { path, collectedPowerupIds, impact: null };
}

export function simulateBouncingGrenade({ terrain, powerups = [], guidedTarget = null, x, y, angle, power, gravity, wind = 0, direction = 1 }) {
  const radians = angle * Math.PI / 180; let px = x + Math.cos(radians) * 18 * direction; let py = y - Math.sin(radians) * 18; let vx = Math.cos(radians) * power * direction; let vy = -Math.sin(radians) * power; const path = []; const collectedPowerupIds = []; const bounces = []; const dt = 1 / 60;
  for (let step = 0; step < 1200 && bounces.length < 3; step += 1) {
    if (guidedTarget && bounces.length === 0 && step > 18 && step < 105) { vx += clamp((guidedTarget.x - px) * .003, -.7, .7); vy += clamp((guidedTarget.y - py) * .002, -.45, .45); }
    px += vx * dt; py += vy * dt; vx += wind * dt; vy += gravity * dt;
    if (step % 3 === 0) path.push({ x: Math.round(px), y: Math.round(py) });
    const powerup = powerups.find((item) => item.active && item.revealed !== false && !collectedPowerupIds.includes(item.id) && Math.hypot(item.x - px, item.y - py) <= 14); if (powerup) collectedPowerupIds.push(powerup.id);
    if (px <= 8 || px >= WORLD.width - 8) { px = clamp(px, 8, WORLD.width - 8); vx *= -.68; bounces.push({ x: px, y: py }); }
    const ground = terrainY(terrain, px); const platform = terrain.floatingPlatforms?.find((entry) => entry.active && px >= entry.x && px <= entry.x + entry.width && py >= entry.y && py <= entry.y + entry.height + 8);
    if (py >= ground || platform) { py = platform ? platform.y - 3 : ground - 3; vy = -Math.max(75, Math.abs(vy) * .58); vx *= .76; bounces.push({ x: px, y: py }); }
    if (py > WORLD.height + 30) return { path, collectedPowerupIds, bounces, impact: null };
  }
  for (let fuse = 0; fuse < SHOT_PATH_RATE * 3; fuse += 1) path.push({ x: Math.round(px), y: Math.round(py), fuse: true });
  return { path, collectedPowerupIds, bounces, impact: { x: px, y: py } };
}

export function simulateVerticalStrike({ terrain, players = [], powerups = [], ignorePlayerId, guidedTarget = null, x, y, angle, power, gravity, wind = 0, direction = 1 }) {
  const radians = angle * Math.PI / 180; let px = x + Math.cos(radians) * 18 * direction; let py = y - Math.sin(radians) * 18; let vx = Math.cos(radians) * power * direction; let vy = -Math.sin(radians) * power; const path = []; const collectedPowerupIds = []; const dt = 1 / 60; let activated = false; let activationIndex = 0;
  for (let step = 0; step < 900; step += 1) {
    if (guidedTarget && !activated && step > 18) { vx += clamp((guidedTarget.x - px) * .003, -.7, .7); vy += clamp((guidedTarget.y - py) * .002, -.45, .45); }
    if (!activated && (vy >= -8 || step >= 150)) { activated = true; activationIndex = path.length; vx = 0; vy = Math.max(260, power * .9); }
    const previousY = py; px += vx * dt; py += vy * dt; if (!activated) { vx += wind * dt; vy += gravity * dt; }
    if (step % 3 === 0) path.push({ x: Math.round(px), y: Math.round(py), vertical: activated });
    const powerup = powerups.find((item) => item.active && item.revealed !== false && !collectedPowerupIds.includes(item.id) && Math.hypot(item.x - px, item.y - py) <= 14); if (powerup) collectedPowerupIds.push(powerup.id);
    const hit = players.find((player) => player.alive && player.id !== ignorePlayerId && Math.hypot(player.x - px, player.y - py) <= WORLD.tankRadius + 4); if (hit) return { path, activationIndex, collectedPowerupIds, impact: { x: px, y: py, playerId: hit.id } };
    const platform = terrain.floatingPlatforms?.find((entry) => entry.active && px >= entry.x && px <= entry.x + entry.width && Math.min(previousY, py) <= entry.y + entry.height && Math.max(previousY, py) >= entry.y); if (platform) return { path, activationIndex, collectedPowerupIds, impact: { x: px, y: entryY(platform), platformId: platform.id } };
    if (px < 0 || px >= WORLD.width || py > WORLD.height + 30) return { path, activationIndex, collectedPowerupIds, impact: null };
    if (py >= terrainY(terrain, px)) return { path, activationIndex, collectedPowerupIds, impact: { x: px, y: py } };
  }
  return { path, activationIndex, collectedPowerupIds, impact: null };
}

function entryY(platform) { return clamp(platform.y, 0, WORLD.height); }

export function applyExplosion(game, x, y, radius = 48, baseDamage = 55, effects = {}) {
  const source = effects.sourcePlayerId && game.players.find((entry) => entry.id === effects.sourcePlayerId);
  const ignoreShield = effects.ignoreShield || source?.classType === 'attacker';
  if (source?.classType === 'bomber') radius += 10;
  const left = Math.max(0, Math.floor(x - radius)); const right = Math.min(WORLD.width - 1, Math.ceil(x + radius));
  const terrainBefore = game.terrain.heights.slice(left, right + 1); const activePlatforms = new Set((game.terrain.floatingPlatforms || []).filter((platform) => platform.active).map((platform) => platform.id));
  if (effects.verticalBeam) {
    const core = Math.min(radius, effects.beamWidth || radius * .42);
    for (let px = left; px <= right; px += 1) {
      const distance = Math.abs(px - x);
      const depth = distance <= core ? WORLD.height + 80 : Math.min(WORLD.height + 80, game.terrain.heights[px] + Math.round(165 * (1 - (distance - core) / Math.max(1, radius - core))));
      game.terrain.heights[px] = Math.max(game.terrain.heights[px], depth);
    }
  } else carveTerrain(game.terrain, x, y, radius);
  for (const item of game.powerups || []) {
    if (item.revealed) { if (item.active) item.y = Math.min(item.y, terrainY(game.terrain, item.x) - 12); continue; }
    const buriedY = item.buriedY ?? item.y;
    const exposedByCrater = terrainY(game.terrain, item.x) >= buriedY - 3;
    const touchedByBlast = Math.hypot(item.x - x, buriedY - y) <= radius * 1.12;
    if (!exposedByCrater && !touchedByBlast) continue;
    item.revealed = true; item.active = true; item.y = terrainY(game.terrain, item.x) - 12; item.anchorY = item.y;
  }
  for (const platform of game.terrain.floatingPlatforms || []) {
    if (!platform.active) continue;
    const nearestX = clamp(x, platform.x, platform.x + platform.width);
    const distance = effects.verticalBeam ? Math.abs(x - nearestX) : Math.hypot(x - nearestX, y - platform.y);
    if (distance > radius) continue;
    platform.durability = effects.verticalBeam ? 0 : Math.max(0, platform.durability - Math.max(18, Math.round((1 - distance / radius) * 72)));
    if (platform.durability === 0) platform.active = false;
  }
  if (effects.sourcePlayerId) for (const player of game.players || []) if (player.alive && player.id !== effects.sourcePlayerId && (!['coop', 'teams', 'teamHill'].includes(game.mode) || !source || player.team !== source.team) && (effects.verticalBeam ? Math.abs(player.x - x) : Math.hypot(player.x - x, player.y - y)) <= radius * 1.45) { player.lastDamageSourceId = effects.sourcePlayerId; player.lastDamageTurn = game.turnNumber; }
  settleScenarioObjects(game);
  const damage = [];
  for (const player of game.players) {
    if (!player.alive) continue;
    if (game.damageImmunePlayerIds?.has?.(player.id)) continue;
    if (player.classType === 'saboteur' && effects.attackType === 'teslaOrb') continue;
    if (['coop', 'teams', 'teamHill'].includes(game.mode) && source && player.id !== source.id && player.team === source.team) continue;
    const distance = effects.verticalBeam ? Math.abs(player.x - x) : Math.hypot(player.x - x, player.y - y);
    if (distance > radius * 1.45) continue;
    let amount = Math.round(baseDamage * (1 - distance / (radius * 1.45)));
    if (source?.classType === 'attacker') amount += 20 + Math.round((player.maxHealth || 0) * CLASS_BALANCE.attackerMaxHealthDamage);
    if (source && source.id !== player.id) amount += (source.classEvolutions || []).filter((type) => type === 'overdrive').length * CLASS_EVOLUTIONS.overdrive.damage;
    if (source?.classType === 'armored') amount = Math.max(0, amount - 10);
    if (source?.classType === 'bomber') amount += 10;
    if (player.classType === 'bomber') amount = Math.max(0, amount - (effects.eventType === 'bombardment' ? 20 : 10));
    if (player.classType === 'meteorologist' && effects.eventType) amount = Math.round(amount * .7);
    if (!ignoreShield && (player.shield || player.shieldCharges > 0)) { amount = Math.ceil(amount * 0.35); player.shieldCharges = Math.max(0, (player.shieldCharges || 1) - 1); player.shield = player.shieldCharges > 0; }
    player.health = clamp(player.health - Math.max(0, amount), 0, player.maxHealth);
    const push = Math.round(amount * 0.42 * (effects.pushMultiplier || 1));
    if (push > 0) player.x = clamp(player.x + (player.x < x ? -push : push), 4, WORLD.width - 4);
    if (amount > 0) { player.lastDamageRound = game.roundNumber || 1; if (effects.sourcePlayerId && player.id !== effects.sourcePlayerId) { player.lastDamageSourceId = effects.sourcePlayerId; player.lastDamageTurn = game.turnNumber; } }
    if (player.health <= 0) player.alive = false;
    damage.push({ playerId: player.id, amount, knockback: push });
  }
  settlePlayers(game);
  const removedDepth = terrainBefore.reduce((sum, height, index) => sum + Math.max(0, game.terrain.heights[left + index] - height), 0);
  damage.destruction = { terrainBlocks: Math.floor(removedDepth / 5), platformIds: (game.terrain.floatingPlatforms || []).filter((platform) => activePlatforms.has(platform.id) && !platform.active).map((platform) => platform.id) };
  return damage;
}

function objectGroundY(object) {
  if (Number.isFinite(object.groundY)) return object.groundY;
  if (object.type === 'barrel') return object.y + 8;
  if (object.type === 'launcher') return object.y + 4;
  if (object.type === 'switch') return object.y + 5;
  return object.y;
}

function objectFootprint(object) {
  if (['building', 'watchtower', 'radar', 'fuelTank', 'concrete'].includes(object.type)) return Math.max(24, (object.width || 70) * .42);
  if (object.type === 'crane') return 30;
  if (object.type === 'ramp') return Math.max(25, (object.width || 120) * .35);
  return 12;
}

function terrainSupportY(game, object) {
  const half = objectFootprint(object); const samples = [];
  for (let index = 0; index < 7; index += 1) samples.push(terrainY(game.terrain, object.x - half + half * 2 * index / 6));
  samples.sort((a, b) => a - b); return samples[Math.floor(samples.length / 2)];
}

function damageStructuresFromFall(game, falling, distance, material) {
  if (distance < 55 || material.mass < .8) return [];
  const damaged = [];
  const radius = material.impactRadius + Math.min(75, distance * .16);
  const force = distance >= 170 && material.mass >= 1.1 ? 2 : 1;
  for (const target of game.objects) {
    if (target === falling || target.active === false) continue;
    if (!['building', 'watchtower', 'radar', 'fuelTank', 'crane'].includes(target.type)) continue;
    const gap = Math.abs(target.x - falling.x) - ((falling.width || 36) + (target.width || 36)) / 2;
    if (gap > radius || Math.abs(objectGroundY(target) - falling.groundY) > Math.max(55, distance * .4)) continue;
    const key = target.type === 'crane' ? 'towerDurability' : 'durability';
    const before = target[key] ?? (target.type === 'crane' ? 2 : 3);
    target[key] = Math.max(0, before - force);
    if (target[key] === 0) target.active = false;
    game.interactionSerial = (game.interactionSerial || 0) + 1;
    target.lastImpact = { serial: game.interactionSerial, fromId: falling.id, material: material.material, force, destroyed: target.active === false };
    damaged.push({ id: target.id, durability: target[key], destroyed: target.active === false });
  }
  return damaged;
}

export function settleScenarioObjects(game) {
  if (!game?.objects?.length) return [];
  const falls = [];
  for (const object of game.objects) {
    if (object.active === false && object.type !== 'crane') continue;
    const oldGround = objectGroundY(object); const platform = object.supportPlatformId && game.terrain.floatingPlatforms?.find((entry) => entry.id === object.supportPlatformId && entry.active);
    const nextGround = platform ? platform.y : terrainSupportY(game, object); const lostPlatform = Boolean(object.supportPlatformId && !platform);
    if (!platform) { object.supportPlatformId = null; object.platformOffset = null; }
    if (!Number.isFinite(nextGround) || nextGround > WORLD.height + 35) { object.active = false; object.fallenOut = true; continue; }
    const delta = nextGround - oldGround; if (Math.abs(delta) < 3 && !lostPlatform) continue;
    const fallDistance = Math.max(0, delta); object.groundY = nextGround;
    if (['building', 'watchtower', 'radar', 'fuelTank'].includes(object.type)) object.y = nextGround - object.height / 2;
    else if (object.type === 'crane') { object.y = nextGround - (object.height || 220) / 2; if (object.cableIntact !== false) object.ballY += delta; else object.ballY = terrainY(game.terrain, object.ballX) - Math.max(8, (object.ballRadius || 28) * .45); }
    else if (object.type === 'concrete') object.y = fallDistance > 8 || lostPlatform ? nextGround - 7 : object.y + delta;
    else if (object.type === 'barrel') object.y = nextGround - 8;
    else if (object.type === 'launcher') object.y = nextGround - 4;
    else if (object.type === 'switch') object.y = nextGround - 5;
    else object.y += delta;
    if (fallDistance < 8) continue;
    const material = STRUCTURE_MATERIALS[object.type] || { material: 'metal', mass: 1, impactRadius: 24, craterRadius: 0 };
    game.interactionSerial = (game.interactionSerial || 0) + 1; object.lastFall = { serial: game.interactionSerial, fromGroundY: oldGround, toGroundY: nextGround, distance: fallDistance, material: material.material };
    const range = Math.max(material.impactRadius, (object.width || 0) * .55);
    const baseDamage = clamp(Math.round((16 + fallDistance * .42) * material.mass), 8, 145);
    if (material.craterRadius && fallDistance >= 90 && !platform) carveTerrain(game.terrain, object.x, nextGround + material.craterRadius * .55, material.craterRadius);
    for (const player of game.players || []) { if (!player.alive || game.damageImmunePlayerIds?.has?.(player.id) || Math.abs(player.x - object.x) > range || Math.abs(player.y - nextGround) > 130) continue; const amount = Math.max(8, Math.round(baseDamage * (1 - Math.abs(player.x - object.x) / (range * 1.3)))); player.health = Math.max(0, player.health - amount); player.alive = player.health > 0; player.lastDamageRound = game.roundNumber; }
    const structures = damageStructuresFromFall(game, object, fallDistance, material);
    falls.push({ id: object.id, type: object.type, distance: fallDistance, damage: baseDamage, structures });
  }
  return falls;
}

export function settlePlayers(game) {
  for (const player of game.players) {
    if (!player.alive) continue;
    const standOnPlatform = (platform) => {
      const clear = (x) => [x - WORLD.tankRadius - 2, x, x + WORLD.tankRadius + 2].every((at) => terrainY(game.terrain, at) >= platform.y - 1);
      let landingX = player.x;
      if (!clear(landingX)) {
        landingX = null;
        for (let offset = 4; offset <= platform.width && landingX === null; offset += 4) for (const direction of [-1, 1]) {
          const candidate = player.x + offset * direction;
          if (candidate >= platform.x && candidate <= platform.x + platform.width && clear(candidate)) { landingX = candidate; break; }
        }
      }
      if (landingX === null) return false;
      player.x = landingX; player.y = platform.y - WORLD.tankRadius; player.supportPlatformId = platform.id; player.platformOffset = landingX - platform.x;
      return true;
    };
    const current = game.terrain.floatingPlatforms?.find((platform) => platform.id === player.supportPlatformId && platform.active && player.x >= platform.x && player.x <= platform.x + platform.width);
    if (current && standOnPlatform(current)) continue;
    const below = game.terrain.floatingPlatforms?.filter((platform) => platform.active && player.x >= platform.x && player.x <= platform.x + platform.width && platform.y >= player.y + WORLD.tankRadius - 3).sort((a, b) => a.y - b.y)[0];
    if (below && standOnPlatform(below)) continue;
    player.supportPlatformId = null; player.platformOffset = null;
    const settled = resolveTankFootprint(game.terrain, player.x);
    if (settled.ground > WORLD.height) { player.alive = false; player.health = 0; continue; }
    player.x = settled.x; player.y = settled.ground - WORLD.tankRadius;
  }
}
