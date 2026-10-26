# Gesture Kombat

[Play the live game](https://gesture-kombat-arena-jg.easyalder12.chatgpt.site/)


A playable browser companion to the existing Python Gesture Kombat detector.
The Python 3.12 / MediaPipe 0.10.21 environment is unchanged. This web app ports
the normalized gesture rules to MediaPipe Holistic in each player's browser,
so remote friends do not need to install Python. Camera frames and landmarks
stay on the device; only action names are transmitted to the match server.

## Modes

- **Tutorials:** 14 guided, camera-verified lessons; progress saved on this device.
- **Human vs AI:** easy, normal, hard; server-controlled sparring opponent.
- **Multiplayer:** shared random matchmaking; requires two actual queued players.
- **1v1 with Friends:** create a six-character room or join via code/invite link.

## Controls

🙏 Praying palms, fingers upright, held briefly: fire.
🙌 Both open palms raised, facing the camera: ice shield.
Closed-fist thrust: punch; both fists: double punch. Extend a leg: kick.
Cross forearms: block. Crouch/bend: duck. One open hand overhead: lightning.
Charge prayer then spread palms: combo. Recent sideways torso translation:
left/right movement; stopping clears the movement. Alternate knees: walk/run.

Keyboard fallback: A/D move, W jump, S bend, J punch, L double punch, K kick,
B block, F fire, I ice shield, E lightning, C combo. Touch buttons also work.

## Match rules

90-second rounds, 250 health, 100 regenerating energy. Melee attacks require
range; blocks reduce damage; ice absorbs most damage for a short duration.
Powers cost energy and have independent cooldowns. The server computes damage,
energy, movement, AI, timeouts, forfeits and winners. Replayed input sequences
cannot reapply attacks. Disconnected players stop moving after 700ms and
forfeit after 18 seconds. Match data expires after 15 minutes of inactivity.

## Development

Node 22.13+; `npm run install:ci`, `npm run db:generate`, `npm run build`.
Follow the Sites workflow for local D1 migrations and publication. Start local
preview with `npm run dev`. Initialize the migration in the local D1 database
before using game modes (see the Sites starter documentation).

Checks:

```
npx tsc --noEmit
node --experimental-strip-types --test tests/combat.test.ts
node tests/online.mjs
```

The HTTP integration test uses the local preview by default; set ARENA_URL to
test a deployed instance. It creates disposable game rooms and removes them
from active play afterward.

## Demo scope

This is a hackathon game, with imported textured 3D fighters and server polling every
160ms rather than a high-frequency fighting-game netcode stack. A shared D1
record uses optimistic concurrency to keep the small demo lobby and rooms
consistent across visitors. The design is intended for a small live demo;
large public traffic needs per-room actors, rate limiting and abuse controls.
There are no accounts, ranked ladders, chat, payments, or video transmission.
Refresh returns to the dashboard; starting a new mode first leaves any old match.

Browser gesture thresholds need live calibration on each player's camera.
Keep full body visible and use good light. Stop the Python camera demo before
opening the browser camera. MediaPipe models are fetched from the pinned
jsDelivr distribution, so the initial camera start needs internet access.

## Neon tracking update

Restore backup: `../outputs/gesture-kombat-before-neon-tracking.tar.gz` contains
all tracked sources from commit 3de0341ea68cd30fee655f348594195892be5aa3.
The original published version 1 remains available for deployment rollback.
To restore locally, extract the archive into a new folder and install dependencies;
keep the current folder until the restored version is checked. Restoring source
alone does not change the published website or its live match database.

The camera pipeline now requests up to 60 camera frames/sec (hardware permitting),
processes fresh frames with one inference at a time, and removes the artificial
45ms sleep after every inference. FPS and inference ms are measured on-device;
no 1ms or fixed-FPS guarantee is made. Fast response uses the lite body model;
Higher accuracy uses the full model. Praying hands use 3D finger joint geometry.
Upper-body tracking remains available when hips/feet leave the frame; leg actions
still need visible legs. Short independent holds reduce jitter without blocking
other actions. Camera capture persists across dashboard/tutorial/arena navigation.

Your own movement/attack animations preview locally on each animation frame.
Damage, power eligibility, energy and match outcomes remain server-controlled.
Input events are sent immediately when idle, otherwise in the next batch;
regular synchronization targets an 80ms interval including round-trip time.
Online latency remains dependent on the network. The neon theme applies to the
dashboard, tutorials, dialogs, HUD, fighters, arena lighting and background.

Additional checks:
`node --experimental-strip-types --test tests/combat.test.ts tests/tracking.test.ts`

## Raven × Vortex character update

Selectable fighters: Raven (blue energy, masked agile silhouette) and Vortex
(red energy, heavier spiked armor). Both retain identical combat rules.
The selected character is stored on-device and synchronized through AI matches,
random matchmaking and friend-room joining. Old rooms safely default to Raven
on the left and Vortex on the right when no character field is present.

Each character has a generated transparent 4×4 atlas with 16 key poses. The
animation controller sequences idle, walking/running, punch windup/impact/recovery,
double punch, kick chamber/extension, block, crouch, jump, two-palm cast,
lightning, hit reaction and victory; defeat uses the recoil pose with a fall.
These are rendered 2D sprites, not rigged 3D models. Canvas effects add strike
bursts, trails, energy projectiles, lightning, shields and landing rings.
Movement and attacks can still animate together. Local input previews and
server-confirmed actions use the same animation controller.

Tutorials now include 14 actions and a looping animated demonstration of each
move. Current camera mappings remain prayer for fire, raised palms for ice,
actual jumps for jump, and torso translation for sideways movement. The
reference poster is an art/animation reference, not a replacement for those
previously agreed gesture mappings.

Restore point before this update: published version 2 (neon/tracking update),
source commit 8c5ddbfada1cf48cd85f880078a35d45adcaf806. Source archive is
`../outputs/gesture-kombat-before-raven-vortex.tar.gz`.

Character checks: `node --experimental-strip-types --test tests/characters.test.ts`

## Real-time 3D and liquid glass update

The active arena now uses Three.js/WebGL and authored articulated 3D humanoids,
not the previous sprite sheets. Raven/Vortex keep their blue/red identities,
metallic armor, emissive seams, jointed limbs, helmets, and distinct silhouettes.
Animation poses interpolate across anticipation, strike and recovery, including
movement plus attacks. Camera tracking, server combat rules, and room selection
are retained. The previous 2D assets remain in source for rollback only.

Tutorials use a separate fully articulated human instructor in training clothes,
facing the viewer. Each of the 14 inputs has a body/hand demonstration plus the
actual text instructions. Held gestures repeatedly enter, hold and release so the
viewer sees how to perform them. No emoji is rendered in the tutorial UI. The
instructor is a generated 3D human demonstration, not a prerecorded human video.

Ice now uses a curved refractive glass sphere with a rotating faceted lattice.
Cross-arm blocking uses a smaller forward barrier. The shield input remains both
raised open palms. These visuals do not change the existing server damage rules.
Glass-like panels use translucent gradients, backdrop blur, fine edge highlights,
and the existing neon palette. Cursor motion creates a fading blue/magenta wake,
without replacing the standard arrow or intercepting clicks; it is disabled for
coarse pointers and reduced-motion preferences.

3D rendering pauses when offscreen/hidden, caps resolution, and reduces frame rate
and shadow updates while the camera is active to reduce GPU contention. WebGL2
and hardware acceleration are required; unsupported browsers show an error rather
than silently reverting to sprites. Renderer, geometry, materials, observers and
animation loops are disposed on navigation.

Restore source: `../outputs/gesture-kombat-before-3d-glass.tar.gz`.
Prior published restore point: version 3 (Raven × Vortex sprites).

3D pose checks: `node --experimental-strip-types --test tests/pose3d.test.ts`


## Graphics and live body motion upgrade (j1 restore point)

The local player's visible arm and leg joints now follow fresh MediaPipe world
landmarks through a local-only pose channel. Segment lengths remain fixed, low
confidence joints retain a stable stance, and samples expire after 180 ms.
Pose landmarks are not uploaded: remote players still see action animations.
This is approximate monocular retargeting, not motion-capture fidelity.

The arena adds instanced paving, columns, stairs, a rotating portal, layered curved
armor, emissive detailing, bloom and subtle hit camera motion. Ice uses a Fresnel
energy shell instead of expensive transmission. Rendering targets the display
refresh loop (60 Hz cap); camera mode reduces resolution and disables bloom to
prioritize tracking. Actual frame rate depends on the device and camera.

Higgsfield's advertised model lookup returned Unknown tool during this pass; no
Higgsfield assets were generated. Characters remain procedural stylized models,
not AAA sculpted/skinned assets. Full-body real-user motion still requires testing.

Backup before this upgrade: ../outputs/j1.tar.gz (source and assets, not live DB).


## Tournament UI redesign

The main menu now fills the screen with the user's supplied temple duel artwork,
with four typographic game-mode choices and a compact fighter selector. Camera
setup is expandable. Duels fill the viewport with health bars over the scene,
tracking in the corner, and expandable backup controls. The camera follows the
fighters' midpoint. The original neon color identities and all game modes remain.

Original j1 backup copied and verified at ~/Downloads/j1.tar.gz, with
~/Downloads/j1-restore.txt. Higgsfield connection is working, but the requested
image generation was rejected with Requires basic plan or higher; no generated
Higgsfield asset is included. 3D mesh generation is advertised in its catalog but
the generate_3d tool is not exposed here. Current combat fighters remain procedural.


## Selectable arenas and solo Live Tracking

Three supplied arena images (Sky Temple, Moon Citadel, Neon City) are selectable
in training, solo Live Tracking, and match setup. A room's arena is stored with
the room and shared with both players; for random matches the first queued
player's selection wins. Legacy rooms fall back to Moon Citadel.

Live Tracking is a dedicated camera/3D split view with one selected fighter and
no AI, damage, matchmaking, or timer. Pose data remains local. Upper-body pose
retargeting now continues with hidden hips while keeping untracked legs stable.
Training uses the chosen Raven/Vortex rig instead of the generic instructor;
its input demonstrations preserve the prayer/raised-palms controls.

The opening uses preloaded original fighter images with no scaling/filter
animation. Supplied arena images remain image backdrops behind real articulated
3D characters. The characters have revised armor, shoulders, helmet/hair and
materials, but remain stylized procedural models: the reference pictures are
not rigged 3D assets and do not establish an exact sculpted character match.
Actual tracking FPS remains hardware-dependent.


## Supplied Tripo character models

Raven and Vortex now load the user-supplied blue/red GLBs in all 3D modes, via `lib/model-rig.ts`. Textures are embedded, capped at 2048px; red is reduced from 1,044,386 to 37,142 vertices. Browser assets are about 9.3 MB and 6.3 MB. Originals remain untouched in Downloads and the pre-import j1 backup.

The blue export had a skeleton but almost all vertices weighted to Hips; red had no skeleton. The preparation scripts repair bind orientation, generate smooth distance-based four-bone weights for both meshes, and transfer the skeleton. These are approximate automatic weights: armor, fingers and cape can deform imperfectly, and there is no cloth simulation. The exports contain no authored animation clips; existing combat poses and live tracking drive the imported bones. Models load asynchronously with explicit loading/error UI; there is no visible procedural character fallback.

Preparation uses `scripts/prepare-tripo.mjs` (meshoptimizer) followed by `scripts/skin-tripo.py` (NumPy/Pillow), with the supplied files in Downloads. The intermediate file is `/private/tmp/red-simplified.json`. `tests/models.test.ts` verifies embedded textures, useful per-limb weighting, normalized weights, vertex limits, and hosting asset size limits.


## October 25 model inspection and contact combat update

New model exports from the supplied gesture folder replace the earlier approximate re-skinned models. The source GLBs (blue+glb and red-box) preserve their original textures and four-weight skinning. Every supplied file is audited in public/models/import-report.json: none includes an animation clip, and the named blue action files contain the same bone transforms. Therefore exact playback of those named animations is unavailable; movement continues using continuous poses/live retargeting. An export with animation enabled is required for authored clip playback. Originals are untouched.

Training and Live Tracking support drag-to-orbit, scroll-to-zoom, Reset view, and an Original pose inspection toggle. Camera orbit changes only the view, never combat positions.

New matches start at 250 HP. Attacks queue a wind-up before contact is checked; melee must connect within a short directional hit volume, fire/combo projectiles sweep a traveling path, and lightning marks a target position before striking. Moving out of the path, crouching, jumping, and shielding can avoid or mitigate damage. Hit volumes are a gameplay approximation, not per-triangle mesh collision. Server results remain authoritative. Existing matches retain their original max HP.

Animated orange fireballs, purple combo energy, particles, impact rings, lightning telegraphs/bolts and ice shields now work in tutorials, Live Tracking and matches. Power HUD includes fire/ice/lightning/combo emoji. Opening uses a short skippable neon transition with reduced-motion support.
