"""
Meta VR Glasses check: gaze and pinch, and what fits the glasses' view.

Needs the emulator on the glasses profile, i.e. "dev.emulator.device":
"metaVRGlasses" in iwsdk.config.json. The glasses see 37 degrees left and
right, 25 up and 43 down from where you look; their input is one gaze ray
plus a pinch from either hand.

  1. The session is the glasses profile with gaze-tracking granted.
  2. With the head level, the hub's corners sit inside the glasses' view.
  3. Gaze at "Ready-made walks" and pinch with the right hand: it opens.
  4. Gaze at a concept and pinch with the LEFT hand: its palace builds.
  5. Gaze at a stage and pinch: it opens.
  6. Gaze disconnected: a hand's own far ray aims and selects again.
  The hub is checked twice: where it opens, and docked once a palace is built.

    python3 scripts/e2e-glasses.py
"""
import math
import sys
import time

sys.path.insert(0, 'scripts')
from e2e import check, ensure_xr, results, wait_for, xr  # noqa: E402
from ev import ev  # noqa: E402

N = 6
t0 = time.time()
HUB = "[...window.__loci.world.systems].find(s => s.constructor.name === 'HubSystem')"
PAL = "[...window.__loci.world.systems].find(s => s.constructor.name === 'PalaceSystem')"


def hub_el(el_id):
    return ev(f"""const el = {HUB}.panel.getElementById('{el_id}');
      if (!el || !el.isVisible?.value) return null;
      const p = el.getWorldPosition(el.position.clone()); return {{ x: p.x, y: p.y, z: p.z }}""")


def stage(i):
    return ev(f"""const r = [...{PAL}.records.values()].find(r => r.item.order === {i});
      if (!r) return null; const p = r.tile.card.getWorldPosition(r.tile.root.position.clone());
      return {{ x: p.x, y: p.y, z: p.z }}""")


def pinch(hand='hand-right'):
    # A quick pinch (press and release inside 300 ms) is a click.
    xr('select', {'device': hand})
    time.sleep(2.5)


def gaze_at(p):
    xr('look-at', {'device': 'gaze', 'target': p})
    time.sleep(3)  # let the gaze pointer settle on its target


ensure_xr()
st = xr('status')
check('emulator is the Meta VR Glasses profile', st.get('deviceName') == 'Meta VR Glasses', st.get('deviceName'))
feats = st.get('enabledFeatures') or []
check('gaze-tracking granted for the session', 'gaze-tracking' in feats, ', '.join(feats))
dev = xr('get-device-state')
gaze = dev.get('gaze') or {}
check('a gaze input is connected', gaze.get('connected') is True)

xr('set-input-mode', {'mode': 'hand'})
xr('set-connected', {'device': 'gaze', 'connected': True})
# Hands at rest in the lap, as a seated person's are. The emulator's default
# raises them in front of the face, where the left one hovers the docked hub,
# and any near hover rightly suppresses gaze.
for side, x in (('left', -0.18), ('right', 0.18)):
    xr('set-transform', {'device': f'hand-{side}', 'position': {'x': x, 'y': 0.72, 'z': -0.12}})
ev(f"""const L = window.__loci; if (L.settings.dwell) L.toggleSetting('dwell');
  L.bus.emit({{ type: 'new-palace' }}); L.app.lookPresses.length = 0; return 1""")
for _ in range(5):
    if wait_for(lambda: ev('return !window.__loci.app.palace && !window.__loci.app.pendingDeck'), 8, 1.5):
        break
    ev("window.__loci.bus.emit({ type: 'new-palace' }); return 1")
time.sleep(3)

# Field of view: the hub panel's four corners, with the head turned to look at
# the panel's centre (as a person does), against the glasses' 37/25/43 degrees.
def cli_json(*args):
    import json as _j
    import subprocess as _sp
    out = _sp.run(['npx', '@iwsdk/cli', *args], capture_output=True, text=True).stdout
    try:
        return _j.loads(out)['data']['result']
    except Exception:
        return {}


def qrot(q, v):
    x, y, z, w = q
    vx, vy, vz = v
    # v' = q v q*
    ix = w * vx + y * vz - z * vy
    iy = w * vy + z * vx - x * vz
    iz = w * vz + x * vy - y * vx
    iw = -x * vx - y * vy - z * vz
    return (ix * w + iw * -x + iy * -z - iz * -y,
            iy * w + iw * -y + iz * -x - ix * -z,
            iz * w + iw * -z + ix * -y - iy * -x)


