import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { Tier, TrophyDesign } from '../lib/trophies';
import { Figure } from './Trophy';

/**
 * Real 3D trophies: each design's outline is turned into solid, bevelled metal (cups, coin stacks
 * and bricks are modelled outright), lit by a studio environment so the metal reflects, and set on
 * a black marble plinth with a brass plaque. Each design and tier is rendered once and cached.
 */
const W = 320;
const H = 384;
const cache = new Map<string, Promise<string>>();
let ctx: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; env: THREE.Texture } | null = null;
let queue: Promise<unknown> = Promise.resolve();

// Placeholder colors the SVG figure is drawn with, so we know which part is which.
const M = '#aa0001';
const T = '#aa0002';
const K = '#aa0003';

const TIER_LOOK: Record<Tier, { color: string; rough: number; ink: string; name: string }> = {
  1: { color: '#c07a3f', rough: 0.32, ink: '#3b1d0b', name: 'BRONZE' },
  2: { color: '#e9ecf1', rough: 0.18, ink: '#22262c', name: 'SILVER' },
  3: { color: '#f3c552', rough: 0.2, ink: '#4a3608', name: 'GOLD' },
  4: { color: '#121214', rough: 0.12, ink: '#d4af37', name: 'ONYX' },
};

function setup() {
  if (ctx) return ctx;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  const scene = new THREE.Scene();
  scene.environment = env;
  const key = new THREE.DirectionalLight('#fff4dd', 2.2);
  key.position.set(-60, 120, 140);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#9fb8ff', 1.4);
  rim.position.set(90, 40, -120);
  scene.add(rim);
  scene.add(new THREE.AmbientLight('#ffffff', 0.25));
  const camera = new THREE.PerspectiveCamera(26, W / H, 1, 2000);
  camera.position.set(0, 24, 285);
  camera.lookAt(0, -4, 0);
  ctx = { renderer, scene, camera, env };
  return ctx;
}

function materials(tier: Tier) {
  const look = TIER_LOOK[tier];
  const metal =
    tier === 4
      ? new THREE.MeshPhysicalMaterial({ color: look.color, metalness: 0.4, roughness: look.rough, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.3 })
      : new THREE.MeshStandardMaterial({ color: look.color, metalness: 1, roughness: look.rough, envMapIntensity: 1.25 });
  const ink = new THREE.MeshStandardMaterial({ color: look.ink, metalness: tier === 4 ? 1 : 0.6, roughness: tier === 4 ? 0.25 : 0.55 });
  return { metal, ink };
}

/** Outline → solid: every filled part extruded with a bevel, every line a rod. */
function figureMesh(design: TrophyDesign, tier: Tier) {
  const { metal, ink } = materials(tier);
  const svg = renderToStaticMarkup(createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 100 100' }, createElement(Figure, { design, m: M, t: T, k: K })));
  const data = new SVGLoader().parse(svg);
  const group = new THREE.Group();
  data.paths.forEach((p, order) => {
    const st = p.userData?.style ?? {};
    const fill = String(st.fill ?? '').toLowerCase();
    const stroke = String(st.stroke ?? '').toLowerCase();
    const opacity = Number(st.fillOpacity ?? 1) * Number(st.opacity ?? 1);
    const z = order * 0.15;
    if (fill && fill !== 'none') {
      const isMetal = fill === M || fill === T || fill === '#ffffff';
      const isInk = fill === K || (opacity < 0.9 && fill !== M);
      const mat = isInk ? ink : isMetal ? metal : new THREE.MeshStandardMaterial({ color: p.color, metalness: 0.15, roughness: 0.55 });
      const depth = isInk ? 1.2 : isMetal ? 9 : 5;
      SVGLoader.createShapes(p).forEach((shape) => {
        const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: isInk ? 0.4 : 2.2, bevelSize: isInk ? 0.3 : 1.4, bevelSegments: isInk ? 1 : 4, curveSegments: 18 });
        const mesh = new THREE.Mesh(g, mat);
        // Ink sits proud of the metal's face, like an inlay; everything else stacks in drawing order.
        mesh.position.z = isInk ? 9 + 2.2 + 0.2 : z - depth / 2;
        group.add(mesh);
      });
    } else if (stroke && stroke !== 'none') {
      const r = Math.max(0.8, Number(st.strokeWidth ?? 1) / 2);
      const mat = stroke === K ? ink : metal;
      p.subPaths.forEach((sp) => {
        const pts = sp.getPoints(24);
        if (pts.length < 2) return;
        const closed = pts[0]!.distanceTo(pts[pts.length - 1]!) < 0.5;
        const curve = new THREE.CatmullRomCurve3(pts.map((v) => new THREE.Vector3(v.x, v.y, 0)), closed);
        const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(16, pts.length * 3), r, 10, closed), mat);
        mesh.position.z = stroke === K ? 9 : z;
        group.add(mesh);
      });
    }
  });
  // SVG's y runs down; centre the 100×94 figure.
  group.scale.set(1, -1, 1);
  group.position.set(-50, 47, 0);
  const holder = new THREE.Group();
  holder.add(group);
  return holder;
}

