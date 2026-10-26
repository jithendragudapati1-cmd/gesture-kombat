import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const name of ['raven','vortex'])test(name+' imports a compact textured mesh with useful limb skin weights',()=>{
 const bytes=readFileSync(new URL('../public/models/'+name+'.glb',import.meta.url));
 assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(8),bytes.length);assert.ok(bytes.length<25*1024*1024);
 const length=bytes.readUInt32LE(12),g=JSON.parse(bytes.subarray(20,20+length).toString()),bin=bytes.subarray(28+length);
 assert.ok(g.images.length>=2);assert.equal(g.skins.length,1);
 const p=g.meshes[0].primitives[0];assert.ok(g.accessors[p.attributes.POSITION].count<100000);
 const counts=new Map<number,number>();
 const ja=g.accessors[p.attributes.JOINTS_0],wa=g.accessors[p.attributes.WEIGHTS_0],jv=g.bufferViews[ja.bufferView],wv=g.bufferViews[wa.bufferView];
 for(let i=0;i<ja.count;i++){let sum=0;for(let k=0;k<4;k++){
  const offset=(jv.byteOffset??0)+(ja.byteOffset??0)+(i*4+k)*(ja.componentType===5121?1:2);const joint=ja.componentType===5121?bin.readUInt8(offset):bin.readUInt16LE(offset),weight=bin.readFloatLE((wv.byteOffset??0)+(wa.byteOffset??0)+i*16+k*4);sum+=weight;if(weight>.2)counts.set(joint,(counts.get(joint)??0)+1);
 }assert.ok(Math.abs(sum-1)<.001);}
 for(const name of ['LeftArm','RightArm','LeftForeArm','RightForeArm','LeftLeg','RightLeg']){const joint=g.skins[0].joints.findIndex((n:number)=>g.nodes[n].name==='mixamorig:'+name);assert.ok((counts.get(joint)??0)>20,name+' must deform a useful number of vertices');}
});
