'use client';
import {useEffect,useRef} from 'react';
export default function CursorWake(){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||!matchMedia('(pointer: fine)').matches)return;
  const c=canvas.current;if(!c)return;const ctx=c.getContext('2d');if(!ctx)return;
  const points:{x:number;y:number;age:number;vx:number;vy:number}[]=[];let frame=0,last=performance.now(),mouse={x:-500,y:-500},prev={...mouse},lastMove=0,width=innerWidth,height=innerHeight;
  function resize(){width=innerWidth;height=innerHeight;const ratio=Math.min(devicePixelRatio,1.5);c!.width=width*ratio;c!.height=height*ratio;ctx!.setTransform(ratio,0,0,ratio,0,0);}
  function move(e:PointerEvent){if(e.pointerType==='touch')return;prev=mouse;mouse={x:e.clientX,y:e.clientY};const dx=mouse.x-prev.x,dy=mouse.y-prev.y,speed=Math.hypot(dx,dy);if(speed>2&&speed<300){points.push({x:mouse.x,y:mouse.y,age:0,vx:dx,vy:dy});if(points.length>42)points.shift();}lastMove=performance.now();}
  const abort=new AbortController();addEventListener('pointermove',move,{passive:true,signal:abort.signal});addEventListener('resize',resize,{signal:abort.signal});resize();
  function draw(now:number){const dt=Math.min(.05,(now-last)/1000);last=now;ctx!.clearRect(0,0,width,height);ctx!.globalCompositeOperation='lighter';
   if(now-lastMove<280){const gradient=ctx!.createRadialGradient(mouse.x,mouse.y,0,mouse.x,mouse.y,80);gradient.addColorStop(0,'#79d9ff13');gradient.addColorStop(.5,'#b76cfc07');gradient.addColorStop(1,'#00000000');ctx!.fillStyle=gradient;ctx!.fillRect(mouse.x-80,mouse.y-80,160,160);}
   for(let i=points.length-1;i>=0;i--){const p=points[i];p.age+=dt;if(p.age>1.2){points.splice(i,1);continue;}const fade=Math.pow(1-p.age/1.2,2),speed=Math.min(35,Math.hypot(p.vx,p.vy)),angle=Math.atan2(p.vy,p.vx),radius=5+p.age*(18+speed*.3);
    ctx!.save();ctx!.translate(p.x,p.y);ctx!.rotate(angle);ctx!.scale(1,.62);ctx!.lineWidth=.75;ctx!.strokeStyle=i%3?'rgba(69,192,255,'+(fade*.33)+')':'rgba(246,62,166,'+(fade*.28)+')';
    // The two curling arms trail behind the pointer like a boat's wake.
    ctx!.beginPath();ctx!.arc(-radius*.3,0,radius,.35,Math.PI-.35);ctx!.stroke();ctx!.beginPath();ctx!.arc(-radius*.3,0,radius,Math.PI+.35,Math.PI*2-.35);ctx!.stroke();ctx!.restore();
   }
   ctx!.globalCompositeOperation='source-over';frame=requestAnimationFrame(draw);
  }
  frame=requestAnimationFrame(draw);return()=>{cancelAnimationFrame(frame);abort.abort();ctx.clearRect(0,0,width,height);};
 },[]);
 return <canvas ref={canvas} className="cursor-wake" aria-hidden="true"/>;
}
