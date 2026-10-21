import { WORLD, clamp } from './constants.js';

export function mapWidthForPlayers(playerCount) {
  return Math.min(WORLD.width, 3200 + (clamp(Math.round(playerCount || 2), 2, 10) - 2) * 300);
}

export function playableWidth(terrain) {
  return terrain?.arenaWidth || WORLD.width;
}

export function insidePlayableArena(terrain, x, margin = 0) {
  return Number.isFinite(x) && x >= margin && x <= playableWidth(terrain) - margin;
}
