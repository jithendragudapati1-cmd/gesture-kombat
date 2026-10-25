import {arenaId} from '../../../lib/arenas';
import {characterId} from '../../../lib/characters';
import { env } from 'cloudflare:workers';
import { advance,cleanup,freshWorld,input,joinRoom,makeRoom,view,type World } from '../../../lib/combat';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
async function mutate<T>(fn:(w:World)=>T):Promise<T>{
 const db=env.DB;if(!db)throw Error('Online arena storage is unavailable. Please retry shortly.');
 await db.prepare('INSERT OR IGNORE INTO arena_state (id,version,value) VALUES (?,0,?)').bind('lobby',JSON.stringify(freshWorld())).run();
 for(let attempt=0;attempt<9;attempt++){
  const row=await db.prepare('SELECT version,value FROM arena_state WHERE id=?').bind('lobby').first<{version:number;value:string}>();
  if(!row)throw Error('Arena could not initialize.');
  const w=JSON.parse(row.value) as World;cleanup(w,Date.now());const result=fn(w);
  const updated=await db.prepare('UPDATE arena_state SET value=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(w),'lobby',row.version).run();
  if(updated.meta.changes===1)return result;
 }
 throw Error('The arena is busy. Please retry.');
}
export async function GET(){return Response.json({ok:true,version:'1.0',modes:['ai','random','friend']},{headers});}
export async function POST(req:Request){
 try{
  const raw=await req.text();if(raw.length>4096)return Response.json({error:'Request too large.'},{status:413,headers});
  const b=JSON.parse(raw),now=Date.now();
  if(typeof b.token!=='string'||!/^[a-f0-9-]{36}$/.test(b.token))return Response.json({error:'Invalid player session. Refresh this page.'},{status:400,headers});
  const token=b.token;const arena=arenaId(b.arena);const character=characterId(b.character);const name=String(b.name||'Fighter').trim().slice(0,20)||'Fighter';
  const result=await mutate(w=>{
   const existing=Object.values(w.rooms).find(r=>r.tokens.includes(token)&&r.status!=='finished');
   if(b.op==='leave'){
    w.queue=w.queue.filter(q=>q.token!==token);
    if(existing){if(existing.status==='waiting')delete w.rooms[existing.id];else{existing.status='finished';existing.winner=1-existing.tokens.indexOf(token);existing.updated=now;}}
    return {left:true};
   }
   if(b.op==='queue'){
    if(existing){advance(existing,now);return {room:view(existing,token,now)};}
    const other=w.queue.find(q=>q.token!==token);
    if(other){w.queue=w.queue.filter(q=>q.token!==other.token&&q.token!==token);const id=crypto.randomUUID();const r=makeRoom(id,'','random',other.token,other.name,now,'normal',characterId(other.character),arenaId(other.arena));joinRoom(r,token,name,now,character);w.rooms[id]=r;return {room:view(r,token,now)};}
    w.queue=w.queue.filter(q=>q.token!==token);w.queue.push({token,name,character,arena,at:now});return {queued:true};
   }
   if(b.op==='create'){
    if(existing)return {room:view(existing,token,now)};
    const id=crypto.randomUUID();let code='';
    if(b.mode==='friend'){do{code=Array.from(crypto.getRandomValues(new Uint8Array(6)),v=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[v%32]).join('');}while(Object.values(w.rooms).some(r=>r.code===code));}
    const r=makeRoom(id,code,b.mode==='ai'?'ai':'friend',token,name,now,['easy','normal','hard'].includes(b.difficulty)?b.difficulty:'normal',character,arena);w.rooms[id]=r;
    return {room:view(r,token,now)};
   }
   if(b.op==='join'){
    if(existing)throw Error('Leave your current match before joining another room.');
    const code=String(b.code||'').toUpperCase().trim();const r=Object.values(w.rooms).find(r=>r.code===code&&r.mode==='friend');
    if(!r)throw Error('Room not found. Check the six-character code.');joinRoom(r,token,name,now,character);w.queue=w.queue.filter(q=>q.token!==token);return {room:view(r,token,now)};
   }
   if(b.op==='input'){
    const r=w.rooms[String(b.roomId)];if(!r)throw Error('Match expired. Start another match.');
    const actions=Array.isArray(b.actions)?b.actions.filter((a:unknown)=>typeof a==='string').slice(0,14):[];
    input(r,token,actions,Number.isSafeInteger(b.seq)?b.seq:0,now);return {room:view(r,token,now)};
   }
   throw Error('Unknown arena request.');
  });
  return Response.json(result,{headers});
 }catch(error){console.error('Arena request:',error instanceof Error?error.message:'failed');return Response.json({error:error instanceof Error?error.message:'Unable to reach the arena.'},{status:400,headers});}
}
