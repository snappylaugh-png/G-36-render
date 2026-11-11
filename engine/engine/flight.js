// flight.js — cinematic flying shots: Preetham sky + sun, ocean / desert / hills / mountains / cloud-sea worlds,
// sprite clouds, aircraft with spinning props and a gentle bank, camera rigs: chase, pace, flyby, distant (long lens), orbit.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { register } from './core.js';
import { animateAircraft } from './aircraft.js';
import { shotAircraft, stateAt } from './studio.js';
import { cameraRig } from './cameras.js';
import { buildOverlays } from './overlays.js';
import { makeCanvas, canvasTexture, rng, fbm2, vnoise2, deg, lerp, noise1, clamp, smooth } from './util.js';

const TIMES = {
  day: { el: 38, az: 140, turb: 5, ray: 1.4, mie: 0.004, exposure: 0.62, sun: 2.6, hemi: 0.9, fog: '#c8d6e2', look: 'flight' },
  morning: { el: 16, az: 110, turb: 6, ray: 1.8, mie: 0.006, exposure: 0.6, sun: 2.2, hemi: 0.8, fog: '#d6d9dc', look: 'flight' },
  sunset: { el: 2.5, az: 250, turb: 9, ray: 2.6, mie: 0.012, exposure: 0.48, sun: 1.6, hemi: 0.45, fog: '#c99f86', look: 'sunset' },
  dusk: { el: -1.5, az: 250, turb: 8, ray: 3.0, mie: 0.01, exposure: 0.5, sun: 0.5, hemi: 0.35, fog: '#4c5873', look: 'sunset' },
  overcast: { el: 30, az: 140, turb: 18, ray: 0.6, mie: 0.02, exposure: 0.5, sun: 0.9, hemi: 1.3, fog: '#c3c8cc', look: 'flight' },
};

