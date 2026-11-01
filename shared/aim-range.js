export function maxShotPower(player) { return player?.improvedAim && !player.teslaDisabledTurns ? 900 : 580; }
export function distantAimWeight(players = []) {
 const alive=players.filter(p=>p.alive!==false && Number.isFinite(p.x));
 const span=alive.length ? Math.max(...alive.map(p=>p.x))-Math.min(...alive.map(p=>p.x)) : 0;
 return span>1800 ? 6 : span>1000 ? 3 : 1;
}
