import * as THREE from 'three';
import { U, FOG_PARS, tex } from './env.js';
import { TB } from './terrain.js';

const NOISE = /* glsl */`
float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x),u.y); }
float fbm2(vec2 p){ float s=0.,a=.5; for(int i=0;i<4;i++){ s+=a*vn(p); p*=2.03; a*=.5; } return s; }
`;

export function buildWater(ht) {
  const geo = new THREE.PlaneGeometry(9000, 6000, 1, 1);
  geo.rotateX(-Math.PI / 2); geo.translate(900, 0, -2400);
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, U, {
      uHt: { value: ht }, uTB: { value: new THREE.Vector4(TB.x0, TB.z0, TB.x1 - TB.x0, TB.z1 - TB.z0) },
      uSplit: { value: 0 },
    }),
    transparent: true, side: THREE.DoubleSide, depthWrite: true,
    vertexShader: `varying vec3 vWp; void main(){ vec4 w=modelMatrix*vec4(position,1.); vWp=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: FOG_PARS + NOISE + /* glsl */`
      uniform vec3 uSkyHor; uniform vec3 uSkyZen; uniform sampler2D uHt; uniform vec4 uTB; uniform float uSplit;
      varying vec3 vWp;
      vec3 waveN(vec2 p, float t, float dist){
        vec2 g=vec2(0.);
        for(int i=0;i<7;i++){ float fi=float(i);
          float ang=fi*1.93+.4; vec2 dir=vec2(cos(ang),sin(ang));
          float f=.07*pow(1.62,fi), a=.55/pow(1.75,fi), s=sqrt(9.8*f)*1.1;
          float fade=1.-smoothstep(0.,1.,dist*f/25.);
          g+=dir*f*a*cos(dot(dir,p)*f+t*s+fi*1.3)*fade; }
        float n1=vn(p*.9+t*.4)-.5, n2=vn(p.yx*.9-t*.35)-.5;
        g+=vec2(n1,n2)*.12*(1.-smoothstep(20.,120.,dist));
        return normalize(vec3(-g.x,1.,-g.y));
      }
      void main(){
        float dist=length(uCam-vWp);
        float c=cleanAt(vWp.x);
        vec3 N=waveN(vWp.xz,uTime,dist);
        N=normalize(mix(N,vec3(0,1,0),clamp(dist/1600.,0.,.85)));
        vec2 uv=(vWp.xz-uTB.xy)/uTB.zw;
        float inside=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
        float sb=texture2D(uHt,clamp(uv,0.,1.)).r*80.-70.;
        float depth=mix(45.,max(0.,-sb),inside);
        float pn=fbm2(vWp.xz*.012+vec2(uTime*.006,uTime*.002));
        float plume=(1.-c)*smoothstep(.38,.72,pn);
        vec3 col; float alpha=1.;
        if(gl_FrontFacing){
          vec3 V=normalize(uCam-vWp);
          float fres=.02+.98*pow(1.-max(dot(N,V),0.),5.);
          vec3 R=reflect(-V,N); R.y=abs(R.y);
          vec3 sky=mix(uSkyHor,uSkyZen,pow(R.y,.45));
          float sd=max(dot(R,uSunDir),0.);
          vec3 spec=uSunCol*(pow(sd,900.)*40.+pow(sd,80.)*.8+pow(sd,8.)*.06);
          vec3 shallow=mix(vec3(.46,.45,.30),vec3(.16,.62,.60),c);
          vec3 deep=mix(vec3(.13,.14,.085),vec3(.008,.085,.14),c);
          vec3 body=mix(shallow,deep,1.-exp(-depth/6.5));
          body*=.55+.7*clamp(uSunDir.y*2.,.2,1.);
          body=mix(body,vec3(.62,.59,.45),plume*.8);
          col=mix(body,sky,fres)+spec*(1.-plume*.6);
          float sh=smoothstep(1.8,.15,depth)*inside;
          float foam=sh*smoothstep(.35,.8,.5+.5*sin(depth*5.-uTime*1.4+pn*9.));
          col=mix(col,vec3(.9,.9,.86),clamp(foam,0.,1.)*.8);
          alpha=mix(mix(.80,.96,1.-c),1.,fres);
          alpha=mix(alpha,.06,uSplit*exp(-dist/90.));
        } else {
          vec3 up=normalize(vWp-uCam);
          float win=smoothstep(.6,.72,up.y);
          vec3 wc=waterHaze(c,0.);
          vec3 inner=wc*1.35+(N.x+N.z)*.05;
          vec3 through=mix(uSkyHor,uSkyZen,.6)*1.1+uSunCol*pow(max(dot(up,uSunDir),0.),12.)*1.6;
          through+= (N.x-N.z)*.18;
          col=mix(inner,through,win*mix(.55,1.,c));
          col=mix(col,vec3(.70,.67,.52),plume*.55);
        }
        gl_FragColor=vec4(col,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb=envFog(gl_FragColor.rgb,vWp);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}

/* ---------- particle systems ---------- */
const PUFF_VS = /* glsl */`
  attribute vec4 aR;
  uniform float uTime; uniform float uLife; uniform vec3 uOrigin; uniform vec3 uVel; uniform vec3 uSpread; uniform vec3 uAcc;
  uniform vec3 uJit; uniform float uTurb; uniform float uS0; uniform float uS1; uniform float uScale; uniform float uOpacity;
  uniform float uFloor; uniform float uCeil;
  varying float vA; varying vec3 vWp; varying float vRot;
  void main(){
    float age=fract(uTime/uLife+aR.w);
    vec3 v=uVel+(aR.xyz-.5)*2.*uSpread;
    float T=age*uLife;
    vec3 p=uOrigin+(aR.zxy-.5)*uJit+v*T+uAcc*T*T*.5;
    p.x+=sin(uTime*.31+aR.y*23.)*uTurb*age; p.z+=cos(uTime*.27+aR.x*19.)*uTurb*age;
    p.y=clamp(p.y,uFloor,uCeil);
    vec4 w=modelMatrix*vec4(p,1.); vWp=w.xyz;
    vec4 mv=viewMatrix*w;
    gl_Position=projectionMatrix*mv;
    gl_PointSize=clamp(mix(uS0,uS1,age)*(.7+aR.y*.6)*uScale/max(-mv.z,1.),0.,900.);
    vA=smoothstep(0.,.15,age)*(1.-smoothstep(.55,1.,age))*uOpacity;
    vRot=aR.x*6.28;
  }`;
const PUFF_FS = FOG_PARS + /* glsl */`
  uniform sampler2D uTex; uniform vec3 uColor; uniform float uGateDep; uniform float uLit;
  varying float vA; varying vec3 vWp; varying float vRot;
  void main(){
    vec2 q=gl_PointCoord-.5; float cr=cos(vRot), sr=sin(vRot); q=mat2(cr,-sr,sr,cr)*q;
    float a=texture2D(uTex,q+.5).a;
    a*=.75+.25*sin(q.x*13.+vRot*3.)*sin(q.y*11.-vRot);
    vec3 col=uColor*mix(1.,.65+.6*clamp(uSunDir.y*2.5,0.,1.),uLit);
    if(vWp.y<0.) col*=absorb(cleanAt(vWp.x),-vWp.y);
    col=envFog(col,vWp);
    float m=mix(1.,1.-uGate,uGateDep);
    gl_FragColor=vec4(col,a*vA*m);
    if(gl_FragColor.a<.004) discard;
  }`;

export const puffSystems = [];
export function puffs(o) {
  const n = o.count, g = new THREE.BufferGeometry();
  const r = new Float32Array(n * 4); for (let i = 0; i < r.length; i++) r[i] = Math.random();
  g.setAttribute('aR', new THREE.BufferAttribute(r, 4));
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const col = new THREE.Color(o.color);
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, U, {
      uLife: { value: o.life }, uOrigin: { value: new THREE.Vector3(...o.origin) }, uVel: { value: new THREE.Vector3(...(o.vel || [0, 0, 0])) },
      uSpread: { value: new THREE.Vector3(...(o.spread || [0, 0, 0])) }, uAcc: { value: new THREE.Vector3(...(o.acc || [0, 0, 0])) },
      uJit: { value: new THREE.Vector3(...(o.jit || [0, 0, 0])) }, uTurb: { value: o.turb ?? 0 },
      uS0: { value: o.size[0] }, uS1: { value: o.size[1] }, uScale: { value: 800 }, uOpacity: { value: o.opacity ?? 1 },
      uFloor: { value: o.floor ?? -1e4 }, uCeil: { value: o.ceil ?? 1e4 },
      uTex: { value: tex('soft') }, uColor: { value: new THREE.Vector3(col.r, col.g, col.b) },
      uGateDep: { value: o.gate ? 1 : 0 }, uLit: { value: o.lit ?? 1 },
    }),
    vertexShader: PUFF_VS, fragmentShader: PUFF_FS, transparent: true, depthWrite: false,
  });
  // colour given in sRGB: keep raw values (fog runs in output space)
  col.convertLinearToSRGB(); mat.uniforms.uColor.value.set(col.r, col.g, col.b);
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = o.order ?? 3;
  puffSystems.push(mat);
  return pts;
}

