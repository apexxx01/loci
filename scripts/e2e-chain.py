"""
End-to-end check of the headset asking and practice flows in the IWER emulator.

  keyboard: Ask about anything -> type "How" with three key presses -> the
  chips turn from openers into finished questions -> Back.  Chain practice: build a concept -> Rebuild the chain
  -> stage numbers hide and the thread dims -> a wrong pick is refused -> the
  stages picked in order relight every link -> practice ends.

Run with the managed dev server up (with --allow-browser-automation):
    python3 scripts/e2e-chain.py
"""
import sys
import time

sys.path.insert(0, 'scripts')
from e2e import aim_select, check, ensure_xr, results, state, targets, wait_for, xr  # noqa: E402
from ev import ev  # noqa: E402

N = 6


def thread():
    return ev("""const w = window.__loci.world; let m = null;
      w.scene.traverse(o => { if (o.material?.uniforms?.uBase) m = o; });
      return m ? { base: m.material.uniforms.uBase.value, lit: [...m.material.uniforms.uLit.value] } : null""")


def tap_tile(i, wait=2.5):
    # Reach towards the stage first (as a person leaning in would), so the ray
    # cannot clip a nearer stage or the docked panel on its way there.
    pos = targets()[f'tile:concept-heart:{i}']['position']
    dev = 'controller-left' if pos['x'] < 0 else 'controller-right'
    d = (pos['x'] ** 2 + (pos['z']) ** 2) ** 0.5 or 1
    k = max(0.0, (d - 0.7) / d)
    xr('animate-to', {'device': dev, 'position': {'x': pos['x'] * k, 'y': pos['y'] + 0.05, 'z': pos['z'] * k}, 'duration': 0.2})
    time.sleep(1.2)
    xr('look-at', {'device': dev, 'target': pos})
    time.sleep(2.5)
    xr('set-select-value', {'device': dev, 'value': 1})
    time.sleep(1.4)
    xr('set-select-value', {'device': dev, 'value': 0})
    time.sleep(wait)


def press(name, wait=1.6):
    t = targets()
    if name not in t:
        return False
    aim_select(t[name]['position'])
    time.sleep(wait)
    return True


check('XR session active', ensure_xr())
time.sleep(5)
ev("window.__loci.bus.emit({ type: 'new-palace' }); localStorage.removeItem('loci.library.v2'); localStorage.removeItem('loci.onboarded.v1'); return 1")
wait_for(lambda: not state().get('palace'), 10)
# The hub keeps a typed question as a draft when you press Back, so a run in a
# page an earlier run used starts from an empty draft, like a fresh launch.
ev("const h = [...window.__loci.world.systems].find(s => s.constructor.name === 'HubSystem'); if (h) h.askText = ''; return 1")
time.sleep(3)

# Keyboard: type "How" and expect finished questions on the chips.
# With fewer than two letters typed the chips are the openers ("How does",
# "Why do", ...), so their mere presence proves nothing: read what the hub has
# typed and what each visible chip says.
HUB = """const hub = [...window.__loci.world.systems].find(s => s.constructor.name === 'HubSystem');
  return hub ? { asking: hub.asking, text: hub.askText, chips: hub.chips() } : null"""
OPENERS = {'How does', 'Why do', 'What is', 'Explain'}
press('btn-ask', 4)
print(f"   keyboard open after Ask: {'key-h' in targets()}", flush=True)
for k in ['key-h', 'key-o', 'key-w']:
    press(k, 1.2)
    print(f'   after {k}: {ev(HUB)}', flush=True)
t = targets()
hub = ev(HUB) or {}
visible_chips = [k for k in ('pre-how', 'pre-why', 'pre-what', 'pre-explain') if k in t]
chips = [c.strip() for c in (hub.get('chips') or [])]
finished = [c for c in chips[: len(visible_chips)] if c not in OPENERS and c.endswith('?')]
check('typing turns the chips into finished questions',
      (hub.get('text') or '').lower() == 'how' and len(visible_chips) >= 1 and len(finished) == len(visible_chips),
      f"typed {hub.get('text')!r}; visible {', '.join(visible_chips) or 'none'}; chips {chips}")
press('ask-cancel', 2)

# Build a concept from the ready-made walks.
press('btn-browse', 2)
press('concept-heart', 2)
s = wait_for(lambda: (lambda st: st if st.get('n') == N else None)(state()), 60) or state()
check(f'{N} stages placed', s.get('n') == N, str(s.get('n')))
time.sleep(6)  # let the ignite pulse finish

check('chain practice offered for a concept', 'btn-chain' in targets())
press('btn-chain', 3)
if not ev("return window.__loci.app.chainMode"):
    # The emulator's reported box for this button can lag one row behind the
    # panel's layout after the status text reflows; re-read and press again.
    time.sleep(3)
    press('btn-chain', 3)
recs = ev("return window.__loci.debug.records()")
th = thread()
check('chain mode on: thread dims', ev("return window.__loci.app.chainMode") and th and th['base'] < 0.5, str(th and round(th['base'], 2)))

# A wrong first pick is refused.
tap_tile(3)
st = ev("return window.__loci.app.status")
check('a stage out of order is refused', 'Not' in st, st)

for i in range(N):
    tap_tile(i)
time.sleep(2)
th = thread()
done = ev("return { on: window.__loci.app.chainMode, status: window.__loci.app.status }")
check('picking the stages in order relights every link', th and sum(1 for v in th['lit'][: N - 1] if v > 0.5) == N - 1, str(th and th['lit'][:N]))
check('finishing ends practice and reports the run', (not done['on']) and ('Chain rebuilt' in done['status'] or 'All 6 stages' in done['status']), done['status'])

passed = sum(ok for _, ok in results)
print(f'\n{passed}/{len(results)} checks passed')
sys.exit(0 if passed == len(results) else 1)
