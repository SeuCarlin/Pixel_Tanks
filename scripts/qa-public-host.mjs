import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
const origin=process.argv[2];if(!origin)throw new Error('Pass the public HTTPS server URL');
assert.equal((await fetch(`${origin}/health`)).status,200);
assert.equal((await fetch(`${origin}/api/account/me`)).status,401);
const wait=(socket,type)=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{socket.off('message',read);reject(new Error(`Missing ${type}`));},15000);function read(raw){const message=JSON.parse(raw);if(message.type===type){clearTimeout(timeout);socket.off('message',read);resolve(message.payload);}}socket.on('message',read);});
const sockets=[];
try{
  for(let i=0;i<2;i++){const socket=new WebSocket(origin.replace(/^http/,'ws'));sockets.push(socket);const welcome=wait(socket,'WELCOME');await once(socket,'open');await welcome;}
  const first=wait(sockets[0],'ROOM_STATE');sockets[0].send(JSON.stringify({type:'CREATE_ROOM',payload:{nickname:'Teste rede 1',rules:{maxPlayers:2,botCount:0}}}));const room=await first;
  assert.equal(room.players[0].classOffer.length,4);
  const second=wait(sockets[1],'ROOM_STATE');sockets[1].send(JSON.stringify({type:'JOIN_ROOM',payload:{nickname:'Teste rede 2',code:room.code}}));
  assert.equal((await second).players.length,2);
  const pong=wait(sockets[1],'PONG');sockets[1].send(JSON.stringify({type:'PING'}));await pong;
  console.log('Public HTTPS, login endpoint, two WebSocket players and four starter classes verified.');
}finally{for(const socket of sockets)socket.close();}
