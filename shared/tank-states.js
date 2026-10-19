import { WORLD, clamp } from './constants.js';

export const TANK_STATE = Object.freeze({
  GROUNDED: 'grounded', MOVING: 'moving', GLIDING: 'gliding', FLOATING: 'floating',
  FALLING: 'falling', DAMAGED: 'damaged', WALL: 'wall', AIRBORNE: 'airborne', DESTROYED: 'destroyed',
});

// Physical movement is separate from the brief damage reaction. Powers can
// check the physical state without losing track of a tank that was hit midair.
export function tankMotionState(game, player, now = Date.now()) {
  if (!player?.alive) return TANK_STATE.DESTROYED;
  if (game?.soapBubbles?.some((bubble) => bubble.playerId === player.id && now >= bubble.impactAt && now < bubble.executeAt)) return TANK_STATE.FLOATING;
  if (game?.harpoonPull?.playerId === player.id && now < game.harpoonPull.endsAt) return game.harpoonPull.targetPlayerId ? TANK_STATE.AIRBORNE : TANK_STATE.FLOATING;
  if (player.wallClinging && player.spiderClimb && !player.airborne) return TANK_STATE.WALL;
  if (player.ceilingClinging && player.spiderClimb && !player.airborne) return TANK_STATE.WALL;
  if (player.surfaceClinging && player.spiderClimb && !player.airborne) return TANK_STATE.WALL;
  if (player.airborne?.parachute) return TANK_STATE.GLIDING;
  if (player.airborne) return player.airborne.falling || player.airborne.vy >= 0 ? TANK_STATE.FALLING : TANK_STATE.AIRBORNE;
  const platform = game?.terrain?.floatingPlatforms?.find((entry) => entry.id === player.supportPlatformId && entry.active);
  const ground = game?.terrain?.heights?.[Math.round(clamp(player.x, 0, WORLD.width - 1))];
  const supported = Boolean(platform) || Number.isFinite(ground) && Math.abs(player.y + WORLD.tankRadius - ground) <= 14;
  if (!supported) return TANK_STATE.FALLING;
  return (player.movingUntil || 0) > now ? TANK_STATE.MOVING : TANK_STATE.GROUNDED;
}

export function refreshTankStates(game, now = Date.now()) {
  let changed = false;
  for (const player of game.players || []) {
    if (player.stateHealth == null) player.stateHealth = player.health;
    else if (player.health < player.stateHealth) player.damageUntil = Math.max(player.damageUntil || 0, now + 500);
    player.stateHealth = player.health;
    const motion = tankMotionState(game, player, now);
    const state = motion !== TANK_STATE.DESTROYED && (player.damageUntil || 0) > now ? TANK_STATE.DAMAGED : motion;
    if (player.motionState !== motion) { player.motionState = motion; player.motionStateSince = now; changed = true; }
    if (player.tankState !== state) { player.tankState = state; player.tankStateSince = now; changed = true; }
  }
  return changed;
}
