import { WORLD, clamp } from './constants.js';

export function walkPath(terrain, player, direction, distance) {
  const dir = direction < 0 ? -1 : 1;
  const targetX = clamp(player.x + dir * distance, 12, WORLD.width - 12);
  let x = player.x;
  let feet = player.y + WORLD.tankRadius;
  let supportPlatformId = player.supportPlatformId || null;
  let blockedByWall = false;
  while (Math.abs(targetX - x) > .1) {
    const nextX = x + dir * Math.min(3, Math.abs(targetX - x));
    const support = terrain.floatingPlatforms?.find((platform) => platform.id === supportPlatformId && platform.active && nextX >= platform.x && nextX <= platform.x + platform.width);
    const nextFeet = support ? support.y : terrain.heights[Math.round(clamp(nextX, 0, WORLD.width - 1))];
    if (feet - nextFeet > 6 && !player.spiderClimb) { blockedByWall = true; break; }
    x = nextX;
    feet = nextFeet;
    if (!support) supportPlatformId = null;
    if (feet > WORLD.height) break;
  }
  return { x, y: feet - WORLD.tankRadius, feet, supportPlatformId, moved: Math.abs(x - player.x) > .1, blockedByWall, safe: feet <= WORLD.height };
}
