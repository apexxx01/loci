/**
 * The palace you walk through on the website.
 *
 * A palace of light floating in open space: a colonnade of luminous arches
 * over a mirror floor, a sky that runs from deep indigo to a rose and gold
 * horizon, and six places along the walk (a gate, a fountain, a lantern
 * grove, a stair, a moon pool and a door). As you scroll, the camera walks
 * from place to place, and the five things you chose to carry in appear
 * where you leave them. It is the method of loci, done on the page itself.
 */
import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  CylinderGeometry,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
} from '@iwsdk/core';

export interface Station {
  id: string;
  /** How the place is named in the page and in the recall at the door. */
  name: string;
  z: number;
  /** -1 object on the left (text right), 1 object on the right (text left), 0 centred. */
  side: number;
}

export const STATIONS: Station[] = [
  { id: 'approach', name: 'the approach', z: 16, side: 0 },
  { id: 'gate', name: 'the gate', z: 0, side: 1 },
  { id: 'fountain', name: 'the fountain', z: -18, side: -1 },
  { id: 'lanterns', name: 'the lantern grove', z: -36, side: 1 },
  { id: 'stair', name: 'the stair', z: -54, side: -1 },
  { id: 'pool', name: 'the moon pool', z: -72, side: 1 },
  { id: 'door', name: 'the door', z: -90, side: 0 },
];

/** Where each carried thing rests (stations 1 to 5). */
const ITEM_HEIGHT = [0, 4.9, 4.6, 4.3, 4.9, 3.9];

export interface World {
  /** 0 at the approach, 6 at the door, 7 risen above the palace. */
  setProgress(p: number): void;
  /** The five things to carry in; they appear as you reach their places. */
  setItems(items: string[]): void;
  /** 0..1, used by the breathing minute. */
  breathe(v: number): void;
  /** 0..1, quiet the palace behind dense reading. */
  setDim(v: number): void;
  setActive(on: boolean): void;
  /** Screen position of each carried thing, for accessible labels. */
  ready: Promise<void>;
}

