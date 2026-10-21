import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { U, cleanAt, PALETTE } from './env.js';
import { buildTerrain } from './terrain.js';
import { buildWater, marineSnow, bubbles, puffSystems } from './water.js';
import { buildShore, buildDeadZone, buildStation, buildModule, turbine, buildProducts, buildOpenWater, buildBeach, buildLife, updaters, station, roadBuoys } from './props.js';

const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const lerp = THREE.MathUtils.lerp, ss = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const SHOT = /[?&]shot/.test(location.search);
if (SHOT) document.body.classList.add('shot');

/* ---------------- renderer ---------------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) { $('#nogl').hidden = false; throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
$('#gl').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.3, 30000);

/* ---------------- sky + light ---------------- */
const sky = new Sky(); sky.scale.setScalar(20000); scene.add(sky);
const sun = new THREE.DirectionalLight('#ffffff', 3); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 1, far: 900 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight('#bcd9ec', '#4a3f30', 1.1); scene.add(hemi);
const rov = new THREE.SpotLight('#fff1dc', 0, 90, 0.62, 0.7, 1.5); camera.add(rov); rov.position.set(0.8, -0.6, 0); rov.target.position.set(0, -6, -30); camera.add(rov.target); scene.add(camera);

/* ---------------- world ---------------- */
const world = new THREE.Group(); scene.add(world);
const { mesh: terrain, ht } = buildTerrain(); world.add(terrain);
const water = buildWater(ht); scene.add(water);
scene.add(marineSnow());
const bub = bubbles(); scene.add(bub);
buildShore(world); buildDeadZone(world); buildStation(world);
const hero = buildModule(world);
world.add(turbine(910, -40, { base: true, cut: true, speed: 0.75 }));
[[1000, -250, 0.8], [1120, -330, 0.85], [1260, -255, 0.8], [1390, -380, 0.9], [1530, -300, 0.8], [1190, -540, 0.9], [1440, -560, 0.9], [1650, -460, 0.85], [870, -420, 0.8]]
  .forEach(([x, z, s]) => world.add(turbine(x, z, { scale: s, speed: 0.6 + Math.random() * 0.4 })));
buildProducts(world); buildOpenWater(world); buildBeach(world); buildLife(world);

/* ---------------- camera stops ---------------- */
const STOPS = [
  { p: [-22, 7, -22], t: [55, 13, -132], shift: 0.2 },      // 1 shore
  { p: [212, -7, -4], t: [236, -9, -32], shift: 0.2 },       // 2 plume
  { p: [354, -45, 8], t: [380, -57, -18], shift: 0 },        // 3 seabed / who pays
  { p: [564, 9.5, 10], t: [598, 4.6, -28], shift: 0.2,       // 4 intercept: watch the outfall…
    dive: { p: [688, 10, 36], t: [690, 7, -40], fov: 62, dur: 4500 } },  // …then, once it is dry, face the outputs
  { p: [699.4, 8.8, -15.8], t: [706, 6.7, -26], shift: 0.2, fov: 46 },  // 5 module (lab close-up)
  { p: [868, 4, 42], t: [904, 24, -40], shift: 0.2, fov: 60,      // 6 turbine: arrive above the water…
    dive: { p: [887, -12.5, -2], t: [910, -19.5, -40], fov: 54 } }, // …then dive to the cut-open base
  { p: [1110, 6, 50], t: [1150, 3, -70], shift: 0, fov: 60,      // 7 products: arrive above the water…
    dive: { p: [1168, -8, 6], t: [1192, -15, -60], fov: 64 } },    // …then dive to the anchors, reefs and tidal base
  { p: [1318, 10, 30], t: [1370, 3, -110], shift: 0 },       // 8 business model
  { p: [1452, 13, 26], t: [1452, 1, -200], shift: 0 },       // 9 road
  { p: [1574, 3.6, 4], t: [1588, 2.6, -16], shift: 0 },      // 10 trust & team
  { p: [1652, 7, 44], t: [1740, 6, -96], shift: 0.2 },       // 11 the ask
].map(s => ({ p: new THREE.Vector3(...s.p), t: new THREE.Vector3(...s.t), shift: s.shift, fov: s.fov || 52,
  dive: s.dive && { p: new THREE.Vector3(...s.dive.p), t: new THREE.Vector3(...s.dive.t), fov: s.dive.fov, dur: s.dive.dur || 6000 } }));

