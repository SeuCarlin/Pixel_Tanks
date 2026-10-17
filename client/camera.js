export function selectCameraPlayer(visualPlayers, activePlayerId, localPlayerId) {
  const active = visualPlayers.get(activePlayerId);
  if (active && !active.hidden) return active;
  const animated = [...visualPlayers.values()].find((player) => !player.hidden && (player.launchAnimation || player.moving));
  if (animated) return animated;
  const local = visualPlayers.get(localPlayerId);
  return local && !local.hidden ? local : null;
}

export function turnCameraZoom(userZoom, minimumZoom, maximumZoom = 1.28) {
  return Math.max(minimumZoom, Math.min(maximumZoom, Math.max(userZoom, .8)));
}