const GOLD = new Color('#ffd99c');
const ROSE = new Color('#ffb7d0');
const LILAC = new Color('#c7b8ff');
const CYAN = new Color('#a9e9ff');
const PEARL = new Color('#fff4e6');

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/* ------------------------------------------------------------------ shaders */
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const SKY_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDir; uniform float uTime, uBreath, uDim, uRise;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float v = 0., a = .5; for(int i = 0; i < 5; i++){ v += a * n(p); p = p * 2.07 + 9.3; a *= .5; } return v; }
  void main(){
    // Below the horizon the sky is seen again, mirrored in the still floor.
    float below = step(vDir.y, 0.);
    float y = abs(vDir.y);
    float az = atan(vDir.x, -vDir.z);
    // Noise is sampled around a circle, not along the angle, so the sky has no seam behind you.
    vec2 ring = normalize(vDir.xz + vec2(1e-5));
    // From deep indigo overhead, through violet, to a rose and gold horizon.
    vec3 top = vec3(.025, .022, .09), mid = vec3(.09, .06, .24), hor = vec3(.62, .36, .55), gold = vec3(1., .78, .5);
    vec3 col = mix(mid, top, smoothstep(.0, .55, y));
    col = mix(col, hor, exp(-max(y, 0.) * 9.) * .75);
    col += gold * exp(-abs(y) * 26.) * .35 * (1. + .25 * sin(az * 2. + uTime * .05));
    // A milky band of stars and dust arching across the sky.
    float band = exp(-pow((y - .32 - .18 * sin(az * 1.0 + .6)), 2.) * 30.);
    float dust = fbm(ring * 1.6 + vec2(y * 6., -y * 3.) + uTime * .004);
    col += mix(LILAC_C, vec3(1., .82, .9), dust) * band * dust * .32;
    // Aurora curtains low in the sky, drifting.
    float t = uTime * .03;
    float curtain = fbm(ring * 2. + vec2(t, t * .5));
    float ay = y - .1 - curtain * .14;
    float aur = exp(-ay * ay * 140.) * smoothstep(.0, .05, y) * (.5 + .5 * fbm(ring * 7. + vec2(y * 20., -t * 3.)));
    vec3 aurCol = mix(vec3(.55, 1., .86), vec3(.78, .66, 1.), .5 + .5 * sin(az * 3. + t * 4.));
    col += aurCol * aur * .55;
    // Below the horizon: the deep, reflective dark beneath the palace.
    vec3 mirrored = col * mix(1., .5, smoothstep(.0, .05, y));
    col = mix(col, mix(mirrored, vec3(.03, .02, .07), smoothstep(.02, .4, y)), below);
    col *= (1. + uBreath * .35) * (1. - uDim * .55);
    gl_FragColor = vec4(col, 1.);
  }`.replace('LILAC_C', 'vec3(.78, .72, 1.)');

const STAR_VERT = /* glsl */ `
  attribute float aSeed; attribute float aSize; uniform float uTime, uPx; varying float vA; varying float vSeed;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.);
    gl_Position = projectionMatrix * mv;
    float tw = .55 + .45 * sin(uTime * (.6 + aSeed * 2.2) + aSeed * 60.);
    vA = tw; vSeed = aSeed;
    gl_PointSize = aSize * uPx * (.7 + tw * .5);
  }`;
const STAR_FRAG = /* glsl */ `
  precision mediump float; varying float vA; varying float vSeed; uniform float uDim;
  void main(){
    float d = length(gl_PointCoord - .5);
    float a = smoothstep(.5, .0, d); a *= a;
    vec3 c = mix(vec3(1., .92, .86), vec3(.82, .86, 1.), vSeed);
    gl_FragColor = vec4(c, a * vA * (1. - uDim * .5));
  }`;

/** Motes: slow, warm dust drifting along the walk. */
const MOTE_VERT = /* glsl */ `
  attribute float aSeed; uniform float uTime, uPx; varying float vA; varying vec3 vC;
  void main(){
    vec3 p = position;
    p.y += sin(uTime * .25 + aSeed * 40.) * .35;
    p.x += cos(uTime * .2 + aSeed * 23.) * .25;
    vec4 mv = modelViewMatrix * vec4(p, 1.);
    gl_Position = projectionMatrix * mv;
    float near = smoothstep(3., 8., -mv.z) * (1. - smoothstep(40., 70., -mv.z));
    vA = near * (.4 + .6 * sin(uTime * (1. + aSeed) + aSeed * 30.) * .5 + .3);
    vC = mix(vec3(1., .85, .62), vec3(.8, .74, 1.), fract(aSeed * 7.));
    gl_PointSize = uPx * (.9 + aSeed) * 2.6 / -mv.z;
  }`;
const MOTE_FRAG = /* glsl */ `
  precision mediump float; varying float vA; varying vec3 vC; uniform float uDim;
  void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .0, d); gl_FragColor = vec4(vC, a * a * vA * (1. - uDim * .6)); }`;

/** The fountain: drops of light thrown up and falling back, forever. */
const FOUNT_VERT = /* glsl */ `
  attribute float aSeed; attribute float aAng; uniform float uTime, uPx; varying float vA; varying vec3 vC;
  void main(){
    float life = fract(uTime * .32 + aSeed);
    float sp = 1.6 + fract(aSeed * 13.) * .9;
    vec3 p = vec3(cos(aAng) * sp * life * .9, (sp * 2.6) * life - 4.2 * life * life, sin(aAng) * sp * life * .9);
    vec4 mv = modelViewMatrix * vec4(p, 1.);
    gl_Position = projectionMatrix * mv;
    vA = smoothstep(.0, .08, life) * (1. - smoothstep(.75, 1., life)) * step(-.2, p.y);
    vC = mix(vec3(.66, .93, 1.), vec3(1., .8, .92), fract(aSeed * 5.));
    gl_PointSize = uPx * (1.2 + fract(aSeed * 3.)) * 1.6 / -mv.z;
  }`;

/** The floor: a dark mirror with fine lines of light and a glowing path. */
const FLOOR_VERT = /* glsl */ `
  varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FLOOR_FRAG = /* glsl */ `
  precision highp float; varying vec3 vW; uniform vec3 uCam; uniform float uTime, uDim;
  float line(float x, float w){ float f = abs(fract(x) - .5); return smoothstep(w, 0., .5 - f); }
  void main(){
    float dist = length(vW.xz - uCam.xz);
    float fade = exp(-dist * .035);
    float grid = max(line(vW.x / 3., .012), line(vW.z / 3., .012)) * .22;
    float path = exp(-vW.x * vW.x * .9) * (.5 + .5 * sin(vW.z * .6 - uTime * .8)) * .25 + exp(-vW.x * vW.x * 6.) * .2;
    vec3 col = vec3(.78, .72, 1.) * grid + vec3(1., .85, .6) * path;
    // Partly transparent, so the reflections beneath show through like water.
    // and fading out toward the horizon so the floor meets the sky without a seam.
    float a = (.74 - fade * .12) * smoothstep(150., 30., dist);
    gl_FragColor = vec4(col * fade * (1. - uDim * .5), a);
  }`;

