import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const destination = 'output/web-game/card-layout';
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const failures = [];
const results = [];

try {
  for (const { name, width, height } of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile-landscape', width: 844, height: 390 },
    { name: 'mobile-portrait', width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`${name}: ${message.text()}`);
    });
    await page.goto(process.env.QA_URL || 'http://localhost:3001', { waitUntil: 'domcontentloaded' });
    await page.locator('#audioPrompt').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#audioPromptSkip').click();
    if (await page.locator('#tutorialModal').isVisible()) await page.locator('#tutorialClose').click();
    await page.locator('#libraryButton').click();

    for (const section of ['powerups', 'arsenal', 'events', 'classes']) {
      await page.locator(`[data-library="${section}"]`).click();
      const cards = await page.locator('.library-card').evaluateAll((elements) => elements.map((card) => {
        const bounds = card.getBoundingClientRect();
        const button = card.querySelector('.library-compare-button');
        const stats = card.querySelector('.card-stats');
        const buttonBounds = button.getBoundingClientRect();
        const statsBounds = stats.getBoundingClientRect();
        return {
          title: card.querySelector('h3')?.textContent,
          height: Math.round(bounds.height),
          overflow: card.scrollHeight - card.clientHeight,
          clippedButton: buttonBounds.bottom > bounds.bottom - 3 || buttonBounds.top < bounds.top,
          clippedStats: statsBounds.bottom > bounds.bottom - 3 || statsBounds.bottom > buttonBounds.top,
        };
      }));
      results.push({ viewport: name, section, count: cards.length, cards });
      for (const card of cards) {
        if (card.overflow > 2 || card.clippedButton || card.clippedStats) {
          failures.push(`${name}/${section}/${card.title}: ${JSON.stringify(card)}`);
        }
      }
      await page.screenshot({ path: `${destination}/${name}-${section}.png` });
      if (section === 'powerups') {
        await page.locator('.library-card').nth(5).scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${destination}/${name}-powerups-second-row.png` });
        const compare = page.locator('.library-card').nth(5).locator('.library-compare-button');
        await compare.click();
        if (await page.locator('#libraryCompare').isHidden()) failures.push(`${name}: compare panel did not open`);
      }
    }
    await page.close();
  }
  await writeFile(`${destination}/layout.json`, JSON.stringify(results, null, 2));
  await writeFile(`${destination}/errors.json`, JSON.stringify(errors, null, 2));
  if (failures.length || errors.length) throw new Error([...failures, ...errors].join('\n'));
} finally {
  await browser.close();
}
