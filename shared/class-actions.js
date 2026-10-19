import { CLASS_BALANCE, WORLD } from './constants.js';
import { projectileStructureAt } from './projectile-obstacles.js';

export function ninjaFatalPath(game, ninja, targetId = null, targetPoint = null) {
  if (!game || !ninja?.alive || ninja.classType !== 'ninja' || ninja.teslaDisabledTurns > 0) return null;
  const candidates = game.players.filter((target) => target.alive && target.id !== ninja.id && target.invisibleTurns <= 0 && (!targetId || target.id === targetId) && (!['coop', 'teams', 'teamHill'].includes(game.mode) || target.team !== ninja.team));
  candidates.sort((first, second) => Math.hypot(first.x - ninja.x, first.y - ninja.y) - Math.hypot(second.x - ninja.x, second.y - ninja.y));
  const openAt = (x, y) => [-8, 0, 8].every((offset) => (game.terrain?.heights?.[Math.round(x + offset)] ?? WORLD.height) > y + 8
    && [-8, 0, 8].every((vertical) => !projectileStructureAt(game.objects, x + offset, y + vertical))
    && !game.terrain?.floatingPlatforms?.some((platform) => platform.active && x + offset >= platform.x && x + offset <= platform.x + platform.width && y + 8 >= platform.y && y - 8 <= platform.y + platform.height));
  const target = !targetPoint && candidates.find((entry) => {
    const distance = Math.hypot(entry.x - ninja.x, entry.y - ninja.y);
    if (distance > CLASS_BALANCE.ninjaFatalRadius || distance < WORLD.tankRadius) return false;
    return true;
  });
  if (!target && !targetPoint) return null;
  const aim = targetPoint || target;
  const distance = Math.hypot(aim.x - ninja.x, aim.y - ninja.y);
  if (!Number.isFinite(distance) || distance < WORLD.tankRadius) return null;
  const ux = (aim.x - ninja.x) / distance; const uy = (aim.y - ninja.y) / distance;
  const limit = targetPoint ? Math.min(distance, CLASS_BALANCE.ninjaFatalRadius) : CLASS_BALANCE.ninjaFatalRadius;
  let length = Math.floor(limit / 4) * 4;
  while (length >= WORLD.tankRadius && (ninja.x + ux * length < 16 || ninja.x + ux * length > WORLD.width - 16 || !openAt(ninja.x + ux * length, ninja.y + uy * length))) length -= 4;
  if (length < WORLD.tankRadius) return null;
  const hits = game.players.filter((entry) => entry.alive && entry.id !== ninja.id && entry.invisibleTurns <= 0 && (!['coop', 'teams', 'teamHill'].includes(game.mode) || entry.team !== ninja.team)).filter((entry) => {
    const along = (entry.x - ninja.x) * ux + (entry.y - ninja.y) * uy;
    return along >= WORLD.tankRadius && along <= length + 15 && Math.hypot(entry.x - (ninja.x + ux * along), entry.y - (ninja.y + uy * along)) <= 25;
  }).sort((a, b) => Math.hypot(a.x - ninja.x, a.y - ninja.y) - Math.hypot(b.x - ninja.x, b.y - ninja.y));
  return { target: target || hits[0] || null, hits, toX: ninja.x + ux * length, toY: ninja.y + uy * length, length };
}

export function ninjaFatalTarget(game, ninja, targetId = null) { return ninjaFatalPath(game, ninja, targetId)?.target || null; }

export function backpackerRerollAvailable(game, player) {
  return Boolean(game?.phase === 'playing' && player?.alive && player.classType === 'backpacker' && player.teslaDisabledTurns <= 0 && game.roundNumber > 0 && game.roundNumber % 3 === 0 && player.lastBackpackerRerollRound !== game.roundNumber);
}
