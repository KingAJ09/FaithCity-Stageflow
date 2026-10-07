import express from 'express'; import http from 'node:http'; import os from 'node:os'; import path from 'node:path'; import {app} from 'electron'; import {Server} from 'socket.io';
import * as db from '../main/db.js'; import type {Room,Timer} from '../../src/types/index.js';
let httpServer:http.Server; let io:Server; let port=3000;
let timerTicker:ReturnType<typeof setInterval>|undefined;
const sockets=new Map<string,{name:string,role:string,ip:string,roomId:string,connectedAt:number}>();
function roomConnections(roomId:string){return Array.from(sockets.entries()).filter(([,device])=>device.roomId===roomId).map(([id,device])=>({id,name:device.name,role:device.role,ip:device.ip,connectedAt:device.connectedAt}));}
function lanIp(){const nets=os.networkInterfaces();for(const list of Object.values(nets)){for(const n of list??[]){if(n.family==='IPv4'&&!n.internal)return n.address;}}return '127.0.0.1';}
function snapshot(roomId:string){const room=db.getRoom(roomId); if(!room) throw new Error('Room not found'); return {room,timers:db.listTimers(roomId),messages:db.listMessages(roomId),serverTime:Date.now()};}
export async function startServer(preferred=3000){const appx=express();appx.use(express.json());
  appx.get('/api/health',(_,res)=>res.json({ok:true,serverTime:Date.now(),ip:lanIp(),port}));
  appx.get('/api/rooms',(_,res)=>res.json(db.listRooms()));
  appx.get('/api/rooms/:id/snapshot',(req,res)=>{try{res.json(snapshot(req.params.id))}catch(e){res.status(404).json({error:'Room not found'})}});
  const dist=path.join(app.getAppPath(),'dist'); appx.use(express.static(dist));
  appx.get('/viewer/:roomId',(_,res)=>res.sendFile(path.join(dist,'index.html'))); appx.get('/agenda/:roomId',(_,res)=>res.sendFile(path.join(dist,'index.html'))); appx.get('/moderator/:roomId',(_,res)=>res.sendFile(path.join(dist,'index.html')));
  httpServer=http.createServer(appx); io=new Server(httpServer,{cors:{origin:'*'}});
  io.on('connection',(socket)=>{const roomId=String(socket.handshake.query.roomId||''); const role=String(socket.handshake.query.role||'viewer'); const name=String(socket.handshake.query.name||`${role}-${socket.id.slice(0,5)}`); const ip=socket.handshake.address; if(roomId){socket.join(roomId);sockets.set(socket.id,{name,role,ip,roomId,connectedAt:Date.now()});socket.emit('state',snapshot(roomId));io.to(roomId).emit('connections',roomConnections(roomId));}
    socket.on('action',(a)=>{if(!roomId)return; handleAction(roomId,a);}); socket.on('disconnect',()=>{sockets.delete(socket.id);if(roomId)io.to(roomId).emit('connections',roomConnections(roomId)) });
  });
  await new Promise<void>((resolve,reject)=>{const listen=(p:number)=>httpServer.listen(p,'0.0.0.0',()=>{port=p;resolve()}).on('error',(e:any)=>{if(e.code==='EADDRINUSE'&&p<preferred+20){listen(p+1)}else reject(e)});listen(preferred)});
  timerTicker=setInterval(tickTimers,100);
  return {port,ip:lanIp(),url:`http://${lanIp()}:${port}`};
}
function emitState(roomId:string){io.to(roomId).emit('state',snapshot(roomId));}
function tickTimers(){
  for(const room of db.listRooms()){
    const timers=db.listTimers(room.id);
    const running=timers.find(timer=>timer.status==='running'&&timer.type==='countdown');
    if(!running||running.startTimestamp===null)continue;
    const remaining=running.remainingMs-(Date.now()-running.startTimestamp);
    if(remaining>0)continue;
    running.status='finished';
    running.remainingMs=0;
    running.startTimestamp=null;
    db.updateTimer(running);
    const next=timers[timers.findIndex(timer=>timer.id===running.id)+1];
    if(room.autoAdvance&&next){
      handleAction(room.id,{type:'start',timerId:next.id});
    }else{
      emitState(room.id);
    }
  }
}
function handleAction(roomId:string,a:any){const timers=db.listTimers(roomId); const room=db.getRoom(roomId)!; let t:Timer|undefined;
 switch(a.type){case 'start': t=timers.find(x=>x.id===a.timerId); if(t){const ts=Date.now();t.status='running';t.startTimestamp=ts;t.pausedAt=null;if(t.remainingMs<=0)t.remainingMs=t.durationMs;db.updateTimer(t);db.log(roomId,'timer.start',{timerId:t.id});}break;
 case 'pause':t=timers.find(x=>x.id===a.timerId);if(t?.status==='running'){t.remainingMs=Math.max(0,t.remainingMs-(Date.now()-(t.startTimestamp??Date.now())));t.status='paused';t.pausedAt=Date.now();t.startTimestamp=null;db.updateTimer(t);db.log(roomId,'timer.pause',{timerId:t.id});}break;
 case 'resume':t=timers.find(x=>x.id===a.timerId);if(t?.status==='paused'){t.status='running';t.startTimestamp=Date.now();t.pausedAt=null;db.updateTimer(t);}break;
 case 'reset':t=timers.find(x=>x.id===a.timerId);if(t){t.status='idle';t.startTimestamp=null;t.pausedAt=null;t.remainingMs=t.durationMs;t.flash=false;db.updateTimer(t);}break;
 case 'nudge':t=timers.find(x=>x.id===a.timerId);if(t){t.remainingMs=Math.max(0,t.remainingMs+Number(a.deltaMs||0));if(t.status==='running')t.startTimestamp=Date.now();db.updateTimer(t);}break;
 case 'flash':t=timers.find(x=>x.id===a.timerId);if(t){t.flash=true;db.updateTimer(t);setTimeout(()=>{const cur=db.listTimers(roomId).find(x=>x.id===t!.id);if(cur){cur.flash=false;db.updateTimer(cur);emitState(roomId)}},800);}break;
 case 'message':db.createMessage(roomId,String(a.text||''),Boolean(a.flash));break;
 case 'clearMessage':db.clearMessages(roomId);break;
 case 'delete':db.deleteTimer(a.timerId);break;
 case 'roomUpdate':if(a.room?.id===roomId)db.updateRoom(a.room);break;
 case 'upsert':db.updateTimer(a.timer);break;
 case 'create':db.createTimer(roomId,a.timer);break;
 case 'advance':{const idx=timers.findIndex(x=>x.id===a.timerId);const next=timers[idx+1];if(next){if(timers[idx]){timers[idx].status='finished';timers[idx].remainingMs=0;timers[idx].startTimestamp=null;db.updateTimer(timers[idx]);}handleAction(roomId,{type:'start',timerId:next.id});return;}break;}
 }
 emitState(roomId);
}
export function broadcast(roomId:string){emitState(roomId)}
export function getServerInfo(){return {port,ip:lanIp(),url:`http://${lanIp()}:${port}`,connections:sockets.size};}
export function stopServer(){if(timerTicker)clearInterval(timerTicker);httpServer?.close();io?.close();}
