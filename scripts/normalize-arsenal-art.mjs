import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { ARSENAL_ITEMS } from '../shared/constants.js';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const requested = process.argv.slice(2);
const types = requested.length ? requested.filter((type) => ARSENAL_ITEMS.includes(type)) : ARSENAL_ITEMS;
let totalBytes = 0;
try {
  for (const type of types) {
    const path = new URL(`../client/assets/arsenal-v4/${type}.png`, import.meta.url);
    const source = await readFile(path);
    const dataUrl = `data:image/png;base64,${source.toString('base64')}`;
    const output = await page.evaluate(async (url) => {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 320;
      const context = canvas.getContext('2d'); context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, 320, 320);
      return canvas.toDataURL('image/png').split(',')[1];
    }, dataUrl);
    const bytes = Buffer.from(output, 'base64');
    await writeFile(path, bytes); totalBytes += bytes.length;
  }
  process.stdout.write(`Normalized ${types.length} arsenal images to 320px (${(totalBytes / 1048576).toFixed(1)} MiB total).\n`);
} finally { await browser.close(); }
