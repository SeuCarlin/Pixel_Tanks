export function selectCameraPlayer(visualPlayers, activePlayerId, localPlayerId) {
  const active = visualPlayers.get(activePlayerId);
  if (active && active.alive !== false && !active.hidden) return active;
  const animated = [...visualPlayers.values()].find((player) => player.alive !== false && !player.hidden && (player.launchAnimation || player.moving));
  if (animated) return animated;
  const local = visualPlayers.get(localPlayerId);
  return local && local.alive !== false && !local.hidden ? local : [...visualPlayers.values()].find(player=>player.alive !== false && !player.hidden) || null;
}

export function turnCameraZoom(userZoom, minimumZoom, maximumZoom = 1.28) {
  return Math.max(minimumZoom, Math.min(maximumZoom, userZoom));
}

// Include simultaneous projectiles without following only the first result in a salvo.
export function actionCameraFrame(points, width, height, userZoom, minimumZoom, padding = 180) {
  const valid = points.filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.y));
  if (!valid.length) return null;
  const minX = Math.min(...valid.map(p=>p.x)), maxX = Math.max(...valid.map(p=>p.x));
  const minY = Math.min(...valid.map(p=>p.y)), maxY = Math.max(...valid.map(p=>p.y));
  return {x:(minX+maxX)/2,y:(minY+maxY)/2,zoom:Math.max(minimumZoom,Math.min(userZoom,width/(maxX-minX+padding*2),height/(maxY-minY+padding*2)))};
}
export function anchoredCameraZoom(camera, zoom, anchorX, anchorY) {
  return { x:camera.x+anchorX/camera.zoom-anchorX/zoom, y:camera.y+anchorY/camera.zoom-anchorY/zoom, zoom };
}
