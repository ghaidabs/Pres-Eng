import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { std, tex, fbm, U, patch } from './env.js';
import { ground, coastZ } from './terrain.js';
import { puffs } from './water.js';

const V3 = THREE.Vector3;
let seed = 3;
export const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const R = (a, b) => a + rnd() * (b - a);
const mesh = (g, m, cast = true) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = true; return o; };
const box = (w, h, d, m) => mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (rt, rb, h, m, seg = 24) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
export const updaters = [];  // per-frame callbacks (t, dt)

function texRep(name, rx, ry) { const t = tex(name).clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return t; }

/* ======================= shore: plant, canal, palms, boats ======================= */
export function buildShore(root) {
  const g = new THREE.Group(); root.add(g);
  const metal = std('#ffffff', { map: texRep('metal', 4, 1), r: 0.7, m: 0.25, key: 'm1' });
  const metal2 = std('#d9d2c4', { map: texRep('metal', 2, 1), r: 0.7, m: 0.25, key: 'm2' });
  const conc = std('#c9c4b8', { map: texRep('concrete', 4, 4), r: 0.9 });
  const dark = std('#3b3a37', { r: 0.8 });
  const gy = (x, z) => ground(x, z);
  // pad
  g.add(at(box(190, 1.5, 70, conc), 75, gy(75, -150) - 0.2, -150));
  const base = gy(75, -150) + 0.5;
  // halls
  g.add(at(box(56, 18, 24, metal), 70, base + 9, -152));
  g.add(at(box(34, 26, 20, metal2), 122, base + 13, -158));
  g.add(at(box(40, 12, 16, metal), 22, base + 6, -165));
  // roof lights / windows (emissive strips)
  const win = std('#ffb35c', { e: '#ff9a3c', ei: 1.4, r: 1 });
  for (let i = 0; i < 6; i++) g.add(at(box(5, 1.2, 0.3, win), 50 + i * 8, base + 6, -139.8));
  for (let i = 0; i < 3; i++) g.add(at(box(4, 1.2, 0.3, win), 112 + i * 9, base + 18, -147.8));
  // stacks
  const stackM = std('#ffffff', { map: tex('stack'), r: 0.85 });
  const red = std('#ff3b2a', { e: '#ff2a1a', ei: 3, r: 1 });
  [[58, 86], [74, 96], [90, 80]].forEach(([x, h]) => {
    const s = at(cyl(1.8, 2.8, h, stackM), x, base + h / 2, -168); g.add(s);
    g.add(at(mesh(new THREE.SphereGeometry(0.6, 8, 6), red, false), x, base + h + 0.6, -168));
    g.add(puffs({ count: 140, origin: [x, base + h + 2, -168], vel: [5, 6, 2.5], spread: [1.2, 1.4, 1.2], acc: [0.6, 0.3, 0.3], life: 26, size: [8, 70], color: '#6c5a47', opacity: 0.5, turb: 6, order: 5 }));
  });
  // tanks
  [[0, -140], [16, -134], [150, -140]].forEach(([x, z]) => g.add(at(cyl(7, 7, 11, metal2, 32), x, base + 5.5, z)));
  // conveyor gantry to the canal head
  const gan = at(box(70, 2.2, 2.6, dark), 130, base + 14, -128); gan.rotation.z = -0.18; g.add(gan);
  for (let i = 0; i < 4; i++) g.add(at(box(0.8, 12 - i * 2.6, 0.8, dark), 104 + i * 18, base + (12 - i * 2.6) / 2, -128));
  // discharge canal (concrete trough) from plant to the sea
  const cx = 100, z0 = -130, z1 = -82;
  const len = z1 - z0;
  const trough = new THREE.Group();
  const y0 = base + 0.2, y1 = 0.2;
  const slope = Math.atan2(y0 - y1, len);
  trough.add(at(box(5, 0.6, len, conc), 0, -0.6, 0));
  trough.add(at(box(0.6, 1.8, len, conc), -2.6, 0.2, 0)); trough.add(at(box(0.6, 1.8, len, conc), 2.6, 0.2, 0));
  const slurry = std('#d7cfae', { map: texRep('gypsum', 1, 8), r: 0.35, e: '#3a3626', fresh: true });
  const flow = at(mesh(new THREE.PlaneGeometry(4.6, len), slurry, false), 0, 0.05, 0); flow.rotation.x = -Math.PI / 2; trough.add(flow);
  trough.position.set(cx, (y0 + y1) / 2, (z0 + z1) / 2); trough.rotation.x = slope; g.add(trough);
  updaters.push((t) => { slurry.map.offset.y = -t * 0.35; });
  // plume from the canal mouth, spreading seaward and sinking
  g.add(puffs({ count: 520, origin: [cx, -0.8, -82], vel: [4.5, -0.25, 5.5], spread: [5, 0.35, 4], life: 46, size: [5, 34], color: '#cfc39a', opacity: 0.42, turb: 10, floor: -26, ceil: -0.25, jit: [6, 0.5, 3], gate: false, order: 3 }));
  g.add(puffs({ count: 160, origin: [cx, 0.3, -86], vel: [0.5, 0.05, 1.2], spread: [1.2, 0, 1.2], life: 6, size: [3, 9], color: '#e6dcb8', opacity: 0.6, order: 3 }));
  // haze dome over the plant
  g.add(puffs({ count: 60, origin: [60, base + 50, -170], vel: [1, 0.2, 0.5], spread: [0.6, 0.1, 0.6], jit: [260, 50, 120], life: 60, size: [90, 160], color: '#7d644c', opacity: 0.28, lit: 0.6, order: 1 }));

  // dead palms, beached boats, sign
  [[-60, -104, 1.0, 0.5], [-34, -110, 0.85, -0.4], [-8, -101, 1.1, 0.3], [24, -112, 0.8, -0.6]].forEach(([x, z, s, l]) => g.add(palm(x, z, s, l, true)));
  const b1 = boat(9, '#d8d2c4', '#2c5a7a'); at(b1, -18, gy(-18, -94) + 0.4, -94); b1.rotation.set(0.05, 0.6, 0.32); g.add(b1);
  const b2 = boat(7, '#cfc8b8', '#6b3a2a'); at(b2, 8, gy(8, -97) + 0.35, -97); b2.rotation.set(-0.08, -0.9, -0.28); g.add(b2);
  const sign = new THREE.Group();
  sign.add(at(cyl(0.08, 0.08, 3.2, dark, 8), 0, 1.6, 0));
  const face = at(mesh(new THREE.PlaneGeometry(2.4, 1.5), std('#ffffff', { map: tex('sign'), r: 0.6 })), 0, 3.0, 0.06);
  sign.add(face); sign.add(at(box(2.5, 1.6, 0.08, dark), 0, 3.0, 0));
  at(sign, -40, gy(-40, -96), -96); sign.rotation.y = 0.25; g.add(sign);
  // litter-like sludge crust lumps at the waterline
  const lump = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), std('#bdb6a0', { r: 1, flat: true }), 140);
  const d = new THREE.Object3D();
  for (let i = 0; i < 140; i++) { const x = R(-90, 230), z = coastZ(x) + R(-4, 10); d.position.set(x, gy(x, z) + 0.1, z); d.scale.set(R(0.4, 1.6), R(0.1, 0.3), R(0.4, 1.4)); d.rotation.set(R(0, 3), R(0, 3), 0); d.updateMatrix(); lump.setMatrixAt(i, d.matrix); }
  lump.receiveShadow = true; g.add(lump);
  // a few working boats moored, far from fish
  const mb = boat(8, '#e9e4d8', '#2f6e8e'); at(mb, 60, 0.3, -58); mb.rotation.y = 1.2; g.add(mb); bobbing(mb, 0.3, 1.2);
  return g;
}

export function bobbing(o, y0, ry) {
  const ph = Math.random() * 6;
  updaters.push((t) => { o.position.y = y0 + Math.sin(t * 1.1 + ph) * 0.18; o.rotation.z = Math.sin(t * 0.9 + ph) * 0.05; o.rotation.x = Math.sin(t * 0.7 + ph) * 0.03; if (ry !== undefined) o.rotation.y = ry; });
}

