import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { verifyItchZip } from './verify-itch-zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Each build gets a separate directory: never delete a previous deliverable.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.join(root, 'output', 'itch', stamp);
const game = path.join(out, 'game');
await mkdir(game, { recursive: true });
await cp(path.join(root, 'client'), game, { recursive: true, filter: (src) => !src.includes(`${path.sep}offline`) });
await cp(path.join(root, 'shared'), path.join(game, 'shared'), { recursive: true });
await mkdir(path.join(game, 'engine'));
// Only copy the simulation dependency graph; accounts and server configuration stay out.
const copied = new Set();
async function copyEngine(name) {
  if (copied.has(name)) return;
  copied.add(name);
  const source = await readFile(path.join(root, 'server', name), 'utf8');
  const adapted = source.replaceAll("'node:crypto'", "'./browser-crypto.js'");
  await writeFile(path.join(game, 'engine', name), adapted);
  for (const match of source.matchAll(/from ['"]\.\/([^'"]+)['"]/g)) await copyEngine(match[1]);
}
await copyEngine('rooms.js');
await copyEngine('match-telemetry.js');
await cp(path.join(root, 'client/offline/browser-crypto.js'), path.join(game, 'engine/browser-crypto.js'));
await cp(path.join(root, 'client/offline/network.js'), path.join(game, 'network.js'));
await cp(path.join(root, 'client/offline/local-session.js'), path.join(game, 'local-session.js'));
await cp(path.join(root, 'client/offline/online-link.js'), path.join(game, 'online-link.js'));
let onlineUrl = process.env.TANKDOTS_PUBLIC_URL || '';
try { onlineUrl ||= JSON.parse(await readFile(path.join(root,'host-config.json'),'utf8')).publicUrl || ''; } catch {}
await writeFile(path.join(game,'online-server.json'),JSON.stringify({url:onlineUrl}));

// Reuse the production command handler and tick loop so every weapon and bot keeps
// the same rules online and offline. Build assertions catch server layout changes.
const server = await readFile(path.join(root, 'server/index.js'), 'utf8');
const start = server.indexOf('function audience(room)');
if (start < 0 || !server.includes("wss.on('connection'")) throw new Error('Server protocol layout changed; update standalone adapter.');
let runtime = server.slice(start);
runtime = runtime.replace('function sync(room) {', 'function sync(room) { local.beforeSync(room);');
runtime = runtime.replace('const { type, payload = {} } = JSON.parse(raw.toString());', `const { type, payload = {} } = JSON.parse(raw.toString());
      if ([CLIENT.JOIN_ROOM, CLIENT.WATCH_ROOM, CLIENT.LINK_ACCOUNT].includes(type)) throw new Error('Esta edição oferece partidas no mesmo dispositivo.');
      if (type === CLIENT.CREATE_ROOM) local.prepare(payload, ws);`);
runtime = runtime.replace('send(ws, SERVER.WELCOME, { playerId: ws.playerId, token: result.token });', 'local.configure(result.room); send(ws, SERVER.WELCOME, { playerId: ws.playerId, token: result.token });');
const gameImports = server.match(/import \{[^\n]+\} from '\.\/game.js';/)[0].replace("'./game.js'", "'./engine/game.js'");
const bootstrap = `import { CLIENT, PROTOCOL_VERSION, SERVER } from './shared/protocol.js';
import { refreshTankStates } from './shared/tank-states.js';
import { RoomManager } from './engine/rooms.js';
import { MatchTelemetry } from './engine/match-telemetry.js';
import { LocalSession } from './local-session.js';
import { progressionState } from './shared/progression.js';
${gameImports}
const rooms = new RoomManager({ collectionFor: () => progressionState() });
const accounts = { recordMatch() {} };
const accountIdFor = () => null;
const WebSocket = { OPEN: 1 };
const local = new LocalSession(rooms, message => postMessage(message), PROTOCOL_VERSION);
const wss = { on(type, handler) { if (type === 'connection') local.connect(handler); } };
const send = (socket, type, payload = {}) => socket.send(JSON.stringify({ type, payload: type === SERVER.WELCOME ? { ...payload, protocolVersion: PROTOCOL_VERSION } : payload }));
onmessage = ({ data }) => local.dispatch(data);
postMessage({ type: 'LOCAL_READY' });
`;
await writeFile(path.join(game, 'local-engine.js'), bootstrap + runtime);

