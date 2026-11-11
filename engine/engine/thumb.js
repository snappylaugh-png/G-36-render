// thumb.js — the channel thumbnail look (PROMPT 3 house style) rendered from the video's own 3D aircraft:
// dead-on symmetrical front view from low at nose/gear height looking slightly up, aircraft filling the width, near-black void,
// deep blue glow bleeding in behind the left half and crimson-magenta behind the right half, white key light from above-front,
// coloured rim light, dark glossy floor with a faint mirror reflection, crushed blacks, grain, vignette. Never any text.
// concepts: hero (whole aircraft) · feature (pushed in on the part that answers the title) · faceoff (two aircraft + optional flags)
import * as THREE from 'three';
import { register, LOOKS } from './core.js';
import { animateAircraft } from './aircraft.js';
import { shotAircraft, stateAt } from './studio.js';
import { resolvePoint } from './cameras.js';
import { makeCanvas, canvasTexture, deg, loadImage, clamp } from './util.js';

LOOKS.thumb = { exposure: 1.0, lift: 0.0, gain: 1.0, gamma: 0.94, sat: 1.08, tint: [1, 1, 1], vignette: 0.38, grain: 0.016, bloom: 0.32 };

// screen-space backdrop: colour glows bleeding in from behind on each side, fading to black toward the top and the centre,
// optional soft white overhead beam (face-off)
function glowTexture(left, right, beam = false) {
  const W = 1920, H = 1080, c = makeCanvas(W, H), g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const blob = (x, y, r, sy, col, a) => { g.save(); g.translate(x, y); g.scale(1, sy); const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, col); gr.addColorStop(0.55, col + '88'); gr.addColorStop(1, col + '00'); g.globalAlpha = a; g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.restore(); };
  g.globalCompositeOperation = 'lighter';
  blob(W * 0.06, H * 0.62, W * 0.44, 0.9, left, 0.72); blob(W * 0.18, H * 0.74, W * 0.26, 0.6, left, 0.45);
  blob(W * 0.94, H * 0.62, W * 0.44, 0.9, right, 0.72); blob(W * 0.82, H * 0.74, W * 0.26, 0.6, right, 0.45);
  if (beam) { const gr = g.createLinearGradient(0, 0, 0, H * 0.85); gr.addColorStop(0, 'rgba(255,255,255,0.32)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(W * 0.46, 0); g.lineTo(W * 0.54, 0); g.lineTo(W * 0.68, H * 0.85); g.lineTo(W * 0.32, H * 0.85); g.closePath(); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  const top = g.createLinearGradient(0, 0, 0, H * 0.55); top.addColorStop(0, 'rgba(0,0,0,0.92)'); top.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = top; g.fillRect(0, 0, W, H);
  const mid = g.createLinearGradient(0, 0, W, 0); mid.addColorStop(0.28, 'rgba(0,0,0,0)'); mid.addColorStop(0.5, beam ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.85)'); mid.addColorStop(0.72, 'rgba(0,0,0,0)'); g.fillStyle = mid; g.fillRect(0, 0, W, H);
  const t = canvasTexture(c); return t;
}
// reflection map, measured orientation in this renderer: u = 0 / 1 faces the camera (front), u = .5 is behind the aircraft.
// White softboxes above-front so metal reads white and silver, the two colours on the sides, black behind.
function envTexture(renderer, left, right, sides = { left: 0.25, right: 0.75 }) {
  const W = 1024, H = 512, c = makeCanvas(W, H), g = c.getContext('2d'); g.fillStyle = '#050506'; g.fillRect(0, 0, W, H);
  for (const cx of [0, W]) {   // the front, drawn on both edges so it wraps
    const soft = g.createRadialGradient(cx, H * 0.22, 10, cx, H * 0.22, W * 0.3); soft.addColorStop(0, '#ffffff'); soft.addColorStop(0.6, '#d8d8d8'); soft.addColorStop(1, 'rgba(120,120,120,0)'); g.fillStyle = soft; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffffff'; g.fillRect(cx - W * 0.12, H * 0.08, W * 0.24, H * 0.12);
    const front = g.createLinearGradient(0, H * 0.1, 0, H * 0.62); front.addColorStop(0, 'rgba(255,255,255,0.95)'); front.addColorStop(1, 'rgba(150,150,150,0.35)');
    g.fillStyle = front; g.beginPath(); g.ellipse(cx, H * 0.38, W * 0.17, H * 0.27, 0, 0, Math.PI * 2); g.fill();
  }
  const band = (cx, col) => { const gr = g.createRadialGradient(cx, H * 0.48, 5, cx, H * 0.48, W * 0.15); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); };
  band(W * sides.left, left); band(W * sides.right, right);
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(renderer); return pm.fromEquirectangular(t).texture;
}
async function flagMesh(file, base, w) {
  const img = await loadImage(base + file); const h = w * (img.height / img.width);
  const geo = new THREE.PlaneGeometry(w, h, 40, 20); const mat = new THREE.MeshStandardMaterial({ map: canvasTexture((() => { const c = makeCanvas(img.width, img.height); c.getContext('2d').drawImage(img, 0, 0); return c; })()), roughness: 0.7, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat); m.userData.base = geo.attributes.position.array.slice(); return m;
}

register('thumbnail', async (spec, E) => {
  const T = { concept: 'hero', fill: null, glow: {}, ...spec };
  const left = T.glow.left || '#1b4fa0', right = T.glow.right || '#c0174f';
  const scene = new THREE.Scene(); scene.background = glowTexture(left, right, T.concept === 'faceoff' || T.spot);
  scene.environment = envTexture(E.renderer, left, right, T.envSides); scene.environmentIntensity = 1.5;
  const planes = await shotAircraft(spec, E, scene);
  planes.forEach((p) => p.traverse((n) => { if (n.isMesh && n.material && n.material.metalness != null) { const f = (m) => { m = m.clone(); m.metalness = Math.min(m.metalness, T.metalness ?? 0.6); m.roughness = Math.max(m.roughness, 0.26); return m; }; n.material = Array.isArray(n.material) ? n.material.map(f) : f(n.material); } }));
  // face-off: two aircraft side by side, each centred in its half, wings just overlapping in the middle (unless positions given)
  if (T.concept === 'faceoff' && planes.length === 2 && !([].concat(spec.aircraft).some((a) => a && a.pos))) {
    const sp = planes.map((p) => new THREE.Box3().setFromObject(p).getSize(new THREE.Vector3()));
    planes[0].position.set(0, 0, sp[0].z * 0.46); planes[1].position.set(-Math.max(sp[0].x, sp[1].x) * 0.35, 0, -sp[1].z * 0.46);
    planes.forEach((p) => p.updateMatrixWorld(true));
  }
  const box = new THREE.Box3(); planes.forEach((p) => box.expandByObject(p)); const size = box.getSize(new THREE.Vector3()); const ctr = box.getCenter(new THREE.Vector3());
  const span = Math.max(size.z, 1), height = Math.max(size.y, 1);
  // lights: white key from above-front, coloured rims from behind each side, a whisper of fill
  const key = new THREE.DirectionalLight('#ffffff', 3.2); key.position.set(span * 1.2, span * 1.6, 0); key.target.position.copy(ctr); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); const s = span * 0.8; Object.assign(key.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.5, far: span * 6 }); key.shadow.radius = 6; scene.add(key, key.target);
  const rimL = new THREE.DirectionalLight(left, 3.2); rimL.position.set(-span, span * 0.35, span * 0.9); rimL.target.position.copy(ctr); scene.add(rimL, rimL.target);
  const rimR = new THREE.DirectionalLight(right, 3.2); rimR.position.set(-span, span * 0.35, -span * 0.9); rimR.target.position.copy(ctr); scene.add(rimR, rimR.target);
  scene.add(new THREE.HemisphereLight('#3a3d44', '#000000', 0.6));
  const fillL = new THREE.DirectionalLight('#ffffff', 0.9); fillL.position.set(span * 3, height * 0.5, 0); fillL.target.position.copy(ctr); scene.add(fillL, fillL.target);
  const bounce = new THREE.DirectionalLight('#ffffff', 0.7); bounce.position.set(span * 2, -height * 1.5, 0); bounce.target.position.copy(ctr); scene.add(bounce, bounce.target);   // soft floor bounce so wing undersides are not black
  // dark glossy floor with a faint mirror image of the aircraft (a flipped copy under a semi-transparent black floor)
  const reflection = T.reflection ?? 0.05;   // blended in linear light: 0.05 reads as a faint (~25%) mirror image
  for (const pl of planes) { const r = pl.clone(true); r.scale.y = -1; r.position.y = -pl.position.y; r.traverse((n) => { n.castShadow = false; }); r.userData = { ...pl.userData }; scene.add(r); pl.userData.mirror = r; }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(span * 30, span * 30).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#030304', roughness: 0.3, metalness: 0, envMapIntensity: 0.06, transparent: true, opacity: 1 - reflection }));
  floor.material.envMap = scene.environment;   // own env slot, otherwise scene.environmentIntensity overrides envMapIntensity
  { // the floor fades out with distance so the far edge melts into the coloured glow instead of cutting it off at the horizon
    const fc = makeCanvas(512, 512), fg = fc.getContext('2d'), gr = fg.createRadialGradient(256, 256, 0, 256, 256, 256);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.12, '#fff'); gr.addColorStop(0.42, '#000'); gr.addColorStop(1, '#000'); fg.fillStyle = gr; fg.fillRect(0, 0, 512, 512);
    floor.material.alphaMap = new THREE.CanvasTexture(fc); floor.material.depthWrite = false; }
  floor.position.y = 0.005; floor.receiveShadow = true; floor.renderOrder = 2; scene.add(floor);
  const under = new THREE.Mesh(new THREE.PlaneGeometry(span * 30, span * 30).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000000' })); under.position.y = -height * 1.6; scene.add(under);
  // faceoff extras: overhead spotlight cone + flags in the top corners
  const flags = [];
  if (T.flags) for (const [side, file] of Object.entries(T.flags)) { if (!file) continue; try { const f = await flagMesh(file, E.base, span * 0.3); f.material.color.set('#5e5e5e'); f.material.roughness = 0.9; f.rotation.y = Math.PI / 2; f.position.set(ctr.x - span * 0.9, height + span * 0.26, (side === 'left' ? 1 : -1) * span * 0.6); scene.add(f); flags.push(f); } catch (e) { /* missing flag file: skip */ } }
  // camera: dead-on, symmetrical, low (nose / gear height) looking very slightly up, aircraft filling the width
  const camera = new THREE.PerspectiveCamera(T.fov || 30, E.W / E.H, 0.05, span * 40);
  const anchors = planes.length === 1 ? Object.fromEntries(Object.entries(planes[0].userData.anchors || {}).map(([k, v]) => [k, v.clone().applyMatrix4(planes[0].matrixWorld)])) : {};
  const target = T.target ? resolvePoint(T.target, anchors, ctr) : new THREE.Vector3(ctr.x, 0, 0);
  const fill = T.fill || (T.concept === 'feature' ? 1.7 : 0.97);
  const visW = (T.concept === 'feature' ? span : size.z) / fill;
  const dist = visW / (2 * Math.tan(deg(camera.fov / 2)) * camera.aspect);
  const camH = T.cameraHeight ?? (T.concept === 'feature' ? target.y : height * 0.22);
  const lookY = camH + dist * Math.tan(deg(T.lookUp ?? 4));
  const front = box.max.x;
  camera.position.set(T.concept === 'feature' ? target.x + dist : Math.max(ctr.x + dist, front + span * 0.05), camH, target.z); camera.lookAt(new THREE.Vector3(target.x, lookY, target.z));
  camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
  { // the coloured glows reflected in the glossy floor: soft pools under each glow, strongest at the horizon, so the floor line melts into the colour
    const hz = new THREE.Vector3(ctr.x - span * 2000, 0, camera.position.z).project(camera); const hy = clamp((1 - hz.y) / 2, 0.05, 0.98);
    const W = 1920, H = 1080, c = makeCanvas(W, H), g = c.getContext('2d'); g.globalCompositeOperation = 'lighter';
    const pool = (x, col, a) => { g.save(); g.translate(x, H * (hy + 0.07)); g.scale(1, 0.34); const gr = g.createRadialGradient(0, 0, 0, 0, 0, W * 0.42); gr.addColorStop(0, col); gr.addColorStop(0.5, col + '66'); gr.addColorStop(1, col + '00'); g.globalAlpha = a; g.fillStyle = gr; g.beginPath(); g.arc(0, 0, W * 0.42, 0, Math.PI * 2); g.fill(); g.restore(); };
    pool(W * 0.06, left, T.floorGlow ?? 0.55); pool(W * 0.94, right, T.floorGlow ?? 0.55);
    g.globalCompositeOperation = 'destination-out'; const cut = g.createLinearGradient(0, H * (hy - 0.01), 0, H * (hy + 0.07)); cut.addColorStop(0, 'rgba(0,0,0,1)'); cut.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = cut; g.fillRect(0, 0, W, H * (hy + 0.07));   // nothing above the horizon, feathered so no seam
    const tex = canvasTexture(c);
    const dq = camera.position.distanceTo(ctr) + span * 0.75, hq = 2 * dq * Math.tan(deg(camera.fov / 2)), wq = hq * camera.aspect;
    const q = new THREE.Mesh(new THREE.PlaneGeometry(wq, hq), new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    q.position.set(0, 0, -dq); q.renderOrder = 3; camera.add(q); scene.add(camera);
  }
  return {
    scene, camera, post: { look: 'thumb' },
    update(u) { planes.forEach((pl) => { const st = stateAt(pl.userData.state, pl.userData.anim, u); animateAircraft(pl, u, st); if (pl.userData.mirror) animateAircraft(pl.userData.mirror, u, st); });
      flags.forEach((f) => { const p = f.geometry.attributes.position, b = f.userData.base; for (let i = 0; i < p.count; i++) { const x = b[i * 3]; p.setZ(i, Math.sin(x * 1.4 + u * 2) * 0.025 * (x - b[0])); } p.needsUpdate = true; f.geometry.computeVertexNormals(); }); },
  };
});
