/**
 * The landing page's living backdrop: one cloud of particles that is, in turn,
 * a galaxy, a web of firing neurons, a brain, and finally your room with
 * memories resting on the furniture. Scroll position drives the morph.
 *
 * Everything is procedural (no assets) and runs in a single draw call for the
 * particles, so it stays light enough for the headset's 2D browser.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  Points,
  Scene,
  PointsMaterial,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from '@iwsdk/core';

type V3 = [number, number, number];

export interface SceneTargets {
  /** 0 galaxy · 1 neurons · 2 brain · 3 room */
  progress: number;
  /** 0..1 how many memory tiles have landed in the room. */
  tiles: number;
  /** -1 scene left · 0 centre · 1 scene right */
  shift: number;
  /** 0..1 fade the scene back behind dense content. */
  dim: number;
}

export interface LandingScene {
  set(t: Partial<SceneTargets>): void;
  setActive(on: boolean): void;
  dispose(): void;
}

/* ------------------------------------------------------------ helpers */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r: () => number) => (r() + r() + r() + r() - 2) / 1.2;
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dist3 = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function randDir(r: () => number): V3 {
  const u = r() * 2 - 1;
  const th = r() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return [s * Math.cos(th), u, s * Math.sin(th)];
}

/* ------------------------------------------------------------ shapes */
function galaxyPoint(r: () => number): V3 {
  if (r() < 0.2) {
    const d = randDir(r);
    const m = 5 + r() * 4.5;
    return [d[0] * m, d[1] * m * 0.7, d[2] * m];
  }
  const arm = Math.floor(r() * 3);
  const rad = Math.pow(r(), 0.55) * 4.2 + 0.08;
  const ang = rad * 1.15 + arm * 2.094 + gauss(r) * 0.32;
  const y = gauss(r) * 0.2 * (1.25 - rad / 4.4);
  const x = Math.cos(ang) * rad;
  const z = Math.sin(ang) * rad;
  // tilt the disc towards the viewer
  const c = Math.cos(1.02);
  const s = Math.sin(1.02);
  return [x, y * c - z * s, y * s + z * c];
}

interface Polyline {
  pts: V3[];
  /** distance from the soma at each point */
  d: number[];
  len: number;
}

function buildNeurons(r: () => number): { lines: Polyline[]; somas: V3[] } {
  const somas: V3[] = [];
  let guard = 0;
  while (somas.length < 6 && guard++ < 400) {
    const p: V3 = [(r() * 2 - 1) * 3.3, (r() * 2 - 1) * 1.7, (r() * 2 - 1) * 1.3];
    if (somas.every((s) => dist3(s, p) > 2.0)) somas.push(p);
  }
  const lines: Polyline[] = [];
  const grow = (start: V3, dir: V3, startD: number, depth: number) => {
    const pts: V3[] = [start];
    const d: number[] = [startD];
    let cur = start;
    let v = dir;
    const steps = 9 + Math.floor(r() * 6) - depth * 3;
    for (let i = 0; i < steps; i++) {
      const j = randDir(r);
      v = [v[0] + j[0] * 0.42, v[1] + j[1] * 0.42, v[2] + j[2] * 0.3];
      const l = Math.hypot(v[0], v[1], v[2]);
      v = [v[0] / l, v[1] / l, v[2] / l];
      const step = 0.15 + r() * 0.08;
      cur = [cur[0] + v[0] * step, cur[1] + v[1] * step, cur[2] + v[2] * step];
      pts.push(cur);
      d.push(d[d.length - 1] + step);
      if (depth < 2 && i > 1 && r() < 0.2) {
        const b = randDir(r);
        grow(cur, [v[0] + b[0] * 0.9, v[1] + b[1] * 0.9, v[2] + b[2] * 0.9], d[d.length - 1], depth + 1);
      }
    }
    lines.push({ pts, d, len: d[d.length - 1] - startD });
  };
  for (const s of somas) {
    const n = 5 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) grow(s, randDir(r), 0, 0);
  }
  return { lines, somas };
}

