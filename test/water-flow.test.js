import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD } from '../shared/constants.js';
import { advanceFlowLake, carveFloodBasin, disturbWaterAt, ensureAirPockets, estimateLakeVolume, visibleWaterColumns, waterDepthAt, waterSurfaceAt } from '../shared/flood.js';
import { applyExplosion } from '../server/physics.js';
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

test('impacto submerso desloca água para cristas sem criar volume', () => {
  const ground = terrain(); const lake = { x: 900, radius: 120, surfaceY: 610, fluid: true };
  advanceFlowLake(ground, lake, 1000);
  const before = mass(lake); const center = Math.round((900 - lake.flowStart) / 8);
  const centerBefore = lake.flowDepths[center];
  assert.equal(disturbWaterAt(ground, [lake], 900, 630, { radius: 80, strength: 30, kind: 'explosion' }, 1100), true);
  assert.ok(lake.flowDepths[center] < centerBefore);
  assert.ok(lake.flowDepths[center + 3] > centerBefore);
  assert.ok(Math.abs(mass(lake) - before) < .001);
  assert.equal(lake.surfaceImpacts[0].kind, 'explosion');
  run(ground, lake, 12);
  assert.ok(Math.abs(mass(lake) - before) < .001);
  assert.equal(lake.surfaceImpacts.length, 0, 'visual wave expires after settling');
});

test('explosão no lago gera onda; explosão em terra seca não gera', () => {
  const ground = terrain(); const lake = { x: 900, radius: 120, surfaceY: 610, fluid: true };
  const game = { terrain: ground, waterZones: [lake], players: [], powerups: [], objects: [], mines: [], fireZones: [] };
  applyExplosion(game, 900, 625, 45, 40, { noTerrain: true });
  assert.equal(lake.surfaceImpacts.length, 1);
  applyExplosion(game, 1500, 625, 45, 40, { noTerrain: true });
  assert.equal(lake.surfaceImpacts.length, 1);
});

test('bolsão de ar ergue o tanque submerso e o lança para fora da superfície', () => {
  const ground = terrain(); const lake = { id: 'air-test', x: 900, radius: 120, surfaceY: 610, fluid: true };
  advanceFlowLake(ground, lake, 1000);
  assert.equal(ensureAirPockets(ground, lake, 1000), true);
  assert.equal(ensureAirPockets(ground, lake, 1000), false, 'pocket position remains stable');
  const player = { id: 'swimmer', alive: true, classType: null, x: lake.airPockets[0].x, y: 639, swimming: false, supportPlatformId: null, airborne: null };
  const game = { terrain: ground, waterZones: [lake], players: [player], mines: [], objects: [], fireZones: [], roundNumber: 1 };
  for (let step = 0; step < 10 && !player.airborne; step += 1) updateWaterPhysics(game, 1000 + step * 200);
  assert.ok(player.airborne?.fromAirPocket);
  assert.ok(player.airborne.vy < -150);
  assert.ok(player.lastAirPocketBurst?.serial);
});
