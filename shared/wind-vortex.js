// The same force is used by the server simulation and the client's aim preview.
export function vortexAt(vortices = [], x, y) {
  return vortices.find((vortex) => x >= vortex.x - vortex.width / 2 && x <= vortex.x + vortex.width / 2
    && y >= vortex.y - vortex.height && y <= vortex.y + 16) || null;
}

export function deflectProjectile(vortices, x, y, vx, vy, dt) {
  const vortex = vortexAt(vortices, x, y);
  if (!vortex) return { vx, vy, vortex: null };
  const offset = (x - vortex.x) / Math.max(1, vortex.width / 2);
  // Strong vertical lift, with a small swirl. Clamp so a projectile always
  // escapes the column instead of hovering in it forever.
  return {
    vx: vx + (-offset * 95 + Math.sin((vortex.y - y) / 43) * 42) * dt,
    vy: Math.max(-680, vy - 1050 * dt),
    vortex,
  };
}
