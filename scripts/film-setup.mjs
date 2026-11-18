// Prepare the emulator for filming: a 16:9 canvas (the XR canvas keeps the size it
// had when the session started), a narrower lens, a seated head, and optionally a
// room. Job: .tmp/film/setup.json { w, h, fovy, head:[x,y,z], room? }
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async function run({ frame, page, workspaceRoot }) {
  const job = JSON.parse(readFileSync(join(workspaceRoot, '.tmp/film/setup.json'), 'utf8'));
  await page.setViewportSize({ width: job.w, height: job.h });
  const target = frame ?? page;
  const r = await target.evaluate(async (job) => {
    const w = window.__loci.world;
    const d = window.IWER_DEVICE;
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    await wait(1500);
    if (job.room === 'none') d.sem.deleteAll();
    else if (job.room) await d.sem.loadDefaultEnvironment(job.room);
    if (job.head) d.position.set(...job.head);
    d.quaternion.set(0, 0, 0, 1);
    if (w.session) { await w.session.end().catch(() => {}); await wait(2500); }
    d.fovy = job.fovy;
    w.launchXR();
    for (let i = 0; i < 40 && !w.renderer.xr.isPresenting; i++) await wait(500);
    await wait(1500);
    return { presenting: w.renderer.xr.isPresenting, size: [w.renderer.domElement.width, w.renderer.domElement.height], fovy: d.fovy };
  }, job);
  console.log('__RESULT__' + JSON.stringify(r));
}
