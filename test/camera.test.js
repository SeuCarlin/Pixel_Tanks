import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCameraPlayer, turnCameraZoom, actionCameraFrame, anchoredCameraZoom } from '../client/camera.js';

test('camera keeps the active player in focus while another tank is still moving', () => {
  const staleMovement = { id: 'old', moving: true, x: 180 };
  const active = { id: 'active', moving: false, x: 2400 };
  const players = new Map([[staleMovement.id, staleMovement], [active.id, active]]);
  assert.equal(selectCameraPlayer(players, active.id, staleMovement.id), active);
});

test('turn camera preserves the selected zoom within useful limits', () => {
  assert.equal(turnCameraZoom(.32, .28), .32);
  assert.equal(turnCameraZoom(1.05, .28), 1.05);
  assert.equal(turnCameraZoom(1.7, .28), 1.28);
});

test('zoom preserves the world coordinate under the cursor',()=>{
 const camera={x:400,y:100,zoom:.8},x=950,y=300;
 const next=anchoredCameraZoom(camera,1.4,x,y);
 assert.equal(camera.x+x/camera.zoom,next.x+x/next.zoom);
 assert.equal(camera.y+y/camera.zoom,next.y+y/next.zoom);
});
test('salvo framing includes every projectile and respects the user zoom',()=>{
 const points=[{x:200,y:150},{x:1100,y:650},{x:650,y:400}];
 const frame=actionCameraFrame(points,1280,720,1.12,.28,100);
 assert.equal(frame.x,650);assert.equal(frame.y,400);
 assert.ok(frame.zoom<=1.12);
 for(const p of points){assert.ok(Math.abs(p.x-frame.x)*frame.zoom<=640);assert.ok(Math.abs(p.y-frame.y)*frame.zoom<=360);}
 assert.equal(actionCameraFrame([{x:NaN,y:1}],1280,720,1,.28),null);
});

test('camera never keeps a dead or concealed tank as its idle follow target',()=>{
 const dead={id:'dead',alive:false},hidden={id:'hidden',alive:true,hidden:true},visible={id:'visible',alive:true};
 const players=new Map([['dead',dead],['hidden',hidden],['visible',visible]]);
 assert.equal(selectCameraPlayer(players,'dead','hidden'),visible);
});
