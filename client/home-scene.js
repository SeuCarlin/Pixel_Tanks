const THEMES = [
  { name: 'CIDADE', sky: '#75b5d2', night: '#101e34', mountain: '#42617a', soil: '#49605d', rim: '#a2b66e' },
  { name: 'GELEIRA', sky: '#92c8db', night: '#172945', mountain: '#5d8293', soil: '#647b83', rim: '#c6e3db' },
  { name: 'USINA', sky: '#83abb0', night: '#142c33', mountain: '#3b5960', soil: '#475f58', rim: '#b9cb69' },
  { name: 'VULCÃO', sky: '#d19b78', night: '#281c32', mountain: '#795d65', soil: '#5b514c', rim: '#ffad6a' },
];
const mix = (from, to, fraction) => {
  const a = Number.parseInt(from.slice(1), 16); const b = Number.parseInt(to.slice(1), 16);
  const channel = (shift) => Math.round(((a >> shift) & 255) * (1 - fraction) + ((b >> shift) & 255) * fraction);
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
};
const hash = (x) => ((x * 1103515245 + 12345) >>> 8) % 17;

export function startHomeScene(canvas, label) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const width = canvas.width; const height = canvas.height;
  let lastFrame = 0; let lastLabel = '';
  function paint(now) {
    requestAnimationFrame(paint);
    if (document.hidden || !canvas.closest('.screen.active') || now - lastFrame < 80) return;
    lastFrame = now;
    const seconds = now / 1000; const theme = THEMES[Math.floor(seconds / 65) % THEMES.length];
    const day = .18 + .82 * (1 + Math.cos(seconds / 32 * Math.PI)) / 2;
    const isNight = day < .48;
    ctx.fillStyle = mix(theme.night, theme.sky, day); ctx.fillRect(0, 0, width, height);
    const sunX = Math.round(70 + (seconds % 64) / 64 * 500); const sunY = Math.round(74 - Math.sin((seconds % 64) / 64 * Math.PI) * 42);
    ctx.fillStyle = isNight ? '#dfecff' : '#ffe39b'; ctx.fillRect(sunX, sunY, isNight ? 14 : 19, isNight ? 14 : 19);
    ctx.fillStyle = mix('#b5c7d7', '#e6f0e8', day);
    for (let index = 0; index < 7; index += 1) {
      const x = Math.round((index * 109 + seconds * (2 + index % 3)) % 760) - 70; const y = 28 + index % 3 * 22;
      ctx.globalAlpha = .16 + index % 3 * .06; ctx.fillRect(x, y, 42, 5); ctx.fillRect(x + 8, y - 5, 29, 5); ctx.fillRect(x + 17, y - 9, 13, 4);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.mountain;
    for (let x = 0; x < width; x += 4) { const ridge = 198 + Math.sin(x * .018 + 1) * 19 + Math.sin(x * .053) * 8; ctx.fillRect(x, ridge, 4, height - ridge); }
    const surface = (x) => 252 + Math.sin(x * .022) * 20 + Math.sin(x * .061 + 1) * 9;
    for (let x = 0; x < width; x += 4) {
      const y = Math.floor(surface(x) / 4) * 4;
      ctx.fillStyle = theme.rim; ctx.fillRect(x, y, 4, 4);
      for (let yy = y + 4; yy < height; yy += 4) { ctx.fillStyle = hash(x + yy) < 3 ? '#253a43' : theme.soil; ctx.fillRect(x, yy, 4, 4); }
    }
    for (const [x, y, span] of [[104, 204, 82], [278, 190, 107], [474, 215, 88]]) {
      ctx.fillStyle = '#a8bd76'; ctx.fillRect(x, y, span, 3); ctx.fillStyle = '#283943'; for (let bx = x + 5; bx < x + span; bx += 11) ctx.fillRect(bx, y + 3, 4, 2);
    }
    for (const [x, color, direction] of [[158, '#b7ec58', 1], [442, '#ff7956', -1]]) {
      const y = Math.round(surface(x)) - 10;
      ctx.fillStyle = '#09131d'; ctx.fillRect(x - 12, y + 5, 25, 5);
      ctx.fillStyle = color; ctx.fillRect(x - 10, y, 21, 6); ctx.fillRect(x - 5, y - 5, 12, 5);
      ctx.fillRect(x + direction * 4, y - 8, direction * 18, 3);
      ctx.fillStyle = '#d7eef0'; ctx.fillRect(x - 2, y - 4, 5, 2);
    }
    const projectileX = Math.round(170 + (seconds * 44) % 300);
    const projectileY = 230 - Math.sin((projectileX - 170) / 300 * Math.PI) * 84;
    ctx.fillStyle = '#fff6b2'; ctx.fillRect(projectileX, projectileY, 3, 3);
    ctx.fillStyle = '#ffb765'; ctx.fillRect(projectileX - 6, projectileY + 2, 3, 2);
    const text = `${theme.name} • ${isNight ? 'NOITE' : 'DIA'} • CENÁRIO EM CICLO`;
    if (label && lastLabel !== text) { label.textContent = text; lastLabel = text; }
  }
  requestAnimationFrame(paint);
}
