import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.QA_URL || 'http://localhost:3001';
const browser = await chromium.launch({ headless: true });
const errors = [];
await mkdir('output/web-game/engineer', { recursive: true });
try {
  for (const [name, viewport, mobile] of [
    ['desktop', { width: 1440, height: 900 }, false],
    ['mobile-landscape', { width: 844, height: 390 }, true],
  ]) {
    const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile });
    page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`));
    await page.goto(url);
    await page.locator('#audioPromptSkip').click();
    if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
    await page.locator('#libraryButton').click();
    await page.locator('#libraryTabs [data-library="classes"]').click();
    const engineer = page.locator('.library-card').filter({ has: page.locator('h3').filter({ hasText: 'ENGENHEIRO' }) });
    assert.ok(await engineer.isVisible());
    assert.match(await engineer.locator('.atlas-art').evaluate((node) => getComputedStyle(node).backgroundImage), /engineer-class-v1\.png/);
    const incendiary = page.locator('.library-card').filter({ has: page.locator('h3').filter({ hasText: 'INCENDIÁRIO' }) });
    assert.ok(await incendiary.isVisible());
    assert.match(await incendiary.locator('.atlas-art').evaluate((node) => getComputedStyle(node).backgroundImage), /incendiary-class-v1\.png/);
    await page.locator('#libraryTabs [data-library="powerups"]').click();
    const kit = page.locator('.library-card').filter({ has: page.locator('h3').filter({ hasText: 'KIT DE REPAROS' }) });
    assert.ok(await kit.isVisible());
    assert.match(await kit.locator('.atlas-art').evaluate((node) => getComputedStyle(node).backgroundImage), /field-repair-card-v1\.png/);
    await page.locator('#librarySearch').fill('Kit de Reparos');
    await page.screenshot({ path: `output/web-game/engineer/${name}-library.png` });
    await page.locator('#librarySearch').fill('Espuma de Combate');
    const foam = page.locator('.library-card').filter({ has: page.locator('h3').filter({ hasText: 'ESPUMA DE COMBATE' }) });
    assert.ok(await foam.isVisible());
    assert.match(await foam.locator('.atlas-art').evaluate((node) => getComputedStyle(node).backgroundImage), /fire-foam-card-v1\.png/);
    await page.screenshot({ path: `output/web-game/engineer/${name}-foam.png` });
    await page.locator('#libraryClose').click();
    await page.locator('#createForm [name="nickname"]').fill(`QA ${name}`);
    await page.locator('#createForm [name="maxPlayers"]').selectOption('2');
    await page.locator('#createForm [name="botCount"]').selectOption('1');
    await page.locator('#createForm .primary[type="submit"]').click();
    await page.locator('#arsenalButton').click();
    const classType = mobile ? 'incendiary' : 'engineer';
    const classImage = mobile ? 'incendiary-class-v1.png' : 'engineer-class-v1.png';
    await page.locator(`#classCatalog [data-class-type="${classType}"]`).click();
    assert.match(await page.locator(`#classCatalog [data-class-type="${classType}"] .class-art`).evaluate((node) => getComputedStyle(node).backgroundImage), new RegExp(classImage.replace('.', '\\.')));
    if (mobile) {
      const classLayout = await page.locator('#classConfig').evaluate((node) => ({ scroll: node.scrollHeight, client: node.clientHeight }));
      assert.ok(classLayout.scroll <= classLayout.client + 2, `mobile class grid overflow: ${JSON.stringify(classLayout)}`);
    }
    await page.screenshot({ path: `output/web-game/engineer/${name}-class.png` });
    const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    assert.equal(state.screen, 'roomScreen');
    if (!mobile) {
      await page.locator('#classNext').click();
      await page.locator('#arsenalCatalog [data-arsenal]').first().waitFor();
      const cards = page.locator('#arsenalCatalog [data-arsenal]');
      for (let index = 0; index < 3; index += 1) await cards.nth(index).click();
      await page.locator('#arsenalSave').click();
      await page.locator('#startButton').click();
      await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', null, { timeout: 18000 });
      const battle = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
      const self = battle.players.find((player) => player.id === battle.localPlayerId);
      assert.equal(self.classType, 'engineer');
      assert.ok(battle.arsenal.available.some((weapon) => weapon.type === 'sentry'));
      await page.screenshot({ path: 'output/web-game/engineer/desktop-battle.png' });
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(JSON.stringify({ checked: ['library', 'lobby-class', 'battle-arsenal', 'desktop', 'mobile-landscape'], errors }));
} finally {
  await browser.close();
}
