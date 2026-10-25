// Regenerate only the sounds added after the original minimalist sound pack.
// The 42 original WAVs are restored from commit 5189e03 and kept unchanged.
import { writeFile } from 'node:fs/promises';
import { SOUND_PRESETS, wavBlob } from '../client/mobile-audio.js';

const original = new Set(`cloak-up defeat eagle electric explosion-fireworks explosion-heavy explosion-mega explosion heavy launch move music pickup power ready shield-up shot-ap shot-cluster shot-cryo shot-deploy shot-drone shot-fireworks shot-flame shot-gravity shot-grenade shot-harpoon shot-hunter shot-laser shot-mega shot-mole shot-seismic shot-soap shot-vertical shot thunder turn ui victory vortex-deflect vortex-fire vortex warning`.split(' '));
const selected = process.argv.slice(2);
for (const kind of selected.length ? selected : Object.keys(SOUND_PRESETS).filter((name) => !original.has(name))) {
  if (!(kind in SOUND_PRESETS)) throw new Error(`Unknown sound: ${kind}`);
  if (original.has(kind)) throw new Error(`Original sound ${kind} must remain from commit 5189e03`);
  const bytes = Buffer.from(await wavBlob(kind).arrayBuffer());
  await writeFile(new URL(`../client/sounds/${kind}.wav`, import.meta.url), bytes);
  process.stdout.write(`${kind}: ${bytes.length} bytes\n`);
}
