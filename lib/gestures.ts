// Browser port of the existing normalized pose/hand rules. Video never leaves this browser.
export type Point={x:number;y:number;z:number;visibility?:number};
export type TrackingResult={poseLandmarks?:Point[];poseWorldLandmarks?:Point[];leftHandLandmarks?:Point[];rightHandLandmarks?:Point[]};
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const mid=(a:Point,b:Point):Point=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2});
const angle=(a:Point,b:Point,c:Point)=>{const u=[a.x-b.x,a.y-b.y],v=[c.x-b.x,c.y-b.y];return Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/Math.max(1e-6,Math.hypot(...u)*Math.hypot(...v)))))*180/Math.PI;};
export function handShape(h?:Point[]){
 if(!h||h.length<21)return null;
 const length=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
 const joint=(a:Point,b:Point,c:Point)=>{const u=[a.x-b.x,a.y-b.y,a.z-b.z],v=[c.x-b.x,c.y-b.y,c.z-b.z];return Math.acos(Math.max(-1,Math.min(1,u.reduce((sum,x,i)=>sum+x*v[i],0)/Math.max(1e-7,Math.hypot(...u)*Math.hypot(...v)))))*180/Math.PI;};
 const palm=Math.max(length(h[0],h[9]),.001);
 const ext=[[5,6,8],[9,10,12],[13,14,16],[17,18,20]].filter(([a,b,c])=>joint(h[a],h[b],h[c])>148&&length(h[c],h[0])>length(h[b],h[0])*1.08).length;
 const avg=(ids:number[])=>({x:ids.reduce((s,i)=>s+h[i].x,0)/ids.length,y:ids.reduce((s,i)=>s+h[i].y,0)/ids.length,z:ids.reduce((s,i)=>s+h[i].z,0)/ids.length});
 return {open:ext>=3,fist:ext<=1,up:[8,12,16,20].filter((t,i)=>h[t].y<h[[5,9,13,17][i]].y-.20*palm).length>=3,forward:dist(h[5],h[17])/palm>.32,wrist:h[0],center:avg([0,5,9,13,17]),tips:avg([8,12,16,20])};
}
export class GestureRecognition{
 history:{t:number;p:Point[];s:number;hip:Point;shoulder:Point}[]=[];
 origin:null|{hip:Point;shoulder:Point;s:number}=null;
 since:Record<string,number>={};cool:Record<string,number>={};holds:Record<string,number>={};latched=new Set<string>();absent:Record<string,number>={};
 side='';steps:number[]=[];stepAt=0;charge=0;lastSeen=0;punchAt=[-1e6,-1e6];
 reset(){this.history=[];this.origin=null;this.since={};this.holds={};this.side='';this.steps=[];this.latched.clear();this.absent={};this.charge=0;this.cool={};this.punchAt=[-1e6,-1e6];}
 update(r:TrackingResult,now:number){
 const raw=r.poseLandmarks;
 if(!raw||[11,12].some(i=>(raw[i].visibility??0)<.4)){
  if(now-this.lastSeen>500)this.reset();
  this.history=[];this.punchAt=[-1e6,-1e6];this.charge=0;this.holds={};this.since={};return {actions:[] as string[],events:[] as string[],status:'Bring your shoulders and hands into view'};
 }
 if(this.lastSeen&&now-this.lastSeen>600)this.reset();this.lastSeen=now;
 const previous=this.history.at(-1);
 // Light smoothing suppresses webcam jitter without the old heavy tracking lag.
 const p=previous&&now-previous.t<120?raw.map((v,i)=>({...v,x:.82*v.x+.18*previous.p[i].x,y:.82*v.y+.18*previous.p[i].y,z:.82*v.z+.18*previous.p[i].z})):raw;
 const torso=[23,24].every(i=>(p[i].visibility??0)>.45&&p[i].y<=1.02);
 const hip=mid(p[23],p[24]),shoulder=mid(p[11],p[12]),s=Math.max(.08,torso?dist(hip,shoulder):dist(p[11],p[12])*1.15);
 if(torso)this.origin??={hip,shoulder,s};this.history.push({t:now,p,s,hip,shoulder});this.history=this.history.filter(f=>now-f.t<1600);
 const refs=this.history.filter(f=>now-f.t>=65&&now-f.t<=360);
 // Holistic handedness stays anatomical; pose-wrist matching also handles mirrored sources.
 const rawHands=[r.leftHandLandmarks,r.rightHandLandmarks].filter((v):v is Point[]=>!!v);
 const h:[ReturnType<typeof handShape>,ReturnType<typeof handShape>]=[null,null];
 for(const hand of rawHands){const side=dist(hand[0],p[15])<dist(hand[0],p[16])?0:1;if(!h[side])h[side]=handShape(hand);else h[1-side as 0|1]=handShape(hand);}
 const c=new Map<string,number>();const add=(a:string,dwell=0)=>c.set(a,dwell);
 const visible=(...ids:number[])=>ids.every(i=>(p[i].visibility??0)>.4&&p[i].y<1.03&&p[i].y>-.03);
 let prayer=false,shield=false;
 if(h[0]&&h[1]){
  const [l,rr]=h,gap=dist(l.wrist,rr.wrist)/s;
  prayer=l.open&&rr.open&&l.up&&rr.up&&gap<.60&&dist(l.center,rr.center)/s<.48&&dist(l.tips,rr.tips)/s<.48&&Math.abs(l.wrist.y-rr.wrist.y)/s<.28;
  shield=l.open&&rr.open&&l.up&&rr.up&&l.forward&&rr.forward&&gap>.95&&Math.max(l.wrist.y,rr.wrist.y)<shoulder.y+.12*s;
  if(prayer){add('FIRE BLAST',200);if(now-(this.since['FIRE BLAST']??now)>180)this.charge=now;}
  if(shield)add('ICE SHIELD',180);
  if(l.open&&rr.open&&gap>1.35&&this.charge&&now-this.charge<1200){add('COMBO ENERGY');this.charge=0;}
 }
 const raised=h.map((v,i)=>!!v?.open&&p[i?16:15].y<p[0].y-.08*s);
 if(!shield&&raised.filter(Boolean).length===1)add('LIGHTNING',160);
 const chest=visible(13,14,15,16)&&[15,16].every(i=>Math.abs(p[i].y-(shoulder.y+.4*s))<.9*s);
 if(!prayer&&chest&&(p[15].x-p[16].x)*(p[11].x-p[12].x)<0)add('BLOCK',80);
 const fists:number[]=[];
 for(const [idx,w,sh,e] of [[0,15,11,13],[1,16,12,14]]){
  if(!h[idx]?.fist||!visible(w,sh,e))continue;
  if(refs.some(o=>{if((o.p[w].visibility??0)<.4)return false;const depth=((o.p[w].z-o.p[sh].z)-(p[w].z-p[sh].z))/s;const ext=(dist(p[w],p[sh])-dist(o.p[w],o.p[sh]))/s;return(depth>.19||ext>.19)&&(angle(p[sh],p[e],p[w])>118||depth>.23);})) {fists.push(idx);this.punchAt[idx]=now;}
 }
 if(fists.length){const paired=this.punchAt.every((t,i)=>now-t<140&&h[i]?.fist);add(paired?'DOUBLE PUNCH':'PUNCH');}
 if(torso)for(const o of refs){
  const dx=(hip.x-o.hip.x)/s,sdx=(shoulder.x-o.shoulder.x)/s;
  // Video is mirrored; a raw x decrease is movement to screen right.
  if(dx*sdx>0&&Math.abs(dx-sdx)<.16&&Math.abs((dx+sdx)/2)>.065)add(dx<0?'MOVE RIGHT':'MOVE LEFT');
 }
 const o=this.origin??{hip,shoulder,s},hipDrop=(hip.y-o.hip.y)/o.s,shoulderDrop=(shoulder.y-o.shoulder.y)/o.s;
 const knees=torso&&visible(25,26),feet=torso&&visible(27,28);
 const kneeAngles=[[23,25,27],[24,26,28]].map(([a,b,c])=>visible(a,b,c)?angle(p[a],p[b],p[c]):180);
 if(torso&&((hipDrop>.12&&(Math.min(...kneeAngles)<155||shoulderDrop>.2))||(shoulderDrop>.18&&(hip.y-shoulder.y)/(o.hip.y-o.shoulder.y)<.82)))add('BEND',65);
 if(knees){
  const gait=((p[26].y-p[25].y)*.65+(feet?(p[28].y-p[27].y)*.35:0))/s;
  const side=gait>.045?'left':gait<-.045?'right':'';
  if(side&&side!==this.side&&now-this.stepAt>170){this.side=side;this.stepAt=now;this.steps.push(now);}
  this.steps=this.steps.filter(t=>now-t<2300);
  if(this.steps.length>=2&&now-this.stepAt<750){const cadence=(this.steps.at(-1)!-this.steps[0])/(this.steps.length-1);add(cadence<340?'RUN':'WALK');}
  for(const prev of refs){
   if(feet&&(prev.hip.y-hip.y)/s>.075&&[27,28].every(i=>(prev.p[i].y-p[i].y)/s>.045))add('JUMP');
   for(const [idx,hi,k,a] of [[0,23,25,27],[1,24,26,28]])if(visible(hi,k,a)){
    const lift=((prev.p[a].y-prev.p[hi].y)-(p[a].y-p[hi].y))/s;
    const depth=((prev.p[a].z-prev.p[hi].z)-(p[a].z-p[hi].z))/s;
    if((lift>.20&&(p[a].y-p[hi].y)/s<1.25&&kneeAngles[idx]>130)||(depth>.32&&kneeAngles[idx]>120))add('KICK');
   }
  }
 }
 if(c.has('JUMP')){c.delete('KICK');c.delete('BEND');c.delete('WALK');c.delete('RUN');}
 if(c.has('DOUBLE PUNCH')){c.delete('PUNCH');delete this.holds.PUNCH;}
 if(c.has('RUN')){c.delete('WALK');delete this.holds.WALK;}
 const events:string[]=[];
 for(const a of Object.keys(this.since))if(!c.has(a))delete this.since[a];
 for(const a of this.latched)if(!c.has(a)){this.absent[a]??=now;if(now-this.absent[a]>250)this.latched.delete(a);}else delete this.absent[a];
 for(const [a,dwell] of c){this.since[a]??=now;if(now-this.since[a]<dwell)continue;this.holds[a]=now+150;
  if(!this.latched.has(a)&&now>(this.cool[a]??0)){events.push(a);this.latched.add(a);this.cool[a]=now+(['FIRE BLAST','LIGHTNING','COMBO ENERGY'].includes(a)?1100:500);}
 }
 if(c.has('MOVE LEFT'))delete this.holds['MOVE RIGHT'];if(c.has('MOVE RIGHT'))delete this.holds['MOVE LEFT'];
 for(const a of Object.keys(this.holds))if(this.holds[a]<now||a==='FIRE BLAST'&&!prayer||a==='ICE SHIELD'&&!shield)delete this.holds[a];
 return {actions:Object.keys(this.holds),events,status:prayer?'Prayer detected — hold':shield?'Raised palms detected':torso?'Tracking body + hands':'Upper body tracked — step back for legs'};
 }
}