// ------------------------------------------------------------------ procedural textures
function normalTile(seed = 1, scale = 8) {
  const n = 256, c = makeCanvas(n, n), g = c.getContext('2d'), img = g.createImageData(n, n);
  const H = (x, y) => fbm2((x / n) * scale, (y / n) * scale, 4, seed);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = H((x + 1) % n, y) - H((x - 1 + n) % n, y), dy = H(x, (y + 1) % n) - H(x, (y - 1 + n) % n);
    const v = new THREE.Vector3(-dx * 6, -dy * 6, 1).normalize(); const i = (y * n + x) * 4;
    img.data[i] = (v.x * 0.5 + 0.5) * 255; img.data[i + 1] = (v.y * 0.5 + 0.5) * 255; img.data[i + 2] = (v.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); const t = canvasTexture(c, { srgb: false, repeat: true }); return t;
}
function cloudPuff(seed = 1, warm = false) {
  const n = 256, c = makeCanvas(n, n), g = c.getContext('2d'); const r = rng(seed);
  for (let k = 0; k < 34; k++) {
    const x = n * (0.18 + r() * 0.64), y = n * (0.38 + r() * 0.3) - Math.sin(Math.PI * (x / n)) * n * 0.12, rad = n * (0.07 + r() * 0.15);
    const gr = g.createRadialGradient(x, y - rad * 0.3, 0, x, y, rad);
    const top = warm ? '255,236,215' : '255,255,255', bot = warm ? '170,150,160' : '196,204,214';
    const shade = clamp((y - n * 0.35) / (n * 0.35)); const cc = shade > 0.5 ? bot : top;
    gr.addColorStop(0, `rgba(${cc},0.9)`); gr.addColorStop(0.55, `rgba(${cc},0.6)`); gr.addColorStop(1, `rgba(${cc},0)`); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  // soft elliptical mask so no puff is ever clipped by the canvas edge
  g.globalCompositeOperation = 'destination-in'; const m = g.createRadialGradient(n / 2, n / 2, n * 0.18, n / 2, n / 2, n * 0.5); m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = m; g.fillRect(0, 0, n, n); g.globalCompositeOperation = 'source-over';
  return canvasTexture(c);
}
function cloudSeaTexture(seed = 3, warm = false) {
  const n = 512, c = makeCanvas(n, n), g = c.getContext('2d'), img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = fbm2((x / n) * 6, (y / n) * 6, 6, seed) * 0.5 + 0.5; const a = clamp((v - 0.42) * 3.2); const i = (y * n + x) * 4; const b = 200 + 55 * clamp((v - 0.45) * 2);
    img.data[i] = warm ? b : b; img.data[i + 1] = warm ? b * 0.93 : b; img.data[i + 2] = warm ? b * 0.88 : b * 1.02; img.data[i + 3] = a * 255;
  }
  g.putImageData(img, 0, 0); const t = canvasTexture(c, { repeat: true }); t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; return t;
}
const PALETTES = {
  desert: [[0, '#b99a6e'], [0.35, '#c7a77a'], [0.6, '#a9875f'], [0.85, '#8d7257'], [1, '#d8c7a8']],
  hills: [[0, '#5d6b3c'], [0.3, '#6e7a45'], [0.55, '#8b8a55'], [0.8, '#9b8f6c'], [1, '#b8ad92']],
  mountains: [[0, '#56603f'], [0.35, '#6d6a50'], [0.6, '#7b7468'], [0.82, '#a09a92'], [1, '#eef0f2']],
  farmland: [[0, '#6f7c4a'], [0.4, '#7a8350'], [0.7, '#878a58'], [1, '#948f6a']],
};
function rampColor(stops, v) { v = clamp(v); for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i]; return new THREE.Color(ca).lerp(new THREE.Color(cb), (v - a) / (b - a)); } return new THREE.Color(stops[stops.length - 1][1]); }
const terrainCache = new Map();
function terrainColorMap(kind, seed, n = 1024) {
  const key = kind + seed; if (terrainCache.has(key)) return terrainCache.get(key);
  const c = makeCanvas(n, n), g = c.getContext('2d'), img = g.createImageData(n, n); const stops = PALETTES[kind] || PALETTES.hills;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n; const base = fbm2(u * 7, v * 7, 5, seed) * 0.5 + 0.5; const patch = vnoise2(u * 60, v * 60, seed + 3) * 0.5 + 0.5; const fine = vnoise2(u * 260, v * 260, seed + 5) * 0.5 + 0.5;
    let k = clamp(base * 0.75 + patch * 0.2 + fine * 0.08 - 0.02);
    if (kind === 'farmland') { const fx = Math.floor(u * 90 + vnoise2(v * 4, u * 4, seed) * 3), fy = Math.floor(v * 70 + vnoise2(u * 4, v * 4, seed + 1) * 3); k = clamp(0.25 + (((fx * 7919 + fy * 104729) % 97) / 97) * 0.6); }
    const c0 = rampColor(stops, k); const i = (y * n + x) * 4; const sh = 0.86 + fine * 0.22;
    img.data[i] = c0.r * 255 * sh; img.data[i + 1] = c0.g * 255 * sh; img.data[i + 2] = c0.b * 255 * sh; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); const t = canvasTexture(c); t.userData.shared = true; terrainCache.set(key, t); return t;
}
function terrain(kind, seed, size = 40000, seg = 320) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2); const pos = g.attributes.position;
  const amp = { desert: 320, hills: 520, mountains: 2100, farmland: 120 }[kind] || 400; const fr = { desert: 9, hills: 13, mountains: 8, farmland: 6 }[kind] || 10;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i); const u = x / size, v = z / size;
    let h = fbm2(u * fr + 3.1, v * fr + 1.7, 6, seed);
    if (kind === 'mountains') h = 1 - Math.abs(vnoise2(u * fr * 0.7, v * fr * 0.7, seed + 4)) * 1.4 + h * 0.6;
    if (kind === 'desert') h = h * 0.5 + 0.5 * Math.abs(vnoise2(u * 30, v * 12, seed + 2)) - 0.2;
    pos.setY(i, (h * 0.5 + 0.5) * amp);
  }
  g.computeVertexNormals();
  const map = terrainColorMap(kind, seed);
  const detail = makeCanvas(256, 256), dg = detail.getContext('2d'); const id = dg.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) { const v = 205 + (fbm2((i % 256) / 32, Math.floor(i / 256) / 32, 4, seed + 9) * 0.5 + 0.5) * 50; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
  dg.putImageData(id, 0, 0); const dt = canvasTexture(detail, { repeat: true }); dt.repeat.set(160, 160);
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.96, metalness: 0 });
  mat.onBeforeCompile = (sh) => { sh.uniforms.detail = { value: dt }; sh.fragmentShader = 'uniform sampler2D detail;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= texture2D(detail, vMapUv * 160.0).rgb * 1.12;'); };
  const m = new THREE.Mesh(g, mat); m.userData.noContact = true; return m;
}

