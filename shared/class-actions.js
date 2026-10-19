import { CLASS_BALANCE, WORLD } from './constants.js';
import { projectileStructureAt } from './projectile-obstacles.js';

export function ninjaFatalPath(game, ninja, targetId = null) {
  if (!game || !ninja?.alive || ninja.classType !== 'ninja' || ninja.teslaDisabledTurns > 0) return null;
  const candidates = game.players.filter((target) => target.alive && target.id !== ninja.id && target.invisibleTurns <= 0 && (!targetId || target.id === targetId) && (!['coop', 'teams', 'teamHill'].includes(game.mode) || target.team !== ninja.team));
  candidates.sort((first, second) => Math.hypot(first.x - ninja.x, first.y - ninja.y) - Math.hypot(second.x - ninja.x, second.y - ninja.y));
  const openAt = (x, y) => (game.terrain?.heights?.[Math.round(x)] ?? WORLD.height) > y + 4
    && !projectileStructureAt(game.objects, x, y)
    && !game.terrain?.floatingPlatforms?.some((platform) => platform.active && x >= platform.x && x <= platform.x + platform.width && y >= platform.y && y <= platform.y + platform.height);
  const target = candidates.find((entry) => {
    const distance = Math.hypot(entry.x - ninja.x, entry.y - ninja.y);
    if (distance > CLASS_BALANCE.ninjaFatalRadius || distance < WORLD.tankRadius) return false;
    for (let traveled = 20; traveled < distance - 18; traveled += 2) {
      const x = ninja.x + (entry.x - ninja.x) * traveled / distance;
      const y = ninja.y + (entry.y - ninja.y) * traveled / distance;
      if (!openAt(x, y)) return false;
    }
    return true;
  });
  if (!target) return null;
  const distance = Math.hypot(target.x - ninja.x, target.y - ninja.y);
  const ux = (target.x - ninja.x) / distance; const uy = (target.y - ninja.y) / distance;
  let length = distance;
  for (let traveled = distance + 4; traveled <= CLASS_BALANCE.ninjaFatalRadius; traveled += 4) {
    const x = ninja.x + ux * traveled; const y = ninja.y + uy * traveled;
    if (x < 16 || x > WORLD.width - 16 || !openAt(x, y)) break;
    length = traveled;
  }
  const hits = game.players.filter((entry) => entry.alive && entry.id !== ninja.id && entry.invisibleTurns <= 0 && (!['coop', 'teams', 'teamHill'].includes(game.mode) || entry.team !== ninja.team)).filter((entry) => {
    const along = (entry.x - ninja.x) * ux + (entry.y - ninja.y) * uy;
    return along >= WORLD.tankRadius && along <= length + 15 && Math.hypot(entry.x - (ninja.x + ux * along), entry.y - (ninja.y + uy * along)) <= 25;
  }).sort((a, b) => Math.hypot(a.x - ninja.x, a.y - ninja.y) - Math.hypot(b.x - ninja.x, b.y - ninja.y));
  return { target, hits, toX: ninja.x + ux * length, toY: ninja.y + uy * length, length };
}

export function ninjaFatalTarget(game, ninja, targetId = null) { return ninjaFatalPath(game, ninja, targetId)?.target || null; }

export function backpackerRerollAvailable(game, player) {
  return Boolean(game?.phase === 'playing' && player?.alive && player.classType === 'backpacker' && player.teslaDisabledTurns <= 0 && game.roundNumber > 0 && game.roundNumber % 3 === 0 && player.lastBackpackerRerollRound !== game.roundNumber);
}
