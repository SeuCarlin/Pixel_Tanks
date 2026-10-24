import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const output = 'output/web-game/mixer-selection';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const [device, viewport] of Object.entries({ desktop: { width: 1280, height: 800 }, mobile: { width: 844, height: 390 } })) {
    const page = await browser.newPage({ viewport, isMobile: device === 'mobile', hasTouch: device === 'mobile' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => { localStorage.setItem('tankTutorialSeen', '1'); });
    await page.goto('http://localhost:3000/');
    await page.locator('#audioPromptSkip').click();
    await page.locator('#createForm [name="nickname"]').fill(`Mix ${device}`);
    await page.locator('#createForm button[type="submit"]').click();
    await page.locator('#arsenalButton').click();
    await page.locator('#classNext').click();
    for (const weapon of ['heavy', 'jump', 'mixer']) await page.locator(`#arsenalCatalog [data-arsenal="${weapon}"]`).click();
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
    console.log(`${device}: Mix ocupa 1/3, confirma e aparece no saguão; sem erros de página`);
    await page.close();
  }
} finally {
  await browser.close();
}
