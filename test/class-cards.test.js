import assert from 'node:assert/strict';
import test from 'node:test';
import { CLASS_DEFS } from '../shared/constants.js';
import { classCardStats, conciseCardDescription } from '../shared/card-catalog.js';

test('todas as classes têm resumo curto e dois destaques legíveis', () => {
  for (const [type, info] of Object.entries(CLASS_DEFS)) {
    const summary = conciseCardDescription(type, info, 'classes');
    const facts = classCardStats(type);
    assert.ok(summary.length <= 95, `${type}: descrição longa demais`);
    assert.equal(facts.length, 2);
    assert.ok(facts.every((fact) => fact !== '—' && fact.length <= 26), `${type}: destaque ausente`);
  }
});

test('a carta do Anfíbio informa a cura aplicada por rodada na água', () => {
  assert.match(CLASS_DEFS.amphibian.description, /30 HP por rodada na água/);
  assert.match(conciseCardDescription('amphibian', CLASS_DEFS.amphibian, 'classes'), /30 HP por rodada na água/);
  assert.match(classCardStats('amphibian')[0], /30 HP \/ ROD\. NA ÁGUA/);
});
