import * as T from 'three';
export function buildArena(scene:T.Scene){
 const stone=new T.MeshStandardMaterial({color:0x111422,roughness:.72,metalness:.3});
 const trim=new T.MeshStandardMaterial({color:0x374453,roughness:.35,metalness:.8});
 const slabs=new T.InstancedMesh(new T.BoxGeometry(1.38,.12,1.38),stone,96),matrix=new T.Matrix4();
 let index=0;for(let x=-6;x<6;x++)for(let z=-4;z<4;z++){matrix.makeTranslation(x*1.42+.71,-.05,z*1.42);slabs.setMatrixAt(index++,matrix);}slabs.receiveShadow=true;scene.add(slabs);
 for(const side of [-1,1])for(let n=0;n<4;n++){
  const tower=new T.Group();tower.position.set(side*(4.7+n*1.4),0,-2.5-n*1.4);scene.add(tower);
  const column=new T.Mesh(new T.CylinderGeometry(.3,.48,5.8,6),stone);column.position.y=2.9;column.castShadow=true;tower.add(column);
  for(const y of [.18,1.1,4.6,5.5]){const collar=new T.Mesh(new T.CylinderGeometry(.51,.51,.16,6),trim);collar.position.y=y;tower.add(collar);}
  const light=new T.Mesh(new T.BoxGeometry(.045,3.3,.045),new T.MeshStandardMaterial({color:side<0?0x5ad9ff:0xff3562,emissive:side<0?0x148aff:0xff1738,emissiveIntensity:4}));light.position.set(0,2.8,.35);tower.add(light);
  const cap=new T.Mesh(new T.OctahedronGeometry(.4),trim);cap.position.y=5.9;tower.add(cap);
 }
 const steps=new T.InstancedMesh(new T.BoxGeometry(7,.22,.6),stone,8);
 for(let i=0;i<8;i++){matrix.makeTranslation(0,i*.22,-4.7-i*.58);steps.setMatrixAt(i,matrix);}steps.receiveShadow=true;scene.add(steps);
 const arch=new T.Mesh(new T.TorusGeometry(2.5,.22,8,72),trim);arch.position.set(0,3.5,-8.8);scene.add(arch);
 const core=new T.Mesh(new T.CircleGeometry(2.25,64),new T.MeshBasicMaterial({color:0x10091f}));core.position.set(0,3.5,-8.85);scene.add(core);
 const glyphs=new T.Group();glyphs.position.copy(arch.position);scene.add(glyphs);
 const glow=new T.MeshStandardMaterial({color:0xb145e5,emissive:0x8536d2,emissiveIntensity:3});
 for(let i=0;i<24;i++){const mark=new T.Mesh(new T.BoxGeometry(.045,.18,.03),glow),a=i/24*Math.PI*2;mark.position.set(Math.cos(a)*2.17,Math.sin(a)*2.17,.04);mark.rotation.z=a;glyphs.add(mark);}
 return (time:number)=>{glyphs.rotation.z=time*.025;};
}
