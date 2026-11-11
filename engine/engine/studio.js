// studio.js — the white hangar (the channel's "home") and the seamless white studio, + the shot types that use them:
//   hangar  : aircraft parked in the branded white hangar (most of the runtime)
//   studio  : aircraft on an infinite white cyc (no walls visible)
//   title   : the symmetric hangar hero frame with the channel name on the back wall (+ optional small caption)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';
import { register } from './core.js';
import { makeAircraft, animateAircraft } from './aircraft.js';
import { cameraRig } from './cameras.js';
import { buildOverlays } from './overlays.js';
import { makeCanvas, canvasTexture, textCanvas, FONTS, rng, deg, lerp, clamp } from './util.js';

// ------------------------------------------------------------------ environment map (soft white room for reflections)
let envCache = null;
// equirect studio: bright soft ceiling, darker band around the horizon (walls/truss) and a light floor —
// gives polished aluminium the horizon-line reflections seen on the reference models
export function studioEnv(renderer, kind = 'hangar') {
  if (envCache && envCache[kind]) return envCache[kind]; envCache ||= {};
  const w = 1024, h = 512, c = makeCanvas(w, h), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, h);
  if (kind === 'sky') { gr.addColorStop(0, '#9fb9d6'); gr.addColorStop(0.45, '#dfe8f0'); gr.addColorStop(0.5, '#cfd6db'); gr.addColorStop(0.56, '#6b6f6a'); gr.addColorStop(1, '#4b4f4c'); }
  else { gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, '#f2f3f5'); gr.addColorStop(0.42, '#8d9198'); gr.addColorStop(0.49, '#4d5157'); gr.addColorStop(0.52, '#b9bcc0'); gr.addColorStop(0.62, '#e2e3e5'); gr.addColorStop(1, '#d4d5d8'); }
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  if (kind !== 'sky') { g.fillStyle = 'rgba(255,255,255,0.95)'; for (let i = 0; i < 8; i++) g.fillRect(i * 128 + 30, 40, 70, 22); g.fillStyle = 'rgba(40,44,50,.35)'; for (let i = 0; i < 32; i++) g.fillRect(i * 32, 150, 3, 70); }
  const tex = new THREE.CanvasTexture(c); tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(renderer); const env = pm.fromEquirectangular(tex).texture; env.userData.shared = true; envCache[kind] = env; return env;
}

// ------------------------------------------------------------------ contact shadow (soft blurred depth from below)
export class ContactShadow {
  constructor(renderer, scene, { size = 40, res = 1024, blur = 2.2, darkness = 0.9, opacity = 0.75, height = 6, y = 0.002 } = {}) {
    this.r = renderer; this.scene = scene; this.size = size; this.height = height; this.blur = blur; this.darkness = darkness;
    this.rt = new THREE.WebGLRenderTarget(res, res); this.rt.texture.generateMipmaps = false; this.rtb = new THREE.WebGLRenderTarget(res, res); this.rtb.texture.generateMipmaps = false;
    // The shadow is MULTIPLIED onto the floor in the opaque pass, right after the floor and before everything else
    // (floor renderOrder -2, shadow -1, no depth test), so it can never lose a depth fight with the floor and pop in and out.
    // Anything drawn later (aircraft, gear, walls) still covers it normally through the floor's depth.
    const shadowMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.rt.texture }, opacity: { value: opacity } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D map; uniform float opacity; varying vec2 vUv; void main(){ float a = texture2D(map, vUv).a * opacity; gl_FragColor = vec4(vec3(1.0 - a), 1.0); }',
      blending: THREE.MultiplyBlending, premultipliedAlpha: true, transparent: false, depthTest: false, depthWrite: false,
    });
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(Math.PI / 2), shadowMat);
    this.plane.scale.y = -1; this.plane.position.y = y; this.plane.renderOrder = -1; this.plane.userData.noShadowCam = true;
    this.cam = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0, height); this.cam.rotation.x = Math.PI / 2;
    this.grp = new THREE.Group(); this.grp.add(this.plane, this.cam); scene.add(this.grp);
    this.depthMat = new THREE.MeshDepthMaterial(); this.depthMat.userData.darkness = { value: darkness };
    this.depthMat.onBeforeCompile = (sh) => { sh.uniforms.darkness = this.depthMat.userData.darkness; sh.fragmentShader = 'uniform float darkness;\n' + sh.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );'); };
    this.depthMat.depthTest = false; this.depthMat.depthWrite = false;
    this.hb = new THREE.ShaderMaterial(HorizontalBlurShader); this.hb.depthTest = false; this.vb = new THREE.ShaderMaterial(VerticalBlurShader); this.vb.depthTest = false;
    this.bp = new THREE.Mesh(this.plane.geometry, this.hb); this.bp.visible = false; this.grp.add(this.bp);
  }
  blurOnce(amount) {
    this.bp.visible = true; this.bp.material = this.hb; this.hb.uniforms.tDiffuse.value = this.rt.texture; this.hb.uniforms.h.value = amount / 256;
    this.r.setRenderTarget(this.rtb); this.r.render(this.bp, this.cam);
    this.bp.material = this.vb; this.vb.uniforms.tDiffuse.value = this.rtb.texture; this.vb.uniforms.v.value = amount / 256;
    this.r.setRenderTarget(this.rt); this.r.render(this.bp, this.cam); this.bp.visible = false;
  }
  update(center) {
    if (center) { this.grp.position.x = center.x; this.grp.position.z = center.z; }
    const bg = this.scene.background, ov = this.scene.overrideMaterial, fog = this.scene.fog; this.scene.background = null; this.scene.overrideMaterial = this.depthMat; this.scene.fog = null;
    const hidden = []; this.scene.traverse((o) => { if (o.visible && (o.userData.noContact || o.userData.noShadowCam || o.isSprite || o.isLine || o.isLineSegments || o.material?.transparent && !o.isInstancedMesh)) { hidden.push(o); o.visible = false; } });
    const cc = this.r.getClearAlpha(); this.r.setClearAlpha(0);
    this.r.setRenderTarget(this.rt); this.r.clear(); this.r.render(this.scene, this.cam);
    this.blurOnce(this.blur); this.blurOnce(this.blur * 0.4);
    this.r.setRenderTarget(null); this.r.setClearAlpha(cc);
    hidden.forEach((o) => (o.visible = true)); this.scene.overrideMaterial = ov; this.scene.background = bg; this.scene.fog = fog;
  }
}

