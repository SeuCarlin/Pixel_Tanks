import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, fire, finishPendingShot, sanitizeRules, tickRoom, nextTurn } from '../server/game.js';
import { settlePlayers } from '../server/physics.js';
import { plasmaLinks, updatePlasma, interceptPlasma, clipTankAtPlasma } from '../server/plasma.js';
import { walkPath } from '../shared/movement.js';
import { WORLD } from '../shared/constants.js';

function roomFor(weapon = 'plasmaCore') {
  const room = { rules: sanitizeRules({ seed: 'plasma-regression', enabledEvents: [], powerupCount: 0, mapType: 'flat' }), players: [{ id: 'one', nickname: 'One', arsenal: [weapon] }, { id: 'two', nickname: 'Two' }] };
  room.game = createGame(room);
  Object.assign(room.game, { phase: 'playing', turnEndsAt: Date.now()+3600000, turnIndex: 0, roundNumber: 2, turnNumber: 2, openingRestrictionsActive: false, objects: [], mines: [], powerups: [], waterZones: [] });
  room.game.terrain.heights.fill(700); room.game.terrain.floatingPlatforms = [];
  for (const [i,p] of room.game.players.entries()) { p.x = 200 + i*600; p.y = 700-WORLD.tankRadius; p.health = p.maxHealth = 500; p.turnsPlayed = 1; }
  return room;
}
const core = (id, x, y = 450) => ({ id, x, y, ownerId: 'one', active: true, activateAt: 0, updatedAt: 1000, expiresRound: 6 });

test('plasma deploys with bounces, no explosion/crater or immediate damage, and recharges after two owner turns', () => {
  const room = roomFor(); const g = room.game; const before = [...g.terrain.heights];
  const [shot] = fire(room, 'one', { weapon: 'plasmaCore', angle: 45, power: 180, direction: 1 });
  assert.ok(shot.bounces.length >= 1); assert.ok(shot.noExplosion); assert.deepEqual(shot.damage, []);
  assert.equal(g.plasmaCores.length, 1); assert.equal(g.plasmaCores[0].expiresRound, 6); assert.deepEqual([...g.terrain.heights], before);
  g.shotEndsAt = null; g.pendingShot = null; const source = g.players[0]; const spent = source.arsenalLastUsed.plasmaCore;
  nextTurn(room); nextTurn(room); assert.equal(source.ammo.plasmaCore, 0);
  nextTurn(room); nextTurn(room); assert.ok(source.turnsPlayed >= spent+2); assert.equal(source.ammo.plasmaCore, 1);
});
test('plasma seeks only within 300, hits for 50 once and expires after four rounds', () => {
  const g = roomFor().game; const target = g.players[1]; target.x = 500; target.y = 450;
  g.plasmaCores = [core('seek', 150)]; let damage = 0;
  const options = { isEnemy: (id,p) => p.id !== id, damage: (id,p,n) => { damage += n; } };
  updatePlasma(g, 1050, options); assert.equal(g.plasmaCores[0].x, 150);
  target.x = 440; updatePlasma(g,1100,options); assert.ok(g.plasmaCores[0].x > 150);
  for (let now=1150; now<3000; now+=50) updatePlasma(g,now,options);
  assert.equal(damage,50); assert.equal(g.plasmaCores.length,0);
  g.plasmaCores=[core('expire',100)]; g.roundNumber=6; updatePlasma(g,4000,options); assert.equal(g.plasmaCores.length,0);
});
test('lasers link only matching owners within 600, repel, damage once per turn and intercept swept projectile paths', () => {
  const room=roomFor(); const g=room.game; g.players[1].x=500; g.players[1].y=450;
  g.plasmaCores=[core('a',200),core('b',800)]; assert.equal(plasmaLinks(g).length,1);
  tickRoom(room); assert.equal(g.players[1].health,450); assert.ok(g.players[1].airborne);
  tickRoom(room); assert.equal(g.players[1].health,450);
  const shot={path:[{x:500,y:400},{x:500,y:500}],impact:{x:500,y:500},hit:true};
  assert.equal(interceptPlasma(g,shot,'two'),true); assert.equal(shot.impact,null); assert.equal(shot.hit,false);
  g.plasmaCores[1].ownerId='two'; assert.equal(plasmaLinks(g).length,0);
  g.plasmaCores[1].ownerId='one'; g.plasmaCores[1].x=g.plasmaCores[0].x+601; assert.equal(plasmaLinks(g).length,0);
});
test('airborne triple torpedoes take distinct arcs to one enemy and obstacles block individual paths', () => {
  const room=roomFor('waterTorpedo'); const g=room.game; g.players[0].y=450; g.players[1].y=450;
  const shots=fire(room,'one',{weapon:'waterTorpedo',angle:20,power:300,direction:1});
  assert.equal(shots.length,3); assert.ok(shots.every(s=>s.hit && s.targetId==='two' && !s.underwater));
  assert.equal(g.players[1].health,380); assert.equal(new Set(shots.map(s=>s.path[20].y)).size,3);
  const blocked=roomFor('waterTorpedo'); blocked.game.players[0].y=450; blocked.game.players[1].y=450;
  blocked.game.objects=[{id:'wall',type:'building',x:500,groundY:700,width:40,height:250,active:true}];
  const paths=fire(blocked,'one',{weapon:'waterTorpedo',angle:20,power:300,direction:1});
  assert.ok(paths.some(s=>!s.hit)); assert.ok(paths.some(s=>s.hit));
});
test('tanks remain on roofs, move across them, fall after support is destroyed and cannot drive through walls', () => {
  const g=roomFor().game; const p=g.players[0];
  const building={id:'roof',type:'building',x:300,groundY:700,width:180,height:160,active:true}; g.objects=[building];
  p.x=270; p.y=540-WORLD.tankRadius; settlePlayers(g); assert.equal(p.y,540-WORLD.tankRadius); assert.equal(p.supportObjectId,'roof');
  const path=walkPath(g.terrain,p,1,45,g.objects); assert.ok(path.moved); assert.equal(path.y,p.y);
  building.active=false; settlePlayers(g); assert.ok(p.airborne?.falling);
  building.active=true; p.airborne=null; p.x=185; p.y=700-WORLD.tankRadius;
  const wall=walkPath(g.terrain,p,1,100,g.objects); assert.ok(wall.blockedByWall); assert.ok(wall.x<210);
});
test('recycling heals both damage and destruction at 40 percent and respects maximum health', () => {
  const room=roomFor('vitalRecycling'); const g=room.game; const p=g.players[0]; p.health=100;
  fire(room,'one',{weapon:'vitalRecycling',angle:30,power:180,direction:1});
  p.stats.damage=g.pendingShot.damageBefore+100; p.stats.destruction=g.pendingShot.destructionBefore+200;
  const before=p.health; finishPendingShot(room); assert.equal(p.health,before+120);
});

test('a long movement packet stops at the laser instead of crossing it', () => {
 const g=roomFor().game; g.plasmaCores=[core('a',500,300),core('b',500,700)];
 const tank=g.players[1];tank.x=400;tank.y=500;const path={x:600,y:500,moved:true};
 assert.ok(clipTankAtPlasma(g,tank,path,(owner,p)=>p.id!==owner));
 assert.ok(path.x<500);assert.ok(path.plasmaContact);
});
