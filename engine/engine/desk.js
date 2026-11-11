// desk.js — top-down tabletop sets: a pencil-drawn chart on crumpled paper (with pencil and ruler), manila folders with
// blueprints and old photos, printed maps. The camera hovers above with a slow push / drift and shallow focus.
import * as THREE from 'three';
import { register } from './core.js';
import { studioEnv } from './studio.js';
import { drawDiagram, preloadDiagram } from './diagram.js';
import { drawIcon } from './icons.js';
import { makeCanvas, canvasTexture, rng, fbm2, deg, loadImage, FONTS } from './util.js';
import { cameraRig } from './cameras.js';

function woodTex(seed = 3) {
  const w = 2048, h = 1024, c = makeCanvas(w, h), g = c.getContext('2d'); g.fillStyle = '#d7b48a'; g.fillRect(0, 0, w, h); const r = rng(seed);
  for (let i = 0; i < 260; i++) { const y = r() * h; g.strokeStyle = `rgba(${120 + r() * 40},${80 + r() * 30},${40 + r() * 20},${0.08 + r() * 0.12})`; g.lineWidth = 1 + r() * 4; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 64) g.lineTo(x, y + Math.sin(x * 0.004 + i) * 6 + (r() - 0.5) * 2); g.stroke(); }
  for (let i = 0; i < 5; i++) { const x = r() * w, y = r() * h; g.strokeStyle = 'rgba(110,70,35,.25)'; for (let k = 0; k < 6; k++) { g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, 20 + k * 9, 8 + k * 4, 0, 0, Math.PI * 2); g.stroke(); } }
  return canvasTexture(c);
}
function crumple(w = 1600, h = 1131, seed = 4) {
  const c = makeCanvas(w, h), g = c.getContext('2d'); g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, w, h); const r = rng(seed); g.globalAlpha = 0.07;
  for (let i = 0; i < 70; i++) { const x = r() * w, y = r() * h, a = r() * Math.PI, l = 200 + r() * 600; const gr = g.createLinearGradient(x, y, x + Math.cos(a) * 40, y + Math.sin(a) * 40); gr.addColorStop(0, '#000'); gr.addColorStop(1, '#fff'); g.strokeStyle = gr; g.lineWidth = 30 + r() * 50; g.beginPath(); g.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  return c;
}
function pencil() { const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.17, 6), new THREE.MeshStandardMaterial({ color: '#3b2a20', roughness: 0.6 })); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0045, 0.02, 6), new THREE.MeshStandardMaterial({ color: '#d9b98f', roughness: 0.8 })); tip.position.y = 0.095; const lead = new THREE.Mesh(new THREE.ConeGeometry(0.0013, 0.006, 6), new THREE.MeshStandardMaterial({ color: '#222' })); lead.position.y = 0.106; g.add(body, tip, lead); g.rotation.x = -Math.PI / 2; return g; }
function ruler() { const c = makeCanvas(1024, 64), g = c.getContext('2d'); g.fillStyle = '#9a6a3c'; g.fillRect(0, 0, 1024, 64); g.fillStyle = '#3b2412'; for (let i = 0; i < 300; i++) g.fillRect(i * 3.4, 0, 1, i % 10 === 0 ? 22 : i % 5 === 0 ? 15 : 9); const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.003, 0.03), new THREE.MeshStandardMaterial({ map: canvasTexture(c), roughness: 0.5 })); return m; }
function folder(open = true, seed = 1) { const g = new THREE.Group(); const mat = new THREE.MeshStandardMaterial({ color: '#cfb48a', roughness: 0.85 }); const back = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.002, 0.31), mat); g.add(back); if (!open) { const front = back.clone(); front.position.y = 0.004; g.add(front); } const tab = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.002, 0.02), mat); tab.position.set(0.05, 0, -0.16); g.add(tab); return g; }
function sheet(w, h, tex) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.0008, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })); m.castShadow = m.receiveShadow = true; return m; }

