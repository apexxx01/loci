/**
 * Shows that Loci has latched onto YOUR furniture: when stages land, a ring
 * of light traces the real surface each one rests on (the top of your
 * table, the face of your shelf), in step with the thread igniting, then
 * settles to a faint glow. Only real surfaces from scene understanding get
 * a ring; memories on the fallback arc have none.
 */
import { AdditiveBlending, createSystem, DoubleSide, Mesh, Quaternion, RingGeometry, ShaderMaterial, Vector3 } from '@iwsdk/core';
import { app, bus } from './app-state.js';
import { PalaceSystem } from './palace-system.js';
import { settings } from './settings.js';

const STEP = 0.75; // matches the thread's ignite step
const Z = new Vector3(0, 0, 1);

const FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform float uOn, uTime;
  void main(){
    // RingGeometry uvs run across the ring; a soft band with a slow shimmer.
    float band = smoothstep(.0, .5, vUv.x) * smoothstep(1., .5, vUv.x);
    float shimmer = .75 + .25 * sin(atan(vUv.y - .5, vUv.x - .5) * 3. + uTime * .8);
    gl_FragColor = vec4(vec3(1., .81, .48), uOn * (.25 + .75 * band) * shimmer);
  }`;
const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;

interface Trace {
  mesh: Mesh;
  mat: ShaderMaterial;
  at: number;
}

export class TraceSystem extends createSystem({}) {
  private traces: Trace[] = [];
  private t = 0;
  private q = new Quaternion();
  private n = new Vector3();
  private p = new Vector3();

  init(): void {
    this.cleanupFuncs.push(
      bus.on((e) => {
        if (e.type === 'palace-ready') this.build();
        else if (e.type === 'new-palace' || e.type === 'switch-palace') this.clear();
      }),
    );
  }

  private clear(): void {
    for (const tr of this.traces) {
      tr.mesh.removeFromParent();
      tr.mesh.geometry.dispose();
      tr.mat.dispose();
    }
    this.traces = [];
  }

  private build(): void {
    this.clear();
    this.t = 0;
    const palace = this.world.getSystem(PalaceSystem);
    const surfaces = app.surfaces ?? [];
    if (!palace || !surfaces.length) return;
    const recs = [...palace.records.values()].sort((a, b) => a.item.order - b.item.order);
    const used = new Set<string>();
    recs.forEach((rec, i) => {
      if (!rec.label) return;
      rec.tile.root.getWorldPosition(this.p);
      // The nearest real surface with the same name is the one it rests on.
      let best = null as (typeof surfaces)[number] | null;
      let bd = 1.2 * 1.2;
      for (const s of surfaces) {
        if (s.label !== rec.label || used.has(s.id)) continue;
        const d = (s.center[0] - this.p.x) ** 2 + (s.center[1] - this.p.y) ** 2 + (s.center[2] - this.p.z) ** 2;
        if (d < bd) (bd = d), (best = s);
      }
      if (!best) return;
      // Rings lie on tops only: on a wall or a shelf face the ring stands
      // upright behind the card and cuts straight through it.
      if (Math.abs(best.normal[1]) < 0.7) return;
      used.add(best.id);
      const r = Math.max(0.12, Math.min(0.42, Math.min(best.extent[0], best.extent[1]) * 0.45));
      const geo = new RingGeometry(r * 0.94, r, 72, 1);
      const mat = new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: { uOn: { value: 0 }, uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      });
      const mesh = new Mesh(geo, mat);
      this.n.fromArray(best.normal).normalize();
      this.q.setFromUnitVectors(Z, this.n);
      mesh.quaternion.copy(this.q);
      mesh.position.fromArray(best.center).addScaledVector(this.n, 0.006);
      mesh.renderOrder = 1;
      this.world.scene.add(mesh);
      this.traces.push({ mesh, mat, at: settings.calm ? 0 : i * STEP });
    });
  }

  update(delta: number): void {
    if (!this.traces.length) return;
    this.t += delta;
    for (const tr of this.traces) {
      const k = this.t - tr.at;
      // Flare as the thread arrives, then settle to a quiet glow.
      const on = k < 0 ? 0 : k < 0.4 ? k / 0.4 : Math.max(0.28, 1 - (k - 0.4) * 0.6);
      tr.mat.uniforms.uOn.value = on;
      tr.mat.uniforms.uTime.value = this.t;
    }
  }
}
