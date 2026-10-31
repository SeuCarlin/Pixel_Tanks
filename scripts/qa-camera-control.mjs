import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createGame, publicGame, sanitizeRules } from '../server/game.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url=process.env.QA_URL || 'http://localhost:3100',output='output/web-game/camera';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 await page.goto(url);await page.locator('#audioPromptSkip').click();await page.keyboard.type('test');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).phase==='playing');
 await page.waitForTimeout(1800);
 const state=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
 await page.keyboard.press('F2');await page.waitForTimeout(150);assert.equal((await state()).camera.mode,'fixed');
 const canvas=await page.locator('#gameCanvas').boundingBox();const x=canvas.x+canvas.width*.55,y=canvas.y+canvas.height*.45;
 await page.mouse.move(x,y);await page.mouse.down({button:'right'});await page.mouse.move(x-130,y+40,{steps:6});await page.mouse.up({button:'right'});
 const manual=(await state()).camera;await page.waitForTimeout(500);assert.deepEqual((await state()).camera,manual);
 await page.mouse.wheel(0,-100);await page.waitForTimeout(100);assert.ok((await state()).camera.zoom>manual.zoom);const zoomed=(await state()).camera.zoom;
 await page.locator('#zoomFit').click();await page.waitForTimeout(120);const overview=(await state()).camera;assert.ok(overview.zoom<manual.zoom);
 await page.screenshot({path:`${output}/overview.png`});
 await page.keyboard.press('F2');await page.waitForTimeout(200);assert.equal((await state()).camera.mode,'dynamic');assert.equal((await state()).camera.userZoom,zoomed);
 await page.keyboard.press('Home');await page.waitForTimeout(1100);await page.screenshot({path:`${output}/live-controls.png`});
 const scene=await browser.newPage({viewport:{width:1280,height:720}});scene.on('pageerror',e=>errors.push(e.message));await scene.goto(`${url}/health`);
 const room={rules:sanitizeRules({seed:'camera-fixture',powerupCount:0,mapType:'flat'}),players:[{id:'one',nickname:'YOU',color:'#b7ec58'},{id:'two',nickname:'TARGET',color:'#ff755c'}]};room.game=createGame(room);Object.assign(room.game,{phase:'playing',objects:[],mines:[],powerups:[],waterZones:[]});room.game.terrain.heights.fill(700);room.game.terrain.floatingPlatforms=[];
 const result=await scene.evaluate(async state=>{
  window.requestAnimationFrame=()=>0;document.body.innerHTML='<div style="width:1280px;height:720px"><canvas width="1280" height="720" style="width:1280px;height:720px"></canvas></div>';document.body.style.margin='0';
  const {Renderer}=await import('/renderer.js');const r=new Renderer(document.querySelector('canvas'));r.setPlayer('one');r.setGame(state);r.camera={x:500,y:150,zoom:1};r.fixedCameraInitialized=true;
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);const now=performance.now();
  r.deathCamera={x:2200,y:500,until:now+5000};r.eventCamera={x:2500,y:400,zoom:.4,until:now+5000};r.sentryBursts=[{x:1800,y:500,started:now,duration:5000,bullets:[]}];
  r.takeCameraControl();const before={...r.camera};r.updateCamera(.05,now+100);const manual=equal(before,r.camera);
  r.resumeCamera();r.setCameraMode('fixed');r.fixedCameraInitialized=true;r.deathCamera={x:2200,y:500,until:now+5000};r.updateCamera(.05,now+100);const fixed=equal(before,r.camera);
  r.setCameraMode('dynamic');r.resumeCamera();r.beginAimDrag();r.updateCamera(.05,now+100);const aim=equal(before,r.camera);r.endAimDrag();
  r.resumeCamera();const paths=[-1,0,1].map(direction=>Array.from({length:120},(_,i)=>({x:700+i*9,y:450+Math.sin(i/119*Math.PI)*direction*180})));
  r.shots=paths.map(path=>({weapon:'waterTorpedo',path,started:now,exploded:false,seenBounces:new Set(),trailAt:0,damage:[]}));
  for(let i=0;i<25;i++)r.updateCamera(.02,now+600);r.draw(now+600);
  window.qaCameraRenderer=r;
  return {manual,fixed,aim,camera:{...r.camera}};
 },publicGame(room.game,'one'));
 assert.ok(result.manual);assert.ok(result.fixed);assert.ok(result.aim);await scene.screenshot({path:`${output}/salvo-framing.png`});await writeFile(`${output}/state.json`,JSON.stringify(result,null,2));
 const aftermath=await scene.evaluate(()=>{
  const r=window.qaCameraRenderer,now=performance.now();r.shots=[];r.turnFocus=null;r.aimDragCamera=null;r.sentryBursts=[];r.eventCamera=null;r.deathCamera=null;r.cameraReturn=null;
  r.actionCamera={x:800,y:500,zoom:1,until:now+5000};r.actionFocusPoints=[{x:800,y:500}];r.actionTrackedPlayerIds=['two'];
  const victim=r.visualPlayers.get('two');victim.renderX=2300;victim.renderY=600;victim.moving=true;
  for(let i=0;i<100;i++)r.updateCamera(.05,now+i*16);r.clampCamera();r.draw(now+1600);
  return {left:r.camera.x,right:r.camera.x+1280/r.camera.zoom,victimX:victim.renderX};
 });
 assert.ok(aftermath.left<=800 && aftermath.right>=aftermath.victimX);await scene.screenshot({path:`${output}/aftermath.png`});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);await page.screenshot({path:`${output}/mobile-controls.png`});
 assert.deepEqual(errors,[]);console.log('Camera manual/fixed/aim priority, wheel zoom, overview, resume, Home and salvo framing passed.');
}finally{await browser.close();}
