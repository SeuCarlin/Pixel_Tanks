import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  for (const viewport of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.name === 'mobile', isMobile: viewport.name === 'mobile' });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${viewport.name}: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`${viewport.name}: ${message.text()}`); });
    await page.goto(process.env.QA_URL || 'http://localhost:3100', { waitUntil: 'domcontentloaded' });
    await page.locator('#audioPromptSkip').click();
    if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
    await page.locator('#createForm [name="nickname"]').fill(`Mapa${viewport.name}`);
    await page.locator('#createForm [name="botCount"]').selectOption('1');
    await page.locator('#createForm button[type="submit"]').click();
    await page.locator('#roomScreen.active').waitFor();
    const button = page.locator('#rerollScenarioButton');
    if (!await button.isVisible() || !await button.isEnabled()) errors.push(`${viewport.name}: botão de sorteio não disponível`);
    let before = await page.locator('#scenarioName').textContent();
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await button.click();
      await page.waitForFunction((count) => document.querySelector('#rerollScenarioButton')?.textContent?.includes(`↻ ${count}`), attempt);
      if (!await button.isEnabled()) errors.push(`${viewport.name}: sorteio travou após ${attempt} tentativas`);
      const after = await page.locator('#scenarioName').textContent();
      if (before === after) errors.push(`${viewport.name}: bioma não mudou na tentativa ${attempt}`);
      before = after;
    }
    const layout = await page.evaluate(() => ({
      button: document.querySelector('#rerollScenarioButton').getBoundingClientRect().toJSON(),
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      state: JSON.parse(window.render_game_to_text()).scenario,
    }));
    if (layout.button.right > layout.viewportWidth + 1 || layout.scrollWidth > layout.viewportWidth + 1) errors.push(`${viewport.name}: layout excede a largura da tela`);
    if (layout.state?.type == null) errors.push(`${viewport.name}: cenário ausente do estado de teste`);
    await page.screenshot({ path: `output/web-game/pulse-vortex-reroll/${viewport.name}-lobby.png`, fullPage: true });
    await context.close();
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Reroll desktop/mobile: quatro novos cenários consecutivos, sem erros de página.');
} finally { await browser.close(); }
