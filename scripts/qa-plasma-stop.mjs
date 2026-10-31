import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output='output/web-game/plasma-stop';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});const errors=[];
try {
 const activations=process.env.QA_ACTIVATION ? [process.env.QA_ACTIVATION] : ['button','space','canvas'],retries={};
 for(let attempt=0;attempt<activations.length;attempt++) {
  const activation=activations[attempt];
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(process.env.QA_URL || 'http://localhost:3100');await page.locator('#audioPromptSkip').click();await page.keyboard.type('test');await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).phase==='playing');
  await page.locator('#debugToggle').click();await page.locator('#debugWeapon').selectOption('plasmaCore');await page.locator('#debugClose').click();await page.evaluate(()=>{for(const [id,value] of [['angle','85'],['power','580']]){const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}});await page.locator('#fireButton').click();
  await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).fire.label.includes('FIXAR PLASMA'));
  const before=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
  if(before.shots[0].pathLength-before.shots[0].index<40){await page.close();retries[activation]=(retries[activation]||0)+1;if(retries[activation]>5)throw new Error('No clear flight window in generated test arenas');attempt--;continue;}
  if(activation==='button')await page.locator('#fireButton').click();
  else if(activation==='space')await page.keyboard.press('Space');
  else {const box=await page.locator('#gameCanvas').boundingBox();await page.mouse.click(box.x+box.width*.5,box.y+box.height*.45);}
  await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).plasmaCores.some(c=>c.fixedAt),{},{timeout:5000});
  const state=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));const core=state.plasmaCores.find(c=>c.fixedAt);
  assert.ok(core.active);assert.ok(before.shots[0].canActivatePlasma);assert.ok(state.shots.some(shot=>shot.plasmaStopped && shot.pathLength===1 && Math.hypot(core.x-shot.x,core.y-shot.y)<30));
  assert.ok(!state.fire.enabled || !state.fire.label.includes('FIXAR PLASMA'));
  await page.screenshot({path:`${output}/${activation}.png`});await writeFile(`${output}/${activation}.json`,JSON.stringify(state,null,2));await page.close();
 }
 assert.deepEqual(errors,[]);console.log('Plasma second activation via button, Space and canvas passed without browser errors.');
}finally{await browser.close();}