const cam = { p: STOPS[0].p.clone(), t: STOPS[0].t.clone(), shift: STOPS[0].shift, fov: 52 };
let flight = null, cur = -1, dive = null, phase = 1;
function startDive() {
  const d = STOPS[cur].dive; if (!d) return;
  if (SHOT) { const m = location.search.match(/dk=([\d.]+)/), k = m ? +m[1] : 1, e = ease(k);
    cam.p.lerp(d.p, e); cam.t.lerp(d.t, e); cam.fov = lerp(cam.fov, d.fov, e); phase = k >= 1 ? 2 : 1; return; }
  dive = { p0: cam.p.clone(), t0: cam.t.clone(), f0: cam.fov, d, st: performance.now(), dur: d.dur };
}
const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function flyTo(n, instant) {
  const s = STOPS[n];
  if (instant || SHOT) { cam.p.copy(s.p); cam.t.copy(s.t); cam.shift = s.shift; cam.fov = s.fov; flight = null; return; }
  const dist = cam.p.distanceTo(s.p);
  flight = { p0: cam.p.clone(), t0: cam.t.clone(), sh0: cam.shift, f0: cam.fov, s, st: performance.now(), dur: Math.min(5600, 2600 + dist * 6), bulge: Math.min(dist * 0.16, 40), rev: false };
}

/* ---------------- gate state ---------------- */
let gateTarget = 0;
function setGateFor(n) { gateTarget = n > 3 ? 1 : 0; }

/* ---------------- scenes / navigation ---------------- */
const scenes = $$('.scene');
const segs = $('#segs');
scenes.forEach((s, i) => { const b = document.createElement('button'); b.className = 'seg'; b.type = 'button'; b.title = s.dataset.name; b.setAttribute('aria-label', `Scene ${i + 1}: ${s.dataset.name}`); b.innerHTML = '<i></i>'; b.addEventListener('click', () => go(i)); segs.appendChild(b); });
let timers = [];
const later = (f, ms) => timers.push(setTimeout(f, ms));
function go(n, instant) {
  n = Math.max(0, Math.min(scenes.length - 1, n)); if (n === cur && !instant) return;
  timers.forEach(clearTimeout); timers = [];
  scenes.forEach(s => s.classList.remove('active')); hero.active = false;
  cur = n; dive = null; phase = 1; setGateFor(n); flyTo(n, instant);
  [...segs.children].forEach((b, i) => { b.classList.toggle('on', i === n); b.classList.toggle('done', i < n); });
  $('#now').textContent = `${n + 1} / ${scenes.length} · ${scenes[n].dataset.name}`;
  try { history.replaceState(null, '', location.search + '#s' + (n + 1)); } catch (e) { }
  $('#hint').style.opacity = 0;
  if (!flight) activate(n);
}
function runCounts(sc) {
  sc.querySelectorAll('[data-count]').forEach(el => {
    const to = +el.dataset.count, t0 = performance.now() + 500; if (SHOT) { el.textContent = to; return; }
    const step = (now) => { const k = Math.min(1, Math.max(0, (now - t0) / 1400)), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e); if (k < 1) requestAnimationFrame(step); };
    el.textContent = '0'; requestAnimationFrame(step);
  });
}
const hooks = {};
function activate(n) { hero.active = n === 4; const sc = scenes[n]; sc.classList.add('active'); runCounts(sc); hooks[n]?.(); }

hooks[0] = () => { const t0 = performance.now(); const iv = setInterval(() => { $('#tick').textContent = ((performance.now() - t0) / 1000 * 0.162).toFixed(1); }, 100); timers.push(iv); };
hooks[5] = hooks[6] = () => later(startDive, SHOT ? 0 : 1600);
hooks[3] = () => { gateTarget = 0; later(() => { gateTarget = 1; }, SHOT ? 0 : 2600); later(startDive, SHOT ? 0 : 5100); };
/* module build sequence */
const steps = $$('#steps li'), cap = $('#cap');
const caps = ['Dewatered cake, tested for radium and metals', 'Binder locks contaminants into a solid', 'HDPE liner: a second wall', 'Marine concrete shell: a certified module'];
function setStage(k) { hero.stage = k; cap.textContent = caps[k]; steps.forEach((li, i) => li.classList.toggle('on', i === Math.min(Math.max(k - 1, 0), 2) && k > 0 || (k === 0 && i === 0))); }
hooks[4] = () => { hero.peel = 0; $('#peel').classList.remove('on'); setStage(0); if (SHOT) { hero.snap = true; setStage(3); if (/peel/.test(location.search)) hero.peel = 1; return; } [1, 2, 3].forEach((k, i) => later(() => setStage(k), 1700 + i * 2000)); };
steps.forEach((li, i) => { const f = () => { timers.forEach(clearTimeout); setStage(i + 1); }; li.addEventListener('click', f); li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); f(); } }); });
$('#peel').addEventListener('click', () => { timers.forEach(clearTimeout); if (hero.stage < 3) setStage(3); hero.peel = hero.peel ? 0 : 1; $('#peel').classList.toggle('on', !!hero.peel); $('#peel').textContent = hero.peel ? 'Close it' : 'See inside'; });
/* road: light the gates in turn */
const roadCards = $$('#roadcards .card');
hooks[8] = () => { roadBuoys.forEach(b => b.target = 0); roadCards.forEach(c => c.classList.remove('on')); roadBuoys.forEach((b, i) => later(() => { b.target = 1; roadCards[i].classList.add('on'); }, SHOT ? 0 : 900 + i * 1100)); };
function leaveRoad() { if (cur !== 8) roadBuoys.forEach(b => b.target = 0); }

