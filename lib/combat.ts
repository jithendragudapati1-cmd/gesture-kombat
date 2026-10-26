import {ATTACKS,MAX_HP,projectileX} from './attack-specs.ts';
export {MAX_HP} from './attack-specs.ts';
import {arenaId,type ArenaId} from './arenas.ts';
import {characterId,opponentCharacter,type CharacterId} from './characters.ts';
export const ACTIONS = ['MOVE LEFT','MOVE RIGHT','MOVE FORWARD','MOVE BACKWARD','WALK','RUN','JUMP','BEND','BLOCK','PUNCH','DOUBLE PUNCH','KICK','FIRE BLAST','ICE SHIELD','LIGHTNING','COMBO ENERGY'] as const;
export type Action = typeof ACTIONS[number];
export type Fighter = { name:string; character?:CharacterId; x:number; z?:number; yaw?:number; hp:number; maxHp?:number; energy:number; actions:string[]; lastSeen:number; lastAttack:Record<string,number>; effect:string; effectAt:number; effectX?:number; effectZ?:number; effectDirectionZ?:number; effectTargetZ?:number; effectDirection?:number; effectTarget?:number; hitAt:number; jumpUntil:number; shieldUntil:number; seq:number };
export type PendingHit={side:number;action:string;at:number;checked:number;origin:number;originZ?:number;direction:number;directionZ?:number;target:number;targetZ?:number};
export type Room = { hits?:PendingHit[]; arena?:ArenaId; id:string; code:string; mode:'ai'|'friend'|'random'; tokens:string[]; fighters:Fighter[]; status:'waiting'|'playing'|'finished'; start:number; updated:number; tick:number; winner:number|null; cpuAt:number; difficulty:string };
export type World = { rooms:Record<string,Room>; queue:{token:string;name:string;character?:CharacterId;arena?:ArenaId;at:number}[] };
export const freshWorld=():World=>({rooms:{},queue:[]});
export function fighter(name:string,x:number,now:number,character:CharacterId='raven'):Fighter{return {character,name:name.slice(0,20)||'Fighter',x,z:0,yaw:0,hp:MAX_HP,maxHp:MAX_HP,energy:100,actions:[],lastSeen:now,lastAttack:{},effect:'',effectAt:0,hitAt:0,jumpUntil:0,shieldUntil:0,seq:-1};}
export function makeRoom(id:string,code:string,mode:Room['mode'],token:string,name:string,now:number,difficulty='normal',character:CharacterId='raven',arena:ArenaId='moon-citadel'):Room {
 const ai=mode==='ai';return {arena:arenaId(arena),id,code,mode,tokens:ai?[token,'CPU']:[token],fighters:ai?[fighter(name,28,now,character),fighter('Training AI',72,now,opponentCharacter(character))]:[fighter(name,28,now,character)],status:ai?'playing':'waiting',start:ai?now+3000:0,updated:now,tick:now,winner:null,cpuAt:now+3500,difficulty};
}
export function joinRoom(r:Room,token:string,name:string,now:number,character:CharacterId='vortex'){
 if(r.tokens.includes(token))return;
 if(r.status!=='waiting'||r.tokens.length>=2)throw Error('This room is full or already started.');
 r.tokens.push(token);r.fighters.push(fighter(name,72,now,character));r.status='playing';r.start=now+3000;r.tick=now;r.updated=now;
}
export function applyAttack(r:Room,side:number,action:string,now:number){
 const p=r.fighters[side],q=r.fighters[1-side];if(!q||r.status!=='playing'||now<r.start)return;
 if(action==='ICE SHIELD'){
  if(now-(p.lastAttack[action]??-1e9)<4000||p.energy<20)return;
  p.energy-=20;p.shieldUntil=now+1700;p.lastAttack[action]=now;p.effect=action;p.effectAt=now;return;
 }
 const spec=ATTACKS[action];if(!spec||p.energy<spec.cost||now-(p.lastAttack[action]??-1e9)<spec.cooldown)return;
 p.energy-=spec.cost;p.lastAttack[action]=now;p.effect=action;p.effectAt=now;
 const facing=(q.x>=p.x?Math.PI/2:-Math.PI/2)+(p.yaw??0),direction=Math.sin(facing),directionZ=Math.cos(facing);
 p.effectX=p.x;p.effectZ=p.z??0;p.effectDirection=direction;p.effectDirectionZ=directionZ;p.effectTarget=q.x;p.effectTargetZ=q.z??0;
 (r.hits??=[]).push({side,action,at:now,checked:now,origin:p.x,originZ:p.z??0,direction,directionZ,target:q.x,targetZ:q.z??0});
}
export function resolveHits(r:Room,now:number){
 r.hits=(r.hits??[]).filter(hit=>{
  const spec=ATTACKS[hit.action],p=r.fighters[hit.side],q=r.fighters[1-hit.side];
  if(!spec||!q||r.status!=='playing')return false;
  const age=now-hit.at;if(age<spec.windup)return true;
  let contact=false,done=false;
  if(spec.speed){
   const previous=projectileX(hit.origin,hit.direction,hit.action,Math.max(0,hit.checked-hit.at-spec.windup));
   const current=projectileX(hit.origin,hit.direction,hit.action,age-spec.windup);
   const distance=(q.x-hit.origin)*hit.direction;
   const previousZ=projectileX(hit.originZ??0,hit.directionZ??0,hit.action,Math.max(0,hit.checked-hit.at-spec.windup)),currentZ=projectileX(hit.originZ??0,hit.directionZ??0,hit.action,age-spec.windup);
   const sx=current-previous,sz=currentZ-previousZ,t=Math.max(0,Math.min(1,((q.x-previous)*sx+((q.z??0)-previousZ)*sz)/Math.max(.001,sx*sx+sz*sz)));
   contact=Math.hypot(q.x-(previous+t*sx),(q.z??0)-(previousZ+t*sz))<=3;
   done=contact||spec.speed*(age-spec.windup)/1000>spec.reach;
  }else if(hit.action==='LIGHTNING'){contact=Math.hypot(q.x-hit.target,(q.z??0)-(hit.targetZ??0))<=6;done=true;}
  else{const dx=q.x-p.x,dz=(q.z??0)-(p.z??0),gap=Math.hypot(dx,dz);contact=(dx*hit.direction+dz*(hit.directionZ??0))/Math.max(.01,gap)>.45&&gap<=spec.reach;done=true;}
  const dodged=hit.action!=='LIGHTNING'&&(q.jumpUntil>now||q.actions.includes('BEND')&&hit.action!=='KICK');
  if(contact&&!dodged){const guard=q.shieldUntil>now?.12:q.actions.includes('BLOCK')?.28:1;q.hp=Math.max(0,q.hp-Math.round(spec.damage*guard));q.hitAt=now;}
  hit.checked=now;
  if(q.hp<=0){r.status='finished';r.winner=hit.side;return false;}
  return !done;
 });
}
export function advance(r:Room,now:number){
 if(r.status!=='playing'){r.tick=now;return;}
 if(now<r.start){r.tick=now;return;}
 if(now-r.start>=90000){r.status='finished';r.winner=r.fighters[0].hp===r.fighters[1].hp?-1:r.fighters[0].hp>r.fighters[1].hp?0:1;return;}
 const dt=Math.min(.45,Math.max(0,(now-Math.max(r.tick,r.start))/1000));r.tick=now;
 for(const p of r.fighters){
  p.energy=Math.min(100,p.energy+dt*7);
  if(now-p.lastSeen>700)p.actions=[];
  const left=p.actions.includes('MOVE LEFT'),right=p.actions.includes('MOVE RIGHT');
  const forward=p.actions.includes('MOVE FORWARD'),back=p.actions.includes('MOVE BACKWARD');if(forward!==back)p.z=Math.max(-15,Math.min(15,(p.z??0)+(forward?1:-1)*dt*(p.actions.includes('RUN')?25:17)));
  if(left!==right)p.x=Math.max(8,Math.min(92,p.x+(right?1:-1)*dt*(p.actions.includes('RUN')?25:17)));
 }
 resolveHits(r,now);if(r.status!=='playing')return;
 if(r.mode==='ai'&&now>=r.cpuAt){
  const cpu=r.fighters[1],human=r.fighters[0],gap=cpu.x-human.x;cpu.lastSeen=now;
  cpu.actions=Math.abs(gap)>17?[gap>0?'MOVE LEFT':'MOVE RIGHT']:Math.random()<.25?['BLOCK']:[];
  if(Math.abs((cpu.z??0)-(human.z??0))>2)cpu.actions.push((cpu.z??0)<(human.z??0)?'MOVE FORWARD':'MOVE BACKWARD');
  r.cpuAt=now+(r.difficulty==='easy'?900:r.difficulty==='hard'?340:600);
  if(Math.random()<(r.difficulty==='easy'?.45:.8))applyAttack(r,1,Math.abs(gap)>26?'FIRE BLAST':Math.random()<.5?'PUNCH':'KICK',now);
 }
 if(now-r.start>=90000&&r.status==='playing'){r.status='finished';r.winner=r.fighters[0].hp===r.fighters[1].hp?-1:r.fighters[0].hp>r.fighters[1].hp?0:1;}
 if(r.mode!=='ai'&&r.fighters.some(p=>now-p.lastSeen>18000)){
  r.status='finished';const away=r.fighters.map(p=>now-p.lastSeen>18000);r.winner=away[0]&&away[1]?-1:away[0]?1:0;
 }
}
export function input(r:Room,token:string,actions:string[],seq:number,now:number,yaw?:number){
 const side=r.tokens.indexOf(token);if(side<0)throw Error('You are not a player in this room.');
 advance(r,now);const p=r.fighters[side];p.lastSeen=now;r.updated=now;
 if(seq>p.seq){if(Number.isFinite(yaw))p.yaw=Math.atan2(Math.sin(yaw!),Math.cos(yaw!));p.seq=seq;p.actions=[...new Set(actions.filter(a=>(ACTIONS as readonly string[]).includes(a)))];
  if(p.actions.includes('JUMP')&&now>=r.start&&now-(p.lastAttack.JUMP??-1e9)>1000){p.jumpUntil=now+650;p.lastAttack.JUMP=now;}
  for(const a of p.actions)applyAttack(r,side,a,now);
 }
 return side;
}
export function view(r:Room,token:string,now:number){return {arena:arenaId(r.arena),id:r.id,code:r.code,mode:r.mode,status:r.status,fighters:r.fighters,start:r.start,winner:r.winner,side:r.tokens.indexOf(token),serverTime:now};}
export function cleanup(w:World,now:number){w.queue=w.queue.filter(q=>now-q.at<12000);for(const [id,r] of Object.entries(w.rooms))if(now-r.updated>15*60000)delete w.rooms[id];}
