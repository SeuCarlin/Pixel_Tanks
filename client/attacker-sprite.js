// The artist's strip is ten 191x100 transparent frames. Hull and cannon live
// side by side in each frame, so the cannon can still follow the live aim.
export const ATTACKER_SPRITE = Object.freeze({ frameWidth: 191, frameHeight: 100, frames: 10 });

export function attackerSpriteFrame({ time, moving = false, shotStarted = -Infinity, shotDuration = 420 }) {
  const elapsed = time - shotStarted;
  if (elapsed >= 0 && elapsed < shotDuration) return 5 + Math.min(4, Math.floor(elapsed / (shotDuration / 5)));
  return moving ? Math.floor(time / 105) % 5 : Math.floor(time / 900) % 2;
}

export function drawAttackerHull(c, sheet, frame, facing = 1) {
  const sx = frame * ATTACKER_SPRITE.frameWidth;
  const scale = .55;
  c.save(); c.scale(facing < 0 ? -1 : 1, 1); c.imageSmoothingEnabled = false;
  // Above y=60 the detached barrel starts at x=94. Below it, the front
  // armour reaches x=103, so the two crops preserve the entire hull.
  c.drawImage(sheet, sx, 0, 94, 60, -57 * scale, 10 - 91 * scale, 94 * scale, 60 * scale);
  c.drawImage(sheet, sx, 60, 105, 40, -57 * scale, 10 - 31 * scale, 105 * scale, 40 * scale);
  c.restore();
}

export function drawAttackerBarrel(c, sheet, frame, angle, recoil = 0, bob = 0) {
  const scale = .48;
  c.save(); c.translate(1, -17 + bob); c.rotate(angle); c.translate(-recoil * .35, 0);
  c.imageSmoothingEnabled = false;
  c.drawImage(sheet, frame * ATTACKER_SPRITE.frameWidth + 94, 0, 97, 65, 0, -46 * scale, 97 * scale, 65 * scale);
  c.restore();
}

export function tintAttackerSheet(source, color) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return source;
  const tint = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
  const canvas = document.createElement('canvas'); canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
  const c = canvas.getContext('2d', { willReadFrequently: true }); c.drawImage(source, 0, 0);
  const image = c.getImageData(0, 0, canvas.width, canvas.height); const pixels = image.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const red = pixels[i]; const green = pixels[i + 1]; const blue = pixels[i + 2];
    if (!pixels[i + 3] || red < 70 || red <= green * 1.3 || red <= blue * 1.15 || red - green < 28) continue;
    const shade = .3 + red / 255 * .7; const neutral = Math.min(green, blue) * .16;
    for (let channel = 0; channel < 3; channel += 1) pixels[i + channel] = Math.min(255, Math.round(tint[channel] * shade + neutral));
  }
  c.putImageData(image, 0, 0); return canvas;
}
