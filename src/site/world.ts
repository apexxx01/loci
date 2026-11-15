/**
 * The room on the website: a living room at night, drawn in fine lines of
 * light, the way Loci sees your own room. As you scroll, one thread of gold
 * draws itself from the couch to the lamp, the shelf, the window, the armchair
 * and the door. Each object lights up as the thread reaches it, and the stage
 * that rests there appears above it. The thread is the same one that joins
 * stages across your real furniture in the headset.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry as Geo,
} from '@iwsdk/core';

export interface Station {
  id: string;
  /** How the place is named on the page. */
  name: string;
  /** -1 object on the left (text right), 1 object on the right (text left), 0 centred. */
  side: number;
}

export const STATIONS: Station[] = [
  { id: 'room', name: 'the doorway', side: 0 },
  { id: 'couch', name: 'the couch', side: -1 },
  { id: 'lamp', name: 'the lamp', side: -1 },
  { id: 'shelf', name: 'the shelf', side: -1 },
  { id: 'window', name: 'the window', side: 1 },
  { id: 'chair', name: 'the armchair', side: 1 },
  { id: 'door', name: 'the far door', side: 0 },
];

export interface World {
  /** 0 at the doorway, 6 at the far door, 7 looking down over the whole room. */
  setProgress(p: number): void;
  /** The stage names resting on the five objects. */
  setItems(items: string[]): void;
  /** 0..1, used by the breathing minute. */
  breathe(v: number): void;
  /** 0..1, quiet the room behind dense reading. */
  setDim(v: number): void;
  setActive(on: boolean): void;
  ready: Promise<void>;
}

const GOLD = new Color('#ffcf7a');
const PEARL = new Color('#fff1d6');
const LILAC = new Color('#b9a8ff');

/** Where the thread touches each object, in walk order (couch .. far door). */
const NODES = [
  new Vector3(-3.2, 0.95, 0.55),
  new Vector3(-4.55, 1.72, -1.85),
  new Vector3(-2.75, 1.65, -3.95),
  new Vector3(1.55, 1.75, -4.3),
  new Vector3(3.85, 1.15, -1.75),
  new Vector3(5.75, 1.3, 2.35),
];
const START = new Vector3(0.7, 1.05, 6.2);

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ shaders */
// Furniture and walls: near-black surfaces lit softly by the moon and warmly by the thread.
const SOLID_VERT = /* glsl */ `
  varying vec3 vW; varying vec3 vN;
  void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w; }`;
const WARMTH = /* glsl */ `
  uniform vec3 uNodes[6]; uniform float uReach[6]; uniform vec3 uHead; uniform float uHeadOn, uDim, uBreath;
  float warmth(vec3 p){
    float w = 0.;
    for (int i = 0; i < 6; i++) { vec3 d = p - uNodes[i]; w += uReach[i] * exp(-dot(d, d) * .55); }
    vec3 h = p - uHead; w += uHeadOn * exp(-dot(h, h) * 1.4) * 1.3;
    return w * (1. + uBreath * .35);
  }`;
const SOLID_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vW; varying vec3 vN;
  ${WARMTH}
  void main(){
    float moon = max(0., dot(vN, normalize(vec3(.35, .55, .9)))) * .5 + max(0., vN.y) * .25;
    float w = warmth(vW);
    vec3 col = vec3(.035, .028, .075) + vec3(.07, .06, .14) * moon + vec3(1., .74, .42) * w * .16;
    gl_FragColor = vec4(col * (1. - uDim * .5), 1.);
  }`;
const LINE_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vW; varying vec3 vN;
  uniform vec3 uGold, uLilac;
  ${WARMTH}
  void main(){
    float w = clamp(warmth(vW), 0., 1.6);
    vec3 col = mix(uLilac * .42, uGold * 1.25, clamp(w, 0., 1.));
    gl_FragColor = vec4(col, (.26 + w * .7) * (1. - uDim * .55));
  }`;

// The thread: drawn up to uDraw, with a bright head and light flowing along it.
const THREAD_VERT = /* glsl */ `
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = -mv.xyz;
    gl_Position = projectionMatrix * mv; }`;