$('#prev').addEventListener('click', () => go(cur - 1)); $('#next').addEventListener('click', () => go(cur + 1));
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('.steps li') && (e.key === ' ' || e.key === 'Enter')) return;
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(cur + 1); }
  else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); go(cur - 1); }
  else if (e.key === 'Home') go(0); else if (e.key === 'End') go(scenes.length - 1);
  else if (e.key === 'f' || e.key === 'F') tfs();
});
function tfs() { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => { }); } catch (e) { } }
$('#fs').addEventListener('click', tfs);
let sx = 0, sy = 0; addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
addEventListener('pointerup', e => { const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) > 60 && Math.abs(dy) < 80 && e.pointerType !== 'mouse') go(cur + (dx < 0 ? 1 : -1)); });
let mx = 0, my = 0, pmx = 0, pmy = 0; addEventListener('pointermove', e => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; });

/* ---------------- labels anchored to 3D points ---------------- */
const labels = $$('.lbl').map(el => ({ el, s: +el.dataset.s - 1, ph: +(el.dataset.ph || 0), p: new THREE.Vector3(...el.dataset.p.split(',').map(Number)) }));
const tmp = new THREE.Vector3();
function placeLabels() {
  const W = innerWidth, Hh = innerHeight;
  labels.forEach(l => {
    const show = l.s === cur && !flight && !dive && scenes[cur].classList.contains('active') && (!l.ph || l.ph === phase);
    tmp.copy(l.p).project(camera);
    const vis = show && tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05;
    l.el.classList.toggle('on', vis);
    if (vis) l.el.style.transform = `translate(${((tmp.x + 1) / 2 * W).toFixed(1)}px,${((1 - tmp.y) / 2 * Hh).toFixed(1)}px)`;
  });
}

/* ---------------- environment per frame ---------------- */
const C = (h) => new THREE.Color(h);
const SKY = {
  horD: C('#c98d5e'), zenD: C('#2d2a36'), horC: C('#b9dceb'), zenC: C('#2e6aa6'),
  sunD: C('#ffae6e'), sunC: C('#fff1dc'), hemD: C('#8a7569'), hemC: C('#bcd9ec'),
};
const sunDir = new THREE.Vector3(), bg = new THREE.Color();
function environment() {
  const g = U.uGate.value, cc = cleanAt(cam.p.x, g);
  const elev = lerp(4.5, 42, cc) * Math.PI / 180, az = lerp(0.28, 2.25, ss(0.15, 1, cc));
  sunDir.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev)).normalize();
  U.uSunDir.value.copy(sunDir);
  const su = sky.material.uniforms;
  su.turbidity.value = lerp(14, 1.8, cc); su.rayleigh.value = lerp(3.6, 1.1, cc);
  su.mieCoefficient.value = lerp(0.016, 0.004, cc); su.mieDirectionalG.value = lerp(0.96, 0.85, cc);
  su.sunPosition.value.copy(sunDir).multiplyScalar(1000);
  U.uSunCol.value.copy(SKY.sunD).lerp(SKY.sunC, cc);
  U.uSkyHor.value.copy(SKY.horD).lerp(SKY.horC, cc); U.uSkyZen.value.copy(SKY.zenD).lerp(SKY.zenC, cc);
  sun.color.copy(U.uSunCol.value); sun.intensity = lerp(2.2, 3.6, cc);
  hemi.color.copy(SKY.hemD).lerp(SKY.hemC, cc); hemi.intensity = lerp(0.9, 1.25, cc);
  sun.position.copy(cam.t).addScaledVector(sunDir, 400); sun.target.position.copy(cam.t);
  const under = camera.position.y < 0;
  sky.visible = !under;
  if (under) {
    const w = PALETTE.watDirty.clone().lerp(PALETTE.watClean, cc).convertLinearToSRGB();
    const k = 0.32 + 0.68 * Math.exp(camera.position.y / 34);
    bg.setRGB(w.r * k, w.g * k, w.b * k, THREE.SRGBColorSpace); scene.background = bg;
  } else scene.background = null;
  renderer.toneMappingExposure = lerp(0.46, 0.6, cc) * lerp(1, 1.3, ss(0.3, -2.5, camera.position.y));
  rov.intensity = under ? lerp(3200, 700, cc) : 0;
  water.material.uniforms.uSplit.value = ss(5, 1.6, Math.abs(camera.position.y));
}