export function palm(x, z, s, lean, dead) {
  const g = new THREE.Group();
  const H = 9 * s, top = new V3(lean * 3 * s, H, 0);
  const curve = new THREE.CatmullRomCurve3([new V3(0, 0, 0), new V3(lean * 0.6 * s, H * 0.45, 0), top]);
  const trunkM = std(dead ? '#5d5243' : '#7a6650', { r: 0.95, map: texRep('metal', 1, 6) });
  g.add(mesh(new THREE.TubeGeometry(curve, 14, 0.28 * s, 8), trunkM));
  const frondM = new THREE.MeshStandardMaterial({ color: dead ? '#7b6a48' : '#3f7a35', map: tex('frond'), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 });
  patch(frondM, { key: 'frond' });
  const n = dead ? 6 : 13;
  for (let i = 0; i < n; i++) {
    const L = (dead ? 3.6 : 4.8) * s;
    const fg = new THREE.PlaneGeometry(L, 1.1 * s, 10, 1); fg.translate(L / 2, 0, 0);
    const p = fg.attributes.position;
    for (let k = 0; k < p.count; k++) { const xx = p.getX(k) / L; p.setY(k, p.getY(k) * (1 - xx * 0.5)); p.setZ(k, -(xx * xx) * (dead ? 3.4 : 1.7) * s); }
    fg.rotateX(Math.PI / 2); fg.computeVertexNormals();
    const f = new THREE.Mesh(fg, frondM); f.castShadow = true;
    f.position.copy(top); f.rotation.y = (i / n) * Math.PI * 2 + R(-0.2, 0.2); f.rotation.z = dead ? R(-0.9, -0.5) : R(-0.15, 0.45);
    g.add(f);
  }
  g.position.set(x, ground(x, z) - 0.2, z); g.rotation.y = R(0, 6);
  return g;
}

export function boat(L, hullCol, bandCol) {
  const geo = new THREE.BoxGeometry(L, 1.3, L * 0.32, 16, 3, 6);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  const hc = new THREE.Color(hullCol), bc = new THREE.Color(bandCol), keel = new THREE.Color('#5a3d2c');
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const t = x / (L / 2);
    let w = 1; if (t > 0.25) w = Math.max(0.02, 1 - Math.pow((t - 0.25) / 0.75, 1.6)); if (t < -0.75) w = 0.8 + 0.2 * (1 + t) / 0.25;
    z *= w * (y < 0 ? 0.62 : 1);
    if (y > 0) y += Math.max(0, t - 0.4) * 0.5 + Math.abs(t) * 0.12;
    p.setXYZ(i, x, y, z);
    const c = y > 0.45 ? bc : (y < -0.4 ? keel : hc);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const g = new THREE.Group();
  g.add(mesh(geo, std('#ffffff', { vc: true, r: 0.6, key: 'hull' })));
  g.add(at(box(L * 0.22, 1.3, L * 0.2, std('#efeadf', { r: 0.6 })), -L * 0.12, 1.25, 0));
  g.add(at(box(L * 0.2, 0.35, 0.02, std('#22313a', { r: 0.2, m: 0.3 })), -L * 0.12, 1.45, L * 0.101));
  g.add(at(cyl(0.05, 0.06, 3.2, std('#5b4a3a'), 6), L * 0.15, 2.0, 0));
  return g;
}

/* ======================= underwater dead zone ======================= */
function fishGeo() {
  const body = new THREE.SphereGeometry(0.5, 14, 10); body.scale(1, 0.34, 0.16);
  const sh = new THREE.Shape(); sh.moveTo(-0.42, 0); sh.lineTo(-0.72, 0.17); sh.lineTo(-0.64, 0); sh.lineTo(-0.72, -0.17); sh.closePath();
  const tail = new THREE.ShapeGeometry(sh);
  const fin = new THREE.Shape(); fin.moveTo(-0.05, 0.15); fin.lineTo(0.12, 0.3); fin.lineTo(0.18, 0.14);
  const fg = new THREE.ShapeGeometry(fin);
  return mergeGeometries([body.toNonIndexed(), tail.toNonIndexed(), fg.toNonIndexed()]);
}
const FISH = fishGeo();

export function buildDeadZone(root) {
  const g = new THREE.Group(); root.add(g);
  const d = new THREE.Object3D();
  // dead fish on the sludge
  const dead = new THREE.InstancedMesh(FISH, std('#a8a593', { r: 0.6, m: 0.1, side: THREE.DoubleSide, key: 'dfish' }), 90);
  for (let i = 0; i < 90; i++) {
    const x = R(140, 470), z = R(-90, 40); d.position.set(x, ground(x, z) + 0.12, z);
    d.rotation.set(Math.PI / 2 + R(-0.2, 0.2), 0, R(0, 6)); const s = R(0.7, 1.6); d.scale.set(s, s, s); d.updateMatrix(); dead.setMatrixAt(i, d.matrix);
  }
  g.add(dead);
  const dead2 = new THREE.InstancedMesh(FISH, dead.material, 70);
  for (let i = 0; i < 70; i++) { const x = R(356, 410), z = R(-40, 4); d.position.set(x, ground(x, z) + 0.12, z); d.rotation.set(Math.PI / 2 + R(-0.2, 0.2), 0, R(0, 6)); d.scale.setScalar(R(0.8, 1.7)); d.updateMatrix(); dead2.setMatrixAt(i, d.matrix); }
  g.add(dead2);
  // a few sick fish drifting belly-up under the plume
  const drift = new THREE.InstancedMesh(FISH, std('#b4b09c', { r: 0.6, side: THREE.DoubleSide, key: 'dfish2' }), 14);
  const dp = []; for (let i = 0; i < 14; i++) dp.push([R(214, 252), R(-13, -3), R(-40, -14), R(0, 6)]);
  updaters.push((t) => { dp.forEach((p, i) => { d.position.set(p[0] + Math.sin(t * 0.1 + p[3]) * 2, p[1] + Math.sin(t * 0.4 + p[3]) * 0.4, p[2]); d.rotation.set(Math.PI + Math.sin(t * 0.3 + p[3]) * 0.3, p[3], 0.3); d.scale.setScalar(1.3); d.updateMatrix(); drift.setMatrixAt(i, d.matrix); }); drift.instanceMatrix.needsUpdate = true; });
  g.add(drift);
  // dead seagrass stubs (brown matte)
  const blade = new THREE.PlaneGeometry(0.1, 0.5, 1, 2); blade.translate(0, 0.25, 0);
  const stubs = new THREE.InstancedMesh(blade, std('#5b4f36', { r: 1, side: THREE.DoubleSide, key: 'stub' }), 2600);
  for (let i = 0; i < 2600; i++) { const x = R(120, 480), z = R(-120, 60); d.position.set(x, ground(x, z), z); d.rotation.set(R(-0.6, 0.6), R(0, 6), R(-0.6, 0.6)); d.scale.set(1, R(0.5, 1.6), 1); d.updateMatrix(); stubs.setMatrixAt(i, d.matrix); }
  g.add(stubs);
  // ghost net hanging from a lost float line
  // an empty net hanging from the moored boat (scene 2) and a lost one snagged on the dead seabed (scene 3)
  g.add(ghostNet(219, -21, 19, -0.9, -16));
  g.add(ghostNet(361, -13, 18, ground(370, -13) + 5.5, ground(370, -13) - 3, 1));
  // moored fishing boat seen from below at scene 2
  const b = boat(10, '#e3ddd0', '#2b5f80'); at(b, 236, 0.2, -36); g.add(b); bobbing(b, 0.2, 0.4);
  [[221, -21.5], [236, -21.5]].forEach(([rx, rz]) => { const a = new V3(rx, -0.6, rz), b2 = new V3(rx < 230 ? 233 : 239, 0, -34.5), L = a.distanceTo(b2); const r = mesh(new THREE.CylinderGeometry(0.04, 0.04, L, 5), std('#cfc6a6'), false); r.position.copy(a).add(b2).multiplyScalar(0.5); r.quaternion.setFromUnitVectors(new V3(0, 1, 0), b2.clone().sub(a).normalize()); g.add(r); });
  // white crust plates
  const crust = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 0.15, 7), std('#d8d3bf', { r: 1, flat: true, key: 'crust' }), 220);
  for (let i = 0; i < 220; i++) { const x = R(130, 480), z = R(-110, 50); d.position.set(x, ground(x, z) + 0.05, z); d.rotation.set(R(-0.2, 0.2), R(0, 6), R(-0.2, 0.2)); d.scale.set(R(0.6, 3), 1, R(0.6, 2.4)); d.updateMatrix(); crust.setMatrixAt(i, d.matrix); }
  crust.receiveShadow = true; g.add(crust);
  // lingering turbid cloud
  g.add(puffs({ count: 420, origin: [300, -24, -30], jit: [380, 36, 240], vel: [0.4, 0, 0.2], spread: [0.4, 0.05, 0.4], life: 40, size: [14, 28], color: '#b6ad88', opacity: 0.22, floor: -58, ceil: -1.5, turb: 4, lit: 0.4 }));
  return g;
}