const DOOR_FRAG = /* glsl */ `
  precision mediump float; varying vec2 vUv; uniform float uTime, uOpen;
  void main(){
    float edge = smoothstep(.0, .25, vUv.x) * smoothstep(1., .75, vUv.x);
    float glow = edge * (.35 + .65 * vUv.y) * (.8 + .2 * sin(uTime * 1.3 + vUv.y * 9.));
    vec3 c = mix(vec3(1., .86, .66), vec3(1., .96, .9), vUv.y);
    gl_FragColor = vec4(c, glow * (.35 + uOpen * .5));
  }`;
const UV_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;

/* ------------------------------------------------------------------ textures */
function haloTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.2, 'rgba(255,255,255,0.45)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.08)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function wordTexture(text: string, sub: string): { tex: CanvasTexture; aspect: number } {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = '600 92px "Lexend Variable", "Lexend", system-ui, sans-serif';
  const subFont = '400 40px "Lexend Variable", "Lexend", system-ui, sans-serif';
  g.font = font;
  const w = Math.max(g.measureText(text).width, (g.font = subFont, g.measureText(sub).width)) + 140;
  c.width = Math.min(2048, Math.ceil(w));
  c.height = 260;
  const ctx = c.getContext('2d')!;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font;
  ctx.shadowColor = 'rgba(255,214,160,0.95)';
  ctx.shadowBlur = 34;
  ctx.fillStyle = '#fffaf2';
  ctx.fillText(text, c.width / 2, 108);
  ctx.shadowBlur = 0;
  ctx.fillText(text, c.width / 2, 108);
  ctx.font = subFont;
  ctx.fillStyle = 'rgba(236,228,255,0.8)';
  ctx.fillText(sub, c.width / 2, 206);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return { tex: t, aspect: c.width / c.height };
}

