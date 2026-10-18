// World-space silhouette of the three independently readable tank sections.
// Y is relative to the tank's anchor (the center of its tracks).
export const TANK_HIT_ZONES = Object.freeze([
  Object.freeze({ name: 'head', top: -24, bottom: -10, halfWidth: 10 }),
  Object.freeze({ name: 'center', top: -10, bottom: 1, halfWidth: 15 }),
  Object.freeze({ name: 'base', top: 1, bottom: 11, halfWidth: 19 }),
]);

export function tankHitZone(tank, x, y, padding = 2) {
  const scale = tank.classType === 'armored' ? 1.22 : 1;
  const dx = Math.abs(x - tank.x);
  const dy = y - tank.y;
  for (const zone of TANK_HIT_ZONES) {
    if (dx <= zone.halfWidth * scale + padding && dy >= zone.top * scale - padding && dy < zone.bottom * scale) return zone.name;
  }
  return null;
}
