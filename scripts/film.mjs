// Film a shot frame by frame in the emulator: for each frame set the head (and
// optionally a hand's pinch), advance the app by exactly one 1/30 s step, then
// composite the emulator's synthetic room (IWER SEM canvas) under the app canvas
// and save a JPEG. Headless software GL draws about one frame a second, so the
// app is stepped on a fixed clock instead of real time: the video plays at the
// speed the app really animates.
//
// Job file .tmp/film/job.json:
//   { dir: ".tmp/film/x1", start: 0, quality: 0.93,
//     frames: [{ p:[x,y,z], q:[x,y,z,w], pinch?: {side:"right", v:0..1}, js?: "code" }] }
// Run: npx @iwsdk/cli browser run scripts/film.mjs --timeout 600000
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export default async function run({ frame, page, workspaceRoot }) {
  const target = frame ?? page;
  const job = JSON.parse(readFileSync(join(workspaceRoot, '.tmp/film/job.json'), 'utf8'));
  const dir = join(workspaceRoot, job.dir);
  mkdirSync(dir, { recursive: true });
  const BATCH = 12;
  let n = job.start ?? 0;
  const t0 = Date.now();
  for (let i = 0; i < job.frames.length; i += BATCH) {
    const batch = job.frames.slice(i, i + BATCH);
    const shots = await target.evaluate(async ({ batch, quality }) => {
      const w = window.__loci.world;
      const r = w.renderer;
      const d = window.IWER_DEVICE;
      const sem = d.sem;
      // Gate the world's update: frozen unless a step is armed.
      if (!window.__film) {
        const orig = w.update.bind(w);
        const film = (window.__film = { on: true, armed: null, t: performance.now() / 1000, capturing: false });
        // While filming, skip the loop's own draws of the app and the room: only
        // the captured frame is rendered (software GL makes every draw cost seconds).
        const appRender = r.render.bind(r);
        r.render = (sc, cam) => { if (!film.on || film.capturing) appRender(sc, cam); };
        const semRender = sem.render.bind(sem);
        sem.render = (t) => { if (!film.on || film.capturing) semRender(t); };
        w.update = (delta, time) => {
          if (!film.on) return orig(delta, time);
          if (!film.armed) return;
          const done = film.armed;
          film.armed = null;
          film.t += 1 / 30;
          orig(1 / 30, film.t);
          // Render this exact frame and composite the room under it.
          film.capturing = true;
          r.render(w.scene, r.xr.getCamera());
          sem.render(performance.now());
          const c = film.canvas ?? (film.canvas = document.createElement('canvas'));
          const a = r.domElement;
          if (c.width !== a.width) { c.width = a.width; c.height = a.height; }
          const g = c.getContext('2d');
          g.clearRect(0, 0, c.width, c.height);
          g.drawImage(sem.renderer.domElement, 0, 0, c.width, c.height);
          g.drawImage(a, 0, 0);
          const url = c.toDataURL('image/jpeg', film.quality);
          film.capturing = false;
          done(url);
        };
      }
      window.__film.on = true;
      window.__film.quality = quality;
      const out = [];
      for (const f of batch) {
        d.position.set(f.p[0], f.p[1], f.p[2]);
        d.quaternion.set(f.q[0], f.q[1], f.q[2], f.q[3]);
        if (f.pinch) d.hands[f.pinch.side].updatePinchValue(f.pinch.v);
        if (f.js) await new Function('w', 'd', f.js)(w, d);
        out.push(await new Promise((res) => { window.__film.armed = res; }));
      }
      return out;
    }, { batch, quality: job.quality ?? 0.93 });
    for (const s of shots) writeFileSync(join(dir, `${String(n++).padStart(5, '0')}.jpg`), Buffer.from(s.split(',')[1], 'base64'));
  }
  if (job.release !== false) await target.evaluate(() => { if (window.__film) window.__film.on = false; });
  console.log('__RESULT__' + JSON.stringify({ ok: true, frames: n - (job.start ?? 0), sec: (Date.now() - t0) / 1000 }));
}
