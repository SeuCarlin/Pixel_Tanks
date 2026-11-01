// Minimal Web Crypto adapter for the existing simulation and room code.
export default {
  randomUUID: () => globalThis.crypto.randomUUID(),
  randomBytes(length) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
    return { toString: () => Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('') };
  },
  randomInt(min, max) {
    if (max === undefined) { max = min; min = 0; }
    const range = max - min;
    if (!Number.isSafeInteger(range) || range <= 0 || range > 0x100000000) throw new RangeError('Invalid random range');
    const limit = Math.floor(0x100000000 / range) * range;
    let value;
    do { value = globalThis.crypto.getRandomValues(new Uint32Array(1))[0]; } while (value >= limit);
    return min + value % range;
  },
};
