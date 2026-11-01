import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright';
import { AccountStore } from '../server/accounts.js';
const output=path.resolve('output/web-game/progression');await mkdir(output,{recursive:true});
const data=await mkdtemp(path.join(output,'data-')),store=new AccountStore(path.join(data,'accounts.json'));
const username='ProgressPreview',password='QA-only-password-123';
const {token}=store.register(username,password),account=store.accountForToken(token);
account.progression={xp:0,balance:2400,owned:[]};store.save();
const port=Number(process.env.QA_PORT)||3417,url=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:String(port),TANKDOTS_DATA_DIR:data},stdio:'ignore',windowsHide:true});
const browser=await chromium.launch({headless:true}),errors=[];
try{
  for(let i=0;i<60;i++){try{if((await fetch(`${url}/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const contexts=await Promise.all([browser.newContext({viewport:{width:1440,height:900}}),browser.newContext({viewport:{width:1280,height:800}})]);
  for(const context of contexts)await context.addInitScript(()=>localStorage.setItem('tankTutorialSeen','1'));
  const pages=await Promise.all(contexts.map(c=>c.newPage()));
  for(const page of pages){page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.locator('#audioPromptSkip').click();}
  const [page,guest]=pages;
  await page.locator('#accountButton').click();await page.locator('#accountForm [name="username"]').fill(username);await page.locator('#accountForm [name="password"]').fill(password);await page.locator('#accountSubmit').click();
  await page.waitForFunction(()=>!document.querySelector('#accountProfile').hidden);await page.locator('#accountClose').click();
  await page.locator('#progressionButton').click();await page.locator('[data-card-id="class:ninja"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:`${output}/tree-before.png`});
  await page.locator('[data-filter="class"]').click();
  await page.locator('[data-filter="class"][aria-pressed="true"]').waitFor();
  assert.equal(await page.locator('.achievement-node[data-card-id^="arsenal:"]:visible').count(),0);
  assert.equal(await page.locator('.achievement-node[data-card-id^="class:"]:visible').count(),8);
  await page.locator('[data-filter="owned"]').click();
  await page.locator('[data-filter="owned"][aria-pressed="true"]').waitFor();
  assert.equal(await page.locator('.achievement-node:visible').count(),0);
  await page.locator('[data-filter="all"]').click();
  await page.locator('[data-filter="all"][aria-pressed="true"]').waitFor();
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-card-id="class:incendiary"]').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('.progression-panel').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  await page.screenshot({path:`${output}/tree-mobile.png`});
  await page.setViewportSize({width:1440,height:900});
  await page.locator('[data-unlock="class:ninja"]').click();await page.waitForFunction(()=>document.querySelector('[data-card-id="class:ninja"]').classList.contains('unlocked'));
  await page.screenshot({path:`${output}/tree-unlocked.png`});await page.locator('#progressionModal [data-close]').click();
  await page.locator('#createForm [name="nickname"]').fill('Conta QA');await page.locator('#createForm [name="botCount"]').selectOption('0');
  await page.locator('.home-advanced>summary').click();await page.locator('#createForm [name="roundLimit"]').selectOption('10');await page.locator('#createForm [name="mapType"]').selectOption('plains');
  await page.locator('#createForm input[name="enabledEvents"]').evaluateAll(inputs=>inputs.forEach(i=>i.checked=false));
  await page.locator('#createForm button[type="submit"]').click();await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).room);
  const code=await page.evaluate(()=>JSON.parse(window.render_game_to_text()).room);
  await guest.locator('[data-tab="join"]').click();await guest.locator('#joinForm [name="nickname"]').fill('Visitante');await guest.locator('#joinForm [name="code"]').fill(code);await guest.locator('#joinForm button[type="submit"]').click();
  for(const [i,p] of pages.entries()){
    await p.locator('#arsenalButton').click();assert.equal(await p.locator('#classCatalog [data-class-type="meteorologist"]').isDisabled(),true);
    await p.locator(`#classCatalog [data-class-type="${i?'armored':'ninja'}"]`).click();await p.locator('#classNext').click();
    for(const type of ['heavy','cluster','jump'])await p.locator(`#arsenalCatalog [data-arsenal="${type}"]`).click();
    await p.locator('#arsenalSave').click();await p.locator('#startButton').click();
  }
  await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).phase==='playing',null,{timeout:60000});
  for(let step=0;step<30;step++){
    const s=await page.evaluate(()=>JSON.parse(window.render_game_to_text()));if(s.phase==='finished')break;
    const actor=s.currentPlayerId===s.localPlayerId?page:guest;
    await actor.locator('#passButton').click();
    await page.waitForFunction(turn=>{const s=JSON.parse(window.render_game_to_text());return s.turn!==turn||s.phase==='finished';},s.turn,{timeout:30000});
  }
  await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).phase==='finished');
  const profile=await (await fetch(`${url}/api/account/me`,{headers:{Authorization:`Bearer ${token}`}})).json();
  assert.equal(profile.progression.balance,1040);assert.ok(profile.progression.xp>=50);assert.ok(profile.progression.classes.includes('ninja'));
  assert.equal(profile.totals.matches,1);assert.deepEqual(errors,[]);
  await page.waitForFunction(()=>document.querySelector('#resultScreen').classList.contains('active'),null,{timeout:30000});
  assert.ok((await page.locator('#matchRecords').textContent()).includes('Battle Dots'));
  await page.screenshot({path:`${output}/online-result.png`});
  console.log(JSON.stringify({passed:true,matches:profile.totals.matches,balance:profile.progression.balance,xp:profile.progression.xp}));
}finally{await browser.close();server.kill();}
