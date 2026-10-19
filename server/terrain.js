import { WORLD, clamp } from '../shared/constants.js';
import { seededRandom } from './random.js';

export function generateTerrain(seed, requestedType = 'random') {
  const rand = seededRandom(seed);
  const styles = ['flat', 'hills', 'highlands', 'islands', 'canyon', 'platforms'];
  const type = requestedType === 'random' ? styles[Math.floor(rand() * styles.length)] : requestedType;
  const heights = new Array(WORLD.width);
  const phaseA = rand() * Math.PI * 2;
  const phaseB = rand() * Math.PI * 2;

  for (let x = 0; x < WORLD.width; x += 1) {
    let y = 760;
    if (type === 'flat') y += Math.sin(x / 105 + phaseA) * 20 + Math.sin(x / 310 + phaseB) * 13 + (rand() - 0.5) * 5;
    if (type === 'hills') y += Math.sin(x / 145 + phaseA) * 128 + Math.sin(x / 48 + phaseB) * 38 + Math.sin(x / 390) * 45;
    if (type === 'highlands') y = 690 + Math.sin(x / 240 + phaseA) * 205 + Math.sin(x / 73 + phaseB) * 68 + Math.sin(x / 690) * 78;
    if (type === 'canyon') y = 560 + 350 * Math.exp(-((x - WORLD.width / 2) ** 2) / 720000) + Math.sin(x / 130) * 52 + Math.sin(x / 420 + phaseA) * 42;
    if (type === 'islands') {
      const band = x % 700;
      const gap = band > 430 && band < 570;
      y = gap ? WORLD.height + 80 : 720 + Math.sin(x / 115 + phaseA) * 105 + Math.sin(x / 43 + phaseB) * 31;
    }
    if (type === 'platforms') y = 850 + Math.sin(x / 195 + phaseA) * 48 + Math.sin(x / 65 + phaseB) * 21;
    heights[x] = Math.round(clamp(y, 210, WORLD.height + 80));
  }
  const platforms = addPlatforms(heights, rand, type);
  if (type === 'highlands') {
    for (let fissure = 0; fissure < 4; fissure += 1) {
      const center = Math.round((fissure + .5) * WORLD.width / 4 + (rand() - .5) * 180);
      const halfWidth = 36 + Math.round(rand() * 20);
      for (let x = Math.max(0, center - halfWidth); x <= Math.min(WORLD.width - 1, center + halfWidth); x += 1) heights[x] = WORLD.height + 80;
    }
  }
  const floatingPlatforms = addFloatingPlatforms(heights, rand, type);
  addSkyDecks(heights, floatingPlatforms, rand);
  addUpperPlatforms(heights, floatingPlatforms, rand);
  return { type, biome: type, heights, platforms, floatingPlatforms };
}

function addPlatforms(heights, rand, type) {
  const count = type === 'platforms' ? 34 : type === 'flat' ? 15 : type === 'highlands' ? 24 : 22;
  const platforms = [];
  const zone = (WORLD.width - 180) / count;
  for (let i = 0; i < count; i += 1) {
    const center = 90 + zone * (i + .5) + (rand() - .5) * zone * .45;
    const width = Math.round(95 + rand() * (type === 'platforms' ? 150 : 105));
    const existing = heights[Math.round(clamp(center, 0, WORLD.width - 1))];
    if (existing > WORLD.height && type !== 'platforms') continue;
    const lift = type === 'platforms' ? 90 + rand() * 315 : 55 + rand() * (type === 'highlands' ? 205 : 165);
    const y = Math.round(clamp(existing - lift, 220, WORLD.height - 185) / 5) * 5;
    const left = Math.max(10, Math.round(center - width / 2)); const right = Math.min(WORLD.width - 10, Math.round(center + width / 2));
    const ramp = 28;
    for (let x = left - ramp; x <= right + ramp; x += 1) {
      if (x < 0 || x >= WORLD.width) continue;
      const blend = x < left ? (x - (left - ramp)) / ramp : x > right ? ((right + ramp) - x) / ramp : 1;
      heights[x] = Math.min(heights[x], Math.round(heights[x] + (y - heights[x]) * clamp(blend, 0, 1)));
    }
    platforms.push({ x: left, y, width: right - left });
  }
  return platforms;
}

