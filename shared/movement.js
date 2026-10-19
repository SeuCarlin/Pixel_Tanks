import { WEAPON_BALANCE, WORLD, clamp } from './constants.js';

export const DRIVE = Object.freeze({ fuel: 240, speed: 94, packetMs: 90, refillRounds: 2 });
export function driveStats(player) {
  const classType = player.teslaDisabledTurns > 0 ? null : player.classType;
  const classes = { armored: [-14, 50], attacker: [8, 0], bomber: [-8, 35], healer: [0, 20], meteorologist: [0, 10], ninja: [24, 70], saboteur: [12, 25], backpacker: [-3, 100] };
  const [speedBonus, fuelBonus] = classes[classType] || [0, 0];
  const boosts = player.inventory?.filter((type) => type === 'movementBoost').length || 0;
  return { speed: DRIVE.speed + speedBonus + boosts * 8, maxFuel: DRIVE.fuel + fuelBonus + boosts * 65 };
}

export function resolveTankFootprint(terrain, x) {
  const surface = (at) => terrain.heights[Math.round(clamp(at, 0, WORLD.width - 1))];
  const footprint = (at) => {
    const center = surface(at); const left = surface(at - WORLD.tankRadius - 2); const right = surface(at + WORLD.tankRadius + 2);
    return { center, highest: Math.min(center, left, right), clear: center <= WORLD.height && center - Math.min(left, right) <= 7 };
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
  const targetX = clamp(player.x + dir * distance, 12, WORLD.width - 12);
  let x = player.x;
  let feet = player.y + WORLD.tankRadius;
  let supportPlatformId = player.supportPlatformId || null;
  let blockedByWall = false;
  let climbing = false;
  while (Math.abs(targetX - x) > .1) {
    const nextX = x + dir * Math.min(3, Math.abs(targetX - x));
    const support = terrain.floatingPlatforms?.find((platform) => platform.id === supportPlatformId && platform.active && nextX >= platform.x && nextX <= platform.x + platform.width);
    const nextFeet = support ? support.y : terrain.heights[Math.round(clamp(nextX, 0, WORLD.width - 1))];
    if (feet - nextFeet > 6) {
      if (!player.spiderClimb) { blockedByWall = true; break; }
      // Remain outside the wall while the tracks climb it; each drive tick lifts
      // only a short distance, so the tank cannot teleport up a cliff.
      const lift = Math.min(12, feet - nextFeet);
      feet -= lift; climbing = true;
      if (feet - nextFeet > 6) break;
    }
    if (nextFeet - feet > 20 && !support) { x = nextX; supportPlatformId = null; break; }
    x = nextX;
    feet = nextFeet;
    if (!support) supportPlatformId = null;
    if (feet > WORLD.height) break;
  }
  if (!climbing && !supportPlatformId && feet <= WORLD.height && Math.abs(x - player.x) > .1 && terrain.heights[Math.round(clamp(x, 0, WORLD.width - 1))] - feet <= 20) { const settled = resolveTankFootprint(terrain, x); x = settled.x; feet = settled.ground; }
  return { x, y: feet - WORLD.tankRadius, feet, supportPlatformId, moved: Math.abs(x - player.x) > .1 || climbing, blockedByWall, climbing, safe: feet <= WORLD.height };
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
