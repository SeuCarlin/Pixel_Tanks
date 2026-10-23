import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GAMEPLAY_PREVIEW_TYPES, gameplayPreviewUrl } from '../client/gameplay-preview-assets.js';
import { CARD_SECTIONS } from '../shared/card-catalog.js';

test('gameplay preview manifest contains playable recordings for real catalog cards', () => {
  for (const [section, types] of Object.entries(GAMEPLAY_PREVIEW_TYPES)) {
    for (const type of types) {
      assert.ok(CARD_SECTIONS[section]?.[type], `${section}/${type} is not a catalog card`);
      const path = fileURLToPath(new URL(`../client${gameplayPreviewUrl(type, section)}`, import.meta.url));
      assert.ok(statSync(path).size > 2000, `${section}/${type} has an empty recording`);
      const header = readFileSync(path).subarray(0, 12);
      assert.equal(header.toString('ascii', 4, 8), 'ftyp', `${section}/${type} is not MP4`);
    }
  }
  assert.equal(gameplayPreviewUrl('extraFuel', 'powerups'), null, 'uncaptured effects keep the illustration fallback');
});
