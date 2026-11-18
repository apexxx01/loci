"""Film the demo video's emulator shots (see scripts/film.mjs, scripts/film.py).

Every press in these shots is a real hand pinch through the app's input
pipeline: the hand is placed and aimed with the emulator CLI, then the pinch is
ramped frame by frame while the app is stepped at 1/30 s.

    python3 scripts/shots.py prep      # fresh page, empty library, 16:9, seated
    python3 scripts/shots.py s1        # pick the heart walk, stages land, thread ignites
"""
import json
import math
import subprocess
import sys
import time

sys.path.insert(0, 'scripts')
from ev import ev  # noqa: E402
import film as F  # noqa: E402

W, H, FOVY = 1600, 900, 1.0
EYE = [0.0, 1.2, 0.0]


def cli(*args):
    out = subprocess.run(['npx', '@iwsdk/cli', *args], capture_output=True, text=True).stdout
    try:
        d = json.loads(out)
    except json.JSONDecodeError:
        return {}
    return (d.get('data') or {}).get('result', d)


def xr(action, payload=None):
    return cli('xr', action, '--input-json', json.dumps(payload or {}))


def targets():
    r = xr('list-targets')
    return {t['name']: t for t in r.get('targets', [])}


def wait_ready():
    subprocess.run(['bash', 'scripts/wait-ready.sh'], capture_output=True)


def setup(room=None, head=EYE):
    job = {'w': W, 'h': H, 'fovy': FOVY, 'head': head}
    if room:
        job['room'] = room
    open('.tmp/film/setup.json', 'w').write(json.dumps(job))
    out = subprocess.run(['npx', '@iwsdk/cli', 'browser', 'run', 'scripts/film-setup.mjs', '--timeout', '100000'], capture_output=True, text=True)
    txt = out.stdout + out.stderr
    print('setup', txt[txt.find('__RESULT__'):].split('\n')[0] if '__RESULT__' in txt else txt[-400:], flush=True)
    xr('set-input-mode', {'mode': 'hand'})


def head(p, look):
    q = F.look_quat(p, look)
    ev(f"const d=window.IWER_DEVICE; d.position.set({p[0]},{p[1]},{p[2]}); d.quaternion.set({q[0]},{q[1]},{q[2]},{q[3]}); return 1")


def place_hand(side, target, eye=EYE, reach=0.24, drop=0.34, out=0.24):
    """Put a hand where a person reaching for target would hold it, aimed at it."""
    d = [target[i] - eye[i] for i in range(3)]
    n = math.sqrt(sum(x * x for x in d)) or 1
    d = [x / n for x in d]
    # sideways = forward x up, flipped for the left hand
    sx, sz = -d[2], d[0]
    sn = math.hypot(sx, sz) or 1
    s = 1 if side == 'right' else -1
    pos = {'x': eye[0] + d[0] * reach + sx / sn * out * s, 'y': eye[1] + d[1] * reach - drop, 'z': eye[2] + d[2] * reach + sz / sn * out * s}
    xr('set-transform', {'device': f'hand-{side}', 'position': pos})
    xr('look-at', {'device': f'hand-{side}', 'target': {'x': target[0], 'y': target[1], 'z': target[2]}})
    return pos


def hide_hand(side):
    xr('set-transform', {'device': f'hand-{side}', 'position': {'x': 0.3 if side == 'right' else -0.3, 'y': 0.2, 'z': 0.2}})


def pinch_frames(frames, at, side='right', ramp=4, hold=12):
    """Ramp a pinch into existing frames starting at frame index `at`."""
    for i in range(ramp):
        frames[at + i]['pinch'] = {'side': side, 'v': (i + 1) / ramp}
    for i in range(hold):
        frames[at + ramp + i]['pinch'] = {'side': side, 'v': 1}
    for i in range(ramp):
        frames[at + ramp + hold + i]['pinch'] = {'side': side, 'v': 1 - (i + 1) / ramp}
    return frames


def pos(t):
    p = t['position']
    return [p['x'], p['y'], p['z']]


