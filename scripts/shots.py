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
