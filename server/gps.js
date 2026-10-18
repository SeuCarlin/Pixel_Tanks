import { WORLD, clamp } from '../shared/constants.js';
import { terrainY } from './terrain.js';

const CELL = 20;
const SKY_TOP = -180;
const STRUCTURES = new Set(['building', 'watchtower', 'radar', 'fuelTank', 'supplyCache', 'shockCoil', 'lightningRod', 'healingStation', 'sentry']);

function obstaclesFor(terrain, objects) {
  const obstacles = (terrain.floatingPlatforms || []).filter((item) => item.active).map((item) => ({
    id: item.id, type: 'platform', left: item.x - 9, right: item.x + item.width + 9,
    top: item.y - 9, bottom: item.y + item.height + 9,
  }));
  for (const item of objects) {
    if (!item.active) continue;
    if (STRUCTURES.has(item.type)) obstacles.push({ id: item.id, type: item.type, left: item.x - item.width / 2 - 9, right: item.x + item.width / 2 + 9, top: item.groundY - item.height - 9, bottom: item.groundY + 9 });
    if (item.type === 'barrel') obstacles.push({ id: item.id, type: 'barrel', left: item.x - 19, right: item.x + 19, top: item.y - 21, bottom: item.y + 20 });
    if (item.type === 'concrete') obstacles.push({ id: item.id, type: 'concrete', left: item.x - item.width / 2 - 9, right: item.x + item.width / 2 + 9, top: item.y - 16, bottom: item.y + 16 });
    if (item.type === 'crane') {
      const top = item.groundY - (item.height || 220);
      const armX = item.x + (item.direction || 1) * (item.armLength || 180);
      obstacles.push({ id: item.id, type: 'crane', left: Math.min(item.x, armX) - 12, right: Math.max(item.x, armX) + 12, top: top - 12, bottom: top + 12 });
      obstacles.push({ id: item.id, type: 'crane', left: item.x - 12, right: item.x + 12, top, bottom: item.groundY + 9 });
      if (item.cableIntact !== false) obstacles.push({ id: item.id, type: 'crane', left: item.ballX - 12, right: item.ballX + 12, top, bottom: item.ballY + (item.ballRadius || 28) + 9 });
    }
  }
  return obstacles;
}

function segmentEntry(start, end, rect) {
  let entry = 0; let exit = 1;
  for (const [origin, delta, low, high] of [[start.x, end.x - start.x, rect.left, rect.right], [start.y, end.y - start.y, rect.top, rect.bottom]]) {
    if (Math.abs(delta) < 1e-6) { if (origin < low || origin > high) return null; continue; }
    const a = (low - origin) / delta; const b = (high - origin) / delta;
    entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
    if (entry > exit) return null;
  }
  return entry >= 0 && entry <= 1 ? entry : null;
}

function routeAround(start, goal, terrain, obstacles) {
  const columns = Math.ceil(WORLD.width / CELL); const rows = Math.ceil((WORLD.height + 60 - SKY_TOP) / CELL);
  const center = (index) => ({ x: Math.min(WORLD.width - 1, (index % columns) * CELL + CELL / 2), y: SKY_TOP + Math.floor(index / columns) * CELL + CELL / 2 });
  const indexAt = (point) => clamp(Math.floor(point.x / CELL), 0, columns - 1) + clamp(Math.floor((point.y - SKY_TOP) / CELL), 0, rows - 1) * columns;
  const startIndex = indexAt(start); const goalIndex = indexAt(goal);
  const blockedCache = new Int8Array(columns * rows);
  const blocked = (index) => {
    if (index === startIndex || index === goalIndex) return false;
    if (blockedCache[index]) return blockedCache[index] === 2;
    const point = center(index);
    const solid = point.y >= terrainY(terrain, point.x) - 5 || obstacles.some((item) => point.x >= item.left && point.x <= item.right && point.y >= item.top && point.y <= item.bottom);
    blockedCache[index] = solid ? 2 : 1;
    return solid;
  };
  const clear = (from, to) => {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    for (let distance = CELL / 3; distance < length; distance += CELL / 3) {
      const t = distance / length; const point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      if (point.y >= terrainY(terrain, point.x) - 4 || obstacles.some((item) => point.x >= item.left && point.x <= item.right && point.y >= item.top && point.y <= item.bottom)) return false;
    }
    return true;
  };
  const scores = new Float64Array(columns * rows).fill(Infinity);
  const previous = new Int32Array(columns * rows).fill(-1);
  const heap = [];
  const push = (entry) => { heap.push(entry); for (let i = heap.length - 1; i > 0;) { const parent = (i - 1) >> 1; if (heap[parent].score <= entry.score) break; heap[i] = heap[parent]; i = parent; heap[i] = entry; } };
  const pop = () => { const first = heap[0]; const last = heap.pop(); if (heap.length) { let i = 0; while (i * 2 + 1 < heap.length) { let child = i * 2 + 1; if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child += 1; if (last.score <= heap[child].score) break; heap[i] = heap[child]; i = child; } heap[i] = last; } return first; };
  const heuristic = (index) => { const point = center(index); return Math.hypot(goal.x - point.x, goal.y - point.y); };
  scores[startIndex] = 0; push({ index: startIndex, score: heuristic(startIndex) });
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let explored = 0;
  while (heap.length && explored++ < columns * rows * 3) {
    const current = pop(); const index = current.index;
    if (current.score > scores[index] + heuristic(index) + .01) continue;
    if (index === goalIndex) break;
    const x = index % columns; const y = Math.floor(index / columns);
    for (const [dx, dy] of neighbors) {
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || nx >= columns || ny < 0 || ny >= rows) continue;
      const next = nx + ny * columns;
      if (blocked(next) || (dx && dy && (blocked(x + dx + y * columns) || blocked(x + (y + dy) * columns)))) continue;
      const cost = scores[index] + (dx && dy ? Math.SQRT2 : 1) * CELL;
      if (cost >= scores[next]) continue;
      scores[next] = cost; previous[next] = index; push({ index: next, score: cost + heuristic(next) });
    }
  }
  if (!Number.isFinite(scores[goalIndex])) return null;
  const cells = [];
  for (let index = goalIndex; index !== startIndex && index >= 0; index = previous[index]) cells.push(center(index));
  cells.reverse();
  const raw = [start, ...cells, goal]; const route = [start];
  for (let index = 0; index < raw.length - 1;) {
    let next = index + 1;
    for (let candidate = Math.min(raw.length - 1, index + 24); candidate > next; candidate -= 1) if (clear(raw[index], raw[candidate])) { next = candidate; break; }
    route.push(raw[next]); index = next;
  }
  return route;
}

