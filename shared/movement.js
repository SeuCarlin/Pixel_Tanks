import { WEAPON_BALANCE, WORLD, clamp } from './constants.js';

export const DRIVE = Object.freeze({ fuel: 240, speed: 94, packetMs: 90, refillRounds: 2 });
const SPIDER_LEAP_RANGE = 380;
const SPIDER_STRUCTURE_TYPES = new Set(['building', 'watchtower', 'radar', 'fuelTank', 'supplyCache', 'shockCoil', 'lightningRod', 'healingStation', 'sentry', 'ammoTerminal', 'shieldGenerator', 'repulsor', 'concrete']);

function platformRect(platform) {
  return { left: platform.x, right: platform.x + platform.width, top: platform.y, bottom: platform.y + (platform.height || 8) };
}

function structureRect(object) {
  if (!object || object.active === false || !SPIDER_STRUCTURE_TYPES.has(object.type)) return null;
  const width = object.width || 28; const height = object.height || 32;
  const bottom = object.groundY ?? object.y + height / 2;
  return { left: object.x - width / 2, right: object.x + width / 2, top: bottom - height, bottom };
}

export function spiderSurfaceRect(terrain, objects = [], cling) {
  if (!cling?.id) return null;
  if (cling.kind === 'platform') {
    const platform = terrain.floatingPlatforms?.find((entry) => entry.id === cling.id && entry.active);
    return platform ? { ...platformRect(platform), id: platform.id, kind: 'platform' } : null;
  }
  const object = objects.find((entry) => entry.id === cling.id && entry.active !== false);
  const rect = structureRect(object);
  return rect ? { ...rect, id: object.id, kind: 'structure' } : null;
}

function surfacePath(rect, player, dir, distance) {
  const radius = WORLD.tankRadius;
  const side = player.surfaceClinging.side;
  const minX = rect.left + radius; const maxX = rect.right - radius;
  const topY = rect.top - radius; const bottomY = rect.bottom + radius;
  const result = { supportPlatformId: null, ceilingClinging: null, blockedByWall: false, climbing: true, safe: true };
  if (side === 'top' || side === 'bottom') {
    const desiredX = player.x + dir * distance;
    if (desiredX < minX || desiredX > maxX) {
      const x = desiredX < minX ? minX : maxX;
      if (side === 'bottom') {
        if (rect.kind === 'platform') return { ...result, x, y: topY, feet: topY + radius, supportPlatformId: rect.id, moved: true, climbing: false, surface: 'platform-top' };
        return { ...result, x, y: topY, feet: topY + radius, surfaceClinging: { kind: rect.kind, id: rect.id, side: 'top' }, moved: true, surface: 'structure-top' };
      }
      if (rect.kind === 'platform') return { ...result, x, y: bottomY, feet: bottomY + radius, ceilingClinging: rect.id, moved: true, surface: 'platform-bottom' };
      return { ...result, x, y: bottomY, feet: bottomY + radius, surfaceClinging: { kind: rect.kind, id: rect.id, side: 'bottom' }, moved: true, surface: 'structure-bottom' };
    }
    const x = clamp(desiredX, minX, maxX); const y = side === 'top' ? topY : bottomY;
    return { ...result, x, y, feet: y + radius, surfaceClinging: { ...player.surfaceClinging }, moved: Math.abs(x - player.x) > .1, surface: `${rect.kind}-${side}` };
  }
  const left = side === 'left'; const towardSurface = left ? dir > 0 : dir < 0;
  const minY = rect.top + radius; const maxY = rect.bottom - radius;
  const desiredY = player.y + (towardSurface ? -distance : distance);
  const x = left ? rect.left - radius : rect.right + radius;
  if (desiredY < minY) {
    const topX = clamp(left ? rect.left + radius : rect.right - radius, minX, maxX);
    if (rect.kind === 'platform') return { ...result, x: topX, y: topY, feet: topY + radius, supportPlatformId: rect.id, moved: true, climbing: false, surface: 'platform-top' };
    return { ...result, x: topX, y: topY, feet: topY + radius, surfaceClinging: { kind: rect.kind, id: rect.id, side: 'top' }, moved: true, surface: 'structure-top' };
  }
  if (desiredY > maxY) {
    const bottomX = clamp(left ? rect.left + radius : rect.right - radius, minX, maxX);
    if (rect.kind === 'platform') return { ...result, x: bottomX, y: bottomY, feet: bottomY + radius, ceilingClinging: rect.id, moved: true, surface: 'platform-bottom' };
    return { ...result, x: bottomX, y: bottomY, feet: bottomY + radius, surfaceClinging: { kind: rect.kind, id: rect.id, side: 'bottom' }, moved: true, surface: 'structure-bottom' };
  }
  const y = clamp(desiredY, minY, maxY);
  return { ...result, x, y, feet: y + radius, surfaceClinging: { ...player.surfaceClinging }, moved: Math.abs(y - player.y) > .1, surface: `${rect.kind}-${side}` };
}
export function driveStats(player) {
  const classType = player.teslaDisabledTurns > 0 ? null : player.classType;
  const classes = { armored: [-14, 50], attacker: [8, 0], bomber: [-8, 35], healer: [0, 20], meteorologist: [0, 10], ninja: [35, 95], saboteur: [12, 25], backpacker: [-3, 100] };
  const [speedBonus, fuelBonus] = classes[classType] || [0, 0];
  const boosts = player.inventory?.filter((type) => type === 'movementBoost').length || 0;
  return { speed: DRIVE.speed + speedBonus + (player.spiderClimb ? 20 : 0) + boosts * 8, maxFuel: DRIVE.fuel + fuelBonus + (player.spiderClimb ? 90 : 0) + boosts * 65 };
}

