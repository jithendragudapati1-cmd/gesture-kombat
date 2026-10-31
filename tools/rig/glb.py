"""Minimal GLB reader/writer helpers (numpy)."""
import json, struct
import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    b = open(path, 'rb').read()
    clen, _ = struct.unpack('<I4s', b[12:20])
    j = json.loads(b[20:20 + clen])
    off = 20 + clen
    blen, _ = struct.unpack('<I4s', b[off:off + 8])
    bin_ = b[off + 8: off + 8 + blen]
    return j, bin_


def accessor(j, bin_, idx):
    a = j['accessors'][idx]
    bv = j['bufferViews'][a['bufferView']]
    dt = np.dtype(CT[a['componentType']])
    n = NC[a['type']]
    start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride')
    if stride and stride != dt.itemsize * n:
        raw = np.frombuffer(bin_, dtype=np.uint8, count=stride * (a['count'] - 1) + dt.itemsize * n, offset=start)
        out = np.lib.stride_tricks.as_strided(raw, shape=(a['count'], dt.itemsize * n), strides=(stride, 1)).copy()
        arr = out.view(dt).reshape(a['count'], n)
    else:
        arr = np.frombuffer(bin_, dtype=dt, count=a['count'] * n, offset=start).reshape(a['count'], n)
    return arr if n > 1 else arr[:, 0]


def image_bytes(j, bin_, idx):
    im = j['images'][idx]
    bv = j['bufferViews'][im['bufferView']]
    s = bv.get('byteOffset', 0)
    return bin_[s:s + bv['byteLength']], im.get('mimeType')


def load_mesh(path):
    j, bin_ = read_glb(path)
    pr = j['meshes'][0]['primitives'][0]
    P = accessor(j, bin_, pr['attributes']['POSITION']).astype(np.float64)
    N = accessor(j, bin_, pr['attributes']['NORMAL']).astype(np.float64)
    UV = accessor(j, bin_, pr['attributes']['TEXCOORD_0']).astype(np.float64)
    I = accessor(j, bin_, pr['indices']).astype(np.int64).reshape(-1, 3) if 'indices' in pr else np.arange(len(P)).reshape(-1, 3)
    mat = j['materials'][pr.get('material', 0)]
    return dict(j=j, bin=bin_, P=P, N=N, UV=UV, I=I, mat=mat)
