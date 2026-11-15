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
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Scene,
  PointsMaterial,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from '@iwsdk/core';
import { drawSigil } from './sigil.js';

type V3 = [number, number, number];

export interface SceneTargets {
  /** 0 galaxy, 1 neurons, 2 brain, 3 room, 4 the word "loci" */
  progress: number;
  /** 0..1 how many memory tiles have landed in the room. */
  tiles: number;
  /** -1 scene left · 0 centre · 1 scene right */
  shift: number;
  /** 0..1 fade the scene back behind dense content. */
  dim: number;
  /** 0..1 the cloud swells as you breathe in and settles as you breathe out. */
  breath: number;
  /** Index of the memory tile to light up, or -1. */
  focus: number;
}

export interface TileScreen {
  x: number;
  y: number;
  /** 0..1 how present the tile is right now. */
  a: number;
  label: string;
}

export interface LandingScene {
  set(t: Partial<SceneTargets>): void;
  /** A slow ring of light through the cloud from a point on screen (client px). */
  ripple(x: number, y: number): void;
  /** Called after each frame with each memory tile's screen position. */
  onTiles(cb: ((tiles: TileScreen[]) => void) | null): void;
  /** Rest these memories on the furniture instead (up to eight), and replay their landing. */
  showDeck(items: { glyph: string; cue: string }[]): void;
  /** Resolves once the opening has played. */
  ready: Promise<void>;
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
export const LOCI: { p: V3; glyph: string; label: string; cue: string }[] = [
  { p: [-2.38, F + 2.3, -0.8], glyph: '🌡️', label: 'the door', cue: 'Mercury' },
  { p: [-2.2, F + 2.15, 0.6], glyph: '♨️', label: 'the shelf', cue: 'Venus' },
  { p: [-1.9, F + 1.05, -1.6], glyph: '🌍', label: 'the plant', cue: 'Earth' },
  { p: [-1.0, F + 1.55, -1.86], glyph: '🔴', label: 'the window', cue: 'Mars' },
  { p: [0.3, F + 0.86, 0.3], glyph: '👑', label: 'the table', cue: 'Jupiter' },
  { p: [1.2, F + 1.25, -1.4], glyph: '💍', label: 'the couch', cue: 'Saturn' },
  { p: [1.2, F + 2.32, -1.86], glyph: '🧊', label: 'the wall art', cue: 'Uranus' },
  { p: [2.1, F + 2.12, 0.9], glyph: '🔱', label: 'the lamp', cue: 'Neptune' },
];

/** Points that spell a word, sampled from the page's own typeface. */
function wordPoints(word: string, n: number, r: () => number): Float32Array | null {
  const W = 900, H = 320;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'italic 500 300px "Cormorant Variable", "Cormorant", Garamond, serif';
  g.fillText(word, W / 2, H / 2 + 10);
  const data = g.getImageData(0, 0, W, H).data;
  const inside: number[] = [];
  for (let y = 0; y < H; y += 2)
    for (let x = 0; x < W; x += 2) if (data[(y * W + x) * 4 + 3] > 128) inside.push(x, y);
  if (inside.length < 20) return null;
  const out = new Float32Array(n * 3);
  const scale = 7.6 / W;
  for (let i = 0; i < n; i++) {
    // Most particles trace the letters; a quiet tenth drift around them as dust.
    if (r() < 0.1) {
      const d = randDir(r);
      const m = 3 + r() * 5;
      out.set([d[0] * m, d[1] * m * 0.6, d[2] * m - 2], i * 3);
      continue;
    }
    const k = Math.floor(r() * (inside.length / 2)) * 2;
    out.set([(inside[k] - W / 2 + r() * 2) * scale, -(inside[k + 1] - H / 2 + r() * 2) * scale + 0.1, gauss(r) * 0.06], i * 3);
  }
  return out;
}

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
  attribute vec3 a1; attribute vec3 a2; attribute vec3 a3; attribute vec3 a4;
  attribute vec3 aColor; attribute float aSeed; attribute float aSize;
  uniform float uProgress, uTime, uIntro, uPx, uCalm, uAspect, uBreath, uFocus;
  uniform vec2 uMouse; uniform vec3 uRipple;
  varying vec3 vColor; varying float vAlpha;
  float st(float t){ t = clamp(t*1.5 - aSeed*0.5, 0., 1.); return t*t*(3.-2.*t); }
  void main(){
    float p = uProgress;
    vec3 pos = mix(position, a1, st(clamp(p,0.,1.)));
    pos = mix(pos, a2, st(clamp(p-1.,0.,1.)));
    pos = mix(pos, a3, st(clamp(p-2.,0.,1.)));
    pos = mix(pos, a4, st(clamp(p-3.,0.,1.)));
    float moving = sin(3.14159 * st(fract(min(p, 3.999)))) * (1. - uCalm);
    // Breathing: the whole cloud swells on the in-breath, each mote a little late.
    pos *= 1. + uBreath * (0.13 + aSeed * 0.05);
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
    // A ring of light that travels out from where you clicked.
    vec2 rc = gl_Position.xy / gl_Position.w - uRipple.xy; rc.x *= uAspect;
    float age = uTime - uRipple.z;
    float ring = exp(-pow((length(rc) - age * .55) * 9., 2.)) * exp(-age * 1.1) * step(0., age);
    gl_Position.xy += normalize(rc + 1e-4) * ring * .035 * gl_Position.w;
    float tw = 0.7 + 0.3 * sin(uTime * (1.2 + aSeed * 2.) + aSeed * 50.);
    // Shallow depth of field: motes off the focal plane grow soft and faint.
    float coc = clamp(abs(-mv.z - uFocus) * .16, 0., 1.);
    // Never let a mote swell into a smear: cap its size, and fade anything that drifts close to the eye.
    gl_PointSize = min(aSize * uPx * tw * (1. + moving * .6 + push * .8 + ring * 1.5) * (1. + coc) / -mv.z, uPx * .3);
    float near = smoothstep(2.2, 4.6, -mv.z);
    vColor = mix(aColor, vec3(1., .86, .62), ring * .8);
    vAlpha = intro * tw * near * (1. + ring * 1.4 + uBreath * .25) / (1. + coc * coc * .8);
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

/** A slow, faint nebula behind everything; its colour follows the story. */
const SKY_VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position.xy, .9999, 1.); }`;
const SKY_FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv; uniform float uTime, uStage, uDim, uAspect, uBreath, uIntro;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float v = 0., a = .5; for(int i = 0; i < 4; i++){ v += a * n(p); p = p * 2.03 + 11.7; a *= .5; } return v; }
  void main(){
    vec2 p = (vUv - .5) * vec2(uAspect, 1.);
    float t = uTime * .012;
    float q = fbm(p * 1.6 + vec2(t, -t));
    float cloud = fbm(p * 2.4 + q * 1.8 - vec2(t * .7, t * .4));
    float core = exp(-dot(p, p) * 2.6);
    // galaxy: violet and dusk rose; neurons: deep blue; brain: lilac; room: candlelight from below.
    vec3 violet = vec3(.24, .16, .52), rose = vec3(.52, .2, .34), blue = vec3(.08, .16, .42), candle = vec3(.62, .36, .14);
    float g = clamp(1. - uStage, 0., 1.), ne = clamp(1. - abs(uStage - 1.), 0., 1.), b = clamp(1. - abs(uStage - 2.), 0., 1.), ro = clamp(uStage - 2., 0., 1.);
    vec3 col = (violet * g + blue * ne + mix(violet, rose, .5) * b + violet * .5 * ro) * cloud * cloud * 1.6;
    col += rose * g * core * cloud * .35 + candle * ro * exp(-pow(vUv.y + .15, 2.) * 6.) * (.3 + cloud * .3);
    col *= (.32 + uBreath * .25) * uDim * uIntro;
    gl_FragColor = vec4(col, 1.);
  }`;

