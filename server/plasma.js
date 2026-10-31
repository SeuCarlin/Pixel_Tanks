import { WORLD, WEAPON_BALANCE } from '../shared/constants.js';

export function segmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}
export function plasmaLinks(game, now = Date.now()) {
  const cores = (game.plasmaCores || []).filter(c => c.active && now >= c.activateAt && game.roundNumber < c.expiresRound);
  const links = [];
  for (let i = 0; i < cores.length; i++) for (let j = i + 1; j < cores.length; j++) {
    const a = cores[i], b = cores[j];
    if (a.ownerId === b.ownerId && Math.hypot(a.x - b.x, a.y - b.y) <= WEAPON_BALANCE.plasmaCore.linkRange) links.push({ a, b });
  }
  return links;
}
export function interceptPlasma(game, result, ownerId) {
  const links = plasmaLinks(game);
  for (let i = 0; i < (result.path?.length || 0); i++) {
    const point = result.path[i];
    const previous = result.path[Math.max(0, i - 1)];
    const length = Math.hypot(point.x - previous.x, point.y - previous.y);
    const blocked = links.some(({ a, b }) => {
      for (let step = 0; step <= Math.ceil(length / 3); step++) {
        const t = step / Math.max(1, Math.ceil(length / 3));
        if (segmentDistance({ x: previous.x + (point.x - previous.x) * t, y: previous.y + (point.y - previous.y) * t }, a, b) <= 6) return true;
      }
      return false;
    });
    if (blocked) { result.path = result.path.slice(0, i + 1); result.impact = null; result.hit = false; result.plasmaIntercepted = true; return true; }
  }
  return false;
}
export function updatePlasma(game, now, { isEnemy, damage }) {
  let changed = false;
  for (const core of game.plasmaCores || []) {
    if (!core.active) continue;
    if (game.roundNumber >= core.expiresRound) { core.active = false; changed = true; continue; }
    if (now < core.activateAt) continue;
    const dt = Math.min(.05, Math.max(0, (now - (core.updatedAt || now)) / 1000)); core.updatedAt = now;
    const enemy = game.players.filter(p => p.alive && isEnemy(core.ownerId, p) && Math.hypot(p.x - core.x, p.y - core.y) <= WEAPON_BALANCE.plasmaCore.seekRange).sort((a,b) => Math.hypot(a.x-core.x,a.y-core.y)-Math.hypot(b.x-core.x,b.y-core.y))[0];
    core.targetId = enemy?.id || null;
    if (!enemy) continue;
    const distance = Math.hypot(enemy.x - core.x, enemy.y - core.y);
    const speed = Math.min(1, 270 * dt / Math.max(1, distance));
    core.x += (enemy.x - core.x) * speed; core.y += (enemy.y - core.y) * speed; changed = true;
    if (distance <= WORLD.tankRadius + 12) { damage(core.ownerId, enemy, WEAPON_BALANCE.plasmaCore.damage); core.active = false; }
  }
  for (const { a, b } of plasmaLinks(game, now)) for (const player of game.players) {
    if (!player.alive || !isEnemy(a.ownerId, player) || segmentDistance(player, a, b) > WORLD.tankRadius + 5) continue;
    a.hitTurns ||= {};
    const key = `${b.id}:${player.id}`;
    if (a.hitTurns[key] === game.turnNumber) continue;
    a.hitTurns[key] = game.turnNumber; damage(a.ownerId, player, WEAPON_BALANCE.plasmaCore.damage);
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
    const side = ((player.x - a.x) * -dy + (player.y - a.y) * dx) >= 0 ? 1 : -1;
    player.supportPlatformId = null; player.supportObjectId = null;
    player.airborne = { vx: -dy / length * side * 240, vy: Math.min(-150, dx / length * side * 240), startY: player.y, updatedAt: now, falling: true, parachute: false };
    changed = true;
  }
  game.plasmaCores = (game.plasmaCores || []).filter(c => c.active);
  return changed;
}

// Clamp a movement packet at its first beam contact so a long drive/dash cannot tunnel through it.
export function clipTankAtPlasma(game, player, path, isEnemy) {
  const links = plasmaLinks(game).filter(({ a }) => isEnemy(a.ownerId, player));
  const steps = Math.max(1, Math.ceil(Math.hypot(path.x-player.x, path.y-player.y)/4));
  for (let i=0; i<=steps; i++) {
    const t=i/steps, point={x:player.x+(path.x-player.x)*t,y:player.y+(path.y-player.y)*t};
    if (!links.some(({a,b})=>segmentDistance(point,a,b)<=WORLD.tankRadius+5)) continue;
    Object.assign(path,point,{supportPlatformId:null,plasmaContact:true}); return true;
  }
  return false;
}
