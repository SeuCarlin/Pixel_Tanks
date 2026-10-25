// Rebuild the compact, deterministic blast samples used by desktop and mobile.
import { writeFile } from 'node:fs/promises';
import { wavBlob } from '../client/mobile-audio.js';

const impactKinds = ['explosion', 'explosion-dry', 'explosion-rolling', 'explosion-heavy',
  'explosion-mega', 'explosion-fireworks', 'bombardment-hit-v2'];
for (const kind of impactKinds) {
  const bytes = Buffer.from(await wavBlob(kind).arrayBuffer());
  await writeFile(new URL(`../client/sounds/${kind}.wav`, import.meta.url), bytes);
  process.stdout.write(`${kind}: ${bytes.length} bytes\n`);
}