/* a real net panel: pale nylon diamond mesh that sways in the current, floats on top, lead line below */
let _netTex;
function netTex() {
  if (_netTex) return _netTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.strokeStyle = '#ffffff'; x.lineWidth = 3.2; x.lineCap = 'round';
  x.beginPath(); x.moveTo(0, 0); x.lineTo(64, 64); x.moveTo(64, 0); x.lineTo(0, 64); x.stroke();
  x.lineWidth = 6; x.beginPath(); x.arc(32, 32, 1, 0, 7); x.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return (_netTex = t);
}
function ghostNet(x0, z0, w, top, bottom, drape = 0) {
  const h = top - bottom, NX = 36, NY = 22;
  const geo = new THREE.PlaneGeometry(1, 1, NX, NY), pos = geo.attributes.position, base = [];
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) + 0.5, v = 0.5 - pos.getY(i);            // u across, v down
    const x = x0 + u * w, sag = Math.sin(u * Math.PI) * 1.4;
    let y = top - sag - v * h, z = z0 + Math.sin(u * 7.3) * 0.9 * v;
    if (drape) { const fl = ground(x, z0) + 0.15; if (y < fl) { z += (fl - y) * 1.1; y = fl + Math.random() * 0.05; } }
    base.push([x, y, z, v]); pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  const tex = netTex().clone(); tex.needsUpdate = true; tex.repeat.set(w / 0.75, h / 0.75);
  const m = std('#e0d2a6', { map: tex, r: 0.85, side: THREE.DoubleSide, fresh: true, key: 'net' });
  m.alphaTest = 0.35; m.transparent = false;
  const net = new THREE.Mesh(geo, m); net.castShadow = true;
  const gr = new THREE.Group(); gr.add(net);
  const topCurve = () => new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, k) => { const b = base[Math.round(k / 8 * NX)]; return new V3(b[0], b[1], b[2]); }));
  gr.add(mesh(new THREE.TubeGeometry(topCurve(), 40, 0.06, 6), std('#d8cfb4', { r: 0.8 })));
  const botCurve = new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, k) => { const b = base[NY * (NX + 1) + Math.round(k / 8 * NX)]; return new V3(b[0], b[1], b[2]); }));
  gr.add(mesh(new THREE.TubeGeometry(botCurve, 40, 0.09, 6), std('#2e2f2a', { r: 0.6 })));
  const fl = std('#e0782e', { r: 0.5 });
  for (let k = 0; k <= 8; k++) { const b = base[Math.round(k / 8 * NX)]; gr.add(at(mesh(new THREE.SphereGeometry(0.32, 12, 8), fl), b[0], b[1] + 0.3, b[2])); }
  // gentle billow in the current
  const ph = Math.random() * 6;
  updaters.push((t) => {
    for (let i = 0; i < pos.count; i++) { const [x, y, z, v] = base[i]; const k = drape && y < ground(x, z0) + 0.4 ? 0 : v;
      pos.setZ(i, z + Math.sin(t * 0.7 + x * 0.35 + v * 2.2 + ph) * 0.55 * k); pos.setX(i, x + Math.sin(t * 0.5 + v * 3 + ph) * 0.18 * k); }
    pos.needsUpdate = true; geo.computeVertexNormals();
  });
  return gr;
}

