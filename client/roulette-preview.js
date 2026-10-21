import { WORLD, clamp } from '/shared/constants.js';
import { playableWidth } from '/shared/map-layout.js';

const hash = (x, y, seed) => {
  let value = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263) ^ (seed || 0);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
};

export function constructionStage(progress) {
  if (progress < .42) return 'CONSTRUINDO TERRENO';
  if (progress < .65) return 'ERGUENDO ESTRUTURAS';
  if (progress < .91) return 'POSICIONANDO TANQUES';
  return 'ARENA PRONTA';
}

export function drawRouletteConstruction(canvas, game, progress, activeIndex = -1) {
  const c = canvas.getContext('2d');
  if (!c || !game?.terrain?.heights?.length) return;
  const w = canvas.width; const h = canvas.height; const seed = Number(game.seed) || 0;
  const heights = game.terrain.heights; const arenaWidth = playableWidth(game.terrain);
  const terrainSamples = heights.slice(0, arenaWidth).filter((_, i) => i % 32 === 0);
  const terrainMin = Math.min(...terrainSamples);
  const terrainMax = Math.max(...terrainSamples);
  const platformMin = Math.min(terrainMin, ...(game.terrain.floatingPlatforms || []).filter((platform) => platform.active).map((platform) => platform.y));
  const viewTop = Math.max(0, platformMin - 145);
  const viewBottom = Math.min(WORLD.height + 40, Math.max(terrainMax + 54, viewTop + 390));
  const sx = (x) => x / arenaWidth * w;
  const sy = (y) => (y - viewTop) / (viewBottom - viewTop) * (h - 22) + 12;
  c.fillStyle = '#02050a'; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#14202b'; c.lineWidth = 1;
  for (let y = 18; y < h; y += 28) { c.beginPath(); c.moveTo(0, y + .5); c.lineTo(w, y + .5); c.stroke(); }
  const blockW = 6; const blockH = 6;
  for (let px = 0; px < w; px += blockW) {
    const worldX = Math.min(arenaWidth - 1, Math.floor((px + blockW / 2) / w * arenaWidth));
    const surface = sy(heights[worldX]);
    const wave = progress * 1.44 - px / w * .46;
    if (wave <= 0) continue;
    const edge = Math.min(1, wave * 5);
    for (let py = Math.max(0, Math.ceil(surface / blockH) * blockH); py < h; py += blockH) {
      const depth = (py - surface) / blockH;
      const noise = hash(px / blockW, py / blockH, seed);
      if (noise > edge + .045 && depth > 1) continue;
      c.fillStyle = depth < 2 ? '#f4f7ff' : depth < 9 ? (noise > .43 ? '#b5bfce' : '#8e9aab') : noise > .65 ? '#687585' : '#3f4b59';
      c.fillRect(px, py, blockW - 1, blockH - 1);
    }
    if (wave < .09) {
      const sparkY = Math.max(4, surface - 10 - hash(px / blockW, 0, seed) * 38);
      c.fillStyle = '#ffffff'; c.fillRect(px, sparkY, 3, 3);
    }
  }
  for (const platform of game.terrain.floatingPlatforms || []) {
    if (!platform.active || progress < .42 + sx(platform.x) / w * .16) continue;
    const x = sx(platform.x); const y = sy(platform.y); const width = Math.max(3, sx(platform.width));
    c.fillStyle = '#f3f7ff'; c.fillRect(x, y, width, 4);
    c.fillStyle = '#596978'; c.fillRect(x + 3, y + 4, Math.max(1, width - 6), 3);
  }
  if (progress > .28) for (const lake of game.waterZones || []) {
    const left = sx(lake.x - lake.radius); const right = sx(lake.x + lake.radius); const surface = sy(lake.surfaceY);
    c.fillStyle = '#8be8ff'; c.fillRect(left, surface, right - left, 2);
    c.fillStyle = '#2b7491aa'; c.fillRect(left, surface + 2, right - left, Math.max(0, h - surface - 14));
  }
  if (progress > .51) for (const object of game.objects || []) {
    if (object.active === false || progress < .51 + sx(object.x || 0) / w * .19) continue;
    const x = sx(object.x || 0); const y = sy(object.y || 0);
    const width = clamp(sx(object.width || 28), 4, 40); const height = clamp((object.height || 36) / (viewBottom - viewTop) * (h - 22), 5, 65);
    c.strokeStyle = '#c6d3e0'; c.lineWidth = 1;
    if (object.type === 'crane') {
      c.strokeRect(x - 2, y - height, 4, height);
      c.beginPath(); c.moveTo(x - width, y - height); c.lineTo(x + width, y - height); c.moveTo(x, y - height); c.lineTo(x + width * .55, y - height + 9); c.stroke();
    } else c.strokeRect(x - width / 2, y - height / 2, width, height);
  }
  const players = game.players || [];
  players.forEach((player, index) => {
    const appearAt = .54 + index / Math.max(1, players.length) * .30;
    if (!Number.isFinite(player.x) || !Number.isFinite(player.y) || progress < appearAt) return;
    const local = clamp((progress - appearAt) / .065, 0, 1);
    const x = sx(player.x); const y = sy(player.y) - (1 - local) * 47;
    const highlighted = progress > .34 && index === activeIndex;
    c.fillStyle = highlighted ? '#c9ff39' : '#f5f8ff';
    c.fillRect(x - 9, y - 4, 18, 5); c.fillRect(x - 6, y - 9, 12, 5);
    c.fillRect(x - 1, y - 13, 9, 3);
    c.fillStyle = '#000'; c.fillRect(x - 6, y - 3, 12, 1);
    c.fillStyle = highlighted ? '#c9ff39' : '#cdd6e2';
    c.font = 'bold 9px monospace'; c.textAlign = 'center';
    c.fillText(player.nickname?.slice(0, 12) || `TANQUE ${index + 1}`, x, y - 19 - index % 2 * 10);
    if (local < 1) { c.fillStyle = '#eff5ff'; for (let i = 0; i < 5; i += 1) c.fillRect(x - 12 + i * 5, y - 48 + i * 5, 3, 3); }
  });
  c.strokeStyle = '#9aaebe'; c.strokeRect(.5, .5, w - 1, h - 1);
  c.fillStyle = '#b9c8d4'; c.font = '10px monospace'; c.textAlign = 'left';
  c.fillText(constructionStage(progress), 12, 19);
  c.textAlign = 'right'; c.fillText(`${Math.round(progress * 100)}%`, w - 12, 19);
}
