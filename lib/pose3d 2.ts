export type Vec=[number,number,number];
export type Joint='hipL'|'hipR'|'kneeL'|'kneeR'|'ankleL'|'ankleR'|'shoulderL'|'shoulderR'|'elbowL'|'elbowR'|'wristL'|'wristR'|'chest'|'head'|'pelvis';
export type BodyPose={joints:Record<Joint,Vec>;rootY:number;lean:number;openL:boolean;openR:boolean};
export const JOINTS:Joint[]=['hipL','hipR','kneeL','kneeR','ankleL','ankleR','shoulderL','shoulderR','elbowL','elbowR','wristL','wristR','chest','head','pelvis'];
const mix=(a:Vec,b:Vec,t:number):Vec=>a.map((v,i)=>v+(b[i]-v)*t) as Vec;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
export function bodyPose(action:string,phase:number,time:number,instructor=false):BodyPose{
 const breathe=Math.sin(time*2.8)*.012;
 const j:Record<Joint,Vec>={pelvis:[0,1.37,0],chest:[0,1.94,.01],head:[0,2.61,.02],hipL:[-.24,1.37,0],hipR:[.24,1.37,0],kneeL:[-.32,.74,.12],kneeR:[.34,.74,-.05],ankleL:[-.4,.14,.18],ankleR:[.4,.14,-.22],shoulderL:[-.43,2.17,0],shoulderR:[.43,2.17,0],elbowL:[-.57,1.77,.22],elbowR:[.57,1.77,.21],wristL:[-.35,2.03,.48],wristR:[.35,2.03,.48]};
 const p:BodyPose={joints:j,rootY:breathe,lean:0,openL:false,openR:false};
 const drive=(name:Joint,target:Vec,t=1)=>{j[name]=mix(j[name],target,clamp(t));};
 // A complete strike includes anticipation, extension, and recovery.
 const strike=phase<.18?phase/.18*.15:phase<.48?.15+(phase-.18)/.3*.85:phase<.66?1:clamp((1-phase)/.34);
 switch(action){
  case 'PUNCH':case 'punch':case 'DOUBLE PUNCH':case 'double':{
   const both=action==='double'||action==='DOUBLE PUNCH';drive('wristR',[.34,2.15,1.12],strike);drive('elbowR',[.43,2.1,.55],strike);
   if(both){drive('wristL',[-.34,2.15,1.12],strike);drive('elbowL',[-.43,2.1,.55],strike);}
   p.lean=.12*strike;break;
  }
  case 'KICK':case 'kick':{
   drive('kneeR',[.3,1.52,.56],clamp(strike*2));drive('ankleR',[.32,1.77,1.22],strike);drive('wristL',[-.42,2.05,.35]);p.lean=-.14*strike;break;
  }
  case 'BLOCK':case 'block':drive('wristL',[.29,2.28,.48]);drive('wristR',[-.29,2.28,.57]);drive('elbowL',[-.50,1.93,.32]);drive('elbowR',[.50,1.93,.4]);break;
  case 'ICE SHIELD':case 'ice':{
   drive('elbowL',[-.58,2.15,.1]);drive('elbowR',[.58,2.15,.1]);drive('wristL',[-.62,2.58,.43]);drive('wristR',[.62,2.58,.43]);p.openL=p.openR=true;break;
  }
  case 'FIRE BLAST':case 'fire':{
   // Prayer is the actual input; the fighter's cast extends out from the chest.
   if(instructor){drive('wristL',[-.065,2.12,.52]);drive('wristR',[.065,2.12,.52]);drive('elbowL',[-.53,1.85,.2]);drive('elbowR',[.53,1.85,.2]);}
   else{drive('wristL',[-.21,2.04,.5+strike*.65]);drive('wristR',[.21,2.04,.5+strike*.65]);drive('elbowL',[-.44,2.02,.35]);drive('elbowR',[.44,2.02,.35]);}
   p.openL=p.openR=true;break;
  }
  case 'COMBO ENERGY':case 'combo':{
   const spread=instructor?(.1+Math.pow(Math.sin(phase*Math.PI),2)*.83):.65;
   drive('wristL',[-spread,2.07,.58]);drive('wristR',[spread,2.07,.58]);drive('elbowL',[-.55,1.96,.22]);drive('elbowR',[.55,1.96,.22]);p.openL=p.openR=true;break;
  }
  case 'LIGHTNING':case 'lightning':drive('wristR',[.51,3.02,.12]);drive('elbowR',[.56,2.64,.05]);p.openR=true;break;
  case 'BEND':case 'duck':{
   const amount=instructor?.6+.4*Math.sin(Math.PI*phase):1;
   for(const n of ['pelvis','hipL','hipR','chest','head','shoulderL','shoulderR','elbowL','elbowR','wristL','wristR'] as Joint[])j[n][1]-=.65*amount;
   drive('kneeL',[-.54,.60,.43]);drive('kneeR',[.54,.60,.38]);p.lean=.2;break;
  }
  case 'JUMP':case 'jump':p.rootY+=Math.max(0,Math.sin(phase*Math.PI))*.62;drive('kneeL',[-.3,.92,.25]);drive('kneeR',[.3,.92,.15]);drive('ankleL',[-.35,.32,0]);drive('ankleR',[.35,.32,-.1]);break;
  case 'MOVE LEFT':case 'MOVE RIGHT':case 'WALK':case 'RUN':case 'walk':case 'run':{
   const run=action==='RUN'||action==='run',swing=Math.sin(time*(run?15:9)),amp=run?.43:.28;
   j.ankleL[2]+=swing*amp;j.ankleR[2]-=swing*amp;j.kneeL[2]+=swing*amp*.6;j.kneeR[2]-=swing*amp*.6;
   j.ankleL[1]+=Math.max(0,swing)*.18;j.ankleR[1]+=Math.max(0,-swing)*.18;
   drive('wristL',[-.42,1.7,.28-swing*.22]);drive('wristR',[.42,1.7,.28+swing*.22]);p.rootY+=Math.abs(swing)*.035;break;
  }
  case 'hit':p.lean=-.25*Math.sin(phase*Math.PI);drive('wristR',[.62,1.8,.3]);break;
  case 'victory':drive('wristR',[.49,3.05,.1]);drive('elbowR',[.57,2.65,.1]);break;
  case 'defeat':p.rootY=-1.05;p.lean=-1.05;break;
 }
 if(instructor&&action==='MOVE LEFT')j.pelvis[0]-=Math.sin(phase*Math.PI)*.35;
 if(instructor&&action==='MOVE RIGHT')j.pelvis[0]+=Math.sin(phase*Math.PI)*.35;
 if(instructor&&['BLOCK','ICE SHIELD','FIRE BLAST','LIGHTNING','BEND','COMBO ENERGY'].includes(action)){
  const weight=phase<.2?clamp(phase/.2):phase<.72?1:clamp((1-phase)/.28);
  const neutral=bodyPose('idle',0,time,false);
  for(const n of JOINTS)p.joints[n]=mix(neutral.joints[n],p.joints[n],weight);
  p.lean*=weight;if(weight<.45){p.openL=false;p.openR=false;}
 }
 return p;
}