/** Shapes that deserve real modelling rather than an outline. */
function modelled(design: TrophyDesign, tier: Tier): THREE.Object3D | null {
  const { metal, ink } = materials(tier);
  if (design === 'cup') {
    const g = new THREE.Group();
    const bowl = [
      [0, -14], [8, -14], [16, -9], [22, 0], [26, 12], [28, 24], [29, 34], [30.5, 37], [29, 37.5], [27.5, 34],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    g.add(new THREE.Mesh(new THREE.LatheGeometry(bowl, 64), Object.assign(metal.clone(), { side: THREE.DoubleSide })));
    const stem = [[0, -40], [16, -40], [16, -37], [11, -35], [5, -31], [4, -24], [6, -18], [9, -14], [0, -14]].map(([x, y]) => new THREE.Vector2(x, y));
    g.add(new THREE.Mesh(new THREE.LatheGeometry(stem, 64), metal));
    [-1, 1].forEach((s) => {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(11, 2.4, 16, 40, Math.PI * 1.15), metal);
      handle.position.set(s * 28, 16, 0);
      handle.rotation.z = s < 0 ? Math.PI / 2 + 0.25 : -Math.PI / 2 - 0.25;
      handle.rotation.y = s < 0 ? Math.PI : 0;
      g.add(handle);
    });
    const starShape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 4 : 9;
      const a = (Math.PI * i) / 5 + Math.PI / 2;
      if (i) starShape.lineTo(r * Math.cos(a), r * Math.sin(a));
      else starShape.moveTo(r * Math.cos(a), r * Math.sin(a));
    }
    const star = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape, { depth: 1.5, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.4 }), ink);
    star.position.set(0, 14, 25.5);
    g.add(star);
    return g;
  }
  if (design === 'coins') {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 6, 64), metal);
      c.position.set(i % 2 ? 2.5 : -2, -40 + i * 6.5, i % 2 ? 1.5 : -1);
      g.add(c);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(19, 0.7, 8, 64), ink);
      rim.rotation.x = Math.PI / 2;
      rim.position.copy(c.position).add(new THREE.Vector3(0, 3.1, 0));
      g.add(rim);
    }
    const top = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 6, 64), metal);
    top.rotation.x = Math.PI / 2.6;
    top.position.set(10, 8, 12);
    g.add(top);
    return g;
  }
  if (design === 'brick') {
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(56, 30, 36, 1, 1, 1);
    const b = new THREE.Mesh(geo, metal);
    b.position.y = -32;
    b.rotation.y = 0.5;
    g.add(b);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(57, 6, 37), ink);
    tape.position.y = -28;
    tape.rotation.y = 0.5;
    g.add(tape);
    return g;
  }
  return null;
}

function plaqueTexture(text: string) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 48;
  const x = c.getContext('2d')!;
  const grad = x.createLinearGradient(0, 0, 0, 48);
  grad.addColorStop(0, '#f6de97');
  grad.addColorStop(0.5, '#b8913a');
  grad.addColorStop(1, '#7a5a1c');
  x.fillStyle = grad;
  x.fillRect(0, 0, 256, 48);
  x.strokeStyle = '#4a3510';
  x.lineWidth = 3;
  x.strokeRect(2, 2, 252, 44);
  x.fillStyle = '#3a2508';
  x.font = '700 24px Cinzel, Georgia, serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 128, 26);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function plinth(tier: Tier) {
  const g = new THREE.Group();
  const marble = new THREE.MeshPhysicalMaterial({ color: '#08080a', roughness: 0.16, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.6 });
  const low = new THREE.Mesh(new THREE.BoxGeometry(78, 16, 46), marble);
  low.position.y = -66;
  const top = new THREE.Mesh(new THREE.BoxGeometry(62, 7, 36), marble);
  top.position.y = -54.5;
  const trim = new THREE.Mesh(new THREE.BoxGeometry(79, 1.4, 47), new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 1, roughness: 0.25 }));
  trim.position.y = -58;
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(46, 9, 0.8), [
    new THREE.MeshStandardMaterial({ color: '#8a6a2c', metalness: 1, roughness: 0.3 }),
    new THREE.MeshStandardMaterial({ color: '#8a6a2c', metalness: 1, roughness: 0.3 }),
    new THREE.MeshStandardMaterial({ color: '#8a6a2c', metalness: 1, roughness: 0.3 }),
    new THREE.MeshStandardMaterial({ color: '#8a6a2c', metalness: 1, roughness: 0.3 }),
    new THREE.MeshStandardMaterial({ map: plaqueTexture(`${TIER_LOOK[tier].name} · ${['', 'I', 'II', 'III', 'IV'][tier]}`), metalness: 0.6, roughness: 0.35 }),
    new THREE.MeshStandardMaterial({ color: '#8a6a2c' }),
  ]);
  plaque.position.set(0, -66, 23.5);
  g.add(low, top, trim, plaque);
  return g;
}

function draw(design: TrophyDesign, tier: Tier): string {
  const { renderer, scene, camera } = setup();
  const root = new THREE.Group();
  const fig = modelled(design, tier) ?? figureMesh(design, tier);
  fig.position.y += -2;
  root.add(fig, plinth(tier));
  root.rotation.y = -0.38;
  root.position.y = 6;
  scene.add(root);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(root);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
  return url;
}

/** The 3D picture of a trophy (a PNG data URL), rendered once per design and tier. */
export function renderTrophy(design: TrophyDesign, tier: Tier): Promise<string> {
  const key = `${design}:${tier}`;
  const hit = cache.get(key);
  if (hit) return hit;
  // One at a time, between frames, so a full cabinet doesn't freeze the page.
  const job = (queue = queue.then(
    () =>
      new Promise<string>((resolve, reject) =>
        requestAnimationFrame(() => {
          try {
            resolve(draw(design, tier));
          } catch (e) {
            reject(e);
          }
        }),
      ),
  )) as Promise<string>;
  queue = job.catch(() => undefined);
  cache.set(key, job);
  return job;
}
