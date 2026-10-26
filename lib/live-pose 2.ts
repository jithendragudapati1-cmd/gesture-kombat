import {bodyPose,type BodyPose,type Joint,type Vec} from './pose3d.ts';
import {handShape,type TrackingResult} from './gestures.ts';
// Ephemeral, local-only pose channel. No camera landmarks enter the multiplayer API.
let latest:{pose:BodyPose;at:number;translation:{x:number;y:number}}|null=null;
let anchor:{x:number;floor:number;scale:number}|null=null;
export function clearLivePose(){latest=null;anchor=null;}
export function readLiveTranslation(now=performance.now()){return latest&&now-latest.at<180?latest.translation:{x:0,y:0};}
export function readLivePose(now=performance.now()){return latest&&now-latest.at<180?latest.pose:undefined;}
export function retargetPose(result:TrackingResult):BodyPose|undefined{
 const screen=result.poseLandmarks,points=result.poseWorldLandmarks??screen;
 if(!screen||!points||screen.length<33||[11,12].some(i=>(screen[i].visibility??0)<.55))return;
 const pose=bodyPose('idle',0,0),j=pose.joints;
 const vector=(a:number,b:number,length:number):Vec=>{const x=-(points[b].x-points[a].x),y=-(points[b].y-points[a].y),z=-(points[b].z-points[a].z)*.75;const d=Math.hypot(x,y,z);return d>.001?[x/d*length,y/d*length,z/d*length]:[0,-length,0];};
 const chain=(a:Joint,b:Joint,ia:number,ib:number,length:number)=>{if((screen[ia].visibility??0)<.55||(screen[ib].visibility??0)<.55)return;const v=vector(ia,ib,length);j[b]=j[a].map((n,i)=>n+v[i]) as Vec;};
 for(const [suffix,s,e,w,h,k,a] of [['L',11,13,15,23,25,27],['R',12,14,16,24,26,28]] as const){
  chain(('shoulder'+suffix) as Joint,('elbow'+suffix) as Joint,s,e,.46);
  chain(('elbow'+suffix) as Joint,('wrist'+suffix) as Joint,e,w,.44);
  chain(('hip'+suffix) as Joint,('knee'+suffix) as Joint,h,k,.64);
  chain(('knee'+suffix) as Joint,('ankle'+suffix) as Joint,k,a,.61);
 }
 // Ground the feet without changing character scale; hidden legs keep a stable stance.
 if([25,26,27,28].every(i=>(screen[i].visibility??0)>.55)){
  const floor=Math.min(j.ankleL[1],j.ankleR[1]);pose.rootY=Math.max(-.65,Math.min(.2,.14-floor));
 }
 const shoulders=(screen[11].x+screen[12].x)/2,hips=[23,24].every(i=>(screen[i].visibility??0)>.55)?(screen[23].x+screen[24].x)/2:shoulders;
 j.chest[0]=Math.max(-.22,Math.min(.22,(hips-shoulders)*1.7));j.head[0]=j.chest[0];
 pose.openL=handShape(result.leftHandLandmarks)?.open??false;pose.openR=handShape(result.rightHandLandmarks)?.open??false;
 return pose;
}
export function publishLivePose(result:TrackingResult,now=performance.now()){
 const pose=retargetPose(result),p=result.poseLandmarks;
 if(!pose||!p){latest=null;return;}
 if(latest&&now-latest.at>800)anchor=null;
 let translation={x:0,y:0};
 if([11,12,23,24,27,28].every(i=>(p[i].visibility??0)>.55)){
  const hip={x:(p[23].x+p[24].x)/2,y:(p[23].y+p[24].y)/2},shoulder={x:(p[11].x+p[12].x)/2,y:(p[11].y+p[12].y)/2};
  const floor=Math.max(p[27].y,p[28].y);
  anchor??={x:hip.x,floor,scale:Math.max(.12,Math.hypot(hip.x-shoulder.x,hip.y-shoulder.y))};
  translation={x:Math.max(-1.35,Math.min(1.35,(anchor.x-hip.x)/anchor.scale*.75)),y:Math.max(0,Math.min(.7,(anchor.floor-floor)/anchor.scale*.8))};
 }
 latest={pose,at:now,translation};
}
