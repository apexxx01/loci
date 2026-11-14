"""
End-to-end check of the core loop in the IWER emulator (synthetic rooms).

  pick a deck on the hub -> memories land on distinct furniture -> pinch flips a
  tile -> raising it rates the recall (FSRS) -> lowering one keeps it due ->
  exit + re-enter XR -> palace restored in place from the persistent anchor.

Run with the managed dev server up (with --allow-browser-automation):
    python3 scripts/e2e.py [room-label]
"""
import json
import math
import subprocess
import sys
import time

sys.path.insert(0, 'scripts')
from ev import ev  # noqa: E402

ROOM = sys.argv[1] if len(sys.argv) > 1 else 'room'
results = []


def cli(*args):
    out = subprocess.run(['npx', '@iwsdk/cli', *args], capture_output=True, text=True).stdout
    try:
        d = json.loads(out)
    except json.JSONDecodeError:
        return {}
    return (d.get('data') or {}).get('result', d)


def xr(action, payload=None):
    return cli('xr', action, '--input-json', json.dumps(payload or {}))


def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}")


def state():
    r = ev("""const a = window.__loci.app;
      return { palace: !!a.palace, n: a.palace?.placements.length ?? 0, frame: a.frame,
               labels: a.palace?.placements.map(p => p.label) ?? [],
               due: a.palace ? Object.values(a.palace.cards).filter(c => new Date(c.due) <= new Date()).length : 0,
               history: a.palace?.history.length ?? 0, last: a.lastRelease, status: a.status,
               surfaces: a.surfaces.length }""")
    return r if isinstance(r, dict) else {}


def targets():
    xr('set-input-mode', {'mode': 'hand'})
    r = xr('list-targets')
    xr('set-input-mode', {'mode': 'controller'})
    return {t['name']: t for t in r.get('targets', [])}


def aim_select(pos, duration=0.15):
    xr('look-at', {'device': 'controller-right', 'target': pos})
    time.sleep(0.8)  # let the pointer register a hover before pressing
    xr('select', {'device': 'controller-right', 'duration': duration})


def ensure_xr():
    for _ in range(20):
        st = xr('status')
        if st.get('sessionActive'):
            return True
        if st.get('sessionOffered'):
            xr('enter')
        time.sleep(1.5)
    return False


def wait_for(fn, timeout=40, every=1.5):
    end = time.time() + timeout
    while time.time() < end:
        v = fn()
        if v:
            return v
        time.sleep(every)
    return None


def grab_and_move(pos, dy):
    xr('look-at', {'device': 'controller-right', 'target': pos})
    time.sleep(0.8)
    xr('set-select-value', {'device': 'controller-right', 'value': 1})
    time.sleep(1.0)
    p = xr('get-transform', {'device': 'controller-right'}).get('position') or {'x': 0.25, 'y': 1.5, 'z': -0.4}
    xr('animate-to', {'device': 'controller-right', 'position': {'x': p['x'], 'y': p['y'] + dy, 'z': p['z']}, 'duration': 0.3})
    time.sleep(2.5)
    xr('set-select-value', {'device': 'controller-right', 'value': 0})
    xr('animate-to', {'device': 'controller-right', 'position': p, 'duration': 0.2})
    time.sleep(1.5)


# ------------------------------------------------------------------ run
check('XR session active', ensure_xr())
time.sleep(6)  # sessionstart restores any saved palace

if state().get('palace'):
    t = targets()
    if 'btn-new' in t:
        aim_select(t['btn-new']['position'])
    wait_for(lambda: not state().get('palace'), 15)

t = targets()
check('deck picker on the hub', 'deck-planets' in t)
t0 = time.time()
aim_select(t['deck-planets']['position'])
s = wait_for(lambda: (lambda st: st if st.get('n') == 8 else None)(state()), 60) or state()
check('8 memories placed and saved', s.get('n') == 8, f"{s.get('n')} placements, frame={s.get('frame')}")
labels = s.get('labels', [])
check('spread across distinct real objects', len(set(labels)) >= 6 and '' not in labels, ', '.join(labels))
check('saved relative to the persistent anchor', s.get('frame') == 'anchor')
print(f'   pick -> palace saved in {time.time() - t0:.1f}s wall-clock (emulator, headless)')
print(f"   status: {s.get('status')}")

t = targets()
tile = t.get('tile:planets:3')
check('tile is an interaction target', tile is not None)
p = tile['position']

aim_select(p, duration=0.05)
time.sleep(1.5)
check('pinch flips the tile', (state().get('last') or {}).get('result') == 'tap', str(state().get('last')))

before = state()
grab_and_move(p, 0.35)
after = state()
check('raising it records a recall', after.get('history') == before.get('history') + 1 and after.get('due') == before.get('due') - 1,
      f"history {before.get('history')}->{after.get('history')}, due {before.get('due')}->{after.get('due')}, {after.get('last')}")

p2 = t['tile:planets:5']['position']
before = state()
grab_and_move(p2, -0.35)
after = state()
check('lowering it keeps the memory due', after.get('history') == before.get('history') + 1 and after.get('due') == before.get('due'),
      f"due {before.get('due')}->{after.get('due')}, {after.get('last')}")

poses_before = ev("return window.__loci.app.palace.placements.map(p => p.pose.p)")
xr('exit')
time.sleep(3)
ensure_xr()
restored = wait_for(lambda: 'Welcome back' in (state().get('status') or '') or None, 30)
time.sleep(2)
poses_after = ev("return window.__loci.app.palace.placements.map(p => p.pose.p)")
drift = max((math.dist(a, b) for a, b in zip(poses_before, poses_after)), default=99)
check('palace restored in place after re-entering', restored and drift < 0.01, f'max drift {drift:.4f} m; "{state().get("status")}"')

passed = sum(ok for _, ok in results)
print(f'\n{passed}/{len(results)} checks passed')
sys.exit(0 if passed == len(results) else 1)
