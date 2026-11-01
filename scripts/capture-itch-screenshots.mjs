import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const url = process.argv[2];
if (!url) throw new Error('Pass the URL of the standalone build');
const out = 'docs/itch-media/screenshots';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => localStorage.setItem('tankTutorialSeen', '1'));
try {
  for (const [map, label] of [['hills', 'geleira'], ['highlands', 'vulcao']]) {
    await page.goto(url);
    await page.locator('#audioPromptSkip').click();
    await page.locator('#createForm [name="nickname"]').fill('Comandante');
    await page.locator('.home-advanced > summary').click();
    await page.locator('#createForm [name="mapType"]').selectOption(map);
    await page.locator('#createForm [name="seed"]').fill(`arena-${label}`);
    await page.locator('#createForm button[type="submit"]').click();
    await page.locator('#arsenalButton').click();
    await page.locator('#classCatalog [data-class-type="armored"]').click();
    await page.locator('#classNext').click();
    for (const selected of await page.locator('#arsenalCatalog .selected').all()) await selected.click();
    for (const type of ['plasmaCore', 'cryoMortar', 'waterTorpedo']) await page.locator(`#arsenalCatalog [data-arsenal="${type}"]`).click();
    if (map === 'hills') await page.screenshot({ path: `${out}/02-escolha-do-arsenal.png` });
    await page.locator('#arsenalSave').click();
    await page.locator('#startButton').click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', null, { timeout: 60000 });
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${out}/${map === 'hills' ? '01' : '04'}-combate-${label}.png` });
    await page.waitForFunction(() => !document.querySelector('#fireButton').disabled, null, { timeout: 90000 });
    await page.locator(`#arsenalWeapons [data-weapon="${map === 'hills' ? 'plasmaCore' : 'waterTorpedo'}"]`).click();
    await page.locator('#fireButton').click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).shots.length > 0);
    await page.waitForTimeout(280);
    await page.screenshot({ path: `${out}/${map === 'hills' ? '03-disparo-plasma' : '05-torpedo-triplo'}.png` });
  }
} finally { await browser.close(); }
