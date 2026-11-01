import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, access, readdir } from 'node:fs/promises';
import path from 'node:path';
const directory = path.resolve(process.argv[2]);
const names = await readdir(directory);
for (const name of ['data', 'host-config.json', '.env', '.git']) assert.ok(!names.includes(name), `Private file: ${name}`);
for (const name of ['node.exe', 'NODE-LICENSE.txt', 'INICIAR_ONLINE.bat', 'scripts/install-tunnel.ps1']) await access(path.join(directory, name));
const data = await mkdtemp(path.resolve('output/qa-host-data-'));
const port = 3511, origin = `http://127.0.0.1:${port}`;
const child = spawn(path.join(directory, 'node.exe'), ['server/index.js'], { cwd: directory, env: { ...process.env, PORT: String(port), TANKDOTS_DATA_DIR: data }, stdio: 'pipe', windowsHide: true });
let log = ''; child.stderr.on('data', chunk => log += chunk);
try {
  let ready = false;
  for (let i=0;i<80;i++) { try { if ((await fetch(`${origin}/health`)).ok) { ready=true;break; } } catch {} await new Promise(r=>setTimeout(r,100)); }
  assert.ok(ready, log);
  const html = await (await fetch(origin)).text(); assert.match(html, /TankDots/);
  const response = await fetch(`${origin}/api/account/register`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:'HostPackageQA',password:'QA-only-password-123'}) });
  assert.equal(response.status, 201);
  await new Promise((resolve,reject)=>{const qa=spawn(process.execPath,['scripts/qa-public-host.mjs',origin],{stdio:'inherit',windowsHide:true});qa.on('exit',code=>code===0?resolve():reject(new Error(`Network QA exit ${code}`)));});
  await access(path.join(data, 'accounts.json'));
  console.log('Portable Windows runtime, isolated account persistence and two-player networking passed.');
} finally { child.kill(); }
