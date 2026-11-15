/**
 * Threads of light that join a concept's stages in order across the room, so
 * walking from object to object is walking through the mechanism. All links
 * share one ribbon geometry and one material: one draw call, no per-frame
 * allocation. When a palace is ready the threads "ignite": a pulse runs from
 * stage to stage with a rising tone, and each stage name is read aloud if the
 * learner asked for that.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  createSystem,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  Vector3,
} from '@iwsdk/core';
import { app, bus } from './app-state.js';
import { PalaceSystem, type TileRecord } from './palace-system.js';
import { playLand, playSuccess } from './sound.js';
import { settings, speak } from './settings.js';
import { TILE_SIZE } from './tile.js';

const MAX_NODES = 12;
const SEG = 28; // points per link
const WIDTH = 0.028; // metres, half-width of the ribbon
const IGNITE_STEP = 0.75; // seconds from one stage to the next

const VERT = /* glsl */ `
  attribute float aT;     // link index + 0..1 along it
  attribute float aSide;  // -1 or 1 across the ribbon
  varying float vT; varying float vSide;
  void main(){ vT = aT; vSide = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;

const FRAG = /* glsl */ `
  precision mediump float;
  varying float vT; varying float vSide;
  uniform float uTime, uIgnite, uFade, uCalm;
  uniform float uLit[${MAX_NODES}];
  uniform vec3 uGold, uRose;
  void main(){
    float link = floor(vT); float t = vT - link;
    // Drawn in as the ignite pulse passes; fully drawn afterwards.
    float drawn = smoothstep(0., .04, uIgnite - vT);
    float core = exp(-vSide * vSide * 5.) + exp(-vSide * vSide * 40.) * .8;
    // Slow motes of light flowing in the direction of cause to effect.
    float flow = (1. - uCalm) * pow(.5 + .5 * sin((t * 9. - uTime * 1.6) * 3.14159), 6.) * .7;
    // The bright head of the ignite pulse.
    float head = exp(-pow((vT - uIgnite) * 5., 2.)) * step(.001, uIgnite) * step(uIgnite, ${MAX_NODES}.);
    float lit = 0.;
    for (int i = 0; i < ${MAX_NODES}; i++) if (float(i) == link) lit = uLit[i];
    vec3 col = mix(uGold, uRose, t) * (1. + lit * .8);
    float a = (core * (.55 + .35 * lit) + core * flow * .5 + head * 1.4) * drawn * uFade;
    gl_FragColor = vec4(col * (1. + head * 1.5), a);
  }`;

export class ThreadSystem extends createSystem({}) {
  private mesh!: Mesh;
  private geo!: BufferGeometry;
  private mat!: ShaderMaterial;
  private pos!: Float32Array;
  private order: TileRecord[] = [];
  private nodes: Vector3[] = [];
  private igniting = false;
  private lastNode = -1;
  private fade = 0;
  private tmpA = new Vector3();
  private tmpB = new Vector3();
  private tmpC = new Vector3();
  private tmpT = new Vector3();
  private tmpS = new Vector3();
  private toCam = new Vector3();
  private cam = new Vector3();
  private time = 0;

  init(): void {
    const links = MAX_NODES - 1;
    const verts = links * SEG * 2;
    this.pos = new Float32Array(verts * 3);
    const t = new Float32Array(verts);
    const side = new Float32Array(verts);
    const index: number[] = [];
    for (let l = 0; l < links; l++)
      for (let i = 0; i < SEG; i++) {
        const v = (l * SEG + i) * 2;
        t[v] = t[v + 1] = l + i / (SEG - 1);
        side[v] = -1;
        side[v + 1] = 1;
        if (i < SEG - 1) index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    this.geo = new BufferGeometry();
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aT', new BufferAttribute(t, 1));
    this.geo.setAttribute('aSide', new BufferAttribute(side, 1));
    this.geo.setIndex(index);
    this.geo.setDrawRange(0, 0);
    this.mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uIgnite: { value: 99 },
        uFade: { value: 0 },
        uCalm: { value: 0 },
        uLit: { value: new Array(MAX_NODES).fill(0) },
        uGold: { value: new Color('#ffcf7a') },
        uRose: { value: new Color('#fff0d2') },
      },
    });
    this.mesh = new Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.world.scene.add(this.mesh);
    for (let i = 0; i < MAX_NODES; i++) this.nodes.push(new Vector3());

    this.cleanupFuncs.push(
      bus.on((e) => {
        if (e.type === 'palace-ready') this.collect(true);
        else if (e.type === 'palace-changed' || e.type === 'new-palace') this.collect(false);
        else if (e.type === 'stage-checked') this.light(e.memoryId, e.correct);
      }),
    );
  }

  /** True when the current palace teaches a concept (threads only make sense in order). */
  private get active(): boolean {
    return app.palace?.deck.kind === 'concept';
  }

  private litFor = '';

  private collect(ignite: boolean): void {
    const palace = this.world.getSystem(PalaceSystem);
    // Lit links belong to one palace: start dark for any other.
    const id = app.palace?.id ?? '';
    if (id !== this.litFor) {
      this.litFor = id;
      (this.mat.uniforms.uLit.value as number[]).fill(0);
    }
    this.order = this.active && palace ? [...palace.records.values()].sort((a, b) => a.item.order - b.item.order).slice(0, MAX_NODES) : [];
    const links = Math.max(0, this.order.length - 1);
    this.geo.setDrawRange(0, links * (SEG - 1) * 6);
    if (ignite && links) this.ignite();
    if (!links) this.fade = 0;
  }

  /** Run the pulse from the first stage to the last. */
  ignite(): void {
    if (!this.order.length) return;
    this.igniting = true;
    this.lastNode = -1;
    this.mat.uniforms.uIgnite.value = settings.calm ? this.order.length : -0.15;
  }

  /** A stage was answered: brighten its incoming and outgoing links, or dim them. */
  private light(memoryId: string, correct: boolean): void {
    const i = this.order.findIndex((r) => r.item.id === memoryId);
    if (i < 0) return;
    const lit = this.mat.uniforms.uLit.value as number[];
    const v = correct ? 1 : 0;
    if (i > 0) lit[i - 1] = Math.max(lit[i - 1] * 0.5, v);
    if (i < lit.length) lit[i] = Math.max(lit[i] * 0.5, v);
  }

  update(delta: number): void {
    const n = this.order.length;
    this.fade += ((n > 1 ? 1 : 0) - this.fade) * Math.min(1, delta * 3);
    this.mat.uniforms.uFade.value = this.fade;
    this.mesh.visible = this.fade > 0.01;
    if (!this.mesh.visible) return;
    this.time += delta;
    this.mat.uniforms.uTime.value = this.time;
    this.mat.uniforms.uCalm.value = settings.calm ? 1 : 0;

    // Where each stage sits right now: just under its card.
    for (let i = 0; i < n; i++) {
      const rec = this.order[i];
      rec.tile.pivot.getWorldPosition(this.nodes[i]);
      const s = rec.tile.root.scale.y;
      this.nodes[i].y -= TILE_SIZE.h * 0.5 * s + 0.015;
    }
    this.world.camera.getWorldPosition(this.cam);

    // Rebuild the ribbon in place: each link is a gentle upward arc.
    for (let l = 0; l < n - 1; l++) {
      const a = this.nodes[l], b = this.nodes[l + 1];
      const lift = 0.06 + a.distanceTo(b) * 0.12;
      this.tmpC.addVectors(a, b).multiplyScalar(0.5);
      this.tmpC.y += lift;
      for (let i = 0; i < SEG; i++) {
        const t = i / (SEG - 1), u = 1 - t;
        // Quadratic Bezier point and tangent.
        this.tmpA.set(0, 0, 0).addScaledVector(a, u * u).addScaledVector(this.tmpC, 2 * u * t).addScaledVector(b, t * t);
        this.tmpT.set(0, 0, 0).addScaledVector(this.tmpC, 2 * u).addScaledVector(a, -2 * u).addScaledVector(b, 2 * t).addScaledVector(this.tmpC, -2 * t);
        this.toCam.subVectors(this.cam, this.tmpA);
        this.tmpS.crossVectors(this.tmpT, this.toCam).normalize();
        // Taper into each stage so threads seem to grow out of the objects.
        const w = WIDTH * (0.45 + 0.55 * Math.sin(Math.PI * t));
        const v = (l * SEG + i) * 6;
        this.tmpB.copy(this.tmpA).addScaledVector(this.tmpS, -w);
        this.pos[v] = this.tmpB.x; this.pos[v + 1] = this.tmpB.y; this.pos[v + 2] = this.tmpB.z;
        this.tmpB.copy(this.tmpA).addScaledVector(this.tmpS, w);
        this.pos[v + 3] = this.tmpB.x; this.pos[v + 4] = this.tmpB.y; this.pos[v + 5] = this.tmpB.z;
      }
    }
    (this.geo.attributes.position as BufferAttribute).needsUpdate = true;

    // The ignite pulse: one stage every IGNITE_STEP seconds, with a tone at each.
    if (this.igniting) {
      const u = this.mat.uniforms.uIgnite;
      u.value += delta / IGNITE_STEP;
      const node = Math.floor(u.value + 0.15);
      if (node !== this.lastNode && node >= 0 && node < n) {
        this.lastNode = node;
        playLand(this.nodes[node], node);
        speak(this.order[node].item.cue);
      }
      if (u.value >= n - 1 + 0.4) {
        this.igniting = false;
        u.value = 99;
        playSuccess(this.nodes[n - 1]);
      }
    }
  }
}