function tileTexture(text: string, n: number): CanvasTexture {
  // A glowing token: the memory's own little constellation, and its place in the walk.
  const c = document.createElement('canvas');
  c.width = 192;
  c.height = 224;
  const g = c.getContext('2d')!;
  const halo = g.createRadialGradient(96, 96, 4, 96, 96, 92);
  halo.addColorStop(0, 'rgba(255,214,160,0.34)');
  halo.addColorStop(0.45, 'rgba(255,190,120,0.1)');
  halo.addColorStop(1, 'rgba(255,190,120,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, 192, 192);
  g.strokeStyle = 'rgba(255,214,160,0.35)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(96, 96, 62, 0, Math.PI * 2);
  g.stroke();
  drawSigil(g, text, 96, 96, 96);
  g.fillStyle = 'rgba(255,226,189,0.9)';
  g.font = '400 22px "Hanken Grotesk Variable", system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(String(n), 96, 214);
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

  const a0 = new Float32Array(COUNT * 3), a1 = new Float32Array(COUNT * 3), a2 = new Float32Array(COUNT * 3), a3 = new Float32Array(COUNT * 3), a4 = new Float32Array(COUNT * 3);
  const col = new Float32Array(COUNT * 3), seed = new Float32Array(COUNT), size = new Float32Array(COUNT);
  // Starlight, candle, dusk rose, lilac, and a little cold blue.
  const palette: V3[] = [[0.96, 0.95, 1], [1, 0.79, 0.54], [1, 0.58, 0.7], [0.72, 0.68, 1], [0.55, 0.78, 1]];
  for (let i = 0; i < COUNT; i++) {
    const room = roomPoint();
    a0.set(galaxyPoint(r), i * 3);
    a1.set(neuronPoint(), i * 3);
    a2.set(brainPoint(r), i * 3);
    a3.set(room.p, i * 3);
    a4.set(galaxyPoint(r), i * 3); // replaced by the word once the typeface has loaded
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
  const a4Attr = new Float32BufferAttribute(a4, 3);
  geo.setAttribute('a4', a4Attr);
  void document.fonts?.load('italic 500 300px "Cormorant Variable"').then(() => {
    const word = wordPoints('loci', COUNT, rng(7));
    if (!word) return;
    a4Attr.copyArray(word);
    a4Attr.needsUpdate = true;
  });
  geo.setAttribute('aColor', new Float32BufferAttribute(col, 3));
  geo.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));
  geo.setAttribute('aSize', new Float32BufferAttribute(size, 1));
  const mat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uProgress: { value: 0 }, uTime: { value: 0 }, uIntro: { value: calm ? 1 : 0 }, uPx: { value: 60 }, uDim: { value: 1 },
      uCalm: { value: calm ? 1 : 0 }, uAspect: { value: 1 }, uMouse: { value: new Vector2(9, 9) }, uBreath: { value: 0 },
      uFocus: { value: 7.4 }, uRipple: { value: new Vector3(0, 0, -99) },
    },
  });
  const skyMat = new ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    depthWrite: false,
    depthTest: false,
    uniforms: { uTime: { value: 0 }, uStage: { value: 0 }, uDim: { value: 1 }, uAspect: { value: 1 }, uBreath: { value: 0 }, uIntro: { value: 0 } },
  });
  const sky = new Mesh(new PlaneGeometry(2, 2), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  sky.visible = !lowPower;
  scene.add(sky);

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
    const m = new SpriteMaterial({ map: tileTexture(l.cue, i + 1), transparent: true, depthWrite: false, opacity: 0 });
    const s = new Sprite(m);
    s.position.set(l.p[0], l.p[1], l.p[2]);
    s.scale.set(0.001, 0.001, 1);
    group.add(s);
    return s;
  });

  /* ---------------------------------------------------------- loop */
  const target: SceneTargets = { progress: 0, tiles: 0, shift: 0, dim: 0, breath: 0, focus: -1 };
  const cur: SceneTargets = { ...target };
  let mx = 9, my = 9, yaw = 0, active = true, raf = 0, last = performance.now(), time = 0, intro = calm ? 1 : 0;
  let tileCb: ((t: TileScreen[]) => void) | null = null;
  let readyResolve: () => void = () => {};
  const ready = new Promise<void>((res) => (readyResolve = res));
  if (calm) readyResolve();
  const focusGlow = LOCI.map(() => 0);
  const screen = LOCI.map((l) => ({ x: 0, y: 0, a: 0, label: l.label }));
  const v3 = new Vector3();
  let shownTiles = LOCI.length;
  let landedAt = -99;
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
    skyMat.uniforms.uAspect.value = w / h;
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('resize', resize);
  resize();

  const frame = (now: number) => {
    raf = active ? requestAnimationFrame(frame) : 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    const wasIntro = intro < 1;
    intro = Math.min(1, intro + dt / 3.4);
    if (wasIntro && intro >= 0.75) readyResolve();
    const k = calm ? 1 : Math.min(1, dt * 3.2);
    cur.progress += (target.progress - cur.progress) * k;
    cur.tiles += (target.tiles - cur.tiles) * k;
    cur.shift += (target.shift - cur.shift) * k;
    cur.dim += (target.dim - cur.dim) * k;
    cur.breath += (target.breath - cur.breath) * Math.min(1, dt * 2.2);

    const p = cur.progress;
    const wordness = Math.max(0, Math.min(1, p - 3));
    const roomness = Math.max(0, Math.min(1, (p - 2.15) / 0.85)) * (1 - wordness);
    // The brain reads best in three-quarter profile, the room from its open corner.
    const brainness = Math.max(0, 1 - Math.abs(p - 2) * 1.7);
    const posed = Math.max(roomness, brainness, wordness);
    if (posed < 0.01) yaw += calm ? 0 : dt * 0.07;
    else {
      const goal = wordness > 0.5 ? 0 : roomness > brainness ? ROOM_YAW : BRAIN_YAW;
      let d = goal + (calm ? 0 : Math.sin(time * 0.3) * (roomness > brainness ? 0.07 : 0.22)) - yaw;
      d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      yaw += d * Math.min(1, dt * 2.4 * posed + (calm ? 1 : 0));
    }
    const wide = camera.aspect > 1.15;
    const px = Math.abs(mx) > 1 ? 0 : mx;
    const py = Math.abs(my) > 1 ? 0 : my;
    group.rotation.y = yaw + px * 0.1 * (1 - wordness * 0.7);
    group.rotation.x = roomness * 0.3 + py * 0.06;
    group.position.x = wide ? cur.shift * Math.min(2.2, 1.25 * camera.aspect) : 0;
    group.position.y = (wide ? 0 : 0.4) + wordness * 0.35;
    const s = (wide ? 1 - Math.abs(cur.shift) * 0.12 : 0.62) * (1 - roomness * 0.12) * (wide ? 1 : 1 - wordness * 0.25);
    group.scale.setScalar(s);

    const vis = Math.pow(1 - cur.dim * 0.97, 1.4);
    mat.uniforms.uProgress.value = p;
    (mat.uniforms.uMouse.value as Vector2).set(mx, -my);
    stars.rotation.y = time * 0.006;
    mat.uniforms.uTime.value = time;
    mat.uniforms.uIntro.value = intro;
    mat.uniforms.uDim.value = vis;
    mat.uniforms.uBreath.value = cur.breath;
    skyMat.uniforms.uTime.value = time;
    skyMat.uniforms.uStage.value = Math.min(p, 3);
    skyMat.uniforms.uDim.value = vis * (1 - wordness * 0.5);
    skyMat.uniforms.uBreath.value = cur.breath;
    skyMat.uniforms.uIntro.value = intro;
    synMat.uniforms.uTime.value = time;
    synMat.uniforms.uOpacity.value = Math.max(0, 1 - Math.abs(p - 1) * 2.4) * vis;
    synapses.visible = synMat.uniforms.uOpacity.value > 0.01;
    roomMat.opacity = Math.max(0, Math.min(1, (p - 2.45) / 0.55)) * 0.5 * vis * (1 - wordness * 0.6);
    roomLines.visible = roomMat.opacity > 0.01;
    routeMat.opacity = Math.max(0, cur.tiles * 1.4 - 0.4) * 0.8 * vis * roomness;
    route.visible = routeMat.opacity > 0.01;
    const lit = Math.round(target.focus);
    const relanding = Math.min(1, (time - landedAt) / 2.4);
    tiles.forEach((t, i) => {
      const a = i >= shownTiles ? 0 : Math.max(0, Math.min(1, cur.tiles * relanding * (tiles.length + 1) - i)) * roomness;
      const e = 1 - Math.pow(1 - a, 3);
      const bob = calm ? 0 : Math.sin(time * 1.3 + i) * 0.025;
      focusGlow[i] += ((lit === i ? 1 : 0) - focusGlow[i]) * Math.min(1, dt * 4);
      const quiet = lit >= 0 ? 0.55 + focusGlow[i] * 0.45 : 1;
      const grow = 1 + focusGlow[i] * 0.35;
      t.position.y = LOCI[i].p[1] + bob + (1 - e) * 0.5;
      t.scale.set((0.5 * e + 0.001) * grow, (0.58 * e + 0.001) * grow, 1);
      (t.material as SpriteMaterial).opacity = e * vis * quiet;
      t.visible = e > 0.01;
      if (tileCb) {
        v3.copy(t.position).applyMatrix4(group.matrixWorld).project(camera);
        const sc = screen[i];
        sc.x = (v3.x * 0.5 + 0.5) * (canvas.clientWidth || window.innerWidth);
        sc.y = (-v3.y * 0.5 + 0.5) * (canvas.clientHeight || window.innerHeight);
        sc.a = e * vis * quiet;
      }
    });
    renderer.render(scene, camera);
    tileCb?.(screen);
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
    ready,
    set(t) {
      Object.assign(target, t);
    },
    ripple(x, y) {
      if (calm) return;
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      (mat.uniforms.uRipple.value as Vector3).set((x / w) * 2 - 1, -((y / h) * 2 - 1), time);
    },
    onTiles(cb) {
      tileCb = cb;
    },
    showDeck(items) {
      const n = Math.min(items.length, tiles.length);
      for (let i = 0; i < n; i++) {
        const m = tiles[i].material as SpriteMaterial;
        m.map?.dispose();
        m.map = tileTexture(items[i].cue, i + 1);
        m.needsUpdate = true;
        screen[i].label = items[i].cue;
      }
      shownTiles = n;
      landedAt = time;
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