/* ======================= intercept station + module yard ======================= */
export const station = {};
export function buildStation(root) {
  const g = new THREE.Group(); root.add(g);
  const conc = std('#d5d1c6', { map: texRep('concrete', 10, 3), r: 0.9 });
  const metalW = std('#e8e6e0', { map: texRep('metal', 6, 1), r: 0.6, m: 0.3, key: 'mw' });
  const teal = std('#2aa596', { r: 0.5, m: 0.2 });
  const steel = std('#7d8a8f', { r: 0.45, m: 0.7 });
  const yellow = std('#e7b23a', { r: 0.5, m: 0.3 });
  const DX0 = 560, DX1 = 770, DZ0 = -64, DZ1 = -18, DY = 4.6;
  station.deckY = DY;
  for (let x = DX0 + 4; x < DX1; x += 14) for (const z of [DZ0 + 3, (DZ0 + DZ1) / 2, DZ1 - 3]) {
    const gy = ground(x, z), h = DY - gy; g.add(at(cyl(0.7, 0.7, h, conc, 12), x, gy + h / 2, z));
  }
  const deck = at(box(DX1 - DX0, 1.4, DZ1 - DZ0, conc), (DX0 + DX1) / 2, DY - 0.7, (DZ0 + DZ1) / 2); g.add(deck);
  // railing posts on the front edge
  for (let x = DX0 + 2; x < DX1; x += 3) g.add(at(box(0.08, 1.1, 0.08, steel), x, DY + 0.55, DZ1 - 0.3));
  g.add(at(box(DX1 - DX0, 0.08, 0.08, steel), (DX0 + DX1) / 2, DY + 1.1, DZ1 - 0.3));
  /* the process line, laid along the front of the deck so it reads like the old diagram:
     plant outlet → main line → gate → outfall into the gulf; before the gate, a bypass drops into the filter presses */
  const PY = DY + 2.6, PZ = -27, XJ = 576, XG = 588, XO = 600;
  const P = (x, y, z) => new V3(x, y, z);
  const MAIN = [P(470, PY, PZ), P(XJ, PY, PZ), P(XO, PY, PZ), P(XO, PY, -15.5), P(XO, 0.2, -15.5)];
  const BYP = [P(470, PY, PZ), P(XJ, PY, PZ), P(XJ, DY + 0.9, PZ), P(XJ, DY + 0.9, -33), P(600, DY + 0.9, -35.5)];
  const glassM = new THREE.MeshStandardMaterial({ color: '#40555e', roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.38, depthWrite: false });
  patch(glassM, { key: 'glass' });
  const tube = (pts, r) => {
    const path = new THREE.CurvePath(); for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
    const m = new THREE.Mesh(new THREE.TubeGeometry(path, 160, r, 16, false), glassM); m.renderOrder = 4; return m;
  };
  g.add(tube(MAIN, 0.75)); g.add(tube(BYP.slice(1), 0.6));
  const bandM = std('#3d4a50', { r: 0.4, m: 0.7 });
  for (let x = 474; x < XO; x += 6) { const b = at(cyl(0.82, 0.82, 0.25, bandM, 16), x, PY, PZ); b.rotation.z = Math.PI / 2; g.add(b); }
  for (let x = 480; x < XO; x += 12) { const gy = x < DX0 ? ground(x, PZ) : DY; g.add(at(cyl(0.22, 0.22, PY - 0.8 - gy, steel, 8), x, gy + (PY - 0.8 - gy) / 2, PZ)); }
  // flowing slurry beads (the old dotted pipe), diverted when the gate is shut
  const poly = (pts) => { const seg = []; let L = 0; for (let i = 1; i < pts.length; i++) { const l = pts[i].distanceTo(pts[i - 1]); seg.push(l); L += l; } return { pts, seg, L }; };
  const along = (p, s, out) => { let i = 0; while (i < p.seg.length - 1 && s > p.seg[i]) { s -= p.seg[i]; i++; } return out.lerpVectors(p.pts[i], p.pts[i + 1], Math.min(1, s / p.seg[i])); };
  const M = poly(MAIN), B = poly(BYP), sJ = MAIN[0].distanceTo(MAIN[1]);
  const NB = 54, beadM = new THREE.MeshBasicMaterial({ color: '#e7d48a' }), beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.46, 12, 8), beadM, NB);
  beads.frustumCulled = false; g.add(beads);
  const bs = []; for (let i = 0; i < NB; i++) bs.push({ s: i * (M.L / NB), p: M });
  const cakeC = new THREE.Color('#b6aa7c'), wetC = new THREE.Color('#e7d48a'), bp = new V3(), bd = new THREE.Object3D();
  updaters.push((t, dt) => {
    const closed = U.uGate.value > 0.5;
    bs.forEach((q, i) => {
      const prev = q.s; q.s += 11 * dt;
      if (prev < sJ && q.s >= sJ) q.p = closed ? B : M;
      if (q.s >= q.p.L) { q.s = 0; q.p = M; }
      along(q.p, q.s, bp); bd.position.copy(bp); bd.updateMatrix(); beads.setMatrixAt(i, bd.matrix);
      beads.setColorAt(i, q.p === B && q.s > sJ ? cakeC : wetC);
    });
    beads.instanceMatrix.needsUpdate = true; beads.instanceColor.needsUpdate = true;
  });
  // outfall into the sea: falling stream + plume, both stop when the gate shuts
  g.add(puffs({ count: 90, origin: [XO, 0.6, -15.5], vel: [0, -1.5, 0], spread: [0.3, 0.2, 0.3], life: 1.2, size: [1.2, 3], color: '#e2d7ae', opacity: 0.85, gate: true, floor: -0.4 }));
  g.add(puffs({ count: 280, origin: [XO, -1, -14], vel: [-1.2, -0.3, 3.8], spread: [3, 0.3, 2.5], life: 30, size: [4, 22], color: '#cdc29a', opacity: 0.45, gate: true, floor: -9, ceil: -0.3, turb: 6 }));
  // the gate: a tall sliding plate that drops across the main line
  const gate = new THREE.Group(); gate.position.set(XG, PY, PZ);
  [-1.7, 1.7].forEach(z => gate.add(at(box(0.35, 9, 0.35, std('#c9d2d5', { r: 0.4, m: 0.6 })), 0, 2.6, z)));
  gate.add(at(box(0.5, 0.4, 3.8, std('#c9d2d5', { r: 0.4, m: 0.6 })), 0, 7.2, 0));
  const plate = at(box(0.45, 3.2, 3.0, std('#dfe6e8', { r: 0.35, m: 0.3 })), 0, 4.2, 0); gate.add(plate);
  const wheel = at(mesh(new THREE.TorusGeometry(0.9, 0.1, 8, 24), steel), 0, 7.9, 0); gate.add(wheel);
  const lampM = new THREE.MeshStandardMaterial({ color: '#ff3b2a', emissive: '#ff3b2a', emissiveIntensity: 3 });
  station.lamp = lampM;
  gate.add(at(mesh(new THREE.SphereGeometry(0.45, 14, 10), lampM, false), 0, 8.9, 0));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('soft'), color: '#ff3b2a', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  halo.scale.setScalar(4); halo.position.y = 8.9; gate.add(halo);
  g.add(gate);
  updaters.push(() => { const k = U.uGate.value; plate.position.y = THREE.MathUtils.lerp(4.2, 0, k); halo.material.color.copy(lampM.color); });
  // dusk floodlight over the process line (fades out away from the station)
  const flood = new THREE.SpotLight('#ffdcb0', 0, 140, 0.62, 0.6, 1.2); flood.position.set(596, 34, 14); flood.target.position.set(604, 4, -30); g.add(flood, flood.target);
  for (const x of [612, 652]) { g.add(at(cyl(0.15, 0.2, 10, steel, 8), x, DY + 5, -19.5)); g.add(at(box(1.4, 0.5, 0.9, std('#fff2d6', { e: '#ffdcb0', ei: 2.5 })), x, DY + 10, -19.5)); }
  updaters.push(() => {
    const cx = U.uCam.value.x, k = THREE.MathUtils.smoothstep(cx, 590, 690);
    flood.intensity = 5200 * (1 - THREE.MathUtils.smoothstep(Math.abs(cx - 640), 140, 280));
    flood.position.set(THREE.MathUtils.lerp(596, 690, k), 34, 14); flood.target.position.set(THREE.MathUtils.lerp(604, 712, k), 4, THREE.MathUtils.lerp(-30, -44, k));
  });
  station.wheel = wheel;
  // filter press hall
  const hall = at(box(40, 11, 22, metalW), 604 + 10, DY + 5.5, -47); g.add(hall);
  g.add(at(box(40.2, 1.4, 22.2, teal), 614, DY + 9.2, -47));
  g.add(at(box(40.6, 0.6, 22.6, steel), 614, DY + 11.2, -47));
  for (let i = 0; i < 5; i++) g.add(at(box(5, 6, 0.2, std('#3a6f74', { r: 0.3, m: 0.4, e: '#4fd6c4', ei: 0.35 })), 598 + i * 8, DY + 3.5, -35.9));
  // silos (binder)
  [[648, -54], [656, -54]].forEach(([x, z]) => { g.add(at(cyl(3, 3, 14, metalW, 24), x, DY + 9, z)); g.add(at(mesh(new THREE.ConeGeometry(3, 2.5, 24), metalW), x, DY + 17.2, z)); g.add(at(cyl(0.6, 1.2, 3, steel, 12), x, DY + 1.5, z)); });
  // conveyor with filter cake moving to the casting line
  g.add(at(box(36, 0.5, 2, steel), 652, DY + 2.2, -32));
  const cake = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.7, 1.4), std('#b5a97f', { map: tex('gypsum'), r: 1, key: 'cake' }), 14);
  const d = new THREE.Object3D(); g.add(cake);
  updaters.push((t) => { const on = U.uGate.value; for (let i = 0; i < 14; i++) { const u = ((t * 0.06 + i / 14) % 1); d.position.set(635 + u * 34, DY + 2.8, -32); d.scale.setScalar(on > 0.5 ? 1 : 0.0001); d.updateMatrix(); cake.setMatrixAt(i, d.matrix); } cake.instanceMatrix.needsUpdate = true; });
  // module stacks + gantry crane
  const modM = moduleMat();
  const mods = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 2.6, 2.6), modM, 80); mods.castShadow = true; mods.receiveShadow = true;
  let k = 0;
  for (let row = 0; row < 3; row++) for (let c = 0; c < 6; c++) for (let lv = 0; lv < 3 - (c % 3 === 2 ? 1 : 0); lv++) {
    if (k >= 80) break; d.position.set(718 + c * 3, DY + 1.3 + lv * 2.65, -56 + row * 3.2); d.rotation.set(0, 0, 0); d.scale.setScalar(1); d.updateMatrix(); mods.setMatrixAt(k++, d.matrix);
  }
  mods.count = k; g.add(mods);
  const crane = new THREE.Group();
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => crane.add(at(box(0.7, 16, 0.7, yellow), sx * 16, 8, sz * 9)));
  crane.add(at(box(34, 1.2, 1.2, yellow), 0, 16.5, -9)); crane.add(at(box(34, 1.2, 1.2, yellow), 0, 16.5, 9));
  const trolley = at(box(3, 1.2, 19, yellow), 0, 17.4, 0); crane.add(trolley);
  const cable = at(cyl(0.05, 0.05, 1, steel, 4), 0, 0, 0); crane.add(cable);
  const hang = at(new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 2.6), modM), 0, 8, 0); hang.castShadow = true; crane.add(hang);
  at(crane, 730, DY, -48); g.add(crane);
  updaters.push((t) => { const x = Math.sin(t * 0.15) * 10; trolley.position.x = x; const y = 8 + Math.sin(t * 0.3) * 3; hang.position.set(x, y, 0); cable.position.set(x, (y + 1.3 + 17) / 2, 0); cable.scale.y = 17 - y - 1.3; });
  // turntable for the hero module (scene 5)
  g.add(at(cyl(2.6, 2.8, 0.4, steel, 40), 706, DY + 0.2, -26));
  station.moduleAt = new V3(706, DY + 0.4, -26);
  return g;
}

let _modM;
export function moduleMat() { return _modM || (_modM = std('#c4c2ba', { map: texRep('concrete', 1, 1), r: 0.85, key: 'mod' })); }

