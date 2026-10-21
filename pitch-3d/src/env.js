import * as THREE from 'three';

/* Shared uniforms: one object, referenced by every patched material, so a single update reaches all. */
export const U = {
  uTime: { value: 0 },
  uCam: { value: new THREE.Vector3() },
  uGate: { value: 0 },           // 0 = outfall open (dirty), 1 = intercepted
  uSunDir: { value: new THREE.Vector3(0.3, 0.2, -1).normalize() },
  uSunCol: { value: new THREE.Color(1, 0.8, 0.6) },
  uSkyHor: { value: new THREE.Color() },
  uSkyZen: { value: new THREE.Color() },
};

/* Where the world is clean. Legacy sediment (x < ~470) never cleans: that is honest. */
export function cleanAt(x, gate) {
  const lo = THREE.MathUtils.lerp(650, 470, gate), hi = THREE.MathUtils.lerp(900, 640, gate);
  return THREE.MathUtils.smoothstep(x, lo, hi);
}

export const PALETTE = {
  airDirty: new THREE.Color('#9a7458'), airClean: new THREE.Color('#cfe3ee'),
  watDirty: new THREE.Color('#566046'), watClean: new THREE.Color('#0f6a80'),
};

/* fog is mixed after output conversion, so its constants are display (sRGB) values */
export const srgb = (c) => c.clone().convertLinearToSRGB().toArray().map(v => v.toFixed(4)).join(',');

export const FOG_PARS = /* glsl */`
uniform float uTime; uniform vec3 uCam; uniform float uGate;
uniform vec3 uSunDir; uniform vec3 uSunCol;
const vec3 AIR_D = vec3(${srgb(PALETTE.airDirty)});
const vec3 AIR_C = vec3(${srgb(PALETTE.airClean)});
const vec3 WAT_D = vec3(${srgb(PALETTE.watDirty)});
const vec3 WAT_C = vec3(${srgb(PALETTE.watClean)});
float cleanAt(float x){ float lo=mix(650.,470.,uGate), hi=mix(900.,640.,uGate); return smoothstep(lo,hi,x); }
vec3 waterHaze(float c, float y){ vec3 w=mix(WAT_D,WAT_C,c); return w*(0.32+0.68*exp(min(y,0.)/34.)); }
/* light reaching an underwater point: red goes first, murky water also eats blue */
vec3 absorb(float c, float depth){
  vec3 k=mix(vec3(.028,.026,.04),vec3(.045,.016,.011),c);
  return max(exp(-k*max(depth,0.)),vec3(.3,.34,.36));
}
float caustic(vec2 p, float t){
  p*=0.22; vec2 q=p; float acc=0.;
  for(int i=0;i<3;i++){ float fi=float(i);
    q+=vec2(sin(q.y*1.9+t*0.8+fi*1.7),cos(q.x*1.7-t*0.6+fi*2.3))*0.55;
    acc+=0.6/(0.6+12.*abs(sin(q.x*1.3)*sin(q.y*1.3))); }
  return pow(acc/3.,2.2);
}
vec3 envFog(vec3 col, vec3 wp){
  float c=cleanAt(wp.x);
  vec3 airC=mix(AIR_D,AIR_C,c); float airD=mix(.0032,.0006,c);
  float watD=mix(.032,.0062,c);
  vec3 d=wp-uCam; float L=length(d); float wf;
  if(uCam.y<0. && wp.y<0.) wf=1.;
  else if(uCam.y>=0. && wp.y>=0.) wf=0.;
  else { float t=clamp(uCam.y/(uCam.y-wp.y),0.,1.); wf= uCam.y<0. ? t : 1.-t; }
  float Lw=L*wf, La=L-Lw;
  float yMid=(min(wp.y,0.)+min(uCam.y,0.))*0.5;
  /* you cannot see far underwater: long paths take the colour of the water around the camera */
  float cw=mix(c,cleanAt(uCam.x),clamp(Lw/45.,0.,1.));
  vec3 haze=waterHaze(cw,yMid);
  watD=mix(watD,mix(.032,.0062,cw),clamp(Lw/45.,0.,1.));
  float fw=1.-exp(-watD*Lw);
  float fa=1.-exp(-pow(airD*La,1.15));
  if(uCam.y<0.){ col=mix(col,airC,fa); col=mix(col,haze,fw); }
  else { col=mix(col,haze,fw); col=mix(col,airC,fa); }
  return col;
}
`;

/* Patch a built-in material: world position varying, underwater absorption + caustics, environment fog. */
export function patch(mat, opts = {}) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    let vs = 'varying vec3 vWp;\nuniform float uTime;\n' + sh.vertexShader;
    if (opts.vert) vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + opts.vert);
    vs = vs.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 _wp = vec4(transformed,1.0);
      #ifdef USE_INSTANCING
        _wp = instanceMatrix * _wp;
      #endif
      vWp = (modelMatrix * _wp).xyz;`);
    sh.vertexShader = vs;
    let fs = FOG_PARS + 'varying vec3 vWp;\n' + sh.fragmentShader;
    if (!opts.noUnder) {
      fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if(vWp.y<0.){ float cc=cleanAt(vWp.x);
          totalEmissiveRadiance += diffuseColor.rgb*uSunCol*caustic(vWp.xz,uTime)*cc*exp(vWp.y/14.)*${(opts.caustic ?? 0.9).toFixed(2)}; }`);
      fs = fs.replace('#include <tonemapping_fragment>', `
        if(vWp.y<0.){ float cc=cleanAt(vWp.x); gl_FragColor.rgb*=absorb(cc,-vWp.y)*mix(vec3(.9,.9,.75),vec3(1.),cc); }
        #include <tonemapping_fragment>`);
    }
    fs = fs.replace('#include <fog_fragment>', 'gl_FragColor.rgb = envFog(gl_FragColor.rgb, vWp);');
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => 'p' + (opts.key || '') + (opts.noUnder ? 'n' : '');
  return mat;
}