/* bubbles that burst past the lens when the camera goes under */
export function bubbles() {
  const n = 220, g = new THREE.BufferGeometry(), r = new Float32Array(n * 4);
  for (let i = 0; i < r.length; i++) r[i] = Math.random();
  g.setAttribute('aR', new THREE.BufferAttribute(r, 4));
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, U, { uScale: { value: 800 }, uBurst: { value: -100 }, uFrom: { value: new THREE.Vector3() } }),
    transparent: true, depthWrite: false,
    vertexShader: `attribute vec4 aR; uniform float uTime; uniform float uScale; uniform float uBurst; uniform vec3 uFrom; varying float vA;
      void main(){ float age=uTime-uBurst-aR.w*.5;
        vec3 off=(aR.xyz-.5)*vec3(9.,5.,9.); off.y-=1.5;
        vec3 p=uFrom+off+vec3(sin(age*7.+aR.x*30.)*.15,age*(1.8+aR.y*2.6),cos(age*6.+aR.z*30.)*.15);
        vec4 mv=viewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        gl_PointSize=(.05+aR.x*.22)*uScale/max(-mv.z,.4);
        vA=step(0.,age)*(1.-smoothstep(1.4,2.8,age))*step(p.y,-.05); }`,
    fragmentShader: `varying float vA;
      void main(){ float d=length(gl_PointCoord-.5); float rim=smoothstep(.5,.4,d)*(.35+.65*smoothstep(.25,.45,d));
        float hi=smoothstep(.16,.0,length(gl_PointCoord-vec2(.36,.34)));
        gl_FragColor=vec4(vec3(.92,.98,1.),(rim*.7+hi)*vA); if(gl_FragColor.a<.01) discard; }`,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 9;
  puffSystems.push(mat);
  return pts;
}

