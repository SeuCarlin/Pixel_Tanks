import test from 'node:test';
import assert from 'node:assert/strict';
import { applyArenaPulse, createGame, fire, sanitizeRules, tickRoom, updateWindVortices } from '../server/game.js';
import { SELECTABLE_ARSENAL_ITEMS, WEAPON_BALANCE, WORLD } from '../shared/constants.js';
import { deflectProjectile } from '../shared/wind-vortex.js';
import { atlasStyle } from '../shared/card-art.js';

function room(seed = 'tornado-test') {
  const match = { rules: sanitizeRules({ seed, mapType: 'flat', powerupCount: 0, enabledEvents: ['gale'] }), players: [
    { id: 'one', nickname: 'One', arsenal: ['windPlate', 'heavy', 'jump'] },
    { id: 'two', nickname: 'Two', arsenal: ['windPlate', 'heavy', 'jump'] },
  ] };
  match.game = createGame(match);
  Object.assign(match.game, { phase: 'playing', roundNumber: 2, turnNumber: 3, turnIndex: 0, openingRestrictionsActive: false, objects: [], mines: [], powerups: [] });
  match.game.terrain.heights.fill(700); match.game.terrain.floatingPlatforms = [];
  match.game.players[0].x = 500; match.game.players[0].y = 700 - WORLD.tankRadius;
  match.game.players[1].x = 1300; match.game.players[1].y = 700 - WORLD.tankRadius;
  match.game.players[0].ammo.windPlate = 1;
  return match;
}

test('Placa Tornado é selecionável, tem arte própria e só ativa ao pousar', () => {
  assert.ok(SELECTABLE_ARSENAL_ITEMS.includes('windPlate'));
  assert.match(atlasStyle('windPlate', 'arsenal'), /arsenal-v4\/windPlate\.png/);
  assert.match(atlasStyle('flora', 'events'), /flora-event-v1\.png/);
  const match = room();
  const [shot] = fire(match, 'one', { weapon: 'windPlate', angle: 35, power: 300, direction: 1 });
  const vortex = match.game.windVortices[0];
  assert.ok(shot.noExplosion && shot.impact);
  assert.equal(vortex.source, 'windPlate');
  assert.equal(vortex.x, shot.impact.x);
  assert.equal(vortex.height, WEAPON_BALANCE.windPlate.height);
  assert.equal(vortex.width, WEAPON_BALANCE.windPlate.width);
  assert.equal(vortex.expiresRound, 3);
  assert.ok(vortex.appearsAt > Date.now());
  const incoming = deflectProjectile([vortex], vortex.x, vortex.y - 100, 100, 0, .1, vortex.appearsAt - 1);
  assert.equal(incoming.vy, 0);
  const lifted = deflectProjectile([vortex], vortex.x, vortex.y - 100, 100, 0, .1, vortex.appearsAt + 1);
  assert.ok(lifted.vy < 0);
  match.game.objects = [{ id: 'loose-barrel', type: 'barrel', x: vortex.x + 20, y: 680, groundY: 700, width: 28, height: 30, active: true }];
  match.game.powerups = [{ id: 'loose-pickup', type: 'heal', x: vortex.x + 15, y: 680, active: true, revealed: true }];
  match.game.wind = 26;
  updateWindVortices(match.game, vortex.appearsAt + 100);
  assert.equal(vortex.x, shot.impact.x, 'a placa não deriva com o vento');
  assert.ok(match.game.players[1].airborne?.fromElementalWind, 'ergue o tanque atingido');
  assert.ok(match.game.objects[0].groundY < 700, 'ergue objetos');
  assert.ok(match.game.powerups[0].y < 680, 'ergue powerups');
  match.game.roundNumber = 3; updateWindVortices(match.game, vortex.appearsAt + 200);
  assert.equal(match.game.windVortices.length, 1);
  match.game.roundNumber = 4; updateWindVortices(match.game, vortex.appearsAt + 300);
  assert.equal(match.game.windVortices.length, 0);
});

test('Vendaval pode gerar exatamente dois tornados por quatro turnos', () => {
  const match = room();
  let withTornado = null; let withoutTornado = null;
  for (let seed = 0; seed < 60 && (!withTornado || !withoutTornado); seed += 1) {
    match.game.seed = `tornado-chance-${seed}`;
    const event = applyArenaPulse(match, { forcedType: 'gale' });
    if (event.tornadoes.length) withTornado = event;
    else withoutTornado = event;
  }
  assert.ok(withTornado && withoutTornado, 'a chance produz ambos os resultados');
  assert.equal(withTornado.tornadoes.length, 2);
  assert.ok(withTornado.tornadoes[0].x < withTornado.tornadoes[1].x);
  assert.ok(withTornado.tornadoes.every((site) => site.y === 700));
  match.game.pendingArenaEvent = { eventId: withTornado.id, executeAt: Date.now() - 1 };
  tickRoom(match);
  const tornadoes = match.game.windVortices.filter((vortex) => vortex.source === 'gale');
  assert.equal(tornadoes.length, 2);
  assert.ok(tornadoes.every((vortex) => vortex.expiresTurn - vortex.startTurn === 4));
  assert.ok(tornadoes.every((vortex) => vortex.appearsAt > Date.now()));
  match.game.turnNumber = tornadoes[0].expiresTurn - 1;
  updateWindVortices(match.game, tornadoes[0].appearsAt + 100);
  assert.equal(match.game.windVortices.length, 2);
  match.game.turnNumber += 1;
  updateWindVortices(match.game, tornadoes[0].appearsAt + 200);
  assert.equal(match.game.windVortices.length, 0);
});
