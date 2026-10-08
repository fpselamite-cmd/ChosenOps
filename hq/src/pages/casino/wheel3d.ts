import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * A live 3D roulette wheel: mahogany bowl, numbered pocket ring, brass frets and turret, an ivory ball.
 * `spin(result, ms)` spins the rotor one way and sends the ball round the track the other way, then drops it
 * into the result's pocket exactly as the time runs out.
 */
const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const N = WHEEL.length;
const STEP = (Math.PI * 2) / N;

const R_POCKET = 31; // where the ball rests
const R_TRACK = 47; // where it rolls
const R_RING_IN = 26;
const R_RING_OUT = 38;

function numberRing() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  const cx = 512;
  for (let i = 0; i < N; i++) {
    const n = WHEEL[i]!;
    // Pocket i is centered on angle i*STEP (measured the same way the 3D ring's UVs run).
    const a0 = i * STEP - STEP / 2 - Math.PI / 2;
    const a1 = a0 + STEP;
    g.beginPath();
    g.arc(cx, cx, 500, a0, a1);
    g.arc(cx, cx, 340, a1, a0, true);
    g.closePath();
    g.fillStyle = n === 0 ? '#1d6b33' : REDS.has(n) ? '#8e1b1b' : '#141210';
    g.fill();
    g.save();
    g.translate(cx, cx);
    g.rotate(a0 + STEP / 2 + Math.PI / 2);
    g.fillStyle = '#efe4cc';
    g.font = '700 46px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), 0, -445);
    g.restore();
  }
  // Inner pocket floor, a touch lighter.
  g.globalCompositeOperation = 'source-atop';
  const shade = g.createRadialGradient(cx, cx, 340, cx, cx, 500);
  shade.addColorStop(0, 'rgba(0,0,0,0.35)');
  shade.addColorStop(0.55, 'rgba(0,0,0,0)');
  g.fillStyle = shade;
  g.fillRect(0, 0, 1024, 1024);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function woodTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#4a2412';
  g.fillRect(0, 0, 512, 64);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(20,8,2,${0.1 + Math.random() * 0.25})`;
    g.lineWidth = 0.6 + Math.random() * 2;
    const y = Math.random() * 64;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x / 40 + i) * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 1);
  return t;
}

function build() {
  const wheel = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: '#c99a3e', metalness: 1, roughness: 0.28 });
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.38, metalness: 0.05 });
  // The fixed bowl: rim, the sloped ball track and the outer wood.
  const bowl = new THREE.Mesh(
    new THREE.LatheGeometry([new THREE.Vector2(40, 2), new THREE.Vector2(50, 6), new THREE.Vector2(54, 9), new THREE.Vector2(58, 10), new THREE.Vector2(60, 7), new THREE.Vector2(60, -6), new THREE.Vector2(38, -6)], 96),
    wood,
  );
  const track = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(39, 2.2), new THREE.Vector2(50, 6.2)], 96), new THREE.MeshStandardMaterial({ color: '#2b1a0e', roughness: 0.25, metalness: 0.1 }));
  wheel.add(bowl, track);
  // Diamond deflectors on the track.
  for (let i = 0; i < 8; i++) {
    const d = new THREE.Mesh(new THREE.OctahedronGeometry(1.6), brass);
    const a = (i / 8) * Math.PI * 2;
    d.position.set(Math.cos(a) * 44, 4.6, Math.sin(a) * 44);
    d.scale.set(1, 0.5, 2);
    d.rotation.y = -a;
    wheel.add(d);
  }
  // The rotor: number ring, frets and the turret.
  const rotor = new THREE.Group();
  const ringGeo = new THREE.RingGeometry(R_RING_IN, R_RING_OUT, N * 3, 1);
  // Map the ring's UVs to the round texture.
  const pos = ringGeo.attributes.position!;
  const uv = ringGeo.attributes.uv!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    uv.setXY(i, 0.5 + (x / R_RING_OUT) * 0.5 * (500 / 512), 0.5 + (y / R_RING_OUT) * 0.5 * (500 / 512));
  }
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ map: numberRing(), roughness: 0.35, metalness: 0.05 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.3;
  rotor.add(ring);
  for (let i = 0; i < N; i++) {
    const a = i * STEP + STEP / 2;
    const fret = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, 7.5), brass);
    fret.position.set(Math.sin(a) * 30.5, 1.3, -Math.cos(a) * 30.5);
    fret.rotation.y = -a;
    rotor.add(fret);
  }
  const cone = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(26, 0), new THREE.Vector2(20, 3), new THREE.Vector2(9, 7), new THREE.Vector2(4, 9), new THREE.Vector2(0, 9)], 64), wood);
  const turret = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(4, 8), new THREE.Vector2(3, 13), new THREE.Vector2(1.6, 16), new THREE.Vector2(2.6, 18), new THREE.Vector2(0, 19.5)], 32), brass);
  rotor.add(cone, turret);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 18, 12), brass);
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = (i * Math.PI) / 2;
    arm.position.y = 14;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), brass);
    knob.position.set(Math.cos((i * Math.PI) / 2) * 9, 14, -Math.sin((i * Math.PI) / 2) * 9);
    rotor.add(arm, knob);
  }
  wheel.add(rotor);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.7, 24, 16), new THREE.MeshPhysicalMaterial({ color: '#f7f2e6', roughness: 0.15, clearcoat: 1 }));
  wheel.add(ball);
  return { wheel, rotor, ball };
}

export interface Wheel3D {
  spin: (result: number, ms: number) => Promise<void>;
  dispose: () => void;
}

/** Puts a live wheel on a canvas. It turns slowly while idle. */
export function mountWheel(canvas: HTMLCanvasElement): Wheel3D {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;
  pmrem.dispose();
  const lamp = new THREE.SpotLight('#ffd9a0', 9000, 400, 0.7, 0.5, 1.6);
  lamp.position.set(-10, 140, 30);
  scene.add(lamp, new THREE.AmbientLight('#ffe8cc', 0.25));
  const { wheel, rotor, ball } = build();
  scene.add(wheel);
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 1000);
  camera.position.set(0, 150, 128);
  camera.lookAt(0, -4, 0);

  const fit = () => {
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(canvas);
  fit();

  let rotorA = 0;
  let ballA = 0;
  let ballR = R_POCKET;
  let ballY = 1.6;
  let anim: { t0: number; ms: number; r0: number; r1: number; b0: number; b1: number; done: () => void } | null = null;
  const place = () => {
    rotor.rotation.y = -rotorA;
    ball.position.set(Math.sin(ballA) * ballR, ballY, -Math.cos(ballA) * ballR);
  };
  let last = performance.now();
  let raf = 0;
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (anim) {
      const p = Math.min(1, (now - anim.t0) / anim.ms);
      const easeR = 1 - (1 - p) ** 3;
      rotorA = anim.r0 + (anim.r1 - anim.r0) * easeR;
      // The ball rolls the other way, slows, spirals in over the last third and settles with a couple of bounces.
      const easeB = 1 - (1 - p) ** 2.4;
      const fall = Math.max(0, (p - 0.62) / 0.38);
      const bounce = fall > 0 && fall < 1 ? Math.abs(Math.sin(fall * Math.PI * 3)) * (1 - fall) * 2.2 : 0;
      ballA = anim.b0 + (anim.b1 - anim.b0) * easeB;
      ballR = R_TRACK - (R_TRACK - R_POCKET) * Math.min(1, fall * 1.4);
      ballY = 5.2 - 3.6 * Math.min(1, fall * 1.4) + bounce;
      if (p >= 1) {
        const done = anim.done;
        anim = null;
        done();
      }
    } else {
      rotorA += dt * 0.25;
      // At rest the ball rides in its pocket.
      ballA += dt * 0.25;
    }
    place();
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  return {
    spin(result, ms) {
      return new Promise<void>((resolve) => {
        const i = Math.max(0, WHEEL.indexOf(result));
        const r0 = rotorA;
        const r1 = r0 + Math.PI * 2 * (3 + Math.random());
        // The ball must end in pocket i, which by then sits at rotor angle r1 + i*STEP.
        const target = r1 + i * STEP;
        const b0 = ballA;
        // Counter-clockwise for several laps, ending exactly on the target.
        let b1 = target - Math.PI * 2 * 6;
        while (b1 > b0 - Math.PI * 2 * 5) b1 -= Math.PI * 2;
        anim = { t0: performance.now(), ms, r0, r1, b0, b1, done: resolve };
      });
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
    },
  };
}
