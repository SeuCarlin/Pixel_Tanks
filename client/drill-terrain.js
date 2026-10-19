// Reveals the authoritative crater as the drill reaches each column and depth.
// The simulation still resolves the shot immediately; only its presentation is staged.
export function interpolateDrillTerrain(before, after, drills, now) {
  const heights = [...after];
  for (let x = 0; x < heights.length; x += 1) {
    if (after[x] <= before[x]) continue;
    let reveal = -1;
    let depthLimit = before[x];
    for (const drill of drills) {
      const distance = Math.abs(x - drill.x);
      if (distance > 140) continue;
      const progress = Math.max(0, Math.min(1, (now - drill.started) / drill.duration));
      const edgeDelay = distance / 140 * .22;
      const localProgress = Math.max(0, Math.min(1, (progress - edgeDelay) / (1 - edgeDelay)));
      reveal = Math.max(reveal, localProgress);
      depthLimit = Math.max(depthLimit, drill.y + 170 * progress + 22);
    }
    if (reveal < 0) continue;
    heights[x] = reveal >= 1 ? after[x] : Math.min(after[x], Math.round(before[x] + (after[x] - before[x]) * reveal), Math.round(depthLimit));
  }
  return heights;
}

// The crater changes only a small part of the map. Repainting the whole
// 5600px terrain canvas on every drill step blocks the browser's main thread.
export function changedTerrainColumns(before, after, blockSize) {
  const columns = [];
  for (let x = 0; x < after.length; x += blockSize) {
    if (Math.floor(before[x] / blockSize) !== Math.floor(after[x] / blockSize)) columns.push(x);
  }
  return columns;
}
