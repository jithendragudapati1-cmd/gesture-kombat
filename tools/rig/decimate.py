"""Vertex-clustering decimation that respects UV seams."""
import numpy as np


def decimate(P, UV, I, cell=0.006, uv_cell=1 / 48):
    # Cluster key: spatial cell + UV cell (keeps different UV islands apart -> no smeared seams)
    g = np.floor(P / cell).astype(np.int64)
    u = np.floor(UV / uv_cell).astype(np.int64)
    key = np.stack([g[:, 0], g[:, 1], g[:, 2], u[:, 0], u[:, 1]], 1)
    _, inv, counts = np.unique(key, axis=0, return_inverse=True, return_counts=True)
    inv = inv.reshape(-1)
    n = counts.shape[0]
    newP = np.zeros((n, 3)); np.add.at(newP, inv, P); newP /= counts[:, None]
    newUV = np.zeros((n, 2)); np.add.at(newUV, inv, UV); newUV /= counts[:, None]
    T = inv[I]
    ok = (T[:, 0] != T[:, 1]) & (T[:, 1] != T[:, 2]) & (T[:, 0] != T[:, 2])
    T = T[ok]
    # remove duplicate triangles (same vertex set)
    s = np.sort(T, 1)
    _, first = np.unique(s, axis=0, return_index=True)
    T = T[np.sort(first)]
    # drop unused vertices
    used = np.zeros(n, bool); used[T.ravel()] = True
    remap = -np.ones(n, np.int64); remap[used] = np.arange(used.sum())
    return newP[used], newUV[used], remap[T], remap[inv]  # last: original vertex -> new vertex (-1 if dropped)


def vertex_normals(P, T):
    fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    N = np.zeros_like(P)
    for k in range(3):
        np.add.at(N, T[:, k], fn)
    l = np.linalg.norm(N, axis=1, keepdims=True); l[l == 0] = 1
    return N / l
