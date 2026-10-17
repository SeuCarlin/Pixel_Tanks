import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCameraPlayer, turnCameraZoom } from '../client/camera.js';

test('camera keeps the active player in focus while another tank is still moving', () => {
  const staleMovement = { id: 'old', moving: true, x: 180 };
  const active = { id: 'active', moving: false, x: 2400 };
  const players = new Map([[staleMovement.id, staleMovement], [active.id, active]]);
  assert.equal(selectCameraPlayer(players, active.id, staleMovement.id), active);
});

test('turn camera briefly zooms in and respects useful zoom limits', () => {
  assert.equal(turnCameraZoom(.32, .28), .8);
  assert.equal(turnCameraZoom(1.05, .28), 1.05);
  assert.equal(turnCameraZoom(1.7, .28), 1.28);
});
