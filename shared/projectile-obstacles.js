const SOLID_STRUCTURES = new Set(['building', 'watchtower', 'radar', 'fuelTank', 'supplyCache', 'shockCoil', 'lightningRod', 'healingStation', 'sentry']);

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax; const dy = by - ay;
  const amount = dx * dx + dy * dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - ax - dx * amount, py - ay - dy * amount);
}

// Shared by the server collision and both aim previews. The crane cable is
// intentionally thin: it is the fragile point of that structure.
export function projectileStructureAt(objects = [], x, y) {
  return objects.find((object) => {
    if (object.active === false) return false;
    if (SOLID_STRUCTURES.has(object.type)) {
      const width = object.width || 28; const height = object.height || 32;
      const groundY = object.groundY ?? object.y + height / 2;
      return x >= object.x - width / 2 && x <= object.x + width / 2 && y >= groundY - height && y <= groundY;
    }
    if (object.type !== 'crane') return false;
    const top = object.groundY - (object.height || 220);
    const armX = object.x + (object.direction || 1) * (object.armLength || 180);
    const tower = Math.min(distanceToSegment(x, y, object.x, object.groundY, object.x, top), distanceToSegment(x, y, object.x, top, armX, top));
    const cable = object.cableIntact === false ? Infinity : Math.min(distanceToSegment(x, y, object.ballX, top, object.ballX, object.ballY - (object.ballRadius || 28)), Math.hypot(x - object.ballX, y - object.ballY));
    return tower <= 11 || cable <= 9;
  }) || null;
}
