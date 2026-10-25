import net from 'node:net';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function portIsAvailable(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '0.0.0.0', () => probe.close(() => resolve(true)));
  });
}

export async function chooseHostPort(preferred = 3000, fixed = false) {
  if (fixed) {
    if (await portIsAvailable(preferred)) return preferred;
    throw new Error(`A porta ${preferred} do endereço público está ocupada. Feche o servidor antigo ou ajuste a configuração.`);
  }
  for (let port = preferred; port <= preferred + 10; port += 1) if (await portIsAvailable(port)) return port;
  throw new Error(`Nenhuma porta disponível entre ${preferred} e ${preferred + 10}.`);
}

async function waitUntilReady(url, child) {
  for (let attempt = 0; attempt < 50 && child.exitCode === null; attempt += 1) {
    try { const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(600) }); if (response.ok) return true; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return false;
}

export async function startHost() {
  const preferred = Number(process.env.PORT) || 3000;
  if (!Number.isInteger(preferred) || preferred < 1024 || preferred > 65525) throw new Error('PORT deve estar entre 1024 e 65525.');
  let fixedPublicPort = Boolean(process.env.TANKDOTS_PUBLIC_URL);
  try { fixedPublicPort ||= Boolean(JSON.parse(readFileSync(path.join(root, 'host-config.json'), 'utf8')).publicUrl); } catch {}
  const port = await chooseHostPort(preferred, fixedPublicPort);
  const url = `http://localhost:${port}`;
  const child = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'inherit', windowsHide: false });
  child.on('error', (error) => { process.stderr.write(`Falha ao iniciar o servidor: ${error.message}\n`); process.exitCode = 1; });
  if (!await waitUntilReady(url, child)) { child.kill(); throw new Error('O servidor não respondeu a tempo.'); }
  process.stdout.write(`\nAnfitrião pronto: ${url}\nCrie uma sala e use CONVIDAR AMIGOS para obter o link de rede.\nMantenha esta janela aberta durante a partida.\n\n`);
  if (process.platform === 'win32' && process.env.TANKDOTS_NO_BROWSER !== '1') {
    const browser = spawn('cmd.exe', ['/d', '/c', 'start', '""', url], { windowsHide: true, detached: true, stdio: 'ignore' });
    browser.unref();
  }
  return child;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startHost().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
