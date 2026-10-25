import { weatherVisualState } from '../shared/climate.js';

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const silent = () => ({ wind: 0, breeze: 0, leaves: 0, dust: 0, water: 0, waterfall: 0, rain: 0, snow: 0, ice: 0, fire: 0 });
const proximity = (x, y, focusX, focusY, range, radius = 0) => clamp01(1 - Math.max(0, Math.hypot(x - focusX, y - focusY) - radius) / range);

export function ambientLevels({ game, camera, viewportWidth = 1280, viewportHeight = 720, terrainHeights, objects, now = Date.now() } = {}) {
  if (!game || !camera || game.phase !== 'playing') return silent();
  const zoom = Math.max(.1, camera.zoom || 1);
  const close = clamp01((zoom - .32) / .8) ** 1.4;
  if (close < .015) return silent();
  const focusX = camera.x + viewportWidth / (zoom * 2);
  const focusY = camera.y + viewportHeight / (zoom * 2);
  const windForce = clamp01(Math.abs(game.wind || 0) / 30);
  const nearbyTrees = (objects || game.objects || []).filter((object) => object.active !== false && object.type?.startsWith('tree'));
  const treeRange = 410 / zoom;
  const treeProximity = nearbyTrees.reduce((nearest, tree) => {
    const canopyY = (tree.groundY ?? tree.y ?? 0) - (tree.height || 80) * .67;
    return Math.max(nearest, clamp01(1 - Math.hypot(tree.x - focusX, canopyY - focusY) / treeRange));
  }, 0);
  const sampleX = Math.round(Math.max(0, Math.min((terrainHeights?.length || 1) - 1, focusX)));
  const groundY = terrainHeights?.[sampleX];
  const groundProximity = Number.isFinite(groundY) ? clamp01(1 - Math.abs(groundY - focusY) / (400 / zoom)) : 0;
  const lakeRange = 360 / zoom;
  const lakeProximity = (game.waterZones || []).reduce((nearest, lake) => {
    const horizontal = Math.max(0, Math.abs(focusX - lake.x) - (lake.radius || 0));
    const vertical = Math.abs(focusY - (lake.surfaceY || 0)) * .7;
    return Math.max(nearest, clamp01(1 - Math.hypot(horizontal, vertical) / lakeRange));
  }, 0);
  let cascadeProximity = 0;
  for (const lake of game.waterZones || []) for (const flow of lake.flowCascades || []) cascadeProximity = Math.max(cascadeProximity, proximity(flow.x, (flow.fromY + flow.toY) / 2, focusX, focusY, 320 / zoom));
  const weather = weatherVisualState(game, now);
  const rain = Math.max(game.weather?.kind === 'rain' ? 1 : 0, Number(weather.rain) || 0);
  const snow = game.weather?.kind === 'snow' ? 1 : game.terrain?.type === 'hills' ? .28 : 0;
  let iceProximity = 0;
  for (const zone of game.iceZones || []) if (zone.expiresRound == null || zone.expiresRound >= game.roundNumber) iceProximity = Math.max(iceProximity, proximity(zone.x, zone.y, focusX, focusY, 320 / zoom, (zone.radius || 0) * .25));
  for (const platform of game.terrain?.floatingPlatforms || []) if (platform.active && platform.kind === 'iceSheet') iceProximity = Math.max(iceProximity, proximity(platform.x + platform.width / 2, platform.y, focusX, focusY, 300 / zoom, platform.width * .25));
  const fireProximity = (game.fireZones || []).filter((zone) => zone.turnsLeft > 0 && (!zone.ignitesAt || zone.ignitesAt <= now) && (!zone.flames?.length || zone.flames.some((flame) => !flame.extinguished)))
    .reduce((nearest, zone) => {
      const flames = zone.flames?.filter((flame) => !flame.extinguished && Number.isFinite(flame.x) && Number.isFinite(flame.y));
      if (!flames?.length) return Math.max(nearest, proximity(zone.x, zone.y, focusX, focusY, 380 / zoom, (zone.radius || 0) * .3));
      const stride = Math.max(1, Math.floor(flames.length / 12));
      for (let index = 0; index < flames.length; index += stride) nearest = Math.max(nearest, proximity(flames[index].x, flames[index].y, focusX, focusY, 380 / zoom, 20));
      return nearest;
    }, 0);
  const dry = clamp01(1 - rain * .82 - snow * .7);
  return {
    wind: close * (.08 + windForce * .5),
    breeze: close * (.32 * (1 - windForce)),
    leaves: close * treeProximity * (.13 + windForce * .48),
    dust: close * groundProximity * (.12 + windForce * .48) * dry,
    water: close * lakeProximity * .42,
    waterfall: close * cascadeProximity * .58,
    rain: close * rain * .52,
    snow: close * snow * .46,
    ice: close * iceProximity * .52,
    fire: close * fireProximity * .7,
  };
}
