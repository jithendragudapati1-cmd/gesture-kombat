import * as T from 'three';
import {ATTACKS,projectileX} from './attack-specs.ts';
export type EffectInput={action:string;age:number;time:number;origin:number;direction:number;target:number;active:boolean;solo:boolean};
export function createPowerEffects(scene:T.Scene){
 const group=new T.Group();group.visible=false;scene.add(group);
 const orb=new T.Group();group.add(orb);
 for(const [radius,color] of [[.22,0xfff4af],[.32,0xffa018],[.43,0xff3b0a]]){const mesh=new T.Mesh(new T.SphereGeometry(radius,16,12),new T.MeshBasicMaterial({color,transparent:true,opacity:radius>.3?.4:.95,depthWrite:false,blending:T.AdditiveBlending}));orb.add(mesh);}
 const dust=new T.BufferGeometry(),values=new Float32Array(42*3);dust.setAttribute('position',new T.BufferAttribute(values,3));const particles=new T.Points(dust,new T.PointsMaterial({color:0xff9d29,size:.065,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));group.add(particles);
 const bolt=new T.Line(new T.BufferGeometry().setFromPoints(Array.from({length:22},()=>new T.Vector3())),new T.LineBasicMaterial({color:0xbfefff,transparent:true,blending:T.AdditiveBlending}));group.add(bolt);
 const blastLight=new T.PointLight(0xff6c17,0,4);group.add(blastLight);
 const ring=new T.Mesh(new T.TorusGeometry(.42,.035,8,40),new T.MeshBasicMaterial({color:0x70dbff,transparent:true,opacity:.8,blending:T.AdditiveBlending,depthWrite:false}));group.add(ring);
 const marker=new T.Mesh(new T.RingGeometry(.32,.39,32),new T.MeshBasicMaterial({color:0xa1dcff,transparent:true,opacity:.65,side:T.DoubleSide}));marker.rotation.x=-Math.PI/2;marker.position.y=.02;group.add(marker);
 return {update(input:EffectInput){
  const {action,age,time,origin,direction,target,solo}=input,spec=ATTACKS[action],active=input.active&&age>=0&&age<(spec?.duration??650);
  group.visible=active;if(!active)return;
  const fire=action==='FIRE BLAST',combo=action==='COMBO ENERGY',lightning=action==='LIGHTNING',melee=['PUNCH','DOUBLE PUNCH','KICK'].includes(action);
  orb.visible=fire||combo;particles.visible=fire||combo||melee;bolt.visible=lightning;ring.visible=combo||melee;marker.visible=lightning;blastLight.intensity=fire||combo?7:lightning?12:0;
  const flight=Math.max(0,age-(spec?.windup??0));
  const x=solo?direction*Math.min(2.7,flight/450*2.7):(projectileX(origin,direction,action,flight)-50)*.115;
  orb.position.set(x,1.85,0);orb.scale.setScalar((combo?1.35:1)*(age<(spec?.windup??0)?.35+age/(spec?.windup??1)*.65:1));orb.rotation.y=time*6;
  for(const child of orb.children)(child as T.Mesh<T.SphereGeometry,T.MeshBasicMaterial>).material.color.setHex(combo?0xa23dff:child===orb.children[0]?0xfff4af:child===orb.children[1]?0xffa018:0xff3b0a);
  const impactX=solo?direction*1.1:(origin-50)*.115+direction*.95;
  ring.position.set(melee?impactX:x,action==='KICK'?1.2:1.9,0);ring.rotation.y=solo?0:Math.PI/2;ring.scale.setScalar(.3+Math.sin(Math.min(1,age/(spec?.duration??650))*Math.PI)*(action==='DOUBLE PUNCH'?1.6:1));
  const attr=dust.getAttribute('position');for(let i=0;i<42;i++){const t=((age/600+i/42)%1),a=i*2.399;attr.setXYZ(i,(melee?impactX:x)-direction*t*.95+Math.cos(a)*t*.28,(action==='KICK'?1.2:1.85)+Math.sin(a)*t*.5,t*Math.sin(a*2)*.4);}attr.needsUpdate=true;
  (particles.material as T.PointsMaterial).color.setHex(combo?0xd273ff:melee?0xb7efff:0xff8d22);
  const strikeX=solo?direction*1.0:(target-50)*.115;marker.position.x=strikeX;marker.scale.setScalar(1+Math.sin(time*12)*.1);
  const buffer=bolt.geometry.getAttribute('position');for(let i=0;i<22;i++)buffer.setXYZ(i,strikeX+(i===0||i===21?0:Math.sin(i*7+Math.floor(time*24))*.17),4.8-i*.19,Math.cos(i*11+time*30)*.09);buffer.needsUpdate=true;bolt.visible=lightning&&age>=(spec?.windup??0);marker.visible=lightning&&age<(spec?.windup??0);
  blastLight.position.copy(lightning?new T.Vector3(strikeX,2,0):orb.position);
 }};
}
