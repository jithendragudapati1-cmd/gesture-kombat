import type { Fighter } from './combat';
import {drawCharacter} from './draw-fighters';
export function drawArena(ctx:CanvasRenderingContext2D,width:number,height:number,fighters:Fighter[],now:number,hero=false,outcome?:number|null){
 const w=1200,h=580;ctx.save();ctx.scale(width/w,height/h);ctx.clearRect(0,0,w,h);
 const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#050313');bg.addColorStop(.6,'#0d0822');bg.addColorStop(1,'#04030b');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
 // Blue/magenta backlights echo the reference across the whole arena.
 for(const [x,color] of [[270,'#159dff'],[970,'#ff254c']] as const){
  const light=ctx.createRadialGradient(x,240,5,x,240,360);light.addColorStop(0,color+'48');light.addColorStop(.42,color+'19');light.addColorStop(1,color+'00');ctx.fillStyle=light;ctx.fillRect(0,0,w,h);
 }
 // Electric portal and architectural light strips, without flashing.
 ctx.save();ctx.lineWidth=2;ctx.shadowBlur=17;
 for(let ring=0;ring<3;ring++){
  ctx.strokeStyle=ring%2?'#ff375c5c':'#3bcfff66';ctx.shadowColor=ring%2?'#ff375c':'#3bcfff';
  ctx.beginPath();ctx.ellipse(625,265,170+ring*17,180+ring*14,-.17,.22+ring*.2,Math.PI*1.92-ring*.15);ctx.stroke();
 }
 for(let side=0;side<2;side++){
  ctx.strokeStyle=side?'#ff375c8c':'#3bcfff8c';ctx.shadowColor=side?'#ff375c':'#3bcfff';
  for(let i=0;i<3;i++){const x=side?1010+i*48:110+i*48;ctx.beginPath();ctx.moveTo(x+10,85+i*13);ctx.lineTo(x-35,235);ctx.lineTo(x+7,335);ctx.stroke();}
 }
 ctx.restore();
 // Brutalist arena, luminous horizon, distant towers.
 for(let i=0;i<19;i++){const x=i*77-30,hh=90+Math.sin(i*7.3)*55;ctx.fillStyle=i%2?'#0d0c24':'#090a1b';ctx.fillRect(x,285-hh,55,hh+110);ctx.fillStyle='#1564a044';ctx.fillRect(x+9,290-hh,2,hh);}
 const sun=ctx.createRadialGradient(w*.52,215,5,w*.52,215,240);sun.addColorStop(0,'#853dfb22');sun.addColorStop(1,'#853dfb00');ctx.fillStyle=sun;ctx.fillRect(300,0,600,460);
 ctx.strokeStyle='#34cfff77';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,385);ctx.lineTo(w,385);ctx.stroke();
 const floor=ctx.createLinearGradient(0,385,0,h);floor.addColorStop(0,'#120923');floor.addColorStop(1,'#05030b');ctx.fillStyle=floor;ctx.fillRect(0,386,w,h-386);
 ctx.strokeStyle='#7462e72c';for(let i=-8;i<14;i++){ctx.beginPath();ctx.moveTo(600+i*55,386);ctx.lineTo(600+i*220,h);ctx.stroke();}for(let j=0;j<5;j++){const y=392+j*j*10;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
 // Floating embers: deterministic, gently moving.
 for(let i=0;i<28;i++){const x=(i*113+now*.008)%w,y=390-((i*37+now*.018)%330);ctx.fillStyle=i%2?'#fa15d488':'#4cd5ff88';ctx.fillRect(x,y,2,2);}
 fighters.forEach((p,side)=>drawCharacter(ctx,p,side,fighters[1-side],now,outcome===side,outcome!==undefined&&outcome!==null&&outcome!==-1&&outcome!==side));
 if(hero){ctx.fillStyle='#a9afb9';ctx.font='12px monospace';ctx.fillText('THE NEON RIFT  /  ARENA 01',28,h-25);ctx.textAlign='right';ctx.fillText('REAL MOVEMENT. REAL COMBAT.',w-28,h-25);ctx.textAlign='left';}
 ctx.restore();
}
