import { clamp } from './constants.js';

// The aiming preview is measured above the horizon. Canvas angles run
// clockwise from the right, so a left-facing elevated shot crosses the top.
export function barrelRadians(angle, direction) {
  const radians = clamp(Number(angle) || 0, -85, 85) * Math.PI / 180;
  return direction < 0 ? Math.PI + radians : -radians;
}

export function easeBarrelAngle(current, target, elapsedMs) {
  if (!Number.isFinite(current)) return target;
  const turn = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + turn * clamp(elapsedMs / 115, 0, 1);
}