/* hero module: the first template's cube, built in 3D — speckled core, glowing blue liner, gridded concrete shell */
function heroTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  if (kind === 'core') {
    x.fillStyle = '#8f7f55'; x.fillRect(0, 0, 256, 256);
    const dots = [['#c9b57a', 3], ['#a89560', 4], ['#d9c88f', 3]];
    for (let i = 0; i < 420; i++) { const [col, r] = dots[i % 3]; x.fillStyle = col; x.beginPath(); x.arc(rnd() * 256, rnd() * 256, r * (0.7 + rnd() * 0.6), 0, 7); x.fill(); }
  } else if (kind === 'bound') {
    const g = x.createLinearGradient(0, 0, 256, 256); g.addColorStop(0, '#6f8f8c'); g.addColorStop(1, '#456a6b'); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    const r = x.createRadialGradient(128, 128, 60, 128, 128, 180); r.addColorStop(0, 'rgba(79,214,196,0)'); r.addColorStop(1, 'rgba(79,214,196,.55)'); x.fillStyle = r; x.fillRect(0, 0, 256, 256);
  } else {
    const g = x.createLinearGradient(0, 0, 256, 256); g.addColorStop(0, '#b9c1c1'); g.addColorStop(1, '#7d878a'); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(0,0,0,.2)'; x.lineWidth = 1.5;
    for (let i = 0; i <= 256; i += 25.6) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); }
    x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 6; x.strokeRect(0, 0, 256, 256);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
export function buildModule(root) {
  const g = new THREE.Group();
  const c = station.moduleAt; g.position.copy(c); g.scale.setScalar(1.45);
  const box3 = (s) => new THREE.BoxGeometry(s, s, s);
  const edges = (s, col, op) => new THREE.LineSegments(new THREE.EdgesGeometry(box3(s)), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op }));
  const rawT = heroTex('core'), boundT = heroTex('bound');
  const coreM = new THREE.MeshStandardMaterial({ map: rawT, roughness: 0.9, emissive: '#4fd6c4', emissiveIntensity: 0 });
  const linerM = new THREE.MeshStandardMaterial({ color: '#1d6a8f', roughness: 0.2, metalness: 0.1, emissive: '#0f4a5e', emissiveIntensity: 0.8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const shellM = new THREE.MeshStandardMaterial({ map: heroTex('shell'), roughness: 0.75, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const core = mesh(box3(1.9), coreM); core.position.y = 1.35;
  const coreE = edges(1.9, '#000000', 0.25); core.add(coreE);
  const liner = mesh(box3(2.25), linerM, false); liner.position.y = 1.35; liner.renderOrder = 6;
  const linerE = edges(2.25, '#4fd6c4', 0); liner.add(linerE);
  const shell = mesh(box3(2.7), shellM, false); shell.position.y = 1.35; shell.renderOrder = 7;
  const shellE = edges(2.7, '#ffffff', 0); shell.add(shellE);
  g.add(core, liner, shell);
  // teal glow on the floor, as under the old cube
  const gc = document.createElement('canvas'); gc.width = gc.height = 128; const gx = gc.getContext('2d');
  const rg = gx.createRadialGradient(64, 64, 0, 64, 64, 64); rg.addColorStop(0, 'rgba(79,214,196,.32)'); rg.addColorStop(1, 'rgba(79,214,196,0)'); gx.fillStyle = rg; gx.fillRect(0, 0, 128, 128);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.42; g.add(glow);
  root.add(g);
  // the first template's lab: dark teal dome glowing behind the cube, teal perspective grid floor, drifting dust
  const labU = { uOp: { value: 0 }, uC: { value: new V3(c.x, c.y, c.z) }, uCamP: U.uCam };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(13, 48, 32), new THREE.ShaderMaterial({
    uniforms: labU, side: THREE.BackSide, transparent: true, depthWrite: false,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform float uOp; uniform vec3 uC; uniform vec3 uCamP; varying vec3 vW;
      void main(){ vec3 d=normalize(vW-uC); vec3 back=normalize(uC-uCamP);
        float glow=pow(max(dot(d,back)*.5+.5,0.),3.2);
        vec3 col=mix(vec3(.020,.059,.078),vec3(.039,.173,.216),smoothstep(.0,.55,glow));
        col=mix(col,vec3(.078,.376,.416),smoothstep(.55,1.,glow));
        gl_FragColor=vec4(col,uOp); }`,
  }));
  dome.position.copy(c); dome.renderOrder = -1; dome.frustumCulled = false; root.add(dome);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(12.8, 64), new THREE.ShaderMaterial({
    uniforms: labU, transparent: true, depthWrite: true,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform float uOp; uniform vec3 uC; varying vec3 vW;
      void main(){ vec2 p=(vW.xz-uC.xz)/1.6; vec2 g=abs(fract(p-.5)-.5)/fwidth(p);
        float line=1.-min(min(g.x,g.y),1.); float r=length(vW.xz-uC.xz);
        vec3 base=mix(vec3(.031,.137,.165),vec3(.016,.047,.063),smoothstep(2.,12.,r));
        vec3 col=base+vec3(.31,.84,.77)*line*.22*(1.-smoothstep(3.,12.5,r));
        gl_FragColor=vec4(col,uOp); }`,
  }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(c.x, c.y - 0.02, c.z); floor.renderOrder = -1; root.add(floor);
  const dust = puffs({ count: 120, origin: [c.x, c.y + 3, c.z], jit: [18, 9, 18], vel: [0, 0.35, 0], spread: [0.1, 0.1, 0.1], life: 14, size: [0.08, 0.14], color: '#bff5ee', opacity: 0, lit: 0, order: 8 });
  root.add(dust);
  // its own key + rim light so the colours read clearly
  const key = new THREE.PointLight('#fff6ea', 0, 30, 1.2); key.position.set(c.x - 6, c.y + 7, c.z + 8); root.add(key);
  const rim = new THREE.PointLight('#4fd6c4', 0, 20, 1.4); rim.position.set(c.x + 5, c.y + 3, c.z - 5); root.add(rim);
  const st = { stage: 0, peel: 0, s: [0, 0, 0, 0], p: 0, light: 0 };
  updaters.push((t, dt) => {
    const k = st.snap ? 1 : Math.min(1, dt * 2.4);
    for (let i = 1; i <= 3; i++) st.s[i] += ((st.stage >= i ? 1 : 0) - st.s[i]) * k;
    st.p += ((st.peel ? 1 : 0) - st.p) * k;
    st.light += ((st.active ? 1 : 0) - st.light) * (st.snap ? 1 : Math.min(1, dt * 1.5));
    key.intensity = 70 * st.light; rim.intensity = 28 * st.light;
    labU.uOp.value = st.light; dome.visible = floor.visible = st.light > 0.005;
    dome.material.depthWrite = st.light > 0.6; dome.material.transparent = floor.material.transparent = st.light < 0.995;
    dust.material.uniforms.uOpacity.value = 0.8 * st.light;
    coreM.map = st.s[1] > 0.5 ? boundT : rawT; coreM.emissiveIntensity = 0.12 * st.s[1];
    coreE.material.opacity = 0.25 * (1 - st.s[1]);
    linerM.opacity = 0.5 * st.s[2] * (1 - 0.45 * st.p); liner.scale.setScalar(1 + (1 - st.s[2]) * 0.7); liner.visible = st.s[2] > 0.01;
    linerE.material.opacity = 0.95 * st.s[2];
    shellM.opacity = st.s[3] * (1 - 0.88 * st.p); shell.scale.setScalar(1 + (1 - st.s[3]) * 0.8); shell.visible = st.s[3] > 0.01;
    const opaque = shellM.opacity > 0.985; shellM.transparent = !opaque; shellM.depthWrite = opaque;
    shellE.material.opacity = 0.45 * st.s[3];
    g.rotation.y += dt * 0.21;
  });
  return st;
}

let _rock;
function rockGeo() {
  if (_rock) return _rock;
  const rg = new THREE.IcosahedronGeometry(1, 2), p = rg.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = new V3().fromBufferAttribute(p, i); v.multiplyScalar(0.72 + fbm(v.x * 1.7 + 5, v.y * 1.7 + v.z * 1.3, 3) * 0.55); p.setXYZ(i, v.x, v.y, v.z); }
  rg.computeVertexNormals(); return (_rock = rg);
}

/* ======================= wind turbine + gravity base ======================= */
function bladeGeo(L) {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5); s.bezierCurveTo(L * 0.18, -1.6, L * 0.6, -0.9, L, -0.12); s.lineTo(L, 0.1); s.bezierCurveTo(L * 0.6, 0.45, L * 0.2, 0.7, 0, 0.5); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.12, bevelSegments: 2, curveSegments: 16 });
  g.translate(0, 0, -0.17);
  return g;
}
export function turbine(x, z, opts = {}) {
  const g = new THREE.Group();
  const white = std('#eef0ee', { r: 0.35, m: 0.05, key: 'tw' });
  const yellowTP = std('#e3b13b', { r: 0.5, m: 0.2 });
  const gy = ground(x, z), s = opts.scale || 1;
  const towerH = 62 * s, hubY = 7 + towerH + 1.5 * s;
  if (opts.base) {
    const clip = opts.cut ? [new THREE.Plane(new V3(0, 0, -1), z)] : null;
    const bm = std('#bdbab0', { map: texRep('concrete', 6, 2), r: 0.9, side: THREE.DoubleSide, clip, fresh: true, key: 'gb' });
    const inner = std('#1d6a8f', { r: 0.35, side: THREE.BackSide, clip, fresh: true, key: 'gbi', e: '#0f4a5e', ei: 0.7 });  // HDPE liner wall
    const slab = at(cyl(17, 17.5, 3, bm, 48), x, gy + 1.5, z); g.add(slab);
    g.add(at(cyl(16.4, 16.9, 2.9, inner, 48), x, gy + 1.5, z));
    const cone = at(cyl(5, 14, 11, bm, 48), x, gy + 3 + 5.5, z); g.add(cone);
    g.add(at(cyl(4.6, 13.4, 10.8, inner, 48), x, gy + 3 + 5.5, z));
    const shaftH = 4 - (gy + 14);
    g.add(at(cyl(4, 4, shaftH, bm, 32), x, gy + 14 + shaftH / 2, z));
    // ballast modules inside the base
    const mm = new THREE.MeshStandardMaterial({ color: '#d2c38f', map: tex('gypsum'), roughness: 1, emissive: '#3a3420', emissiveIntensity: 0.6, clippingPlanes: clip || [] });
    patch(mm, { key: 'bm' });
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, 2.3, 2.3), mm, 260); const d = new THREE.Object3D(); let k = 0;
    for (let lv = 0; lv < 5; lv++) {
      const y = gy + 1.3 + lv * 2.4, rMax = lv === 0 ? 15.5 : 13 - (lv - 1) * 2.1;
      for (let ix = -7; ix <= 7; ix++) for (let iz = -7; iz <= 7; iz++) {
        const px = ix * 2.45, pz = iz * 2.45; if (Math.hypot(px, pz) > rMax - 1.4 || k >= 260) continue;
        d.position.set(x + px, y, z + pz); d.updateMatrix(); inst.setMatrixAt(k++, d.matrix);
      }
    }
    inst.count = k; g.add(inst);
    // the old diagram's look: dark outlines on every block and a pulsing teal dot (sensor) on each face
    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(2.3, 2.3, 2.3)).attributes.position.array, lines = [], dots = [];
    const mtx = new THREE.Matrix4(), v = new V3();
    for (let i = 0; i < k; i++) { inst.getMatrixAt(i, mtx); for (let j = 0; j < eg.length; j += 3) { v.set(eg[j], eg[j + 1], eg[j + 2]).applyMatrix4(mtx); lines.push(v.x, v.y, v.z); } v.set(0, 0, 1.17).applyMatrix4(mtx); dots.push(v.clone()); }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#2a5560', clippingPlanes: clip || [] })));
    const dotM = new THREE.MeshBasicMaterial({ color: '#4fd6c4', transparent: true, clippingPlanes: clip || [] });
    const di = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), dotM, dots.length);
    dots.forEach((p, i) => { d.position.copy(p); d.scale.setScalar(1); d.updateMatrix(); di.setMatrixAt(i, d.matrix); });
    g.add(di); updaters.push((t) => { dotM.opacity = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2.6)); });
    // scour protection rock ring
    const rock = new THREE.InstancedMesh(rockGeo(), std('#77736a', { r: 0.95, key: 'rk' }), 220);
    for (let i = 0; i < 220; i++) { const a = R(0, 6.28), r = R(17.6, 23); const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; d.position.set(px, ground(px, pz) + 0.05, pz); d.scale.set(R(0.4, 0.95), R(0.3, 0.6), R(0.4, 0.9)); d.rotation.set(R(0, 3), R(0, 3), 0); d.updateMatrix(); rock.setMatrixAt(i, d.matrix); }
    g.add(rock);
  } else if (gy < 0) {
    g.add(at(cyl(3.4 * s, 3.4 * s, 7 - gy, white), x, gy + (7 - gy) / 2, z));
  }
  g.add(at(cyl(3.6 * s, 3.6 * s, 5 * s, yellowTP, 32), x, 2 + 2.5 * s, z));
  g.add(at(cyl(6.5 * s, 6.5 * s, 0.4 * s, std('#7d878a', { r: 0.6, m: 0.5 }), 32), x, 7, z));
  g.add(at(cyl(1.9 * s, 3 * s, towerH, white, 32), x, 7 + towerH / 2, z));
  const nac = at(box(3.6 * s, 3.8 * s, 12 * s, white), x, hubY, z - 3 * s); g.add(nac);
  const rotor = new THREE.Group(); rotor.position.set(x, hubY, z + 3.4 * s);
  rotor.add(at(mesh(new THREE.SphereGeometry(1.8 * s, 20, 14), white), 0, 0, 0.6 * s));
  const bg = bladeGeo(34 * s);
  for (let i = 0; i < 3; i++) { const b = mesh(bg, white); b.rotation.z = i * Math.PI * 2 / 3; rotor.add(b); }
  g.add(rotor);
  const sp = opts.speed || 0.9, ph = R(0, 6);
  updaters.push((t) => { rotor.rotation.z = -(t * sp + ph); });
  return g;
}

