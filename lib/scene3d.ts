import * as T from 'three';
import {ARENAS,type ArenaId} from './arenas';
import type {CharacterId} from './characters';
import type {BodyPose} from './pose3d';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createRig,type ModelRig as Rig} from './model-rig';
import {animationFor} from './animation';
import {characterFor} from './characters';
import type {Fighter} from './combat';
export type SceneInput={liveTranslation?:{x:number;y:number};fighters:Fighter[];now:number;localPose?:BodyPose;localSide?:number;outcome?:number|null;instructorAction?:string;instructorPhase?:number;soloMode?:'live'|'training';selectedCharacter?:CharacterId;soloActions?:string[]};
export function mountScene(canvas:HTMLCanvasElement,instructor:boolean,read:()=>SceneInput,arenaId:ArenaId='moon-citadel'){
 delete canvas.dataset.error;canvas.dataset.modelState='loading';
 const arena=ARENAS[arenaId];
 const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.25));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.shadowMap.autoUpdate=false;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
 const scene=new T.Scene();scene.background=null;renderer.setClearColor(0x000000,0);
 const camera=new T.PerspectiveCamera(instructor?34:37,2,0.1,70);camera.position.set(instructor?.12:0,instructor?2.35:3.3,instructor?6.9:8.1);camera.lookAt(0,1.5,0);
 const pmrem=new T.PMREMGenerator(renderer),environment=new RoomEnvironment();const env=pmrem.fromScene(environment,.04);scene.environment=env.texture;scene.environmentIntensity=.4;environment.dispose();pmrem.dispose();
 scene.add(new T.HemisphereLight(arena.fill,0x181027,1.7));
 const key=new T.DirectionalLight(arena.key,3.4);key.position.set(-3,7,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-7;key.shadow.camera.right=7;key.shadow.camera.top=6;key.shadow.camera.bottom=-5;key.shadow.normalBias=.035;scene.add(key);
 for(const [color,x]of [[0x1cb7ff,-5],[0xff275c,5]]){const light=new T.PointLight(color,35,16,2);light.position.set(x,3,-1.8);scene.add(light);}
 const ground=new T.Mesh(new T.PlaneGeometry(50,40),new T.ShadowMaterial({color:0x000000,opacity:.32}));ground.rotation.x=-Math.PI/2;ground.position.y=-.035;ground.receiveShadow=true;scene.add(ground);
 const baseCamera=camera.position.clone();let impact=0,lastHit=0,framingX=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const rigs:Rig[]=[];let ids:string[]=[];let last=performance.now();
 const sparks=new T.BufferGeometry(),positions=new Float32Array(90*3);for(let i=0;i<90;i++){positions[i*3]=(Math.random()-.5)*16;positions[i*3+1]=Math.random()*6;positions[i*3+2]=(Math.random()-.5)*10;}
 sparks.setAttribute('position',new T.BufferAttribute(positions,3));const points=new T.Points(sparks,new T.PointsMaterial({color:0xb882da,size:.018,transparent:true,opacity:.55,depthWrite:false}));scene.add(points);
 function resize(){const rect=canvas.getBoundingClientRect();if(rect.width<2||rect.height<2)return;renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.position.z=(instructor?6.9:8.1)*Math.max(1,(instructor?1.1:1.65)/camera.aspect);baseCamera.copy(camera.position);camera.lookAt(0,1.5,0);camera.updateProjectionMatrix();}
 const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
 let disposed=false,visible=true,lastRender=0,lastShadow=0,lastTracking=false;const intersection=new IntersectionObserver(e=>{visible=e[0]?.isIntersecting??true;});intersection.observe(canvas);
 renderer.setAnimationLoop(()=>{
  if(disposed||document.hidden||!visible){last=performance.now();return;}
  const clock=performance.now(),tracking=document.documentElement.dataset.motionActive==='true';if(clock-lastRender<16)return;lastRender=clock;if(tracking!==lastTracking){renderer.shadowMap.enabled=!tracking;renderer.setPixelRatio(Math.min(devicePixelRatio,tracking?.85:1.25));lastTracking=tracking;resize();}if(clock-lastShadow>180){renderer.shadowMap.needsUpdate=true;lastShadow=clock;}const frame=read(),time=frame.now/1000,dt=Math.min(.05,(clock-last)/1000);last=clock;
  const nextIds=instructor?[frame.selectedCharacter??'raven']:frame.fighters.map((p,i)=>characterFor(p,i).id);
  if(nextIds.join('|')!==ids.join('|')){
   for(const r of rigs){r.cancel();scene.remove(r.group);disposeObject(r.group);}rigs.length=0;ids=nextIds;
   for(const id of ids){const rig=createRig(id as 'human'|'raven'|'vortex');scene.add(rig.group);rigs.push(rig);}
  }
  canvas.dataset.modelState=rigs.every(r=>r.loaded)?'ready':'loading';const failure=rigs.find(r=>r.error);if(failure)canvas.dataset.error=failure.error;
  rigs.forEach((r,side)=>{
   const p=frame.fighters[side];if(!p&&!instructor)return;
   let action='idle',phase=0;
   if(instructor){action=frame.soloMode==='live'?'idle':frame.instructorAction??'idle';phase=frame.instructorPhase??0;r.group.position.x=frame.soloMode==='live'?(frame.liveTranslation?.x??0):action==='MOVE LEFT'?-Math.sin(phase*Math.PI)*.55:action==='MOVE RIGHT'?Math.sin(phase*Math.PI)*.55:0;r.group.rotation.y=.08;r.group.position.y=frame.soloMode==='live'?(frame.liveTranslation?.y??0):0;}
   else{
    const won=frame.outcome===side,lost=frame.outcome!==undefined&&frame.outcome!==null&&frame.outcome!==-1&&!won;
    const a=animationFor(lost?{...p,hp:0}:p,frame.now,won);action=a.name;phase=a.phase;
    r.group.position.x=(p.x-50)*.115;r.group.rotation.y=side===0?Math.PI/2-.38:-Math.PI/2+.38;
   }
   r.update(action,phase,time,dt,side===frame.localSide&&!['hit','defeat','victory'].includes(action)?frame.localPose:undefined,instructor?(frame.soloActions??[]):p?.actions,instructor&&frame.soloMode==='training');
   const ice=instructor?(frame.soloMode==='live'?frame.soloActions?.includes('ICE SHIELD'):action==='ICE SHIELD'):p.shieldUntil>frame.now,block=instructor?(frame.soloMode==='live'?frame.soloActions?.includes('BLOCK'):action==='BLOCK'):p.actions.includes('BLOCK');
   r.shield.visible=!!(ice||block);r.shieldLines.visible=!!(ice||block);
   const breathing=1+Math.sin(time*2.5)*.012;
   r.shield.scale.set((ice?1:.62)*breathing,ice?1.35:.85,ice?.8:.24);r.shield.position.set(0,1.57,ice?.12:.76);r.shieldLines.scale.copy(r.shield.scale);r.shieldLines.position.copy(r.shield.position);r.shieldLines.rotation.y=time*.12;
   if(!instructor||frame.soloMode==='training'){
    const effect=instructor?action:p.effect,age=instructor?phase*900:frame.now-p.effectAt,active=instructor?phase>.3&&phase<.65:age>=0&&age<620;
    r.lightning.visible=active&&effect==='LIGHTNING';
    if(r.lightning.visible){const target=((frame.fighters[1-side]?.x??50)-p.x)*.115*(side===0?1:-1),buffer=r.lightning.geometry.getAttribute('position');for(let n=0;n<14;n++)buffer.setXYZ(n,Math.sin(n*5+Math.floor(time*18))*.12,4.9-n*.25,target+Math.cos(n*4)*.08);buffer.needsUpdate=true;}
    r.beam.visible=active&&['FIRE BLAST','COMBO ENERGY'].includes(effect);
    if(r.beam.visible){const target=((frame.fighters[1-side]?.x??50)-p.x)*.115*(side===0?1:-1);r.beam.position.set(0,1.93,.7+target*Math.min(1,age/480));r.beam.scale.setScalar(effect==='COMBO ENERGY'?1.7:1);}
    r.burst.visible=active&&['PUNCH','DOUBLE PUNCH','KICK','LIGHTNING'].includes(effect);
    if(r.burst.visible){r.burst.position.set(0,effect==='KICK'?1.5:2.06,1.05);r.burst.scale.setScalar(.3+Math.sin(Math.min(1,age/620)*Math.PI)*1.3);r.burst.rotation.z=time*6;}
   }
  });
  const hit=Math.max(...frame.fighters.map(p=>p.hitAt),0);if(hit>lastHit){lastHit=hit;impact=1;}
  impact=Math.max(0,impact-dt*7);camera.position.copy(baseCamera);
  if(!instructor&&frame.fighters.length===2){const midpoint=((frame.fighters[0].x+frame.fighters[1].x)/2-50)*.115;framingX=T.MathUtils.lerp(framingX,midpoint,1-Math.exp(-dt*5));camera.position.x=framingX;const spacing=Math.abs(frame.fighters[0].x-frame.fighters[1].x);camera.position.z=baseCamera.z*(.86+Math.min(1,spacing/65)*.14);camera.lookAt(framingX,1.5,0);}

  if(!instructor&&!reduced){camera.position.x+=Math.sin(clock*.12)*impact*.045;camera.position.y+=Math.cos(clock*.15)*impact*.025;}
  points.rotation.y=time*.007;
  // Camera inference has priority. Skip post-processing while tracking is active.
  renderer.render(scene,camera);
 });
 const contextLost=(event:Event)=>{event.preventDefault();renderer.setAnimationLoop(null);canvas.dataset.error='WebGL context lost. Refresh to resume 3D.';};canvas.addEventListener('webglcontextlost',contextLost);
 return ()=>{disposed=true;rigs.forEach(r=>r.cancel());renderer.setAnimationLoop(null);observer.disconnect();intersection.disconnect();canvas.removeEventListener('webglcontextlost',contextLost);disposeObject(scene);env.dispose();renderer.dispose();};
}
function disposeObject(root:T.Object3D){const materials=new Set<T.Material>(),geometry=new Set<T.BufferGeometry>();root.traverse(node=>{if(node instanceof T.Mesh||node instanceof T.Line||node instanceof T.Points){geometry.add(node.geometry);const values=Array.isArray(node.material)?node.material:[node.material];values.forEach((m:T.Material)=>materials.add(m));}});geometry.forEach(g=>g.dispose());materials.forEach(m=>{for(const value of Object.values(m))if(value instanceof T.Texture)value.dispose();m.dispose();});}
