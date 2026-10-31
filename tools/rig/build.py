"""Decimate + auto-rig the Tripo fighters and export a compact skinned format for the game.

Output per fighter (assets/models/):
  <id>.json  – bones (name, parent, head xyz), attribute layout, counts
  <id>.bin   – positions f32x3 | normals i8x4 | uv u16x2 | joints u8x4 | weights u8x4 | indices u16/u32
  <id>.webp  – base colour texture (1024)
"""
import io, json, sys, os
import numpy as np
from PIL import Image, ImageDraw
from scipy.sparse import coo_matrix
from glb import load_mesh, image_bytes
from decimate import decimate, vertex_normals

OUT = '/home/claude/gk/site/assets/models/'
SCR = '/tmp/claude-0/-home-claude/a0782746-db82-58b8-9c89-d0c178188d83/scratchpad/'
os.makedirs(OUT, exist_ok=True)

# Bone list: name, parent, template head (x>0 = model's left), capsule radius, side (+1 left, -1 right, 0 centre)
def template():
    B = [
        ('hips', None, (0, 0.50, 0.0), 0.10, 0),
        ('spine', 'hips', (0, 0.585, 0.0), 0.11, 0),
        ('chest', 'spine', (0, 0.67, 0.0), 0.12, 0),
        ('neck', 'chest', (0, 0.785, 0.0), 0.05, 0),
        ('head', 'neck', (0, 0.83, 0.01), 0.085, 0),
    ]
    for s, S in ((1, 'L'), (-1, 'R')):
        B += [
            (f'clav{S}', 'chest', (0.04 * s, 0.765, 0.0), 0.05, s),
            (f'upperArm{S}', f'clav{S}', (0.135 * s, 0.755, -0.01), 0.055, s),
            (f'foreArm{S}', f'upperArm{S}', (0.20 * s, 0.625, -0.025), 0.046, s),
            (f'hand{S}', f'foreArm{S}', (0.222 * s, 0.497, 0.02), 0.04, s),
            (f'thigh{S}', 'hips', (0.075 * s, 0.475, 0.0), 0.085, s),
            (f'shin{S}', f'thigh{S}', (0.10 * s, 0.27, 0.01), 0.07, s),
            (f'foot{S}', f'shin{S}', (0.11 * s, 0.065, -0.01), 0.05, s),
        ]
    return B

TIPS = {'head': (0, 0.97, 0.02), 'handL': (0.232, 0.43, 0.04), 'handR': (-0.232, 0.43, 0.04),
        'footL': (0.12, 0.015, 0.09), 'footR': (-0.12, 0.015, 0.09)}


def refine(P, bones):
    """Move limb joints to the centroid of a thin horizontal slab of nearby vertices."""
    pos = {b[0]: np.array(b[2], float) for b in bones}
    def slab(guess, side, min_side_x, rad, dy=0.012):
        sel = (np.abs(P[:, 1] - guess[1]) < dy) & (P[:, 0] * side > min_side_x) & (np.linalg.norm(P[:, [0, 2]] - guess[[0, 2]], axis=1) < rad)
        if sel.sum() < 30: return guess
        c = P[sel].mean(0); c[1] = guess[1]
        return c
    for S, s in (('L', 1), ('R', -1)):
        pos[f'foreArm{S}'] = slab(pos[f'foreArm{S}'], s, 0.15, 0.07)
        pos[f'hand{S}'] = slab(pos[f'hand{S}'], s, 0.165, 0.07)
        pos[f'shin{S}'] = slab(pos[f'shin{S}'], s, 0.01, 0.09)
        pos[f'foot{S}'] = slab(pos[f'foot{S}'], s, 0.02, 0.08, 0.01)
        # shoulder: midpoint of arm slab just under the armpit, nudged up
        sh = slab(np.array([0.155 * s, 0.70, -0.01]), s, 0.12, 0.08)
        pos[f'upperArm{S}'] = np.array([sh[0] * 0.92, 0.755, sh[2]])
    # head/neck centre on the mesh centreline
    for n in ('neck', 'head'):
        g = pos[n]; sel = (np.abs(P[:, 1] - g[1]) < 0.01) & (np.abs(P[:, 0]) < 0.09)
        if sel.sum() > 30: pos[n] = np.array([0.0, g[1], np.median(P[sel, 2])])
    return pos