// ------------------------------------------------------------------ world
export function buildWorld(scene, E, W = {}) {
  const T = { ...(TIMES[W.time || 'day'] || TIMES.day), ...(W.sun || {}) };
  const sky = new Sky(); sky.scale.setScalar(450000); scene.add(sky);
  const u = sky.material.uniforms; u.turbidity.value = T.turb; u.rayleigh.value = T.ray; u.mieCoefficient.value = T.mie; u.mieDirectionalG.value = 0.8;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, deg(90 - (W.sunEl ?? T.el)), deg(W.sunAz ?? T.az)); u.sunPosition.value.copy(sunDir);
  // environment from the sky for metal reflections
  const pm = new THREE.PMREMGenerator(E.renderer); const envScene = new THREE.Scene(); const sky2 = sky.clone(); envScene.add(sky2);
  const groundCol = { ocean: '#2c4658', desert: '#a88d68', hills: '#66704a', mountains: '#666b55', clouds: '#e9edf1', farmland: '#727b4f' }[W.ground || 'ocean'] || '#777';
  const gplane = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16, 0, Math.PI * 2, Math.PI / 2 + 0.02, Math.PI / 2), new THREE.MeshBasicMaterial({ color: groundCol, side: THREE.BackSide })); envScene.add(gplane);
  scene.environment = pm.fromScene(envScene, 0.02).texture; scene.environmentIntensity = W.envIntensity ?? 0.6;
  const sun = new THREE.DirectionalLight(W.time === 'sunset' || W.time === 'dusk' ? '#ffc8a0' : '#fff6ea', T.sun); sun.position.copy(sunDir).multiplyScalar(400); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = 30; Object.assign(sun.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc, near: 1, far: 1200 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target); const hemi = new THREE.HemisphereLight('#cfe0f2', groundCol, T.hemi); scene.add(hemi);
  scene.fog = new THREE.FogExp2(W.fog || T.fog, W.haze ?? (W.ground === 'clouds' ? 0.00003 : 0.000055));
  const alt = W.altitude ?? (W.ground === 'ocean' ? 160 : W.ground === 'mountains' ? 3000 : W.ground === 'clouds' ? 3000 : W.ground === 'farmland' ? 500 : 900);
  const world = { sun, sunDir, T, alt, update: () => {} };
  const seed = W.seed || 7;
  if (!W.ground || W.ground === 'ocean') {
    const nt = normalTile(seed, 5); nt.repeat.set(260, 260); nt.anisotropy = 16; const nt2 = normalTile(seed + 1, 3); nt2.repeat.set(37, 37);
    const mat = new THREE.MeshPhysicalMaterial({ color: W.seaColor || '#20394b', roughness: 0.08, metalness: 0.0, normalMap: nt, normalScale: new THREE.Vector2(0.22, 0.22), envMapIntensity: 1.25, clearcoat: 0.6, clearcoatRoughness: 0.15, clearcoatNormalMap: nt2, clearcoatNormalScale: new THREE.Vector2(0.6, 0.6) });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2), mat);
    sea.userData.noContact = true; scene.add(sea); world.update = (t) => { nt.offset.set(t * 0.01, t * 0.006); nt2.offset.set(-t * 0.0012, t * 0.0009); };
  } else if (W.ground === 'clouds') {
    const ct = cloudSeaTexture(seed, W.time === 'sunset'); ct.repeat.set(30, 30);
    for (let k = 0; k < 3; k++) { const cs = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: ct, transparent: true, depthWrite: false, opacity: 0.9 - k * 0.15 })); cs.position.y = alt - 700 - k * 140; cs.userData.noContact = true; scene.add(cs); }
    const base = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#8fa3b5' })); base.position.y = alt - 1400; scene.add(base);
  } else {
    const tm = terrain(W.ground, seed); scene.add(tm);
    if (W.water) { const lake = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#3b5566', roughness: 0.2 })); lake.position.y = W.water; scene.add(lake); }
  }
  // sprite clouds around the flight path
  const nClouds = W.clouds ?? (W.ground === 'clouds' ? 70 : 40);
  if (nClouds > 0) {
    const r = rng(seed + 11); const texs = [0, 1, 2, 3].map((i) => cloudPuff(seed * 10 + i, W.time === 'sunset'));
    for (let i = 0; i < nClouds; i++) {
      const s = 250 + r() * 650; const mat = new THREE.SpriteMaterial({ map: texs[i % 4], transparent: true, depthWrite: false, fog: true, opacity: 0.95 });
      const sp = new THREE.Sprite(mat); sp.scale.set(s * 1.8, s, 1);
      const layer = W.cloudLayer ?? alt + (W.ground === 'clouds' ? -500 : 350);
      sp.position.set((r() - 0.3) * 14000, layer + (r() - 0.5) * 500, (r() - 0.5) * 9000); scene.add(sp);
    }
  }
  return world;
}

