import { WORLD, clamp } from './constants.js';
import { projectileStructureAt } from './projectile-obstacles.js';

// Mirrors the ordinary projectile's server-side integration and stops at the first obstacle.
// The result is a suggestion, not a lock: targets and moving platforms can move before firing.
export function traceAim({ terrain, players = [], objects = [], shooterId, origin, angle, power, direction, gravity, wind = 0, platforms = [] }) {
  const radians = angle * Math.PI / 180;
  let x = origin.x + Math.cos(radians) * 18 * direction;
  let y = origin.y - Math.sin(radians) * 18;
  let vx = Math.cos(radians) * power * direction;
  let vy = -Math.sin(radians) * power;
  const dt = 1 / 60;
  for (let step = 0; step < 900; step += 1) {
    const previousY = y;
    x += vx * dt; y += vy * dt; vx += wind * dt; vy += gravity * dt;
    if (x < 0 || x >= WORLD.width || y > WORLD.height + 30) return null;
    const hit = players.find((player) => player.alive && player.id !== shooterId && Number.isFinite(player.x) && Math.hypot(player.x - x, player.y - y) <= WORLD.tankRadius + 3);
    if (hit) return { x, y, playerId: hit.id };
    const structure = projectileStructureAt(objects, x, y);
    if (structure) return { x, y, structureId: structure.id };
    const platform = platforms.find((entry) => entry.active && x >= entry.x && x <= entry.x + entry.width && Math.min(previousY, y) <= entry.y + entry.height && Math.max(previousY, y) >= entry.y);
    if (platform) return { x, y: clamp(y, platform.y, platform.y + platform.height), platformId: platform.id };
    if (y >= terrain.heights[Math.round(clamp(x, 0, WORLD.width - 1))]) return { x, y };
  }
  return null;
}

export function suggestAim({ terrain, players, objects = [], shooterId, origin, target, gravity, wind = 0, platforms = [] }) {
  if (!target || !Number.isFinite(origin?.x) || !Number.isFinite(origin?.y) || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return null;
  const direction = target.x < origin.x ? -1 : 1;
  const context = { terrain, players, objects, shooterId, origin, direction, gravity, wind, platforms };
  let best = null;
  const consider = (angle, power) => {
    const impact = traceAim({ ...context, angle, power });
    if (!impact) return;
    const error = Math.hypot(impact.x - target.x, impact.y - target.y);
    const score = error + (impact.playerId && impact.playerId !== target.id ? 180 : 0) + power * .0001;
    if (!best || score < best.score) best = { angle, power, direction, impact, error: Math.round(error), score, targetId: target.id };
  };
  for (let angle = 7; angle <= 83; angle += 4) for (let power = 100; power <= 580; power += 24) consider(angle, Math.min(580, power));
  if (!best) return null;
  const seed = { ...best };
  for (let angle = Math.max(5, seed.angle - 4); angle <= Math.min(85, seed.angle + 4); angle += 1) {
    for (let power = Math.max(100, seed.power - 24); power <= Math.min(580, seed.power + 24); power += 4) consider(angle, power);
  }
  return best;
}
