import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chooseHostPort } from './host-launcher.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  const running = JSON.parse(await readFile(path.join(root,'host-config.json'),'utf8'));
  if (Number.isInteger(running.port) && running.port >= 1024 && running.port <= 65535) {
    const health = await fetch(`http://127.0.0.1:${running.port}/health`,{signal:AbortSignal.timeout(1200)});
    if (health.ok && (await health.json()).protocolVersion) { console.log(`Servidor ja ativo: ${running.publicUrl}\nLocal: http://localhost:${running.port}`); process.exit(0); }
  }
} catch {}
const binary = process.env.CLOUDFLARED_PATH || path.join(root, 'tools', 'cloudflared.exe');
if (!existsSync(binary)) throw new Error('Execute scripts/install-tunnel.ps1 primeiro.');
const port = await chooseHostPort(Number(process.env.PORT) || 3000);
const server = spawn(process.execPath, ['server/index.js'], { cwd:root, env:{...process.env,PORT:String(port)}, stdio:'inherit', windowsHide:true });
let tunnel, stopping = false;
const stop = () => { if (stopping) return; stopping=true; tunnel?.kill(); server.kill(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
server.on('exit', code => { if (!stopping) { stop(); process.exitCode=code || 1; } });
server.on('error', error => { console.error(error.message); stop(); });
let ready = false;
for(let i=0;i<50;i++){try{const r=await fetch(`http://127.0.0.1:${port}/health`);if(r.ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,150));}
if (!ready) { stop(); throw new Error('Servidor local nao iniciou.'); }
tunnel = spawn(binary, ['tunnel','--no-autoupdate','--protocol','http2','--url',`http://127.0.0.1:${port}`], {cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true});
let published = false, pending = '';
const log = async chunk => {
  const value=chunk.toString(); process.stdout.write(value); pending=(pending+value).slice(-12000);
  const url=pending.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
  if (!url || published) return; published=true;
  await mkdir(path.join(root,'output'),{recursive:true});
  await writeFile(path.join(root,'host-config.json'),JSON.stringify({publicUrl:url,port},null,2));
  await writeFile(path.join(root,'output','pc-server-url.txt'),url);
  console.log(`\nSERVIDOR ONLINE: ${url}\nPC: http://localhost:${port}\nContas salvas em data/accounts.json. Mantenha o PC e esta janela ligados. Ctrl+C encerra.\n`);
};
tunnel.stdout.on('data',log); tunnel.stderr.on('data',log);
tunnel.on('error',error=>{console.error(error.message);stop();});
tunnel.on('exit',code=>{if(!stopping){console.error('Tunel encerrado. Reinicie INICIAR_ONLINE.bat.');stop();process.exitCode=code||1;}});
