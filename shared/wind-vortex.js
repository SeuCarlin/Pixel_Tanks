// The same force is used by the server simulation and the client's aim preview.
export function vortexAt(vortices = [], x, y, now = Date.now()) {
  return vortices.find((vortex) => now >= (vortex.appearsAt || 0) && x >= vortex.x - vortex.width / 2 && x <= vortex.x + vortex.width / 2
    && y >= vortex.y - vortex.height && y <= vortex.y + 16) || null;
}

export function deflectProjectile(vortices, x, y, vx, vy, dt, now = Date.now()) {
  const vortex = vortexAt(vortices, x, y, now);
  if (!vortex) return { vx, vy, vortex: null };
  const offset = (x - vortex.x) / Math.max(1, vortex.width / 2);
  const pocket = vortex.kind === 'airPocket';
  // Strong vertical lift, with a small swirl. Clamp so a projectile always
  // escapes the column instead of hovering in it forever.
  return {
    vx: vx + (-offset * (pocket ? 170 : 95) + Math.sin((vortex.y - y) / 43) * (pocket ? 65 : 42)) * dt,
    vy: Math.max(pocket ? -480 : -680, vy - (pocket ? 760 : 1050) * dt),
    vortex,
  };
}