export function resolveTankFootprint(terrain, x, { clearance = 7 } = {}) {
  const surface = (at) => terrain.heights[Math.round(clamp(at, 0, WORLD.width - 1))];
  const footprint = (at) => {
    const center = surface(at); const left = surface(at - WORLD.tankRadius - 2); const right = surface(at + WORLD.tankRadius + 2);
    return { center, highest: Math.min(center, left, right), clear: center <= WORLD.height && center - Math.min(left, right) <= clearance };
  };
  const original = footprint(x);
  if (original.center > WORLD.height || original.clear) return { x, ground: original.center };
  let safeX = null; let fallbackX = null;
  for (let offset = 4; offset <= 144 && safeX === null; offset += 4) for (const sign of [-1, 1]) {
    const candidate = clamp(x + offset * sign, WORLD.tankRadius + 2, WORLD.width - WORLD.tankRadius - 2);
    const candidateSupport = footprint(candidate);
    if (candidateSupport.clear) { fallbackX ??= candidate; if (candidateSupport.center >= original.center - 12) { safeX = candidate; break; } }
  }
  safeX ??= fallbackX;
  return safeX === null ? { x, ground: original.highest } : { x: safeX, ground: footprint(safeX).center };
}

export function walkPath(terrain, player, direction, distance, objects = []) {
  const dir = direction < 0 ? -1 : 1;
  if (player.spiderClimb && player.surfaceClinging) {
    const surface = spiderSurfaceRect(terrain, objects, player.surfaceClinging);
    if (surface) return surfacePath(surface, player, dir, distance);
  }
  if (player.spiderClimb && player.ceilingClinging) {
    const ceiling = terrain.floatingPlatforms?.find((entry) => entry.id === player.ceilingClinging && entry.active);
    if (ceiling) {
      const minX = ceiling.x + WORLD.tankRadius; const maxX = ceiling.x + ceiling.width - WORLD.tankRadius;
      const desiredX = player.x + dir * distance;
      if (desiredX < minX || desiredX > maxX) {
        const x = desiredX < minX ? minX : maxX; const y = ceiling.y - WORLD.tankRadius;
        return { x, y, feet: y + WORLD.tankRadius, supportPlatformId: ceiling.id, ceilingClinging: null, moved: true, blockedByWall: false, climbing: false, safe: true, surface: 'platform-top' };
      }
      const x = clamp(desiredX, minX, maxX);
      return { x, y: ceiling.y + (ceiling.height || 8) + WORLD.tankRadius, feet: ceiling.y + (ceiling.height || 8) + WORLD.tankRadius * 2, supportPlatformId: null, ceilingClinging: ceiling.id, moved: Math.abs(x - player.x) > .1, blockedByWall: false, climbing: true, safe: true, surface: 'platform-bottom' };
    }
  }
  const stepUp = player.spiderClimb || player.spiderLeap ? 12 : 6;
  const targetX = clamp(player.x + dir * distance, 12, WORLD.width - 12);
  let x = player.x;
  let feet = player.y + WORLD.tankRadius;
  let supportPlatformId = player.supportPlatformId || null;
  let blockedByWall = false;
  let wallContactX = null;
  let climbing = false;
  while (Math.abs(targetX - x) > .1) {
    const nextX = x + dir * Math.min(3, Math.abs(targetX - x));
    const previousSupport = terrain.floatingPlatforms?.find((platform) => platform.id === supportPlatformId && platform.active);
    let support = previousSupport && nextX >= previousSupport.x && nextX <= previousSupport.x + previousSupport.width ? previousSupport : null;
    if (!support && previousSupport?.kind === 'treeBranch') {
      support = terrain.floatingPlatforms?.find((platform) => platform.active && platform.kind === 'treeBranch' && platform.treeId === previousSupport.treeId && nextX >= platform.x && nextX <= platform.x + platform.width && Math.abs(platform.y - previousSupport.y) <= stepUp);
      if (support) supportPlatformId = support.id;
    }
    if (!support && supportPlatformId && player.spiderClimb) { const edge = terrain.floatingPlatforms?.find((platform) => platform.id === supportPlatformId && platform.active); if (edge) { x = clamp(x, edge.x + WORLD.tankRadius, edge.x + edge.width - WORLD.tankRadius); return { x, y: edge.y + (edge.height || 8) + WORLD.tankRadius, feet: edge.y + (edge.height || 8) + WORLD.tankRadius * 2, supportPlatformId: null, ceilingClinging: edge.id, moved: true, blockedByWall: false, climbing: true, safe: true }; } }
    const nextFeet = support ? support.y : terrain.heights[Math.round(clamp(nextX, 0, WORLD.width - 1))];
    const frontFeet = support ? nextFeet : terrain.heights[Math.round(clamp(nextX + dir * WORLD.tankRadius, 0, WORLD.width - 1))];
    const wallAhead = !support && feet - frontFeet > stepUp + 10 && nextFeet - frontFeet > 10;
    if (wallAhead) {
      if (!player.spiderClimb) { blockedByWall = true; wallContactX = x; break; }
      feet -= Math.min(12, feet - frontFeet); climbing = true;
      if (feet - frontFeet > stepUp) break;
    }
    if (feet - nextFeet > stepUp) {
      if (!player.spiderClimb) { blockedByWall = true; wallContactX = x; break; }
      // Remain outside the wall while the tracks climb it; each drive tick lifts
      // only a short distance, so the tank cannot teleport up a cliff.
      const lift = Math.min(12, feet - nextFeet);
      feet -= lift; climbing = true;
      if (feet - nextFeet > stepUp) break;
    }
    if (player.wallClinging === dir && !support && nextFeet - feet > 20 && frontFeet <= feet + stepUp) { x = nextX; feet = Math.min(feet, frontFeet); climbing = true; continue; }
    if (nextFeet - feet > 20 && !support) { x = nextX; supportPlatformId = null; break; }
    x = nextX;
    feet = nextFeet;
    if (!support) supportPlatformId = null;
    if (feet > WORLD.height) break;
  }
  if (!climbing && !supportPlatformId && feet <= WORLD.height && Math.abs(x - player.x) > .1 && terrain.heights[Math.round(clamp(x, 0, WORLD.width - 1))] - feet <= 20) { const settled = resolveTankFootprint(terrain, x, { clearance: player.spiderClimb ? 28 : 7 }); x = settled.x; feet = settled.ground; }
  return { x, y: feet - WORLD.tankRadius, feet, supportPlatformId, moved: Math.abs(x - player.x) > .1 || climbing, blockedByWall, wallContactX, climbing, safe: feet <= WORLD.height };
}

