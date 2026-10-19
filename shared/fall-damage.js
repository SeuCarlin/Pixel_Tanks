export const FALL_SAFE_HEIGHT = 110;

export const FALL_CLASS_MULTIPLIER = Object.freeze({
  armored: 0.55,
  attacker: 1.1,
  bomber: 0.85,
  healer: 1,
  meteorologist: 1,
  ninja: 0.5,
  saboteur: 0.95,
  backpacker: 1.15,
});

export function fallDamage(distance, classType, parachute = false) {
  if (parachute || !Number.isFinite(distance) || distance <= FALL_SAFE_HEIGHT) return 0;
  const base = Math.min(120, (distance - FALL_SAFE_HEIGHT) * 0.18);
  return Math.max(1, Math.round(base * (FALL_CLASS_MULTIPLIER[classType] || 1)));
}
