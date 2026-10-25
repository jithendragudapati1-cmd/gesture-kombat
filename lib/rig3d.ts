import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {bodyPose,JOINTS,type Joint,type BodyPose} from './pose3d';
export type Rig={group:T.Group;update:(action:string,phase:number,time:number,dt:number,livePose?:BodyPose,actions?:string[],demonstrate?:boolean)=>void;shield:T.Mesh;shieldLines:T.LineSegments;beam:T.Mesh;burst:T.Group;lightning:T.Line;hands:T.Group[]};
const Y=new T.Vector3(0,1,0);
export function createRig(character:'raven'|'vortex'|'human'):Rig{
 const human=character==='human',heavy=character==='vortex',color=heavy?0xff2948:0x31caff;
 const group=new T.Group(),body=new T.Group();group.add(body);
 const metal=new T.MeshPhysicalMaterial({color:heavy?0x30313c:0x243347,metalness:.68,roughness:.57,clearcoat:.18});
 const secondary=new T.MeshStandardMaterial({color:heavy?0x151320:0x101d30,metalness:.68,roughness:.44});
 const skin=new T.MeshStandardMaterial({color:0xb98364,roughness:.8});
 const shirt=new T.MeshStandardMaterial({color:0x233655,roughness:.8});
 const cloth=new T.MeshStandardMaterial({color:heavy?0x410d25:0x102750,roughness:.88,side:T.DoubleSide});
 const glow=new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:1.15,roughness:.23,metalness:.3});
 const white=new T.MeshStandardMaterial({color:0xbcefff,emissive:color,emissiveIntensity:.9});
 const nodes={} as Record<Joint,T.Vector3>;const base=bodyPose('idle',0,0,human);for(const n of JOINTS)nodes[n]=new T.Vector3(...base.joints[n]);
 function mesh(g:T.BufferGeometry,m:T.Material,parent:T.Object3D=body){const obj=new T.Mesh(g,m);obj.castShadow=true;obj.receiveShadow=true;parent.add(obj);return obj;}
 function box(w:number,h:number,d:number,m:T.Material,parent:T.Object3D=body){return mesh(new RoundedBoxGeometry(w,h,d,2,.035),m,parent);}
 function sphere(r:number,m:T.Material,parent:T.Object3D=body){return mesh(new T.SphereGeometry(r,16,12),m,parent);}
 if(!human){
  const grain=new Uint8Array(64*64*4);for(let i=0;i<64*64;i++){const v=120+Math.floor(Math.random()*35);grain.set([v,v,v,255],i*4);}
  const surface=new T.DataTexture(grain,64,64);surface.wrapS=surface.wrapT=T.RepeatWrapping;surface.repeat.set(5,5);surface.needsUpdate=true;metal.roughnessMap=surface;metal.roughness=.6;
 }
 const links:{obj:T.Group;a:Joint;b:Joint}[]=[];
 function limb(a:Joint,b:Joint,r:number,armor:boolean){
  const holder=new T.Group();body.add(holder);links.push({obj:holder,a,b});
  const exposed=!human&&!heavy&&a.startsWith('shoulder');
  const muscle=mesh(new T.CapsuleGeometry(r,Math.max(.1,1-r*2),4,12),exposed?skin:human?(a.startsWith('shoulder')||a.startsWith('hip')||a.startsWith('knee')?shirt:skin):secondary,holder);
  if(exposed){muscle.scale.set(1.15,1,1.05);}

  if(armor&&!human&&!exposed){const plate=box(r*1.9,.69,r*1.25,metal,holder);plate.position.z=r*.55;for(let n=0;n<3;n++){const rib=box(r*2.02,.055,r*1.38,metal,holder);rib.position.set(0,-.22+n*.19,r*.53);rib.rotation.x=-.12;}
   const stripe=box(.025,.5,.025,glow,holder);stripe.position.set(r*.56,0,r*1.22);}
 }
 limb('shoulderL','elbowL',heavy?.18:.135,true);limb('shoulderR','elbowR',heavy?.18:.135,true);
 limb('elbowL','wristL',heavy?.16:.12,true);limb('elbowR','wristR',heavy?.16:.12,true);
 limb('hipL','kneeL',heavy?.22:.18,!human);limb('hipR','kneeR',heavy?.22:.18,!human);
 limb('kneeL','ankleL',heavy?.18:.145,true);limb('kneeR','ankleR',heavy?.18:.145,true);
 const joints: {mesh:T.Mesh;name:Joint}[]=[];
 for(const n of ['shoulderL','shoulderR','elbowL','elbowR','kneeL','kneeR'] as Joint[]){const obj=sphere(n.startsWith('shoulder')?(heavy?.15:.12):.09,human?(n.startsWith('shoulder')?shirt:skin):metal);joints.push({mesh:obj,name:n});}
 const torso=new T.Group();body.add(torso);
 if(human)box(.67,.64,.36,shirt,torso);
 else{const profile=[new T.Vector2(.23,-.4),new T.Vector2(.28,-.23),new T.Vector2(.38,-.08),new T.Vector2(heavy?.48:.41,.16),new T.Vector2(.32,.32),new T.Vector2(.17,.39)];const cuirass=mesh(new T.LatheGeometry(profile,24),metal,torso);cuirass.scale.z=.65;}

 const waist=box(human?.49:.56,.39,.34,human?shirt:secondary,torso);waist.position.y=-.46;
 if(!human){
  for(const sign of [-1,1]){const plate=mesh(new T.SphereGeometry(heavy?.25:.21,20,12),metal,torso);plate.scale.set(1,.62,.38);plate.position.set(sign*.22,.07,.28);plate.rotation.z=sign*.16;
   const line=box(.028,.37,.035,glow,torso);line.position.set(sign*.145,.02,.35);line.rotation.z=sign*.35;
   const strap=box(.07,.64,.04,secondary,torso);strap.position.set(sign*.27,.04,.32);strap.rotation.z=sign*.18;}
  for(let i=0;i<3;i++){const abs=box(.43-i*.035,.095,.1,metal,torso);abs.position.set(0,-.31-i*.12,.23);}
  for(const sign of [-1,1]){for(let n=0;n<3;n++){const rib=box(.19,.07,.38,metal,torso);rib.position.set(sign*(.32-n*.025),-.22-n*.12,.01);rib.rotation.z=sign*.24;}}
  const core=mesh(new T.OctahedronGeometry(.105),glow,torso);core.position.set(0,.13,.31);core.scale.set(.65,1.3,.35);
  const neck=mesh(new T.CylinderGeometry(.16,.21,.23,16),secondary,torso);neck.position.y=.45;
 }
 const pelvis=new T.Group();body.add(pelvis);box(.55,.25,.36,human?shirt:metal,pelvis);
 if(!human){for(let i=-1;i<=1;i++){const buckle=box(.12,.13,.05,i===0?metal:secondary,pelvis);buckle.position.set(i*.19,0,.22);}const clothMesh=mesh(new T.PlaneGeometry(.47,.74,3,5),cloth,pelvis);clothMesh.position.set(0,-.49,.16);clothMesh.rotation.x=.12;}
 const head=new T.Group();body.add(head);
 const skull=human?sphere(.225,skin,head):mesh(new T.IcosahedronGeometry(.245,2),metal,head);skull.scale.set(1,human?1.2:1.18,.88);
 if(human){
  const neck=mesh(new T.CylinderGeometry(.09,.1,.17,12),skin,head);neck.position.y=-.26;
  const hair=sphere(.226,new T.MeshStandardMaterial({color:0x17151b,roughness:1}),head);hair.scale.set(1,.48,.9);hair.position.y=.18;
  const nose=sphere(.045,skin,head);nose.scale.set(.6,1,1.25);nose.position.set(0,-.01,.2);
  for(const sign of [-1,1]){const eye=sphere(.023,new T.MeshStandardMaterial({color:0x171923}),head);eye.position.set(sign*.085,.055,.185);const ear=sphere(.05,skin,head);ear.position.set(sign*.22,0,0);}
 }else{
  const mask=box(.36,.24,.12,secondary,head);mask.position.set(0,-.095,.2);mask.rotation.x=-.12;
  for(const sign of [-1,1]){const eye=box(.13,.036,.036,glow,head);eye.position.set(sign*.105,.055,.219);eye.rotation.z=sign*.18;
   const cheek=box(.1,.19,.045,metal,head);cheek.position.set(sign*.18,-.03,.18);cheek.rotation.z=sign*-.25;
   if(heavy){const horn=mesh(new T.ConeGeometry(.062,.3,8),metal,head);horn.position.set(sign*.19,.27,-.02);horn.rotation.z=sign*-.35;}}
  const ridge=box(.045,.36,.035,metal,head);ridge.position.set(0,.05,.22);
  if(!heavy){for(let i=0;i<16;i++){const strand=mesh(new T.ConeGeometry(.047,.17+(i%4)*.026,5),new T.MeshStandardMaterial({color:0x090b10,roughness:.92}),head);const angle=i/16*Math.PI*2;strand.position.set(Math.cos(angle)*.16,.23,Math.sin(angle)*.12-.045);strand.rotation.set(-.45+Math.sin(angle)*.3,0,-Math.cos(angle)*.48);}
   const brow=box(.38,.07,.12,secondary,head);brow.position.set(0,.11,.19);}

 }
 const hands:T.Group[]=[];const fingers:T.Group[][]=[];
 for(const side of [0,1]){
  const hand=new T.Group();body.add(hand);hands.push(hand);fingers.push([]);
  const palm=box(.16,.18,.075,human?skin:metal,hand);
  for(let i=0;i<4;i++){const finger=new T.Group();finger.position.set((i-1.5)*.042,.08,.01);hand.add(finger);fingers[side].push(finger);const f=mesh(new T.CapsuleGeometry(.018,.105,3,6),human?skin:secondary,finger);f.position.y=.06;}
  const thumb=box(.045,.1,.06,human?skin:secondary,hand);thumb.position.set(side?-.105:.105,-.005,.015);thumb.rotation.z=side?-.6:.6;
  if(!human){const band=box(.19,.06,.095,glow,hand);band.position.y=-.07;}
 }
 const boots:T.Group[]=[];
 for(let side=0;side<2;side++){const boot=new T.Group();body.add(boot);const sole=box(.25,.15,.48,human?secondary:metal,boot);const toe=mesh(new T.SphereGeometry(.15,12,8),human?secondary:metal,boot);toe.scale.set(.85,.55,1.35);toe.position.set(0,.04,.12);if(!human){const trim=box(.19,.025,.40,glow,boot);trim.position.y=-.06;}boots.push(boot);}
 if(!human){
  // Overlapping pauldrons with spikes distinguish the heavy silhouette.
  for(const sign of [-1,1]){const armor=new T.Group();body.add(armor);const pauldron=mesh(new T.IcosahedronGeometry(heavy?.29:.21,0),metal,armor);pauldron.scale.set(1.2,.65,1.06);pauldron.rotation.z=sign*-.3;
   for(let n=0;n<3;n++){const scale=box(heavy?.35:.25,.09,.35-n*.04,metal,armor);scale.position.set(sign*n*.045,-.04-n*.06,.05);scale.rotation.z=sign*-.28;}
armor.position.set(sign*.47,2.2,0);
   for(let i=0;i<(heavy?3:1);i++){const spike=mesh(new T.ConeGeometry(.05,heavy?.29:.17,6),metal,armor);spike.position.set(sign*(.1+i*.055),.14-i*.05,0);spike.rotation.z=sign*-.7;}
   joints.push({mesh:armor as unknown as T.Mesh,name:sign<0?'shoulderL':'shoulderR'});
  }
  if(!heavy){const scarf=mesh(new T.PlaneGeometry(.42,.85,4,7),cloth,torso);scarf.position.set(-.09,-.18,-.38);scarf.rotation.x=-.25;}
 }
 const shield=new T.Mesh(new T.SphereGeometry(1.18,32,22),new T.ShaderMaterial({uniforms:{time:{value:0}},vertexShader:`varying vec3 vN;varying vec3 vV;varying vec3 vP;void main(){vP=position;vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,fragmentShader:`uniform float time;varying vec3 vN;varying vec3 vV;varying vec3 vP;void main(){float rim=pow(1.-abs(dot(normalize(vN),normalize(vV))),2.2);float scan=pow(.5+.5*sin(vP.y*25.-time*3.),18.)*.13;float wave=pow(.5+.5*sin(length(vP.xy)*18.-time*5.),24.)*.1;gl_FragColor=vec4(mix(vec3(.06,.3,.55),vec3(.4,.85,1.),rim),.055+rim*.7+scan+wave);}`,transparent:true,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending}));shield.scale.set(1,1.35,.8);shield.position.set(0,1.6,.12);shield.visible=false;group.add(shield);
 const shieldLines=new T.LineSegments(new T.WireframeGeometry(new T.IcosahedronGeometry(1.2,1)),new T.LineBasicMaterial({color:0x7ce4ff,transparent:true,opacity:.32,depthWrite:false}));shieldLines.scale.copy(shield.scale);shieldLines.position.copy(shield.position);shieldLines.visible=false;group.add(shieldLines);
 const beam=new T.Mesh(new T.SphereGeometry(.19,16,12),new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:4,transparent:true,opacity:.95}));beam.visible=false;group.add(beam);
 const tail=mesh(new T.ConeGeometry(.17,.8,12),new T.MeshBasicMaterial({color,transparent:true,opacity:.42,depthWrite:false}),beam);tail.rotation.x=-Math.PI/2;tail.position.z=-.44;
 const boltGeometry=new T.BufferGeometry();boltGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array(42),3));const lightning=new T.Line(boltGeometry,new T.LineBasicMaterial({color:0xb6eaff,transparent:true,opacity:.95}));lightning.visible=false;group.add(lightning);
 const burst=new T.Group();group.add(burst);burst.visible=false;
 for(let i=0;i<8;i++){const shard=mesh(new T.ConeGeometry(.035,.23,5),white,burst);const angle=i*Math.PI/4;shard.position.set(Math.cos(angle)*.3,Math.sin(angle)*.3,0);shard.rotation.z=angle-Math.PI/2;}
 // Batch decorative armor per moving part/material to reduce draw calls.
 const movable=new Set(joints.map(j=>j.mesh));
 const holders:T.Group[]=[];body.traverse(o=>{if(o instanceof T.Group)holders.push(o);});
 for(const holder of holders){const batches=new Map<T.Material,T.Mesh[]>();for(const child of holder.children){if(!(child instanceof T.Mesh)||movable.has(child)||child.children.length||Array.isArray(child.material))continue;const list=batches.get(child.material)??[];list.push(child);batches.set(child.material,list);}
  for(const [material,parts] of batches){if(parts.length<2)continue;const buffers=parts.map(part=>{part.updateMatrix();const geometry=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();return geometry.applyMatrix4(part.matrix);});const combined=mergeGeometries(buffers);buffers.forEach(g=>g.dispose());if(!combined)continue;const merged=new T.Mesh(combined,material);merged.castShadow=true;merged.receiveShadow=true;holder.add(merged);for(const part of parts){holder.remove(part);part.geometry.dispose();}}
 }
 const rig:Rig={group,shield,shieldLines,beam,burst,lightning,hands,update(action,phase,time,dt,livePose,actions=[],demonstrate=false){
  (shield.material as T.ShaderMaterial).uniforms.time.value=time;
  const pose=livePose??bodyPose(action,phase,time,human||demonstrate),alpha=1-Math.exp(-Math.min(dt,.06)*(livePose?48:28));
  if(!livePose&&!human&&actions.some(a=>['WALK','RUN','MOVE LEFT','MOVE RIGHT'].includes(a))&&!['kick','defeat','jump'].includes(action)){
   const gait=bodyPose(actions.includes('RUN')?'run':'walk',phase,time);
   for(const n of ['hipL','hipR','kneeL','kneeR','ankleL','ankleR'] as Joint[])pose.joints[n]=gait.joints[n];
   pose.rootY+=gait.rootY;
  }
  for(const n of JOINTS)nodes[n].lerp(new T.Vector3(...pose.joints[n]),alpha);
  body.position.y=T.MathUtils.lerp(body.position.y,pose.rootY,alpha);body.rotation.x=T.MathUtils.lerp(body.rotation.x,pose.lean,alpha);
  for(const link of links){const a=nodes[link.a],b=nodes[link.b],diff=b.clone().sub(a);link.obj.position.copy(a).add(b).multiplyScalar(.5);link.obj.quaternion.setFromUnitVectors(Y,diff.clone().normalize());link.obj.scale.y=diff.length();}
  for(const joint of joints)joint.mesh.position.copy(nodes[joint.name]);
  torso.position.copy(nodes.chest);torso.rotation.y=Math.sin(time*2)*.018+(!livePose&&['punch','kick'].includes(action)?Math.sin(phase*Math.PI)*.22:0);head.position.copy(nodes.head);pelvis.position.copy(nodes.pelvis);
  for(let i=0;i<2;i++){hands[i].position.copy(nodes[i?'wristR':'wristL']);const open=i?pose.openR:pose.openL;hands[i].rotation.set(0,action==='FIRE BLAST'&&(human||demonstrate)?(i?-Math.PI/2:Math.PI/2):0,0);for(const f of fingers[i])f.rotation.x=T.MathUtils.lerp(f.rotation.x,open?0:1.65,alpha);boots[i].position.copy(nodes[i?'ankleR':'ankleL']);boots[i].position.z+=.1;}
 }};
 return rig;
}
