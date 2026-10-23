import { clamp } from './constants.js';

// A drag changes the saved aim relative to where the finger started. Tapping
// the arena never jumps the reticle to the touch point.
export function aimFromDrag(initial, deltaX, deltaY, sensitivity = .8) {
  if (Math.hypot(deltaX, deltaY) < 12) return { ...initial, changed: false };
  const radians = initial.angle * Math.PI / 180;
  const x = (initial.direction < 0 ? -1 : 1) * Math.cos(radians) * initial.power + deltaX * sensitivity;
  const y = -Math.sin(radians) * initial.power + deltaY * sensitivity;
  const direction = x < -12 ? -1 : x > 12 ? 1 : initial.direction;
  return {
    angle: clamp(Math.round(Math.atan2(-y, Math.max(5, Math.abs(x))) * 180 / Math.PI), -85, 85),
    power: clamp(Math.round(Math.hypot(x, y)), 100, 580),
    direction,
    changed: true,
  };
}

export function stableMoveDirection(dx, dy, previous = '', verticalAllowed = false) {
  if (Math.hypot(dx, dy) < 15) return '';
  if (!verticalAllowed) return dx < -12 ? 'left' : dx > 12 ? 'right' : '';
  const horizontalBias = ['left', 'right'].includes(previous) ? .78 : ['up', 'down'].includes(previous) ? 1.28 : 1;
  if (Math.abs(dx) >= Math.abs(dy) * horizontalBias) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}