def seg_dist(P, a, b):
    ab = b - a; t = np.clip(((P - a) @ ab) / max(1e-9, ab @ ab), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)


def euclid_scores(P, bones, pos, loose=False):
    child = {}
    for b in bones:
        if b[1] and b[1] not in child: child[b[1]] = b[0]
    child['chest'] = 'neck'
    sc = np.full((len(P), len(bones)), 1e9, np.float32)
    for k, (n, par, _, r, side) in enumerate(bones):
        a = pos[n]; e = pos[child[n]] if n in child else np.array(TIPS[n], float)
        d = seg_dist(P, a, e) / r
        if n.startswith(('foreArm', 'hand', 'upperArm', 'clav')): mask = P[:, 0] * side > (0.0 if loose else 0.02)
        elif n.startswith(('thigh', 'shin', 'foot')): mask = (P[:, 0] * side > -0.03) & (P[:, 1] < 0.58)
        elif n in ('neck', 'head'): mask = P[:, 1] > 0.68
        else: mask = np.ones(len(P), bool)
        sc[:, k] = np.where(mask, d, 1e9)
    return sc


def geodesic_labels(P, I, bones, pos):
    from scipy.sparse.csgraph import dijkstra
    sc = euclid_scores(P, bones, pos)
    order = np.sort(sc, 1)
    best = np.argmin(sc, 1)
    core = (order[:, 0] < 0.9) & (order[:, 1] > 1.5 * order[:, 0])
    seeds = []
    rng = np.random.RandomState(0)
    for k in range(len(bones)):
        idx = np.where(core & (best == k))[0]
        if len(idx) > 4000: idx = rng.choice(idx, 4000, replace=False)
        seeds.append(idx)
    seed_idx = np.concatenate(seeds)
    seed_bone = np.concatenate([np.full(len(sd), k) for k, sd in enumerate(seeds)])
    # weld vertices split at UV seams so the surface is connected
    _, weld = np.unique(np.round(P / 2e-5).astype(np.int64), axis=0, return_inverse=True)
    weld = weld.reshape(-1)
    nW = weld.max() + 1
    Pw = np.zeros((nW, 3)); Pw[weld] = P
    Iw = weld[I]
    first = np.full(nW, -1); first[weld[::-1]] = np.arange(len(P))[::-1]
    seed_w = weld[seed_idx]
    e = np.concatenate([Iw[:, [0, 1]], Iw[:, [1, 2]], Iw[:, [2, 0]]])
    w = np.linalg.norm(Pw[e[:, 0]] - Pw[e[:, 1]], axis=1) + 1e-7
    G = coo_matrix((w, (e[:, 0], e[:, 1])), shape=(nW, nW)).tocsr()
    seed_w, uniq = np.unique(seed_w, return_index=True); seed_bone = seed_bone[uniq]
    dist, pred, src = dijkstra(G, directed=False, indices=seed_w, min_only=True, return_predecessors=True)
    lut = -np.ones(nW, np.int64); lut[seed_w] = seed_bone
    labw = np.where(src >= 0, lut[np.maximum(src, 0)], -1)
    label = labw[weld]
    label = np.where(label >= 0, label, best)
    src = labw[weld]
    print('   geodesic: seeds', len(seed_idx), 'unreached', int((src < 0).sum()))
    return label


