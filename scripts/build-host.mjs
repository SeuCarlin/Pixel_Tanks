import { cp, mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Use an allowlist: never package accounts, sessions, host addresses or local secrets.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Build requires Windows x64 Node.js.');
const out = path.join(root, 'output/host', new Date().toISOString().replace(/[:.]/g, '-'));
const stage = path.join(out, 'server');
await mkdir(stage, { recursive: true });
for (const name of ['client', 'shared', 'server']) await cp(path.join(root, name), path.join(stage, name), { recursive: true });
for (const name of ['package.json', 'package-lock.json', 'INICIAR_ONLINE.bat']) await copyFile(path.join(root, name), path.join(stage, name));
await mkdir(path.join(stage, 'scripts'));
for (const name of ['public-launcher.mjs', 'host-launcher.mjs', 'install-tunnel.ps1']) await copyFile(path.join(root, 'scripts', name), path.join(stage, 'scripts', name));
await copyFile(process.execPath, path.join(stage, 'node.exe'));
await copyFile(path.join(path.dirname(process.execPath), 'LICENSE'), path.join(stage, 'NODE-LICENSE.txt'));
await copyFile(path.join(root, 'docs/pc-server.md'), path.join(stage, 'LEIA-ME.md'));
await writeFile(path.join(stage, 'LEIA-ME.txt'), 'TANKDOTS WARS - SERVIDOR WINDOWS 64 BITS\r\n\r\nExtraia TODO o ZIP. Abra INICIAR_ONLINE.bat. Node.js ja incluido.\r\nNa primeira vez, internet e necessaria para baixar o tunel oficial.\r\nAbra o endereco HTTPS da janela, crie uma sala e envie endereco + codigo aos amigos.\r\nMantenha PC, internet e janela ligados. Ctrl+C encerra. O endereco muda ao reiniciar.\r\nContas e cartas pertencem a este servidor. Preserve data ao atualizar e faca backup com o servidor parado.\r\nLeia LEIA-ME.md para detalhes.\r\n');
// Install only locked production dependencies; npm is needed only by the packager.
execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm.cmd ci --omit=dev --ignore-scripts --no-audit --no-fund'], { cwd: stage, stdio: 'inherit' });
const forbidden = ['data', 'host-config.json', '.env', 'output', '.git'];
const names = await readdir(stage);
if (forbidden.some(name => names.includes(name))) throw new Error('Private runtime data found in package');
const manifest = JSON.parse(await readFile(path.join(stage, 'package.json'), 'utf8'));
delete manifest.devDependencies;
manifest.scripts = { start: 'node server/index.js' };
await writeFile(path.join(stage, 'package.json'), JSON.stringify(manifest, null, 2));
const zip = path.join(out, 'tankdots-servidor-windows.zip');
execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/pack-itch.ps1'), '-Source', stage, '-Destination', zip], { stdio: 'inherit' });
console.log(JSON.stringify({ zip, directory: stage }));
