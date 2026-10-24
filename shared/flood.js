import { WORLD, clamp } from './constants.js';
import { playableWidth } from './map-layout.js';

// A lake is a shallow cut in the existing microblock terrain, not a flat overlay.
export function carveFloodBasin(terrain, centerX, radius = 175, depth = 65) {
  const arenaWidth = playableWidth(terrain);
  const center = Math.round(clamp(centerX, radius + 8, arenaWidth - radius - 8));
  const edgeLeft = terrain.heights[Math.round(center - radius)];
  const edgeRight = terrain.heights[Math.round(center + radius)];
  const centerGround = terrain.heights[center];
  const surfaceY = Math.round(clamp(Math.min(edgeLeft, edgeRight, centerGround + 16) - 5, 150, WORLD.height - 105));
  const waterFloor = Math.min(WORLD.height - 48, surfaceY + depth);
  for (let x = Math.max(0, center - radius); x <= Math.min(arenaWidth - 1, center + radius); x += 1) {
    const distance = Math.abs(x - center) / radius;
    const carve = (1 - distance * distance) ** 2;
    terrain.heights[x] = Math.max(terrain.heights[x], Math.round(surfaceY + (waterFloor - surfaceY) * carve));
  }
  return { x: center, radius, surfaceY };
}

export const LAKE_DRAIN_MS = 1800;
export const WATER_CELL = 8;

function cellGround(terrain, x) {
  const last = playableWidth(terrain) - 1;
  const center = Math.round(clamp(x, 0, last));
  return Math.round((terrain.heights[Math.max(0, center - 2)] + terrain.heights[center] * 2 + terrain.heights[Math.min(last, center + 2)]) / 4);
}

export function estimateLakeVolume(terrain, lake) {
  let volume = 0;
  const left = Math.max(0, Math.floor((lake.x - lake.radius) / WATER_CELL) * WATER_CELL);
  const right = Math.min(playableWidth(terrain) - 1, Math.ceil((lake.x + lake.radius) / WATER_CELL) * WATER_CELL);
  for (let x = left; x <= right; x += WATER_CELL) if (Math.abs(x - lake.x) < lake.radius - 5) volume += Math.max(0, cellGround(terrain, x) - lake.surfaceY);
  return volume;
}

function flowIndex(lake, x) {
  return Math.round((x - lake.flowStart) / WATER_CELL);
}

function flowSurfaceAt(lake, x, now = Date.now()) {
  const index = flowIndex(lake, x);
  const surface = lake.flowSurfaces[index];
  if (!Number.isFinite(surface)) return Infinity;
  return lake.drainingAt ? surface + (WORLD.height - surface) * clamp((now - lake.drainingAt) / LAKE_DRAIN_MS, 0, 1) : surface;
}

function initializeFlowLake(terrain, lake, now) {
  const width = playableWidth(terrain);
  const start = Math.max(0, Math.floor((lake.x - lake.radius) / WATER_CELL) * WATER_CELL);
  const end = Math.min(width - 1, Math.ceil((lake.x + lake.radius) / WATER_CELL) * WATER_CELL);
  const depths = [];
  for (let x = start; x <= end; x += WATER_CELL) depths.push(Math.abs(x - lake.x) < lake.radius - 5 ? Math.max(0, cellGround(terrain, x) - lake.surfaceY) : 0);
  const measured = depths.reduce((sum, depth) => sum + depth, 0);
  const target = lake.fluidVolume ?? measured;
  if (measured > 0 && target !== measured) for (let index = 0; index < depths.length; index += 1) depths[index] *= target / measured;
  lake.flowStart = start; lake.flowDepths = depths; lake.flowSurfaces = [];
  lake.flowAt = now; lake.flowCascades = [];
  refreshFlowSurfaces(terrain, lake);
}

function refreshFlowSurfaces(terrain, lake) {
  lake.flowSurfaces = lake.flowDepths.map((depth, index) => depth >= .8 ? cellGround(terrain, lake.flowStart + index * WATER_CELL) - depth : null);
}