def skin(P, T, bones, pos, label=None):
    nb = len(bones)
    scores = euclid_scores(P, bones, pos, loose=True).astype(np.float64)
    if label is not None:
        par = {i: (next(j for j, bb in enumerate(bones) if bb[0] == b[1]) if b[1] else -1) for i, b in enumerate(bones)}
        hop = np.full((nb, nb), 99)
        for i in range(nb):
            # BFS over parent/child links
            dist_ = {i: 0}; frontier = [i]
            while frontier:
                nxt = []
                for a in frontier:
                    nbrs = [par[a]] if par[a] >= 0 else []
                    nbrs += [c for c in range(nb) if par[c] == a]
                    for c in nbrs:
                        if c not in dist_: dist_[c] = dist_[a] + 1; nxt.append(c)
                frontier = nxt
            for j, d_ in dist_.items(): hop[i, j] = d_
        allowed = hop[label] <= 1
        hips = [b[0] for b in bones].index('hips')
        # loose cloth on the legs: let the pelvis hold it so it does not fly with the leg
        legish = np.isin(label, [i for i, b in enumerate(bones) if b[0].startswith('thigh')])
        far = legish & (np.take_along_axis(scores, label[:, None], 1)[:, 0] > 1.6)
        allowed[far, hips] = True
        scores[far, hips] = np.minimum(scores[far, hips], 0.9)
        scores = np.where(allowed, np.minimum(scores, 50), 1e9)
        scores[np.arange(len(P)), label] = np.minimum(scores[np.arange(len(P)), label], 1.0)
        self_hop = hop
    else:
        self_hop = None
    W = np.exp(-4.0 * np.minimum(scores, 30) ** 2)
    # guarantee at least the nearest bone
    best = np.argmin(scores, 1)
    W[np.arange(len(P)), best] += 1e-6
    W /= W.sum(1, keepdims=True)
    # smooth weights over mesh adjacency (approximates heat diffusion)
    i = np.concatenate([T[:, 0], T[:, 1], T[:, 2], T[:, 1], T[:, 2], T[:, 0]])
    j = np.concatenate([T[:, 1], T[:, 2], T[:, 0], T[:, 0], T[:, 1], T[:, 2]])
    A = coo_matrix((np.ones(len(i)), (i, j)), shape=(len(P), len(P))).tocsr()
    A.data[:] = 1
    deg = np.asarray(A.sum(1)).ravel(); deg[deg == 0] = 1
    allowed = scores < 1e8
    for _ in range(4):
        W = 0.5 * W + 0.5 * (A @ W) / deg[:, None]
        W *= allowed
        W /= np.maximum(1e-12, W.sum(1, keepdims=True))
    # top-4
    idx = np.argsort(-W, 1)[:, :4]
    w4 = np.take_along_axis(W, idx, 1)
    w4 /= w4.sum(1, keepdims=True)
    wq = np.round(w4 * 255).astype(np.int32)
    wq[:, 0] += 255 - wq.sum(1)
    return idx.astype(np.uint8), np.clip(wq, 0, 255).astype(np.uint8), best, self_hop


def preview(P, best, pos, bones, name):
    rng = np.random.RandomState(3); pal = (rng.rand(len(bones), 3) * 200 + 55).astype(np.uint8)
    R = 600; ims = []
    for a, depth in ((0, 2), (2, 0)):
        img = np.zeros((R, R, 3), np.uint8) + 25
        x = ((P[:, a] + 0.5) * R).astype(int); y = ((1 - P[:, 1]) * R).astype(int)
        o = np.argsort(P[:, depth]); ok = (x[o] >= 0) & (x[o] < R) & (y[o] >= 0) & (y[o] < R)
        img[y[o][ok], x[o][ok]] = pal[best[o][ok]]
        im = Image.fromarray(img); d = ImageDraw.Draw(im)
        for b in bones:
            if b[1]:
                p, q = pos[b[1]], pos[b[0]]
                d.line([((p[a] + 0.5) * R, (1 - p[1]) * R), ((q[a] + 0.5) * R, (1 - q[1]) * R)], fill='white', width=2)
            q = pos[b[0]]; d.ellipse([(q[a] + 0.5) * R - 4, (1 - q[1]) * R - 4, (q[a] + 0.5) * R + 4, (1 - q[1]) * R + 4], fill='yellow')
        ims.append(im)
    out = Image.new('RGB', (2 * R, R)); out.paste(ims[0], (0, 0)); out.paste(ims[1], (R, 0)); out.save(SCR + f'rig-{name}.jpg', quality=85)