// ------------------------------------------------------------------ shot type
register('flight', async (spec, E) => {
  const scene = new THREE.Scene(); const W = spec.world || {};
  const world = buildWorld(scene, E, W);
  const planes = await shotAircraft(spec, E, scene);
  const M = { speed: 70, bank: 0, weave: 1.5, climb: 0, ...(spec.motion || {}) };
  const lead = planes[0]; const box = new THREE.Box3().setFromObject(lead); const size = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 6);
  planes.forEach((p, i) => { p.userData.offset = new THREE.Vector3(...(([].concat(spec.aircraft)[i] || {}).offset || [0, 0, 0])); p.userData.st0 = { props: 22, rotors: 4.5, gear: 'up', ...p.userData.state }; p.userData.center = new THREE.Box3().setFromObject(p).getCenter(new THREE.Vector3()); });
  const camera = new THREE.PerspectiveCamera(35, E.W / E.H, 0.5, 120000);
  const C = spec.camera || { mode: 'chase', from: { az: 160, el: 6, dist: 1.6 }, to: { az: 150, el: 8, dist: 1.4 } };
  const mode = C.mode || 'chase'; const shake = C.shake ?? (mode === 'distant' ? 0.25 : 0.35);
  const rig = cameraRig(camera, { ...C, shake: 0 }, { center: new THREE.Vector3(0, 0, 0), size, defaults: { fov: mode === 'distant' ? 10 : 35 } });
  const anchors = {}; const ov = buildOverlays(spec.overlays || [], { scene, camera, root: lead, anchors, size, W: E.W, H: E.H }); await ov.ready;
  const dur = spec.end - spec.start; const pos = new THREE.Vector3(); const startX = M.startX ?? (mode === 'flyby' ? -M.speed * dur * 0.5 : 0);
  const camFixed = C.at ? new THREE.Vector3(...C.at) : null; let lastLook = null;
  return {
    scene, camera, post: { look: world.T.look, grade: { exposure: world.T.exposure } },
    update(u, p) {
      world.update(u);
      const x = startX + M.speed * u; const y = world.alt + Math.sin(deg(M.climb)) * M.speed * u + noise1(u * 0.25, 4) * M.weave; const z = (M.drift || 0) * u + noise1(u * 0.2, 8) * M.weave * 0.6;
      pos.set(x, y, z);
      planes.forEach((pl, i) => {
        const o = pl.userData.offset; const bob = noise1(u * 0.6 + i * 3, 12 + i) * 0.25;
        pl.position.set(x + o.x, y + o.y + bob, z + o.z);
        pl.rotation.set(deg(M.bank + noise1(u * 0.3, 5 + i) * 1.5), deg(M.heading || 0), deg(M.climb + noise1(u * 0.25, 9 + i) * 0.8)); pl.rotation.order = 'YZX';
        animateAircraft(pl, u, stateAt(pl.userData.st0, pl.userData.anim, u));
      });
      // camera
      if (mode === 'chase' || mode === 'pace' || mode === 'orbit') {
        const look = rig(p, u); camera.position.add(pos); const L = look.clone().add(pos); camera.lookAt(L);
        if (shake) { camera.rotateX(deg(noise1(u * 0.8, 21) * shake * 0.6)); camera.rotateY(deg(noise1(u * 0.6, 23) * shake * 0.6)); camera.rotateZ(deg(noise1(u * 0.5, 25) * shake * 0.5)); }
      } else { // flyby / distant: camera stays in the world, turns to follow
        const cp = camFixed ? camFixed.clone() : new THREE.Vector3(C.ahead ?? 60, world.alt + (C.height ?? -8), C.side ?? 45);
        if (mode === 'distant' && !camFixed) cp.set(C.ahead ?? 600, world.alt + (C.height ?? 40), C.side ?? 700);
        camera.position.copy(cp); camera.fov = C.fov ?? (mode === 'distant' ? 9 : 40); camera.updateProjectionMatrix();
        const target = pos.clone(); if (lastLook && C.lag) target.lerp(lastLook, C.lag); lastLook = target.clone(); camera.lookAt(target);
        camera.rotateZ(deg(C.roll || 0)); if (shake) { camera.rotateX(deg(noise1(u * 0.8, 31) * shake * 0.5)); camera.rotateY(deg(noise1(u * 0.6, 33) * shake * 0.5)); }
      }
      world.sun.target.position.copy(pos); world.sun.position.copy(world.sunDir).multiplyScalar(400).add(pos);
      ov.update(u);
    },
    ui: ov.ui,
  };
});