const THREAD_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  uniform float uDraw, uTime, uDim, uBreath, uCalm;
  uniform vec3 uGold, uPearl;
  void main(){
    float t = vUv.x;
    if (t > uDraw) discard;
    float facing = abs(dot(normalize(vN), normalize(vV)));
    float core = pow(facing, 1.6);
    float flow = (1. - uCalm) * pow(.5 + .5 * sin((t * 70. - uTime * 2.2)), 8.) * .6;
    float head = exp(-pow((uDraw - t) * 60., 2.)) * step(.001, uDraw) * step(uDraw, .999);
    float tail = smoothstep(0., .02, t) * smoothstep(.8, 2.6, length(vV));
    vec3 col = mix(uGold, uPearl, core * .6 + head);
    float a = (core * .85 + flow + head * 2.) * tail * (1. - uDim * .45) * (1. + uBreath * .4);
    gl_FragColor = vec4(col * (1. + head * 2.), a);
  }`;

// The night outside the window.
const NIGHT_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv; uniform float uTime, uDim;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main(){
    vec2 uv = vUv;
    vec3 col = mix(vec3(.10, .07, .26), vec3(.02, .02, .08), uv.y);
    col += vec3(.45, .22, .4) * pow(1. - uv.y, 6.) * .35;
    vec2 g = floor(uv * vec2(90., 70.)); float s = h(g);
    float tw = .55 + .45 * sin(uTime * (1. + s * 2.) + s * 40.);
    col += vec3(1.) * step(.985, s) * tw * .9 * smoothstep(.15, .5, uv.y);
    vec2 m = (uv - vec2(.7, .72)) * vec2(1.35, 1.);
    float d = length(m);
    col += vec3(1., .96, .88) * smoothstep(.075, .068, d) + vec3(.8, .72, 1.) * exp(-d * 9.) * .45;
    gl_FragColor = vec4(col * (1. - uDim * .4), 1.);
  }`;

