import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';
import { lanUrls, publicOrigin, isLocalRequest } from '../server/host-info.js';
import { chooseHostPort } from '../scripts/host-launcher.mjs';

test('host offers reachable LAN addresses and validates an optional public origin', () => {
  const interfaces = { ethernet: [{ family: 'IPv4', internal: false, address: '192.168.1.8' }], virtual: [
    { family: 'IPv4', internal: false, address: '169.254.1.2' },
    { family: 'IPv4', internal: false, address: '192.168.1.8' },
    { family: 'IPv4', internal: true, address: '127.0.0.1' },
  ] };
  assert.deepEqual(lanUrls(interfaces, 3000), ['http://192.168.1.8:3000']);
  assert.equal(publicOrigin('https://tanks.example.net/'), 'https://tanks.example.net');
  assert.equal(publicOrigin('javascript:alert(1)'), null);
  assert.equal(publicOrigin('http://host/path'), null);
  assert.equal(isLocalRequest('::ffff:127.0.0.1'), true);
  assert.equal(isLocalRequest('192.168.1.8'), false);
});

test('host launcher skips an occupied port instead of opening another game server', async () => {
  const occupied = net.createServer();
  await new Promise((resolve) => occupied.listen(0, '0.0.0.0', resolve));
  const port = occupied.address().port;
  try {
    assert.equal(await chooseHostPort(port), port + 1);
    await assert.rejects(chooseHostPort(port, true), /ocupada/);
  }
  finally { await new Promise((resolve) => occupied.close(resolve)); }
});
