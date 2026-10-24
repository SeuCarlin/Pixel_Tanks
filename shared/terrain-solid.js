import { WORLD, clamp } from './constants.js';

// Height columns describe the outer surface. Cavities preserve empty space behind
// a vertical face, which a height map alone cannot represent.
export function terrainSolidAt(terrain, x, y) {
  const column = Math.round(clamp(x, 0, WORLD.width - 1));
  if (y < terrain.heights[column]) return false;
  for (const cavity of terrain.cavities || []) {
    if (Math.abs(x - cavity.x) > cavity.radius || Math.abs(y - cavity.y) > cavity.radius) continue;
    if ((x - cavity.x) ** 2 + (y - cavity.y) ** 2 <= cavity.radius ** 2) return false;
  }
  return true;
}
