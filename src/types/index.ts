export type TimerType = 'countdown'|'countup'|'clock'|'hidden';
export type TimerStatus = 'idle'|'running'|'paused'|'finished';
export type TriggerType = 'manual'|'linked'|'scheduled';
export type OvertimeBehavior = 'stop'|'continue'|'hide'|'negative';
export interface Room { id:string; name:string; createdAt:string; updatedAt:string; autoAdvance:boolean; warningSeconds:number; criticalSeconds:number; overtimeBehavior:OvertimeBehavior; timezone:string; }
export interface Timer { id:string; roomId:string; title:string; speaker:string; notes:string; durationMs:number; type:TimerType; trigger:TriggerType; scheduledAt:string|null; warningSeconds:number; criticalSeconds:number; overtimeBehavior:OvertimeBehavior; color:string; orderIndex:number; status:TimerStatus; startTimestamp:number|null; pausedAt:number|null; remainingMs:number; flash:boolean; }
export interface Message { id:string; roomId:string; text:string; active:boolean; flash:boolean; createdAt:string; }
export interface Device { id:string; name:string; role:string; ip:string; connectedAt:number; }
export interface SyncState { room:Room; timers:Timer[]; messages:Message[]; serverTime:number; }
