import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const destination = 'output/web-game/class-selection';
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];

try {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900, touch: false },
    { name: 'mobile-landscape', width: 844, height: 390, touch: true },
    { name: 'mobile-portrait', width: 390, height: 844, touch: true },
  ]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.touch, isMobile: viewport.touch });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${viewport.name}: ${error.message}`));
    await page.goto(process.env.QA_URL || 'http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.locator('#audioPromptSkip').click();
    if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
    await page.locator('#createForm [name="nickname"]').fill(`QA${viewport.name.slice(0, 8)}`);
    await page.locator('#createForm [type="submit"]').click();
    await page.locator('#roomScreen.active').waitFor();
    await page.locator('#arsenalButton').click();
    await page.locator('#classCatalog .class-card').first().waitFor();
    await page.locator('[data-class-type="ninja"]').click();
    const cards = await page.locator('#classCatalog .class-card').evaluateAll((elements) => elements.map((card) => ({
      name: card.querySelector('strong').textContent,
      descriptionFont: parseFloat(getComputedStyle(card.querySelector(':scope > span')).fontSize),
      overflow: card.scrollHeight - card.clientHeight,
      selected: card.classList.contains('selected'),
    })));
    if (cards.length !== 12 || cards.some((card) => card.descriptionFont < 9 || card.overflow > 2) || !cards.find((card) => card.name === 'NINJA')?.selected) errors.push(`${viewport.name}: ${JSON.stringify(cards)}`);
    await page.screenshot({ path: `${destination}/${viewport.name}.png` });
    await page.locator('#classNext').click();
    await page.locator('#arsenalLoadout:visible').waitFor();
    await page.locator('#arsenalClose').click();
    await page.waitForFunction(() => document.querySelector('#lobbyClass')?.textContent === 'NINJA');
    const textState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    if (!textState.lobbyPlayers?.some((player) => player.classType === 'ninja')) errors.push(`${viewport.name}: text state missed the confirmed class`);
    await page.screenshot({ path: `${destination}/${viewport.name}-confirmed.png` });
    await context.close();
  }
  const stale = await browser.newPage();
  stale.on('pageerror', (error) => errors.push(`stale-server: ${error.message}`));
  const origin = process.env.QA_URL || 'http://localhost:3000';
  await stale.routeWebSocket(/.*/, (socket) => setTimeout(() => socket.send(JSON.stringify({ type: 'WELCOME', payload: { message: 'Servidor antigo' } })), 50));
  await stale.goto(origin, { waitUntil: 'domcontentloaded' });
  await stale.locator('#serverMismatch:visible').waitFor();
  await stale.screenshot({ path: `${destination}/stale-server.png` });
  if (!/versões diferentes/i.test(await stale.locator('#connectionText').innerText())) errors.push('stale-server: version warning missing');
  await stale.close();
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
