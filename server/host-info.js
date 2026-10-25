import { isIP } from 'node:net';

export function lanUrls(interfaces, port) {
  const addresses = Object.values(interfaces).flat()
    .filter((entry) => entry?.family === 'IPv4' && !entry.internal && isIP(entry.address) === 4 && !entry.address.startsWith('169.254.'))
    .map((entry) => entry.address);
  return [...new Set(addresses)].map((address) => `http://${address}:${port}`);
}

export function publicOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

export function isLocalRequest(address) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
}
