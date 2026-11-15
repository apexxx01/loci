"""
End-to-end check of a concept palace in the IWER emulator (synthetic rooms).

  pick "How your heart pumps blood" on the hub -> six stages land on distinct
  furniture -> the light threads join them in order and ignite -> a stage is
  turned over to its myth check -> picking the true statement records a recall
  and lights the thread -> picking the myth on another stage brings it back
  within minutes -> exit + re-enter XR -> stages and threads restored in place.

Run with the managed dev server up (with --allow-browser-automation):
    python3 scripts/e2e-concept.py [room-label]
"""
import math
import sys
import time

sys.path.insert(0, 'scripts')
from e2e import aim_select, check, ensure_xr, results, state, targets, wait_for, xr  # noqa: E402
from ev import ev  # noqa: E402

N = 6


def threads():
    return ev("""const w = window.__loci.world; let m = null;
      w.scene.traverse(o => { if (o.material?.uniforms?.uIgnite && o.geometry?.drawRange) m = o; });
      if (!m) return { found: false };
      return { found: true, visible: m.visible, links: m.geometry.drawRange.count / 162,
               fade: m.material.uniforms.uFade.value, lit: [...m.material.uniforms.uLit.value] }""")


def tile_state(i):
    return ev(f"""const rec = window.__loci.debug.records().find(r => r.id === 'concept-heart:{i}');
      return rec ?? null""")


def pinch(pos):
    xr('look-at', {'device': 'controller-right', 'target': pos})
    time.sleep(2.5)
    xr('set-select-value', {'device': 'controller-right', 'value': 1})
    time.sleep(1.2)
    xr('set-select-value', {'device': 'controller-right', 'value': 0})
    time.sleep(2.5)


check('XR session active', ensure_xr())
time.sleep(6)
# Start clean: put any palace away and empty the library (setup, not under test).
ev("window.__loci.bus.emit({ type: 'new-palace' }); localStorage.removeItem('loci.library.v2'); return 1")
wait_for(lambda: not state().get('palace'), 10)
time.sleep(3)  # the hub glides back in front before its buttons settle

t = targets()
check('hub opens on asking, with no topic pushed first', 'btn-ask' in t and 'concept-heart' not in t, ', '.join(sorted(k for k in t if not k.startswith('tile:')))[:200])
aim_select(t['btn-ask']['position'])
time.sleep(2)
t = targets()
check('the keyboard opens inside the headset', 'key-t' in t and 'ask-go' in t)
aim_select(t['ask-cancel']['position'])
time.sleep(2)
aim_select(targets()['btn-browse']['position'])
time.sleep(2)
t = targets()
check('ready-made walks open on request', 'concept-heart' in t)
t0 = time.time()
aim_select(t['concept-heart']['position'])
s = wait_for(lambda: (lambda st: st if st.get('n') == N else None)(state()), 60) or state()
check(f'{N} stages placed and saved', s.get('n') == N, f"{s.get('n')} placements, frame={s.get('frame')}")
labels = s.get('labels', [])
check('stages spread across distinct objects', len(set(labels)) >= 4, ', '.join(labels))
print(f'   pick -> palace saved in {time.time() - t0:.1f}s wall-clock (emulator, headless)')

th = wait_for(lambda: (lambda r: r if r.get('found') and r.get('fade', 0) > 0.5 else None)(threads()), 15) or threads()
check('light threads join the stages in order', th.get('found') and round(th.get('links', 0)) == N - 1, str(th))

# Stage 1 starts as a glowing label: pinch opens it, pinch closes it, pinch again opens the myth check.
t = targets()
p = t['tile:concept-heart:0']['position']
pinch(p)
st = tile_state(0)
check('pinching a label blooms it open', st and st.get('face') == 1, str(st))
pinch(p)
pinch(p)
st = tile_state(0)
check('pinching a studied stage opens its myth check', st and st.get('face') == 4, str(st))
t = targets()
check('two answer buttons appear', 'choice-A' in t and 'choice-B' in t)
right = 'choice-B' if st.get('wrongFirst') else 'choice-A'
before = state()
aim_select(t[right]['position'])
time.sleep(2)
after = state()
st = tile_state(0)
check('picking the true statement records a recall', after.get('history') == before.get('history') + 1 and st.get('lastCheck') == 'right',
      f"history {before.get('history')}->{after.get('history')}, {st}")
th = threads()
check('the thread from that stage lights up', (th.get('lit') or [0])[0] > 0.5, str(th.get('lit')))

# Stage 3: pick the myth on purpose.
p3 = t['tile:concept-heart:2']['position']
pinch(p3)
pinch(p3)
pinch(p3)
st = tile_state(2)
t = targets()
wrong = 'choice-A' if st.get('wrongFirst') else 'choice-B'
for _ in range(2):  # one retry if the first press lands before the hover registers
    aim_select(t[wrong]['position'])
    time.sleep(2)
    if (tile_state(2) or {}).get('face') != 4:
        break
again = ev("""const p = window.__loci.app.palace; const last = p.history[p.history.length - 1];
  return { id: last.memoryId, rating: last.rating, mins: (new Date(p.cards[last.memoryId].due) - Date.now()) / 60000 }""")
st = tile_state(2)
check('picking the myth shows the correction and brings it back within minutes',
      again.get('rating') == 'again' and again.get('mins', 99) <= 10 and st.get('lastCheck') == 'wrong', f'{again} {st}')

poses_before = ev("return window.__loci.app.palace.placements.map(p => p.pose.p)")
xr('exit')
time.sleep(3)
ensure_xr()
restored = wait_for(lambda: 'Welcome back' in (state().get('status') or '') or None, 30)
time.sleep(3)
poses_after = ev("return window.__loci.app.palace.placements.map(p => p.pose.p)")
drift = max((math.dist(a, b) for a, b in zip(poses_before, poses_after)), default=99)
check('stages restored in place after re-entering', restored and drift < 0.01, f'max drift {drift:.4f} m')
th = wait_for(lambda: (lambda r: r if r.get('found') and r.get('fade', 0) > 0.5 else None)(threads()), 10) or threads()
check('threads come back with the palace', round(th.get('links', 0)) == N - 1, str(th))

passed = sum(ok for _, ok in results)
print(f'\n{passed}/{len(results)} checks passed')
sys.exit(0 if passed == len(results) else 1)
