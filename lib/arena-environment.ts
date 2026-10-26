import * as T from 'three';
import type {ArenaId} from './arenas';
export function buildArena(scene:T.Scene,id:ArenaId){
 const pearl=id==='moon-citadel',cloud=id==='sky-temple',tone=cloud?0xbecbd6:pearl?0xc5c5cc:0xb5c3ca;
 scene.background=new T.Color(tone);scene.fog=new T.Fog(tone,12,34);
 const floorMaterial=new T.MeshStandardMaterial({color:cloud?0xc4cdd4:pearl?0xc9c8ce:0xbac8cf,roughness:.83,metalness:.08});
 const floor=new T.Mesh(new T.PlaneGeometry(70,70),floorMaterial);floor.rotation.x=-Math.PI/2;floor.position.y=-.045;floor.receiveShadow=true;scene.add(floor);
 const grid=new T.GridHelper(36,36,0xa0b0be,0xb2bfc9);grid.position.y=-.038;(grid.material as T.Material).transparent=true;(grid.material as T.Material).opacity=.22;scene.add(grid);
 const ivory=new T.MeshStandardMaterial({color:0xd4d9df,roughness:.78}),steel=new T.MeshStandardMaterial({color:0xa4b0bf,roughness:.72,metalness:.25});
 const make=(geometry:T.BufferGeometry,material:T.Material,x:number,y:number,z:number)=>{const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.receiveShadow=true;scene.add(mesh);return mesh;};
 if(pearl){
  for(const x of [-9,-6,6,9]){make(new T.CylinderGeometry(.35,.42,6,16),ivory,x,3,-7);make(new T.BoxGeometry(1,.2,1),steel,x,6,-7);}
  make(new T.BoxGeometry(22,.32,.5),ivory,0,6.3,-7);
  const arch=make(new T.TorusGeometry(2.9,.12,8,64),steel,0,3.3,-10);arch.scale.y=.9;
 }else if(cloud){
  for(let i=0;i<11;i++){const mesh=make(new T.SphereGeometry(1,16,8),ivory,(i-5)*3,-.7+(i%3)*.18,-7-Math.abs(i-5)*.5);mesh.scale.set(2.8,.35,1.5);}
  for(const x of [-8,8])make(new T.BoxGeometry(.17,3.7,.17),ivory,x,1.8,-4);
  make(new T.BoxGeometry(17,.08,.12),steel,0,2.7,-5.7);
 }else{
  for(const z of [-7,-10]){const ring=make(new T.TorusGeometry(5,.085,8,72),ivory,0,3,z);ring.scale.y=.65;}
  for(const x of [-8,8])make(new T.BoxGeometry(.25,4.5,.3),steel,x,2.2,-6);
 }
 const rim=make(new T.TorusGeometry(6.8,.018,6,96),new T.MeshBasicMaterial({color:0x78a9bd,transparent:true,opacity:.4}),0,-.025,0);rim.rotation.x=-Math.PI/2;
 return (time:number)=>{if(cloud)rim.material.opacity=.25+Math.sin(time*.6)*.07;};
}
