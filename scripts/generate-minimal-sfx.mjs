// Regenerate only the sounds added after the original minimalist sound pack.
// Most original minimalist WAVs remain; blast assets are maintained by
// generate-impact-sfx.mjs so surface impacts never sound like a quiet tick.
import { writeFile } from 'node:fs/promises';
import { SOUND_PRESETS, wavBlob } from '../client/mobile-audio.js';

const original = new Set(`cloak-up defeat eagle electric explosion-fireworks explosion-heavy explosion-mega explosion heavy launch move music pickup power ready shield-up shot-ap shot-cluster shot-cryo shot-deploy shot-drone shot-fireworks shot-flame shot-gravity shot-grenade shot-harpoon shot-hunter shot-laser shot-mega shot-mole shot-seismic shot-soap shot-vertical shot thunder turn ui victory vortex-deflect vortex-fire vortex warning`.split(' '));
const generatedAmbient = new Set('ambient-breeze ambient-rain ambient-snow ambient-ice ambient-fire ambient-waterfall'.split(' '));
const selected = process.argv.slice(2);
for (const kind of selected.length ? selected : Object.keys(SOUND_PRESETS).filter((name) => !original.has(name) && !generatedAmbient.has(name))) {
  if (!(kind in SOUND_PRESETS)) throw new Error(`Unknown sound: ${kind}`);
  if (generatedAmbient.has(kind)) throw new Error(`Use generate-ambient-sfx.mjs for ${kind}`);
  if (original.has(kind)) throw new Error(`Original sound ${kind} must remain from commit 5189e03`);
  const bytes = Buffer.from(await wavBlob(kind).arrayBuffer());
  await writeFile(new URL(`../client/sounds/${kind}.wav`, import.meta.url), bytes);
  process.stdout.write(`${kind}: ${bytes.length} bytes\n`);
}
