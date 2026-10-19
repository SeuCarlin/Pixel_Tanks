import { CLASS_BALANCE, WORLD } from './constants.js';
import { projectileStructureAt } from './projectile-obstacles.js';

export function ninjaFatalTarget(game, ninja, targetId = null) {
  if (!game || !ninja?.alive || ninja.classType !== 'ninja' || ninja.teslaDisabledTurns > 0 || ninja.airborne) return null;
  const candidates = game.players.filter((target) => target.alive && target.id !== ninja.id && target.invisibleTurns <= 0 && (!targetId || target.id === targetId) && (!['coop', 'teams', 'teamHill'].includes(game.mode) || target.team !== ninja.team));
  candidates.sort((first, second) => Math.hypot(first.x - ninja.x, first.y - ninja.y) - Math.hypot(second.x - ninja.x, second.y - ninja.y));
  return candidates.find((target) => {
    const distance = Math.hypot(target.x - ninja.x, target.y - ninja.y);
    if (distance > CLASS_BALANCE.ninjaFatalRadius || distance < WORLD.tankRadius) return false;
    for (let traveled = 20; traveled < distance - 18; traveled += 2) {
      const x = ninja.x + (target.x - ninja.x) * traveled / distance;
      const y = ninja.y + (target.y - ninja.y) * traveled / distance;
      if ((game.terrain?.heights?.[Math.round(x)] ?? WORLD.height) <= y + 4) return false;
      if (projectileStructureAt(game.objects, x, y)) return false;
      if (game.terrain?.floatingPlatforms?.some((platform) => platform.active && x >= platform.x && x <= platform.x + platform.width && y >= platform.y && y <= platform.y + platform.height)) return false;
    }
    return true;
  }) || null;
}

export function backpackerRerollAvailable(game, player) {
  return Boolean(game?.phase === 'playing' && player?.alive && player.classType === 'backpacker' && player.teslaDisabledTurns <= 0 && game.roundNumber > 0 && game.roundNumber % 3 === 0 && player.lastBackpackerRerollRound !== game.roundNumber);
}
