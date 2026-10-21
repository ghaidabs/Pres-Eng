import * as THREE from 'three';
import { patch, fbm, tex } from './env.js';

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/* Coastline: z of the waterline at a given x. Land lies at z below it (far side). */
export function coastZ(x) {
  let z = lerp(-90, -900, ss(250, 520, x));
  z = lerp(z, -72, ss(1520, 1700, x));
  return z;
}
/* Maximum depth of the sea floor along the journey (positive metres). */
const DK = [[-400, 16], [0, 18], [120, 40], [220, 58], [440, 58], [520, 14], [560, 9], [780, 10], [840, 26], [1000, 26], [1040, 13], [1100, 13], [1150, 20], [1300, 24], [1450, 30], [1560, 22], [2400, 18]];
function depthMax(x) {
  for (let i = 1; i < DK.length; i++) if (x <= DK[i][0]) {
    const a = DK[i - 1], b = DK[i]; const t = ss(0, 1, (x - a[0]) / (b[0] - a[0])); return lerp(a[1], b[1], t);
  }
  return DK[DK.length - 1][1];
}
export function H(x, z) {
  const d = z - coastZ(x);
  const n = fbm(x * 0.02, z * 0.02, 4) - 0.5, n2 = fbm(x * 0.11 + 9, z * 0.11, 3) - 0.5;
  if (d < 0) {
    const inland = Math.min(-d * 0.05, 5);
    return 1.3 + inland + n * 2.2 * Math.min(1, -d / 30) + n2 * 0.3;
  }
  const D = depthMax(x);
  const t = 1 - Math.exp(-d / 42);
  let y = 1.3 - (D + 1.3) * t;
  y += n * (1.5 + D * 0.12) * Math.min(1, d / 20) + n2 * 0.5;
  // sand ripples in clean shallows
  y += Math.sin(x * 0.9 + Math.sin(z * 0.15) * 2) * 0.06;
  return y;
}
export const ground = (x, z) => H(x, z);

export const TB = { x0: -500, x1: 2300, z0: -1150, z1: 260, step: 4 };

export function buildTerrain() {
  const nx = Math.round((TB.x1 - TB.x0) / TB.step), nz = Math.round((TB.z1 - TB.z0) / TB.step);
  const g = new THREE.PlaneGeometry(TB.x1 - TB.x0, TB.z1 - TB.z0, nx, nz);
  g.rotateX(-Math.PI / 2);
  g.translate((TB.x0 + TB.x1) / 2, 0, (TB.z0 + TB.z1) / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  const C = (h) => new THREE.Color(h);
  const sandDry = C('#c7ab7c'), sandEnd = C('#e6cf9f'), dirtLand = C('#7d725e'), wet = C('#8d7a5c');
  const sludge = C('#bdb8a4'), sludgeDark = C('#77715f'), seaSand = C('#c2ab82'), seaGrass = C('#3f4c2c'), rock = C('#6c665a');
  const c = new THREE.Color();
  const hgt = new Uint8Array((nx + 1) * (nz + 1));
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = H(x, z);
    pos.setY(i, y);
    hgt[i] = Math.max(0, Math.min(255, Math.round((y + 70) / 80 * 255)));
    const n = fbm(x * 0.05 + 3, z * 0.05, 3), n2 = fbm(x * 0.013, z * 0.013, 3);
    if (y > 1.6) {
      c.copy(dirtLand).lerp(sandDry, ss(150, 400, x)).lerp(sandEnd, ss(1500, 1700, x));
      c.lerp(rock, Math.max(0, n - 0.62) * 2);
      if (y > 5) c.lerp(C('#8a8460'), 0.25);
    } else if (y > -0.6) {
      c.copy(wet).lerp(sandEnd, ss(1500, 1700, x) * 0.6);
      if (x < 450) c.lerp(sludge, 0.35);
    } else {
      const dirty = 1 - ss(470, 620, x);
      c.copy(seaSand).lerp(rock, Math.max(0, n - 0.6) * 1.6);
      const meadow = ss(0.5, 0.62, n2) * (1 - dirty) * ss(-3, -8, y) * (1 - ss(-34, -40, y));
      c.lerp(seaGrass, meadow * 0.85);
      const s = sludge.clone().lerp(sludgeDark, ss(0.35, 0.7, n));
      c.lerp(s, dirty);
    }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const nm = tex('groundN'); nm.repeat.set(220, 110);
  const m = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, normalMap: nm, normalScale: new THREE.Vector2(0.7, 0.7) }), { key: 'terrain', caustic: 1.3 });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  const ht = new THREE.DataTexture(hgt, nx + 1, nz + 1, THREE.RedFormat, THREE.UnsignedByteType);
  ht.magFilter = ht.minFilter = THREE.LinearFilter; ht.flipY = false; ht.needsUpdate = true;
  return { mesh, ht, nx, nz };
}
