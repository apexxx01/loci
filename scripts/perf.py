"""
Perf receipt: per-frame CPU time of world.update() and renderer.render(),
plus renderer.info and the JS heap, over N frames of the running app in the
managed emulator browser.

Run with the dev server up (with --allow-browser-automation) and the palace
you want to measure on screen. For the receipt in docs/perf.md that is the
concept palace left by scripts/e2e-concept.py (six stages, threads lit, trace
rings, hub open):

    python3 scripts/perf.py [frames=300]

It wraps the two calls the IWSDK render loop makes every frame (world.update
and renderer.render, see setupRenderLoop in @iwsdk/core
dist/init/world-initializer.js) on their instances, records performance.now()
around each, and puts the originals back once it has N frames. The headless
emulator only presents about one XR frame a second, so the sampler runs in the
page and this script polls it. Writes .tmp/perf.json.

The emulator renders with SwiftShader (software GL on the CPU). These are
relative numbers for comparing builds, not Quest frame times.
"""
import json
import sys
import time
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, 'scripts')
from ev import ev  # noqa: E402

FRAMES = int(sys.argv[1]) if len(sys.argv) > 1 else 300

INSTALL = """
const w = window.__loci?.world;
if (!w?.renderer) return { error: 'window.__loci.world.renderer not found' };
if (window.__perf && !window.__perf.done) return { error: 'a sampler is already running' };
const r = w.renderer, N = %d;
const P = window.__perf = { N, done: false, update: [], render: [], total: [], interval: [], calls: [], tris: [],
  multiRender: 0, started: performance.now(),
  heapBefore: performance.memory ? performance.memory.usedJSHeapSize : null };
const origUpdate = w.update, origRender = r.render;
let tStart = 0, uMs = 0, last = 0, renders = 0;
const restore = () => { w.update = origUpdate; r.render = origRender; P.done = true;
  P.heapAfter = performance.memory ? performance.memory.usedJSHeapSize : null;
  P.heapTotal = performance.memory ? performance.memory.totalJSHeapSize : null;
  P.textures = r.info.memory.textures; P.geometries = r.info.memory.geometries; P.programs = r.info.programs?.length ?? null;
  P.ended = performance.now(); };
P.abort = restore;
w.update = function (...a) {
  tStart = performance.now();
  if (last) P.interval.push(tStart - last);
  last = tStart; renders = 0;
  const out = origUpdate.apply(this, a);
  uMs = performance.now() - tStart;
  return out;
};
r.render = function (...a) {
  const t0 = performance.now();
  const out = origRender.apply(this, a);
  const t1 = performance.now();
  if (++renders > 1) { P.multiRender++; return out; }
  P.update.push(uMs); P.render.push(t1 - t0); P.total.push(t1 - tStart);
  P.calls.push(r.info.render.calls); P.tris.push(r.info.render.triangles);
  if (P.update.length >= N) restore();
  return out;
};
return { installed: true, N };
"""

SCENE = """
const w = window.__loci.world, a = window.__loci.app, r = w.renderer;
let rings = 0, ringsOn = 0, threadLinks = 0, threadLit = 0, hubVisible = false;
w.scene.traverse((o) => {
  const u = o.material?.uniforms;
  if (u?.uOn && o.geometry?.type === 'RingGeometry') { rings++; if (u.uOn.value > 0.05) ringsOn++; }
  if (u?.uIgnite && o.geometry?.drawRange && o.visible) {
    threadLinks = Math.round(o.geometry.drawRange.count / 162);
    threadLit = [...u.uLit.value].slice(0, threadLinks).filter((v) => v > 0.5).length;
  }
  if (o.name === 'Loci Hub' && o.visible) hubVisible = true;
});
const gl = r.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
return { xrPresenting: r.xr.isPresenting, stages: a.palace?.placements.length ?? 0, deck: a.palace?.deck?.title ?? null,
  frame: a.frame, threadLinks, threadLit, traceRings: rings, traceRingsOn: ringsOn, hubVisible,
  environment: window.IWER_DEVICE?.sem?.sceneEnvironment?.name || null,
  gl: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
  canvas: [r.domElement.width, r.domElement.height] };
"""

COLLECT = """
const P = window.__perf; if (!P) return null;
if (!P.done) return { done: false, n: P.update.length };
const q = (xs, p) => { const s = [...xs].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const f = (v) => +v.toFixed(2);
const stat = (xs) => ({ p50: f(q(xs, .5)), p95: f(q(xs, .95)), max: f(Math.max(...xs)), mean: f(xs.reduce((x, y) => x + y, 0) / xs.length) });
const mb = (b) => b == null ? null : +(b / 1048576).toFixed(1);
return { done: true, frames: P.update.length, seconds: +((P.ended - P.started) / 1000).toFixed(1),
  cpuMs: { worldUpdate: stat(P.update), render: stat(P.render), updatePlusRender: stat(P.total) },
  frameIntervalMs: P.interval.length ? stat(P.interval) : null,
  renderer: { drawCalls: { p50: q(P.calls, .5), min: Math.min(...P.calls), max: Math.max(...P.calls) },
              triangles: { p50: q(P.tris, .5), min: Math.min(...P.tris), max: Math.max(...P.tris) },
              textures: P.textures, geometries: P.geometries, programs: P.programs },
  jsHeapMB: { usedBefore: mb(P.heapBefore), usedAfter: mb(P.heapAfter), total: mb(P.heapTotal) },
  extraRenderCallsPerFrame: P.multiRender };
"""


def main():
    ran_at = datetime.now(ZoneInfo('Asia/Kolkata')).strftime('%Y-%m-%d %H:%M IST')
    scene = ev(SCENE)
    print('scene:', json.dumps(scene), flush=True)
    r = ev(INSTALL % FRAMES)
    if not isinstance(r, dict) or not r.get('installed'):
        print('could not install the sampler:', r)
        return 1
    deadline = time.time() + FRAMES * 3 + 120
    res = None
    while time.time() < deadline:
        time.sleep(15)
        res = ev(COLLECT)
        if isinstance(res, dict) and res.get('done'):
            break
        print('  frames so far:', (res or {}).get('n'), flush=True)
    else:
        ev('window.__perf?.abort?.(); return 1')
        res = ev(COLLECT)
    out = {'ranAt': ran_at, 'command': f'python3 scripts/perf.py {FRAMES}', 'scene': scene, **(res or {})}
    out.pop('done', None)
    with open('.tmp/perf.json', 'w') as fh:
        json.dump(out, fh, indent=2)
        fh.write('\n')
    print(json.dumps(out, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
