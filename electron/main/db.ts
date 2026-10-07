import Database from 'better-sqlite3';
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Room, Timer, Message } from '../../src/types/index.js';

let db: Database.Database;
const id=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
export function initDb(){
  const dir=app.getPath('userData'); fs.mkdirSync(dir,{recursive:true});
  db=new Database(path.join(dir,'stageflow.sqlite')); db.pragma('foreign_keys=ON');
  const schema=fs.readFileSync(path.join(app.getAppPath(),'database/migrations/001_init.sql'),'utf8'); db.exec(schema);
  const emptyDemoRoom=db.prepare(`
    SELECT id FROM rooms
    WHERE name='Demo Event'
      AND (SELECT COUNT(*) FROM rooms)=1
      AND NOT EXISTS (SELECT 1 FROM timers WHERE timers.room_id=rooms.id)
      AND NOT EXISTS (SELECT 1 FROM messages WHERE messages.room_id=rooms.id)
    LIMIT 1
  `).get() as {id:string}|undefined;
  if(emptyDemoRoom) deleteRoom(emptyDemoRoom.id);
}
export function createRoom(name:string):Room{const t=now(); const r:Room={id:id(),name,createdAt:t,updatedAt:t,autoAdvance:true,warningSeconds:120,criticalSeconds:30,overtimeBehavior:'negative',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone}; db.prepare('INSERT INTO rooms VALUES (@id,@name,@createdAt,@updatedAt,@autoAdvance,@warningSeconds,@criticalSeconds,@overtimeBehavior,@timezone)').run({...r,autoAdvance:1}); return r;}
export function listRooms():Room[]{return db.prepare('SELECT id,name,created_at createdAt,updated_at updatedAt,auto_advance autoAdvance,warning_seconds warningSeconds,critical_seconds criticalSeconds,overtime_behavior overtimeBehavior,timezone FROM rooms ORDER BY updated_at DESC').all() as Room[];}
export function getRoom(id:string):Room|undefined{return db.prepare('SELECT id,name,created_at createdAt,updated_at updatedAt,auto_advance autoAdvance,warning_seconds warningSeconds,critical_seconds criticalSeconds,overtime_behavior overtimeBehavior,timezone FROM rooms WHERE id=?').get(id) as Room|undefined;}
export function updateRoom(r:Room){db.prepare('UPDATE rooms SET name=?,updated_at=?,auto_advance=?,warning_seconds=?,critical_seconds=?,overtime_behavior=?,timezone=? WHERE id=?').run(r.name,now(),r.autoAdvance?1:0,r.warningSeconds,r.criticalSeconds,r.overtimeBehavior,r.timezone,r.id);}
export function deleteRoom(id:string){db.prepare('DELETE FROM rooms WHERE id=?').run(id);}
export function listTimers(roomId:string):Timer[]{const rows=db.prepare('SELECT id,room_id roomId,title,speaker,notes,duration_ms durationMs,type,trigger_type trigger,scheduled_at scheduledAt,warning_seconds warningSeconds,critical_seconds criticalSeconds,overtime_behavior overtimeBehavior,color,order_index orderIndex,status,start_timestamp startTimestamp,paused_at pausedAt,remaining_ms remainingMs,flash FROM timers WHERE room_id=? ORDER BY order_index ASC').all(roomId) as any[]; return rows.map(r=>({...r,flash:Boolean(r.flash)}));}
export function createTimer(roomId:string,data:Partial<Timer>):Timer{const idv=id();const durationMs=data.durationMs??300000; const room=getRoom(roomId); const max=listTimers(roomId).reduce((m,t)=>Math.max(m,t.orderIndex),-1)+1; const timer:Timer={id:idv,roomId,title:data.title??'New Timer',speaker:data.speaker??'',notes:data.notes??'',durationMs,type:data.type??'countdown',trigger:data.trigger??'manual',scheduledAt:data.scheduledAt??null,warningSeconds:data.warningSeconds??room?.warningSeconds??120,criticalSeconds:data.criticalSeconds??room?.criticalSeconds??30,overtimeBehavior:data.overtimeBehavior??room?.overtimeBehavior??'negative',color:data.color??'#3b82f6',orderIndex:data.orderIndex??max,status:'idle',startTimestamp:null,pausedAt:null,remainingMs:durationMs,flash:false}; db.prepare('INSERT INTO timers VALUES (@id,@roomId,@title,@speaker,@notes,@durationMs,@type,@trigger,@scheduledAt,@warningSeconds,@criticalSeconds,@overtimeBehavior,@color,@orderIndex,@status,@startTimestamp,@pausedAt,@remainingMs,@flash)').run({...timer,flash:0}); return timer;}
export function updateTimer(t:Timer){db.prepare('UPDATE timers SET title=@title,speaker=@speaker,notes=@notes,duration_ms=@durationMs,type=@type,trigger_type=@trigger,scheduled_at=@scheduledAt,warning_seconds=@warningSeconds,critical_seconds=@criticalSeconds,overtime_behavior=@overtimeBehavior,color=@color,order_index=@orderIndex,status=@status,start_timestamp=@startTimestamp,paused_at=@pausedAt,remaining_ms=@remainingMs,flash=@flash WHERE id=@id').run({...t,flash:t.flash?1:0});}
export function deleteTimer(id:string){db.prepare('DELETE FROM timers WHERE id=?').run(id);}
export function listMessages(roomId:string):Message[]{return db.prepare('SELECT id,room_id roomId,text,active,flash,created_at createdAt FROM messages WHERE room_id=? ORDER BY created_at DESC').all(roomId).map((r:any)=>({...r,active:Boolean(r.active),flash:Boolean(r.flash)})) as Message[];}
export function createMessage(roomId:string,text:string,flash=false):Message{const m={id:id(),roomId,text,active:true,flash,createdAt:now()};db.prepare('INSERT INTO messages VALUES (@id,@roomId,@text,@active,@flash,@createdAt)').run({...m,active:1,flash:flash?1:0});db.prepare('UPDATE messages SET active=0 WHERE room_id=? AND id<>?').run(roomId,m.id);return m;}
export function clearMessages(roomId:string){db.prepare('UPDATE messages SET active=0 WHERE room_id=?').run(roomId);}
export function log(roomId:string,event:string,payload:unknown={}){db.prepare('INSERT INTO activity_logs VALUES (?,?,?,?,?)').run(id(),roomId,event,JSON.stringify(payload),now());}
export function getDb(){return db;}
