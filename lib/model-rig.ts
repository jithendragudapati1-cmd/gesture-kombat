import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createRig as createEffectsRig,type Rig} from './rig3d';
import {bodyPose,type BodyPose,type Joint} from './pose3d';
export type ModelRig=Rig&{loaded:boolean;error?:string;cancel:()=>void};
const v=(p:number[])=>new T.Vector3(...p);
// Retarget directions rather than joint positions: preserve the imported mesh's limb lengths.
export function createRig(character:'raven'|'vortex'|'human'):ModelRig{
 const effects=createEffectsRig(character),oldBody=effects.group.children[0];oldBody.visible=false;
 let cancelled=false,model:T.Group|undefined,scale=1;let restHip=new T.Vector3();let leftSuffix:'L'|'R'='L';
 const positions=new Map<T.Bone,T.Vector3>();const bones=new Map<string,T.Bone>(),rest=new Map<T.Bone,T.Quaternion>(),axes=new Map<T.Bone,T.Vector3>();
 const rig:ModelRig={...effects,loaded:false,cancel(){cancelled=true;},update(action,phase,time,dt,livePose,actions=[],demonstrate=false){
  effects.update(action,phase,time,dt,livePose,actions,demonstrate);if(!model)return;
  if(action==='rest'){for(const bone of bones.values()){bone.quaternion.copy(rest.get(bone)!);bone.position.copy(positions.get(bone)!);}model.position.y=0;model.rotation.x=0;return;}
  const pose=livePose??bodyPose(action,phase,time,demonstrate);
  if(!livePose&&actions.some(a=>['WALK','RUN','MOVE LEFT','MOVE RIGHT'].includes(a))&&!['kick','defeat','jump'].includes(action)){
   const gait=bodyPose(actions.includes('RUN')?'run':'walk',phase,time);for(const key of ['hipL','hipR','kneeL','kneeR','ankleL','ankleR'] as Joint[])pose.joints[key]=gait.joints[key];
  }
  const alpha=1-Math.exp(-Math.min(dt,.06)*(livePose?42:25));
  const aim=(name:string,a:Joint,b:Joint)=>{
   const bone=bones.get(name);if(!bone||!bone.parent)return;
   const direction=v(pose.joints[b]).sub(v(pose.joints[a])).normalize();
   const parentRotation=bone.parent.getWorldQuaternion(new T.Quaternion()).invert();
   const groupRotation=effects.group.getWorldQuaternion(new T.Quaternion());direction.applyQuaternion(groupRotation).applyQuaternion(parentRotation);
   const bind=rest.get(bone)!,axis=axes.get(bone);if(!axis)return;
   const desired=new T.Quaternion().setFromUnitVectors(axis.clone().applyQuaternion(bind).normalize(),direction).multiply(bind);
   bone.quaternion.slerp(desired,alpha);bone.updateWorldMatrix(false,true);
  };
  const hips=bones.get('Hips');if(hips){hips.position.x=T.MathUtils.lerp(hips.position.x,restHip.x+pose.joints.pelvis[0]/scale,alpha);hips.position.y=T.MathUtils.lerp(hips.position.y,restHip.y+(pose.joints.pelvis[1]-1.37)/scale,alpha);}
  model.position.y=T.MathUtils.lerp(model.position.y,pose.rootY,alpha);model.rotation.x=T.MathUtils.lerp(model.rotation.x,pose.lean,alpha);model.updateWorldMatrix(true,true);
  aim('Spine','pelvis','chest');aim('Neck','chest','head');
  for(const [side,suffix] of [['Left',leftSuffix],['Right',leftSuffix==='L'?'R':'L']] as const){
   aim(side+'Arm',('shoulder'+suffix) as Joint,('elbow'+suffix) as Joint);aim(side+'ForeArm',('elbow'+suffix) as Joint,('wrist'+suffix) as Joint);
   aim(side+'UpLeg',('hip'+suffix) as Joint,('knee'+suffix) as Joint);aim(side+'Leg',('knee'+suffix) as Joint,('ankle'+suffix) as Joint);
   const open=suffix==='L'?pose.openL:pose.openR;
   for(const finger of ['Index','Middle','Ring','Pinky'])for(let n=1;n<=3;n++){const bone=bones.get(side+'Hand'+finger+n);if(bone)bone.quaternion.slerp(rest.get(bone)!.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,side==='Left'?1:-1),open?0:1.05)),alpha);}
  }
 }};
 new GLTFLoader().load('/models/'+(character==='vortex'?'vortex':'raven')+'.glb',gltf=>{
  if(cancelled){disposeModel(gltf.scene);return;}
  model=gltf.scene;
  // Preserve the supplied model’s authored skeleton and skin weights.
  model.traverse(o=>{if(o instanceof T.SkinnedMesh){o.frustumCulled=false;o.castShadow=true;o.receiveShadow=true;}if(o instanceof T.Bone)bones.set(o.name.replace(/^mixamorig[:_]?/,''),o);});
  model.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(model);scale=2.9/(bounds.max.y-bounds.min.y);model.scale.setScalar(scale);model.position.y=-bounds.min.y*scale;
  for(const bone of bones.values()){rest.set(bone,bone.quaternion.clone());positions.set(bone,bone.position.clone());const child=bone.children.find(o=>o instanceof T.Bone);if(child)axes.set(bone,child.position.clone().normalize());}
  const left=bones.get('LeftArm'),hips=bones.get('Hips');if(left&&hips)leftSuffix=left.getWorldPosition(new T.Vector3()).x>hips.getWorldPosition(new T.Vector3()).x?'R':'L';
  restHip=hips?.position.clone()??new T.Vector3();effects.group.add(model);rig.loaded=true;
 },undefined,error=>{rig.error='Could not load '+character+' model. Refresh to retry.';console.error(error);});
 return rig;
}
function disposeModel(root:T.Object3D){root.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const material of Array.isArray(o.material)?o.material:[o.material]){for(const value of Object.values(material))if(value instanceof T.Texture)value.dispose();material.dispose();}}});}