// One-dimensional shallow-water flow: each cell owns a conserved amount of
// water. Differences in hydraulic head move it sideways; open voids consume it.
// The terrain heightfield has no caves, so vertical drops become waterfalls.
export function advanceFlowLake(terrain, lake, now = Date.now()) {
  if (!lake.fluid || lake.drainingAt || lake.fillStartedAt && now < lake.fillStartedAt + lake.fillDurationMs) return false;
  if (!lake.flowDepths) { initializeFlowLake(terrain, lake, now); return true; }
  const elapsed = Math.min(1.2, Math.max(0, (now - lake.flowAt) / 1000));
  if (elapsed < .025) return false;
  lake.flowAt = now;
  let changed = false; const cascades = [];
  if (lake.surfaceImpacts?.length) {
    const active = lake.surfaceImpacts.filter((impact) => now < impact.startedAt + impact.durationMs);
    changed = active.length !== lake.surfaceImpacts.length;
    lake.surfaceImpacts = active;
  }
  const steps = Math.min(8, Math.max(1, Math.ceil(elapsed / .12)));
  for (let substep = 0; substep < steps; substep += 1) {
    const dt = elapsed / steps;
    const depths = lake.flowDepths;
    if (depths[0] >= .8 && lake.flowStart >= WATER_CELL) { depths.unshift(0); lake.flowStart -= WATER_CELL; }
    if (depths.at(-1) >= .8 && lake.flowStart + depths.length * WATER_CELL < playableWidth(terrain)) depths.push(0);
    const floors = depths.map((_, index) => cellGround(terrain, lake.flowStart + index * WATER_CELL));
    const fluxes = new Array(Math.max(0, depths.length - 1)).fill(0);
    const outgoing = new Array(depths.length).fill(0);
    for (let index = 0; index < fluxes.length; index += 1) {
      const difference = floors[index + 1] - depths[index + 1] - (floors[index] - depths[index]);
      if (Math.abs(difference) < .3) continue;
      const from = difference > 0 ? index : index + 1;
      const available = Math.max(0, depths[from] - outgoing[from]);
      const flux = Math.min(available * .72, Math.abs(difference) * dt * 2.9, 95 * dt);
      if (flux < .05) continue;
      outgoing[from] += flux;
      fluxes[index] = difference > 0 ? flux : -flux;
      const drop = floors[difference > 0 ? index + 1 : index] - floors[from];
      if (drop > 24 && cascades.length < 18) cascades.push({ x: lake.flowStart + (index + .5) * WATER_CELL, fromY: floors[from] - depths[from], toY: floors[from] + Math.min(drop, 170), direction: difference > 0 ? 1 : -1, rate: flux });
    }
    for (let index = 0; index < fluxes.length; index += 1) {
      const flux = fluxes[index];
      if (!flux) continue;
      depths[index] = Math.max(0, depths[index] - flux);
      depths[index + 1] = Math.max(0, depths[index + 1] + flux);
      changed = true;
    }
    for (let index = 0; index < depths.length; index += 1) {
      const x = lake.flowStart + index * WATER_CELL;
      if (floors[index] < WORLD.height - 8 && x > 0 && x < playableWidth(terrain) - WATER_CELL) continue;
      if (depths[index] < .05) continue;
      const lost = Math.min(depths[index], Math.max(3 * dt, depths[index] * dt * 2.1));
      depths[index] -= lost; changed = true;
      if (cascades.length < 18) cascades.push({ x, fromY: floors[index] - depths[index], toY: WORLD.height, direction: 0, rate: lost });
    }
  }
  while (lake.flowDepths.length > 4 && lake.flowDepths[0] < .05 && lake.flowDepths[1] < .05) { lake.flowDepths.shift(); lake.flowStart += WATER_CELL; }
  while (lake.flowDepths.length > 4 && lake.flowDepths.at(-1) < .05 && lake.flowDepths.at(-2) < .05) lake.flowDepths.pop();
  lake.flowCascades = cascades;
  refreshFlowSurfaces(terrain, lake);
  return changed || cascades.length > 0;
}

// A collision displaces existing water instead of creating a decorative wave
// that leaves the simulation unchanged. The normal flow solver levels the
// resulting crest over subsequent ticks.
export function disturbWaterAt(terrain, lakes, x, y, { radius = 55, strength = 18, kind = 'impact' } = {}, now = Date.now()) {
  let disturbed = false;
  for (const lake of lakes || []) {
    if (!lake.fluid || lake.drainingAt) continue;
    if (!lake.flowDepths) initializeFlowLake(terrain, lake, now);
    const index = flowIndex(lake, x);
    if (index < 0 || index >= lake.flowDepths.length) continue;
    const surface = flowSurfaceAt(lake, x, now);
    const floor = cellGround(terrain, x);
    if (!Number.isFinite(surface) || floor < surface + 8 || y < surface - radius * .55 || y > floor + radius * .28) continue;
    const center = Math.round(index);
    const reach = Math.max(2, Math.min(8, Math.round(radius / WATER_CELL / 3)));
    const receivers = [];
    for (let offset = -reach; offset <= reach; offset += 1) {
      if (Math.abs(offset) < 2) continue;
      const target = center + offset;
      if (target < 0 || target >= lake.flowDepths.length) continue;
      if (cellGround(terrain, lake.flowStart + target * WATER_CELL) >= WORLD.height - 8) continue;
      receivers.push(target);
    }
    if (receivers.length) {
      const available = Math.min(Math.max(0, strength), lake.flowDepths[center] * .45);
      lake.flowDepths[center] -= available;
      for (const target of receivers) lake.flowDepths[target] += available / receivers.length;
      refreshFlowSurfaces(terrain, lake);
    }
    lake.surfaceImpacts ||= [];
    lake.surfaceImpacts.push({ x: Math.round(x), y: Math.round(surface), startedAt: now, durationMs: kind === 'explosion' ? 1650 : 1150, radius: Math.round(radius), strength: Math.round(strength), kind });
    lake.surfaceImpacts = lake.surfaceImpacts.slice(-8);
    disturbed = true;
  }
  return disturbed;
}