async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    result.push(...(entry.isDirectory() ? await files(absolute) : [absolute]));
  }
  return result;
}
// itch.io serves the ZIP in a nested iframe path. All URLs must stay inside it.
for (const file of await files(game)) {
  if (!/\.(js|html|css|webmanifest)$/.test(file)) continue;
  let text = await readFile(file, 'utf8');
  text = text.replace(/(["'`(=])\/(assets|shared)\//g, '$1./$2/');
  if (path.dirname(file) === game) text = text.replaceAll('../shared/', './shared/');
  if (file.endsWith('index.html')) {
    text = text.replace(/(href|src)="\/(?!\/)/g, '$1="./');
    text = text.replace('ONLINE + LAN', 'SOLO + MULTIPLAYER LOCAL').replace('SOLO, COOP E PVP', 'JOGUE NO MESMO DISPOSITIVO').replace('SERVIDOR ATIVO', 'MODO LOCAL');
    text = text.replace('Use CONVIDAR AMIGOS para enviar o link da sala, ou copie o código acima. Os bots ficam prontos automaticamente.', 'Cada pessoa escolhe sua classe e arsenal e marca Pronto. O controle passa automaticamente para o próximo jogador. Os bots ficam prontos automaticamente.');
    text = text.replace('<label>JOGADORES<select name="maxPlayers">', '<label>HUMANOS NESTE DISPOSITIVO<select name="localPlayers"><option value="1">1 jogador</option>' + Array.from({length:9},(_,i)=>`<option value="${i+2}">${i+2} jogadores</option>`).join('') + '</select></label><label>LIMITE DE TANQUES<select name="maxPlayers">');
    text = text.replace('</head>', `<style>.tab[data-tab="join"],.room-share-actions,#chatToggle,#accountSaveNote{display:none!important}</style></head>`);
  }
  if (file.endsWith(`${path.sep}app.js`)) text = "import './online-link.js';\n" + text.replace("online ? 'servidor online' : 'reconectando'", "online ? 'modo local pronto' : 'iniciando modo local'");
  if (file.endsWith(`${path.sep}account-ui.js`)) text = text.replace('let token =', "return { token: () => null, profile: () => null, refresh: () => {}, show: () => document.querySelector('#accountButton').click() };\n  let token =");
  if (file.endsWith('manifest.webmanifest')) text = text.replaceAll('"/"', '"./"');
  await writeFile(file, text);
}
const entries = await files(game);
if (entries.length + 1 > 1000) throw new Error('itch.io file limit exceeded');
let totalBytes = 0;
for (const file of entries) {
  const size = (await stat(file)).size;
  totalBytes += size;
  if (size > 200 * 1024 * 1024 || path.relative(game, file).length > 240) throw new Error(`itch.io file limit exceeded: ${file}`);
}
if (totalBytes > 500 * 1024 * 1024) throw new Error('itch.io extracted size limit exceeded');
const version = createHash('sha256').update(await readFile(path.join(game, 'local-engine.js'))).digest('hex').slice(0, 12);
await writeFile(path.join(game, 'build-info.json'), JSON.stringify({ edition: 'itch-solo', version, builtAt: new Date().toISOString() }, null, 2));
const zip = path.join(out, 'tank-dot-arena-itch.zip');
if (process.platform === 'win32') {
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/pack-itch.ps1'), '-Source', game, '-Destination', zip], { stdio: 'inherit' });
} else execFileSync('zip', ['-q', '-r', zip, '.'], { cwd: game, stdio: 'inherit' });
await verifyItchZip(zip);
await writeFile(path.join(out, 'LEIA-ME.txt'), `Tank Dot Arena — solo e multiplayer local para itch.io\n\nEnvie tank-dot-arena-itch.zip como HTML. Marque o arquivo como executável no navegador.\nUse 1280 x 720, redimensionamento e botão de tela cheia; mobile em paisagem.\nO index.html fica na raiz do ZIP.\n\nEscolha a quantidade de humanos e bots (até 10 tanques). Cada humano prepara seu arsenal e marca Pronto; o controle acompanha o turno automaticamente, no mesmo dispositivo. Para multiplayer pela internet e contas, clique em ONLINE - LOGIN E CARTAS e informe o endereco HTTPS do anfitriao. Qualquer amigo pode hospedar usando o pacote separado TankDots - Servidor Windows, disponivel nos downloads do itch.io. Contas e cartas pertencem a cada servidor.\nAtive o som com um toque.\nA internet é necessária para carregar os arquivos; após carregar, a partida continua sem conexão. Não há restauração da partida ao recarregar.\n\nBuild ${version}; ${entries.length + 1} arquivos.\n`);
console.log(JSON.stringify({ zip, directory: game, files: entries.length + 1, version }));