/* ======================= products: breakwater, floating solar, tidal, reefs ======================= */
export function buildProducts(root) {
  const g = new THREE.Group(); root.add(g);
  const modM = moduleMat(); const d = new THREE.Object3D();
  // detached breakwater built from modules
  const bw = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 2.6, 2.6), modM, 700); bw.castShadow = bw.receiveShadow = true;
  const algae = new THREE.Color('#7f8f5c'), clean = new THREE.Color('#ffffff'); let k = 0;
  const bx = 1062, bz = -72;
  for (let lv = 0; lv < 9; lv++) {
    const y = ground(bx, bz) + 1.2 + lv * 2.45; if (y > 3.6) break;
    const nx = 20 - lv * 2, nz = Math.max(1, 5 - Math.floor(lv / 2));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      if (k >= 700) break;
      d.position.set(bx + (i - (nx - 1) / 2) * 2.7 + R(-0.3, 0.3), y + R(-0.2, 0.2), bz + (j - (nz - 1) / 2) * 2.7 + R(-0.3, 0.3));
      d.rotation.set(R(-0.12, 0.12), R(-0.3, 0.3), R(-0.12, 0.12)); d.scale.setScalar(1); d.updateMatrix(); bw.setMatrixAt(k, d.matrix);
      bw.setColorAt(k, y < 0.5 ? algae.clone().lerp(clean, Math.max(0, (y + 10) / 14)) : clean); k++;
    }
  }
  bw.count = k; g.add(bw);
  // floating solar on HDPE floats, moored to module anchors
  const floatM = std('#e9ebe6', { r: 0.6 }), pv = std('#1b2f4f', { r: 0.18, m: 0.55, key: 'pv' }), frame = std('#c3c8ca', { r: 0.3, m: 0.8 });
  const array = new THREE.Group(); const sx = 1145, sz = -86;
  for (let i = 0; i < 9; i++) for (let j = 0; j < 5; j++) {
    const cell = new THREE.Group();
    cell.add(at(box(2.3, 0.45, 1.7, floatM), 0, 0, 0));
    const p = at(box(2.1, 0.06, 1.25, pv), 0, 0.45, 0); p.rotation.x = -0.24; cell.add(p);
    cell.add(at(box(2.15, 0.04, 0.06, frame), 0, 0.22, 0.62));
    at(cell, (i - 4) * 2.45, 0, (j - 2) * 1.95); array.add(cell);
  }
  array.position.set(sx, 0.15, sz); g.add(array);
  updaters.push((t) => { array.position.y = 0.15 + Math.sin(t * 0.8) * 0.12; array.rotation.z = Math.sin(t * 0.6) * 0.012; array.rotation.x = Math.sin(t * 0.5 + 1) * 0.01; });
  const rope = std('#3a3f3a', { r: 0.9 });
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([ax, az]) => {
    const top = new V3(sx + ax * 11, -0.2, sz + az * 5), ax2 = sx + ax * 19, az2 = sz + az * 11, bot = new V3(ax2, ground(ax2, az2) + 1.6, az2);
    const L = top.distanceTo(bot), m = mesh(new THREE.CylinderGeometry(0.06, 0.06, L, 5), rope, false);
    m.position.copy(top).add(bot).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new V3(0, 1, 0), bot.clone().sub(top).normalize()); g.add(m);
    const a = mesh(new THREE.BoxGeometry(3, 2.2, 3), modM); a.position.set(ax2, ground(ax2, az2) + 1.0, az2); a.rotation.y = R(0, 1); g.add(a);
  });
  // tidal turbine on a ballast-module base
  const tx = 1236, tz = -58, ty = ground(tx, tz);
  const tid = new THREE.Group(); tid.position.set(tx, ty, tz);
  const steelY = std('#e0b23e', { r: 0.45, m: 0.4 }), steel = std('#8b979b', { r: 0.4, m: 0.7 });
  tid.add(at(box(9, 2.4, 9, modM), 0, 1.2, 0));
  [[-3, -3], [3, -3], [0, 3.5]].forEach(([lx, lz]) => { const l = mesh(new THREE.CylinderGeometry(0.35, 0.45, 9, 10), steel); l.position.set(lx * 0.55, 6.5, lz * 0.55); l.rotation.set(lz * 0.05, 0, -lx * 0.05); tid.add(l); });
  const nac = mesh(new THREE.CapsuleGeometry(1.1, 5, 6, 16), steelY); nac.rotation.x = Math.PI / 2; nac.position.y = 11; tid.add(nac);
  const rot = new THREE.Group(); rot.position.set(0, 11, 3.9); const tb = bladeGeo(6.5);
  for (let i = 0; i < 3; i++) { const b = mesh(tb, steelY); b.rotation.z = i * 2.094; rot.add(b); }
  rot.add(mesh(new THREE.SphereGeometry(0.9, 14, 10), steelY)); tid.add(rot); g.add(tid);
  updaters.push((t) => { rot.rotation.z = t * 0.7; });
  // reef blocks with life
  const reef = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 2.6, 2.6), std('#b3ae98', { map: texRep('concrete', 1, 1), r: 1, key: 'reef' }), 24);
  for (let i = 0; i < 24; i++) { const x = 1182 + R(-10, 10), z = -40 + R(-8, 8); d.position.set(x, ground(x, z) + 1.1 + (i % 4 === 0 ? 2.4 : 0), z); d.rotation.set(R(-0.2, 0.2), R(0, 3), R(-0.2, 0.2)); d.scale.setScalar(1); d.updateMatrix(); reef.setMatrixAt(i, d.matrix); }
  reef.castShadow = true; g.add(reef);
  return g;
}

