import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'output/web-game/team-lobby-hud';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  for (const viewport of [
    { name: 'desktop', width: 1366, height: 900, mobile: false },
    { name: 'mobile-landscape', width: 844, height: 390, mobile: true },
  ]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.mobile, isMobile: viewport.mobile });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${viewport.name}: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`${viewport.name}: ${message.text()}`); });
    await page.goto(process.env.QA_URL || 'http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.locator('#audioPromptSkip').click();
    if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
    await page.locator('#createForm [name="nickname"]').fill(`QA${viewport.name.slice(0, 7)}`);
    await page.locator('#createForm [name="gameMode"]').selectOption('teams');
    await page.locator('#createForm [name="maxPlayers"]').selectOption('6');
    await page.locator('#createForm [name="botCount"]').selectOption('5');
    await page.locator('#friendlyFireField .switch').click();
    await page.locator('#createForm button[type="submit"]').click();
    await page.locator('#roomScreen.active').waitFor();
    await page.locator('#roster .player-card').first().waitFor();
    const lobby = await page.evaluate(() => ({
      state: JSON.parse(window.render_game_to_text()),
      classArts: [...document.querySelectorAll('#roster .lobby-class-art>.atlas-classes')].length,
      arsenalArts: [...document.querySelectorAll('#roster .lobby-arsenal-art>.atlas-arsenal')].length,
      settings: document.querySelector('#rulesList').textContent,
    }));
    if (lobby.state.lobbyPlayers?.length !== 6 || lobby.classArts !== 5 || lobby.arsenalArts !== 15 || !lobby.settings.includes('ATIVADO')) errors.push(`${viewport.name}: lobby mismatch ${JSON.stringify(lobby)}`);
    await page.screenshot({ path: `${output}/${viewport.name}-lobby.png`, fullPage: true });
    await page.locator('#arsenalButton').click();
    await page.locator('[data-class-type="healer"]').click();
    await page.locator('#classNext').click();
    for (const type of ['heavy', 'jump', 'zeus']) await page.locator(`#arsenalCatalog [data-arsenal="${type}"]`).click();
    await page.locator('#arsenalSave').click();
    await page.locator('#startButton').click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'playing', null, { timeout: 20000 });
    await page.locator('#hudClassButton').click();
    if (!await page.locator('#classInfoPanel').isVisible() || !await page.locator('#classInfoDescription').textContent().then((value) => value.includes('Recupera'))) errors.push(`${viewport.name}: class consultation missing`);
    if (viewport.mobile && await page.locator('#hudClassButton span').evaluate((element) => getComputedStyle(element).display) !== 'none') errors.push(`${viewport.name}: HUD class button label was not compacted`);
    const panel = await page.locator('#classInfoPanel').boundingBox();
    if (!panel || panel.x < 0 || panel.y < 0 || panel.x + panel.width > viewport.width + 2) errors.push(`${viewport.name}: panel out of bounds ${JSON.stringify(panel)}`);
    await page.screenshot({ path: `${output}/${viewport.name}-class-hud.png`, fullPage: true });
    await page.locator('#classInfoClose').click();
    if (await page.locator('#classInfoPanel').isVisible()) errors.push(`${viewport.name}: class panel did not close`);
    await page.locator('#scoreStrip .score-player').nth(1).click();
    if (!await page.locator('#classInfoName').textContent().then((value) => value.includes('BLINDADO'))) errors.push(`${viewport.name}: teammate class consultation missing`);
    await page.locator('#classInfoClose').click();
    await context.close();
  }
  await writeFile(`${output}/errors.json`, JSON.stringify(errors, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
