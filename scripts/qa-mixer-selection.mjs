import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const output = 'output/web-game/mixer-selection';
const baseUrl = process.env.QA_BASE_URL || 'http://localhost:3000/';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const [device, viewport] of Object.entries({ desktop: { width: 1280, height: 800 }, mobile: { width: 844, height: 390 }, portrait: { width: 390, height: 844 } })) {
    if (process.env.QA_DEVICE && process.env.QA_DEVICE !== device) continue;
    const page = await browser.newPage({ viewport, isMobile: device !== 'desktop', hasTouch: device !== 'desktop' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.addInitScript(() => { localStorage.setItem('tankTutorialSeen', '1'); });
      await page.goto(baseUrl);
      await page.locator('#audioPromptSkip').click();
      await page.locator('#createForm [name="nickname"]').fill(`Mix ${device}`);
      await page.locator('#createForm button[type="submit"]').click();
      await page.locator('#arsenalButton').click();
      await page.locator('#classNext').click();
      for (const weapon of ['heavy', 'jump', 'elementalFire']) await page.locator(`#arsenalCatalog [data-arsenal="${weapon}"]`).click();
      await page.locator('#arsenalSave').click();
      await page.waitForFunction(() => document.querySelector('#lobbyArsenal')?.textContent?.includes('FOGO'));
      await page.locator('#arsenalButton').click();
      await page.locator('#classNext').click();
      assert.equal((await page.locator('#arsenalSelectedCount').textContent()).trim(), '3 / 3');
      await page.locator('#arsenalCatalog [data-arsenal="mixer"]').click();
      assert.match(await page.locator('#arsenalCatalog [data-arsenal="mixer"]').getAttribute('class'), /selected/);
      assert.doesNotMatch(await page.locator('#arsenalCatalog [data-arsenal="elementalFire"]').getAttribute('class'), /selected/);
      assert.equal((await page.locator('#arsenalSelectedCount').textContent()).trim(), '3 / 3');
      assert.match(await page.locator('#arsenalLoadout .arsenal-summary span').textContent(), /MIX ocupa 1 vaga/);
      assert.equal(await page.locator('#arsenalSave').isEnabled(), true);
      await page.screenshot({ path: `${output}/${device}-selected.png`, fullPage: false });
      await page.locator('#arsenalCatalog [data-arsenal="jump"]').click();
      await page.locator('#arsenalCatalog [data-arsenal="elementalFire"]').click();
      assert.equal((await page.locator('#arsenalSelectedCount').textContent()).trim(), '3 / 3');
      assert.doesNotMatch(await page.locator('#arsenalLoadout .arsenal-summary span').textContent(), /MIX ocupa 1 vaga/);
      await page.locator('#arsenalCatalog [data-arsenal="elementalFire"]').click();
      await page.locator('#arsenalCatalog [data-arsenal="jump"]').click();
      await page.locator('#arsenalSave').click();
      await page.waitForFunction(() => document.querySelector('#lobbyArsenal')?.textContent?.includes('MIX'));
      assert.match(await page.locator('#lobbyArsenal').textContent(), /OBUS.*PULO.*MIX/);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `${output}/${device}-lobby.png`, fullPage: false });
      console.log(`${device}: Mix substitui uma das três cartas com um toque, confirma e aparece no saguão; sem erros de página`);
    } catch (error) {
      await page.screenshot({ path: `${output}/${device}-failure.png`, fullPage: false });
      const state = await page.evaluate(() => ({ activeScreen: document.querySelector('.screen.active')?.id, toast: document.querySelector('#toast')?.textContent, roomCode: document.querySelector('#roomCode')?.textContent, arsenalHidden: document.querySelector('#arsenalButton')?.hidden, gameText: window.render_game_to_text?.() }));
      console.error(`${device} failure`, state, errors);
      throw error;
    }
    await page.close();
  }
} finally {
  await browser.close();
}