function addFloatingPlatforms(heights, rand, type) {
  const counts = { flat: 5, hills: 7, highlands: 9, islands: 10, canyon: 8, platforms: 13 };
  const count = counts[type] || 4;
  const result = [];
  const zone = (WORLD.width - 260) / count;
  for (let i = 0; i < count; i += 1) {
    const width = Math.round((105 + rand() * 115) / 5) * 5;
    const center = 130 + zone * (i + .5) + (rand() - .5) * zone * .42;
    const baseX = Math.round(clamp(center - width / 2, 35, WORLD.width - width - 35));
    const ground = heights[Math.round(baseX + width / 2)];
    const y = Math.round(clamp((ground > WORLD.height ? WORLD.height - 180 : ground) - 105 - rand() * 195, 205, WORLD.height - 150) / 5) * 5;
    const moving = i % 3 === 1 || (type === 'platforms' && i % 3 === 0);
    result.push({
      id: `fp${i}`, baseX, x: baseX, y, width, height: 10, moving,
      amplitude: moving ? Math.round(25 + rand() * 50) : 0,
      period: Math.round(5200 + rand() * 3600), phase: rand() * Math.PI * 2,
      durability: 100, active: true,
    });
  }
  return result;
}

function addSkyDecks(heights, platforms, rand) {
  for (let sector = 0; sector < 4; sector += 1) {
    for (let attempt = 0; attempt < 28; attempt += 1) {
      const width = 210 + Math.round(rand() * 75);
      const center = Math.round((sector + .5) * WORLD.width / 4 + (rand() - .5) * 670);
      const x = Math.round(clamp(center - width / 2, 45, WORLD.width - width - 45));
      const y = Math.round((205 + rand() * 95) / 5) * 5;
      const samples = [x + 18, x + width / 2, x + width - 18];
      if (samples.some((sample) => heights[Math.round(sample)] < y + 120)) continue;
      if (platforms.some((platform) => x < platform.baseX + platform.width + 30 && x + width > platform.baseX - 30 && Math.abs(platform.y - y) < 90)) continue;
      platforms.push({ id: `sky${sector}`, baseX: x, x, y, width, height: 14, moving: false, amplitude: 0, period: 0, phase: 0, durability: 145, active: true, skyDeck: true });
      break;
    }
  }
}

function addUpperPlatforms(heights, platforms, rand) {
  // A second elevated tier fills gaps between the large sky decks. These are
  // stationary and wide enough to serve as safe tank spawns.
  for (let sector = 0; sector < 8; sector += 1) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const width = 135 + Math.round(rand() * 60);
      const center = Math.round((sector + .5) * WORLD.width / 8 + (rand() - .5) * 310);
      const x = Math.round(clamp(center - width / 2, 35, WORLD.width - width - 35));
      const y = Math.round((315 + rand() * 135) / 5) * 5;
      if ([x + 18, x + width / 2, x + width - 18].some((sample) => heights[Math.round(sample)] < y + 100)) continue;
      if (platforms.some((platform) => x < platform.baseX + platform.width + 28 && x + width > platform.baseX - 28 && Math.abs(platform.y - y) < 80)) continue;
      platforms.push({ id: `upper${sector}`, baseX: x, x, y, width, height: 12, moving: false, amplitude: 0, period: 0, phase: 0, durability: 115, active: true, upperDeck: true });
      break;
    }
  }
}

export function movingPlatformX(platform, epoch, now = Date.now()) {
  const baseX = Number.isFinite(platform.baseX) ? platform.baseX : platform.x;
  if (!platform.moving || !platform.active) return baseX;
  return baseX + Math.sin(((now - epoch) / platform.period) * Math.PI * 2 + platform.phase) * platform.amplitude;
}

export function terrainY(terrain, x) {
  return terrain.heights[Math.round(clamp(x, 0, WORLD.width - 1))];
}

