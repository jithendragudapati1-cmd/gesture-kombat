# Rig pipeline

Python scripts that turn the four Tripo 3D fighter models (GLB) into the light, game-ready meshes in `game/assets/models/`.

- `glb.py` reads GLB files.
- `decimate.py` reduces the polygon count with vertex clustering.
- `build.py` recentres each model, fits the shared skeleton, and computes geodesic skin weights so arms, legs and torso move cleanly. It writes `.bin` (geometry), `.json` (skeleton and metadata) and `.webp` (texture).
- `build_offline.py` packs the whole game into one double-clickable HTML file.

The paths at the top of each script point at the original build machine; change them to your folders before running.
