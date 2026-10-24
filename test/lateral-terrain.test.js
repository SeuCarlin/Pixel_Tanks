import assert from 'node:assert/strict';
import test from 'node:test';
import { WORLD } from '../shared/constants.js';
import { traceAim } from '../shared/aim-assist.js';
import { terrainSolidAt } from '../shared/terrain-solid.js';
import { carveTerrain } from '../server/terrain.js';
import { simulateShot } from '../server/physics.js';

function wall() {
  const heights = Array(WORLD.width).fill(900);
  for (let x = 200; x <= 380; x += 1) heights[x] = 400;
  return { heights, cavities: [], floatingPlatforms: [], arenaWidth: WORLD.width };
}

test('impacto lateral cria um tunel horizontal sem apagar a cobertura da parede', () => {
  const terrain = wall();
  const shot = { terrain, x: 120, y: 600, angle: 0, power: 360, gravity: 0, direction: 1 };
  const first = simulateShot(shot);
  assert.ok(first.impact.x >= 200 && first.impact.x < 210);
  const roofBefore = terrain.heights[250];
  const result = carveTerrain(terrain, first.impact.x, first.impact.y, 74);
  assert.ok(result.cavityPixels > 0);
  assert.equal(terrain.heights[250], roofBefore, 'o teto da parede continua sólido');
  assert.equal(terrainSolidAt(terrain, 250, 600), false, 'o interior da cratera é vazio');
  assert.equal(terrainSolidAt(terrain, 250, 450), true, 'a cobertura ainda bloqueia tiros altos');
  const second = simulateShot(shot);
  assert.ok(second.impact.x > first.impact.x + 55, 'o próximo tiro atravessa o novo buraco');
  const preview = traceAim({ ...shot, origin: { x: shot.x, y: shot.y }, shooterId: 'shooter', players: [], objects: [], platforms: [] });
  assert.ok(preview.x > first.impact.x + 55, 'a prévia usa a mesma colisão');
});

test('explosão na superfície ainda abre uma cratera vertical normal', () => {
  const terrain = { heights: Array(WORLD.width).fill(700), cavities: [], arenaWidth: WORLD.width };
  carveTerrain(terrain, 240, 700, 50);
  assert.ok(terrain.heights[240] >= 750);
  assert.equal(terrainSolidAt(terrain, 240, 710), false);
});

test('a colisão informa ferro, concreto, árvore e solo para o áudio', () => {
  const terrain = { heights: Array(WORLD.width).fill(900), cavities: [], floatingPlatforms: [], arenaWidth: WORLD.width };
  const launch = { terrain, x: 120, y: 600, angle: 0, power: 360, gravity: 0, direction: 1 };
  const objects = [
    { id: 'iron', type: 'sentry', x: 250, groundY: 640, width: 30, height: 80, active: true },
    { id: 'concrete', type: 'building', x: 250, groundY: 640, width: 30, height: 80, active: true },
    { id: 'wood', type: 'treeMedium', x: 250, groundY: 640, width: 50, height: 100, active: true },
  ];
  for (const object of objects) {
    const result = simulateShot({ ...launch, objects: [object] });
    assert.equal(result.impact.material, object.id);
  }
  terrain.heights.fill(500, 248, 262);
  assert.equal(simulateShot(launch).impact.material, 'earth');
});
