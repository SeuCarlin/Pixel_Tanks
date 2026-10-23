import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { CARD_SECTIONS } from '../shared/card-catalog.js';

const output = 'output/web-game/library-previews';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];

async function openLibrary(page) {
  await page.goto(process.env.QA_URL || 'http://localhost:3000');
  await page.waitForTimeout(420);
  if (await page.locator('#audioPrompt').isVisible()) await page.locator('#audioPromptSkip').click();
  if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
  await page.locator('#libraryButton').click();
  assert.equal(await page.locator('#libraryModal').isVisible(), true);
}

async function preview(page, section, type, name, delayMs = 1850) {
  await page.locator(`#libraryTabs [data-library="${section}"]`).click();
  await page.locator(`[data-preview="${type}"]`).click();
  assert.equal(await page.locator('#libraryPreviewModal').isVisible(), true);
  const textState = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  assert.equal(textState.libraryPreview?.type, type);
  const recorded = textState.libraryPreview?.source === 'gameplay';
  let before;
  if (recorded) {
    await page.waitForFunction(() => document.querySelector('#libraryPreviewVideo').readyState >= 2);
    assert.equal(await page.locator('#libraryPreviewVideo').isVisible(), true);
    assert.match(await page.locator('#libraryPreviewSource').textContent(), /GRAVAÇÃO DO GAMEPLAY/);
    before = await page.locator('#libraryPreviewVideo').evaluate((video) => video.currentTime);
  } else before = await page.locator('#libraryPreviewCanvas').evaluate((canvas) => canvas.toDataURL());
  await page.waitForTimeout(delayMs);
  const after = recorded ? await page.locator('#libraryPreviewVideo').evaluate((video) => video.currentTime) : await page.locator('#libraryPreviewCanvas').evaluate((canvas) => canvas.toDataURL());
  if (recorded) assert.ok(after > before + .2, `${section}/${type} did not play footage: ${before} -> ${after}`);
  else assert.notEqual(before, after, `${section}/${type} did not animate`);
  assert.equal(await page.locator('#libraryPreviewSteps span.active').count(), 1);
  await page.locator('#libraryPreviewModal').screenshot({ path: `${output}/${name}.png` });
  if (recorded && name === 'harpoon-mobile') {
    await page.locator('#libraryPreviewVideo').evaluate((video) => { video.pause(); video.currentTime = Math.min(video.duration - .2, 2.65); });
    await page.waitForTimeout(180);
    await page.locator('#libraryPreviewModal').screenshot({ path: `${output}/harpoon-mobile-pull.png` });
    await page.locator('#libraryPreviewVideo').evaluate((video) => video.play());
  }
  await page.locator('#libraryPreviewPause').click();
  const paused = recorded ? await page.locator('#libraryPreviewVideo').evaluate((video) => video.currentTime) : await page.locator('#libraryPreviewCanvas').evaluate((canvas) => canvas.toDataURL());
  await page.waitForTimeout(180);
  const still = recorded ? await page.locator('#libraryPreviewVideo').evaluate((video) => video.currentTime) : await page.locator('#libraryPreviewCanvas').evaluate((canvas) => canvas.toDataURL());
  if (recorded) assert.ok(Math.abs(still - paused) < .1); else assert.equal(still, paused);
  await page.locator('#libraryPreviewReplay').click();
  await page.waitForFunction(() => /PAUSAR/.test(document.querySelector('#libraryPreviewPause').textContent));
  const fit = await page.locator('.library-preview-panel').evaluate((element) => ({ height: element.clientHeight, scrollHeight: element.scrollHeight, width: element.clientWidth }));
  await page.locator('#libraryPreviewClose').click();
  assert.equal(await page.locator('#libraryPreviewModal').isVisible(), false);
  return fit;
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1360, height: 850 } });
  desktop.on('pageerror', (error) => errors.push(error.message));
  desktop.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await openLibrary(desktop);
  for (const [section, definitions] of Object.entries(CARD_SECTIONS)) {
    await desktop.locator(`#libraryTabs [data-library="${section}"]`).click();
    assert.equal(await desktop.locator('#libraryGrid [data-preview]').count(), Object.keys(definitions).length, `${section} is missing preview buttons`);
  }
  await desktop.locator('#libraryTabs [data-library="powerups"]').click();
  await desktop.locator('#libraryModal').screenshot({ path: `${output}/library-grid-desktop.png` });
  await preview(desktop, 'arsenal', 'zeus', 'zeus-desktop');
  await preview(desktop, 'arsenal', 'blink', 'blink-desktop');
  await preview(desktop, 'arsenal', 'healingDrone', 'healing-drone-desktop');
  await preview(desktop, 'powerups', 'megaMissile', 'mega-bomb-desktop');
  await preview(desktop, 'powerups', 'extraFuel', 'extra-fuel-desktop');
  await preview(desktop, 'events', 'supply', 'supply-desktop');
  await preview(desktop, 'events', 'bombardment', 'bombardment-desktop');
  await preview(desktop, 'events', 'lightning', 'lightning-desktop', 3750);
  await preview(desktop, 'classes', 'specialist', 'specialist-desktop');
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  mobile.on('pageerror', (error) => errors.push(error.message));
  mobile.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await openLibrary(mobile);
  const fit = await preview(mobile, 'arsenal', 'harpoon', 'harpoon-mobile');
  assert.ok(fit.height <= 390 && fit.scrollHeight <= fit.height + 2, `preview does not fit mobile landscape: ${JSON.stringify(fit)}`);
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log('Library footage and illustrated fallback play and fit desktop/mobile landscape without page errors.');
} finally {
  await browser.close();
}
