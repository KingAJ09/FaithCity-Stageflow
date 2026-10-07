import {create} from 'zustand'; import type {Room,Timer,Message} from '../types/index.js';
interface State{room:Room|null;timers:Timer[];messages:Message[];selectedTimerId:string|null;setRoom:(r:Room)=>void;setTimers:(t:Timer[])=>void;setMessages:(m:Message[])=>void;select:(id:string|null)=>void;}
export const useApp=create<State>(set=>({room:null,timers:[],messages:[],selectedTimerId:null,setRoom:room=>set({room}),setTimers:timers=>set({timers}),setMessages:messages=>set({messages}),select:selectedTimerId=>set({selectedTimerId})}));
