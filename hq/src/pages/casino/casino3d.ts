import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * The backroom casino's 3D pieces: clay chips, playing cards, the slot symbols, a gold coin and the table props.
 * Each is modelled in code, lit like a smoky backroom (one warm lamp overhead), rendered once to an image and
 * cached, so the games only ever show pictures. One render at a time, between frames, so nothing stutters.
 */

export type Sprite =
  | { kind: 'chip'; value: number }
  | { kind: 'card'; r: string; s: string }
  | { kind: 'back' }
  | { kind: 'symbol'; id: string }
  | { kind: 'coin' }
  | { kind: 'prop'; id: 'ashtray' | 'whiskey' | 'cash' | 'lamp' };

const cache = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();
let R: { renderer: THREE.WebGLRenderer; env: THREE.Texture } | null = null;

function setup() {
  if (R) return R;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  R = { renderer, env };
  return R;
}

const tex = (w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};
/** Seeded noise, so every render of a piece looks the same. */
function rng(seed: number) {
  let s = seed || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
/** Old, worn surfaces: a few hundred faint specks and scratches. */
function grime(g: CanvasRenderingContext2D, w: number, h: number, seed: number, alpha = 0.08) {
  const r = rng(seed);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,240,210'},${r() * alpha})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5);
  }
}

// ---------- chips ----------

/** Clay chip colors: a little dusty, like they've been on the table since 1946. */
export const CHIP_LOOK: Record<number, { base: string; stripe: string; ink: string }> = {
  5: { base: '#8f2a22', stripe: '#efe4cc', ink: '#efe4cc' },
  10: { base: '#5c6470', stripe: '#efe4cc', ink: '#efe4cc' },
  25: { base: '#2f6b3c', stripe: '#efe4cc', ink: '#efe4cc' },
  50: { base: '#284a8a', stripe: '#e8c870', ink: '#efe4cc' },
  100: { base: '#141414', stripe: '#d8b456', ink: '#e8c870' },
  250: { base: '#5a2a78', stripe: '#efe4cc', ink: '#efe4cc' },
  500: { base: '#7d1c1c', stripe: '#141414', ink: '#efe4cc' },
  1000: { base: '#b38b33', stripe: '#141414', ink: '#141414' },
  5000: { base: '#c46a2a', stripe: '#141414', ink: '#141414' },
};
export const chipLook = (v: number) => CHIP_LOOK[v] ?? CHIP_LOOK[1000]!;
export const chipLabel = (v: number) => (v >= 1000 ? `${v / 1000}K` : String(v));

