import sys, io, numpy as np, json
from PIL import Image, ImageDraw
from glb import load_mesh, image_bytes
S='/tmp/claude-0/-home-claude/a0782746-db82-58b8-9c89-d0c178188d83/scratchpad/'
for name in sys.argv[1:]:
    m=load_mesh('/mnt/user-data/uploads/'+name)
    P,UV,I=m['P'],m['UV'],m['I']
    print(name,'verts',len(P),'tris',len(I),'material',json.dumps(m['mat'])[:400])
    tex_i=m['mat']['pbrMetallicRoughness']['baseColorTexture']['index']
    src=m['j']['textures'][tex_i]['source']
    b,mt=image_bytes(m['j'],m['bin'],src); tex=np.asarray(Image.open(io.BytesIO(b)).convert('RGB')); th,tw,_=tex.shape
    col=tex[np.clip(((1-UV[:,1])*th).astype(int),0,th-1) if False else np.clip((UV[:,1]*th).astype(int),0,th-1), np.clip((UV[:,0]*tw).astype(int),0,tw-1)]
    np.save(S+name+'.col.npy',col)
    views=[]
    for ax,(a,bb,depth,sgn) in {'front':(0,1,2,1),'side':(2,1,0,1)}.items():
        R=700; img=np.zeros((R,R,3),np.uint8)+30; zb=np.full((R,R),-1e9)
        x=((P[:,a]*sgn+0.5)*R*0.98).astype(int); y=((1-P[:,1]/1.0)*R*0.98+5).astype(int); d=P[:,depth]
        ok=(x>=0)&(x<R)&(y>=0)&(y<R)
        order=np.argsort(d[ok]); xs,ys,cs=x[ok][order],y[ok][order],col[ok][order]
        img[ys,xs]=cs
        im=Image.fromarray(img); dr=ImageDraw.Draw(im)
        for k in range(0,11): yy=int((1-k/10)*R*0.98+5); dr.line([(0,yy),(12,yy)],fill='yellow'); dr.text((14,yy-6),f'{k/10:.1f}',fill='yellow')
        for k in range(-5,6): xx=int((k/10+0.5)*R*0.98); dr.line([(xx,R-10),(xx,R)],fill='cyan'); dr.text((xx-8,R-24),f'{k/10:+.1f}',fill='cyan')
        dr.text((R//2-20,2),ax,fill='white')
        views.append(im)
    out=Image.new('RGB',(1400,700)); out.paste(views[0],(0,0)); out.paste(views[1],(700,0)); out.save(S+'view-'+name+'.jpg',quality=85)