const cache = new Map();
export function std(color, o = {}) {
  const key = JSON.stringify([color, o.r, o.m, o.e, o.key, o.op, !!o.map, o.side, o.vc]);
  if (!o.map && !o.fresh && cache.has(key)) return cache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color, roughness: o.r ?? 0.8, metalness: o.m ?? 0, map: o.map || null,
    bumpMap: o.bump || null, bumpScale: o.bumpScale ?? 1,
    emissive: o.e ? new THREE.Color(o.e) : new THREE.Color(0), emissiveIntensity: o.ei ?? 1,
    transparent: o.op !== undefined, opacity: o.op ?? 1, side: o.side ?? THREE.FrontSide,
    vertexColors: !!o.vc, flatShading: !!o.flat,
  });
  if (o.clip) m.clippingPlanes = o.clip;
  patch(m, { key: o.key, vert: o.vert, caustic: o.caustic });
  if (!o.map && !o.fresh) cache.set(key, m);
  return m;
}

/* ---------- procedural textures (canvas) ---------- */
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, o = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }

function canvasTex(w, h, draw, srgb = true, rep = [1, 1]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/* tileable noise: sample on a torus of periodic value noise */
function tileNoise(u, v, scale, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    const p = scale * f;
    const x = u * p, y = v * p;
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const uu = xf * xf * (3 - 2 * xf), vv = yf * yf * (3 - 2 * yf);
    const H = (i2, j2) => hash(((i2 % p) + p) % p + i * 17, ((j2 % p) + p) % p + i * 31);
    const A = H(xi, yi), B = H(xi + 1, yi), C = H(xi, yi + 1), D = H(xi + 1, yi + 1);
    s += a * (A + (B - A) * uu + (C - A) * vv + (A - B - C + D) * uu * vv);
    f *= 2; a *= 0.5;
  }
  return s;
}
const T = {};
export function tex(name) {
  if (T[name]) return T[name];
  const N = 256;
  const noiseImg = (ctx, w, h, fn) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x / w, y / h); const i = (y * w + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  };
  if (name === 'concrete') T[name] = canvasTex(N, N, (ctx, w, h) => noiseImg(ctx, w, h, (u, v) => {
    const n = tileNoise(u, v, 8, 5), p = hash(u * 999, v * 777) > 0.985 ? -40 : 0;
    const g = 150 + n * 70 + p; return [g, g * 0.99, g * 0.96];
  }));
  if (name === 'gypsum') T[name] = canvasTex(N, N, (ctx, w, h) => noiseImg(ctx, w, h, (u, v) => {
    const n = tileNoise(u, v, 16, 4), s = hash(u * 512, v * 512) * 30;
    const g = 170 + n * 60 + s; return [g, g * 0.95, g * 0.78];
  }));
  if (name === 'metal') T[name] = canvasTex(N, N, (ctx, w, h) => {
    noiseImg(ctx, w, h, (u, v) => {
      const rib = 0.5 + 0.5 * Math.cos(u * Math.PI * 2 * 24);
      const n = tileNoise(u, v, 6, 4), rust = Math.max(0, tileNoise(u + 0.3, v, 4, 4) - 0.55) * 3 * (0.4 + v);
      const g = 120 + rib * 45 + n * 30;
      return [g + rust * 60, g - rust * 10, g - rust * 40];
    });
  });
  if (name === 'windows') T[name] = canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f2efe6'; ctx.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const x = c * 64 + 18, y = r * 64 + 16;
      ctx.fillStyle = '#2f5d78'; ctx.fillRect(x, y, 28, 34);
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x, y, 28, 6);
      ctx.fillStyle = '#d9d2c0'; ctx.fillRect(x - 4, y + 34, 36, 5);
    }
  });
  if (name === 'stack') T[name] = canvasTex(64, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8f8b84'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#e8e3da' : '#a8322a'; ctx.fillRect(0, i * 14, w, 14); }
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(20,15,10,.6)'); g.addColorStop(.3, 'rgba(20,15,10,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
  if (name === 'soft') T[name] = canvasTex(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.5, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }, false);
  if (name === 'frond') T[name] = canvasTex(256, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 32); ctx.lineTo(w, 32); ctx.stroke();
    for (let i = 4; i < w - 4; i += 5) {
      const t = i / w, L = 26 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 3;
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(i, 32); ctx.lineTo(i + 10, 32 - L); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i, 32); ctx.lineTo(i + 10, 32 + L); ctx.stroke();
    }
  }, false, [1, 1]);
  if (name === 'sign') T[name] = canvasTex(256, 160, (ctx, w, h) => {
    ctx.fillStyle = '#f4f1ea'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#b3261e'; ctx.lineWidth = 12; ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#b3261e'; ctx.font = 'bold 30px Arial'; ctx.textAlign = 'center';
    ctx.fillText('BAIGNADE', w / 2, 62); ctx.fillText('INTERDITE', w / 2, 98);
    ctx.font = 'bold 22px Arial'; ctx.fillStyle = '#333'; ctx.fillText('السباحة ممنوعة', w / 2, 134);
  });
  if (name === 'groundN') {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d'); const img = ctx.createImageData(256, 256);
    const hgt = (x, y) => tileNoise(x / 256, y / 256, 12, 5);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const dx = hgt(x + 1, y) - hgt(x - 1, y), dy = hgt(x, y + 1) - hgt(x, y - 1);
      const n = new THREE.Vector3(-dx * 6, -dy * 6, 1).normalize(); const i = (y * 256 + x) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    T[name] = t;
  }
  return T[name];
}
