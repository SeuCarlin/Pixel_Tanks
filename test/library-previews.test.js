import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_SECTIONS } from '../shared/card-catalog.js';
import { PREVIEW_SCENES, previewDefinition } from '../client/library-previews.js';

test('every library card has an animated, three-stage demonstration', () => {
  const allTypes = new Set();
  for (const [section, definitions] of Object.entries(CARD_SECTIONS)) {
    for (const type of Object.keys(definitions)) {
      allTypes.add(type);
      const preview = previewDefinition(type, section);
      assert.ok(preview, `${section}/${type} needs a preview`);
      assert.equal(preview.type, type);
      assert.equal(preview.section, section);
      assert.equal(preview.phases.length, 3);
      assert.ok(preview.phases.every((phase) => phase.length > 3));
      assert.ok(preview.duration >= 4000);
    }
  }
  assert.deepEqual(new Set(Object.keys(PREVIEW_SCENES)), allTypes);
  assert.equal(previewDefinition('unknown', 'arsenal'), null);
});
