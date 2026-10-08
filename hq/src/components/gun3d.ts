import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * 3D guns for the Gunsmith. Each gun class is modelled in code (receiver, barrel, stock, grip,
 * mag…) and every fitted part is added on top, its look read from its name: "Tan" is tan,
 * "ACOG" is a prism scope, "Suppressor" a can, "Drum" a drum mag. Free CC0 models dropped in
 * public/models/guns/ (see the README there) replace the code-built body automatically.
 */

export interface GunSpec {
  weaponId: string;
  name: string;
  cls: string;
  /** slot id → the fitted part's name */
  parts: Record<string, string>;
}

// ---------- materials & textures ----------

const tex = new Map<string, THREE.Texture>();
function canvasTex(key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  if (tex.has(key)) return tex.get(key)!;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  tex.set(key, t);
  return t;
}
/** A seeded random, so the wood grain is the same on every render. */
function rng(seed: number) {
  let s = seed || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const woodGrain = (base: string, dark: string, key: string) =>
  canvasTex(key, 512, 256, (g) => {
    const r = rng(7);
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 140; i++) {
      g.strokeStyle = dark;
      g.globalAlpha = 0.08 + r() * 0.18;
      g.lineWidth = 0.6 + r() * 2.2;
      const y = r() * 256;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x / 60 + i) * 3 + (r() - 0.5) * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  });