const MOTE_VERT = /* glsl */ `
  attribute float aSeed; uniform float uTime, uPx;
  varying float vA;
  void main(){
    vec3 p = position;
    p.y += sin(uTime * .25 + aSeed * 20.) * .18;
    p.x += cos(uTime * .2 + aSeed * 13.) * .15;
    vec4 mv = modelViewMatrix * vec4(p, 1.);
    vA = .25 + .75 * (.5 + .5 * sin(uTime * (.6 + aSeed) + aSeed * 30.));
    gl_PointSize = uPx * (.6 + aSeed) / -mv.z;
    vA *= smoothstep(.6, 2.5, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const MOTE_FRAG = /* glsl */ `
  precision mediump float; varying float vA; uniform float uDim;
  void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard;
    gl_FragColor = vec4(vec3(1., .9, .75), (1. - d * 2.) * vA * .5 * (1. - uDim * .6)); }`;

const BASIC_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;

function haloTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(255,255,255,0.45)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.08)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function labelTexture(text: string, sub: string): { tex: CanvasTexture; aspect: number } {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = '400 84px "Marcellus", Georgia, serif';
  const subFont = '500 36px "Lexend Variable", "Lexend", system-ui, sans-serif';
  g.font = font;
  const tw = g.measureText(text).width;
  g.font = subFont;
  const sw = g.measureText(sub).width;
  c.width = Math.min(2048, Math.ceil(Math.max(tw, sw) + 120));
  c.height = 230;
  const ctx = c.getContext('2d')!;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = subFont;
  ctx.fillStyle = 'rgba(255, 207, 122, 0.95)';
  ctx.fillText(sub, c.width / 2, 48);
  ctx.font = font;
  ctx.shadowColor = 'rgba(255, 200, 140, 0.9)';
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#fff6ea';
  ctx.fillText(text, c.width / 2, 148);
  ctx.shadowBlur = 0;
  ctx.fillText(text, c.width / 2, 148);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return { tex: t, aspect: c.width / c.height };
}

/* ------------------------------------------------------------------ the room */
export function createWorld(canvas: HTMLCanvasElement): World | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  const lowPower = /OculusBrowser|Quest|Android|iPhone/i.test(navigator.userAgent) && !/[?&]full\b/.test(location.search);
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 2));
  renderer.setClearColor(0x06050f, 1);

  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 0.05, 120);
  const halo = haloTexture();

  const shared = {
    uNodes: { value: NODES },
    uReach: { value: [0, 0, 0, 0, 0, 0] },
    uHead: { value: new Vector3(0, -50, 0) },
    uHeadOn: { value: 0 },
    uDim: { value: 0 },
    uBreath: { value: 0 },
    uGold: { value: GOLD },
    uLilac: { value: LILAC },
  };
  const solidMat = new ShaderMaterial({ vertexShader: SOLID_VERT, fragmentShader: SOLID_FRAG, uniforms: shared });
  const lineMat = new ShaderMaterial({
    vertexShader: SOLID_VERT,
    fragmentShader: LINE_FRAG,
    uniforms: shared,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  const room = new Group();
  scene.add(room);
  const geos: Geo[] = [];
  /** A solid piece with its outline drawn in light. */
  const piece = (geo: Geo, x: number, y: number, z: number, ry = 0, outline = true, parent: Group = room): Mesh => {
    geos.push(geo);
    const m = new Mesh(geo, solidMat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    parent.add(m);
    if (outline) {
      const eg = new EdgesGeometry(geo, 25);
      geos.push(eg);
      const l = new LineSegments(eg, lineMat);
      l.position.copy(m.position);
      l.rotation.copy(m.rotation);
      l.scale.setScalar(1.002);
      parent.add(l);
    }
    return m;
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, outline = true, parent: Group = room) =>
    piece(new BoxGeometry(w, h, d), x, y + h / 2, z, ry, outline, parent);

  /* ---------- the shell: floor, three walls, skirting lines */
  const W = 12.4, D = 10, H = 3.3, back = -4.6, front = 5.4;
  piece(new PlaneGeometry(W, D).rotateX(-Math.PI / 2), 0, 0, (back + front) / 2, 0, false);
  piece(new PlaneGeometry(W, H).translate(0, H / 2, 0), 0, 0, back, 0, false);
  piece(new PlaneGeometry(D, H).translate(0, H / 2, 0), -W / 2, 0, (back + front) / 2, Math.PI / 2, false);
  piece(new PlaneGeometry(D, H).translate(0, H / 2, 0), W / 2, 0, (back + front) / 2, -Math.PI / 2, false);
  {
    // Room edges: where walls meet the floor and each other.
    const pts = [
      [-W / 2, 0, back, W / 2, 0, back], [-W / 2, 0, back, -W / 2, 0, front], [W / 2, 0, back, W / 2, 0, front],
      [-W / 2, 0, back, -W / 2, H, back], [W / 2, 0, back, W / 2, H, back],
      [-W / 2, H, back, W / 2, H, back],
    ].flat();
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pts, 3));
    g.setAttribute('normal', new Float32BufferAttribute(new Array(pts.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geos.push(g);
    room.add(new LineSegments(g, lineMat));
  }
  // A rug under the coffee table.
  piece(new CylinderGeometry(1.9, 1.9, 0.02, 64), -0.6, 0.01, -0.6);
  box(1.3, 0.38, 0.7, -0.6, 0, -0.6);

  /* ---------- 1 the couch */
  {
    const g = new Group();
    g.position.set(-3.2, 0, 0.55);
    g.rotation.y = Math.PI / 2;
    room.add(g);
    box(2.3, 0.42, 0.95, 0, 0.08, 0, 0, true, g);
    box(2.3, 0.62, 0.24, 0, 0.3, -0.42, 0, true, g);
    box(0.24, 0.55, 0.95, -1.1, 0.08, 0, 0, true, g);
    box(0.24, 0.55, 0.95, 1.1, 0.08, 0, 0, true, g);
    box(0.95, 0.14, 0.7, -0.5, 0.5, 0.05, 0, true, g);
    box(0.95, 0.14, 0.7, 0.5, 0.5, 0.05, 0, true, g);
  }
  /* ---------- 2 the lamp */
  piece(new CylinderGeometry(0.22, 0.26, 0.05, 32), -4.55, 0.025, -1.85);
  piece(new CylinderGeometry(0.018, 0.018, 1.55, 8), -4.55, 0.8, -1.85, 0, false);
  const shadeGeo = new CylinderGeometry(0.2, 0.33, 0.38, 40, 1, true);
  piece(shadeGeo, -4.55, 1.72, -1.85);
  /* ---------- 3 the shelf */
  {
    const x = -2.75, z = -4.32;
    box(1.5, 2.3, 0.04, x, 0, z - 0.17, 0);
    box(0.05, 2.3, 0.38, x - 0.73, 0, z, 0);
    box(0.05, 2.3, 0.38, x + 0.73, 0, z, 0);
    const r = rng(7);
    for (let s = 0; s < 5; s++) {
      const y = 0.05 + s * 0.52;
      box(1.46, 0.035, 0.38, x, y, z, 0);
      if (s === 4) continue;
      let bx = x - 0.66;
      while (bx < x + 0.6) {
        const w = 0.04 + r() * 0.05;
        const h = 0.26 + r() * 0.16;
        if (r() > 0.18) box(w, h, 0.24, bx + w / 2, y + 0.035, z + 0.02, 0, r() > 0.45);
        bx += w + 0.008;
      }
    }
  }
  /* ---------- 4 the window, with the night outside */
  const nightMat = new ShaderMaterial({ vertexShader: BASIC_VERT, fragmentShader: NIGHT_FRAG, uniforms: { uTime: { value: 0 }, uDim: { value: 0 } } });
  {
    const nightGeo = new PlaneGeometry(2.4, 1.7);
    geos.push(nightGeo);
    const night = new Mesh(nightGeo, nightMat);
    night.position.set(1.55, 1.75, back + 0.01);
    room.add(night);
    box(2.6, 0.08, 0.22, 1.55, 0.86, back + 0.1);
    box(2.6, 0.08, 0.12, 1.55, 2.6, back + 0.06);
    box(0.08, 1.74, 0.12, 0.29, 0.86, back + 0.06);
    box(0.08, 1.74, 0.12, 2.81, 0.86, back + 0.06);
    box(0.04, 1.74, 0.06, 1.55, 0.86, back + 0.04, 0, false);
    // Moonlight falling through it onto the floor.
    const shaftGeo = new PlaneGeometry(2.6, 4.2);
    geos.push(shaftGeo);
    const shaftMat = new ShaderMaterial({
      vertexShader: BASIC_VERT,
      fragmentShader: `precision mediump float; varying vec2 vUv; uniform float uDim;
        void main(){ float a = smoothstep(0., .35, vUv.y) * smoothstep(1., .55, vUv.y) * smoothstep(0., .25, vUv.x) * smoothstep(1., .75, vUv.x);
          gl_FragColor = vec4(vec3(.6, .58, 1.), a * .07 * (1. - uDim)); }`,
      uniforms: { uDim: shared.uDim },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const shaft = new Mesh(shaftGeo, shaftMat);
    shaft.rotation.x = -Math.PI / 2;
    shaft.position.set(1.9, 0.015, back + 2.3);
    room.add(shaft);
  }
  /* ---------- 5 the armchair, and a plant */
  {
    const g = new Group();
    g.position.set(3.85, 0, -1.75);
    g.rotation.y = -Math.PI / 2 - 0.35;
    room.add(g);
    box(1.0, 0.42, 0.9, 0, 0.08, 0, 0, true, g);
    box(1.0, 0.72, 0.22, 0, 0.3, -0.4, 0, true, g);
    box(0.2, 0.55, 0.9, -0.5, 0.08, 0, 0, true, g);
    box(0.2, 0.55, 0.9, 0.5, 0.08, 0, 0, true, g);
    piece(new CylinderGeometry(0.24, 0.18, 0.5, 24), 5.0, 0.25, -3.4);
    const r = rng(11);
    for (let i = 0; i < 9; i++) {
      const leaf = new SphereGeometry(0.12, 10, 8).scale(0.6, 2.4, 0.25);
      const a = (i / 9) * Math.PI * 2;
      const m = piece(leaf, 5.0 + Math.cos(a) * 0.14, 0.82 + r() * 0.25, -3.4 + Math.sin(a) * 0.14, a, false);
      m.rotation.z = Math.cos(a) * 0.5;
      m.rotation.x = Math.sin(a) * 0.5;
    }
  }
  /* ---------- 6 the far door, open a crack with warm light behind */
  const doorGlow = new ShaderMaterial({
    vertexShader: BASIC_VERT,
    fragmentShader: `precision mediump float; varying vec2 vUv; uniform float uOpen, uDim;
      void main(){ float edge = smoothstep(0., .5, vUv.x) * smoothstep(1., .5, vUv.x);
        gl_FragColor = vec4(vec3(1., .82, .55) * (.4 + uOpen * 1.6), (.18 + uOpen * .75) * (1. - uDim * .4) * (.6 + edge * .4)); }`,
    uniforms: { uOpen: { value: 0 }, uDim: shared.uDim },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  {
    const x = W / 2 - 0.02, z = 2.35;
    const lightGeo = new PlaneGeometry(0.95, 2.1).translate(0, 1.05, 0);
    geos.push(lightGeo);
    const light = new Mesh(lightGeo, doorGlow);
    light.position.set(x - 0.005, 0, z);
    light.rotation.y = -Math.PI / 2;
    room.add(light);
    box(0.12, 2.2, 0.08, x - 0.05, 0, z - 0.52, 0);
    box(0.12, 2.2, 0.08, x - 0.05, 0, z + 0.52, 0);
    box(0.12, 0.08, 1.12, x - 0.05, 2.18, z, 0);
    box(0.05, 2.1, 0.92, x - 0.38, 0, z + 0.18, 0.75);
  }

  /* ---------- the thread */
  const threadPts: Vector3[] = [START];
  NODES.forEach((n, i) => {
    const prev = i === 0 ? START : NODES[i - 1];
    const mid = prev.clone().lerp(n, 0.5);
    mid.y += 0.55 + prev.distanceTo(n) * 0.06;
    threadPts.push(mid, n);
  });
  const curve = new CatmullRomCurve3(threadPts, false, 'centripetal', 0.5);
  const tubeGeo = new TubeGeometry(curve, lowPower ? 360 : 720, 0.022, 10, false);
  geos.push(tubeGeo);
  const threadMat = new ShaderMaterial({
    vertexShader: THREAD_VERT,
    fragmentShader: THREAD_FRAG,
    uniforms: { uDraw: { value: 0 }, uTime: { value: 0 }, uDim: shared.uDim, uBreath: shared.uBreath, uCalm: { value: calm ? 1 : 0 }, uGold: shared.uGold, uPearl: { value: PEARL } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const thread = new Mesh(tubeGeo, threadMat);
  thread.frustumCulled = false;
  scene.add(thread);
  // Arc-length position of each node along the thread.
  const nodeU = NODES.map((n) => {
    let best = 0, bd = Infinity;
    const p = new Vector3();
    for (let i = 0; i <= 600; i++) {
      curve.getPointAt(i / 600, p);
      const d = p.distanceToSquared(n);
      if (d < bd) (bd = d), (best = i / 600);
    }
    return best;
  });

  // A glow where the thread touches each object, and at its moving head.
  const sprite = (size: number, color: Color) => {
    const s = new Sprite(new SpriteMaterial({ map: halo, color, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0 }));
    s.scale.setScalar(size);
    scene.add(s);
    return s;
  };
  const nodeGlows = NODES.map((n) => {
    const s = sprite(0.9, GOLD);
    s.position.copy(n);
    return s;
  });
  const headGlow = sprite(0.7, PEARL);
  const lampGlow = sprite(2.6, GOLD);
  lampGlow.position.set(-4.55, 1.72, -1.85);

  /* ---------- dust in the moonlight */
  let moteMat!: ShaderMaterial;
  {
    const n = lowPower ? 160 : 420;
    const r = rng(42);
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * W * 0.9;
      pos[i * 3 + 1] = 0.2 + r() * (H - 0.4);
      pos[i * 3 + 2] = back + 0.3 + r() * (front - back - 0.6);
      seed[i] = r();
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));
    geos.push(g);
    moteMat = new ShaderMaterial({
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      uniforms: { uTime: { value: 0 }, uPx: { value: 10 }, uDim: shared.uDim },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    scene.add(new Points(g, moteMat));
  }

  /* ---------- stage names above the objects */
  const labels: { s: Sprite; t: number }[] = [];
  let lastList: string[] = [];
  // Canvas text needs its typefaces loaded first; redraw once they are.
  void Promise.all(['400 84px "Marcellus"', '500 36px "Lexend Variable"'].map((f) => document.fonts.load(f)))
    .then(() => lastList.length && setItems(lastList))
    .catch(() => undefined);
  const setItems = (list: string[]) => {
    lastList = list;
    for (const l of labels) {
      (l.s.material as SpriteMaterial).map?.dispose();
      scene.remove(l.s);
    }
    labels.length = 0;
    list.slice(0, 5).forEach((text, i) => {
      if (!text) return;
      const { tex, aspect } = labelTexture(text, `Stage ${i + 1}`);
      const s = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
      const h = 0.5;
      s.scale.set(h * aspect, h, 1);
      s.position.copy(NODES[i]).add(new Vector3(0, 0.62, 0));
      scene.add(s);
      labels.push({ s, t: i });
    });
  };

  /* ---------- the camera's walk */
  const camKeys = [
    new Vector3(0.9, 1.75, 8.2),
    new Vector3(-0.3, 1.65, 3.6),
    new Vector3(-1.6, 1.8, 1.4),
    new Vector3(-0.6, 1.7, -0.6),
    new Vector3(-0.2, 1.65, -0.9),
    new Vector3(1.1, 1.7, 1.3),
    new Vector3(2.2, 1.65, 2.1),
    new Vector3(0.4, 8.2, 8.6),
  ];
  const lookAt = (camPos: Vector3, obj: Vector3, side: number) => {
    // Keep the object to one side of the frame, leaving room for the words.
    const dir = obj.clone().sub(camPos).setY(0).normalize();
    const right = new Vector3(-dir.z, 0, dir.x);
    return obj.clone().addScaledVector(right, -side * 0.95 * (camPos.distanceTo(obj) / 3.4));
  };
  const lookKeys = [
    new Vector3(-0.6, 1.0, -1.6),
    ...NODES.slice(0, 5).map((n, i) => lookAt(camKeys[i + 1], n.clone().setY(n.y - 0.25), STATIONS[i + 1].side)),
    NODES[5].clone().setY(1.2),
    new Vector3(-0.2, 0, -0.8),
  ];
  const camCurve = new CatmullRomCurve3(camKeys, false, 'centripetal', 0.5);
  const lookCurve = new CatmullRomCurve3(lookKeys, false, 'centripetal', 0.5);
  const last = camKeys.length - 1;

  let target = 0, cur = 0, dim = 0, dimT = 0, breath = 0, breathT = 0;
  const mouse = new Vector2();
  const camPos = new Vector3(), look = new Vector3(), head = new Vector3(), proj = new Vector3();
  let active = true, raf = 0, prev = performance.now(), time = 0;

  const onMove = (e: PointerEvent) => mouse.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  window.addEventListener('pointermove', onMove, { passive: true });

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 66 : 50;
    camera.updateProjectionMatrix();
    moteMat.uniforms.uPx.value = h * renderer.getPixelRatio() * 0.02;
  };
  resize();
  window.addEventListener('resize', resize);

  let readyResolve = () => {};
  const ready = new Promise<void>((res) => (readyResolve = res));
  let frames = 0;

  const frame = () => {
    raf = active ? requestAnimationFrame(frame) : 0;
    const now = performance.now();
    const dt = Math.max(0, Math.min(0.05, (now - prev) / 1000));
    prev = now;
    time += dt;
    if (++frames === 3) readyResolve();

    cur = calm ? target : cur + (target - cur) * Math.min(1, dt * 2.2);
    dim += (dimT - dim) * Math.min(1, dt * 3);
    breath += (breathT - breath) * Math.min(1, dt * 2.5);

    const u = clamp01(cur / last);
    // getPoint (not getPointAt) so each station lands exactly on its keyframe.
    camCurve.getPoint(u, camPos);
    lookCurve.getPoint(u, look);
    const sway = calm ? 0 : 1;
    camPos.x += (mouse.x * 0.18 + Math.sin(time * 0.21) * 0.05) * sway;
    camPos.y += (-mouse.y * 0.1 + Math.sin(time * 0.33) * 0.03) * sway;
    camera.position.copy(camPos);
    camera.lookAt(look);

    // How far the thread has drawn: it reaches object k at station k + 1.
    const k = cur - 1;
    let draw: number;
    if (k <= 0) draw = nodeU[0] * smooth(clamp01(cur));
    else if (k >= NODES.length - 1) draw = cur >= 6.95 ? 1 : nodeU[NODES.length - 1];
    else {
      const i = Math.floor(k);
      draw = nodeU[i] + (nodeU[i + 1] - nodeU[i]) * smooth(k - i);
    }
    if (cur >= 6) draw = nodeU[5] + (1 - nodeU[5]) * clamp01(cur - 6);
    threadMat.uniforms.uDraw.value = draw;
    threadMat.uniforms.uTime.value = time;
    curve.getPointAt(Math.min(0.999, draw), head);
    shared.uHead.value.copy(head);
    const moving = draw > 0.002 && draw < 0.998 ? 1 : 0;
    shared.uHeadOn.value += (moving - shared.uHeadOn.value) * Math.min(1, dt * 4);
    headGlow.position.copy(head);
    (headGlow.material as SpriteMaterial).opacity = shared.uHeadOn.value * 0.9 * (1 - dim * 0.5);

    const reach = shared.uReach.value;
    NODES.forEach((_, i) => {
      reach[i] = smooth(clamp01((draw - nodeU[i]) / 0.02 + 0.0001));
      if (draw < nodeU[i] - 0.001) reach[i] = 0;
      const pulse = 1 + (calm ? 0 : Math.sin(time * 1.6 + i) * 0.12) + breath * 0.5;
      (nodeGlows[i].material as SpriteMaterial).opacity = reach[i] * 0.75 * pulse * (1 - dim * 0.5);
    });
    (lampGlow.material as SpriteMaterial).opacity = reach[1] * 0.55 * (1 + breath * 0.4) * (1 - dim * 0.4);
    shared.uDim.value = dim;
    shared.uBreath.value = breath;
    nightMat.uniforms.uTime.value = time;
    nightMat.uniforms.uDim.value = dim;
    moteMat.uniforms.uTime.value = time;
    doorGlow.uniforms.uOpen.value = smooth(clamp01((cur - 5.3) / 0.8));

    // Each stage name rises into view once the thread has reached its object.
    labels.forEach((l) => {
      // Only the stage you are at shows its name (all of them in the overview), so names never sit behind the words.
      let on = reach[l.t] > 0.5 && (Math.abs(cur - 1 - l.t) < 0.7 || cur > 6.5) ? 1 : 0;
      if (on && cur <= 6.5) {
        // Never let a name drift into the column of words beside its object.
        const side = STATIONS[l.t + 1].side;
        proj.copy(l.s.position).project(camera);
        if (side !== 0 && proj.x * -side > -0.12) on = 0;
      }
      const m = l.s.material as SpriteMaterial;
      m.opacity += (on * (1 - dim * 0.5) - m.opacity) * Math.min(1, dt * 3);
      l.s.position.y = NODES[l.t].y + 0.55 + m.opacity * 0.08 + (calm ? 0 : Math.sin(time * 0.8 + l.t) * 0.02);
    });

    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  const onVis = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (active && !raf) {
      prev = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  document.addEventListener('visibilitychange', onVis);

  return {
    ready,
    setProgress(p) {
      target = Math.max(0, Math.min(last, p));
    },
    setItems,
    breathe(v) {
      breathT = v;
    },
    setDim(v) {
      dimT = v;
    },
    setActive(on) {
      if (on === active) return;
      active = on;
      if (on) {
        prev = performance.now();
        raf = requestAnimationFrame(frame);
      } else {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
  };
}