/* ------------------------------------------------------------------ the world */
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
  renderer.setClearColor(0x07061c, 1);

  const scene = new Scene();

  const camera = new PerspectiveCamera(52, 1, 0.1, 900);
  const r = rng(1729);
  const halo = haloTexture();
  const disposables: { dispose(): void }[] = [halo];

  // The floor's reflections live in their own group, mirrored below y = 0.
  const world = new Group();
  const mirror = new Group();
  mirror.scale.y = -1;
  scene.add(mirror, world);

  const glowMats: { m: Material & { opacity: number }; base: number }[] = [];
  const lineMat = (color: Color, opacity: number) => {
    const m = new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });
    glowMats.push({ m, base: opacity });
    return m;
  };
  /** Add a luminous object, and its faint reflection in the floor. */
  const place = (o: Object3D, reflect = !lowPower) => {
    world.add(o);
    if (reflect) {
      const copy = o.clone(true);
      copy.traverse((c) => {
        const mesh = c as Mesh;
        if (mesh.material && !Array.isArray(mesh.material)) {
          const mm = (mesh.material as Material).clone() as Material & { opacity?: number };
          if (mm.opacity !== undefined) mm.opacity *= 0.28;
          mesh.material = mm;
        }
      });
      mirror.add(copy);
    }
    return o;
  };
  const sprite = (color: Color, scale: number, opacity: number) => {
    const m = new SpriteMaterial({ map: halo, color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });
    glowMats.push({ m, base: opacity });
    const s = new Sprite(m);
    s.scale.set(scale, scale, 1);
    return s;
  };

  /* ---------- sky */
  const skyMat = new ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: BackSide, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uBreath: { value: 0 }, uDim: { value: 0 }, uRise: { value: 0 } } });
  const sky = new Mesh(new SphereGeometry(500, 48, 32), skyMat);
  scene.add(sky);

  const starCount = lowPower ? 1400 : 4200;
  const sp = new Float32Array(starCount * 3), ss = new Float32Array(starCount), sz = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2;
    const y = Math.abs(u) * 0.96 + 0.04;
    const rr = Math.sqrt(1 - y * y);
    sp.set([Math.cos(th) * rr * 420, y * 420, Math.sin(th) * rr * 420], i * 3);
    ss[i] = r();
    sz[i] = r() < 0.03 ? 3.2 : 0.8 + r() * 1.3;
  }
  const starGeo = new BufferGeometry();
  starGeo.setAttribute('position', new Float32BufferAttribute(sp, 3));
  starGeo.setAttribute('aSeed', new Float32BufferAttribute(ss, 1));
  starGeo.setAttribute('aSize', new Float32BufferAttribute(sz, 1));
  const starMat = new ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uDim: { value: 0 } } });
  const stars = new Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);

  // A far, pale moon low over the horizon at the end of the walk.
  const moon = sprite(PEARL, 70, 0.55);
  moon.position.set(-60, 55, -380);
  scene.add(moon);
  // A soft core of light rather than a solid ball, so it reads as a glow, not a disc.
  const moonCore = sprite(PEARL, 22, 0.95);
  moonCore.position.copy(moon.position);
  scene.add(moonCore);

  /* ---------- floor */
  const floorMat = new ShaderMaterial({ vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, transparent: true, depthWrite: false,
    uniforms: { uCam: { value: new Vector3() }, uTime: { value: 0 }, uDim: { value: 0 } } });
  const floor = new Mesh(new PlaneGeometry(600, 600), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.renderOrder = 1;
  scene.add(floor);

  /* ---------- the colonnade: arches of light the length of the walk */
  const archMat = lineMat(GOLD, 0.55);
  const pillarMat = lineMat(PEARL, 0.5);
  const archGeo = new TorusGeometry(5.2, 0.035, 6, 72, Math.PI);
  const pillarGeo = new CylinderGeometry(0.035, 0.035, 6.5, 6);
  disposables.push(archGeo, pillarGeo);
  for (let z = 12; z >= -100; z -= 9) {
    const g = new Group();
    const arch = new Mesh(archGeo, archMat);
    arch.position.set(0, 6.5, 0);
    g.add(arch);
    for (const x of [-5.2, 5.2]) {
      const p = new Mesh(pillarGeo, pillarMat);
      p.position.set(x, 3.25, 0);
      g.add(p);
      const cap = sprite(GOLD, 1.1, 0.7);
      cap.position.set(x, 6.5, 0);
      g.add(cap);
    }
    const key = sprite(PEARL, 1.6, 0.6);
    key.position.set(0, 11.7, 0);
    g.add(key);
    g.position.z = z;
    place(g);
  }

  /* ---------- the places */
  const stationGroups: Group[] = [];
  const at = (i: number) => {
    const s = STATIONS[i];
    const g = new Group();
    g.position.set(s.side * 1.9, 0, s.z);
    stationGroups[i] = g;
    return g;
  };

  // 1 The gate: two concentric arches of light, a keystone that rings like a bell.
  {
    const g = at(1);
    for (const [rad, col, op] of [[2.4, GOLD, 0.9], [2.85, ROSE, 0.6]] as const) {
      const a = new Mesh(new TorusGeometry(rad, 0.05, 8, 80, Math.PI), lineMat(col, op));
      a.position.y = 2.6;
      g.add(a);
      for (const x of [-rad, rad]) {
        const p = new Mesh(new CylinderGeometry(0.05, 0.05, 2.6, 8), lineMat(col, op));
        p.position.set(x, 1.3, 0);
        g.add(p);
      }
    }
    const key = sprite(GOLD, 2.6, 0.95);
    key.position.y = 5.5;
    g.add(key);
    place(g);
  }
  // 2 The fountain: a ring of light and a plume of falling drops.
  const fountainUniforms = { uTime: { value: 0 }, uPx: { value: 1 } };
  {
    const g = at(2);
    for (const [rad, h] of [[1.7, 0.05], [1.2, 0.5]] as const) {
      const ring = new Mesh(new TorusGeometry(rad, 0.045, 8, 80), lineMat(CYAN, 0.85));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = h;
      g.add(ring);
    }
    const n = lowPower ? 500 : 1600;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n), ang = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      seed[i] = r();
      ang[i] = r() * Math.PI * 2;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));
    geo.setAttribute('aAng', new Float32BufferAttribute(ang, 1));
    const m = new ShaderMaterial({ vertexShader: FOUNT_VERT, fragmentShader: MOTE_FRAG.replace('uniform float uDim;', 'uniform float uDim;'), transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { ...fountainUniforms, uDim: { value: 0 } } });
    const plume = new Points(geo, m);
    plume.position.y = 0.5;
    plume.frustumCulled = false;
    g.add(plume);
    const glow = sprite(CYAN, 5, 0.35);
    glow.position.y = 1.6;
    g.add(glow);
    place(g, false);
  }
  // 3 The lantern grove: three slender trees hung with warm lanterns.
  const lanterns: Sprite[] = [];
  {
    const g = at(3);
    const trunkMat = lineMat(LILAC, 0.55);
    for (const [x, z, h] of [[-1.4, 0.4, 4.2], [0.2, -0.6, 5], [1.5, 0.5, 3.8]] as const) {
      const trunk = new Mesh(new CylinderGeometry(0.03, 0.05, h, 6), trunkMat);
      trunk.position.set(x, h / 2, z);
      g.add(trunk);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + x;
        const l = sprite(k % 3 === 0 ? ROSE : GOLD, 0.55 + r() * 0.3, 0.95);
        l.position.set(x + Math.cos(a) * (0.5 + r() * 0.5), h - 0.3 - r() * 1.6, z + Math.sin(a) * (0.5 + r() * 0.4));
        l.userData.base = l.position.y;
        l.userData.seed = r() * 10;
        lanterns.push(l);
        g.add(l);
      }
    }
    place(g);
  }
  // 4 The stair: floating steps of light spiralling up into the air.
  {
    const g = at(4);
    const stepGeo = new BoxGeometry(1.5, 0.08, 0.6);
    const edges = new EdgesGeometry(stepGeo);
    const edgeMat = new LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false });
    glowMats.push({ m: edgeMat, base: 0.85 });
    const fillMat = lineMat(LILAC, 0.12);
    for (let k = 0; k < 11; k++) {
      const a = k * 0.42;
      const step = new Group();
      step.add(new Mesh(stepGeo, fillMat), new LineSegments(edges, edgeMat));
      step.position.set(Math.cos(a) * 1.3, 0.3 + k * 0.42, Math.sin(a) * 1.3);
      step.rotation.y = -a;
      g.add(step);
    }
    const top = sprite(GOLD, 2.2, 0.8);
    top.position.set(Math.cos(4.2) * 1.3, 5.1, Math.sin(4.2) * 1.3);
    g.add(top);
    place(g);
  }
  // 5 The moon pool: a still disc of water under a small, low moon.
  let poolMoon: Sprite;
  {
    const g = at(5);
    const water = new Mesh(new CircleGeometry(2.1, 64), lineMat(LILAC, 0.16));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.04;
    g.add(water);
    const rim = new Mesh(new TorusGeometry(2.1, 0.04, 8, 96), lineMat(PEARL, 0.8));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.05;
    g.add(rim);
    // A small moon made of light: a bright soft core, never a solid disc.
    poolMoon = sprite(PEARL, 2.2, 1);
    poolMoon.position.y = 2.6;
    g.add(poolMoon);
    const mg = sprite(PEARL, 4.5, 0.6);
    mg.position.y = 2.6;
    g.add(mg);
    place(g);
  }
  // 6 The door: a tall frame of light, open a crack, with warm light pouring through.
  const doorUniforms = { uTime: { value: 0 }, uOpen: { value: 0 } };
  {
    const g = at(6);
    const frame = new Mesh(new BoxGeometry(2.4, 4.4, 0.05), lineMat(GOLD, 0.06));
    frame.position.y = 2.2;
    const edgeMat = new LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false });
    glowMats.push({ m: edgeMat, base: 0.95 });
    const outline = new LineSegments(new EdgesGeometry(new BoxGeometry(2.4, 4.4, 0.05)), edgeMat);
    outline.position.y = 2.2;
    const lightMat = new ShaderMaterial({ vertexShader: UV_VERT, fragmentShader: DOOR_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending, uniforms: doorUniforms });
    const light = new Mesh(new PlaneGeometry(2.3, 4.3), lightMat);
    light.position.set(0, 2.2, 0.03);
    const spill = sprite(GOLD, 9, 0.45);
    spill.position.set(0, 2.2, 0.5);
    g.add(frame, outline, light, spill);
    place(g);
  }

  /* ---------- motes along the walk */
  let moteMat!: ShaderMaterial;
  {
    const n = lowPower ? 500 : 1500;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos.set([(r() * 2 - 1) * 9, 0.3 + r() * 8, 22 - r() * 120], i * 3);
      seed[i] = r();
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));
    const m = new ShaderMaterial({ vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uDim: { value: 0 } } });
    const motes = new Points(geo, m);
    motes.frustumCulled = false;
    scene.add(motes);
    disposables.push(geo, m);
    moteMat = m;
  }

  /* ---------- the things you carry in */
  const items: { s: Sprite; glow: Sprite; t: number; shown: boolean }[] = [];
  const itemGroup = new Group();
  world.add(itemGroup);
  const setItems = (list: string[]) => {
    for (const it of items) {
      (it.s.material as SpriteMaterial).map?.dispose();
      itemGroup.remove(it.s, it.glow);
    }
    items.length = 0;
    list.slice(0, 5).forEach((text, i) => {
      const st = STATIONS[i + 1];
      const { tex, aspect } = wordTexture(text, `rests at ${st.name}`);
      const s = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
      const h = 0.9;
      s.scale.set(h * aspect, h, 1);
      s.position.set(st.side * 1.9, ITEM_HEIGHT[i + 1], st.z + 0.6);
      const glow = sprite(GOLD, 2.4, 0);
      glow.position.copy(s.position);
      itemGroup.add(glow, s);
      items.push({ s, glow, t: 0, shown: false });
    });
  };

  /* ---------- the walk */
  const camKeys: Vector3[] = [];
  const lookKeys: Vector3[] = [];
  STATIONS.forEach((s, i) => {
    const x = s.side * 1.9;
    if (i === 0) {
      camKeys.push(new Vector3(0, 2.4, s.z + 10));
      lookKeys.push(new Vector3(0, 4.2, 0));
    } else {
      // Stand a little off to one side, so the place sits beside the words.
      camKeys.push(new Vector3(-s.side * 1.1, 2.3, s.z + 8.6));
      lookKeys.push(new Vector3(x - s.side * 0.4, 2.7, s.z));
    }
  });
  // Rising above the palace at the end, to look back over the whole walk.
  camKeys.push(new Vector3(9, 30, -118));
  lookKeys.push(new Vector3(0, 0, -45));
  const camCurve = new CatmullRomCurve3(camKeys, false, 'centripetal', 0.5);
  const lookCurve = new CatmullRomCurve3(lookKeys, false, 'centripetal', 0.5);
  const last = camKeys.length - 1;

  let target = 0, cur = 0, dim = 0, dimT = 0, breath = 0, breathT = 0;
  const mouse = new Vector2();
  const camPos = new Vector3(), look = new Vector3();
  let active = true, raf = 0, prev = performance.now(), time = 0;

  const onMove = (e: PointerEvent) => mouse.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  window.addEventListener('pointermove', onMove, { passive: true });

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Narrow screens stand further back so each place still fits.
    camera.fov = w / h < 0.8 ? 68 : 52;
    camera.updateProjectionMatrix();
    const px = h * renderer.getPixelRatio();
    starMat.uniforms.uPx.value = px / 900;
    moteMat.uniforms.uPx.value = px * 0.012;
    fountainUniforms.uPx.value = px * 0.012;
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

    // Ease the walk; a reduced-motion visitor arrives straight away.
    cur = calm ? target : cur + (target - cur) * Math.min(1, dt * 2.2);
    dim += (dimT - dim) * Math.min(1, dt * 3);
    breath += (breathT - breath) * Math.min(1, dt * 2.5);

    const u = Math.max(0, Math.min(1, cur / last));
    camCurve.getPointAt(u, camPos);
    lookCurve.getPointAt(u, look);
    // A gentle breath of movement, and a little parallax under the pointer.
    const sway = calm ? 0 : 1;
    camPos.x += (mouse.x * 0.45 + Math.sin(time * 0.21) * 0.12) * sway;
    camPos.y += (-mouse.y * 0.25 + Math.sin(time * 0.33) * 0.06) * sway;
    camera.position.copy(camPos);
    camera.lookAt(look);

    skyMat.uniforms.uTime.value = time;
    skyMat.uniforms.uBreath.value = breath;
    skyMat.uniforms.uDim.value = dim;
    starMat.uniforms.uTime.value = time;
    starMat.uniforms.uDim.value = dim;
    moteMat.uniforms.uTime.value = time;
    moteMat.uniforms.uDim.value = dim;
    floorMat.uniforms.uTime.value = time;
    floorMat.uniforms.uDim.value = dim;
    (floorMat.uniforms.uCam.value as Vector3).copy(camPos);
    fountainUniforms.uTime.value = time;
    doorUniforms.uTime.value = time;
    doorUniforms.uOpen.value = smooth(Math.max(0, Math.min(1, cur - 5.3)));
    const glowK = (1 - dim * 0.55) * (1 + breath * 0.4);
    for (const g of glowMats) g.m.opacity = g.base * glowK;
    for (const l of lanterns) l.position.y = (l.userData.base as number) + (calm ? 0 : Math.sin(time * 0.9 + (l.userData.seed as number)) * 0.06);
    poolMoon.position.y = 2.6 + (calm ? 0 : Math.sin(time * 0.5) * 0.12) + breath * 0.3;

    // Each thing you carried in appears as you reach its place, and stays.
    items.forEach((it, i) => {
      if (!it.shown && cur > i + 1 - 0.45) it.shown = true;
      it.t = Math.min(1, it.t + (it.shown ? dt / 1.4 : -dt));
      const e = smooth(Math.max(0, it.t));
      const m = it.s.material as SpriteMaterial;
      m.opacity = e * (1 - dim * 0.4);
      (it.glow.material as SpriteMaterial).opacity = e * 0.55 * (1 - dim * 0.5);
      const bob = calm ? 0 : Math.sin(time * 0.8 + i) * 0.08;
      it.s.position.y = ITEM_HEIGHT[i + 1] + bob + (1 - e) * 1.2;
      it.glow.position.y = it.s.position.y;
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