/* ---------------- loop ---------------- */
function resize() {
  renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); resizePoints();
}
function resizePoints() {
  const sc = renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  puffSystems.forEach(m => { if (m.uniforms.uScale) m.uniforms.uScale.value = sc; });
}
addEventListener('resize', resize); resize();
const clock = new THREE.Clock(); let T = 0;
const off = new THREE.Vector3(); let prevCamY = 1;
function frame(now) {
  const dt = Math.min(0.05, clock.getDelta()); T += dt; U.uTime.value = T;
  U.uGate.value += (gateTarget - U.uGate.value) * Math.min(1, dt * 0.9);
  station.lamp.color.set(U.uGate.value > 0.5 ? '#4fd6c4' : '#ff3b2a'); station.lamp.emissive.copy(station.lamp.color);
  station.wheel.rotation.z = U.uGate.value * 6;
  if (flight) {
    const f = flight, k = Math.min(1, (now - f.st) / f.dur), e = ease(k);
    cam.p.lerpVectors(f.p0, f.s.p, e); cam.t.lerpVectors(f.t0, f.s.t, e); cam.shift = lerp(f.sh0, f.s.shift, e); cam.fov = lerp(f.f0, f.s.fov, e);
    const back = cam.p.clone().sub(cam.t).setY(0).normalize();
    cam.p.addScaledVector(back, Math.sin(k * Math.PI) * f.bulge);
    if (!f.rev && k >= 0.62) { f.rev = true; activate(cur); }
    if (k >= 1) { flight = null; leaveRoad(); }
  }
  if (dive && !flight) {
    const d = dive, k = Math.min(1, (now - d.st) / d.dur), e = ease(k);
    cam.p.lerpVectors(d.p0, d.d.p, e); cam.t.lerpVectors(d.t0, d.d.t, e); cam.fov = lerp(d.f0, d.d.fov, e);
    if (k >= 1) { dive = null; phase = 2; }
  }
  pmx += (mx - pmx) * 0.04; pmy += (my - pmy) * 0.04;
  const breathe = SHOT ? 0 : 1;
  off.set(Math.sin(T * 0.21) * 0.6 * breathe + pmx * 2.2, Math.sin(T * 0.17) * 0.35 * breathe - pmy * 1.2, 0);
  camera.position.copy(cam.p).add(off);
  camera.lookAt(cam.t);
  if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); resizePoints(); }
  const W = innerWidth, Hh = innerHeight;
  camera.setViewOffset(W, Hh, -cam.shift * W, 0, W, Hh);
  U.uCam.value.copy(camera.position);
  if (prevCamY >= 0 && camera.position.y < 0) { bub.material.uniforms.uBurst.value = T; bub.material.uniforms.uFrom.value.copy(camera.position); }
  prevCamY = camera.position.y;
  environment();
  updaters.forEach(u => u(T, dt));
  renderer.render(scene, camera);
  placeLabels();
  requestAnimationFrame(frame);
}

const h = parseInt((location.hash || '').replace('#s', ''), 10);
const start = h >= 1 && h <= scenes.length ? h - 1 : 0;
U.uGate.value = start > 3 ? 1 : 0;
go(start, true);
requestAnimationFrame(frame);
document.body.classList.add('ready');
setTimeout(() => { if (cur === 0) $('#hint').style.opacity = 0.9; }, 2500); setTimeout(() => { $('#hint').style.opacity = 0; }, 9000);
