const clamp01 = (value) => Math.max(0, Math.min(1, value));

export function ambientLevels({ game, camera, viewportWidth = 1280, viewportHeight = 720, terrainHeights, objects } = {}) {
  if (!game || !camera || game.phase !== 'playing') return { wind: 0, leaves: 0, dust: 0, water: 0 };
  const zoom = Math.max(.1, camera.zoom || 1);
  const close = clamp01((zoom - .32) / .8) ** 1.4;
  if (close < .015) return { wind: 0, leaves: 0, dust: 0, water: 0 };
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
  const dry = game.weather?.kind === 'rain' || game.weather?.kind === 'snow' ? .18 : 1;
  return {
    wind: close * (.08 + windForce * .5),
    leaves: close * treeProximity * (.13 + windForce * .48),
    dust: close * groundProximity * (.12 + windForce * .48) * dry,
    water: close * lakeProximity * .42,
  };
}