function rectEntryFace(previous, point, rect) {
  const dx = point.x - previous.x; const dy = point.y - previous.y; const candidates = [];
  if (Math.abs(dx) > .001) {
    for (const [face, edge] of [['left', rect.left], ['right', rect.right]]) {
      const amount = (edge - previous.x) / dx; const y = previous.y + dy * amount;
      if (amount >= 0 && amount <= 1 && y >= rect.top - .1 && y <= rect.bottom + .1) candidates.push({ face, amount });
    }
  }
  if (Math.abs(dy) > .001) {
    for (const [face, edge] of [['top', rect.top], ['bottom', rect.bottom]]) {
      const amount = (edge - previous.y) / dy; const x = previous.x + dx * amount;
      if (amount >= 0 && amount <= 1 && x >= rect.left - .1 && x <= rect.right + .1) candidates.push({ face, amount });
    }
  }
  return candidates.sort((a, b) => a.amount - b.amount)[0]?.face || 'top';
}

function spiderRectContact(rect, kind, id, face, point, arcHeight) {
  const radius = WORLD.tankRadius;
  const x = face === 'left' ? rect.left - radius : face === 'right' ? rect.right + radius : clamp(point.x, rect.left + radius, rect.right - radius);
  const y = face === 'top' ? rect.top - radius : face === 'bottom' ? rect.bottom + radius : clamp(point.y, rect.top + radius, rect.bottom - radius);
  const base = { x, y, feet: y + radius, moved: true, blockedByWall: false, safe: true, attachedToSurface: true, surface: `${kind}-${face}`, arcHeight };
  if (kind === 'platform' && face === 'top') return { ...base, supportPlatformId: id, ceilingClinging: null, climbing: false };
  if (kind === 'platform' && face === 'bottom') return { ...base, supportPlatformId: null, ceilingClinging: id, climbing: true };
  return { ...base, supportPlatformId: null, ceilingClinging: null, surfaceClinging: { kind, id, side: face }, climbing: true, attachedToWall: face === 'left' || face === 'right' };
}

