import json,struct,copy,io
from pathlib import Path
from collections import defaultdict
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
def read(name):
 b=(Path('/path/to/original-models')/(name+'.glb')).read_bytes();n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),b[28+n:]
def array(d,b,i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];return np.frombuffer(b,dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']],count=a['count']*{'VEC3':3,'VEC4':4,'MAT4':16,'SCALAR':1,'VEC2':2}[a['type']],offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],-1)
bd,bb=read('blue');rd,rb=read('red');s=json.loads(Path('/private/tmp/red-simplified.json').read_text())
bp=array(bd,bb,0);rp=np.array(s['positions'],dtype='<f4').reshape(-1,3)
# Repair the imported rig: its weights were almost entirely assigned to Hips,
# and the bind skeleton faced a different axis from the textured mesh.
mat=array(bd,bb,6).reshape(-1,4,4).transpose(0,2,1)
rotation=np.array([[0,0,1,.01335439],[0,1,0,0],[-1,0,0,.05150965],[0,0,0,1]],dtype='<f4')
world=np.matmul(rotation,np.linalg.inv(mat));inverses=np.linalg.inv(world).transpose(0,2,1).reshape(-1,16)
names={bd['nodes'][node]['name'].split(':')[-1]:i for i,node in enumerate(bd['skins'][0]['joints'])}
segments={}
for a,b in [('Hips','Spine'),('Spine','Spine1'),('Spine1','Spine2'),('Spine2','Neck'),('Neck','Head'),('Head','HeadTop_End')]+[(side+a,side+b) for side in ['Left','Right'] for a,b in [('Arm','ForeArm'),('ForeArm','Hand'),('Hand','HandMiddle1'),('UpLeg','Leg'),('Leg','Foot'),('Foot','ToeBase')]]:
 if a in names:segments[a]=(world[names[a],:3,3],world[names[b],:3,3] if b in names else world[names[a],:3,3]+[0,.06,0])
def skin(positions):
 joints=np.zeros((len(positions),4),dtype='<u2');weights=np.zeros((len(positions),4),dtype='<f4')
 for i,p in enumerate(positions):
  choices=list(segments)
  distances=[]
  for name in choices:
   a,b=segments[name];v=b-a;t=np.clip(np.dot(p-a,v)/max(np.dot(v,v),1e-8),0,1);distances.append(np.linalg.norm(p-a-t*v))
  order=np.argsort(distances)[:4];values=np.array([1/max(distances[k],.012)**4 for k in order]);values/=values.sum()
  joints[i,:4]=[names[choices[k]] for k in order];weights[i,:4]=values
 return joints,weights
bj,bw=skin(bp);rj,rw=skin(rp)
def build(name,d,b,red=False):
 out=copy.deepcopy(d);chunks=[];out['bufferViews']=[];out['accessors']=[]
 def view(data):
  offset=sum(len(c) for c in chunks);data=bytes(data);chunks.append(data+b'\0'*((-len(data))%4));out['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(data)});return len(out['bufferViews'])-1
 def acc(data,kind,component):
  data=np.asarray(data,dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[component]);a={'bufferView':view(data.tobytes()),'componentType':component,'count':len(data),'type':kind}
  if kind=='VEC3':a.update(min=data.min(axis=0).tolist(),max=data.max(axis=0).tolist())
  out['accessors'].append(a);return len(out['accessors'])-1
 if red:
  out['nodes']=copy.deepcopy(bd['nodes']);out['scenes']=copy.deepcopy(bd['scenes']);out['scene']=bd.get('scene',0);out['skins']=copy.deepcopy(bd['skins'])
  prim=out['meshes'][0]['primitives'][0];prim['attributes']={}
  for key,data,kind,component in [('POSITION',rp,'VEC3',5126),('NORMAL',np.array(s['NORMAL']).reshape(-1,3),'VEC3',5126),('TEXCOORD_0',np.array(s['TEXCOORD_0']).reshape(-1,2),'VEC2',5126),('JOINTS_0',rj,'VEC4',5123),('WEIGHTS_0',rw,'VEC4',5126)]:prim['attributes'][key]=acc(data,kind,component)
  prim['indices']=acc(np.array(s['indices']).reshape(-1,1),'SCALAR',5125)
  out['skins'][0]['inverseBindMatrices']=acc(inverses,'MAT4',5126)
 else:
  for index,a in enumerate(d['accessors']):
   if index in [4,5,6]:
    acc({4:bw,5:bj,6:inverses}[index],a['type'],a['componentType']);continue
   v=d['bufferViews'][a['bufferView']];data=b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];a=copy.deepcopy(a);a['bufferView']=view(data);out['accessors'].append(a)
 for image,original in zip(out['images'],d['images']):
  v=d['bufferViews'][original['bufferView']];data=b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
  im=Image.open(io.BytesIO(data));im.thumbnail((2048,2048));buf=io.BytesIO();fmt='PNG' if original['mimeType']=='image/png' else 'JPEG';im.save(buf,format=fmt,quality=88,optimize=True);image['bufferView']=view(buf.getvalue())
 binary=b''.join(chunks);out['buffers']=[{'byteLength':len(binary)}];meta=json.dumps(out,separators=(',',':')).encode();meta+=b' '*((-len(meta))%4)
 result=struct.pack('<III',0x46546c67,2,28+len(meta)+len(binary))+struct.pack('<II',len(meta),0x4e4f534a)+meta+struct.pack('<II',len(binary),0x004e4942)+binary
 path=ROOT/'public/models'/f'{name}.glb';path.write_bytes(result);print(path,len(result))
build('raven',bd,bb);build('vortex',rd,rb,True)