function brainPoint(r: () => number): V3 {
  const S = 1.42;
  const k = r();
  if (k < 0.04) {
    // brain stem
    const t = r();
    const a = r() * Math.PI * 2;
    return [Math.cos(a) * 0.15 * S, (-0.7 - t * 0.9) * S, (-0.5 - t * 0.22 + Math.sin(a) * 0.15) * S];
  }
  if (k < 0.16) {
    // cerebellum
    const d = randDir(r);
    const w = 1 + 0.05 * Math.sin(d[1] * 38);
    return [d[0] * 0.78 * w * S, (-0.74 + d[1] * 0.38 * w) * S, (-1.02 + d[2] * 0.5 * w) * S];
  }
  const side = r() < 0.5 ? -1 : 1;
  // Gather points along winding ridge lines so the folds (gyri) read clearly.
  let d = randDir(r);
  for (let tries = 0; tries < 7; tries++) {
    const f = Math.sin(d[1] * 10 + Math.sin(d[2] * 6) * 2.2 + Math.abs(d[0]) * 3);
    if (Math.abs(f) < 0.28 || r() < 0.12) break;
    d = randDir(r);
  }
  const inner = k > 0.93 ? 0.5 + r() * 0.45 : 1;
  const w = 1 + 0.05 * Math.sin(d[1] * 11 + Math.sin(d[2] * 7) * 2) + 0.035 * Math.sin(d[2] * 13 + d[0] * 5);
  let x = Math.abs(d[0]) * 1.05 * w * inner;
  let y = d[1] * 1.12 * w * inner;
  const z = d[2] * 1.58 * w * inner;
  const taper = 1 - 0.14 * Math.max(0, z / 1.58);
  x *= taper;
  y *= taper;
  if (y < -0.55) y = -0.55 + (y + 0.55) * 0.3;
  return [side * (x * 0.93 + 0.09) * S, (y + 0.12) * S, z * S];
}

const F = -1.3; // floor height
export const LOCI: { p: V3; glyph: string }[] = [
  { p: [-2.38, F + 2.3, -0.8], glyph: '🌡️' }, // door
  { p: [-2.2, F + 2.15, 0.6], glyph: '♨️' }, // shelf
  { p: [-1.9, F + 1.05, -1.6], glyph: '🌍' }, // plant
  { p: [-1.0, F + 1.55, -1.86], glyph: '🔴' }, // window
  { p: [0.3, F + 0.86, 0.3], glyph: '👑' }, // table
  { p: [1.2, F + 1.25, -1.4], glyph: '💍' }, // couch
  { p: [1.2, F + 2.32, -1.86], glyph: '🧊' }, // wall art
  { p: [2.1, F + 2.12, 0.9], glyph: '🔱' }, // lamp
];

function buildRoom(): [V3, V3][] {
  const e: [V3, V3][] = [];
  const line = (a: V3, b: V3) => e.push([a, b]);
  const rect = (pts: V3[]) => pts.forEach((p, i) => line(p, pts[(i + 1) % pts.length]));
  const box = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) => {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    rect([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
    rect([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]);
    for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) line([x, y0, z], [x, y1, z]);
  };
  const H = 2.6;
  rect([[-2.5, F, -2], [2.5, F, -2], [2.5, F, 2], [-2.5, F, 2]]); // floor
  rect([[-2.5, F, -2], [2.5, F, -2], [2.5, F + H, -2], [-2.5, F + H, -2]]); // back wall
  rect([[-2.5, F, -2], [-2.5, F, 2], [-2.5, F + H, 2], [-2.5, F + H, -2]]); // left wall
  // couch
  box(1.2, F + 0.25, -1.4, 2.0, 0.5, 0.8);
  box(1.2, F + 0.66, -1.72, 2.0, 0.5, 0.16);
  // table + legs + rug
  box(0.3, F + 0.42, 0.3, 1.1, 0.07, 0.7);
  for (const [x, z] of [[-0.2, 0], [0.8, 0], [0.8, 0.6], [-0.2, 0.6]]) line([x, F, z], [x, F + 0.39, z]);
  rect([[-0.7, F + 0.005, -0.4], [1.3, F + 0.005, -0.4], [1.3, F + 0.005, 1.0], [-0.7, F + 0.005, 1.0]]);
  // shelf
  box(-2.25, F + 0.9, 0.6, 0.4, 1.8, 1.2);
  for (const y of [0.6, 1.2]) line([-2.05, F + y, 0], [-2.05, F + y, 1.2]);
  // lamp
  line([2.1, F, 0.9], [2.1, F + 1.4, 0.9]);
  const ring = (y: number, rad: number): V3[] =>
    Array.from({ length: 10 }, (_, i) => [2.1 + Math.cos((i / 10) * 6.283) * rad, y, 0.9 + Math.sin((i / 10) * 6.283) * rad] as V3);
  const lo = ring(F + 1.4, 0.3);
  const hi = ring(F + 1.78, 0.17);
  rect(lo);
  rect(hi);
  lo.forEach((p, i) => i % 2 === 0 && line(p, hi[i]));
  // plant
  box(-1.9, F + 0.2, -1.6, 0.4, 0.4, 0.4);
  for (const [dx, dz] of [[-0.3, 0.1], [0.28, -0.05], [0.05, 0.3], [-0.1, -0.28], [0.2, 0.22]])
    line([-1.9, F + 0.4, -1.6], [-1.9 + dx, F + 0.85, -1.6 + dz]);
  // window (with cross bars) and wall art on the back wall
  rect([[-1.6, F + 1.0, -1.99], [-0.4, F + 1.0, -1.99], [-0.4, F + 2.1, -1.99], [-1.6, F + 2.1, -1.99]]);
  line([-1.0, F + 1.0, -1.99], [-1.0, F + 2.1, -1.99]);
  line([-1.6, F + 1.55, -1.99], [-0.4, F + 1.55, -1.99]);
  rect([[0.7, F + 1.35, -1.99], [1.7, F + 1.35, -1.99], [1.7, F + 2.0, -1.99], [0.7, F + 2.0, -1.99]]);
  // door on the left wall
  rect([[-2.49, F, -1.2], [-2.49, F, -0.4], [-2.49, F + 2.0, -0.4], [-2.49, F + 2.0, -1.2]]);
  return e;
}