// The leap follows the visible arc and stops at the first real surface touched
// by the tank footprint instead of snapping to a horizontal approximation.
export function spiderLeapPath(terrain, player, targetX, targetY, objects = []) {
  // Preserve the original direction/distance helper signature for simulations
  // that only need a horizontal target.
  if ((targetX === -1 || targetX === 1) && Number.isFinite(targetY) && targetY >= 0) {
    targetX = player.x + targetX * targetY; targetY = player.y;
  }
  const dx = targetX - player.x; const dy = targetY - player.y;
  const distance = Math.hypot(dx, dy); const arcHeight = clamp(distance * .32, 95, 190);
  const steps = Math.max(24, Math.ceil(distance / 3));
  let previous = { x: player.x, y: player.y };
  for (let step = 1; step <= steps; step += 1) {
    const amount = step / steps;
    const point = { x: player.x + dx * amount, y: player.y + dy * amount - Math.sin(amount * Math.PI) * arcHeight };
    if (point.x < WORLD.tankRadius || point.x > WORLD.width - WORLD.tankRadius || point.y < WORLD.tankRadius) break;
    if (amount > .07) {
      for (const platform of terrain.floatingPlatforms || []) {
        if (!platform.active) continue;
        const rect = platformRect(platform); const expanded = { left: rect.left - WORLD.tankRadius, right: rect.right + WORLD.tankRadius, top: rect.top - WORLD.tankRadius, bottom: rect.bottom + WORLD.tankRadius };
        if (point.x < expanded.left || point.x > expanded.right || point.y < expanded.top || point.y > expanded.bottom) continue;
        const face = rectEntryFace(previous, point, expanded);
        return spiderRectContact(rect, 'platform', platform.id, face, point, arcHeight);
      }
      for (const object of objects) {
        const rect = structureRect(object); if (!rect) continue;
        const expanded = { left: rect.left - WORLD.tankRadius, right: rect.right + WORLD.tankRadius, top: rect.top - WORLD.tankRadius, bottom: rect.bottom + WORLD.tankRadius };
        if (point.x < expanded.left || point.x > expanded.right || point.y < expanded.top || point.y > expanded.bottom) continue;
        const face = rectEntryFace(previous, point, expanded);
        return spiderRectContact(rect, 'structure', object.id, face, point, arcHeight);
      }
      const sampleX = Math.round(clamp(point.x, 0, WORLD.width - 1));
      const ground = terrain.heights[sampleX];
      if (point.y + WORLD.tankRadius >= ground) {
        const previousGround = terrain.heights[Math.round(clamp(previous.x, 0, WORLD.width - 1))];
        if (ground < previousGround - 12) {
          const direction = dx < 0 ? -1 : 1; const x = clamp(point.x - direction * (WORLD.tankRadius + 2), WORLD.tankRadius, WORLD.width - WORLD.tankRadius);
          return { x, y: point.y, feet: point.y + WORLD.tankRadius, supportPlatformId: null, ceilingClinging: null, moved: true, blockedByWall: false, climbing: true, attachedToWall: true, wallClinging: direction, safe: true, surface: 'terrain-wall', arcHeight };
        }
        return { x: point.x, y: ground - WORLD.tankRadius, feet: ground, supportPlatformId: null, ceilingClinging: null, moved: true, blockedByWall: false, climbing: false, safe: ground <= WORLD.height, surface: 'ground', arcHeight };
      }
    }
    previous = point;
  }
  return { x: player.x, y: player.y, feet: player.y + WORLD.tankRadius, supportPlatformId: player.supportPlatformId || null, moved: false, blockedByWall: false, climbing: false, safe: false, arcHeight };
}

