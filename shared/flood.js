import { WORLD, clamp } from './constants.js';

// A lake is a shallow cut in the existing microblock terrain, not a flat overlay.
export function carveFloodBasin(terrain, centerX, radius = 175, depth = 65) {
  const center = Math.round(clamp(centerX, radius + 8, WORLD.width - radius - 8));
  const edgeLeft = terrain.heights[Math.round(center - radius)];
  const edgeRight = terrain.heights[Math.round(center + radius)];
  const centerGround = terrain.heights[center];
  const surfaceY = Math.round(clamp(Math.min(edgeLeft, edgeRight, centerGround + 16) - 5, 150, WORLD.height - 105));
  const waterFloor = Math.min(WORLD.height - 48, surfaceY + depth);
  for (let x = Math.max(0, center - radius); x <= Math.min(WORLD.width - 1, center + radius); x += 1) {
    const distance = Math.abs(x - center) / radius;
    const carve = (1 - distance * distance) ** 2;
    terrain.heights[x] = Math.max(terrain.heights[x], Math.round(surfaceY + (waterFloor - surfaceY) * carve));
  }
  return { x: center, radius, surfaceY };
}

export const LAKE_DRAIN_MS = 1800;

export function waterSurfaceAt(lake, now = Date.now()) {
  if (!lake.drainingAt) return lake.surfaceY;
  return lake.surfaceY + (WORLD.height - lake.surfaceY) * clamp((now - lake.drainingAt) / LAKE_DRAIN_MS, 0, 1);
}

// Merge overlapping lake surfaces on the same microblock columns. This matches
// waterDepthAt's rule of using the deepest (highest-surface) body of water.
export function visibleWaterColumns(lakes, left, right, now = Date.now(), step = 5) {
  const firstX = Math.ceil(clamp(left, 0, WORLD.width - 1) / step) * step;
  const lastX = Math.floor(clamp(right, 0, WORLD.width - 1) / step) * step;
  const surfaces = new Float32Array(Math.max(0, Math.floor((lastX - firstX) / step) + 1));
  surfaces.fill(Infinity);
  for (const lake of lakes || []) {
    const start = Math.max(firstX, Math.ceil((lake.x - lake.radius + 5) / step) * step);
    const end = Math.min(lastX, Math.floor((lake.x + lake.radius - 5) / step) * step);
    if (start > end) continue;
    const surface = waterSurfaceAt(lake, now);
    for (let x = start; x <= end; x += step) {
      const index = (x - firstX) / step;
      surfaces[index] = Math.min(surfaces[index], surface);
    }
  }
  return { firstX, step, surfaces };
}

// New floodwater raises every basin connected through an actually submerged
// overlap. A dry ridge may separate overlapping horizontal extents.
export function equalizeConnectedLakes(terrain, lakes) {
  let changed = false;
  let passChanged;
  do {
    passChanged = false;
    for (let first = 0; first < lakes.length; first += 1) for (let second = first + 1; second < lakes.length; second += 1) {
      const a = lakes[first]; const b = lakes[second];
      if (a.drainingAt || b.drainingAt || a.surfaceY === b.surfaceY) continue;
      const left = Math.max(a.x - a.radius + 5, b.x - b.radius + 5);
      const right = Math.min(a.x + a.radius - 5, b.x + b.radius - 5);
      if (left > right) continue;
      let connected = false;
      for (let x = Math.ceil(left); x <= right; x += 5) {
        if (terrain.heights[x] > Math.max(a.surfaceY, b.surfaceY) + 8) { connected = true; break; }
      }
      if (!connected) continue;
      const surface = Math.min(a.surfaceY, b.surfaceY);
      if (a.surfaceY !== surface) { a.surfaceY = surface; passChanged = true; }
      if (b.surfaceY !== surface) { b.surfaceY = surface; passChanged = true; }
    }
    changed ||= passChanged;
  } while (passChanged);
  return changed;
}

export function waterDepthAt(terrain, lakes, x, feetY, now = Date.now()) {
  const column = Math.round(clamp(x, 0, WORLD.width - 1));
  const ground = terrain.heights[column];
  if (!Number.isFinite(ground)) return 0;
  let depth = 0;
  for (const lake of lakes || []) {
    if (Math.abs(x - lake.x) >= lake.radius - 5) continue;
    const surface = waterSurfaceAt(lake, now);
    if (ground <= surface + 8 || feetY <= surface) continue;
    depth = Math.max(depth, Math.min(feetY, ground) - surface);
  }
  return Math.max(0, depth);
}

export function swimmableWaterSurface(terrain, lakes, x, now = Date.now()) {
  const column = Math.round(clamp(x, 0, WORLD.width - 1));
  const ground = terrain.heights[column];
  let surfaceY = Infinity;
  for (const lake of lakes || []) {
    if (Math.abs(x - lake.x) >= lake.radius - 5) continue;
    const surface = waterSurfaceAt(lake, now);
    if (ground - surface >= 20) surfaceY = Math.min(surfaceY, surface);
  }
  return Number.isFinite(surfaceY) ? surfaceY : null;
}

export function lakeHasBreach(terrain, lake) {
  const left = Math.max(0, Math.round(lake.x - lake.radius + 6));
  const right = Math.min(WORLD.width - 1, Math.round(lake.x + lake.radius - 6));
  for (let x = left; x <= right; x += 1) {
    if (terrain.heights[x] >= WORLD.height - 8) return true;
  }
  return false;
}
