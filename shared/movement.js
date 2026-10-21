import { WEAPON_BALANCE, WORLD, clamp } from './constants.js';

export const DRIVE = Object.freeze({ fuel: 240, speed: 94, packetMs: 90, refillRounds: 2 });
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

export function walkPath(terrain, player, direction, distance) {
  const dir = direction < 0 ? -1 : 1;
  if (player.spiderClimb && player.ceilingClinging) {
    const ceiling = terrain.floatingPlatforms?.find((entry) => entry.id === player.ceilingClinging && entry.active);
    if (ceiling) { const x = clamp(player.x + dir * distance, ceiling.x + WORLD.tankRadius, ceiling.x + ceiling.width - WORLD.tankRadius); return { x, y: ceiling.y + (ceiling.height || 8) + WORLD.tankRadius, feet: ceiling.y + (ceiling.height || 8) + WORLD.tankRadius * 2, supportPlatformId: null, ceilingClinging: ceiling.id, moved: Math.abs(x - player.x) > .1, blockedByWall: false, climbing: true, safe: true }; }
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
    const support = terrain.floatingPlatforms?.find((platform) => platform.id === supportPlatformId && platform.active && nextX >= platform.x && nextX <= platform.x + platform.width);
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

// The opening Aranha jump approaches the first wall. Climbing happens on
// subsequent held-drive ticks, instead of spending the card on one 12px lift.
export function spiderLeapPath(terrain, player, direction, distance) {
  const dir = direction < 0 ? -1 : 1;
  const path = walkPath(terrain, { ...player, spiderClimb: false, spiderLeap: true }, dir, distance);
  if (!path.blockedByWall || !path.safe) return path;
  const contactX = path.wallContactX ?? path.x;
  const contactFeet = terrain.heights[Math.round(clamp(contactX, 0, WORLD.width - 1))];
  const wallX = clamp(contactX + dir * (WORLD.tankRadius + 3), 0, WORLD.width - 1);
  const wallTop = terrain.heights[Math.round(wallX)];
  const lift = Math.min(30, Math.max(0, contactFeet - wallTop - 5));
  return { ...path, x: contactX, y: contactFeet - WORLD.tankRadius - lift, feet: contactFeet - lift, moved: true, climbing: true, attachedToWall: true };
}

export function spiderLeapTarget(terrain, player, targetX, targetY) {
  const range = movementDistance({ spiderLeap: true });
  const dx = targetX - player.x;
  if (!Number.isFinite(targetX) || !Number.isFinite(targetY) || Math.abs(dx) < 18 || Math.hypot(dx, targetY - player.y) > range) {
    return { valid: false, reason: `Escolha um ponto dentro de ${range} blocos.`, range };
  }
  const direction = dx < 0 ? -1 : 1;
  const path = spiderLeapPath(terrain, player, direction, Math.abs(dx));
  if (!path.moved || !path.safe || Math.abs(targetY - path.y) > 155) {
    return { valid: false, reason: 'Não há pouso ou parede alcançável nesse ponto.', range, path, direction };
  }
  return { valid: true, range, path, direction, targetX, targetY };
}

export function movementDistance({ armoredDash = false, spiderLeap = false, rocketDash = false, boostStacks = 0 } = {}) {
  return armoredDash ? (rocketDash ? 390 : 285) : spiderLeap ? 230 : rocketDash ? 230 : Math.min(138, 72 + boostStacks * 22);
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
