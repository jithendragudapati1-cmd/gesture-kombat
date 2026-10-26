import {buildArena} from './arena-environment';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createPowerEffects} from './power-effects';
import {ATTACKS} from './attack-specs';
import * as T from 'three';
import {ARENAS,type ArenaId} from './arenas';
import type {CharacterId} from './characters';
import type {BodyPose} from './pose3d';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createRig,type ModelRig as Rig} from './model-rig';
import {animationFor} from './animation';
import {characterFor} from './characters';
import type {Fighter} from './combat';
export type SceneInput={inspect?:boolean;localYaw?:number;liveTranslation?:{x:number;y:number;z?:number};fighters:Fighter[];now:number;localPose?:BodyPose;localSide?:number;outcome?:number|null;instructorAction?:string;instructorPhase?:number;soloMode?:'live'|'training';selectedCharacter?:CharacterId;soloActions?:string[]};
export function mountScene(canvas:HTMLCanvasElement,instructor:boolean,read:()=>SceneInput,arenaId:ArenaId='moon-citadel'){
 delete canvas.dataset.error;canvas.dataset.modelState='loading';
 const arena=ARENAS[arenaId];
 const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.25));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.shadowMap.autoUpdate=false;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
 const scene=new T.Scene();scene.background=null;renderer.setClearColor(0x000000,0);
 const camera=new T.PerspectiveCamera(instructor?34:37,2,0.1,70);camera.position.set(instructor?.12:0,instructor?2.35:3.3,instructor?6.9:8.1);camera.lookAt(0,1.5,0);
 const pmrem=new T.PMREMGenerator(renderer),environment=new RoomEnvironment();const env=pmrem.fromScene(environment,.04);scene.environment=env.texture;scene.environmentIntensity=.65;environment.dispose();pmrem.dispose();
 scene.add(new T.HemisphereLight(0xdceaff,0x626778,2.1));
 const key=new T.DirectionalLight(0xfff5ed,4);key.position.set(-3,7,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-7;key.shadow.camera.right=7;key.shadow.camera.top=6;key.shadow.camera.bottom=-5;key.shadow.normalBias=.035;scene.add(key);
 for(const [color,x]of [[0x1cb7ff,-5],[0xff275c,5]]){const light=new T.PointLight(color,35,16,2);light.position.set(x,3,-1.8);scene.add(light);}
 const ground=new T.Mesh(new T.PlaneGeometry(50,40),new T.ShadowMaterial({color:0x000000,opacity:.32}));ground.rotation.x=-Math.PI/2;ground.position.y=-.035;ground.receiveShadow=true;scene.add(ground);const arenaMotion=buildArena(scene,arenaId);
 const orbit=instructor?new OrbitControls(camera,canvas):null;if(orbit){orbit.target.set(0,1.5,0);orbit.enablePan=false;orbit.enableDamping=true;orbit.dampingFactor=.12;orbit.minDistance=3.5;orbit.maxDistance=11;orbit.minPolarAngle=.22;orbit.maxPolarAngle=Math.PI/2+.1;orbit.update();}
 const resetView=()=>{camera.position.copy(baseCamera);orbit?.target.set(0,1.5,0);orbit?.update();};canvas.addEventListener('gk-reset-view',resetView);
 const baseCamera=camera.position.clone();let impact=0,lastHit=0,framingX=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const powers=[createPowerEffects(scene),createPowerEffects(scene)];
 let soloEffect='',soloEffectAt=0;const heldSpecial=new Set<string>();
 const rigs:Rig[]=[];let ids:string[]=[];let last=performance.now();
 const sparks=new T.BufferGeometry(),positions=new Float32Array(90*3);for(let i=0;i<90;i++){positions[i*3]=(Math.random()-.5)*16;positions[i*3+1]=Math.random()*6;positions[i*3+2]=(Math.random()-.5)*10;}
 sparks.setAttribute('position',new T.BufferAttribute(positions,3));const points=new T.Points(sparks,new T.PointsMaterial({color:0xb882da,size:.018,transparent:true,opacity:.55,depthWrite:false}));scene.add(points);
 function resize(){const rect=canvas.getBoundingClientRect();if(rect.width<2||rect.height<2)return;renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.position.z=(instructor?6.9:8.1)*Math.max(1,(instructor?1.1:1.65)/camera.aspect);baseCamera.copy(camera.position);camera.lookAt(0,1.5,0);camera.updateProjectionMatrix();}
 const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
 let disposed=false,visible=true,lastRender=0,lastShadow=0,lastTracking=false;const intersection=new IntersectionObserver(e=>{visible=e[0]?.isIntersecting??true;});intersection.observe(canvas);
 renderer.setAnimationLoop(()=>{
  if(disposed||document.hidden||!visible){last=performance.now();return;}
  const clock=performance.now(),tracking=document.documentElement.dataset.motionActive==='true';if(clock-lastRender<16)return;lastRender=clock;if(tracking!==lastTracking){renderer.shadowMap.enabled=!tracking;renderer.setPixelRatio(Math.min(devicePixelRatio,tracking?.85:1.25));lastTracking=tracking;resize();}if(clock-lastShadow>180){renderer.shadowMap.needsUpdate=true;lastShadow=clock;}const frame=read(),time=frame.now/1000,dt=Math.min(.05,(clock-last)/1000);last=clock;
  if(instructor&&frame.soloMode==='live'){const actions=frame.soloActions??[];for(const a of [...heldSpecial])if(!actions.includes(a))heldSpecial.delete(a);for(const a of actions)if(ATTACKS[a]&&!heldSpecial.has(a)){soloEffect=a;soloEffectAt=frame.now;heldSpecial.add(a);}}
  const nextIds=instructor?[frame.selectedCharacter??'raven']:frame.fighters.map((p,i)=>characterFor(p,i).id);
  if(nextIds.join('|')!==ids.join('|')){
   for(const r of rigs){r.cancel();scene.remove(r.group);disposeObject(r.group);}rigs.length=0;ids=nextIds;
   for(const id of ids){const rig=createRig(id as 'human'|'raven'|'vortex');scene.add(rig.group);rigs.push(rig);}
  }
  canvas.dataset.modelState=rigs.every(r=>r.loaded)?'ready':'loading';const failure=rigs.find(r=>r.error);if(failure)canvas.dataset.error=failure.error;
  rigs.forEach((r,side)=>{
   const p=frame.fighters[side];if(!p&&!instructor)return;
   let action='idle',phase=0;
   if(instructor){action=frame.soloMode==='live'?'idle':frame.instructorAction??'idle';phase=frame.instructorPhase??0;r.group.position.x=frame.soloMode==='live'?(frame.liveTranslation?.x??0):action==='MOVE LEFT'?-Math.sin(phase*Math.PI)*.55:action==='MOVE RIGHT'?Math.sin(phase*Math.PI)*.55:0;r.group.position.z=frame.soloMode==='live'?(frame.liveTranslation?.z??0):0;r.group.rotation.y=frame.soloMode==='live'?(frame.localYaw??0):.08;r.group.position.y=frame.soloMode==='live'?(frame.liveTranslation?.y??0):0;}
   else{
    const won=frame.outcome===side,lost=frame.outcome!==undefined&&frame.outcome!==null&&frame.outcome!==-1&&!won;
    const a=animationFor(lost?{...p,hp:0}:p,frame.now,won);action=a.name;phase=a.phase;
    r.group.position.x=(p.x-50)*.115;r.group.position.z=(p.z??0)*.115;r.group.rotation.y=(side===frame.localSide?(frame.localYaw??0):(p.yaw??0))+(p.x<=(frame.fighters[1-side]?.x??p.x)?Math.PI/2:-Math.PI/2);
   }
   r.update(frame.inspect?'rest':action,phase,time,dt,side===frame.localSide&&!['hit','defeat','victory'].includes(action)?frame.localPose:undefined,instructor?(frame.soloActions??[]):p?.actions,instructor&&frame.soloMode==='training');
   const ice=instructor?(frame.soloMode==='live'?frame.soloActions?.includes('ICE SHIELD'):action==='ICE SHIELD'):p.shieldUntil>frame.now,block=instructor?(frame.soloMode==='live'?frame.soloActions?.includes('BLOCK'):action==='BLOCK'):p.actions.includes('BLOCK');
   r.shield.visible=!!(ice||block);r.shieldLines.visible=!!(ice||block);
   const breathing=1+Math.sin(time*2.5)*.012;
   r.shield.scale.set((ice?1:.62)*breathing,ice?1.35:.85,ice?.8:.24);r.shield.position.set(0,1.57,ice?.12:.76);r.shieldLines.scale.copy(r.shield.scale);r.shieldLines.position.copy(r.shield.position);r.shieldLines.rotation.y=time*.12;
   r.beam.visible=r.lightning.visible=r.burst.visible=false;
   const live=instructor&&frame.soloMode==='live',effect=instructor?(live?soloEffect:action):p.effect;
   const spec=ATTACKS[effect],age=instructor?(live?frame.now-soloEffectAt:phase*(spec?.duration??700)):frame.now-p.effectAt;
   powers[side].update({action:effect,age,time,origin:instructor?50:(p.effectX??p.x),direction:instructor?1:(p.effectDirection??(side===0?1:-1)),target:instructor?60:(p.effectTarget??frame.fighters[1-side]?.x??50),active:!!spec,solo:instructor,originZ:p?.effectZ??p?.z??0,directionZ:p?.effectDirectionZ??0,targetZ:p?.effectTargetZ??0,hands:[r.hands[0].getWorldPosition(new T.Vector3()),r.hands[1].getWorldPosition(new T.Vector3())],facing:r.group.getWorldDirection(new T.Vector3())});

  });
  const hit=Math.max(...frame.fighters.map(p=>p.hitAt),0);if(hit>lastHit){lastHit=hit;impact=1;}
  impact=Math.max(0,impact-dt*7);if(!instructor)camera.position.copy(baseCamera);else orbit?.update();
  if(!instructor&&frame.fighters.length===2){const midpoint=((frame.fighters[0].x+frame.fighters[1].x)/2-50)*.115;framingX=T.MathUtils.lerp(framingX,midpoint,1-Math.exp(-dt*5));camera.position.x=framingX;const spacing=Math.abs(frame.fighters[0].x-frame.fighters[1].x);camera.position.z=baseCamera.z*(.86+Math.min(1,spacing/65)*.14);camera.lookAt(framingX,1.5,0);}

  if(!instructor&&!reduced){camera.position.x+=Math.sin(clock*.12)*impact*.045;camera.position.y+=Math.cos(clock*.15)*impact*.025;}
  points.rotation.y=time*.007;arenaMotion(time);
  // Camera inference has priority. Skip post-processing while tracking is active.
  renderer.render(scene,camera);
 });
 const contextLost=(event:Event)=>{event.preventDefault();renderer.setAnimationLoop(null);canvas.dataset.error='WebGL context lost. Refresh to resume 3D.';};canvas.addEventListener('webglcontextlost',contextLost);
 return ()=>{disposed=true;orbit?.dispose();canvas.removeEventListener('gk-reset-view',resetView);rigs.forEach(r=>r.cancel());renderer.setAnimationLoop(null);observer.disconnect();intersection.disconnect();canvas.removeEventListener('webglcontextlost',contextLost);disposeObject(scene);env.dispose();renderer.dispose();};
}
function disposeObject(root:T.Object3D){const materials=new Set<T.Material>(),geometry=new Set<T.BufferGeometry>();root.traverse(node=>{if(node instanceof T.Mesh||node instanceof T.Line||node instanceof T.Points){geometry.add(node.geometry);const values=Array.isArray(node.material)?node.material:[node.material];values.forEach((m:T.Material)=>materials.add(m));}});geometry.forEach(g=>g.dispose());materials.forEach(m=>{for(const value of Object.values(m))if(value instanceof T.Texture)value.dispose();m.dispose();});}
