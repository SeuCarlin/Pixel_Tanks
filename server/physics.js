import { WORLD, clamp } from '../shared/constants.js';
import { terrainY, carveTerrain } from './terrain.js';

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

export function applyExplosion(game, x, y, radius = 48, baseDamage = 55, effects = {}) {
  carveTerrain(game.terrain, x, y, radius);
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
    const distance = Math.hypot(x - nearestX, y - platform.y);
    if (distance > radius) continue;
    platform.durability = Math.max(0, platform.durability - Math.max(18, Math.round((1 - distance / radius) * 72)));
    if (platform.durability === 0) platform.active = false;
  }
  const damage = [];
  for (const player of game.players) {
    if (!player.alive) continue;
    const distance = Math.hypot(player.x - x, player.y - y);
    if (distance > radius * 1.45) continue;
    let amount = Math.round(baseDamage * (1 - distance / (radius * 1.45)));
    if (!effects.ignoreShield && (player.shield || player.shieldCharges > 0)) { amount = Math.ceil(amount * 0.35); player.shieldCharges = Math.max(0, (player.shieldCharges || 1) - 1); player.shield = player.shieldCharges > 0; }
    player.health = clamp(player.health - Math.max(0, amount), 0, player.maxHealth);
    const push = Math.round(amount * 0.42 * (effects.pushMultiplier || 1));
    if (push > 0) player.x = clamp(player.x + (player.x < x ? -push : push), 4, WORLD.width - 4);
    if (player.health <= 0) player.alive = false;
    damage.push({ playerId: player.id, amount, knockback: push });
  }
  settlePlayers(game);
  return damage;
}

export function settlePlayers(game) {
  for (const player of game.players) {
    if (!player.alive) continue;
    const current = game.terrain.floatingPlatforms?.find((platform) => platform.id === player.supportPlatformId && platform.active && player.x >= platform.x && player.x <= platform.x + platform.width);
    if (current) { player.y = current.y - WORLD.tankRadius; player.platformOffset = player.x - current.x; continue; }
    const below = game.terrain.floatingPlatforms?.filter((platform) => platform.active && player.x >= platform.x && player.x <= platform.x + platform.width && platform.y >= player.y + WORLD.tankRadius - 3).sort((a, b) => a.y - b.y)[0];
    if (below) { player.supportPlatformId = below.id; player.platformOffset = player.x - below.x; player.y = below.y - WORLD.tankRadius; continue; }
    player.supportPlatformId = null; player.platformOffset = null;
    const ground = terrainY(game.terrain, player.x);
    if (ground > WORLD.height) { player.alive = false; player.health = 0; continue; }
    player.y = ground - WORLD.tankRadius;
  }
}
