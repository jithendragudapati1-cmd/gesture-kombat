import fs from 'node:fs';
import {MeshoptSimplifier} from 'meshoptimizer';
await MeshoptSimplifier.ready;
const read=p=>{const b=fs.readFileSync(p),len=b.readUInt32LE(12);return {d:JSON.parse(b.subarray(20,20+len)),bin:b.subarray(28+len)}};
const red=read('/path/to/original-models/red.glb');
const types={5126:Float32Array,5125:Uint32Array,5123:Uint16Array};
function arr(g,i){let a=g.d.accessors[i],v=g.d.bufferViews[a.bufferView],Type=types[a.componentType],n={VEC3:3,VEC2:2,SCALAR:1}[a.type];return new Type(g.bin.buffer,g.bin.byteOffset+(v.byteOffset??0)+(a.byteOffset??0),a.count*n).slice();}
const p=red.d.meshes[0].primitives[0],pos=arr(red,p.attributes.POSITION),idx=new Uint32Array(arr(red,p.indices));
const [indices,error]=MeshoptSimplifier.simplify(idx,pos,3,180000,.008,['Permissive']);
const used=[...new Set(indices)],map=new Map(used.map((v,i)=>[v,i]));
const out={positions:used.flatMap(i=>Array.from(pos.subarray(i*3,i*3+3))),indices:Array.from(indices,i=>map.get(i))};
for(const [key,n] of [['NORMAL',3],['TEXCOORD_0',2]]){let a=arr(red,p.attributes[key]);out[key]=used.flatMap(i=>Array.from(a.subarray(i*n,i*n+n)));}
fs.writeFileSync('/private/tmp/red-simplified.json',JSON.stringify(out));console.log({original:pos.length/3,vertices:used.length,triangles:indices.length/3,error});