// Air vents belong to a lake, so their position remains stable as its water
// redistributes. They only activate where that column is actually submerged.
export function ensureAirPockets(terrain, lake, now = Date.now()) {
  if (lake.airPockets?.length) return false;
  if (lake.drainingAt) return false;
  const offsets = lake.radius >= 170 ? [-.55, .55] : [0];
  const pockets = offsets.map((offset, index) => {
    const x = Math.round(lake.x + lake.radius * offset);
    const surface = waterSurfaceAt(lake, now, x);
    const depth = cellGround(terrain, x) - surface;
    return Number.isFinite(surface) && depth >= 27 ? { id: `${lake.id || 'lake'}-air-${index}`, x, radius: Math.round(clamp(lake.radius * .24, 30, 50)) } : null;
  }).filter(Boolean);
  if (!pockets.length) return false;
  lake.airPockets = pockets;
  return true;
}

// Air vents use the same projectile-current interface as tornadoes, so the
// authoritative shot and the aim preview bend in exactly the same place.
export function airPocketCurrents(terrain, lakes, now = Date.now()) {
  const currents = [];
  for (const lake of lakes || []) for (const pocket of lake.airPockets || []) {
    const surface = waterSurfaceAt(lake, now, pocket.x);
    const floor = cellGround(terrain, pocket.x);
    if (!Number.isFinite(surface) || floor - surface < 22 || waterDepthAt(terrain, [lake], pocket.x, floor - 2, now) < 20) continue;
    currents.push({ id: pocket.id, kind: 'airPocket', x: pocket.x, y: floor, width: pocket.radius * 2, height: floor - surface, appearsAt: 0 });
  }
  return currents;
}

function currentLakeRadius(lake, now) {
  if (!lake.fillStartedAt) return lake.radius;
  const progress = clamp((now - lake.fillStartedAt) / lake.fillDurationMs, 0, 1);
  return lake.radius * Math.sqrt(progress);
}

export function waterSurfaceAt(lake, now = Date.now(), x = lake.x) {
  if (lake.flowSurfaces) return flowSurfaceAt(lake, x, now);
  if (lake.drainingAt) return lake.surfaceY + (WORLD.height - lake.surfaceY) * clamp((now - lake.drainingAt) / LAKE_DRAIN_MS, 0, 1);
  if (lake.fillStartedAt) return lake.surfaceY + (lake.fillFromY - lake.surfaceY) * (1 - clamp((now - lake.fillStartedAt) / lake.fillDurationMs, 0, 1));
  return lake.surfaceY;
}

// Merge overlapping lake surfaces on the same microblock columns. This matches
// waterDepthAt's rule of using the deepest (highest-surface) body of water.
export function visibleWaterColumns(lakes, left, right, now = Date.now(), step = 5) {
  const firstX = Math.ceil(clamp(left, 0, WORLD.width - 1) / step) * step;
  const lastX = Math.floor(clamp(right, 0, WORLD.width - 1) / step) * step;
  const surfaces = new Float32Array(Math.max(0, Math.floor((lastX - firstX) / step) + 1));
  surfaces.fill(Infinity);
  for (const lake of lakes || []) {
    if (lake.flowSurfaces) {
      const start = Math.max(firstX, Math.ceil((lake.flowStart - WATER_CELL / 2) / step) * step);
      const end = Math.min(lastX, Math.floor((lake.flowStart + (lake.flowSurfaces.length - .5) * WATER_CELL) / step) * step);
      for (let x = start; x <= end; x += step) surfaces[(x - firstX) / step] = Math.min(surfaces[(x - firstX) / step], flowSurfaceAt(lake, x, now));
      continue;
    }
    const radius = currentLakeRadius(lake, now);
    const start = Math.max(firstX, Math.ceil((lake.x - radius + 5) / step) * step);
    const end = Math.min(lastX, Math.floor((lake.x + radius - 5) / step) * step);
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
    if (lake.flowSurfaces) {
      const surface = flowSurfaceAt(lake, x, now);
      if (Number.isFinite(surface) && ground > surface + 8 && feetY > surface) depth = Math.max(depth, Math.min(feetY, ground) - surface);
      continue;
    }
    if (Math.abs(x - lake.x) >= currentLakeRadius(lake, now) - 5) continue;
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
    if (lake.flowSurfaces) {
      const surface = flowSurfaceAt(lake, x, now);
      if (ground - surface >= 20) surfaceY = Math.min(surfaceY, surface);
      continue;
    }
    if (Math.abs(x - lake.x) >= currentLakeRadius(lake, now) - 5) continue;
    const surface = waterSurfaceAt(lake, now);
    if (ground - surface >= 20) surfaceY = Math.min(surfaceY, surface);
  }
  return Number.isFinite(surfaceY) ? surfaceY : null;
}

export function lakeHasBreach(terrain, lake) {
  const left = Math.max(0, Math.round(lake.x - lake.radius + 6));
  const right = Math.min(playableWidth(terrain) - 1, Math.round(lake.x + lake.radius - 6));
  for (let x = left; x <= right; x += 1) {
    if (terrain.heights[x] >= WORLD.height - 8) return true;
  }
  return false;
}
