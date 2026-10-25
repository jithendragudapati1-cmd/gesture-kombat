import type { Fighter } from './combat';
export type AnimationName='idle'|'walk'|'run'|'punch'|'double'|'kick'|'block'|'ice'|'duck'|'jump'|'fire'|'lightning'|'combo'|'hit'|'victory'|'defeat';
export type Animation={name:AnimationName;cell:number;phase:number;shift:number;lift:number;stretch:number};
export function animationFor(p:Fighter,now:number,winner=false):Animation{
 let name:AnimationName='idle',cell=Math.floor(now/450)%2,phase=0,shift=0,lift=0,stretch=1;
 const age=now-p.effectAt;
 if(winner){name='victory';cell=15;lift=Math.sin(now/350)*2;}
 else if(p.hp<=0){name='defeat';cell=14;}
 else if(p.hitAt>0&&now-p.hitAt<220){name='hit';cell=14;phase=(now-p.hitAt)/220;shift=-9*Math.sin(phase*Math.PI);}
 else if(age>=0&&age<580&&['PUNCH','DOUBLE PUNCH','KICK','FIRE BLAST','LIGHTNING','COMBO ENERGY'].includes(p.effect)){
  phase=age/580;const impact=Math.sin(Math.min(1,phase*1.5)*Math.PI);
  if(p.effect==='PUNCH'){name='punch';cell=phase<.18?4:phase<.8?5:4;shift=impact*16;}
  if(p.effect==='DOUBLE PUNCH'){name='double';cell=phase<.18?4:6;shift=impact*21;}
  if(p.effect==='KICK'){name='kick';cell=phase<.22||phase>.83?7:8;shift=impact*10;}
  if(p.effect==='FIRE BLAST'){name='fire';cell=12;shift=impact*5;}
  if(p.effect==='LIGHTNING'){name='lightning';cell=13;}
  if(p.effect==='COMBO ENERGY'){name='combo';cell=12;lift=impact*13;}
 }
 else if(p.jumpUntil>now){name='jump';cell=11;phase=1-(p.jumpUntil-now)/650;lift=Math.sin(Math.max(0,Math.min(1,phase))*Math.PI)*92;}
 else if(p.shieldUntil>now){name='ice';cell=9;}
 else if(p.actions.includes('BLOCK')){name='block';cell=9;}
 else if(p.actions.includes('BEND')){name='duck';cell=10;}
 else if(p.actions.some(a=>['WALK','RUN','MOVE LEFT','MOVE RIGHT'].includes(a))){name=p.actions.includes('RUN')?'run':'walk';cell=2+Math.floor(now/(name==='run'?100:160))%2;lift=Math.sin(now/(name==='run'?53:80))*2;}
 else lift=Math.sin(now/410)*1.8;
 if(p.jumpUntil>now&&name!=='jump')lift+=Math.sin(Math.max(0,Math.min(1,1-(p.jumpUntil-now)/650))*Math.PI)*92;
 return {name,cell,phase,shift,lift,stretch};
}
