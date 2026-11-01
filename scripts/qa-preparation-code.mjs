import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const output=path.resolve('output/web-game/preparation-code');await mkdir(output,{recursive:true});
const data=await mkdtemp(path.join(output,'data-')),url=process.argv[2]||'http://127.0.0.1:3418';
const server=process.argv[2]?null:spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:'3418',TANKDOTS_DATA_DIR:data},stdio:'ignore',windowsHide:true});
const browser=await chromium.launch({headless:true});
try {
  if(server)for(let i=0;i<60;i++){try{if((await fetch(`${url}/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('tankTutorialSeen','1'));
  await page.goto(url);await page.locator('#audioPromptSkip').click();
  await page.keyboard.type('ALLFREE');
  await page.locator('#createForm [name="nickname"]').fill('Secret QA');
  await page.locator('#createForm [name="botCount"]').selectOption('0');
  await page.locator('#createForm button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#roomScreen').classList.contains('active'));
  await page.keyboard.type('ALLFREE');
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('ALLFREE'));
  await page.locator('#arsenalButton').click();
  assert.equal(await page.locator('#classCatalog [data-class-type="ninja"]').isDisabled(),false);
  assert.equal(await page.locator('#classCatalog [data-class-type="meteorologist"]').isDisabled(),false);
  await page.screenshot({path:path.join(output,'all-classes.png')});
  await page.locator('#classCatalog [data-class-type="ninja"]').click();await page.locator('#classNext').click();
  assert.equal(await page.locator('#arsenalCatalog [data-arsenal="plasmaCore"]').isDisabled(),false);
  for(const type of ['plasmaCore','cryoMortar','waterTorpedo'])await page.locator(`#arsenalCatalog [data-arsenal="${type}"]`).click();
  await page.locator('#arsenalSave').click();
  await page.screenshot({path:path.join(output,'prepared.png')});
  assert.deepEqual(errors,[]);console.log('ALLFREE keyboard sequence, unlocked class and arsenal preparation passed.');
} finally {await browser.close();server?.kill();}