const benchTex = () =>
  canvasTex(
    'bench',
    1024,
    512,
    (g) => {
      const r = rng(3);
      for (let p = 0; p < 6; p++) {
        const y = p * (512 / 6);
        const hue = 22 + r() * 6;
        g.fillStyle = `hsl(${hue} 42% ${17 + r() * 5}%)`;
        g.fillRect(0, y, 1024, 512 / 6);
        for (let i = 0; i < 60; i++) {
          g.strokeStyle = `hsla(${hue} 50% 8% / ${0.1 + r() * 0.25})`;
          g.lineWidth = 0.5 + r() * 2;
          const yy = y + r() * (512 / 6);
          g.beginPath();
          g.moveTo(0, yy);
          for (let x = 0; x <= 1024; x += 64) g.lineTo(x, yy + Math.sin(x / 90 + i) * 2.5);
          g.stroke();
        }
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(0, y, 1024, 3);
      }
      // A few worn rings and scuffs.
      for (let i = 0; i < 6; i++) {
        g.strokeStyle = `rgba(0,0,0,${0.12 + r() * 0.1})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(r() * 1024, r() * 512, 18 + r() * 30, 0, Math.PI * 2);
        g.stroke();
      }
    },
    [2, 2],
  );
const pegTex = () =>
  canvasTex(
    'peg',
    512,
    512,
    (g) => {
      g.fillStyle = '#2a241d';
      g.fillRect(0, 0, 512, 512);
      for (let y = 16; y < 512; y += 32)
        for (let x = 16; x < 512; x += 32) {
          g.fillStyle = '#0d0b09';
          g.beginPath();
          g.arc(x, y, 5, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(255,220,170,0.06)';
          g.beginPath();
          g.arc(x + 1, y + 1.5, 5, 0, Math.PI);
          g.fill();
        }
    },
    [4, 2],
  );

/** A part's colour and finish, read from its name. */
function finishOf(name = '') {
  const n = name.toLowerCase();
  if (/wood|walnut/.test(n)) return { wood: true } as const;
  if (/silver|chrome|stainless|nickel/.test(n)) return { color: '#c9ccd2', metal: true } as const;
  if (/light tan|peach/.test(n)) return { color: '#cdb38c' } as const;
  if (/dark tan|fde|coyote/.test(n)) return { color: '#8f7656' } as const;
  if (/tan|sand/.test(n)) return { color: '#ad9470' } as const;
  if (/olive|od green|green|ghillie/.test(n)) return { color: '#4f5a33' } as const;
  if (/light blue/.test(n)) return { color: '#7ea6cf' } as const;
  if (/blue/.test(n)) return { color: '#2c4a78' } as const;
  if (/orange/.test(n)) return { color: '#d4782c' } as const;
  if (/brown/.test(n)) return { color: '#5e4128' } as const;
  if (/gray|grey/.test(n)) return { color: '#5b5e64' } as const;
  return {} as const;
}

type Mats = ReturnType<typeof makeMats>;
function makeMats() {
  const steel = (c = '#34373c', rough = 0.34) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.85, roughness: rough, envMapIntensity: 1.1 });
  const poly = (c = '#1c1d20') => new THREE.MeshStandardMaterial({ color: c, metalness: 0.12, roughness: 0.62, envMapIntensity: 0.8 });
  const wood = () => new THREE.MeshStandardMaterial({ map: woodGrain('#6e3f1f', '#2a1406', 'gunwood'), metalness: 0.05, roughness: 0.45 });
  return {
    steel,
    poly,
    wood,
    dark: () => new THREE.MeshStandardMaterial({ color: '#0b0b0c', metalness: 0.4, roughness: 0.7 }),
    glass: () => new THREE.MeshPhysicalMaterial({ color: '#3d7ea6', metalness: 0.2, roughness: 0.04, clearcoat: 1, emissive: '#0b2a3a', envMapIntensity: 1.6 }),
    lens: () => new THREE.MeshStandardMaterial({ color: '#fff6dd', emissive: '#fff1c4', emissiveIntensity: 1.4 }),
    red: () => new THREE.MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff1a1a', emissiveIntensity: 2 }),
    brass: () => new THREE.MeshStandardMaterial({ color: '#c99a3c', metalness: 1, roughness: 0.3 }),
    /** A part in the colour its name says, else black polymer. */
    of: (name: string | undefined, fallback: 'poly' | 'steel' | 'wood' = 'poly') => {
      const f = finishOf(name);
      if ('wood' in f) return wood();
      if ('metal' in f) return steel(f.color, 0.22);
      if ('color' in f) return poly(f.color);
      return fallback === 'wood' ? wood() : fallback === 'steel' ? steel() : poly();
    },
  };
}

// ---------- geometry helpers ----------

type P = [number, number];
function prism(pts: P[], depth: number, mat: THREE.Material, bevel = 0.3) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return new THREE.Mesh(g, mat);
}
/** A rod along X starting at x = 0 (r2 is the far end's radius). */
function rod(r: number, len: number, mat: THREE.Material, r2 = r, seg = 24) {
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  g.rotateZ(-Math.PI / 2);
  g.translate(len / 2, 0, 0);
  return new THREE.Mesh(g, mat);
}
function box(w: number, h: number, d: number, mat: THREE.Material, radius = 0.35) {
  const r = Math.min(radius, w / 2.2, h / 2.2, d / 2.2);
  return new THREE.Mesh(r > 0.05 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d), mat);
}
function at<T extends THREE.Object3D>(o: T, x: number, y: number, z = 0): T {
  o.position.set(x, y, z);
  return o;
}
/** Picatinny rail: a flat base with a row of teeth. */
function rail(len: number, m: Mats) {
  const g = new THREE.Group();
  g.add(at(box(len, 0.7, 2.1, m.steel('#1f2023'), 0.1), len / 2, 0));
  for (let x = 0.6; x < len - 0.3; x += 1.2) g.add(at(box(0.55, 0.55, 2.4, m.steel('#232428'), 0.08), x, 0.55));
  return g;
}
const has = (re: RegExp, s?: string) => !!s && re.test(s.toLowerCase());

// ---------- the parts ----------

/** Sights sit on top of the gun at (x, y). */
function sight(name: string, x: number, y: number, m: Mats, small = false) {
  const g = new THREE.Group();
  const body = m.of(name);
  if (has(/iron|sights?( up| down)?$/, name)) {
    g.add(at(box(1.4, 2.2, 1.6, body, 0.2), x - 8, y + 1.1), at(box(1, 2.6, 1, body, 0.2), x + 14, y + 1.3));
    return g;
  }
  if (small) {
    // A mini red dot on a pistol slide.
    g.add(at(box(3.2, 1.2, 2.2, body), x, y + 0.6), at(box(0.6, 2, 2.2, body, 0.2), x - 1.3, y + 1.8), at(box(0.5, 1.6, 2.2, body, 0.2), x + 1.4, y + 1.6));
    g.add(at(box(0.15, 1.4, 1.8, m.glass(), 0.02), x + 1.1, y + 1.8), at(new THREE.Mesh(new THREE.SphereGeometry(0.12), m.red()), x - 1.1, y + 1.7));
    return g;
  }
  if (has(/\d+-\d+x|scope|mark 4|march|razor|vudu|atacr|s33|6-24|4-24/, name)) {
    const t = m.steel('#17181b', 0.3);
    const ty = y + 4.6;
    g.add(at(rod(1.3, 14, t), x - 7, ty), at(rod(1.3, 5, t, 2.3), x + 7, ty), at(rod(2.3, 1.2, t), x + 12, ty), at(rod(1.9, 4, t, 1.3), x - 11, ty));
    g.add(at(new THREE.Mesh(new THREE.CircleGeometry(2.05, 32).rotateY(Math.PI / 2), m.glass()), x + 13.25, ty));
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.2, 18), t), x, ty + 1.6), at(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.2, 18).rotateX(Math.PI / 2), t), x, ty, 1.6));
    for (const dx of [-5, 5]) {
      g.add(at(new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.35, 10, 24).rotateY(Math.PI / 2), m.steel()), x + dx, ty));
      g.add(at(box(1.4, ty - y - 1.2, 1.6, m.steel(), 0.15), x + dx, y + (ty - y - 1.2) / 2));
    }
    return g;
  }
  if (has(/acog|ta0|hamr|elcan|spect|s?pectar/, name)) {
    const ty = y + 2.6;
    g.add(at(box(8, 3, 3, body, 0.6), x, ty), at(rod(1.8, 2.4, body), x + 3.6, ty), at(rod(1.3, 1.6, body), x - 5.6, ty), at(box(2, 1.2, 2.4, m.steel()), x, y + 0.6));
    g.add(at(rod(0.25, 6, m.red()), x - 3, ty + 1.7), at(new THREE.Mesh(new THREE.CircleGeometry(1.7, 24).rotateY(Math.PI / 2), m.glass()), x + 6.05, ty));
    return g;
  }
  if (has(/holo|exps|uh-1|553|512|554|hs40|eotech|amg/, name)) {
    g.add(at(box(7, 1.2, 3.4, body, 0.3), x, y + 0.6), at(box(1.2, 4, 3.4, body, 0.3), x + 2.9, y + 2.6), at(box(1.6, 4, 3.4, body, 0.3), x - 2.9, y + 2.6), at(box(7, 0.8, 3.4, body, 0.3), x, y + 4.4));
    g.add(at(box(0.15, 2.6, 2.6, m.glass(), 0.02), x + 2.1, y + 2.6), at(new THREE.Mesh(new THREE.SphereGeometry(0.14), m.red()), x, y + 2.6));
    if (has(/g33|g45|magnif/, name)) g.add(at(rod(1.3, 6, body), x - 11, y + 2.6), at(box(2, 1.6, 2.2, m.steel()), x - 8, y + 0.8));
    return g;
  }
  // A tube red dot (T-1, MRO, Romeo, LCO…).
  const ty = y + 2.4;
  g.add(at(box(4.4, 1.3, 2.4, m.steel()), x, y + 0.65), at(rod(1.5, 5, body), x - 2.5, ty), at(new THREE.Mesh(new THREE.CircleGeometry(1.25, 24).rotateY(Math.PI / 2), m.glass()), x + 2.55, ty));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 14), body), x, ty + 1.6), at(new THREE.Mesh(new THREE.SphereGeometry(0.12), m.red()), x - 1, ty));
  return g;
}

function muzzle(name: string, x: number, y: number, r: number, m: Mats) {
  const g = new THREE.Group();
  const mat = m.of(name, 'steel');
  if (has(/suppress|silenc|can\b/, name)) {
    g.add(at(rod(r * 2.1, 15, mat), x, y), at(rod(r * 2.1, 0.7, m.steel('#3a3c40')), x + 14.3, y), at(rod(r * 2.15, 0.6, m.steel('#3a3c40')), x, y));
  } else if (has(/break|brake|comp|jet/, name)) {
    g.add(at(box(4.4, r * 2.6, r * 2.6, mat, 0.3), x + 2.2, y));
    for (const dx of [1, 2.2, 3.4]) g.add(at(box(0.5, r * 2.62, r * 1.6, m.dark(), 0.05), x + dx, y));
  } else if (has(/cap/, name)) {
    g.add(at(rod(r * 1.15, 1.2, mat), x, y));
  } else {
    // A birdcage flash hider.
    g.add(at(rod(r * 1.35, 3.4, mat), x, y));
    for (let i = 0; i < 4; i++) {
      const s = at(box(2.2, 0.35, r * 2.75, m.dark(), 0.05), x + 1.9, y);
      s.rotation.x = (i * Math.PI) / 4;
      g.add(s);
    }
  }
  return g;
}

function magazine(name: string | undefined, kind: 'curved' | 'straight' | 'pistol' | 'box', x: number, y: number, m: Mats) {
  const g = new THREE.Group();
  const mat = m.of(name);
  const long = has(/extend|ext\b|60|drum|33|40/, name) ? 1.45 : 1;
  if (has(/drum|60rd/, name)) {
    g.add(at(box(4.6, 4, 3, mat, 0.4), x + 2.5, y - 2));
    const d = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 4.6, 36), mat);
    d.rotation.x = Math.PI / 2;
    g.add(at(d, x + 3, y - 9.5));
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 4.9, 20).rotateX(Math.PI / 2), m.steel()), x + 3, y - 9.5));
    return g;
  }
  if (kind === 'curved') {
    const s = new THREE.Shape();
    const L = 11 * long;
    s.moveTo(x, y);
    s.lineTo(x + 5.4, y);
    s.quadraticCurveTo(x + 6.6, y - L * 0.6, x + 9 + long * 2, y - L);
    s.lineTo(x + 3.6 + long * 2, y - L - 0.8);
    s.quadraticCurveTo(x + 1.2, y - L * 0.6, x, y);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 2.6, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.35, bevelSegments: 2, curveSegments: 16 });
    geo.translate(0, 0, -1.3);
    g.add(new THREE.Mesh(geo, mat));
    for (let i = 1; i < 4; i++) g.add(at(box(0.25, 0.25, 3.3, m.dark(), 0.05), x + 2.2 + i * 0.9 * long, y - (L * i) / 4.6));
    return g;
  }
  if (kind === 'pistol') {
    if (long > 1) g.add(at(box(3.4, 4.4, 2.6, mat, 0.4), x, y - 2.2));
    g.add(at(box(3.8, 0.9, 3, mat, 0.3), x - 0.3, y - (long > 1 ? 4.6 : 0.4)));
    return g;
  }
  const L = (kind === 'box' ? 6 : 10) * long;
  const mag = prism(
    [
      [x, y],
      [x + 4.6, y],
      [x + 5.4, y - L],
      [x + 0.8, y - L],
    ],
    2.5,
    mat,
    0.3,
  );
  g.add(mag, at(box(5.4, 0.9, 3.2, m.poly('#151517'), 0.3), x + 3.1, y - L - 0.2));
  return g;
}

function light(name: string, x: number, y: number, z: number, m: Mats) {
  const g = new THREE.Group();
  const mat = m.of(name);
  if (has(/peq|atpial|dbal|laser|las\b|las\/|go2|po5|2irs|ls221|cqb/, name)) {
    g.add(at(box(7, 2.8, 3.2, mat, 0.5), x, y));
    g.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.55, 18).rotateY(Math.PI / 2), m.red()), x + 3.55, y + 0.5, 0.7), at(new THREE.Mesh(new THREE.CircleGeometry(0.75, 18).rotateY(Math.PI / 2), m.lens()), x + 3.55, y - 0.4, -0.6));
    return g;
  }
  g.add(at(box(2.6, 1.4, 2.4, m.steel()), x, y + 0.9, z * 0.5), at(rod(1.05, 6.5, mat), x - 2.5, y, z), at(rod(1.3, 1.4, mat), x + 4, y, z));
  g.add(at(new THREE.Mesh(new THREE.CircleGeometry(1.15, 24).rotateY(Math.PI / 2), m.lens()), x + 5.45, y, z));
  return g;
}

function foregrip(name: string, x: number, y: number, m: Mats) {
  const g = new THREE.Group();
  const mat = m.of(name);
  if (has(/angl|afg/, name))
    g.add(
      prism(
        [
          [x - 4, y],
          [x + 3, y],
          [x - 2.4, y - 3.6],
          [x - 4.2, y - 3.2],
        ],
        2.4,
        mat,
        0.35,
      ),
    );
  else {
    const h = has(/stubby|chub|pm007|proclip|stub/, name) ? 3.4 : 7;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, h, 20), mat);
    g.add(at(c, x, y - h / 2), at(box(3, 0.9, 2.2, m.steel()), x, y - 0.3));
  }
  return g;
}

/** A long gun's stock, its butt at x = 0, meeting the receiver at x0. */
function stock(name: string | undefined, style: 'fixed' | 'adjustable' | 'precision' | 'fold' | 'wood', x0: number, m: Mats) {
  const g = new THREE.Group();
  let s = style;
  if (name) {
    if (has(/ccs|thril|slim|416|moe|carbine|e-1|emod|sga|crane|collapsible|\din/, name)) s = 'adjustable';
    else if (has(/lr308|aics|precision|archangel|ghillie|sniper|om /, name)) s = 'precision';
    else if (has(/goliaf|messa|tact|fold|brace|glr/, name)) s = 'fold';
    else if (has(/wood/, name)) s = 'wood';
  }
  const mat = s === 'wood' ? m.wood() : m.of(name);
  if (s === 'adjustable') {
    g.add(at(rod(1.25, x0 - 6, m.steel('#1e1f22')), 6, 1));
    g.add(
      prism(
        [
          [0, 3.4],
          [12, 3.4],
          [12, -0.6],
          [6, -2],
          [1.5, -8.6],
          [0, -8.6],
        ],
        3.6,
        mat,
        0.5,
      ),
    );
    g.add(at(box(0.9, 12, 3.9, m.poly('#101012'), 0.3), 0.4, -2.6));
  } else if (s === 'precision') {
    g.add(
      prism(
        [
          [-2, 4.4],
          [x0, 3],
          [x0, -3.4],
          [x0 - 10, -5.4],
          [6, -5.4],
          [3, -10.2],
          [-2, -10.2],
        ],
        3.8,
        mat,
        0.5,
      ),
    );
    g.add(at(box(10, 1.6, 3.4, mat, 0.4), 6, 5.4), at(rod(0.4, 2.6, m.steel()), 5, 4.4));
  } else if (s === 'fold') {
    const w = m.steel('#202124');
    g.add(at(rod(0.55, x0 - 1, w), 1, 2.6), at(rod(0.55, x0 - 1, w), 1, -2.2));
    const butt = box(1.2, 8.4, 3.2, m.poly(), 0.4);
    g.add(at(butt, 1, 0.2));
  } else {
    g.add(
      prism(
        [
          [0, 3.6],
          [x0, 3],
          [x0, -2.8],
          [x0 - 14, -5.2],
          [1.2, -10],
          [0, -10],
        ],
        3.8,
        mat,
        0.6,
      ),
    );
    g.add(at(box(1, 13.6, 4.2, m.poly('#0f0f10'), 0.35), 0.2, -3.2));
  }
  return g;
}

// ---------- the guns ----------

type Kind = 'rifle' | 'smg' | 'shotgun' | 'sniper' | 'pistol' | 'revolver' | 'double';
function kindOfGun(spec: GunSpec): Kind {
  const n = spec.name.toLowerCase();
  if (/revolver|44mag|navy|double action/.test(n) || 'cylinder' in spec.parts) return 'revolver';
  if (/double barrel|sawn|musket/.test(n)) return 'double';
  if (['rifle', 'smg', 'shotgun', 'sniper', 'pistol'].includes(spec.cls)) return spec.cls as Kind;
  return 'rifle';
}

/** One slot's pieces, tagged so a tap on them picks the slot and the bench can light them up. */
function tagged(slot: string, fitted: boolean, ...objs: THREE.Object3D[]) {
  const g = new THREE.Group();
  g.userData = { slot, fitted };
  objs.forEach((o) => g.add(o));
  return g;
}

function longGun(spec: GunSpec, kind: Kind, m: Mats) {
  const p = spec.parts;
  const n = spec.name.toLowerCase();
  const wooden = /musket|\bak|ka-74|pump shotgun$|double|sawn|vintage|mosin/.test(n) && !/mk ii/.test(n);
  const bullpup = /bullpup/.test(n);
  const D = {
    rifle: { st: 30, rl: 32, hg: 18, bl: 30, br: 0.75, mag: 'curved' as const },
    smg: { st: 22, rl: 24, hg: 10, bl: 18, br: 0.7, mag: 'straight' as const },
    shotgun: { st: 30, rl: 26, hg: 0, bl: 44, br: 1.05, mag: 'box' as const },
    sniper: { st: 32, rl: 32, hg: 0, bl: 50, br: 1.0, mag: 'box' as const },
    double: { st: 30, rl: 18, hg: 0, bl: 46, br: 1.1, mag: 'box' as const },
  }[kind as 'rifle'];
  const x0 = bullpup ? 6 : D.st; // where the receiver starts
  const x1 = x0 + D.rl;
  const hgEnd = x1 + (p.handguard ? D.hg + 8 : D.hg);
  const barrelLen = D.bl * (p.barrel ? (has(/short|sbr|10in|11in/, p.barrel) ? 0.8 : 1.25) : 1);
  const bx = x1 + barrelLen; // muzzle
  const g = new THREE.Group();
  const frameMat = m.of(p.frame, wooden && kind !== 'rifle' ? 'steel' : 'steel');
  const furniture = (name?: string) => (wooden && !name ? m.wood() : m.of(name));

  // Receiver: upper and lower.
  const upper = at(box(D.rl, 5, 4.6, m.steel('#26282c'), 0.6), x0 + D.rl / 2, 1.5);
  const lower = prism(
    [
      [x0 + 2, -1],
      [x1 - 2, -1],
      [x1 - 2, -4],
      [x1 - 7, -6.5],
      [x0 + 4, -6.5],
      [x0 + 2, -4],
    ],
    4.2,
    frameMat,
    0.3,
  );
  g.add(tagged('frame', !!p.frame, upper, lower));
  if (kind === 'sniper' || kind === 'shotgun') {
    // Bolt handle / ejection port.
    if (kind === 'sniper') g.add(at(rod(0.35, 3.6, m.steel('#3b3d42')), x0 + 8, 1.5, 2.3), at(new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), m.steel('#3b3d42')), x0 + 11.8, 1.3, 3.4));
    g.add(at(box(6, 1.6, 0.3, m.dark(), 0.05), x0 + D.rl / 2, 2, 2.35));
  } else g.add(at(box(7, 1.8, 0.3, m.dark(), 0.05), x0 + D.rl * 0.55, 1.8, 2.35), at(rod(0.4, 2.4, m.steel('#3b3d42')), x0 + 2, 3.2, 1.6));

  // Pistol grip and trigger guard.
  const gx = bullpup ? x1 - 10 : x0 + 6;
  g.add(
    tagged(
      'grip-rear',
      false,
      prism(
        [
          [gx, -5],
          [gx + 5, -5],
          [gx + 0.6, -14.4],
          [gx - 4.2, -14.8],
          [gx - 4.4, -13.2],
        ],
        3.4,
        p.grip && has(/pistol grip|wood grip|syn grip/, p.grip) ? m.of(p.grip) : furniture(),
        0.45,
      ),
      at(box(9, 0.5, 1.1, m.steel(), 0.15), gx + 7.5, -7.6),
      at(box(0.5, 2.6, 0.6, m.steel('#555')), gx + 6, -6.4),
    ),
  );

  // Barrel, maybe fluted, maybe two of them.
  const barrelMat = m.of(p.barrel, 'steel');
  const barrels = kind === 'double' ? [-1.15, 1.15] : [0];
  const bp: THREE.Object3D[] = barrels.map((z) => at(rod(D.br, bx - x1 + 6, barrelMat), x1 - 6, 1.6, z));
  if (p.barrel && has(/flut|vent/, p.barrel)) for (let i = 0; i < 4; i++) bp.push(at(box((bx - x1) * 0.5, 0.18, 0.18, m.dark(), 0.02), x1 + (bx - x1) * 0.4, 1.6 + Math.cos((i * Math.PI) / 2) * D.br, Math.sin((i * Math.PI) / 2) * D.br));
  g.add(tagged('barrel', !!p.barrel, ...bp));

  // Handguard / forend.
  if (kind === 'rifle' || kind === 'smg') {
    const len = hgEnd - x1;
    const hg = [at(box(len, 4.4, 4.4, m.of(p.handguard ?? p.rail, wooden ? 'wood' : 'poly'), 0.7), x1 + len / 2, 1.2)];
    if (p.handguard || p.rail) for (let x = x1 + 2; x < hgEnd - 2; x += 3) hg.push(at(box(1.6, 1, 0.2, m.dark(), 0.05), x, 1.2, 2.25));
    g.add(tagged('handguard', !!p.handguard, ...hg));
  } else if (kind === 'shotgun' || kind === 'double') {
    // Tube mag under the barrel and a pump.
    if (kind === 'shotgun') {
      const tube = p.magazine && has(/tube|shell|7 shot|10 shot/, p.magazine) ? 1.2 : 1;
      g.add(tagged('magazine', !!p.magazine && has(/tube|shell|shot/, p.magazine), at(rod(0.95, (bx - x1) * 0.72 * tube, m.steel('#232428')), x1, -0.6)));
    }
    const pumpX = x1 + 6;
    g.add(tagged('handguard', !!p.handguard, at(box(15, 3.6, 4.2, m.of(p.handguard, wooden ? 'wood' : 'poly'), 0.9), pumpX + 7.5, kind === 'double' ? 0.6 : -0.4)));
    if (p.rail && has(/shroud|vent|cage/, p.rail)) g.add(tagged('rail', true, at(box(bx - x1 - 16, 1.6, 3.2, m.steel('#2b2c30'), 0.3), (x1 + bx - 2) / 2, 3.2)));
  } else if (kind === 'sniper') {
    // The rifle's own stock runs under the barrel.
    g.add(tagged('handguard', !!p.handguard, at(box(18, 3.6, 4.4, m.of(p.handguard ?? p.stock, wooden ? 'wood' : 'poly'), 0.9), x1 + 8, -0.4)));
  }

  // Top rail.
  if (p.rail || kind === 'rifle' || kind === 'smg') {
    const top = rail((p.handguard || p.rail) && (kind === 'rifle' || kind === 'smg') ? hgEnd - x0 - 2 : D.rl - 2, m);
    top.position.set(x0 + 1, 4.35, 0);
    if (!(p.rail && has(/shroud|vent|cage/, p.rail))) g.add(tagged('rail', !!p.rail, top));
  }

  // Muzzle.
  if (p.muzzle) barrels.forEach((z) => g.add(tagged('muzzle', true, at(muzzle(p.muzzle!, bx, 1.6, D.br, m), 0, 0, z))));
  else if (kind === 'rifle' || kind === 'smg') g.add(tagged('muzzle', false, muzzle('flash hider', bx, 1.6, D.br, m)));
  else barrels.forEach((z) => g.add(tagged('muzzle', false, at(new THREE.Mesh(new THREE.SphereGeometry(0.3), m.steel()), bx + 0.2, 1.6 + D.br + 0.4, z))));

  // Sight.
  const sx = kind === 'sniper' ? x0 + D.rl / 2 + 2 : x0 + D.rl / 2;
  const sy = kind === 'rifle' || kind === 'smg' || p.rail ? 5 : 4.1;
  if (p.sight) g.add(tagged('sight', true, sight(p.sight, sx, sy, m)));
  else g.add(tagged('sight', false, at(box(1.4, 2.2, 1.6, m.steel(), 0.2), x0 + 3, sy + 1.1), at(box(1, 2.4, 1, m.steel(), 0.2), (kind === 'rifle' || kind === 'smg' ? hgEnd : bx) - 2, sy + (kind === 'rifle' || kind === 'smg' ? 1.2 : -1.6))));

  // Magazine.
  if (kind !== 'shotgun' || (p.magazine && !has(/tube|shell|shot/, p.magazine))) {
    const mx = bullpup ? gx - 13 : x1 - 9;
    const mk = kind === 'shotgun' ? 'box' : D.mag;
    if (kind !== 'double') g.add(tagged('magazine', !!p.magazine, magazine(p.magazine, /ak|ka-74|assault rifle|compact/.test(n) ? 'curved' : mk === 'curved' ? 'straight' : mk, mx, -5.6, m)));
  }

  // Stock.
  const style = kind === 'sniper' ? 'precision' : kind === 'smg' ? 'fold' : wooden ? 'wood' : kind === 'rifle' ? 'adjustable' : 'fixed';
  if (bullpup) g.add(tagged('stock', !!p.stock, at(box(10, 9, 4.2, m.of(p.stock), 0.8), 1, -1.2)));
  else if (!/sawn|compact|micro/.test(n) || p.stock) g.add(tagged('stock', !!p.stock, stock(p.stock, style, x0, m)));

  // Light / laser and foregrip, under or beside the front.
  const fx = kind === 'rifle' || kind === 'smg' ? hgEnd - 6 : x1 + 14;
  if (p.light) g.add(tagged('light', true, has(/peq|atpial|dbal|laser|las|go2|po5|2irs/, p.light) ? light(p.light, fx - 1, 5.4 + 1.4, 0, m) : light(p.light, fx - 2, 1.2, 3.4, m)));
  if (p.grip && !has(/pistol grip|wood grip|syn grip/, p.grip)) g.add(tagged('grip', true, foregrip(p.grip, fx - 8, kind === 'rifle' || kind === 'smg' ? -1 : -2.4, m)));
  else if (kind === 'sniper' && p.grip) g.add(tagged('grip', true, foregrip(p.grip, fx, -2.4, m)));
  if (p.slide) g.add(tagged('slide', true, at(box(5, 1.2, 1.4, m.of(p.slide, 'steel'), 0.2), x0 + 10, 3.4, 2.3)));
  return g;
}

function pistol(spec: GunSpec, m: Mats) {
  const p = spec.parts;
  const n = spec.name.toLowerCase();
  const g = new THREE.Group();
  const big = /\.50|heavy|44|marksman|pnx45/.test(n) ? 1.12 : /sns|vintage|mk i/.test(n) ? 0.88 : 1;
  const L = 19 * big;
  const slideMat = m.of(p.slide, 'steel');
  const frameMat = /taser/.test(n) ? m.poly('#e6c21f') : m.of(p.frame);
  const slide = [at(box(L, 3.4, 2.8, slideMat, 0.5), L / 2 + 1, 2)];
  for (let x = 2; x < 6; x += 0.9) slide.push(at(box(0.35, 2.2, 0.2, m.dark(), 0.05), x, 2, 1.45));
  if (p.slide && has(/topcut|hex|wolf|marksman|cut/, p.slide)) for (let x = 9; x < L - 2; x += 2.4) slide.push(at(box(1.4, 0.4, 1.6, m.dark(), 0.1), x, 3.7));
  g.add(tagged('slide', !!p.slide, ...slide));
  g.add(
    tagged(
      'frame',
      !!p.frame,
      prism(
        [
          [1.5, 0.4],
          [L + 0.6, 0.4],
          [L + 0.6, -1.4],
          [10, -1.4],
          [8.4, -2.4],
          [7.6, -1.4],
          [6.2, -1.4],
          [4, -11.5],
          [-0.8, -11.8],
          [-1.4, -10],
          [1, -1.2],
        ],
        2.6,
        frameMat,
        0.35,
      ),
      at(box(5, 0.45, 0.9, frameMat, 0.15), 8.4, -3.6),
    ),
  );
  const bx = L + 1.2;
  g.add(tagged('barrel', !!p.barrel, at(rod(0.6, p.barrel && has(/thread|sai|flut/, p.barrel) ? 2.6 : 1.2, m.of(p.barrel, 'steel')), bx - 0.4, 2.2)));
  if (p.muzzle) g.add(tagged('muzzle', true, muzzle(p.muzzle, bx + 1.6, 2.2, 0.62, m)));
  if (p.sight) g.add(tagged('sight', true, sight(p.sight, 7, 3.7, m, !has(/scope|\d+-\d+x/, p.sight))));
  else g.add(tagged('sight', false, at(box(1, 0.8, 1.4, m.steel(), 0.15), 2.5, 4.1), at(box(0.6, 0.8, 0.6, m.steel(), 0.1), L - 0.5, 4.1)));
  g.add(tagged('magazine', !!p.magazine, magazine(p.magazine, 'pistol', 1.8, -11.6, m)));
  if (p.light) g.add(tagged('light', true, light(p.light, L - 5, -0.9, 0, m)));
  if (p.rail) g.add(tagged('rail', true, at(rail(7, m), L - 9, -1.9)));
  if (p.stock) {
    const s = m.of(p.stock);
    g.add(tagged('stock', true, at(rod(0.5, 14, m.steel()), -14, -4), at(box(1.4, 9, 2.8, s, 0.4), -14, -4.6), at(box(3, 3, 2.6, s, 0.4), -0.6, -4)));
  }
  if (p.grip) g.add(tagged('grip', true, foregrip(p.grip, L - 4, -1.6, m)));
  return g;
}

function revolver(spec: GunSpec, m: Mats) {
  const p = spec.parts;
  const g = new THREE.Group();
  const frame = m.of(p.frame, 'steel');
  const BL = /44mag-s|navy|marksman/.test(spec.name.toLowerCase()) ? 18 : 12;
  g.add(
    tagged(
      'frame',
      !!p.frame,
      prism(
        [
          [0, 3],
          [14, 3],
          [14, -1],
          [9, -1],
          [8, -2.4],
          [6.6, -1.2],
          [4.2, -1.2],
          [2, -10.6],
          [-3, -11],
          [-3.4, -9.4],
          [-0.4, -1],
          [-2, 3.4],
        ],
        2.8,
        frame,
        0.35,
      ),
      at(box(4.4, 0.45, 0.9, frame, 0.15), 7.4, -3.4),
    ),
  );
  // Grip panels.
  g.add(
    prism(
      [
        [-0.4, -1.4],
        [4, -1.4],
        [1.8, -10.6],
        [-3, -11],
        [-3.3, -9.4],
      ],
      3.4,
      p.grip ? m.of(p.grip, 'wood') : m.wood(),
      0.5,
    ),
  );
  // The cylinder: flat or round, with flutes.
  const flat = p.cylinder && has(/flat/, p.cylinder);
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 5.2, flat ? 6 : 32), p.cylinder && finishOf(p.cylinder).color ? m.of(p.cylinder) : m.steel('#6d7178', 0.25));
  cyl.rotation.z = -Math.PI / 2;
  const parts: THREE.Object3D[] = [at(cyl, 7.8, 0.9)];
  if (!flat)
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      parts.push(at(box(3.8, 0.5, 0.5, m.dark(), 0.1), 7.8, 0.9 + Math.cos(a) * 2.25, Math.sin(a) * 2.25));
    }
  g.add(tagged('cylinder', !!p.cylinder, ...parts));
  const bm = m.of(p.barrel, 'steel');
  g.add(tagged('barrel', !!p.barrel, at(rod(0.95, BL, bm), 13.6, 1.6), at(box(BL, 1.1, 1.4, bm, 0.3), 13.6 + BL / 2, 2.8)));
  g.add(at(box(1.6, 1.4, 0.8, m.steel(), 0.2), -1.4, 3.8)); // hammer
  if (p.rail) g.add(tagged('rail', true, has(/cage|shroud/, p.rail) ? at(box(BL - 1, 2.4, 3, m.of(p.rail, 'steel'), 0.4), 14.2 + BL / 2, 1.6) : at(rail(BL - 2, m), 14.5, 3.4)));
  if (p.sight) g.add(tagged('sight', true, sight(p.sight, 14 + BL / 2, p.rail ? 4.2 : 3.4, m, !has(/scope|\d+-\d+x/, p.sight))));
  else g.add(tagged('sight', false, at(box(0.6, 1.2, 0.6, m.steel(), 0.1), 12 + BL, 3.8)));
  if (p.muzzle) g.add(tagged('muzzle', true, muzzle(p.muzzle, 13.6 + BL, 1.6, 0.95, m)));
  if (p.light) g.add(tagged('light', true, light(p.light, 13 + BL - 6, -0.8, 0, m)));
  if (p.grip) g.add(tagged('grip', true, foregrip(p.grip, 13 + BL - 4, 0.2, m)));
  if (p.stock) g.add(tagged('stock', true, at(rod(0.5, 14, m.steel()), -17, -3), at(box(1.4, 9, 2.8, m.of(p.stock), 0.4), -17, -3.6)));
  return g;
}

/** The gun as a group, centred and scaled to 100 units long. */
export function buildGun(spec: GunSpec) {
  const m = makeMats();
  const kind = kindOfGun(spec);
  const gun = kind === 'pistol' ? pistol(spec, m) : kind === 'revolver' ? revolver(spec, m) : longGun(spec, kind, m);
  const holder = new THREE.Group();
  holder.add(gun);
  const b = new THREE.Box3().setFromObject(gun);
  const size = b.getSize(new THREE.Vector3());
  const c = b.getCenter(new THREE.Vector3());
  gun.position.sub(c);
  const s = (kind === 'pistol' || kind === 'revolver' ? 52 : 100) / Math.max(size.x, 1);
  holder.scale.setScalar(s);
  holder.userData = { kind, height: size.y * s, length: size.x * s };
  holder.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return holder;
}

// ---------- swap-in models ----------

interface Manifest {
  classes?: Record<string, string>;
  weapons?: Record<string, string>;
}
let manifest: Promise<Manifest> | null = null;
const glbs = new Map<string, Promise<THREE.Object3D | null>>();
function modelFor(spec: GunSpec): Promise<THREE.Object3D | null> {
  manifest ??= fetch('/models/guns/manifest.json')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return manifest.then((mf) => {
    const file = mf.weapons?.[spec.weaponId] ?? mf.classes?.[spec.cls];
    if (!file) return null;
    if (!glbs.has(file))
      glbs.set(
        file,
        new GLTFLoader()
          .loadAsync(`/models/guns/${file}`)
          .then((g) => g.scene)
          .catch(() => null),
      );
    return glbs.get(file)!.then((o) => (o ? o.clone(true) : null));
  });
}
/** Swaps a code-built body for a downloaded model, keeping the fitted parts where they were. */
async function withModel(spec: GunSpec, holder: THREE.Group) {
  const model = await modelFor(spec);
  if (!model) return holder;
  const gun = holder.children[0]!;
  const body = new THREE.Box3();
  gun.children.forEach((c) => {
    if (!c.userData.fitted) {
      body.expandByObject(c);
      c.visible = false;
    }
  });
  const want = body.getSize(new THREE.Vector3());
  const mb = new THREE.Box3().setFromObject(model);
  const have = mb.getSize(new THREE.Vector3());
  // Lie it along X, muzzle forward, if it came in along Z.
  if (have.z > have.x) {
    model.rotation.y = -Math.PI / 2;
    mb.setFromObject(model);
    mb.getSize(have);
  }
  model.scale.multiplyScalar(want.x / Math.max(have.x, 0.001));
  mb.setFromObject(model);
  model.position.add(body.getCenter(new THREE.Vector3()).sub(mb.getCenter(new THREE.Vector3())));
  model.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.userData.slot = 'frame')) : null));
  gun.add(model);
  return holder;
}

// ---------- the workshop ----------

/** The bench: a worn wooden top, a pegboard behind, a warm hanging lamp. */
export function workshop(scene: THREE.Scene, floorY: number) {
  const top = new THREE.Mesh(new THREE.PlaneGeometry(600, 300), new THREE.MeshStandardMaterial({ map: benchTex(), roughness: 0.78, metalness: 0.02 }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = floorY;
  top.receiveShadow = true;
  scene.add(top);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(600, 260), new THREE.MeshStandardMaterial({ map: pegTex(), roughness: 0.9 }));
  wall.position.set(0, floorY + 110, -110);
  scene.add(wall);
  // A couple of tools hanging on the board, out of focus.
  const toolMat = new THREE.MeshStandardMaterial({ color: '#4a4f57', metalness: 0.8, roughness: 0.45 });
  [
    [-150, 70, 0.4],
    [-110, 82, -0.2],
    [120, 76, 0.15],
    [165, 64, -0.35],
  ].forEach(([x, y, r]) => {
    const t = box(6, 60, 3, toolMat, 1);
    t.position.set(x!, floorY + y!, -106);
    t.rotation.z = r!;
    scene.add(t);
  });
  const lamp = new THREE.SpotLight('#ffd9a0', 9000, 520, 0.62, 0.55, 1.6);
  lamp.position.set(-20, floorY + 170, 40);
  lamp.target.position.set(0, floorY, 0);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.0005;
  lamp.shadow.radius = 6;
  scene.add(lamp, lamp.target);
  const fill = new THREE.DirectionalLight('#9fb4d8', 0.7);
  fill.position.set(120, 60, 140);
  scene.add(fill, new THREE.AmbientLight('#ffe8cc', 0.18));
}

const envs = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();
function envFor(renderer: THREE.WebGLRenderer) {
  if (envs.has(renderer)) return envs.get(renderer)!;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  envs.set(renderer, env);
  return env;
}

/** The scene for a gun: the bench, the lights and the gun resting a hand's width above the wood. */
async function stage(spec: GunSpec, renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0c0907');
  scene.environment = envFor(renderer);
  scene.environmentIntensity = 0.85;
  const gun = await withModel(spec, buildGun(spec));
  const floorY = -(gun.userData.height as number) / 2 - 4;
  workshop(scene, floorY);
  scene.add(gun);
  return { scene, gun, floorY };
}

// ---------- the live bench ----------

export interface Bench {
  setSpec: (spec: GunSpec) => void;
  setActive: (slot: string | null) => void;
  dispose: () => void;
}

/** A live, turnable bench on a canvas. Drag to spin; tap a part to pick its slot. */
export function mountBench(canvas: HTMLCanvasElement, spec: GunSpec, onSlot: (slot: string) => void): Bench {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const camera = new THREE.PerspectiveCamera(30, 2, 1, 2000);
  let scene: THREE.Scene | null = null;
  let gun: THREE.Group | null = null;
  let active: string | null = null;
  let gen = 0;
  let disposed = false;

  // Rotation: a gentle sway when idle; dragging takes over, then it eases back.
  const view = { yaw: -0.5, pitch: 0.18, dragYaw: 0, dragPitch: 0 };
  let dragging = false;
  let moved = 0;
  let last: [number, number] = [0, 0];
  let idleSince = performance.now();

  const fit = () => {
    const w = canvas.clientWidth || 600;
    const h = canvas.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Pull back far enough that 100 units fit the width (and a little more on narrow screens).
    const dist = Math.max(120, 58 / Math.tan((camera.fov * Math.PI) / 360) / Math.min(camera.aspect, 2.2));
    camera.position.set(0, dist * 0.2, dist);
    camera.lookAt(0, -2, 0);
    camera.updateProjectionMatrix();
  };

  const light = () => {
    gun?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      let slot: string | undefined;
      for (let p: THREE.Object3D | null = mesh; p && !slot; p = p.parent) slot = p.userData?.slot;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat.userData.base) mat.userData.base = { e: mat.emissive?.clone(), i: mat.emissiveIntensity };
      const on = !!active && slot === active;
      if (mat.emissive) {
        if (on) {
          mat.emissive.set('#d4af37');
          mat.emissiveIntensity = 0.35;
        } else {
          mat.emissive.copy(mat.userData.base.e);
          mat.emissiveIntensity = mat.userData.base.i;
        }
      }
    });
  };

  const load = async (s: GunSpec) => {
    const my = ++gen;
    const st = await stage(s, renderer);
    if (my !== gen || disposed) return;
    scene = st.scene;
    gun = st.gun;
    light();
  };

  const ray = new THREE.Raycaster();
  const pick = (e: PointerEvent) => {
    if (!gun) return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObject(gun, true).find((h) => h.object.visible);
    let slot: string | undefined;
    for (let p: THREE.Object3D | null = hit?.object ?? null; p && !slot; p = p.parent) slot = p.userData?.slot;
    if (slot) onSlot(slot);
  };
  const down = (e: PointerEvent) => {
    dragging = true;
    moved = 0;
    last = [e.clientX, e.clientY];
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - last[0];
    const dy = e.clientY - last[1];
    moved += Math.abs(dx) + Math.abs(dy);
    last = [e.clientX, e.clientY];
    view.dragYaw += dx * 0.012;
    view.dragPitch = Math.max(-0.5, Math.min(0.9, view.dragPitch + dy * 0.008));
  };
  const up = (e: PointerEvent) => {
    if (dragging && moved < 6) pick(e);
    dragging = false;
    idleSince = performance.now();
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.style.touchAction = 'pan-y';

  const ro = new ResizeObserver(fit);
  ro.observe(canvas);
  fit();
  void load(spec);

  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0;
  const tick = (t: number) => {
    raf = requestAnimationFrame(tick);
    if (!scene || !gun || document.hidden) return;
    if (!dragging && performance.now() - idleSince > 2500) {
      // Ease back to the resting angle.
      view.dragYaw *= 0.95;
      view.dragPitch *= 0.95;
    }
    const sway = calm ? 0 : Math.sin(t / 2600) * 0.32;
    gun.rotation.y = view.yaw + sway + view.dragYaw;
    gun.rotation.x = view.pitch * 0.4 + view.dragPitch;
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  return {
    setSpec: (s) => void load(s),
    setActive: (slot) => {
      active = slot;
      light();
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      renderer.dispose();
    },
  };
}

// ---------- stills: build cards and part tiles ----------

let still: THREE.WebGLRenderer | null = null;
let queue: Promise<unknown> = Promise.resolve();
const shots = new Map<string, Promise<string>>();
function stillRenderer() {
  if (still) return still;
  still = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  still.setPixelRatio(1);
  still.toneMapping = THREE.ACESFilmicToneMapping;
  still.toneMappingExposure = 1.1;
  still.outputColorSpace = THREE.SRGBColorSpace;
  still.shadowMap.enabled = true;
  still.shadowMap.type = THREE.PCFSoftShadowMap;
  return still;
}
const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
const keyOf = (s: GunSpec) => `${s.weaponId}|${s.cls}|${s.name}|${Object.entries(s.parts).sort().map((e) => e.join('=')).join(',')}`;

/** A lit 3/4 shot of a build on the bench, as an image (cached). */
export function renderGun(spec: GunSpec, w = 480, h = 270): Promise<string> {
  const key = `${keyOf(spec)}@${w}x${h}`;
  if (!shots.has(key)) {
    const job = queue.then(async () => {
      await frame();
      const r = stillRenderer();
      r.setSize(w, h, false);
      const { scene, gun } = await stage(spec, r);
      gun.rotation.set(0.12, -0.42, 0);
      const cam = new THREE.PerspectiveCamera(30, w / h, 1, 2000);
      const dist = 56 / Math.tan((30 * Math.PI) / 360) / Math.min(w / h, 2.2);
      cam.position.set(0, dist * 0.22, dist);
      cam.lookAt(0, -2, 0);
      r.render(scene, cam);
      return r.domElement.toDataURL('image/webp', 0.86);
    });
    queue = job.catch(() => null);
    shots.set(key, job);
  }
  return shots.get(key)!;
}

/** A small picture of one part on its own, for the part tiles (cached). */
export function renderPart(spec: GunSpec, slot: string, size = 112): Promise<string> {
  const key = `part|${keyOf(spec)}|${slot}@${size}`;
  if (!shots.has(key)) {
    const job = queue.then(async () => {
      await frame();
      const r = stillRenderer();
      r.setSize(size, size, false);
      const holder = buildGun(spec);
      let piece: THREE.Object3D | null = null;
      holder.traverse((o) => {
        if (!piece && o.userData?.slot === slot && o.userData?.fitted) piece = o;
      });
      const scene = new THREE.Scene();
      scene.environment = envFor(r);
      const key1 = new THREE.DirectionalLight('#fff1dc', 2.4);
      key1.position.set(-1, 2, 2);
      scene.add(key1, new THREE.AmbientLight('#ffffff', 0.4));
      if (piece) {
        const src = piece as THREE.Object3D;
        holder.updateMatrixWorld(true);
        const p = src.clone(true);
        src.matrixWorld.decompose(p.position, p.quaternion, p.scale);
        const inner = new THREE.Group();
        inner.add(p);
        inner.rotation.set(0.25, -0.6, 0);
        inner.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(inner);
        const sz = b.getSize(new THREE.Vector3());
        inner.position.sub(b.getCenter(new THREE.Vector3()));
        scene.add(inner);
        const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 2000);
        const d = (Math.max(sz.x, sz.y, sz.z) * 0.62) / Math.tan((30 * Math.PI) / 360) + 1;
        cam.position.set(0, d * 0.15, d);
        cam.lookAt(0, 0, 0);
        r.setClearColor(0x000000, 0);
        r.render(scene, cam);
      } else {
        r.setClearColor(0x000000, 0);
        r.clear();
      }
      return r.domElement.toDataURL('image/webp', 0.86);
    });
    queue = job.catch(() => null);
    shots.set(key, job);
  }
  return shots.get(key)!;
}
