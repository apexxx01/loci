"""
Room matrix: run the concept end-to-end (scripts/e2e-concept.py) once in every
synthetic room the Immersive Web Emulator (IWER) ships, plus once in a room
with no scene data at all (no planes, no meshes).

The room is switched at runtime through the emulator's Synthetic Environment
Module (window.IWER_DEVICE.sem, the same calls its room picker makes), so
iwsdk.config.json is never edited. The configured room is loaded again at the
end.

Per room it records: surfaces the app derived from scene understanding, where
the six stages landed (on real surfaces vs on the virtual seated arc), the
e2e checks passed, and the restore drift after exit + re-enter.

Run with the managed dev server up (with --allow-browser-automation):
    python3 scripts/matrix.py                  # every room + the empty room
    python3 scripts/matrix.py kitchen none     # just these
    python3 scripts/matrix.py --same-page      # no page reload between rooms

The page is reloaded before each room, so every room starts like a fresh
launch. Writes .tmp/matrix.json and one log per room in .tmp/matrix-<room>.log.
"""
import collections
import json
import re
import subprocess
import sys
import time
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, 'scripts')
from e2e import cli, wait_for, xr  # noqa: E402
from ev import ev  # noqa: E402

IST = ZoneInfo('Asia/Kolkata')
FRESH = '--same-page' not in sys.argv
# Every check() call in the e2e, so a run that stops early still reports against the full count.
E2E_CHECKS = len(re.findall(r'^\s*check\(', open('scripts/e2e-concept.py').read(), re.M))
CONFIG_ROOM = json.load(open('iwsdk.config.json'))['dev']['emulator'].get('environment')


def now_ist():
    return datetime.now(IST).strftime('%Y-%m-%d %H:%M IST')


def ensure_browser():
    """Relaunch the managed browser if it has gone away (runtime recover), then wait for the app."""
    for _ in range(3):
        if ev('return !!(window.__loci?.world && window.IWER_DEVICE?.sem)') is True:
            return True
        print('  app frame not ready; npx @iwsdk/cli runtime recover', flush=True)
        subprocess.run(['npx', '@iwsdk/cli', 'runtime', 'recover'], capture_output=True)
        time.sleep(10)
        subprocess.run(['bash', 'scripts/wait-ready.sh'], capture_output=True)
        time.sleep(3)
    return False


def rooms_available():
    ensure_browser()
    r = ev('return window.IWER_DEVICE?.sem?.environments ?? null')
    return list(r) if isinstance(r, list) else []


def load_room(room):
    """Switch the emulator's synthetic room. 'none' removes every plane and mesh."""
    if room == 'none':
        return ev('window.IWER_DEVICE.sem.deleteAll(); return true')
    return ev(f"await window.IWER_DEVICE.sem.loadDefaultEnvironment({json.dumps(room)}); return true")


def surfaces():
    r = ev("""return window.__loci.app.surfaces.map(s => ({ kind: s.kind, label: s.label, o: s.orientation }))""")
    return r if isinstance(r, list) else []


def stable_surfaces(timeout=20):
    """Surfaces are rebuilt twice a second; wait until two reads agree."""
    last, end = None, time.time() + timeout
    while time.time() < end:
        s = surfaces()
        sig = json.dumps(s)
        if sig == last:
            return s
        last = sig
        time.sleep(2)
    return surfaces()


def frame_interval(frames=8):
    """Median ms between XR frames the emulator presents in this room (it renders on software GL)."""
    r = ev(f"""const s = window.__loci.world.session; if (!s) return null;
      return await new Promise(res => {{ const ts = [];
        const f = (t) => {{ ts.push(performance.now()); if (ts.length <= {frames}) s.requestAnimationFrame(f);
          else {{ const d = ts.slice(1).map((v, i) => v - ts[i]).sort((a, b) => a - b); res(Math.round(d[d.length >> 1])); }} }};
        s.requestAnimationFrame(f); setTimeout(() => res(null), 60000); }})""")
    return r if isinstance(r, (int, float)) else None


def watch_status():
    ev("""if (!window.__matrixStatus) { window.__matrixStatus = [];
            window.__loci.bus.on(e => { if (e.type === 'status') window.__matrixStatus.push(e.text); }); }
          window.__matrixStatus.length = 0; return 1""")


def fresh_page():
    """Reload the app, as if it were launched fresh in this room.

    e2e-concept.py assumes a freshly loaded hub: HubSystem.browsing in
    src/xr/hub-system.ts lives for the page's lifetime, so a second run in the
    same page finds the ready-made walks already open (see docs/test-matrix.md).
    """
    cli('browser', 'reload')
    time.sleep(5)
    subprocess.run(['bash', 'scripts/wait-ready.sh'], capture_output=True)
    wait_for(lambda: ev('return !!(window.__loci?.world && window.IWER_DEVICE?.sem)') is True, 60, 2)
    ensure_browser()
    time.sleep(3)