def build(src, fid, cell):
    m = load_mesh('/mnt/user-data/uploads/' + src)
    P0 = m['P'].copy()
    torso = (P0[:, 1] > 0.6) & (P0[:, 1] < 0.74)
    ctr = np.array([np.median(P0[torso, 0]), 0.0, np.median(P0[torso, 2])])
    P0 -= ctr
    print(fid, 'recentred by', np.round(ctr, 3))
    P, UV, T, o2n = decimate(P0, m['UV'], m['I'], cell)
    bones = template()
    pos = refine(P, bones)
    lab0 = geodesic_labels(P0, m['I'], bones, pos)
    nb = len(bones)
    ok = o2n >= 0
    votes = np.bincount(o2n[ok] * nb + lab0[ok], minlength=len(P) * nb).reshape(len(P), nb)
    label = votes.argmax(1)
    J, W, best, hop = skin(P, T, bones, pos, label)
    # drop webbing triangles that bridge distant body parts (e.g. forearm <-> hips)
    lt = label[T]
    bridge = (hop[lt[:, 0], lt[:, 1]] > 2) | (hop[lt[:, 1], lt[:, 2]] > 2) | (hop[lt[:, 0], lt[:, 2]] > 2)
    print('   dropped bridging tris', int(bridge.sum()))
    T = T[~bridge]
    N = vertex_normals(P, T)
    best = label
    preview(P, best, pos, bones, fid)
    # texture
    ti = m['mat']['pbrMetallicRoughness']['baseColorTexture']['index']
    b, _ = image_bytes(m['j'], m['bin'], m['j']['textures'][ti]['source'])
    Image.open(io.BytesIO(b)).convert('RGB').resize((1024, 1024), Image.LANCZOS).save(OUT + f'{fid}.webp', quality=86, method=6)
    # binary
    n = len(P)
    pos32 = P.astype(np.float32)
    nor8 = np.zeros((n, 4), np.int8); nor8[:, :3] = np.clip(np.round(N * 127), -127, 127)
    uv16 = np.clip(np.round(UV * 65535), 0, 65535).astype(np.uint16)
    idx = T.astype(np.uint16 if n < 65536 else np.uint32)
    parts = [pos32.tobytes(), nor8.tobytes(), uv16.tobytes(), J.tobytes(), W.tobytes(), idx.tobytes()]
    with open(OUT + f'{fid}.bin', 'wb') as f:
        for p in parts: f.write(p)
    names = [b_[0] for b_ in bones]
    meta = {
        'vertexCount': n, 'indexCount': int(T.size), 'indexType': 'u16' if n < 65536 else 'u32',
        'bones': [{'name': b_[0], 'parent': names.index(b_[1]) if b_[1] else -1, 'head': [round(float(v), 5) for v in pos[b_[0]]]} for b_ in bones],
        'tips': {k: list(v) for k, v in TIPS.items()},
        'height': float(P[:, 1].max()),
    }
    json.dump(meta, open(OUT + f'{fid}.json', 'w'))
    size = sum(len(p) for p in parts)
    print(fid, 'verts', n, 'tris', len(T), 'bin', size // 1024, 'KB', 'tex', os.path.getsize(OUT + f'{fid}.webp') // 1024, 'KB')


if __name__ == '__main__':
    cell = float(sys.argv[1]) if len(sys.argv) > 1 else 0.0075
    jobs = {'fire': 'red_glb.glb', 'lightning': 'blue_glb.glb', 'earth': 'green_glb.glb', 'wind': 'white_.glb'}
    for fid in (sys.argv[2:] or jobs):
        build(jobs[fid], fid, cell)