/* ------------------------------------------------------------ shaders */
const VERT = /* glsl */ `
  attribute vec3 a1; attribute vec3 a2; attribute vec3 a3;
  attribute vec3 aColor; attribute float aSeed; attribute float aSize;
  uniform float uProgress, uTime, uIntro, uPx, uCalm, uAspect;
  uniform vec2 uMouse;
  varying vec3 vColor; varying float vAlpha;
  float st(float t){ t = clamp(t*1.5 - aSeed*0.5, 0., 1.); return t*t*(3.-2.*t); }
  void main(){
    float p = uProgress;
    vec3 pos = mix(position, a1, st(clamp(p,0.,1.)));
    pos = mix(pos, a2, st(clamp(p-1.,0.,1.)));
    pos = mix(pos, a3, st(clamp(p-2.,0.,1.)));
    float moving = sin(3.14159 * st(fract(min(p, 2.999)))) * (1. - uCalm);
    pos += vec3(sin(aSeed*91.+uTime), cos(aSeed*57.+uTime*1.3), sin(aSeed*33.-uTime)) * 0.4 * moving;
    pos += vec3(sin(uTime*.6+aSeed*40.), cos(uTime*.5+aSeed*70.), sin(uTime*.4+aSeed*20.)) * 0.02 * (1. - uCalm);
    // Big bang: everything bursts out of one point, overshoots, and settles.
    float it = clamp(uIntro * 1.25 - aSeed * 0.25, 0., 1.);
    float intro = 1. - pow(1. - it, 4.);
    pos *= intro * (1. + 0.35 * sin(it * 3.14159));
    vec4 mv = modelViewMatrix * vec4(pos, 1.);
    gl_Position = projectionMatrix * mv;
    // Particles part gently around the pointer, like a hand through dust.
    vec2 away = gl_Position.xy / gl_Position.w - uMouse;
    away.x *= uAspect;
    float push = smoothstep(.3, 0., length(away)) * (1. - uCalm);
    gl_Position.xy += normalize(away + 1e-4) * push * .07 * gl_Position.w;
    float tw = 0.7 + 0.3 * sin(uTime * (1.2 + aSeed * 2.) + aSeed * 50.);
    gl_PointSize = aSize * uPx * tw * (1. + moving * .6 + push * .8) / -mv.z;
    vColor = aColor;
    vAlpha = intro * tw;
  }`;
const FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vColor; varying float vAlpha; uniform float uDim;
  void main(){
    float d = length(gl_PointCoord - .5);
    float halo = smoothstep(.5, .0, d);
    float core = smoothstep(.14, .0, d);
    vec3 c = mix(vColor, vec3(1.), core * .7);
    gl_FragColor = vec4(c, (halo * halo * .9 + core) * vAlpha * uDim);
  }`;
const LINE_VERT = /* glsl */ `
  attribute float aDist; varying float vD;
  void main(){ vD = aDist; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const LINE_FRAG = /* glsl */ `
  precision mediump float;
  varying float vD; uniform float uTime, uOpacity;
  void main(){
    float pulse = smoothstep(.82, 1., fract(vD * .55 - uTime * .55));
    vec3 c = mix(vec3(.72,.66,1.), vec3(1.,.86,.55), pulse);
    gl_FragColor = vec4(c, (.16 + pulse * .9) * uOpacity);
  }`;

function tileTexture(glyph: string, n: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 200;
  const g = c.getContext('2d')!;
  g.shadowColor = 'rgba(255,214,150,.9)';
  g.shadowBlur = 18;
  g.beginPath();
  g.roundRect(16, 16, 128, 168, 26);
  const grad = g.createLinearGradient(0, 16, 0, 184);
  grad.addColorStop(0, 'rgba(58,44,110,.96)');
  grad.addColorStop(1, 'rgba(26,18,60,.96)');
  g.fillStyle = grad;
  g.fill();
  g.shadowBlur = 0;
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(255,224,170,.95)';
  g.stroke();
  g.font = '72px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif';
  g.textAlign = 'center';
  g.fillText(glyph, 80, 124);
  g.fillStyle = 'rgba(255,224,170,.95)';
  g.font = '700 26px system-ui,sans-serif';
  g.fillText(String(n), 80, 166);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------ scene */
export function createLandingScene(canvas: HTMLCanvasElement): LandingScene | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
  } catch {
    return null; // no WebGL: the page still works, just without the backdrop
  }
  const lowPower = /OculusBrowser|Quest|Android|iPhone/i.test(navigator.userAgent);
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COUNT = lowPower ? 1800 : 5600;
  const dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 2);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(46, 1, 0.1, 60);
  camera.position.set(0, 0, 7.4);
  const group = new Group();
  scene.add(group);

  const r = rng(20261114);
  const neurons = buildNeurons(r);
  const roomEdges = buildRoom();
  const edgeLens = roomEdges.map(([a, b]) => dist3(a, b));
  const edgeTotal = edgeLens.reduce((a, b) => a + b, 0);
  const lineTotal = neurons.lines.reduce((a, l) => a + l.len, 0);

  const pickWeighted = (weights: number[], total: number) => {
    let t = r() * total;
    for (let i = 0; i < weights.length; i++) if ((t -= weights[i]) <= 0) return i;
    return weights.length - 1;
  };
  const neuronPoint = (): V3 => {
    if (r() < 0.13) {
      const s = neurons.somas[Math.floor(r() * neurons.somas.length)];
      const d = randDir(r);
      const m = Math.cbrt(r()) * 0.17;
      return [s[0] + d[0] * m, s[1] + d[1] * m, s[2] + d[2] * m];
    }
    const l = neurons.lines[pickWeighted(neurons.lines.map((x) => x.len), lineTotal)];
    const i = Math.floor(r() * (l.pts.length - 1));
    const p = lerp3(l.pts[i], l.pts[i + 1], r());
    return [p[0] + gauss(r) * 0.018, p[1] + gauss(r) * 0.018, p[2] + gauss(r) * 0.018];
  };
  const roomPoint = (): { p: V3; warm: boolean } => {
    const k = r();
    if (k < 0.6) {
      const [a, b] = roomEdges[pickWeighted(edgeLens, edgeTotal)];
      const p = lerp3(a, b, r());
      return { p: [p[0] + gauss(r) * 0.012, p[1] + gauss(r) * 0.012, p[2] + gauss(r) * 0.012], warm: false };
    }
    if (k < 0.74) {
      const c = LOCI[Math.floor(r() * LOCI.length)].p;
      const d = randDir(r);
      const m = 0.1 + Math.cbrt(r()) * 0.2;
      return { p: [c[0] + d[0] * m, c[1] + d[1] * m * 1.2, c[2] + d[2] * m], warm: true };
    }
    if (k < 0.86) return { p: [(r() * 2 - 1) * 2.5, F + 0.01, (r() * 2 - 1) * 2], warm: false };
    return { p: [(r() * 2 - 1) * 2.6, F + r() * 2.7, (r() * 2 - 1) * 2.1], warm: false };
  };

  const a0 = new Float32Array(COUNT * 3), a1 = new Float32Array(COUNT * 3), a2 = new Float32Array(COUNT * 3), a3 = new Float32Array(COUNT * 3);
  const col = new Float32Array(COUNT * 3), seed = new Float32Array(COUNT), size = new Float32Array(COUNT);
  const palette: V3[] = [[1, 0.97, 0.9], [1, 0.78, 0.42], [1, 0.5, 0.72], [0.66, 0.56, 1], [0.45, 0.86, 1]];
  for (let i = 0; i < COUNT; i++) {
    const room = roomPoint();
    a0.set(galaxyPoint(r), i * 3);
    a1.set(neuronPoint(), i * 3);
    a2.set(brainPoint(r), i * 3);
    a3.set(room.p, i * 3);
    const k = r();
    const c = room.warm ? palette[1] : palette[k < 0.34 ? 0 : k < 0.58 ? 1 : k < 0.76 ? 3 : k < 0.9 ? 4 : 2];
    col.set(c, i * 3);
    seed[i] = r();
    size[i] = (r() < 0.05 ? 3.4 : 0.9 + r() * 1.1) * (room.warm ? 1.3 : 1);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(a0, 3));
  geo.setAttribute('a1', new Float32BufferAttribute(a1, 3));
  geo.setAttribute('a2', new Float32BufferAttribute(a2, 3));
  geo.setAttribute('a3', new Float32BufferAttribute(a3, 3));
  geo.setAttribute('aColor', new Float32BufferAttribute(col, 3));
  geo.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));
  geo.setAttribute('aSize', new Float32BufferAttribute(size, 1));
  const mat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uProgress: { value: 0 }, uTime: { value: 0 }, uIntro: { value: calm ? 1 : 0 }, uPx: { value: 60 }, uDim: { value: 1 }, uCalm: { value: calm ? 1 : 0 }, uAspect: { value: 1 }, uMouse: { value: new Vector2(9, 9) } },
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;
  group.add(points);

  // A deep field of faint stars that never morphs: depth behind the story.
  const far = new Float32Array((lowPower ? 500 : 1400) * 3);
  for (let i = 0; i < far.length; i += 3) {
    const d = randDir(r);
    const m = 14 + r() * 12;
    far.set([d[0] * m, d[1] * m, d[2] * m], i);
  }
  const farGeo = new BufferGeometry();
  farGeo.setAttribute('position', new Float32BufferAttribute(far, 3));
  const stars = new Points(farGeo, new PointsMaterial({ color: 0xcfd6ff, size: 0.055, transparent: true, opacity: 0.75, depthWrite: false }));
  scene.add(stars);

  // Synapses: the dendrites themselves, with pulses travelling outward.
  const lp: number[] = [], ld: number[] = [];
  for (const l of neurons.lines)
    for (let i = 0; i < l.pts.length - 1; i++) {
      lp.push(...l.pts[i], ...l.pts[i + 1]);
      ld.push(l.d[i], l.d[i + 1]);
    }
  const synGeo = new BufferGeometry();
  synGeo.setAttribute('position', new Float32BufferAttribute(lp, 3));
  synGeo.setAttribute('aDist', new Float32BufferAttribute(ld, 1));
  const synMat = new ShaderMaterial({
    vertexShader: LINE_VERT,
    fragmentShader: LINE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
  });
  const synapses = new LineSegments(synGeo, synMat);
  group.add(synapses);

  // Room wireframe, route and memory tiles.
  const rp: number[] = [];
  for (const [a, b] of roomEdges) rp.push(...a, ...b);
  const roomGeo = new BufferGeometry();
  roomGeo.setAttribute('position', new Float32BufferAttribute(rp, 3));
  const roomMat = new LineBasicMaterial({ color: 0xb9c4ff, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
  const roomLines = new LineSegments(roomGeo, roomMat);
  group.add(roomLines);

  const routeGeo = new BufferGeometry();
  routeGeo.setAttribute('position', new Float32BufferAttribute(LOCI.flatMap((l) => l.p), 3));
  const routeMat = new LineBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
  const route = new Line(routeGeo, routeMat);
  group.add(route);

  const tiles = LOCI.map((l, i) => {
    const m = new SpriteMaterial({ map: tileTexture(l.glyph, i + 1), transparent: true, depthWrite: false, opacity: 0 });
    const s = new Sprite(m);
    s.position.set(l.p[0], l.p[1], l.p[2]);
    s.scale.set(0.001, 0.001, 1);
    group.add(s);
    return s;
  });

  /* ---------------------------------------------------------- loop */
  const target: SceneTargets = { progress: 0, tiles: 0, shift: 0, dim: 0 };
  const cur: SceneTargets = { ...target };
  let mx = 9, my = 9, yaw = 0, active = true, raf = 0, last = performance.now(), time = 0, intro = calm ? 1 : 0;
  const ROOM_YAW = -0.52;
  const BRAIN_YAW = 1.05;

  const onMove = (e: PointerEvent) => {
    mx = (e.clientX / window.innerWidth) * 2 - 1;
    my = (e.clientY / window.innerHeight) * 2 - 1;
  };
  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    mat.uniforms.uPx.value = h * dpr * 0.085;
    mat.uniforms.uAspect.value = w / h;
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('resize', resize);
  resize();

  const frame = (now: number) => {
    raf = active ? requestAnimationFrame(frame) : 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    intro = Math.min(1, intro + dt / 3.4);
    const k = calm ? 1 : Math.min(1, dt * 3.2);
    cur.progress += (target.progress - cur.progress) * k;
    cur.tiles += (target.tiles - cur.tiles) * k;
    cur.shift += (target.shift - cur.shift) * k;
    cur.dim += (target.dim - cur.dim) * k;

    const p = cur.progress;
    const roomness = Math.max(0, Math.min(1, (p - 2.15) / 0.85));
    // The brain reads best in three-quarter profile, the room from its open corner.
    const brainness = Math.max(0, 1 - Math.abs(p - 2) * 1.7);
    const posed = Math.max(roomness, brainness);
    if (posed < 0.01) yaw += calm ? 0 : dt * 0.07;
    else {
      const goal = roomness > brainness ? ROOM_YAW : BRAIN_YAW;
      let d = goal + (calm ? 0 : Math.sin(time * 0.3) * (roomness > brainness ? 0.07 : 0.22)) - yaw;
      d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      yaw += d * Math.min(1, dt * 2.4 * posed + (calm ? 1 : 0));
    }
    const wide = camera.aspect > 1.15;
    const px = Math.abs(mx) > 1 ? 0 : mx;
    const py = Math.abs(my) > 1 ? 0 : my;
    group.rotation.y = yaw + px * 0.1;
    group.rotation.x = roomness * 0.3 + py * 0.06;
    group.position.x = wide ? cur.shift * 1.9 : 0;
    group.position.y = wide ? 0 : 0.4;
    const s = (wide ? 1 : 0.62) * (1 - roomness * 0.12);
    group.scale.setScalar(s);

    const vis = 1 - cur.dim * 0.78;
    mat.uniforms.uProgress.value = p;
    (mat.uniforms.uMouse.value as Vector2).set(mx, -my);
    stars.rotation.y = time * 0.006;
    mat.uniforms.uTime.value = time;
    mat.uniforms.uIntro.value = intro;
    mat.uniforms.uDim.value = vis;
    synMat.uniforms.uTime.value = time;
    synMat.uniforms.uOpacity.value = Math.max(0, 1 - Math.abs(p - 1) * 2.4) * vis;
    synapses.visible = synMat.uniforms.uOpacity.value > 0.01;
    roomMat.opacity = Math.max(0, (p - 2.45) / 0.55) * 0.5 * vis;
    roomLines.visible = roomMat.opacity > 0.01;
    routeMat.opacity = Math.max(0, cur.tiles * 1.4 - 0.4) * 0.8 * vis * roomness;
    route.visible = routeMat.opacity > 0.01;
    tiles.forEach((t, i) => {
      const a = Math.max(0, Math.min(1, cur.tiles * (tiles.length + 1) - i)) * roomness;
      const e = 1 - Math.pow(1 - a, 3);
      const bob = calm ? 0 : Math.sin(time * 1.3 + i) * 0.025;
      t.position.y = LOCI[i].p[1] + bob + (1 - e) * 0.5;
      t.scale.set(0.44 * e + 0.001, 0.55 * e + 0.001, 1);
      (t.material as SpriteMaterial).opacity = e * vis;
      t.visible = e > 0.01;
    });
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  let wanted = true;
  const apply = () => {
    const run = wanted && !document.hidden;
    if (run === active) return;
    active = run;
    if (run) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else cancelAnimationFrame(raf);
  };
  const onVis = () => apply();
  document.addEventListener('visibilitychange', onVis);

  const api: LandingScene = {
    set(t) {
      Object.assign(target, t);
    },
    setActive(on) {
      wanted = on;
      apply();
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      renderer.dispose();
    },
  };
  return api;
}
