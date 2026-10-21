import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD } from '../shared/constants.js';
import { advanceFlowLake, carveFloodBasin, estimateLakeVolume, visibleWaterColumns, waterDepthAt, waterSurfaceAt } from '../shared/flood.js';
import { updateWaterPhysics } from '../server/game.js';

function terrain() { return { heights: Array(WORLD.width).fill(650), arenaWidth: 3200, floatingPlatforms: [] }; }
function mass(lake) { return lake.flowDepths.reduce((total, depth) => total + depth, 0); }
function run(ground, lake, ticks = 30) { for (let tick = 1; tick <= ticks; tick += 1) advanceFlowLake(ground, lake, 1000 + tick * 300); }

test('água sobre terreno plano se espalha lateralmente conservando seu volume', () => {
  const ground = terrain(); const lake = { x: 900, radius: 80, surfaceY: 615, fluid: true };
  advanceFlowLake(ground, lake, 1000); const initial = mass(lake);
  run(ground, lake);
  assert.ok(waterDepthAt(ground, [lake], 1000, 650, 10000) >= 8, 'water moves beyond the original radius');
  assert.ok(Math.abs(mass(lake) - initial) < .001, 'leveling water must not create or lose volume');
});

test('uma abertura no solo recebe água sem transformar o lago inteiro em drenagem instantânea', () => {
  const ground = terrain(); const lake = carveFloodBasin(ground, 900, 160, 70);
  lake.fluid = true; lake.fluidVolume = estimateLakeVolume(ground, lake);
  advanceFlowLake(ground, lake, 1000); const initial = mass(lake);
  ground.heights.fill(790, 1000, 1140);
  run(ground, lake, 25);
  assert.ok(waterDepthAt(ground, [lake], 1080, 790, 9000) >= 8, 'water fills the newly opened lower ground');
  assert.ok(Math.abs(mass(lake) - initial) < .001);
  assert.ok(lake.flowCascades.length > 0, 'the drop exposes a visible waterfall');
});

test('um buraco fora do cenário vaza água gradualmente, preservando o resto do lago', () => {
  const ground = terrain(); const lake = carveFloodBasin(ground, 900, 160, 70);
  lake.fluid = true; lake.fluidVolume = estimateLakeVolume(ground, lake);
  const game = { terrain: ground, waterZones: [lake], mines: [], objects: [], fireZones: [], players: [], roundNumber: 1 };
  updateWaterPhysics(game, 1000); const initial = mass(lake);
  ground.heights.fill(WORLD.height + 40, 1000, 1100);
  for (let tick = 1; tick <= 30; tick += 1) updateWaterPhysics(game, 1000 + tick * 300);
  assert.equal(game.waterZones.length, 1, 'the lake must not vanish when one column breaks');
  assert.ok(mass(lake) < initial && mass(lake) > 0);
  assert.ok(waterDepthAt(ground, [lake], 900, ground.heights[900], 10000) > 8);
});

test('colunas secas continuam secas após serialização da partida', () => {
  const ground = terrain(); const lake = { x: 900, radius: 80, surfaceY: 615, fluid: true };
  advanceFlowLake(ground, lake, 1000);
  const transferred = JSON.parse(JSON.stringify(lake));
  const columns = visibleWaterColumns([transferred], 800, 1000, 1000, 5);
  assert.equal(columns.surfaces[0], Infinity);
  assert.ok(Number.isFinite(columns.surfaces[(900 - columns.firstX) / columns.step]));
});

test('a bomba de propulsão drena o perfil dinâmico sem recriar o lago retangular', () => {
  const ground = terrain(); const lake = { x: 900, radius: 80, surfaceY: 615, fluid: true };
  advanceFlowLake(ground, lake, 1000); run(ground, lake, 10);
  const existing = waterSurfaceAt(lake, 4000, 900);
  lake.drainingAt = 4000;
  assert.equal(waterSurfaceAt(lake, 4000, 900), existing);
  assert.ok(waterSurfaceAt(lake, 4900, 900) > existing);
  assert.equal(waterDepthAt(ground, [lake], 900, 650, 4000 + 1800), 0);
});