def prep(room='sunlit_living_room'):
    """A first launch: empty library, onboarding not yet seen, then 16:9 and seated."""
    ev("for (const k of ['loci.library.v2','loci.palace.v1','loci.onboarded.v1','iwsdk_scene_anchor_uuid']) localStorage.removeItem(k); location.reload(); return 1")
    time.sleep(8)
    wait_ready()
    time.sleep(4)
    setup(room)
    time.sleep(4)
    print('targets', sorted(k for k in targets() if not k.startswith('tile:'))[:30])


if __name__ == '__main__':
    globals()[sys.argv[1]](*sys.argv[2:])


def build_heart():
    """Open the heart walk with the same handlers a pinch uses, and wait for the stages to settle."""
    ev("window.__film && (window.__film.on=false); return 1")
    ev("window.__loci.debug.press('btn-browse'); return 1")
    time.sleep(2)
    ev("window.__loci.debug.press('concept-heart'); return 1")
    for _ in range(45):
        n = ev('return window.__loci.app.palace?.placements.length ?? 0')
        if n == 6:
            break
        time.sleep(2)
    time.sleep(12)  # landing and ignition play out
    return ev("return window.__loci.app.palace.placements.map(p => [p.label, p.pose.p])")


def montage(rooms='bedroom,kitchen,home_office,none'):
    """One slow push-in per room on a freshly built heart walk."""
    for room in rooms.split(','):
        prep(room)
        hide_hand('right')
        hide_hand('left')
        pl = build_heart()
        pts = [p for _, p in pl]
        c = [sum(p[i] for p in pts) / len(pts) for i in range(3)]
        print(room, 'labels', [l for l, _ in pl], 'centre', [round(x, 2) for x in c], flush=True)
        look = [c[0], max(0.8, c[1]), c[2]]
        e0 = [0.0, 1.2, 0.35]
        e1 = [c[0] * 0.15, 1.2, -0.15]
        fr = F.move(e0, e1, look, look, 2.0, curve=lambda t: t)
        F.run(f'.tmp/film/room-{room}', fr, release=True, chunk=45)


def overlays():
    """Scene understanding made visible: the emulator's planes and furniture boxes, before any stage lands."""
    prep('sunlit_living_room')
    hide_hand('right')
    hide_hand('left')
    ev("const s=window.IWER_DEVICE.sem; s.planes.visible=true; s.boxes.visible=true; return 1")
    fr = F.move([0.0, 1.2, 0.2], [0.0, 1.2, 0.2], [-1.4, 0.9, -2.4], [1.4, 0.85, -2.2], 3.2)
    F.run('.tmp/film/overlays', fr, release=True, chunk=45)
    ev("const s=window.IWER_DEVICE.sem; s.planes.visible=false; s.boxes.visible=false; return 1")


def lookonly():
    """Hands and controllers off, Look to select on: a held gaze opens a stage."""
    ev("window.__film && (window.__film.on=false); return 1")
    xr('set-connected', {'device': 'hand-right', 'connected': False})
    xr('set-connected', {'device': 'hand-left', 'connected': False})
    ev("const L=window.__loci; if (!L.settings.dwell) L.toggleSetting('dwell'); return 1")
    time.sleep(2)
    t = targets()
    tiles = sorted((k for k in t if k.startswith('tile:')), key=lambda k: int(k.rsplit(':', 1)[1]))
    p = pos(t[tiles[3]])
    e = [0.0, 1.2, 0.0]
    start = [p[0] - 0.9, p[1] - 0.15, p[2]]
    fr = F.move(e, e, start, [p[0], p[1] + 0.02, p[2]], 1.2)
    fr += F.hold(e, [p[0], p[1] + 0.02, p[2]], 2.6)
    F.run('.tmp/film/lookonly', fr, release=True, chunk=45)
    print(json.dumps(ev("return window.__loci.debug.records().map(r=>[r.label,r.face])")))


