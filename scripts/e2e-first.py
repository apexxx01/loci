"""
The first five minutes, from a fresh install: how many pinches to a lesson?

Storage is cleared (no palaces, first-run lesson not yet seen), the page is
loaded fresh and mixed reality entered. Then only real emulated pinches with a
hand-held controller ray, the way a person points:

  1. The panel opens on "Ask about anything", with the ready-made walks a pinch away.
  2. Pinch "Ready-made walks", pinch "How your heart pumps blood": the palace builds.
  3. The first-run lesson starts by itself: a drawn hand pinching beside stage 1.
  4. Pinch stage 1: it opens to the full card, and the drawn hand steps aside
     (it returns for the A and B answers the first time a myth check opens).

Counts every pinch. Wall time is not reported: the headless emulator draws
about one frame a second, so its seconds say nothing about a headset's.

    python3 scripts/e2e-first.py
"""
import sys
import time

sys.path.insert(0, 'scripts')
sys.argv = sys.argv[:1]
from e2e import aim_select, check, ensure_xr, results, wait_for, xr  # noqa: E402
from ev import ev  # noqa: E402

N = 6
pinches = 0
t0 = time.time()
HUB = "[...window.__loci.world.systems].find(s => s.constructor.name === 'HubSystem')"
ONB = "[...window.__loci.world.systems].find(s => s.constructor.name === 'OnboardSystem')"


def hub_pos(name):
    return ev(f"""const el = {HUB}.panel.getElementById('{name}'); if (!el || !el.isVisible?.value) return null;
      const p = el.getWorldPosition(el.position.clone()); return {{ x: p.x, y: p.y, z: p.z }}""")


def pinch_at(pos):
    global pinches
    pinches += 1
    aim_select(pos)
    time.sleep(2)


# A fresh install: nothing saved, lesson unseen, default settings.
ensure_xr()
xr('exit')
time.sleep(2)
ev("""localStorage.removeItem('loci.library.v2'); localStorage.removeItem('loci.onboarded.v1');
  localStorage.removeItem('loci.settings.v1'); localStorage.removeItem('loci.asked.v1'); location.reload(); return 1""")
time.sleep(12)
check('entered mixed reality from a fresh install', ensure_xr())
time.sleep(6)
xr('set-input-mode', {'mode': 'controller'})

first = ev(f"return {{ palace: !!window.__loci.app.palace, ask: {HUB}.panel.getElementById('btn-ask')?.isVisible?.value, browse: {HUB}.panel.getElementById('btn-browse')?.isVisible?.value }}") or {}
check('the panel opens on Ask, with the ready-made walks one pinch away', not first.get('palace') and first.get('ask') and first.get('browse'), str(first))

pinch_at(hub_pos('btn-browse'))
p = wait_for(lambda: hub_pos('concept-heart'), 15)
pinch_at(p)
built = wait_for(lambda: ev('return window.__loci.app.palace?.placements.length ?? 0') == N, 90, 2)
check(f'two pinches build a {N}-stage palace', built and pinches == 2, f'{pinches} pinches')

lesson = wait_for(lambda: ev(f"return {ONB}?.step === 'pinch' && {ONB}.sprite.visible"), 40, 2)
check('the first-run lesson shows a drawn hand pinching beside stage 1', lesson, ev(f"return {ONB}?.step"))

pos0 = ev("""const P = [...window.__loci.world.systems].find(s => s.constructor.name === 'PalaceSystem');
  const r = [...P.records.values()].find(r => r.item.order === 0); const q = r.tile.card.getWorldPosition(r.tile.root.position.clone());
  return { x: q.x, y: q.y, z: q.z }""")
FACE0 = "return window.__loci.debug.records().find(r => r.id.endsWith(':0'))?.face ?? null"
for _ in range(2):
    pinch_at(pos0)
    if wait_for(lambda: ev(FACE0) == 1, 15, 1.5):
        break
check('the third pinch opens stage 1 to its full card', ev(FACE0) == 1, f'face {ev(FACE0)}, {pinches} pinches')
moved = wait_for(lambda: ev(f"return {ONB}?.step") in ('choose', 'off'), 30, 2)
check('the drawn hand steps aside once the first stage is open', moved, ev(f"return {ONB}?.step"))

passed = sum(ok for _, ok in results)
print(f'\nfrom a fresh install to the first opened stage: {pinches} pinches')
print(f'{passed}/{len(results)} checks passed in {time.time() - t0:.0f} s')
sys.exit(0 if passed == len(results) else 1)
