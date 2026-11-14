// Capture the WebGL canvas from inside the page (avoids CDP screenshots, which
// crash headless Chromium while an emulated XR session is rendering).
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export default async function run({ frame, page, workspaceRoot }) {
  const target = frame ?? page;
  const outName = existsSync(join(workspaceRoot, '.tmp/capture-name')) ? readFileSync(join(workspaceRoot, '.tmp/capture-name'), 'utf8').trim() : 'capture';
  const dataUrl = await target.evaluate(() => new Promise((resolve) => {
    const w = window.__loci.world;
    const r = w.renderer;
    const xr = r.xr;
    const loop = () => {
      // Render the scene once with the current (XR or flat) camera, then read.
      const cam = xr.isPresenting ? xr.getCamera() : w.camera;
      r.render(w.scene, cam);
      resolve(r.domElement.toDataURL('image/png'));
    };
    const s = xr.getSession?.();
    if (s) s.requestAnimationFrame(loop); else requestAnimationFrame(loop);
  }));
  const b64 = dataUrl.split(',')[1];
  writeFileSync(join(workspaceRoot, `artifacts/${outName}.png`), Buffer.from(b64, 'base64'));
  console.log('__RESULT__' + JSON.stringify({ ok: true, bytes: b64.length }));
}