export function spiderLeapTarget(terrain, player, targetX, targetY, objects = []) {
  const range = movementDistance({ spiderLeap: true });
  const dx = targetX - player.x; const dy = targetY - player.y;
  if (!Number.isFinite(targetX) || !Number.isFinite(targetY) || Math.hypot(dx, dy) < 24 || Math.hypot(dx, dy) > range) {
    return { valid: false, reason: `Escolha um ponto dentro de ${range} blocos.`, range };
  }
  const direction = dx < 0 ? -1 : 1;
  const path = spiderLeapPath(terrain, player, targetX, targetY, objects);
  if (!path.moved || !path.safe) {
    return { valid: false, reason: 'Não há solo, parede, plataforma ou estrutura alcançável nesse ponto.', range, path, direction };
  }
  return { valid: true, range, path, direction, targetX, targetY };
}

export function movementDistance({ armoredDash = false, spiderLeap = false, rocketDash = false, boostStacks = 0 } = {}) {
  return armoredDash ? (rocketDash ? 390 : 285) : spiderLeap ? SPIDER_LEAP_RANGE : rocketDash ? 230 : Math.min(138, 72 + boostStacks * 22);
}

export function excavateWall(terrain, startX, direction, feet) {
  for (let step = 0; step <= 34; step += 1) {
    const x = Math.round(clamp(startX + direction * step, 0, WORLD.width - 1));
    const half = Math.max(3, 12 - Math.abs(step - 12) * .25);
    for (let dx = -half; dx <= half; dx += 1) {
      const px = Math.round(clamp(x + dx, 0, WORLD.width - 1));
      terrain.heights[px] = Math.max(terrain.heights[px], Math.round(feet + 7));
    }
  }
}

