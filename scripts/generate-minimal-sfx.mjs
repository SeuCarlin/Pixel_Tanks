// Regenerate only the synthesized effects that have no user-provided source.
// Imported battle sounds are rebuilt by import-local-sfx.py instead.
import { writeFile } from 'node:fs/promises';
import { SOUND_PRESETS, wavBlob } from '../client/mobile-audio.js';

const original = new Set(`cloak-up defeat eagle electric explosion-fireworks explosion-heavy explosion-mega explosion heavy launch move music pickup power ready shield-up shot-ap shot-cluster shot-cryo shot-deploy shot-drone shot-fireworks shot-flame shot-gravity shot-grenade shot-harpoon shot-hunter shot-laser shot-mega shot-mole shot-seismic shot-soap shot-vertical shot thunder turn ui victory vortex-deflect vortex-fire vortex warning`.split(' '));
const generatedAmbient = new Set('ambient-breeze ambient-rain ambient-snow ambient-ice ambient-fire ambient-waterfall'.split(' '));
// These WAVs are imported from user-supplied MP3 files by import-local-sfx.py.
const imported = new Set('meteor water-mine explosion-heavy bombardment-impact water-splash shot-elemental-water sentry-burst shot-tesla shot-zeus shot-laser shot shot-grenade explosion-dry explosion-rolling bombardment-hit-v2 explosion bombardment-strike shot-flame heavy shot-elemental-earth impact-earth impact-ice shot-mega shot-kinetic shot-ap shot-gravity quake-impact shot-cluster explosion-mega laser-impact'.split(' '));
const selected = process.argv.slice(2);
for (const kind of selected.length ? selected : Object.keys(SOUND_PRESETS).filter((name) => !original.has(name) && !generatedAmbient.has(name) && !imported.has(name))) {
  if (!(kind in SOUND_PRESETS)) throw new Error(`Unknown sound: ${kind}`);
  if (generatedAmbient.has(kind)) throw new Error(`Use generate-ambient-sfx.mjs for ${kind}`);
  if (imported.has(kind)) throw new Error(`Use import-local-sfx.py for ${kind}`);
  if (original.has(kind)) throw new Error(`Original sound ${kind} must remain from commit 5189e03`);
  const bytes = Buffer.from(await wavBlob(kind).arrayBuffer());
  await writeFile(new URL(`../client/sounds/${kind}.wav`, import.meta.url), bytes);
  process.stdout.write(`${kind}: ${bytes.length} bytes\n`);
}