def run_room(room):
    print(f'\n=== {room} ===', flush=True)
    if FRESH:
        fresh_page()
    else:
        ensure_browser()
    st = xr('status')
    if st.get('sessionActive'):
        xr('exit')
        time.sleep(3)
    # Start each room with no saved palace, so nothing from the last room is restored here.
    ev("window.__loci.bus.emit({ type: 'new-palace' }); localStorage.removeItem('loci.library.v2'); return 1")
    load_room(room)
    time.sleep(3)
    for _ in range(20):
        st = xr('status')
        if st.get('sessionActive'):
            break
        if st.get('sessionOffered'):
            xr('enter')
        time.sleep(1.5)
    time.sleep(4)
    if room == 'none':
        load_room('none')  # a fresh session must not repopulate anything
        time.sleep(2)
    surf = stable_surfaces()
    interval = frame_interval()
    watch_status()

    started = now_ist()
    t0 = time.time()
    proc = subprocess.run([sys.executable, 'scripts/e2e-concept.py', room], capture_output=True, text=True)
    log = proc.stdout + proc.stderr
    with open(f'.tmp/matrix-{room}.log', 'w') as f:
        f.write(f'ranAt: {started}\ncommand: python3 scripts/e2e-concept.py {room}\n\n{log}')

    checks = [(m.group(1) == 'PASS', m.group(2).strip()) for m in re.finditer(r'^(PASS|FAIL)  (.+?)  ', log, re.M)]
    m = re.search(r'(\d+)/(\d+) checks passed', log)
    drift = re.search(r'max drift ([\d.]+) m', log)

    statuses = ev('return window.__matrixStatus ?? []')
    statuses = statuses if isinstance(statuses, list) else []
    placed = next((s for s in statuses if re.match(r'(Placed \d+ memories|No furniture found)', s)), None)
    labels = ev('return window.__loci.app.palace?.placements.map(p => p.label) ?? []')
    labels = labels if isinstance(labels, list) else []
    on_real = None
    if placed:
        pm = re.match(r'Placed (\d+) memories: (\d+) on', placed)
        on_real = int(pm.group(2)) if pm else 0
    else:
        on_real = sum(1 for l in labels if l)  # fallback: arc slots carry no label

    kinds = collections.Counter(s['label'] or '(unlabelled)' for s in surf)
    row = {
        'room': room,
        'ranAt': started,
        'seconds': round(time.time() - t0),
        'frameIntervalMs': interval,
        'surfaces': len(surf),
        'planes': sum(1 for s in surf if s['kind'] == 'plane'),
        'meshes': sum(1 for s in surf if s['kind'] == 'mesh'),
        'surfaceLabels': dict(sorted(kinds.items())),
        'stages': len(labels),
        'onSurfaces': on_real,
        'onArc': (len(labels) - on_real) if labels and on_real is not None else None,
        'stageLabels': labels,
        'buildStatus': placed,
        'passed': int(m.group(1)) if m else sum(ok for ok, _ in checks),
        'checks': int(m.group(2)) if m else E2E_CHECKS,
        'completed': bool(m),
        'error': None if m else (log.strip().splitlines() or [''])[-1],
        'failed': [name for ok, name in checks if not ok],
        'maxRestoreDriftM': float(drift.group(1)) if drift else None,
        'exitCode': proc.returncode,
    }
    print(json.dumps(row, indent=1), flush=True)
    return row


def main():
    available = rooms_available()
    if not available:
        print('No IWER synthetic rooms found (is the dev server up and the app frame ready?)')
        return 2
    wanted = [a for a in sys.argv[1:] if not a.startswith('--')] or [*available, 'none']
    rows = []
    try:
        for room in wanted:
            if room != 'none' and room not in available:
                print(f'skipping unknown room {room}; available: {", ".join(available)}')
                continue
            rows.append(run_room(room))
            with open('.tmp/matrix.json', 'w') as f:
                json.dump({'command': 'python3 scripts/matrix.py ' + ' '.join(sys.argv[1:]), 'rooms': rows}, f, indent=1)
    finally:
        if CONFIG_ROOM:
            load_room(CONFIG_ROOM)  # leave the emulator in the configured room

    print('\nroom | surfaces | on surfaces / on arc | checks | drift (m) | frame interval (ms)')
    for r in rows:
        print(f"{r['room']} | {r['surfaces']} | {r['onSurfaces']} / {r['onArc']} | {r['passed']}/{r['checks']} | {r['maxRestoreDriftM']} | {r['frameIntervalMs']}")
    ok = sum(1 for r in rows if r['checks'] and r['passed'] == r['checks'])
    print(f'\n{ok} of {len(rows)} rooms passed every check')
    return 0 if ok == len(rows) else 1


if __name__ == '__main__':
    sys.exit(main())
