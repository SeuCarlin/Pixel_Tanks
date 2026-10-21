import test from 'node:test';
import assert from 'node:assert/strict';
import { ambientRainStrength, weatherVisualState } from '../shared/climate.js';
import { createGame, nextTurn, sanitizeRules, tickRoom } from '../server/game.js';

test('compatible biomes get intermittent light rain without gameplay events', () => {
  const game = { terrain: { type: 'platforms' }, seed: 'climate-check', platformEpoch: 1000, weather: null };
  const samples = Array.from({ length: 145 }, (_, index) => ambientRainStrength(game, 1000 + index * 1000));
  assert.ok(samples.some((value) => value > .2));
  assert.ok(samples.some((value) => value === 0));
  assert.ok(Math.max(...samples) <= .3);
  assert.equal(ambientRainStrength({ ...game, terrain: { type: 'canyon' } }, 21000), 0);
  assert.ok(weatherVisualState(game, 21000).rain <= .3);
});

test('storm clouds and rain fade continuously after the sequence', () => {
  const game = { terrain: { type: 'canyon' }, seed: 'dry', platformEpoch: 0, weather: { kind: 'rain', startedAt: 1000 } };
  assert.equal(weatherVisualState(game, 5000).rain, 1);
  game.weather = { kind: 'clearing', fromKind: 'rain', startedAt: 5000, endsAt: 11500 };
  const start = weatherVisualState(game, 5000);
  const middle = weatherVisualState(game, 8250);
  const end = weatherVisualState(game, 11500);
  assert.ok(start.rain > middle.rain && middle.rain > end.rain);
  assert.ok(start.cloud > middle.cloud && middle.cloud > end.cloud);
  game.weather = { kind: 'wind', startedAt: 5000, priorRain: 1 };
  assert.equal(weatherVisualState(game, 5000).rain, 1);
  assert.ok(weatherVisualState(game, 6200).rain > 0);
  assert.equal(weatherVisualState(game, 7400).rain, 0);
  game.weather = { kind: 'clearing', fromKind: 'wind', startedAt: 5000, endsAt: 11500 };
  assert.ok(weatherVisualState(game, 8250).wind > 0);
  assert.equal(weatherVisualState(game, 11500).wind, 0);
});

test('server switches expired storm to clearing, then removes it after the fade', () => {
  const room = { rules: sanitizeRules({ seed: 'climate-round', enabledEvents: [], powerupCount: 0 }), players: [{ id: 'one', nickname: 'One', color: '#fff' }, { id: 'two', nickname: 'Two', color: '#f77' }] };
  room.game = createGame(room); room.game.phase = 'playing'; room.game.weather = { kind: 'rain', startedAt: Date.now() - 5000, untilRound: 1 };
  nextTurn(room); nextTurn(room);
  assert.equal(room.game.roundNumber, 2);
  assert.equal(room.game.weather.kind, 'clearing');
  room.game.weather.endsAt = Date.now() - 1;
  tickRoom(room);
  assert.equal(room.game.weather, null);
});