// Mutates terrain only for a breaking movement. The client passes a cloned height array.
export function specialMovePath(terrain, player, direction, distance, { armoredDash = false, excavator = false, onStep = null } = {}) {
  const dir = direction < 0 ? -1 : 1;
  const targetX = clamp(player.x + dir * distance, 12, WORLD.width - 12);
  let x = player.x; let feet = player.y + WORLD.tankRadius;
  let supportPlatformId = player.supportPlatformId || null;
  let blockedByWall = false;
  const wallBreakPoints = [];
  while (Math.abs(targetX - x) > .1) {
    const nextX = x + dir * Math.min(3, Math.abs(targetX - x));
    const support = terrain.floatingPlatforms?.find((platform) => platform.id === supportPlatformId && platform.active && nextX >= platform.x && nextX <= platform.x + platform.width);
    let nextFeet = support ? support.y : terrain.heights[Math.round(clamp(nextX, 0, WORLD.width - 1))];
    const climb = feet - nextFeet;
    if (climb > 6 && excavator && !support) { excavateWall(terrain, nextX, dir, feet); nextFeet = terrain.heights[Math.round(clamp(nextX, 0, WORLD.width - 1))]; }
    else if (climb > 14 && armoredDash && wallBreakPoints.length < WEAPON_BALANCE.armoredDash.walls && !support) { excavateWall(terrain, nextX, dir, feet); nextFeet = terrain.heights[Math.round(clamp(nextX, 0, WORLD.width - 1))]; wallBreakPoints.push({ x: Math.round(nextX + dir * 17), y: Math.round(feet) }); }
    const remainingClimb = feet - nextFeet;
    if (remainingClimb > 6 && !player.spiderClimb && !(armoredDash && remainingClimb <= 14)) { blockedByWall = true; break; }
    x = nextX; feet = nextFeet;
    onStep?.(x, feet);
    if (!support) supportPlatformId = null;
    if (feet > WORLD.height) break;
  }
  if (!supportPlatformId && feet <= WORLD.height) { const settled = resolveTankFootprint(terrain, x); x = settled.x; feet = settled.ground; }
  return { x, y: feet - WORLD.tankRadius, feet, supportPlatformId, moved: Math.abs(x - player.x) > .1, blockedByWall, safe: feet <= WORLD.height, wallBreakPoints };
}

export function safeGroundAt(terrain, x) {
  const samples = [];
  for (let dx = -28; dx <= 28; dx += 4) samples.push(terrain.heights[Math.round(clamp(x + dx, 0, WORLD.width - 1))]);
  return samples.every((y) => y < WORLD.height - 18) && Math.max(...samples) - Math.min(...samples) <= 26;
}

export function blinkLanding(terrain, players, player, desiredX, maxRange = 270, objects = [], desiredY = null) {
  const distance = Math.abs(desiredX - player.x);
  if (!Number.isFinite(desiredX) || distance > maxRange) return { valid: false, distance, maxRange, reason: `Escolha um ponto a até ${maxRange} blocos.` };
  const drone = Number.isFinite(desiredY) && objects.find((entry) => entry.type === 'specialistDrone' && entry.active && entry.hovering && Math.abs(entry.x - desiredX) <= entry.width / 2 + 6 && Math.abs(entry.y - desiredY) <= entry.height / 2 + 9);
  if (drone) {
    const landing = { x: drone.x, y: drone.y - drone.height / 2 - WORLD.tankRadius - 3, supportObjectId: drone.id };
    if (!players.some((entry) => entry.alive && entry.id !== player.id && Math.hypot(entry.x - landing.x, entry.y - landing.y) < 28)) return { valid: true, distance, maxRange, landing };
  }
  for (let offset = 0; offset <= 70; offset += 5) for (const direction of offset ? [1, -1] : [1]) {
    const x = Math.round(clamp(desiredX + offset * direction, 30, WORLD.width - 30));
    if (!safeGroundAt(terrain, x)) continue;
    const y = terrain.heights[Math.round(x)] - WORLD.tankRadius;
    if (players.some((entry) => entry.alive && entry.id !== player.id && Math.abs(entry.x - x) < 28 && Math.abs(entry.y - y) < 28)) continue;
    return { valid: true, distance, maxRange, landing: { x, y } };
  }
  return { valid: false, distance, maxRange, reason: 'Não há pouso seguro perto desse ponto.' };
}

export function launcherDestination(terrain, objects, player, movementDirection, turnNumber) {
  const launcher = (objects || []).find((object) => object.type === 'launcher' && object.active && object.cooldownUntilTurn <= turnNumber && Math.abs(object.x - player.x) <= 30 && Math.abs(object.y - player.y) <= 24);
  if (!launcher) return null;
  const direction = launcher.direction || movementDirection;
  for (let distance = 240; distance >= 100; distance -= 10) {
    const candidate = clamp(player.x + direction * distance, 45, WORLD.width - 45);
    for (let offset = 0; offset <= 70; offset += 5) for (const side of offset ? [1, -1] : [1]) {
      const x = clamp(candidate + side * offset, 45, WORLD.width - 45);
      if (safeGroundAt(terrain, x)) return { x, y: terrain.heights[Math.round(x)] - WORLD.tankRadius, direction, launcher };
    }
  }
  return null;
}
