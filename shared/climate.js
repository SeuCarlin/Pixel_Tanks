import { clamp } from './constants.js';

const AMBIENT_RAIN = Object.freeze({ flat: .16, platforms: .3, islands: .26 });
const CYCLE_MS = 72000;
const RAIN_MS = 24000;
const RAMP_MS = 4200;

function phaseFor(seed, biome) {
  let hash = 2166136261;
  for (const char of `${seed}-${biome}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % CYCLE_MS;
}

export function ambientRainStrength(game, now = Date.now()) {
  const biome = game?.terrain?.type;
  const maximum = AMBIENT_RAIN[biome] || 0;
  if (!maximum) return 0;
  const elapsed = now - (game.platformEpoch || now) + phaseFor(game.seed, biome);
  const cycle = Math.floor(elapsed / CYCLE_MS);
  if (biome === 'flat' && cycle % 2 !== 0) return 0;
  const position = ((elapsed % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
  if (position >= RAIN_MS) return 0;
  return maximum * Math.min(1, position / RAMP_MS, (RAIN_MS - position) / RAMP_MS);
}

export function weatherVisualState(game, now = Date.now()) {
  const ambient = ambientRainStrength(game, now);
  const weather = game?.weather;
  let rain = ambient;
  let cloud = ambient * .7;
  let wind = 0;
  if (weather?.kind === 'rain') {
    const strength = clamp((now - weather.startedAt) / 2800, 0, 1);
    rain = Math.max(rain, .12 + strength * .88);
    cloud = Math.max(cloud, .12 + strength * .42);
  } else if (weather?.kind === 'wind') {
    const strength = clamp((now - weather.startedAt) / 2400, 0, 1);
    rain = Math.max(rain, (weather.priorRain || 0) * (1 - strength));
    cloud = Math.max(cloud, .25 + strength * .08);
    wind = strength;
  } else if (weather?.kind === 'clearing') {
    const remaining = 1 - clamp((now - weather.startedAt) / Math.max(1, weather.endsAt - weather.startedAt), 0, 1);
    const eased = remaining * remaining;
    cloud = Math.max(cloud, (weather.fromKind === 'wind' ? .33 : .54) * eased);
    rain = Math.max(rain, weather.fromKind === 'rain' ? eased : 0);
    wind = weather.fromKind === 'wind' ? eased : 0;
  }
  return { rain: clamp(rain, 0, 1), cloud: clamp(cloud, 0, 1), wind: clamp(wind, 0, 1), ambient };
}