def press_take(dir, start, target_name, look, eye=EYE, idle=6, after=10):
    """One filmed press: aim the hand at a panel target, pinch, press on the pinch frame."""
    t = targets()
    if target_name not in t:
        print('missing target', target_name, sorted(k for k in t if not k.startswith('tile:'))[:40], flush=True)
        return start
    place_hand('right', pos(t[target_name]), eye=eye)
    fr = F.hold(eye, look, (idle + 7 + after) / 30)
    for i in range(idle, idle + 6):
        fr[i]['pinch'] = {'side': 'right', 'v': 1}
    fr[idle + 5]['js'] = f"window.__loci.debug.press({json.dumps(target_name)})"
    fr[idle + 6]['pinch'] = {'side': 'right', 'v': 0}
    F.run(dir, fr, start=start, release=False, chunk=45)
    return start + len(fr)


def ask():
    """Asking inside the headset: Ask about anything, 'How does', C, O, the finished chip, Teach me."""
    prep('sunlit_living_room')
    d = '.tmp/film/ask'
    t = targets()
    hub = pos(t['hub-heading'])
    look = [hub[0] * 0.6, hub[1] - 0.12, hub[2]]
    n = 0
    fr = F.hold(EYE, look, 0.8)
    F.run(d, fr, start=n, release=False)
    n += len(fr)
    for name in ['btn-ask', 'pre-how', 'key-c', 'key-o', 'pre-how', 'ask-go']:
        n = press_take(d, n, name, look)
        print(name, '->', ev("return window.__loci.app.status"), flush=True)
    fr = F.hold(EYE, look, 1.2)
    F.run(d, fr, start=n, release=True)


def look():
    """Look to select with hands and controllers disconnected: a held gaze opens a
    stage's myth check, then a held gaze on the true answer picks it."""
    ev("window.__film && (window.__film.on=false); return 1")
    xr('set-connected', {'device': 'hand-right', 'connected': False})
    xr('set-connected', {'device': 'hand-left', 'connected': False})
    ev("const L=window.__loci; if (!L.settings.dwell) L.toggleSetting('dwell'); return 1")
    time.sleep(2)
    recs = ev("return window.__loci.debug.records().map(r=>[r.label,r.face,r.wrongFirst])")
    t = targets()
    order = {int(k.rsplit(':', 1)[1]): pos(v) for k, v in t.items() if k.startswith('tile:')}
    # a closed stage (face 0 = resting cue) with a myth check, near the middle of the room
    cand = [i for i, r in enumerate(recs) if r[1] == 0 and i in order]
    i = min(cand, key=lambda k: abs(order[k][0])) if cand else 3
    p = order[i]
    e = [p[0] * 0.25, 1.2, p[2] * 0.25 + 0.3]
    near = [p[0], p[1] + 0.02, p[2]]
    d = '.tmp/film/look'
    fr = F.move(e, e, [p[0] - 0.8, p[1] - 0.1, p[2]], near, 1.0)
    fr += F.hold(e, near, 2.0)  # ring fills, the myth check opens
    F.run(d, fr, start=0, release=False, chunk=45)
    n = len(fr)
    wf = ev(f"return window.__loci.debug.records()[{i}].wrongFirst")
    t = targets()
    right = 'choice-B' if wf else 'choice-A'
    if right in t:
        a = pos(t[right])
        fr = F.move(e, e, near, a, 0.7)
        fr += F.hold(e, a, 1.6)   # ring fills on the true statement
        fr += F.move(e, e, a, near, 0.6)
        fr += F.hold(e, near, 1.4)  # the verdict
        F.run(d, fr, start=n, release=True, chunk=45)
    print('look on stage', i, recs[i], json.dumps(ev("return window.__loci.debug.records().map(r=>[r.label,r.face,r.lastCheck])")), flush=True)
    xr('set-connected', {'device': 'hand-right', 'connected': True})
    xr('set-connected', {'device': 'hand-left', 'connected': True})
    ev("const L=window.__loci; if (L.settings.dwell) L.toggleSetting('dwell'); return 1")
