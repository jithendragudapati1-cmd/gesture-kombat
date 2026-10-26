import * as T from 'three';
import {ATTACKS,projectileX} from './attack-specs.ts';
export type EffectInput={action:string;age:number;time:number;origin:number;direction:number;target:number;active:boolean;solo:boolean;originZ?:number;directionZ?:number;targetZ?:number;hands?:[T.Vector3,T.Vector3];facing?:T.Vector3};
export function createPowerEffects(scene:T.Scene){
 const group=new T.Group();group.visible=false;scene.add(group);
 const orb=new T.Group();group.add(orb);
 for(const [radius,color] of [[.22,0xfff4af],[.32,0xffa018],[.43,0xff3b0a]]){const mesh=new T.Mesh(new T.SphereGeometry(radius,16,12),new T.MeshBasicMaterial({color,transparent:true,opacity:radius>.3?.4:.95,depthWrite:false,blending:T.AdditiveBlending}));orb.add(mesh);}
 const dust=new T.BufferGeometry(),values=new Float32Array(42*3);dust.setAttribute('position',new T.BufferAttribute(values,3));const particles=new T.Points(dust,new T.PointsMaterial({color:0xff9d29,size:.065,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));group.add(particles);
 const bolt=new T.Line(new T.BufferGeometry().setFromPoints(Array.from({length:22},()=>new T.Vector3())),new T.LineBasicMaterial({color:0xbfefff,transparent:true,blending:T.AdditiveBlending}));group.add(bolt);for(const sign of [-1,1]){const branch=new T.Line(new T.BufferGeometry().setFromPoints(Array.from({length:22},()=>new T.Vector3())),new T.LineBasicMaterial({color:0x1689ff,transparent:true,opacity:.85,blending:T.AdditiveBlending}));branch.userData.sign=sign;bolt.add(branch);}
 const blastLight=new T.PointLight(0xff6c17,0,4);group.add(blastLight);
 const ring=new T.Mesh(new T.TorusGeometry(.42,.035,8,40),new T.MeshBasicMaterial({color:0x70dbff,transparent:true,opacity:.8,blending:T.AdditiveBlending,depthWrite:false}));group.add(ring);
 const marker=new T.Mesh(new T.RingGeometry(.6,.68,48),new T.MeshBasicMaterial({color:0xa1dcff,transparent:true,opacity:.65,side:T.DoubleSide}));marker.rotation.x=-Math.PI/2;marker.position.y=.02;group.add(marker);
 const streak=new T.LineSegments(new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(new Float32Array(18*6),3)),new T.LineBasicMaterial({color:0xa3e7ff,transparent:true,opacity:.95,blending:T.AdditiveBlending}));group.add(streak);
 const flames=new T.Group();orb.add(flames);for(let i=0;i<7;i++){const flame=new T.Mesh(new T.ConeGeometry(.09,.48,5),new T.MeshBasicMaterial({color:i%2?0xff6a0a:0xffc24e,transparent:true,opacity:.8,blending:T.AdditiveBlending,depthWrite:false}));flames.add(flame);}
 let previousAction="",previousAge=-1,launch:T.Vector3|undefined;
 return {update(input:EffectInput){
  const {action,age,time,origin,direction,target,solo}=input,spec=ATTACKS[action],active=input.active&&age>=0&&age<(spec?.duration??650);
  group.visible=active;if(!active)return;
  if(action!==previousAction||age<previousAge)launch=undefined;previousAction=action;previousAge=age;
  const fire=action==='FIRE BLAST',combo=action==='COMBO ENERGY',lightning=action==='LIGHTNING',melee=['PUNCH','DOUBLE PUNCH','KICK'].includes(action);
  orb.visible=fire||combo;particles.visible=fire||combo||action==='KICK';bolt.visible=lightning;ring.visible=combo||action==='KICK';streak.visible=(action==='PUNCH'||action==='DOUBLE PUNCH')&&age>80&&age<450;marker.visible=lightning;blastLight.intensity=fire||combo?7:lightning?12:0;
  const flight=Math.max(0,age-(spec?.windup??0));
  const x=solo?direction*Math.min(2.7,flight/450*2.7):(projectileX(origin,direction,action,flight)-50)*.115;
  const originZ=input.originZ??0,directionZ=input.directionZ??0;const z=solo?0:projectileX(originZ,directionZ,action,flight)*.115;
  const palms=input.hands?input.hands[0].clone().add(input.hands[1]).multiplyScalar(.5):new T.Vector3(solo?0:(origin-50)*.115,1.85,originZ*.115);
  if(flight===0)launch=undefined;else launch??=palms.clone();
  orb.position.copy(flight>0?launch!:palms);if(flight>0){const forward=solo?(input.facing??new T.Vector3(0,0,1)):new T.Vector3(direction,0,directionZ);const travel=solo?Math.min(3.6,flight/400*2):Math.hypot(x-(origin-50)*.115,z-originZ*.115);orb.position.addScaledVector(forward,travel);}
  flames.visible=fire;for(let i=0;i<flames.children.length;i++){const f=flames.children[i],a=i*2.4+time*4;f.position.set(Math.cos(a)*.22,Math.sin(a)*.22,-.25);f.rotation.set(Math.PI/2+Math.sin(time*8+i)*.3,0,a);f.scale.y=.7+Math.sin(time*14+i)*.25;}
 orb.scale.setScalar((combo?1.35:1)*(age<(spec?.windup??0)?.35+age/(spec?.windup??1)*.65:1));orb.rotation.y=time*6;
  for(const child of orb.children.filter(c=>c instanceof T.Mesh))(child as T.Mesh<T.SphereGeometry,T.MeshBasicMaterial>).material.color.setHex(combo?0xa23dff:child===orb.children[0]?0xfff4af:child===orb.children[1]?0xffa018:0xff3b0a);
  const impactX=solo?direction*1.1:(origin-50)*.115+direction*.95;
  ring.position.set(melee?impactX:x,action==='KICK'?1.2:1.9,0);ring.rotation.y=solo?0:Math.PI/2;ring.scale.setScalar(.3+Math.sin(Math.min(1,age/(spec?.duration??650))*Math.PI)*(action==='DOUBLE PUNCH'?1.6:1));
  const attr=dust.getAttribute('position');for(let i=0;i<42;i++){const t=((age/600+i/42)%1),a=i*2.399;attr.setXYZ(i,(melee?impactX:orb.position.x)-direction*t*.95+Math.cos(a)*t*.28,(action==='KICK'?1.2:orb.position.y)+Math.sin(a)*t*.5,orb.position.z+t*Math.sin(a*2)*.4);}attr.needsUpdate=true;
  (particles.material as T.PointsMaterial).color.setHex(combo?0xd273ff:melee?0xb7efff:0xff8d22);
  const strikeX=solo?palms.x+(input.facing?.x??0)*1.2:(target-50)*.115;const strikeZ=solo?palms.z+(input.facing?.z??1)*1.2:(input.targetZ??0)*.115;marker.position.z=strikeZ;marker.position.x=strikeX;marker.scale.setScalar(1+Math.sin(time*12)*.1);
  const buffer=bolt.geometry.getAttribute('position');for(let i=0;i<22;i++)buffer.setXYZ(i,strikeX+(i===0||i===21?0:Math.sin(i*7+Math.floor(time*24))*.17),6.2-i*.28,strikeZ+Math.cos(i*11+time*30)*.16);buffer.needsUpdate=true;for(const b of bolt.children){const branch=b as T.Line,buffer=branch.geometry.getAttribute('position');for(let i=0;i<22;i++)buffer.setXYZ(i,strikeX+(branch.userData.sign as number)*(1-i/22)*.75+Math.sin(i*4+time*25)*.16,5.8-i*.26,strikeZ+Math.cos(i*8+time*20)*.25);buffer.needsUpdate=true;}bolt.visible=lightning&&age>=(spec?.windup??0);marker.visible=lightning&&age<(spec?.windup??0);
  const trail=streak.geometry.getAttribute('position'),forward=input.facing??new T.Vector3(direction,0,directionZ);for(let i=0;i<18;i++){const hand=input.hands?.[action==='DOUBLE PUNCH'?i%2:(input.hands[0].dot(forward)>input.hands[1].dot(forward)?0:1)]??new T.Vector3(impactX,1.9,originZ*.115),spread=(i%9-4)*.022,length=.18+(i%4)*.07;trail.setXYZ(i*2,hand.x+spread,hand.y+spread,hand.z);trail.setXYZ(i*2+1,hand.x-forward.x*length+spread,hand.y+spread*.7,hand.z-forward.z*length);}trail.needsUpdate=true;
  blastLight.position.copy(lightning?new T.Vector3(strikeX,2,strikeZ):orb.position);
 }};
}