/* marine snow that wraps around the camera */
export function marineSnow() {
  const n = 1400, g = new THREE.BufferGeometry(), r = new Float32Array(n * 4);
  for (let i = 0; i < r.length; i++) r[i] = Math.random();
  g.setAttribute('aR', new THREE.BufferAttribute(r, 4));
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, U, { uScale: { value: 800 } }),
    transparent: true, depthWrite: false,
    vertexShader: `attribute vec4 aR; uniform vec3 uCam; uniform float uTime; uniform float uScale; varying float vA; varying vec3 vWp;
      void main(){ vec3 B=vec3(60.,40.,60.);
        vec3 p=aR.xyz*B+vec3(sin(uTime*.2+aR.w*9.)*1.5,-uTime*.25*(.3+aR.w),cos(uTime*.17+aR.w*7.)*1.5);
        p=uCam+mod(p-uCam+B*.5,B)-B*.5; vWp=p;
        vec4 mv=viewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        gl_PointSize=(.06+aR.w*.12)*uScale/max(-mv.z,.5);
        vA=step(p.y,-.3)*step(uCam.y,0.)*(1.-smoothstep(10.,30.,-mv.z)); }`,
    fragmentShader: FOG_PARS + `varying float vA; varying vec3 vWp;
      void main(){ float d=length(gl_PointCoord-.5); float c=cleanAt(vWp.x);
        vec3 col=mix(vec3(.78,.74,.58),vec3(.75,.9,.92),c);
        gl_FragColor=vec4(col,smoothstep(.5,.1,d)*vA*mix(.75,.35,c)); if(gl_FragColor.a<.01) discard; }`,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 4;
  puffSystems.push(mat);
  return pts;
}
