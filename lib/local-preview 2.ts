import type { Fighter } from './combat';
export type LocalControl={actions:string[];seen:number;effect:string;effectAt:number;jumpAt:number};
export const freshControl=():LocalControl=>({actions:[],seen:0,effect:'',effectAt:0,jumpAt:0});
// Visual prediction only. HP, energy, hits and cooldowns always come from the server.
export function previewFighters(players:Fighter[],side:number,local:LocalControl,serverTime:number,receivedAt:number,now:number){
 const elapsed=Math.min(.22,Math.max(0,(now-receivedAt)/1000));
 return players.map((p,i)=>{
  const fresh=i===side&&now-local.seen<220;
  const actions=fresh?local.actions:p.actions;
  const result={...p,actions};
  const left=actions.includes('MOVE LEFT'),right=actions.includes('MOVE RIGHT');
  if(left!==right)result.x=Math.max(8,Math.min(92,p.x+(right?1:-1)*elapsed*(actions.includes('RUN')?25:17)));
  if(i===side&&local.effectAt>receivedAt-100&&now-local.effectAt<450){result.effect=local.effect;result.effectX=p.x;result.effectDirection=p.x<=(players[1-i]?.x??p.x)?1:-1;result.effectTarget=players[1-i]?.x??50;result.effectAt=serverTime+local.effectAt-receivedAt;}
  if(i===side&&now-local.jumpAt<650)result.jumpUntil=serverTime+local.jumpAt-receivedAt+650;
  return result;
 });
}