def hub_fit(label):
    hier = cli_json('scene', 'runtime-hierarchy')
    uuid = None

    def walk(n):
        nonlocal uuid
        if isinstance(n, dict):
            if n.get('name') == 'Loci Hub':
                uuid = n.get('uuid')
            for c in n.get('children', []) or []:
                walk(c)
        elif isinstance(n, list):
            for c in n:
                walk(c)
    walk(hier)
    tr = cli_json('scene', 'transform', '--input-json', '{"uuid":"%s"}' % uuid)
    ent = cli_json('ecs', 'find', '--input-json', '{"namePattern":"Loci Hub"}')['entities'][0]['entityIndex']
    ui = cli_json('ui', 'inspect', '--input-json', '{"entityIndex":%d}' % ent)
    size = (ui.get('panel') or ui).get('computedSize')
    sc = tr['globalScale'][0]
    w, h = size['width'] / 100 * sc, size['height'] / 100 * sc
    c = tr['positionRelativeToXROrigin']
    q = tr['globalQuaternion']
    hp = (xr('get-device-state').get('headset') or {}).get('position') or {'x': 0, 'y': 1.6, 'z': 0}
    eye = (hp['x'], hp['y'], hp['z'])
    to = (c[0] - eye[0], c[1] - eye[1], c[2] - eye[2])
    yaw = math.atan2(to[0], -to[2])
    pitch = math.atan2(to[1], math.hypot(to[0], to[2]))
    worst = [0.0, 0.0, 0.0]  # sideways, up, down
    for sx in (-1, 1):
        for sy in (-1, 1):
            off = qrot(q, (sx * w / 2, sy * h / 2, 0))
            d = (c[0] + off[0] - eye[0], c[1] + off[1] - eye[1], c[2] + off[2] - eye[2])
            # Into the head frame: undo yaw, then pitch.
            fx = d[0] * math.cos(yaw) + d[2] * math.sin(yaw)
            fz = -(-d[0] * math.sin(yaw) + d[2] * math.cos(yaw))
            fy = d[1]
            fy, fz = fy * math.cos(pitch) - fz * math.sin(pitch), fy * math.sin(pitch) + fz * math.cos(pitch)
            hdeg = math.degrees(math.atan2(fx, fz))
            vdeg = math.degrees(math.atan2(fy, fz))
            worst[0] = max(worst[0], abs(hdeg))
            worst[1] = max(worst[1], vdeg)
            worst[2] = min(worst[2], vdeg)
    # The glasses see 74 x 68 degrees, but more below the view line than above
    # it. The panel fits if its angular size fits that window, aiming a little
    # below its centre when it is tall.
    span_v = worst[1] - worst[2]
    aim_down = max(0.0, worst[1] - (25 - 2))
    fits = worst[0] <= 37 - 2 and span_v <= 68 - 4 and worst[2] - aim_down >= -43 + 2
    check(f'the {label} hub fits the glasses view when you look at it', fits,
          f'{w * 100:.0f} x {h * 100:.0f} cm at {math.dist(eye, c):.2f} m: {2 * worst[0]:.0f} x {span_v:.0f} deg against 74 x 68'
          + (f', looking {aim_down:.0f} deg below its centre' if aim_down else ', looking at its centre'))


hub_fit('opening')

p = hub_el('btn-browse')
gaze_at(p)
hovered = ev(f"const el = {HUB}.panel.getElementById('btn-browse'); return (el.hoveredList?.value?.length ?? el.hoveredList?.length ?? 0) > 0")
pinch('hand-right')
opened = wait_for(lambda: ev(f"return {HUB}.browsing") is True, 15, 1.5)
check('gaze at "Ready-made walks" + right-hand pinch opens it', opened, f'hovered first: {hovered}')

p = wait_for(lambda: hub_el('concept-heart'), 15)
# The concept appears right under where the gaze already rests; a person's eyes
# move to it, so the gaze leaves and arrives fresh.
gaze_at({'x': 0.6, 'y': 1.0, 'z': -2.0})
gaze_at(p)
pinch('hand-left')
built = wait_for(lambda: ev('return window.__loci.app.palace?.placements.length ?? 0') == N, 90, 2)
check('gaze at a concept + LEFT-hand pinch builds its palace', built)
time.sleep(8)  # the hub glides to its docked spot
hub_fit('docked')

time.sleep(4)
p0 = stage(0)
gaze_at(p0)
pinch('hand-right')
FACE0 = "return window.__loci.debug.records().find(r => r.id.endsWith(':0'))?.face ?? null"
f0 = wait_for(lambda: ev(FACE0) in (1, 4), 20, 1.5) and ev(FACE0)
check('gaze at a stage + pinch opens it', f0 in (1, 4), f'face {f0}')
# Close it again (gaze still on it).
pinch('hand-right')
wait_for(lambda: ev(FACE0) not in (1,), 10, 1.5)

# Fallback: no gaze, the hand's own far ray aims.
xr('set-connected', {'device': 'gaze', 'connected': False})
time.sleep(3)
p1 = stage(4)  # on the right, so the right hand's ray does not cross the docked hub on the left
xr('look-at', {'device': 'hand-right', 'target': p1})
time.sleep(2.5)
pinch('hand-right')
FACE1 = "return window.__loci.debug.records().find(r => r.id.endsWith(':4'))?.face ?? null"
f1 = wait_for(lambda: ev(FACE1) in (1, 4), 20, 1.5) and ev(FACE1)
check('with gaze disconnected, a hand ray aims and opens a stage', f1 in (1, 4), f'face {f1}')
xr('set-connected', {'device': 'gaze', 'connected': True})

passed = sum(ok for _, ok in results)
print(f'\n{passed}/{len(results)} checks passed in {time.time() - t0:.0f} s')
sys.exit(0 if passed == len(results) else 1)