/* ======================= open water: barge, roadmap buoys, monitoring buoy ======================= */
export const roadBuoys = [];
export function buildOpenWater(root) {
  const g = new THREE.Group(); root.add(g);
  const modM = moduleMat();
  // barge carrying modules + tug
  const barge = new THREE.Group();
  barge.add(at(box(34, 3, 11, std('#5c6a6e', { r: 0.6, m: 0.4 })), 0, 0.3, 0));
  barge.add(at(box(34.2, 0.6, 11.2, std('#a3402f', { r: 0.7 })), 0, -0.9, 0));
  const ld = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 2.6, 2.6), modM, 40); const d = new THREE.Object3D(); let k = 0;
  for (let i = 0; i < 10; i++) for (let j = 0; j < 3; j++) for (let l = 0; l < (i % 3 ? 1 : 2); l++) { d.position.set(-14 + i * 3, 3.1 + l * 2.65, (j - 1) * 3.1); d.updateMatrix(); if (k < 40) ld.setMatrixAt(k++, d.matrix); }
  ld.count = k; ld.castShadow = true; barge.add(ld);
  barge.position.set(1352, 0, -96); barge.rotation.y = 0.12; g.add(barge); bobbing(barge, 0, 0.12);
  const tug = boat(12, '#2c4f63', '#e6e1d6'); tug.position.set(1382, 0, -92); tug.rotation.y = 0.12; g.add(tug); bobbing(tug, 0.2, 0.12);
  // roadmap buoys to the horizon
  const yel = std('#e8b53b', { r: 0.5, m: 0.2 }), dark = std('#2e3437', { r: 0.6, m: 0.4 });
  const spots = [[1438, -34], [1466, -86], [1430, -150], [1474, -232], [1448, -340]];
  spots.forEach(([x, z], i) => {
    const b = new THREE.Group();
    b.add(at(cyl(1.0, 1.2, 1.8, yel, 24), 0, 0.3, 0));
    b.add(at(mesh(new THREE.ConeGeometry(0.9, 1.6, 24), yel), 0, 2.0, 0));
    b.add(at(cyl(0.08, 0.08, 2.2, dark, 6), 0, 3.6, 0));
    const lm = new THREE.MeshStandardMaterial({ color: '#33403f', emissive: '#4fd6c4', emissiveIntensity: 0 });
    b.add(at(mesh(new THREE.SphereGeometry(0.32, 12, 8), lm, false), 0, 4.8, 0));
    const light = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('soft'), color: '#4fd6c4', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })); light.scale.setScalar(7); light.position.y = 4.8; b.add(light);
    b.position.set(x, 0, z); g.add(b); bobbing(b, 0, 0);
    roadBuoys.push({ g: b, lm, light, on: 0, target: 0, pos: new V3(x, 6.3, z) });
  });
  updaters.push((t, dt) => roadBuoys.forEach(r => { r.on += (r.target - r.on) * Math.min(1, dt * 3); r.lm.emissiveIntensity = r.on * (5 + Math.sin(t * 3) * 1.5); r.light.material.opacity = r.on * 0.9; }));
  // monitoring buoy (trust scene)
  const mb = new THREE.Group();
  mb.add(at(cyl(1.7, 1.9, 1.3, yel, 32), 0, 0.2, 0));
  mb.add(at(cyl(0.3, 0.3, 4, dark, 8), 0, 2.6, 0));
  const pnl = at(box(1.4, 0.06, 1.0, std('#1b2f4f', { r: 0.2, m: 0.6 })), 0.5, 3.4, 0); pnl.rotation.z = 0.5; mb.add(pnl);
  mb.add(at(cyl(0.03, 0.03, 1.6, dark, 4), -0.2, 5.3, 0));
  const blink = new THREE.MeshStandardMaterial({ color: '#333', emissive: '#f2b24c', emissiveIntensity: 4 });
  mb.add(at(mesh(new THREE.SphereGeometry(0.18, 10, 8), blink, false), 0, 4.8, 0));
  const cage = at(cyl(0.6, 0.6, 3.5, std('#8a9396', { r: 0.4, m: 0.7 }), 10), 0, -2.6, 0); mb.add(cage);
  mb.add(at(cyl(0.05, 0.05, 18, dark, 4), 0, -12, 0));
  mb.position.set(1588, 0, -16); g.add(mb); bobbing(mb, 0, 0);
  updaters.push((t) => { blink.emissiveIntensity = (Math.sin(t * 4) > 0.6) ? 6 : 0.2; });
  return g;
}

