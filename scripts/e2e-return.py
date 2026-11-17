"""
The day-after check: does Loci bring you back, and is your palace still there?

  1. Build the heart concept and study every stage once (a real FSRS "good").
     Right after, nothing is due and every stage rests until its date.
  2. Let time pass: every saved date in the palace (review times and due
     dates) moves back the same number of days, as if that time had gone by.
     Nothing else is touched; the schedule itself is FSRS's own.
  3. Leave mixed reality and come back.
  4. Expect: every stage restored to the same spot; the stages FSRS scheduled
     inside that gap are due again and drawn awake ("what happens here?"),
     the rest still rest; the panel greets you with how many are waiting; and
     the guide arrow, if one is due off to the side, points at the first.

    python3 scripts/e2e-return.py [days]   # default 4
"""
import sys
import time

sys.path.insert(0, 'scripts')
from e2e import check, ensure_xr, results, wait_for, xr  # noqa: E402
from ev import ev  # noqa: E402

DAYS = float(sys.argv[1]) if len(sys.argv) > 1 else 4
N = 6
t0 = time.time()
HUB = "[...window.__loci.world.systems].find(s => s.constructor.name === 'HubSystem')"
PAL = "[...window.__loci.world.systems].find(s => s.constructor.name === 'PalaceSystem')"
REC = "[...window.__loci.world.systems].find(s => s.constructor.name === 'RecallSystem')"

ensure_xr()
xr('set-device-state')
ensure_xr()
ev("const L = window.__loci; if (L.settings.dwell) L.toggleSetting('dwell'); L.bus.emit({ type: 'new-palace' }); return 1")
for _ in range(5):
    if wait_for(lambda: ev('return !window.__loci.app.palace && !window.__loci.app.pendingDeck'), 8, 1.5):
        break
    ev("window.__loci.bus.emit({ type: 'new-palace' }); return 1")
time.sleep(3)
# Setup only (the pinch path is covered by e2e-concept.py): press the walk buttons directly.
ev(f"{HUB}.lookables.find(t => t.id === 'btn-browse').press(); return 1")
time.sleep(3)
ev(f"{HUB}.lookables.find(t => t.id === 'concept-heart').press(); return 1")
built = wait_for(lambda: ev('return window.__loci.app.palace?.placements.length ?? 0') == N, 90, 2)
check('heart palace built', built)
time.sleep(8)

# Study every stage once with a real scheduler review.
ev(f"for (const r of {PAL}.records.values()) {REC}.rate(r, 'good'); return 1")
time.sleep(4)
DUE = "const a = window.__loci.app; return a.palace ? Object.values(a.palace.cards).filter(c => new Date(c.due) <= new Date()).length : -1"
SCHED = "return Object.entries(window.__loci.app.palace.cards).map(([id, c]) => [id.split(':').pop(), c.due])"
due0 = ev(DUE)
sched = ev(SCHED)
check('right after studying, nothing is due', due0 == 0, f'due {due0}; next dates {sched}')
poses_before = ev("return window.__loci.app.palace.placements.map(p => p.pose.p)")

# Let DAYS pass: shift every saved date back, in memory and in storage.
shift = ev(f"""const ms = {DAYS} * 86400000; const a = window.__loci.app; const p = a.palace;
  const back = (s) => s ? new Date(new Date(s).getTime() - ms).toISOString() : s;
  for (const c of Object.values(p.cards)) {{ c.due = back(c.due); c.last_review = back(c.last_review); }}
  for (const h of p.history) h.at = back(h.at);
  p.createdAt = back(p.createdAt);
  const lib = JSON.parse(localStorage.getItem('loci.library.v2'));
  lib.palaces[p.id] = p; localStorage.setItem('loci.library.v2', JSON.stringify(lib));
  return Object.values(p.cards).filter(c => new Date(c.due) <= new Date()).length""")
print(f'   after moving the dates back {DAYS:g} days, {shift} of {N} stages are due by FSRS\'s own schedule', flush=True)

xr('exit')
time.sleep(4)
ensure_xr()
restored = wait_for(lambda: 'Welcome back' in (ev('return window.__loci.app.status') or ''), 60, 2)
status = ev('return window.__loci.app.status')
poses_after = ev("return window.__loci.app.palace.placements.map(p => p.pose.p)")
drift = max(sum((a - b) ** 2 for a, b in zip(p, q)) ** 0.5 for p, q in zip(poses_before, poses_after)) if poses_after else 9
check('coming back, every stage is where you left it', drift < 0.001, f'max drift {drift:.4f} m')
due1 = ev(DUE)
check('stages scheduled inside the gap are due again', due1 == shift and due1 >= 1, f'due {due1} of {N}')
check('the panel greets you with what is waiting', bool(restored) and str(due1) in status and 'glowing' in status, status)
recs = ev("""const cards = window.__loci.app.palace.cards; const now = new Date();
  return window.__loci.debug.records().map(r => ({ i: Number(r.id.split(':').pop()), scheduled: new Date(cards[r.id].due) <= now, drawnDue: r.due, face: r.face }))""") or []
check('due stages are drawn awake and the rest still rest', len(recs) == N and all(r['drawnDue'] == r['scheduled'] for r in recs) and all(r['face'] == 0 for r in recs),
      ', '.join(f"{r['i'] + 1}:{'awake' if r['drawnDue'] else 'resting'}" for r in sorted(recs, key=lambda r: r['i'])))
first_due = min((r['i'] for r in recs if r['scheduled']), default=None)
guide = ev("""const g = [...window.__loci.world.systems].find(s => s.constructor.name === 'GuideSystem');
  return g?.lastNext ? g.lastNext.item.order : null""")
check('the guide leads to the first stage waiting', guide == first_due, f'guide -> stage {None if guide is None else guide + 1}, first due stage {None if first_due is None else first_due + 1}')

passed = sum(ok for _, ok in results)
print(f'\n{passed}/{len(results)} checks passed in {time.time() - t0:.0f} s')
sys.exit(0 if passed == len(results) else 1)
