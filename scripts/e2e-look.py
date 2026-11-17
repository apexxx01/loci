"""
End-to-end check of Look to select: the whole loop with no hands at all.

With Look to select on, the headset only turns (no controller, no hand, no
pinch): look at a hub button to open the ready-made walks, look at a concept
to build its palace, look at a stage to open it, look at Rebuild the chain and
then at each stage in order to finish the chain. On Quest 3 the head aims; on
Meta VR Glasses the eyes do (same code path, see src/xr/access-system.ts).

Run with the managed dev server up (with --allow-browser-automation):
    python3 scripts/e2e-look.py
"""
import sys
import time

sys.path.insert(0, 'scripts')
from e2e import check, ensure_xr, results, wait_for, xr  # noqa: E402
from ev import ev  # noqa: E402

N = 6
t0 = time.time()

HUB = "[...window.__loci.world.systems].find(s => s.constructor.name === 'HubSystem')"
PAL = "[...window.__loci.world.systems].find(s => s.constructor.name === 'PalaceSystem')"


def hub_pos(el_id):
    return ev(f"""const el = {HUB}.panel.getElementById('{el_id}');
      if (!el || !el.isVisible?.value) return null;
      const p = el.getWorldPosition(el.position.clone()); return {{ x: p.x, y: p.y, z: p.z }}""")


def look(p):
    xr('look-at', {'device': 'headset', 'target': p})


def look_away():
    look({'x': 0, 'y': 0.2, 'z': 2.5})  # behind and down: nothing to select
    time.sleep(2.5)


def pressed(el_id, timeout=45):
    return wait_for(lambda: el_id in (ev('return window.__loci.app.lookPresses') or []), timeout, 1.5)


ensure_xr()
xr('set-device-state')
ensure_xr()
# Hands and controllers out of the picture: this run only turns the head.
for d in ('controller-left', 'controller-right'):
    xr('set-connected', {'device': d, 'connected': False})
ev(f"""window.__loci.bus.emit({{ type: 'new-palace' }}); window.__loci.app.lastLookPress = null; window.__loci.app.lookPresses.length = 0;
  const L = window.__loci; if (!L.settings.dwell) L.toggleSetting('dwell');
  {HUB}.askText = ''; return 1""")
# A palace restored from an earlier run can arrive after the first clear.
for _ in range(5):
    if wait_for(lambda: ev('return !window.__loci.app.palace && !window.__loci.app.pendingDeck'), 8, 1.5):
        break
    ev("window.__loci.bus.emit({ type: 'new-palace' }); return 1")
time.sleep(3)
check('look to select is on', ev("return window.__loci.settings.dwell") is True)

p = hub_pos('btn-browse')
look(p)
check('looking at "Ready-made walks" presses it', pressed('btn-browse'), str(p))
time.sleep(6)
check('staying on the same spot presses nothing else', ev('return window.__loci.app.lookPresses') == ['btn-browse'], str(ev('return window.__loci.app.lookPresses')))
look_away()

p = wait_for(lambda: hub_pos('concept-heart'), 15)
look(p)
check('looking at a concept presses it', pressed('concept-heart'), str(p))
built = wait_for(lambda: ev('return window.__loci.app.palace?.placements.length ?? 0') == N, 90, 2)
check('the palace builds from that look', built)
look_away()

pos0 = ev(f"""const r = [...{PAL}.records.values()].find(r => r.item.order === 0);
  const p = r.tile.card.getWorldPosition(r.tile.root.position.clone()); return {{ x: p.x, y: p.y, z: p.z }}""")
look(pos0)
FACE0 = "return window.__loci.debug.records().find(r => r.id.endsWith(':0'))?.face ?? null"
face0 = wait_for(lambda: ev(FACE0) in (1, 4), 30, 1.5) and ev(FACE0)
# A new stage opens to its card (face 1, Hint); one you have studied opens to
# its myth check (face 4, Check). Either way, looking opened it.
check('looking at a stage opens it', face0 in (1, 4), f'face {face0}')
look_away()

p = hub_pos('btn-chain')
look(p)
check('looking at "Rebuild the chain" starts it', pressed('btn-chain') and ev('return window.__loci.app.chainMode') is True)
look_away()
done = 0
for i in range(N):
    pi = ev(f"""const r = [...{PAL}.records.values()].find(r => r.item.order === {i});
      const p = r.tile.card.getWorldPosition(r.tile.root.position.clone()); return {{ x: p.x, y: p.y, z: p.z }}""")
    look(pi)
    ok = wait_for(lambda: (ev("const c = [...window.__loci.world.systems].find(s => s.constructor.name === 'ChainSystem'); return c?.next ?? c?.progress ?? null") or 0) > i
                  or ev('return window.__loci.app.chainMode') is False, 30, 1.5)
    if ok:
        done += 1
    look_away()
check(f'looking at all {N} stages in order rebuilds the chain', done == N and ev('return window.__loci.app.chainMode') is False, f'{done} of {N}')

ev("const L = window.__loci; if (L.settings.dwell) L.toggleSetting('dwell'); return 1")
for d in ('controller-left', 'controller-right'):
    xr('set-connected', {'device': d, 'connected': True})

passed = sum(ok for _, ok in results)
print(f'\n{passed}/{len(results)} checks passed in {time.time() - t0:.0f} s')
sys.exit(0 if passed == len(results) else 1)
