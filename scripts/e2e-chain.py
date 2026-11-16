"""
End-to-end check of the headset asking and practice flows in the IWER emulator.

  keyboard: Ask about anything -> type with key presses -> finished-question
  chips appear -> Back.  Chain practice: build a concept -> Rebuild the chain
  -> stage numbers hide and the thread dims -> a wrong pick is refused -> the
  stages picked in order relight every link -> practice ends.

Run with the managed dev server up (with --allow-browser-automation):
    python3 scripts/e2e-chain.py
"""
import sys
import time

sys.path.insert(0, 'scripts')
from e2e import aim_select, check, ensure_xr, results, state, targets, wait_for  # noqa: E402
from ev import ev  # noqa: E402

N = 6


def thread():
    return ev("""const w = window.__loci.world; let m = null;
      w.scene.traverse(o => { if (o.material?.uniforms?.uBase) m = o; });
      return m ? { base: m.material.uniforms.uBase.value, lit: [...m.material.uniforms.uLit.value] } : null""")


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
time.sleep(3)

# Keyboard: type "ti" and expect finished questions on the chips.
press('btn-ask', 2)
for k in ['key-t', 'key-i']:
    press(k, 1.2)
t = targets()
visible_chips = [k for k in ('pre-how', 'pre-why', 'pre-what', 'pre-explain') if k in t]
check('typing turns the chips into finished questions', len(visible_chips) >= 1, ', '.join(visible_chips))
press('ask-cancel', 2)

# Build a concept from the ready-made walks.
press('btn-browse', 2)
press('concept-heart', 2)
s = wait_for(lambda: (lambda st: st if st.get('n') == N else None)(state()), 60) or state()
check(f'{N} stages placed', s.get('n') == N, str(s.get('n')))
time.sleep(6)  # let the ignite pulse finish

check('chain practice offered for a concept', 'btn-chain' in targets())
press('btn-chain', 3)
recs = ev("return window.__loci.debug.records()")
th = thread()
check('chain mode on: thread dims', ev("return window.__loci.app.chainMode") and th and th['base'] < 0.5, str(th and round(th['base'], 2)))

# A wrong first pick is refused.
press('tile:concept-heart:3', 2.5)
st = ev("return window.__loci.app.status")
check('a stage out of order is refused', 'Not' in st, st)

for i in range(N):
    press(f'tile:concept-heart:{i}', 2.5)
time.sleep(2)
th = thread()
done = ev("return { on: window.__loci.app.chainMode, status: window.__loci.app.status }")
check('picking the stages in order relights every link', th and sum(1 for v in th['lit'][: N - 1] if v > 0.5) == N - 1, str(th and th['lit'][:N]))
check('finishing ends practice and reports the run', (not done['on']) and ('Chain rebuilt' in done['status'] or 'All 6 stages' in done['status']), done['status'])

passed = sum(ok for _, ok in results)
print(f'\n{passed}/{len(results)} checks passed')
sys.exit(0 if passed == len(results) else 1)