export function carveTerrain(terrain, cx, cy, radius) {
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(WORLD.width - 1, Math.ceil(cx + radius));
  for (let x = minX; x <= maxX; x += 1) {
    const dx = x - cx;
    const reach = Math.sqrt(Math.max(0, radius * radius - dx * dx));
    const bottom = cy + reach;
    if (terrain.heights[x] < bottom) terrain.heights[x] = Math.min(WORLD.height + 80, Math.round(bottom));
  }
}

export function findSpawns(terrain, count) {
  const spawns = []; const candidates = []; const safeBand = 42; const elevated = (terrain.floatingPlatforms || []).filter((platform) => platform.active && platform.width >= 115 && platform.y <= WORLD.height - 170);
  const reservedSkyId = elevated.find((platform) => platform.skyDeck)?.id;
  for (let x = 70; x < WORLD.width - 70; x += 4) {
    if (safeSpawnBand(terrain, x, safeBand)) candidates.push(x);
  }
  const margin = 75; const minSpacing = Math.min(210, (WORLD.width / Math.max(1, count)) * .42);
  for (let i = 0; i < count; i += 1) {
    const target = margin + ((WORLD.width - margin * 2) * (i + 0.5)) / count;
    if (count >= 3 && (i % 3 === 1 || i % 4 === 1) && elevated.length) {
      const preferred = i % 4 === 1 ? elevated.filter((platform) => platform.skyDeck && platform.id !== reservedSkyId) : elevated.filter((platform) => !platform.skyDeck);
      const choices = preferred.length ? preferred : elevated.filter((platform) => platform.id !== reservedSkyId);
      const availablePlatforms = choices.filter((platform) => spawns.every((spawn) => Math.abs(platform.baseX + platform.width / 2 - spawn.x) >= minSpacing));
      const platform = (availablePlatforms.length ? availablePlatforms : choices).sort((a, b) => Math.abs(a.baseX + a.width / 2 - target) - Math.abs(b.baseX + b.width / 2 - target))[0];
      if (platform) { elevated.splice(elevated.indexOf(platform), 1); const x = Math.round(platform.x + platform.width / 2); spawns.push({ x, y: platform.y - WORLD.tankRadius, supportPlatformId: platform.id, platformOffset: x - platform.x }); continue; }
    }
    const available = candidates.filter((x) => spawns.every((spawn) => Math.abs(spawn.x - x) >= minSpacing));
    const unused = candidates.filter((x) => spawns.every((spawn) => Math.abs(spawn.x - x) >= 28));
    const pool = available.length ? available : unused;
    let bestX = pool.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
    if (bestX === undefined) bestX = createEmergencySpawnPad(terrain, target, safeBand);
    spawns.push({ x: bestX, y: terrainY(terrain, bestX) - WORLD.tankRadius, supportPlatformId: null, platformOffset: null });
  }
  return spawns.sort((a, b) => a.x - b.x);
}

function safeSpawnBand(terrain, center, radius) {
  const samples = [];
  for (let dx = -radius; dx <= radius; dx += 1) samples.push(terrainY(terrain, center + dx));
  if (samples.some((y) => y >= WORLD.height - 24) || Math.max(...samples) - Math.min(...samples) > 18) return false;
  for (let index = 1; index < samples.length; index += 1) if (Math.abs(samples[index] - samples[index - 1]) > 3) return false;
  const surface = terrainY(terrain, center);
  return !(terrain.floatingPlatforms || []).some((platform) => platform.active && center + 18 >= platform.x && center - 18 <= platform.x + platform.width && platform.y >= surface - 24 && platform.y <= surface + 12);
}

function createEmergencySpawnPad(terrain, target, radius) {
  let center = Math.round(clamp(target, 70, WORLD.width - 70));
  if (terrainY(terrain, center) >= WORLD.height - 24) {
    for (let distance = 4; distance < WORLD.width / 2; distance += 4) {
      const options = [center - distance, center + distance].filter((x) => x >= 70 && x < WORLD.width - 70 && terrainY(terrain, x) < WORLD.height - 24);
      if (options.length) { center = options[0]; break; }
    }
  }
  const level = Math.round(clamp(terrainY(terrain, center), 260, WORLD.height - 80));
  for (let dx = -radius; dx <= radius; dx += 1) terrain.heights[Math.round(center + dx)] = level;
  return center;
}