// ------------------------------------------------------------------ hangar textures
function wallTexture() {
  const w = 2048, h = 1024, c = makeCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#f1f1f4'; g.fillRect(0, 0, w, h); const r = rng(5);
  const cols = 16, rows = 6;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.012 + r() * 0.02})`; g.fillRect((i * w) / cols, (j * h) / rows, w / cols, h / rows); }
  g.strokeStyle = 'rgba(60,64,70,.38)'; g.lineWidth = 3;
  for (let i = 0; i <= cols; i++) { g.beginPath(); g.moveTo((i * w) / cols, 0); g.lineTo((i * w) / cols, h); g.stroke(); }
  for (let j = 0; j <= rows; j++) { g.beginPath(); g.moveTo(0, (j * h) / rows); g.lineTo(w, (j * h) / rows); g.stroke(); }
  return c;
}
function roofTexture() {
  const w = 1024, h = 1024, c = makeCanvas(w, h), g = c.getContext('2d'); g.fillStyle = '#5b5f66'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(30,32,36,.5)'; g.lineWidth = 4; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo((i * w) / 8, 0); g.lineTo((i * w) / 8, h); g.stroke(); g.beginPath(); g.moveTo(0, (i * h) / 8); g.lineTo(w, (i * h) / 8); g.stroke(); }
  return c;
}
function roofLights() {
  const w = 1024, h = 1024, c = makeCanvas(w, h), g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff';
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2 === 0) g.fillRect((i + 0.5) * (w / 8) - 22, (j + 0.5) * (h / 8) - 5, 44, 10);
  return c;
}
function brandTexture(name, opts = {}) {
  // the user's channel name in wide-tracked light capitals on the back wall (brand.lambdaA: true draws A without its crossbar)
  const txt = String(name).toUpperCase().replace(/A/g, opts.lambdaA ? 'Λ' : 'A');
  return textCanvas(txt, { font: FONTS.brand, weight: 400, size: 220, color: opts.nameColor || '#1d1f22', spacing: 220 * (opts.tracking ?? 1.55), pad: 30 });
}
// the user's logo on a hanging panel. banner: 'dark' (logo on a near-black panel, the house look), 'light' (white panel),
// 'none' (the logo itself as a cut-out sign - best for logos with a transparent background)
function emblemCanvas(logoImg, banner = 'dark') {
  const a = logoImg.width / logoImg.height; const H = 1536; const W = Math.round(Math.min(2.2, Math.max(0.62, a * (banner === 'none' ? 1 : 0.9))) * H / 2) * 2;
  const c = makeCanvas(W, H), g = c.getContext('2d');
  if (banner !== 'none') { g.fillStyle = banner === 'light' ? '#f2f2f2' : '#18191b'; g.fillRect(0, 0, W, H); }
  const pad = banner === 'none' ? 0 : 0.14; const s = Math.min((W * (1 - 2 * pad)) / logoImg.width, (H * (1 - 2 * pad)) / logoImg.height);
  g.drawImage(logoImg, (W - logoImg.width * s) / 2, (H - logoImg.height * s) / 2, logoImg.width * s, logoImg.height * s);
  return c;
}
// name modes: 'own' (the user's channel name), 'random' (a made-up name chosen at project creation), 'none' (no lettering)
export const showsName = (brand) => (brand?.nameMode || (String(brand?.name || '').trim() ? 'own' : null)) !== 'none';
export function brandProblem(brand) {
  const fix = 'python brand.py <project> --logo <path to your logo> and one of --name "Your Channel" / --random-name / --no-name';
  const mode = brand?.nameMode || (String(brand?.name || '').trim() ? 'own' : null);
  if (!mode) return 'No name option chosen for the hangar wall - ' + fix;
  if (mode !== 'none' && !String(brand.name || '').trim()) return 'Name missing for the hangar wall - ' + fix;
  if (!brand.logo) return 'Channel logo missing - ' + fix;
  return null;
}

// ------------------------------------------------------------------ hangar build
const HANGAR = { halfW: 46, wallH: 6, archH: 26, backX: -58, frontX: 90, ribEvery: 8 };
function archPoint(t) { // t 0..1 across the arch from +Z (left) to -Z (right); semi-ellipse on top of the low wall
  const a = Math.PI * t; return new THREE.Vector2(Math.cos(a) * HANGAR.halfW, HANGAR.wallH + Math.sin(a) * HANGAR.archH);
}
export async function buildHangar(scene, E, opts = {}) {
  const grp = new THREE.Group(); grp.name = 'hangar'; scene.add(grp);
  const white = new THREE.MeshStandardMaterial({ color: '#e6e6e9', roughness: 0.75 });
  const steel = new THREE.MeshStandardMaterial({ color: '#b8bcc2', roughness: 0.45, metalness: 0.6 });
  // floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: opts.floor || '#dadbde', roughness: 0.42, metalness: 0.0, envMapIntensity: 0.6 }));
  floor.receiveShadow = true; floor.userData.noContact = true; floor.renderOrder = -2; grp.add(floor);   // drawn first: the contact shadow multiplies onto it
  // back wall: arch outline, paneled
  const shape = new THREE.Shape(); shape.moveTo(HANGAR.halfW, 0); for (let i = 0; i <= 48; i++) { const p = archPoint(i / 48); shape.lineTo(p.x, p.y); } shape.lineTo(-HANGAR.halfW, 0); shape.closePath();
  if (opts.door) { const d = new THREE.Path(); const dw = opts.doorWidth || 40, dh = opts.doorHeight || 16; d.moveTo(dw / 2, 0); d.lineTo(dw / 2, dh); d.lineTo(dw * 0.28, dh); d.lineTo(dw * 0.28, dh + 4); d.lineTo(-dw * 0.28, dh + 4); d.lineTo(-dw * 0.28, dh); d.lineTo(-dw / 2, dh); d.lineTo(-dw / 2, 0); d.closePath(); shape.holes.push(d); }
  const wtex = canvasTexture(wallTexture(), { repeat: true }); wtex.repeat.set(1 / 32, 1 / 12);
  const wallGeo = new THREE.ShapeGeometry(shape, 24); const back = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({ map: wtex, roughness: 0.8 }));
  back.rotation.y = Math.PI / 2; back.position.x = HANGAR.backX; back.receiveShadow = true; back.userData.noContact = true; grp.add(back);
  // little square vents + service doors on the back wall
  const ventMat = new THREE.MeshStandardMaterial({ color: '#9a9ea4', roughness: 0.6 });
  for (const z of [-30, -15, 15, 30]) for (const y of [7.5, 13.5]) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.9), ventMat); v.position.set(HANGAR.backX + 0.05, y, z); grp.add(v); }
  for (const z of [-34, 34]) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 1.6), ventMat); d.position.set(HANGAR.backX + 0.05, 1.3, z); grp.add(d); }
  // low side walls
  const swtex = wtex.clone(); swtex.needsUpdate = true; swtex.repeat.set(1 / 20, 1 / 12);
  for (const s of [1, -1]) { const sw = new THREE.Mesh(new THREE.PlaneGeometry(HANGAR.frontX - HANGAR.backX, HANGAR.wallH), new THREE.MeshStandardMaterial({ map: swtex, roughness: 0.8 })); sw.position.set((HANGAR.frontX + HANGAR.backX) / 2, HANGAR.wallH / 2, s * HANGAR.halfW); sw.rotation.y = s > 0 ? Math.PI : 0; sw.userData.noContact = true; grp.add(sw); }
  // roof shell (dark) with light strips, seen through the truss
  const shellPts = []; for (let i = 0; i <= 48; i++) shellPts.push(archPoint(i / 48));
  const shellGeo = new THREE.BufferGeometry(); const pos = [], uv = [], idx = []; const len = HANGAR.frontX - HANGAR.backX;
  for (let i = 0; i <= 48; i++) for (let j = 0; j <= 1; j++) { const p = shellPts[i]; pos.push(HANGAR.backX + j * len, p.y + 1.2, p.x * 1.02); uv.push(j * len / 12, i / 48 * 12); }
  for (let i = 0; i < 48; i++) { const a = i * 2, b = a + 2; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  shellGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); shellGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); shellGeo.setIndex(idx); shellGeo.computeVertexNormals();
  const rt = canvasTexture(roofTexture(), { repeat: true }), rl = canvasTexture(roofLights(), { repeat: true, srgb: false });
  const shell = new THREE.Mesh(shellGeo, new THREE.MeshStandardMaterial({ map: rt, emissiveMap: rl, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1.6, roughness: 0.9, side: THREE.DoubleSide })); shell.userData.noContact = true; grp.add(shell);
  // truss ribs (instanced tubes): inner + outer chord + zig-zag web, and diagonal bracing between ribs
  const segs = []; const N = 36;
  for (let x = HANGAR.backX + 2; x <= HANGAR.frontX; x += HANGAR.ribEvery) {
    for (let i = 0; i < N; i++) {
      const a = archPoint(i / N), b = archPoint((i + 1) / N); const k = 0.96, k2 = 0.93;
      segs.push([[x, a.y, a.x], [x, b.y, b.x]]);
      segs.push([[x, a.y * k + 0.4, a.x * k2], [x, b.y * k + 0.4, b.x * k2]]);
      segs.push([[x, a.y, a.x], [x, b.y * k + 0.4, b.x * k2]]);
      if (x + HANGAR.ribEvery <= HANGAR.frontX) { segs.push([[x, a.y, a.x], [x + HANGAR.ribEvery, b.y, b.x]]); segs.push([[x, b.y, b.x], [x + HANGAR.ribEvery, a.y, a.x]]); }
    }
  }
  const cyl = new THREE.CylinderGeometry(0.09, 0.09, 1, 6); const inst = new THREE.InstancedMesh(cyl, steel, segs.length); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  segs.forEach(([a, b], i) => { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b); const d = B.clone().sub(A); q.setFromUnitVectors(up, d.clone().normalize()); m.compose(A.clone().addScaledVector(d, 0.5), q, new THREE.Vector3(1, d.length(), 1)); inst.setMatrixAt(i, m); });
  inst.userData.noContact = true; grp.add(inst);
  // the user's channel name + logo on the back wall (both required)
  let brand = E.cfg.brand || {}; const problem = brandProblem(brand); if (problem) throw new Error(problem);
  let logo; try { logo = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = E.base + brand.logo; }); }
  catch (e) { throw new Error(`Channel logo not found at ${brand.logo} - add it with: python brand.py <project> --logo <path to your logo>`); }
  const named = showsName(brand);
  if (named) {
    const bt = brandTexture(brand.name, brand); const bm = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: canvasTexture(bt.canvas), transparent: true, toneMapped: true, color: '#d0d0d0' }));
    const bw = brand.wordWidth || Math.min(60, 7 + String(brand.name).length * 4.6); bm.scale.set(bw, bw * (bt.h / bt.w), 1); bm.rotation.y = Math.PI / 2; bm.position.set(HANGAR.backX + 0.08, brand.wordY || 9.5, 0); bm.userData.noContact = true; grp.add(bm);
  }
  // without a name the logo hangs alone, a little lower and larger, centred on the wall
  const ec = emblemCanvas(logo, brand.banner || 'dark'); const eh = brand.logoHeight || (named ? 10.5 : 12.5); const ew = eh * (ec.width / ec.height);
  brand = { ...brand, logoY: brand.logoY || (named ? 19 : 16) };
  const ban = new THREE.Mesh(new THREE.PlaneGeometry(ew, eh), new THREE.MeshStandardMaterial({ map: canvasTexture(ec), roughness: 0.9, transparent: brand.banner === 'none', alphaTest: brand.banner === 'none' ? 0.02 : 0 }));
  ban.rotation.y = Math.PI / 2; ban.position.set(HANGAR.backX + 3, brand.logoY || 19, 0); ban.castShadow = true; ban.userData.noContact = true; grp.add(ban);
  for (const z of [-ew * 0.42, ew * 0.42]) { const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 12, 4), steel); cab.position.set(HANGAR.backX + 3, (brand.logoY || 19) + eh / 2 + 6, z); cab.userData.noContact = true; grp.add(cab); }
  // outside world through the door
  if (opts.door) {
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(400, 120), new THREE.MeshBasicMaterial({ color: '#dfe7ee', toneMapped: true })); sky.rotation.y = Math.PI / 2; sky.position.set(HANGAR.backX - 160, 40, 0); grp.add(sky);
    const trees = makeCanvas(2048, 128), tg = trees.getContext('2d'); const r = rng(9); tg.fillStyle = '#56624d'; for (let x = 0; x < 2048; x += 6) { const h2 = 40 + r() * 60; tg.fillRect(x, 128 - h2, 7, h2); }
    const tm = new THREE.Mesh(new THREE.PlaneGeometry(400, 12), new THREE.MeshBasicMaterial({ map: canvasTexture(trees), transparent: true })); tm.rotation.y = Math.PI / 2; tm.position.set(HANGAR.backX - 150, 6, 0); grp.add(tm);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#b9b8b2', roughness: 0.9 })); ground.position.set(HANGAR.backX - 100, -0.06, 0); ground.userData.noContact = true; grp.add(ground);
  }
  return grp;
}

function lights(scene, E, { center, size, key = 1.0, fill = 0.8, envI = 0.9 } = {}) {
  scene.environment = studioEnv(E.renderer); scene.environmentIntensity = envI;
  const hemi = new THREE.HemisphereLight('#ffffff', '#b8b9bc', fill * 0.8); scene.add(hemi);
  const dl = new THREE.DirectionalLight('#ffffff', key * 1.6); dl.position.set(center.x + size * 0.35, size * 2.2, center.z + size * 0.25); dl.target.position.copy(center);
  dl.castShadow = true; const s = size * 0.9; Object.assign(dl.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.5, far: size * 6 }); dl.shadow.mapSize.set(2048, 2048); dl.shadow.radius = 6; dl.shadow.bias = -0.0004; dl.shadow.normalBias = 0.02;
  scene.add(dl, dl.target);
  return { hemi, dl };
}

// ------------------------------------------------------------------ shared: build the aircraft(s) a shot asks for
export async function shotAircraft(spec, E, scene) {
  const list = [].concat(spec.aircraft || []).map((a) => (typeof a === 'string' ? { id: a } : a));
  const out = [];
  for (const a of list) {
    const def = E.cfg.aircraftDefs?.[a.id]; if (!def) throw new Error(`aircraft "${a.id}" not found in project aircraft/ (have: ${Object.keys(E.cfg.aircraftDefs || {}).join(', ')})`);
    const root = await makeAircraft(def, E.base + 'aircraft/'); root.position.set(...(a.pos || [0, 0, 0])); root.rotation.y = deg(a.heading || 0); scene.add(root); root.userData.state = { ...(def.state || {}), ...(a.state || {}) }; root.userData.anim = a.animate || null; out.push(root);
  }
  return out;
}
// animate keyed states, e.g. animate: { tilt: [[0, 90], [4, 0]], stow: [[1, 0], [6, 1]] }
export function stateAt(base, anim, u) {
  if (!anim) return base; const st = { ...base };
  for (const [k, keys] of Object.entries(anim)) { if (!Array.isArray(keys)) continue; let v = keys[0][1]; for (let i = 0; i < keys.length; i++) { const [t0, v0] = keys[i]; const n = keys[i + 1]; if (u >= t0) { v = v0; if (n && u < n[0]) { const e = (u - t0) / (n[0] - t0); const s = e * e * (3 - 2 * e); v = typeof v0 === 'number' ? lerp(v0, n[1], s) : v0; } } } st[k] = v; }
  return st;
}

// ------------------------------------------------------------------ shot types
async function studioShot(spec, E, mode) {
  const scene = new THREE.Scene();
  const bgc = mode === 'void' ? (spec.background || '#cdced1') : '#d8d9dc'; scene.background = new THREE.Color(bgc);
  if (mode === 'void') scene.fog = new THREE.Fog(bgc, 30, 140); else scene.fog = new THREE.Fog('#d9dade', 90, 260);
  const planes = await shotAircraft(spec, E, scene);
  const box = new THREE.Box3(); planes.forEach((p) => box.expandByObject(p)); if (box.isEmpty()) box.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
  const size = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 4); const center = box.getCenter(new THREE.Vector3());
  if (mode !== 'void') {
    // The hangar is a fixed-size set built for ~29 m aircraft (DC-3 class). A
    // bigger aircraft puts the standard orbit cameras outside the roof/walls,
    // so the whole set scales with the aircraft (walls, roof, logo included;
    // the contact shadow and lights stay aircraft-scale). k = 1 for the
    // reference sizes, ~2.5 for the 70 m B-36.
    const hangarK = Math.max(1, size / 28);
    const hangarGroup = await buildHangar(scene, E, spec.hangar || {});
    hangarGroup.scale.setScalar(hangarK);
    if (scene.fog) { scene.fog.near *= hangarK; scene.fog.far *= hangarK; }
  }
  else { const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: bgc, roughness: 0.8 })); floor.receiveShadow = true; floor.userData.noContact = true; floor.renderOrder = -2; scene.add(floor); }
  lights(scene, E, { center, size, key: spec.key ?? 1.0, fill: spec.fill ?? 0.9 });
  const cs = new ContactShadow(E.renderer, scene, { size: size * 1.8, darkness: spec.shadow ?? 1.6, opacity: 0.85, blur: 1.6, height: Math.max(3, box.max.y * 1.1) });
  const camera = new THREE.PerspectiveCamera(35, E.W / E.H, 0.1, 2000);
  const anchors = { ...(planes[0]?.userData.anchors || {}) }; if (planes[0]) for (const k in anchors) anchors[k] = anchors[k].clone().applyMatrix4(planes[0].matrixWorld);
  const rig = cameraRig(camera, spec.camera || { from: { az: 35, el: 12, dist: 1.25 }, to: { az: 50, el: 14, dist: 1.15 } }, { anchors, center: center.clone().setY(box.max.y * 0.35), size, defaults: { fov: 35 } });
  const ov = buildOverlays(spec.overlays || [], { scene, camera, root: planes[0], anchors, size, W: E.W, H: E.H }); await ov.ready;
  let lastShadowU = -1; const animated = planes.some((p) => p.userData.anim);
  return {
    scene, camera, post: { look: mode === 'void' ? 'void' : 'hangar', dof: spec.dof ? { focus: 10, aperture: spec.dof.aperture ?? 0.0012, maxblur: 0.006 } : null },
    update(u, p) {
      planes.forEach((pl) => { const st = stateAt(pl.userData.state, pl.userData.anim, u); animateAircraft(pl, u, st); if (st.move) { const [dx, dz] = st.move; pl.position.x = (pl.userData.x0 ??= pl.position.x) + dx * p; pl.position.z = (pl.userData.z0 ??= pl.position.z) + (dz || 0) * p; } });
      const look = rig(p, u); ov.update(u);
      { const n = clamp(camera.position.distanceTo(look) * 0.02, 0.05, 1.5); if (Math.abs(n - camera.near) > 1e-4) { camera.near = n; camera.updateProjectionMatrix(); } }
      if (this.bokeh || spec.dof) this.dofFocus = camera.position.distanceTo(look);
      if (lastShadowU < 0 || animated) { cs.update(center); lastShadowU = u; }
    },
    ui: ov.ui || (spec.caption ? null : null),
    dispose() {},
  };
}
register('hangar', (spec, E) => studioShot(spec, E, 'hangar'));
register('studio', (spec, E) => studioShot(spec, E, 'void'));
register('title', async (spec, E) => {
  const s = { ...spec, camera: spec.camera || { from: { az: 0, el: 3, dist: 1.75, fov: 32, ty: 4.5 }, to: { az: 0, el: 3.2, dist: 1.68, fov: 32, ty: 4.6 } } };
  if (spec.caption) s.overlays = [...(spec.overlays || []), { type: 'caption', text: spec.caption, at: spec.captionAt ?? 0.6, pos: [0.5, 0.9] }];
  return studioShot(s, E, 'hangar');
});