export function simulateGpsShot({ terrain, objects = [], players = [], powerups = [], ignorePlayerId, guidedTarget, x, y, angle, power, direction = 1 }) {
  if (!guidedTarget?.alive) return null;
  const radians = angle * Math.PI / 180;
  const start = { x: x + Math.cos(radians) * 18 * direction, y: y - Math.sin(radians) * 18 };
  const target = { x: guidedTarget.x, y: guidedTarget.y };
  const obstacles = obstaclesFor(terrain, objects);
  const directById = new Map();
  for (const item of obstacles) {
    const entry = segmentEntry(start, target, item);
    if (entry !== null && (!directById.has(item.id) || entry < directById.get(item.id).entry)) directById.set(item.id, { ...item, entry });
  }
  const direct = [...directById.values()].sort((a, b) => a.entry - b.entry);
  const fourth = direct[3];
  const directLength = Math.hypot(target.x - start.x, target.y - start.y);
  const approach = fourth ? Math.max(0, fourth.entry - 18 / Math.max(1, directLength)) : 1;
  const endpoint = fourth ? { x: start.x + (target.x - start.x) * approach, y: start.y + (target.y - start.y) * approach } : target;
  const route = routeAround(start, endpoint, terrain, obstacles);
  if (!route) return null;
  const path = []; const collectedPowerupIds = [];
  let previousPoint = start;
  for (const next of route.slice(1)) {
    const length = Math.hypot(next.x - previousPoint.x, next.y - previousPoint.y);
    const count = Math.max(1, Math.ceil(length / 8));
    for (let i = 1; i <= count; i += 1) {
      const t = i / count; const px = previousPoint.x + (next.x - previousPoint.x) * t; const py = previousPoint.y + (next.y - previousPoint.y) * t;
      path.push({ x: Math.round(px), y: Math.round(py), gps: true });
      if (px < 0 || px >= WORLD.width || py > WORLD.height + 30) return { path, collectedPowerupIds, impact: null, gpsDetours: Math.min(3, direct.length) };
      const hit = players.find((player) => player.alive && player.id !== ignorePlayerId && Math.hypot(player.x - px, player.y - py) <= WORLD.tankRadius + 3);
      if (hit) return { path, collectedPowerupIds, impact: { x: px, y: py, playerId: hit.id }, gpsDetours: Math.min(3, direct.length) };
      const powerup = powerups.find((item) => item.active && item.revealed !== false && !item.destroyed && !collectedPowerupIds.includes(item.id) && Math.hypot(item.x - px, item.y - py) <= 14);
      if (powerup) collectedPowerupIds.push(powerup.id);
    }
    previousPoint = next;
  }
  if (fourth) {
    const px = start.x + (target.x - start.x) * fourth.entry;
    const py = start.y + (target.y - start.y) * fourth.entry;
    path.push({ x: Math.round(px), y: Math.round(py), gps: true });
    return { path, collectedPowerupIds, impact: { x: px, y: py, ...(fourth.type === 'platform' ? { platformId: fourth.id } : { structure: fourth.type, structureId: fourth.id }) }, gpsDetours: 3 };
  }
  return { path, collectedPowerupIds, impact: { x: target.x, y: target.y, playerId: guidedTarget.id }, gpsDetours: direct.length };
}
