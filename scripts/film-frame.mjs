// Film one composited frame: the emulator's synthetic room (IWER SEM canvas)
// under the app canvas, so stills show the room the stages sit in.
// Job: .tmp/film/job.json {out, w?, h?}
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export default async function run({ frame, page, workspaceRoot }) {
  const target = frame ?? page;
  const job = JSON.parse(readFileSync(join(workspaceRoot, '.tmp/film/job.json'), 'utf8'));
  const url = await target.evaluate(() => new Promise((resolve) => {
    const w = window.__loci.world;
    const r = w.renderer;
    const sem = window.IWER_DEVICE.sem;
    const s = r.xr.getSession?.();
    const draw = () => {
      r.render(w.scene, r.xr.isPresenting ? r.xr.getCamera() : w.camera);
      sem.render(performance.now());
      const a = sem.renderer.domElement, b = r.domElement;
      const c = document.createElement('canvas');
      c.width = b.width; c.height = b.height;
      const g = c.getContext('2d');
      g.drawImage(a, 0, 0, c.width, c.height);
      g.drawImage(b, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    if (s) s.requestAnimationFrame(draw); else requestAnimationFrame(draw);
  }));
  const out = join(workspaceRoot, job.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
  console.log('__RESULT__' + JSON.stringify({ ok: true, out: job.out }));
}