/* ======================= the restored beach ======================= */
export function buildBeach(root) {
  const g = new THREE.Group(); root.add(g);
  const white = std('#ffffff', { map: texRep('windows', 3, 1), r: 0.8, key: 'hotel' });
  const plain = std('#f3efe6', { r: 0.85 });
  const blue = std('#2d6fa3', { r: 0.6 });
  [[1712, -128, 30, 12, 15], [1758, -138, 26, 16, 14], [1804, -126, 34, 10, 16], [1856, -134, 28, 14, 14], [1680, -150, 22, 9, 12]].forEach(([x, z, w, h, dd]) => {
    const y = ground(x, z);
    const b = at(box(w, h, dd, white), x, y + h / 2, z);
    b.material = [white, white, plain, plain, white, white]; g.add(b);
    g.add(at(box(w * 0.3, 2.2, dd * 0.4, plain), x + w * 0.25, y + h + 1.1, z));
    g.add(at(mesh(new THREE.SphereGeometry(2.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), blue), x - w * 0.3, y + h, z));
  });
  for (let i = 0; i < 14; i++) { const x = 1672 + i * 16 + R(-4, 4), z = -88 - R(0, 14); g.add(palm(x, z, R(0.9, 1.3), R(-0.4, 0.4), false)); }
  const cols = ['#e5694b', '#f2b24c', '#4fd6c4', '#f4f1ea', '#2d6fa3'];
  for (let i = 0; i < 12; i++) {
    const x = 1676 + i * 13 + R(-3, 3), z = -80 - R(0, 3), y = ground(x, z);
    const u = new THREE.Group();
    u.add(at(cyl(0.05, 0.05, 2.6, std('#ddd'), 6), 0, 1.3, 0));
    u.add(at(mesh(new THREE.ConeGeometry(1.7, 0.55, 12), std(cols[i % 5], { r: 0.8 })), 0, 2.6, 0));
    u.add(at(box(0.8, 0.12, 2, std('#efe9dc')), 1.1, 0.35, 0.6));
    u.position.set(x, y, z); u.rotation.y = R(0, 3); g.add(u);
  }
  [[1690, -24, 1], [1748, -46, 0.8], [1610, -60, 0.7]].forEach(([x, z, s]) => { const sb = sailboat(s); sb.position.set(x, 0, z); g.add(sb); bobbing(sb, 0.1, R(0, 3)); });
  return g;
}
function sailboat(s) {
  const g = boat(7 * s, '#f6f4ee', '#f6f4ee');
  g.children.splice(1, 2);
  const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0, 8 * s); sh.lineTo(3.6 * s, 0.4); sh.closePath();
  const sail = mesh(new THREE.ShapeGeometry(sh), std('#fbfaf6', { r: 0.9, side: THREE.DoubleSide }));
  sail.position.set(0.6 * s, 1.2, 0); g.add(sail);
  const jib = new THREE.Shape(); jib.moveTo(0, 0); jib.lineTo(0, 6 * s); jib.lineTo(-2.4 * s, 0.4); jib.closePath();
  const j = mesh(new THREE.ShapeGeometry(jib), std('#f2b24c', { r: 0.9, side: THREE.DoubleSide })); j.position.set(0.4 * s, 1.2, 0.05); g.add(j);
  const mast = g.children[1]; mast.scale.y = 3; mast.position.set(0.6 * s, 5.4, 0);
  return g;
}

/* ======================= life: seagrass, rocks, fish schools ======================= */
export function buildLife(root) {
  const g = new THREE.Group(); root.add(g);
  const d = new THREE.Object3D();
  const blade = new THREE.PlaneGeometry(0.14, 1.5, 1, 5); blade.translate(0, 0.75, 0);
  const grassM = std('#4c7a35', {
    r: 0.8, side: THREE.DoubleSide, key: 'grass', caustic: 1.2,
    vert: `#ifdef USE_INSTANCING
      float hh=position.y/1.5; vec3 ip=vec3(instanceMatrix[3][0],0.,instanceMatrix[3][2]);
      transformed.x+=sin(uTime*1.3+ip.x*.35+ip.z*.2)*.35*hh*hh; transformed.z+=cos(uTime*1.1+ip.x*.2)*.22*hh*hh;
      #endif`,
  });
  const N = 16000, grass = new THREE.InstancedMesh(blade, grassM, N); let k = 0, tries = 0;
  const col = new THREE.Color(), c1 = new THREE.Color('#4f7d37'), c2 = new THREE.Color('#2f5a2a');
  while (k < N && tries < 400000) {
    tries++;
    const x = R(640, 1700), z = R(-260, 90), y = ground(x, z);
    if (y > -2.5 || y < -36) continue;
    const m = fbm(x * 0.013, z * 0.013, 3); if (m < 0.5 + rnd() * 0.08) continue;
    d.position.set(x, y - 0.05, z); d.rotation.set(R(-0.15, 0.15), R(0, 6), R(-0.15, 0.15)); d.scale.set(1, R(0.6, 1.4), 1); d.updateMatrix();
    grass.setMatrixAt(k, d.matrix); grass.setColorAt(k, col.copy(c1).lerp(c2, rnd())); k++;
  }
  grass.count = k; g.add(grass);
  // rocks
  const rg = rockGeo();
  const rocks = new THREE.InstancedMesh(rg, std('#7a7466', { r: 0.95, key: 'rk' }), 700); rocks.castShadow = rocks.receiveShadow = true;
  for (let i = 0; i < 700; i++) { const x = R(-200, 1900), z = R(-260, 90); const s = R(0.5, 3) * (rnd() > 0.92 ? 2.2 : 1); d.position.set(x, ground(x, z) - s * 0.3, z); d.rotation.set(R(0, 3), R(0, 3), R(0, 3)); d.scale.set(s, s * R(0.5, 0.9), s * R(0.7, 1.2)); d.updateMatrix(); rocks.setMatrixAt(i, d.matrix); }
  g.add(rocks);
  // fish schools (clean water only)
  const fishM = std('#c9d6da', {
    r: 0.42, m: 0.08, side: THREE.DoubleSide, key: 'fish',
    vert: `#ifdef USE_INSTANCING
      float tw=sin(uTime*11.+float(gl_InstanceID)*2.37); transformed.z+=tw*.14*smoothstep(.1,-.7,position.x);
      #endif`,
  });
  const schools = [
    { c: [918, -9, -68], r: 14, n: 60, sp: 0.28, s: 0.75 }, { c: [878, -16, -48], r: 8, n: 30, sp: -0.4, s: 0.6 },
    { c: [1180, -14, -36], r: 10, n: 70, sp: 0.35, s: 0.8 }, { c: [1240, -9, -20], r: 18, n: 50, sp: -0.22, s: 1.2 },
    { c: [1110, -6, -30], r: 12, n: 40, sp: 0.3, s: 0.7 }, { c: [1060, -7, -50], r: 8, n: 30, sp: 0.45, s: 0.6 },
    { c: [700, -5, -10], r: 10, n: 30, sp: 0.3, s: 0.7 }, { c: [1600, -8, -5], r: 14, n: 50, sp: 0.3, s: 0.8 },
  ];
  const total = schools.reduce((a, s) => a + s.n, 0);
  const fish = new THREE.InstancedMesh(FISH, fishM, total); fish.frustumCulled = false; g.add(fish);
  const fc = new THREE.Color(), fcs = ['#c7d3d6', '#9fb3ba', '#d8c99c', '#a9bcc0'];
  const offs = []; let fi = 0;
  schools.forEach((s, si) => { for (let i = 0; i < s.n; i++) { offs.push({ s, a: rnd() * 6.28, dr: R(-3, 3), dy: R(-2.2, 2.2), ph: R(0, 6) }); fish.setColorAt(fi++, fc.set(fcs[si % 4])); } });
  updaters.push((t) => {
    offs.forEach((o, i) => {
      const s = o.s, a = o.a + t * s.sp * (12 / s.r), r = s.r + o.dr + Math.sin(t * 0.3 + o.ph) * 1.5;
      d.position.set(s.c[0] + Math.cos(a) * r, s.c[1] + o.dy + Math.sin(t * 0.5 + o.ph) * 0.6, s.c[2] + Math.sin(a) * r * 0.6);
      d.rotation.set(0, -a + (s.sp > 0 ? -Math.PI / 2 : Math.PI / 2), Math.sin(t + o.ph) * 0.08);
      d.scale.setScalar(s.s * (0.8 + (i % 5) * 0.08)); d.updateMatrix(); fish.setMatrixAt(i, d.matrix);
    });
    fish.instanceMatrix.needsUpdate = true;
  });
  return g;
}
