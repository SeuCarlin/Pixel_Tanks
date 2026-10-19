import assert from 'node:assert/strict';
import test from 'node:test';
import { interpolateDrillTerrain } from '../client/drill-terrain.js';

test('furadeira revela a cratera gradualmente, acompanhando a descida', () => {
  const before = Array(320).fill(500);
  const after = before.map((height, x) => Math.abs(x - 160) < 120 ? height + 150 : height);
  const drill = { x: 160, y: 500, started: 1000, duration: 4000 };
  const start = interpolateDrillTerrain(before, after, [drill], 1000);
  const middle = interpolateDrillTerrain(before, after, [drill], 3000);
  const end = interpolateDrillTerrain(before, after, [drill], 5000);
  assert.equal(start[160], before[160]);
  assert.ok(middle[160] > start[160] && middle[160] < end[160]);
  assert.ok(middle[160] > middle[260], 'as bordas quebram depois do centro');
  assert.deepEqual(end, after);
});

test('outras alterações no terreno aparecem sem atraso', () => {
  const before = Array(320).fill(500);
  const after = [...before];
  after[10] = 560;
  after[160] = 620;
  const result = interpolateDrillTerrain(before, after, [{ x: 160, y: 500, started: 0, duration: 4000 }], 1000);
  assert.equal(result[10], 560);
  assert.ok(result[160] < 620);
});
