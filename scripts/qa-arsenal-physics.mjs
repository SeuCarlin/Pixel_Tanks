import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { createGame, fire, publicGame, sanitizeRules } from '../server/game.js';
import { WORLD } from '../shared/constants.js';
const output='output/web-game/arsenal-physics'; await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}}); const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const url=process.env.QA_URL || 'http://localhost:3100';
function fixture(weapon) {
 const room={rules:sanitizeRules({seed:'qa-plasma',enabledEvents:[],powerupCount:0,mapType:'flat'}),players:[{id:'one',nickname:'PLASMA',arsenal:[weapon],color:'#b7ec58'},{id:'two',nickname:'ALVO',color:'#ff755c'}]};
 room.game=createGame(room); Object.assign(room.game,{phase:'playing',roundNumber:2,turnIndex:0,openingRestrictionsActive:false,objects:[],mines:[],powerups:[],waterZones:[]});
 room.game.terrain.heights.fill(700); room.game.terrain.floatingPlatforms=[];
 room.game.players[0].x=250; room.game.players[1].x=950;
 for(const p of room.game.players){p.y=700-WORLD.tankRadius;p.health=p.maxHealth=500;}
 return room;
}
await page.addInitScript(() => {
 localStorage.setItem('tankMobileCameraMode','fixed');
 const Native=window.WebSocket;
 window.WebSocket=class extends Native { constructor(...args) { super(...args); window.qaSocket=this; this.addEventListener('message', event=>{if(window.qaFrozen && !event.qaInjected) event.stopImmediatePropagation();}); } };
});
try {
 await page.goto(url); await page.locator('#audioPromptSkip').click();
 await page.keyboard.type('test');
 await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).phase==='playing',{},{timeout:20000});
 await page.waitForTimeout(400);
 await page.screenshot({path:`${output}/live-game.png`});
 const live=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
 await writeFile(`${output}/live-state.json`,JSON.stringify(live,null,2));
 // Validate pointer magnetism against an actual enemy in the live match.
 const enemy=live.players?.find(p=>p.id!==live.localPlayerId && p.alive);
 const aimRoom=fixture('standard'); aimRoom.game.players[0].id=live.localPlayerId; aimRoom.game.players[1].id=enemy.id;
 aimRoom.game.players[0].x=450; aimRoom.game.players[1].x=850; aimRoom.game.debugMode=true; aimRoom.game.turnEndsAt=Date.now()+3600000;
 await page.evaluate(state=>{window.qaFrozen=true; const event=new MessageEvent('message',{data:JSON.stringify({type:'GAME_STATE',payload:state})});event.qaInjected=true;window.qaSocket.dispatchEvent(event);},publicGame(aimRoom.game,live.localPlayerId));
 await page.waitForTimeout(1800);
 const aimState=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
 const screenPoint=await page.evaluate(({camera,x,y})=>{const c=document.querySelector('#gameCanvas'),r=c.getBoundingClientRect();return {x:r.left+(x-camera.x)*camera.zoom*r.width/c.width,y:r.top+(y-camera.y)*camera.zoom*r.height/c.height};},{camera:aimState.camera,x:850,y:700-WORLD.tankRadius});
 await page.mouse.move(screenPoint.x,screenPoint.y); await page.mouse.down();await page.mouse.move(screenPoint.x+1,screenPoint.y);await page.mouse.up();
 const assisted=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
 assert.equal(assisted.aim.assistedTargetId,enemy.id);assert.ok(assisted.aim.estimatedError<=30);
 await page.screenshot({path:`${output}/aim-assist.png`});
 await page.mouse.move(screenPoint.x+70,screenPoint.y-70);await page.mouse.down();await page.mouse.up();
 assert.equal(JSON.parse(await page.evaluate(()=>window.render_game_to_text())).aim.assistedTargetId,null);
 console.log('Live match and pointer aim capture/release passed.');
 // Deterministic rendered combat fixtures exercise the same renderer and server fire results.
 const scene=await browser.newPage({viewport:{width:1280,height:720}});
 scene.on('pageerror',e=>errors.push(e.message)); await scene.goto(`${url}/health`);
 async function capture(room,name,shots=null,time=1200) {
  await scene.evaluate(async({state,shots,time})=>{
   if(!window.qaRenderer){window.requestAnimationFrame=()=>0;document.body.innerHTML='<div style="width:1280px;height:720px"><canvas id="scene" width="1280" height="720" style="width:1280px;height:720px"></canvas></div>';document.body.style.margin='0';const {Renderer}=await import('/renderer.js');window.qaRenderer=new Renderer(document.querySelector('canvas'));window.qaRenderer.setPlayer('one');}
   const r=window.qaRenderer; r.setGame(state);r.camera={x:0,y:180,zoom:1};r.setCameraMode('fixed');r.fixedCameraInitialized=true;r.shots=[];
   if(shots)r.playShot({shooterId:'one',results:shots});
   r.draw(performance.now()+time);
  },{state:publicGame(room.game,'one'),shots,time});
  await scene.screenshot({path:`${output}/${name}.png`});
 }
 const plasma=fixture('plasmaCore');
 plasma.game.plasmaCores=[{id:'a',ownerId:'one',x:450,y:600,active:true,activateAt:0,expiresRound:6},{id:'b',ownerId:'one',x:900,y:500,active:true,activateAt:0,expiresRound:6},{id:'c',ownerId:'one',x:1100,y:650,active:true,activateAt:0,expiresRound:6}];
 await capture(plasma,'plasma-linked'); await capture(plasma,'plasma-animated',null,1500);
 const torpedoes=fixture('waterTorpedo');torpedoes.game.players.forEach(p=>p.y=430);
 const shots=fire(torpedoes,'one',{weapon:'waterTorpedo',angle:30,power:300,direction:1});
 await capture(torpedoes,'triple-torpedo',shots,300);
 await writeFile(`${output}/torpedo-state.json`,JSON.stringify(shots,null,2));
 assert.deepEqual(errors,[]);console.log('Live match and plasma/torpedo screenshots passed without browser errors.');
} finally { await browser.close(); }
