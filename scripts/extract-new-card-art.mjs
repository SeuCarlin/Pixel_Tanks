import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Crop the six approved 512px tiles from the source sheet into the game's
// established 384px square card format without adding labels or borders.
const sheet = await readFile(new URL('../client/assets/new-cards/source-sheet.png', import.meta.url));
const data = sheet.toString('base64');
const names = ['plasmaCore', 'corrosionShell', 'rescueFlare', 'ironheart', 'scoutPulse', 'overclockShell'];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 384, height: 384 }, deviceScaleFactor: 1 });
for (const [index, name] of names.entries()) {
  const x = (index % 3) * 384; const y = Math.floor(index / 3) * 384;
  await page.setContent(`<style>html,body{margin:0}#tile{position:relative;width:384px;height:384px;overflow:hidden}img{position:absolute;width:1152px;height:768px;left:-${x}px;top:-${y}px;image-rendering:pixelated}</style><div id="tile"><img src="data:image/png;base64,${data}"></div>`);
  const target = index < 3 ? new URL(`../client/assets/arsenal-v4/${name}.png`, import.meta.url) : new URL(`../client/assets/new-cards/${name}.png`, import.meta.url);
  await page.locator('#tile').screenshot({ path: fileURLToPath(target), animations: 'disabled' });
}
await browser.close();
console.log(`Extracted ${names.length} card illustrations`);
