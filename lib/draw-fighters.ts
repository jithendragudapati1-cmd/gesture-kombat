import type { Fighter } from './combat';
import {characterFor} from './characters';
import {animationFor,type Animation} from './animation';
const atlases=new Map<string,HTMLImageElement>();
function atlas(url:string){if(typeof Image==='undefined')return null;let i=atlases.get(url);if(!i){i=new Image();i.src=url;atlases.set(url,i);}return i.complete&&i.naturalWidth?i:null;}
function stroke(ctx:CanvasRenderingContext2D,points:number[][],color:string,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();}
function ring(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,color:string,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();}
export function drawCharacter(ctx:CanvasRenderingContext2D,p:Fighter,side:number,enemy:Fighter|undefined,now:number,won=false,lost=false){
 const character=characterFor(p,side),image=atlas(character.atlas),animation=animationFor(lost?{...p,hp:0}:p,now,won);
 const x=p.x*12,feet=455,sign=side===0?1:-1,color=character.color,age=now-p.effectAt;
 const attacking=age>=0&&age<650;
 ctx.save();
 const glow=ctx.createRadialGradient(x,feet-130,10,x,feet-130,175);glow.addColorStop(0,color+'17');glow.addColorStop(1,color+'00');ctx.fillStyle=glow;ctx.fillRect(x-180,feet-320,360,360);
 ctx.fillStyle='#00000099';ctx.beginPath();ctx.ellipse(x,feet+3,70,12,0,0,7);ctx.fill();
 ctx.save();ctx.translate(x,feet-animation.lift);ctx.scale(sign,1);
 // Every animation cell uses a common 512-unit frame, body baseline at 90%.
 if(image){
  const cw=image.naturalWidth/4,ch=image.naturalHeight/4,col=animation.cell%4,row=Math.floor(animation.cell/4),size=character.id==='vortex'?345:330;
  if(animation.name==='defeat'){ctx.translate(0,-15);ctx.rotate(-1.1);ctx.globalAlpha=.65;}
  ctx.translate(animation.shift,0);
  if(animation.name==='run'||animation.name==='walk'){
   // Lightweight directional afterimages; sprite changes supply the leg motion.
   for(let n=2;n>0;n--){ctx.globalAlpha=.08/n;ctx.drawImage(image,col*cw,row*ch,cw,ch,-size/2-n*14,-size*.90,size,size);}
   ctx.globalAlpha=1;
  }
  ctx.drawImage(image,col*cw,row*ch,cw,ch,-size/2,-size*.90,size,size);
 }else{
  // A loading silhouette, replaced as soon as the atlas decodes.
  ctx.fillStyle=color+'44';ctx.beginPath();ctx.ellipse(0,-145,42,110,0,0,7);ctx.fill();ctx.font='10px monospace';ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText('LOADING '+character.name.toUpperCase(),0,-20);
 }
 ctx.restore();
 const handX=x+sign*88,handY=feet-animation.lift-175;
 ctx.save();ctx.shadowColor=color;ctx.shadowBlur=12;
 // Energy gauntlets and signature action-specific effects.
 if(attacking&&['PUNCH','DOUBLE PUNCH','KICK'].includes(p.effect)){
  const t=Math.min(1,age/600),burst=12+t*43,yy=p.effect==='KICK'?feet-animation.lift-150:handY;
  ctx.globalAlpha=Math.max(0,1-t);ring(ctx,handX+sign*20,yy,burst,color,3);
  if(p.effect==='DOUBLE PUNCH')ring(ctx,handX+sign*8,yy+30,burst*.85,'#f5e9ff',3);
  for(let n=0;n<10;n++){const theta=n*Math.PI/5;stroke(ctx,[[handX+Math.cos(theta)*burst,yy+Math.sin(theta)*burst],[handX+Math.cos(theta)*(burst+17),yy+Math.sin(theta)*(burst+17)]],n%2?color:'#e6f7ff',2);}
  for(let n=0;n<4;n++)stroke(ctx,[[x-sign*20,yy+n*9-18],[handX,yy+n*7-15]],color,2);
  ctx.globalAlpha=1;
 }
 if(p.actions.includes('BLOCK')||p.shieldUntil>now){
  const ice=p.shieldUntil>now;ctx.strokeStyle=ice?'#a3f3ff':color;ctx.lineWidth=ice?3:2;ctx.beginPath();ctx.ellipse(x+sign*39,feet-animation.lift-145,ice?100:58,ice?147:95,0,0,7);ctx.stroke();
  if(ice){for(let n=0;n<10;n++){const t=n*Math.PI/5+Math.sin(now/1100)*.1;const ax=x+sign*39+Math.cos(t)*100,ay=feet-animation.lift-145+Math.sin(t)*147;stroke(ctx,[[ax,ay],[x+sign*39+Math.cos(t+1.26)*100,feet-animation.lift-145+Math.sin(t+1.26)*147]],'#7edfff66',1);}}
 }
 if(attacking&&['FIRE BLAST','LIGHTNING','COMBO ENERGY'].includes(p.effect)){
  const target=(enemy?.x??50)*12,t=Math.min(1,age/470),xx=x+(target-x)*t,yy=feet-animation.lift-160;
  if(p.effect==='LIGHTNING'){
   for(let branch=0;branch<3;branch++){const pts=[];for(let k=0;k<13;k++)pts.push([target+Math.sin(k*3.5+Math.floor(now/65)+branch)*19+branch*9,k*yy/12]);stroke(ctx,pts,'#428fff',8);stroke(ctx,pts,'#e8fbff',2);}
  }else if(p.effect==='COMBO ENERGY'){
   for(let n=0;n<4;n++)ring(ctx,xx,yy,28+n*14+Math.sin(now/85)*3,n%2?color:'#a57dff',3);
   for(let n=0;n<16;n++){const theta=n*2.4+now/300;const r=45+t*50;stroke(ctx,[[xx+Math.cos(theta)*r,yy+Math.sin(theta)*r],[xx+Math.cos(theta)*(r+27),yy+Math.sin(theta)*(r+27)]],n%2?color:'#be87ff',2);}
  }else{
   for(let n=10;n>=0;n--){const px=xx-sign*n*7,py=yy+Math.sin(n*4+now/90)*6,r=23-n*1.5;ctx.fillStyle=n%2?(character.id==='raven'?'#339fff':'#ff3b24'):'#ffe5a4';ctx.globalAlpha=1-n*.075;ctx.beginPath();ctx.arc(px,py,r,0,7);ctx.fill();}ctx.globalAlpha=1;
  }
 }
 if(p.jumpUntil>now){const t=Math.max(0,1-(p.jumpUntil-now)/650);ctx.globalAlpha=1-t;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,feet,45+t*65,10+t*12,0,0,7);ctx.stroke();ctx.globalAlpha=1;}
 if(now-p.hitAt>=0&&p.hitAt>0&&now-p.hitAt<220){ctx.globalAlpha=1-(now-p.hitAt)/220;for(let n=0;n<10;n++){const t=n*.628,r=(now-p.hitAt)*.3;stroke(ctx,[[x+Math.cos(t)*r,feet-150+Math.sin(t)*r],[x+Math.cos(t)*(r+15),feet-150+Math.sin(t)*(r+15)]],'#ffe8b4',2);}ctx.globalAlpha=1;}
 ctx.restore();
 ctx.textAlign='center';ctx.font='bold 12px sans-serif';ctx.fillStyle=color;ctx.fillText(character.name.toUpperCase(),x,feet+28);
 ctx.font='8px monospace';ctx.fillStyle='#b6a7c7';ctx.fillText(animation.name.toUpperCase(),x,feet+43);ctx.restore();
}
