"""Import original supplied models and document whether each file has playable clips."""
import json,struct,hashlib,shutil
from pathlib import Path
root=Path(__file__).resolve().parents[1];source=Path('/path/to/action-models')
report=[]
for p in sorted(source.glob('*.glb')):
 b=p.read_bytes();size=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+size]);report.append({'file':p.name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'animationClips':[a.get('name','unnamed') for a in d.get('animations',[])],'skeletonPoseHash':hashlib.sha256(json.dumps([{k:n.get(k) for k in ['name','translation','rotation','scale']} for n in d.get('nodes',[]) if n.get('name','').startswith('mixamorig')],sort_keys=True).encode()).hexdigest()})
for original,target in [('blue+glb.glb','raven.glb'),('red-box.glb','vortex.glb')]:shutil.copyfile(source/original,root/'public/models'/target)
(root/'public/models/import-report.json').write_text(json.dumps(report,indent=2))
print('Imported exact supplied skinned models; all source files audited for animation clips.')