function chipFace(v: number, seed: number) {
  const L = chipLook(v);
  return tex(256, 256, (g) => {
    g.fillStyle = L.base;
    g.fillRect(0, 0, 256, 256);
    // Edge spots (six rectangular inserts), an inlay ring and the denomination.
    g.save();
    g.translate(128, 128);
    for (let i = 0; i < 6; i++) {
      g.rotate(Math.PI / 3);
      g.fillStyle = L.stripe;
      g.fillRect(-14, -128, 28, 30);
    }
    g.restore();
    g.strokeStyle = L.stripe;
    g.lineWidth = 3;
    g.setLineDash([6, 6]);
    g.beginPath();
    g.arc(128, 128, 84, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    const inlay = g.createRadialGradient(118, 112, 8, 128, 128, 72);
    inlay.addColorStop(0, '#f4ead2');
    inlay.addColorStop(1, '#d9caa6');
    g.fillStyle = inlay;
    g.beginPath();
    g.arc(128, 128, 70, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = v >= 1000 ? '#3a2408' : L.base;
    g.font = `800 ${chipLabel(v).length > 3 ? 58 : chipLabel(v).length > 2 ? 72 : 84}px Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(chipLabel(v), 128, 132);

    grime(g, 256, 256, seed, 0.12);
  });
}
function chipEdge(v: number) {
  const L = chipLook(v);
  return tex(512, 32, (g) => {
    g.fillStyle = L.base;
    g.fillRect(0, 0, 512, 32);
    g.fillStyle = L.stripe;
    for (let i = 0; i < 6; i++) g.fillRect(i * (512 / 6) + 20, 0, 28, 32);
    grime(g, 512, 32, v, 0.15);
  });
}
/** One chip (or a short stack), lying on the felt and seen from a little above. */
function chipModel(v: number, n = 1) {
  const g = new THREE.Group();
  const face = chipFace(v, v);
  const edge = chipEdge(v);
  edge.wrapS = THREE.RepeatWrapping;
  const side = new THREE.MeshStandardMaterial({ map: edge, roughness: 0.62, metalness: 0 });
  const top = new THREE.MeshStandardMaterial({ map: face, roughness: 0.55, metalness: 0 });
  for (let i = 0; i < n; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 3.4, 64), [side, top, top]);
    c.position.set((i % 2) * 0.6 - 0.3, i * 3.5, ((i * 7) % 3) * 0.3);
    // The top chip faces you squarely so its number reads; the ones under it sit a little askew.
    c.rotation.y = i === n - 1 ? Math.PI / 2 : i * 0.7;
    g.add(c);
  }
  return g;
}

// ---------- cards ----------

const SUIT_RED = new Set(['♥', '♦']);
const PIPS: Record<string, [number, number][]> = {
  A: [[0.5, 0.5]],
  '2': [[0.5, 0.2], [0.5, 0.8]],
  '3': [[0.5, 0.2], [0.5, 0.5], [0.5, 0.8]],
  '4': [[0.3, 0.2], [0.7, 0.2], [0.3, 0.8], [0.7, 0.8]],
  '5': [[0.3, 0.2], [0.7, 0.2], [0.5, 0.5], [0.3, 0.8], [0.7, 0.8]],
  '6': [[0.3, 0.2], [0.7, 0.2], [0.3, 0.5], [0.7, 0.5], [0.3, 0.8], [0.7, 0.8]],
  '7': [[0.3, 0.2], [0.7, 0.2], [0.5, 0.35], [0.3, 0.5], [0.7, 0.5], [0.3, 0.8], [0.7, 0.8]],
  '8': [[0.3, 0.2], [0.7, 0.2], [0.5, 0.35], [0.3, 0.5], [0.7, 0.5], [0.5, 0.65], [0.3, 0.8], [0.7, 0.8]],
  '9': [[0.3, 0.18], [0.7, 0.18], [0.3, 0.39], [0.7, 0.39], [0.5, 0.5], [0.3, 0.61], [0.7, 0.61], [0.3, 0.82], [0.7, 0.82]],
  '10': [[0.3, 0.18], [0.7, 0.18], [0.5, 0.3], [0.3, 0.39], [0.7, 0.39], [0.3, 0.61], [0.7, 0.61], [0.5, 0.7], [0.3, 0.82], [0.7, 0.82]],
};
const FACE_NAME: Record<string, string> = { J: 'KNAVE', Q: 'QUEEN', K: 'KING' };

function cardFace(r: string, s: string) {
  const W = 300;
  const H = 432;
  const red = SUIT_RED.has(s);
  const ink = red ? '#9b1c1c' : '#16120c';
  return tex(W, H, (g) => {
    const paper = g.createLinearGradient(0, 0, W, H);
    paper.addColorStop(0, '#f7f0dc');
    paper.addColorStop(1, '#e9dfc2');
    g.fillStyle = paper;
    g.fillRect(0, 0, W, H);
    grime(g, W, H, r.charCodeAt(0) * 7 + s.charCodeAt(0), 0.06);
    g.fillStyle = ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const corner = (flip: boolean) => {
      g.save();
      if (flip) {
        g.translate(W, H);
        g.rotate(Math.PI);
      }
      g.font = `700 ${r === '10' ? 40 : 46}px Georgia, serif`;
      g.fillText(r, 34, 40);
      g.font = '40px Georgia, serif';
      g.fillText(s, 34, 84);
      g.restore();
    };
    corner(false);
    corner(true);
    if (FACE_NAME[r]) {
      // A framed court card: gilt frame, the letter large and a period banner.
      g.strokeStyle = '#a07a2c';
      g.lineWidth = 5;
      g.strokeRect(66, 70, W - 132, H - 140);
      g.lineWidth = 1.5;
      g.strokeRect(74, 78, W - 148, H - 156);
      const glow = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, 150);
      glow.addColorStop(0, red ? 'rgba(155,28,28,0.16)' : 'rgba(22,18,12,0.12)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = glow;
      g.fillRect(76, 80, W - 152, H - 160);
      g.fillStyle = ink;
      g.font = '700 150px Georgia, serif';
      g.fillText(r, W / 2, H / 2 - 18);
      g.font = '64px Georgia, serif';
      g.fillText(s, W / 2, H / 2 + 92);
      g.font = '700 20px Georgia, serif';
      g.fillStyle = '#a07a2c';
      g.fillText(FACE_NAME[r]!, W / 2, 104);
    } else {
      const big = r === 'A';
      g.font = `${big ? 150 : 62}px Georgia, serif`;
      for (const [px, py] of PIPS[r] ?? []) {
        g.save();
        g.translate(70 + px * (W - 140), 66 + py * (H - 132));
        if (py > 0.55) g.rotate(Math.PI);
        g.fillText(s, 0, 0);
        g.restore();
      }
    }
  });
}
function cardBack() {
  return tex(300, 432, (g) => {
    g.fillStyle = '#3d0f0f';
    g.fillRect(0, 0, 300, 432);
    g.strokeStyle = '#c9a24a';
    g.lineWidth = 4;
    g.strokeRect(14, 14, 272, 404);
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(201,162,74,0.55)';
    for (let x = -432; x < 300; x += 14) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 432, 432);
      g.stroke();
      g.beginPath();
      g.moveTo(x + 432, 0);
      g.lineTo(x, 432);
      g.stroke();
    }
    g.fillStyle = '#3d0f0f';
    g.beginPath();
    g.ellipse(150, 216, 70, 92, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#c9a24a';
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = '#c9a24a';
    g.font = '700 92px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('C', 150, 214);
    grime(g, 300, 432, 99, 0.1);
  });
}
// ---------- slot symbols ----------

const gold = () => new THREE.MeshStandardMaterial({ color: '#e0b04a', metalness: 1, roughness: 0.22 });
function symbolModel(id: string): THREE.Object3D {
  const g = new THREE.Group();
  if (id === 'crown') {
    const pts = [new THREE.Vector2(15, -10), new THREE.Vector2(16, -6), new THREE.Vector2(15.5, 4), new THREE.Vector2(14.5, 6)];
    const band = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), gold());
    g.add(band);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(3.4, 14, 16), gold());
      spike.position.set(Math.cos(a) * 14.5, 12, Math.sin(a) * 14.5);
      g.add(spike);
      const pearl = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 12), new THREE.MeshPhysicalMaterial({ color: '#fff8ec', roughness: 0.15, clearcoat: 1 }));
      pearl.position.set(Math.cos(a) * 14.5, 20, Math.sin(a) * 14.5);
      g.add(pearl);
      const jewel = new THREE.Mesh(new THREE.OctahedronGeometry(2.6), new THREE.MeshPhysicalMaterial({ color: i % 2 ? '#1c3faa' : '#b3121c', roughness: 0.05, transmission: 0.2, metalness: 0.1 }));
      jewel.position.set(Math.cos(a + 0.6) * 16, -2, Math.sin(a + 0.6) * 16);
      g.add(jewel);
    }
    g.rotation.x = 0.35;
    g.scale.setScalar(1.25);
  } else if (id === 'gem') {
    const pts = [new THREE.Vector2(0, -22), new THREE.Vector2(20, 4), new THREE.Vector2(16, 12), new THREE.Vector2(0, 14)];
    const gem = new THREE.Mesh(new THREE.LatheGeometry(pts, 8), new THREE.MeshPhysicalMaterial({ color: '#8a2be2', roughness: 0.02, metalness: 0.1, clearcoat: 1, flatShading: true, envMapIntensity: 2.2 }));
    gem.rotation.x = 0.4;
    g.add(gem);
    g.scale.setScalar(1.25);
  } else if (id === 'skull') {
    const bone = new THREE.MeshStandardMaterial({ color: '#e6dcc4', roughness: 0.55 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(17, 40, 32), bone);
    head.scale.set(1, 1.05, 0.95);
    head.position.y = 5;
    const jaw = new THREE.Mesh(new RoundedBoxGeometry(18, 10, 14, 3, 3), bone);
    jaw.position.set(0, -12, 3);
    const dark = new THREE.MeshStandardMaterial({ color: '#0a0806', roughness: 0.9 });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(5, 20, 16), dark);
    eyeL.position.set(-6.5, 3, 14);
    const eyeR = eyeL.clone();
    eyeR.position.x = 6.5;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5, 3), dark);
    nose.position.set(0, -4, 15.5);
    nose.rotation.x = Math.PI;
    for (let i = -2; i <= 2; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.5, 1), dark);
      tooth.position.set(i * 3.3, -11, 10.2);
      g.add(tooth);
    }
    g.add(head, jaw, eyeL, eyeR, nose);
    g.rotation.y = -0.25;
  } else if (id === 'rose') {
    const petal = new THREE.MeshStandardMaterial({ color: '#a3101f', roughness: 0.45, side: THREE.DoubleSide });
    for (let i = 0; i < 14; i++) {
      const r = 3 + i * 1.1;
      const p = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16, 0, Math.PI * 1.1, 0, Math.PI * 0.6), petal);
      p.rotation.set(-0.2 - i * 0.02, i * 2.4, 0.1);
      p.position.y = 6 - i * 0.35;
      g.add(p);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 24, 10), new THREE.MeshStandardMaterial({ color: '#2f5a24', roughness: 0.6 }));
    stem.position.y = -12;
    stem.rotation.z = 0.15;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 8), new THREE.MeshStandardMaterial({ color: '#3d7a2c', roughness: 0.5 }));
    leaf.scale.set(1.6, 0.25, 0.8);
    leaf.position.set(5, -12, 0);
    leaf.rotation.z = 0.5;
    g.add(stem, leaf);
    g.rotation.x = 0.5;
    g.scale.setScalar(1.15);
  } else if (id === 'coins') {
    const m = gold();
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 3, 48), m);
      c.position.set(i % 2 ? 1 : -1, -10 + i * 3.4, 0);
      g.add(c);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(13, 0.6, 8, 48), m);
      rim.rotation.x = Math.PI / 2;
      rim.position.copy(c.position).add(new THREE.Vector3(0, 1.5, 0));
      g.add(rim);
    }
    const tilted = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 3, 48), m);
    tilted.position.set(16, -2, 6);
    tilted.rotation.z = 1.2;
    g.add(tilted);
    g.rotation.x = 0.45;
    g.scale.setScalar(1.2);
  } else {
    // Cherries: two glossy cherries on curved stems with a leaf.
    const cherry = new THREE.MeshPhysicalMaterial({ color: '#a10e16', roughness: 0.12, clearcoat: 1 });
    const a = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 24), cherry);
    a.position.set(-9, -10, 0);
    const b = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 24), cherry);
    b.position.set(10, -13, 3);
    const stemMat = new THREE.MeshStandardMaterial({ color: '#4b6a2a', roughness: 0.6 });
    const s1 = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-9, -1, 0), new THREE.Vector3(-6, 14, 0), new THREE.Vector3(2, 20, 0)), 20, 0.9, 8), stemMat);
    const s2 = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(10, -4, 3), new THREE.Vector3(8, 12, 1), new THREE.Vector3(2, 20, 0)), 20, 0.9, 8), stemMat);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 8), new THREE.MeshStandardMaterial({ color: '#3d7a2c', roughness: 0.5 }));
    leaf.scale.set(1.5, 0.25, 0.7);
    leaf.position.set(8, 20, 0);
    leaf.rotation.z = -0.4;
    g.add(a, b, s1, s2, leaf);
    g.scale.setScalar(1.15);
  }
  return g;
}

// ---------- props ----------

function propModel(id: string): THREE.Object3D {
  const g = new THREE.Group();
  if (id === 'ashtray') {
    const glass = new THREE.MeshPhysicalMaterial({ color: '#b89a5e', roughness: 0.12, metalness: 0.1, clearcoat: 1, transparent: true, opacity: 0.85 });
    const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(22, 0), new THREE.Vector2(24, 7), new THREE.Vector2(19, 8), new THREE.Vector2(16, 3), new THREE.Vector2(0, 3)];
    g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 48), glass));
    const cig = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 26, 16), new THREE.MeshStandardMaterial({ color: '#f1eadc', roughness: 0.8 }));
    cig.rotation.z = Math.PI / 2 - 0.15;
    cig.position.set(14, 8, 2);
    const ember = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 2.5, 16), new THREE.MeshStandardMaterial({ color: '#ff5a1f', emissive: '#ff3d00', emissiveIntensity: 2 }));
    ember.rotation.copy(cig.rotation);
    ember.position.set(27, 10, 2);
    const ash = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8), new THREE.MeshStandardMaterial({ color: '#4a4440', roughness: 1 }));
    ash.scale.set(1, 0.3, 1);
    ash.position.set(-4, 3.5, 0);
    g.add(cig, ember, ash);
    g.rotation.x = 0.55;
  } else if (id === 'whiskey') {
    const glass = new THREE.MeshPhysicalMaterial({ color: '#e8f0f2', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28, clearcoat: 1, side: THREE.DoubleSide, envMapIntensity: 1.6 });
    const tumbler = new THREE.Mesh(new THREE.CylinderGeometry(14, 12.5, 30, 8, 1, true), glass);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(12.5, 12.5, 4, 8), new THREE.MeshPhysicalMaterial({ color: '#dfe8ea', transparent: true, opacity: 0.5, roughness: 0.05, clearcoat: 1 }));
    base.position.y = -13;
    const drink = new THREE.Mesh(new THREE.CylinderGeometry(12.3, 11.8, 12, 32), new THREE.MeshPhysicalMaterial({ color: '#9a4d12', roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.88 }));
    drink.position.y = -5;
    const ice = new THREE.Mesh(new RoundedBoxGeometry(9, 9, 9, 2, 1.5), new THREE.MeshPhysicalMaterial({ color: '#f2fbff', roughness: 0.15, transparent: true, opacity: 0.7, clearcoat: 1 }));
    ice.position.set(2, 2, 1);
    ice.rotation.set(0.4, 0.6, 0.2);
    g.add(tumbler, base, drink, ice);
    g.rotation.x = 0.35;
  } else if (id === 'cash') {
    const bill = tex(256, 110, (x) => {
      x.fillStyle = '#7f9a6b';
      x.fillRect(0, 0, 256, 110);
      x.strokeStyle = '#3f5a33';
      x.lineWidth = 4;
      x.strokeRect(6, 6, 244, 98);
      x.fillStyle = '#d7dfc8';
      x.beginPath();
      x.ellipse(128, 55, 28, 34, 0, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#2f4426';
      x.font = '700 30px Georgia, serif';
      x.fillText('100', 14, 36);
      x.fillText('100', 196, 96);
      grime(x, 256, 110, 5, 0.18);
    });
    const paper = new THREE.MeshStandardMaterial({ map: bill, roughness: 0.85 });
    const side = new THREE.MeshStandardMaterial({ color: '#c8cfb8', roughness: 0.9 });
    const stack = new THREE.Mesh(new THREE.BoxGeometry(46, 9, 20), [side, side, paper, side, side, side]);
    const band = new THREE.Mesh(new THREE.BoxGeometry(8, 9.4, 20.4), new THREE.MeshStandardMaterial({ color: '#d8c79a', roughness: 0.7 }));
    const top = new THREE.Mesh(new THREE.BoxGeometry(44, 6, 19), [side, side, paper, side, side, side]);
    top.position.set(6, 7.5, 3);
    top.rotation.y = 0.25;
    g.add(stack, band, top);
    g.rotation.set(0.6, -0.4, 0);
  } else {
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(6, 26, 18, 48, 1, true), new THREE.MeshStandardMaterial({ color: '#1f3d2a', metalness: 0.4, roughness: 0.4, side: THREE.DoubleSide }));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(6, 24, 16), new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffd27a', emissiveIntensity: 3 }));
    bulb.position.y = -6;
    g.add(shade, bulb);
  }
  return g;
}

function coinModel() {
  const face = tex(256, 256, (x) => {
    const gr = x.createRadialGradient(110, 100, 10, 128, 128, 128);
    gr.addColorStop(0, '#ffe7a0');
    gr.addColorStop(1, '#b8892e');
    x.fillStyle = gr;
    x.fillRect(0, 0, 256, 256);
    x.strokeStyle = '#8a6418';
    x.lineWidth = 8;
    x.beginPath();
    x.arc(128, 128, 104, 0, Math.PI * 2);
    x.stroke();
    x.fillStyle = '#8a6418';
    x.font = '700 120px Georgia, serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('C', 128, 136);
  });
  const m = new THREE.MeshStandardMaterial({ map: face, metalness: 1, roughness: 0.25 });
  const rim = new THREE.MeshStandardMaterial({ color: '#c99a3a', metalness: 1, roughness: 0.3 });
  const c = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 3, 48), [rim, m, m]);
  c.rotation.x = 1.15;
  return c;
}

// ---------- rendering ----------

function size(s: Sprite): [number, number] {
  if (s.kind === 'card' || s.kind === 'back') return [150, 216];
  if (s.kind === 'chip') return [96, 96];
  if (s.kind === 'coin') return [64, 64];
  if (s.kind === 'symbol') return [160, 160];
  return [180, 180];
}

function draw(s: Sprite): string {
  const { renderer, env } = setup();
  const [w, h] = size(s);
  renderer.setSize(w, h, false);
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  // One warm lamp overhead and a faint cool fill: the backroom.
  const lamp = new THREE.DirectionalLight('#ffd9a0', 2.6);
  lamp.position.set(-20, 120, 60);
  const fill = new THREE.DirectionalLight('#8fa6d6', 0.5);
  fill.position.set(80, 20, 60);
  scene.add(lamp, fill, new THREE.AmbientLight('#ffe8cc', 0.25));
  let obj: THREE.Object3D;
  let cam: THREE.Camera;
  if (s.kind === 'card' || s.kind === 'back') {
    // Cards are shown face-on, so render them flat-on with an orthographic camera.
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(63, 88), new THREE.MeshPhysicalMaterial({ map: s.kind === 'back' ? cardBack() : cardFace(s.r, s.s), roughness: 0.4, clearcoat: 0.4, clearcoatRoughness: 0.3 }));
    obj = plane;
    const o = new THREE.OrthographicCamera(-31.5, 31.5, 44, -44, 1, 500);
    o.position.set(0, 0, 100);
    cam = o;
  } else {
    obj = s.kind === 'chip' ? chipModel(s.value) : s.kind === 'coin' ? coinModel() : s.kind === 'symbol' ? symbolModel(s.id) : propModel(s.id);
    if (s.kind === 'chip') obj.rotation.x = 0.95;
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    obj.position.sub(c);
    const p = new THREE.PerspectiveCamera(28, w / h, 1, 2000);
    const d = (Math.max(sz.x, sz.y, sz.z) * 0.62) / Math.tan((28 * Math.PI) / 360);
    p.position.set(0, 0, d);
    p.lookAt(0, 0, 0);
    cam = p;
  }
  scene.add(obj);
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
  return url;
}

const keyOf = (s: Sprite) => (s.kind === 'chip' ? `chip:${s.value}` : s.kind === 'card' ? `card:${s.r}${s.s}` : s.kind === 'symbol' ? `sym:${s.id}` : s.kind === 'prop' ? `prop:${s.id}` : s.kind);

/** The picture of a casino piece (a PNG data URL), rendered once and cached. */
export function sprite(s: Sprite): Promise<string> {
  const key = keyOf(s);
  const hit = cache.get(key);
  if (hit) return hit;
  const job = (queue = queue.then(
    () =>
      new Promise<string>((resolve, reject) =>
        requestAnimationFrame(() => {
          try {
            resolve(draw(s));
          } catch (e) {
            reject(e);
          }
        }),
      ),
  )) as Promise<string>;
  queue = job.catch(() => null);
  cache.set(key, job);
  return job;
}