register('desk', async (spec, E) => {
  const D = spec.desk || spec; const scene = new THREE.Scene(); scene.background = new THREE.Color('#bfb6a8');
  scene.environment = studioEnv(E.renderer); scene.environmentIntensity = 0.45;
  scene.add(new THREE.HemisphereLight('#fff', '#a08a6c', 1.1)); const dl = new THREE.DirectionalLight('#fff4e6', 2.0); dl.position.set(-0.4, 1.2, -0.3); dl.castShadow = true; dl.shadow.mapSize.set(2048, 2048); Object.assign(dl.shadow.camera, { left: -0.6, right: 0.6, top: 0.6, bottom: -0.6, near: 0.1, far: 3 }); dl.shadow.radius = 6; dl.shadow.bias = -0.0004; scene.add(dl);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.0).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: woodTex(D.seed || 3), roughness: 0.55 })); top.receiveShadow = true; scene.add(top);
  if (D.carpet) { const cp = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#a9a7a3', roughness: 1 })); cp.position.y = -0.75; scene.add(cp); }
  // the paper with the chart
  let paperTex = null, pc = null, pg = null, bgImg = null, imgs = {};
  if (D.items) { const pw = 0.42, ph = 0.297; pc = makeCanvas(2048, 1448); pg = pc.getContext('2d'); bgImg = crumple(2048, 1448, D.seed || 4); paperTex = canvasTexture(pc); const s = sheet(pw, ph, paperTex); s.position.y = 0.001; s.rotation.y = deg(D.paperRot ?? 0); scene.add(s); imgs = await preloadDiagram(D.items, E.base); }
  const r = rng(D.seed || 9);
  for (const p of D.props || (D.items ? ['pencil', 'ruler'] : [])) {
    if (p === 'pencil') { const o = pencil(); o.position.set(-0.27, 0.005, 0.02); o.rotation.z = deg(-12); o.castShadow = true; o.traverse((n) => (n.castShadow = true)); scene.add(o); }
    if (p === 'ruler') { const o = ruler(); o.position.set(0.24, 0.002, -0.12); o.rotation.y = deg(-38); o.castShadow = true; scene.add(o); }
  }
  for (const f of D.folders || []) { const o = folder(f.open !== false, r()); o.position.set(f.x ?? 0, 0.001, f.y ?? 0); o.rotation.y = deg(f.rot ?? 0); o.traverse((n) => { n.castShadow = n.receiveShadow = true; }); scene.add(o); }
  for (const ph of D.photos || []) {
    let img = null; try { img = ph.file ? await loadImage(E.base + ph.file) : null; } catch (e) { img = null; }
    const asp = img ? img.width / img.height : ph.kind === 'blueprint' ? 1.3 : 0.8; const w = ph.w || 0.14; const c = makeCanvas(1024, Math.round(1024 / asp)), g = c.getContext('2d');
    if (img) { g.drawImage(img, 0, 0, c.width, c.height); if (ph.bw !== false) { const d = g.getImageData(0, 0, c.width, c.height); for (let i = 0; i < d.data.length; i += 4) { const l = d.data[i] * 0.3 + d.data[i + 1] * 0.59 + d.data[i + 2] * 0.11; d.data[i] = l * 1.02; d.data[i + 1] = l; d.data[i + 2] = l * 0.95; } g.putImageData(d, 0, 0); } }
    else if (ph.kind === 'blueprint') { g.fillStyle = '#f2f1ec'; g.fillRect(0, 0, c.width, c.height); g.strokeStyle = '#555'; g.lineWidth = 2; drawIcon(g, ph.icon || 'prop', c.width * 0.35, c.height * 0.5, c.height * 0.8, 'rgba(0,0,0,0)'); g.save(); g.globalAlpha = 0.7; g.strokeStyle = '#444'; g.strokeRect(30, 30, c.width - 60, c.height - 60); g.beginPath(); g.moveTo(c.width * 0.35, 40); g.lineTo(c.width * 0.35, c.height - 40); g.moveTo(40, c.height * 0.5); g.lineTo(c.width * 0.7, c.height * 0.5); g.stroke(); g.restore(); g.fillStyle = '#666'; for (let i = 0; i < 16; i++) g.fillRect(c.width * 0.74, 80 + i * 30, 160, 4); }
    else { g.fillStyle = '#9a958c'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#555'; g.font = `600 48px ${FONTS.sans}`; g.textAlign = 'center'; g.fillText(ph.placeholder || 'photo', c.width / 2, c.height / 2); }
    if (ph.border !== false && ph.kind !== 'blueprint') { g.strokeStyle = '#f3f0e8'; g.lineWidth = 26; g.strokeRect(0, 0, c.width, c.height); }
    const s = sheet(w, w / asp, canvasTexture(c)); s.position.set(ph.x ?? 0, 0.003 + (ph.layer || 0) * 0.001, ph.y ?? 0); s.rotation.y = deg(ph.rot ?? (r() - 0.5) * 16); scene.add(s);
  }
  const camera = new THREE.PerspectiveCamera(35, E.W / E.H, 0.01, 20);
  const rig = cameraRig(camera, D.camera || { from: { az: 90, el: 72, dist: 1.25, fov: 35 }, to: { az: 92, el: 74, dist: 1.12, fov: 35 } }, { center: new THREE.Vector3(0, 0, 0), size: 0.42, defaults: { fov: 35 } });
  return {
    scene, camera, post: { look: 'desk', dof: D.dof === false ? null : { focus: 0.6, aperture: D.aperture ?? 0.01, maxblur: 0.008 } },
    update(u, p) { if (pg) { pg.drawImage(bgImg, 0, 0); drawDiagram(pg, D.items, u, { W: 2048, H: 1448 * (1600 / 1600), imgs, pencil: true }); paperTex.needsUpdate = true; } const lk = rig(p, u); this.dofFocus = camera.position.distanceTo(lk); },
  };
});
