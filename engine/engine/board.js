// board.js — whiteboard sets.
//   timeline : a long whiteboard with a black arrowed timeline, years in marker, red event ticks, photos pinned with coloured
//              push-pins, yellow sticky notes, binder clips and documents; the camera glides along it with shallow focus.
//   board    : a whiteboard on a stand with an animated marker diagram (diagram.js) — physics, charts, tables, flows.
import * as THREE from 'three';
import { register } from './core.js';
import { studioEnv } from './studio.js';
import { drawDiagram, preloadDiagram } from './diagram.js';
import { drawIcon } from './icons.js';
import { makeCanvas, canvasTexture, textPlane, FONTS, rng, deg, lerp, EASE, range, easeOut, smooth, loadImage } from './util.js';
import { cameraRig } from './cameras.js';

const PIN = { red: '#e0262f', green: '#3dcf4a', yellow: '#f2d022', blue: '#2b56e0', white: '#f2f2f2' };
function boardSurface(w, h, seed = 2) {
  const c = makeCanvas(2048, Math.round((2048 * h) / w)), g = c.getContext('2d'); g.fillStyle = '#efefef'; g.fillRect(0, 0, c.width, c.height); const r = rng(seed);
  g.globalAlpha = 0.025; for (let i = 0; i < 90; i++) { g.fillStyle = r() < 0.5 ? '#000' : '#9aa'; g.beginPath(); g.ellipse(r() * c.width, r() * c.height, 40 + r() * 200, 10 + r() * 50, r() * 3, 0, Math.PI * 2); g.fill(); }
  return canvasTexture(c);
}
function frameAround(grp, w, h, t = 0.045) {
  const mat = new THREE.MeshStandardMaterial({ color: '#c9ccd0', metalness: 0.85, roughness: 0.3 });
  const bar = (len, horiz) => new THREE.Mesh(new THREE.BoxGeometry(horiz ? len + t * 2 : t, horiz ? t : len, t * 0.9), mat);
  const top = bar(w, true); top.position.set(0, h / 2 + t / 2, 0.01); const bot = bar(w, true); bot.position.set(0, -h / 2 - t / 2, 0.01);
  const l = bar(h, false); l.position.set(-w / 2 - t / 2, 0, 0.01); const r = bar(h, false); r.position.set(w / 2 + t / 2, 0, 0.01); grp.add(top, bot, l, r);
}
function stand(grp, x, h) {
  const mat = new THREE.MeshStandardMaterial({ color: '#e8e8e8', roughness: 0.4, metalness: 0.2 }); const metal = new THREE.MeshStandardMaterial({ color: '#b9bdc2', metalness: 0.85, roughness: 0.28 });
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h + 1.2, 16), mat); leg.position.set(x, -0.3, -0.06); grp.add(leg);
  const clamp1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.14), metal); clamp1.position.set(x, 0, -0.02); grp.add(clamp1);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 12), metal); knob.rotation.z = Math.PI / 2; knob.position.set(x + Math.sign(x) * 0.15, 0, 0.0); grp.add(knob);
}
function pin(color) { const g = new THREE.Group(); const head = new THREE.Mesh(new THREE.SphereGeometry(0.035, 20, 14), new THREE.MeshPhysicalMaterial({ color: PIN[color] || color, roughness: 0.18, clearcoat: 1, metalness: 0 })); head.scale.z = 0.8; head.position.z = 0.04; const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.04, 10), head.material); neck.rotation.x = Math.PI / 2; neck.position.z = 0.012; g.add(head, neck); return g; }
function shadowTex() { const c = makeCanvas(128, 128), g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 20, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return canvasTexture(c); }
let SH = null;
function paperShadow(w, h) { SH ||= shadowTex(); const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.12, h * 1.12), new THREE.MeshBasicMaterial({ map: SH, transparent: true, depthWrite: false })); m.position.set(0.03, -0.04, -0.004); return m; }
function stickyTex(text, color = '#f6e39b') {
  const c = makeCanvas(512, 512), g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 512, 512); const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(0,0,0,.08)'); g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  g.fillStyle = '#2a2a2a'; g.textAlign = 'left'; g.textBaseline = 'middle'; const lines = String(text).split('\n'); const fs = lines.length > 4 ? 52 : 62; g.font = `400 ${fs}px ${FONTS.hand}`; lines.forEach((l, i) => g.fillText(l, 40, 256 - ((lines.length - 1) * fs * 1.15) / 2 + i * fs * 1.15)); return canvasTexture(c);
}
function docTex(kind = 'text', seed = 1, icon = 'prop') {
  const c = makeCanvas(600, 780), g = c.getContext('2d'); g.fillStyle = '#f7f7f5'; g.fillRect(0, 0, 600, 780); const r = rng(seed); g.fillStyle = '#9a9a9a';
  if (kind === 'drawing') { g.strokeStyle = '#555'; g.lineWidth = 2; g.save(); g.globalAlpha = 0.85; drawIcon(g, icon, 200, 330, 300, 'rgba(0,0,0,0)'); g.restore(); g.strokeRect(60, 140, 290, 380); g.beginPath(); g.moveTo(60, 330); g.lineTo(350, 330); g.moveTo(205, 140); g.lineTo(205, 520); g.stroke(); for (let i = 0; i < 18; i++) { g.fillStyle = '#888'; g.fillRect(380, 150 + i * 22, 160 * r() + 40, 5); } }
  else { for (let i = 0; i < 26; i++) g.fillRect(50, 70 + i * 26, 380 + r() * 120, 6); g.fillStyle = '#b5b5b5'; g.beginPath(); g.arc(470, 70, 34, 0, Math.PI * 2); g.fill(); }
  return canvasTexture(c);
}
function clip() { const g = new THREE.Group(); const blk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.12, 4, 1), new THREE.MeshStandardMaterial({ color: '#1d1d1f', roughness: 0.45, metalness: 0.4 })); blk.rotation.set(Math.PI / 2, Math.PI / 4, 0); blk.scale.set(1.3, 1, 0.5); g.add(blk); const wire = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.01, 8, 24, Math.PI), new THREE.MeshStandardMaterial({ color: '#cfd2d6', metalness: 0.95, roughness: 0.2 })); wire.position.set(0, 0.08, 0.06); g.add(wire); const w2 = wire.clone(); w2.rotation.x = 0.6; w2.position.z = 0.09; g.add(w2); return g; }

async function photoMesh(item, base, h) {
  let img = null; try { img = item.file ? await loadImage(base + item.file) : null; } catch (e) { img = null; }
  const asp = img ? img.width / img.height : 1.35; const w = item.w || h * asp; const hh = w / asp;
  const c = makeCanvas(1024, Math.round(1024 / asp)), g = c.getContext('2d');
  if (img) { g.drawImage(img, 0, 0, c.width, c.height); if (item.bw) { const d = g.getImageData(0, 0, c.width, c.height); for (let i = 0; i < d.data.length; i += 4) { const l = d.data[i] * 0.3 + d.data[i + 1] * 0.59 + d.data[i + 2] * 0.11; d.data[i] = d.data[i + 1] = d.data[i + 2] = l; } g.putImageData(d, 0, 0); } }
  else { g.fillStyle = '#cfd4d8'; g.fillRect(0, 0, c.width, c.height); drawIcon(g, item.icon || 'prop', c.width / 2, c.height / 2, c.height * 0.8, '#7b8188'); g.fillStyle = '#555'; g.font = `600 40px ${FONTS.sans}`; g.textAlign = 'center'; g.fillText(item.placeholder || 'photo', c.width / 2, c.height - 40); }
  const grp = new THREE.Group();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh, 8, 8), new THREE.MeshStandardMaterial({ map: canvasTexture(c), roughness: 0.6 }));
  const pa = m.geometry.attributes.position; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i); pa.setZ(i, 0.006 + 0.012 * Math.pow(Math.abs(x) / (w / 2), 3) * (item.curl ?? 1)); } m.geometry.computeVertexNormals();
  grp.add(m, paperShadow(w, hh)); const pins = item.pins || ['red', 'green'];
  pins.forEach((col, i) => { const p = pin(col); p.position.set((i === 0 ? -1 : 1) * w * 0.4, hh * 0.42, 0.012); grp.add(p); });
  if (item.label) { const t = textPlane(item.label, { font: FONTS.hand, size: 120, color: '#1f1f1f', pad: 6 }, item.labelSize || 0.2); t.position.set(0, (item.labelBelow ? -hh / 2 - 0.16 : hh / 2 + 0.2), 0.005); t.material.depthWrite = false; grp.add(t); }
  grp.userData.w = w; grp.userData.h = hh; return grp;
}

// ------------------------------------------------------------------ timeline
register('timeline', async (spec, E) => {
  const T = spec.timeline || spec; const scene = new THREE.Scene(); scene.background = new THREE.Color('#b9ad98');
  scene.environment = studioEnv(E.renderer); scene.environmentIntensity = 0.5;
  scene.add(new THREE.HemisphereLight('#ffffff', '#cdbfa6', 1.3)); const dl = new THREE.DirectionalLight('#fff', 1.6); dl.position.set(-2, 6, 6); dl.castShadow = true; dl.shadow.mapSize.set(2048, 2048); Object.assign(dl.shadow.camera, { left: -12, right: 12, top: 6, bottom: -6, near: 0.5, far: 30 }); dl.shadow.radius = 5; scene.add(dl);
  const y0 = T.from ?? 1950, y1 = T.to ?? 2030; const L = T.length || Math.max(8, (y1 - y0) * 0.16); const H = T.height || 4.2;
  const X = (yr) => -L / 2 + 0.6 + ((yr - y0) / (y1 - y0)) * (L - 1.2);
  const board = new THREE.Group(); scene.add(board);
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(L, H), new THREE.MeshStandardMaterial({ map: boardSurface(L, H), roughness: 0.32, metalness: 0 })); surf.receiveShadow = true; board.add(surf); frameAround(board, L, H);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(L * 3, 20), new THREE.MeshStandardMaterial({ color: '#b6a992', roughness: 1 })); wall.position.z = -3; scene.add(wall);
  const ink = new THREE.MeshBasicMaterial({ color: '#202020', toneMapped: false }); const red = new THREE.MeshBasicMaterial({ color: '#d63a45', toneMapped: false });
  const ly = T.lineY ?? 0; const line = new THREE.Mesh(new THREE.BoxGeometry(L - 0.4, 0.03, 0.004), ink); line.position.set(0, ly, 0.004); board.add(line);
  for (const s of [-1, 1]) if (T.arrows !== false && (s < 0 ? T.arrowLeft !== false : true)) { const hd = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(-0.22, 0.1), new THREE.Vector2(-0.22, -0.1)])), ink); hd.position.set(s * (L / 2 - 0.2), ly, 0.005); if (s < 0) hd.rotation.z = Math.PI; board.add(hd); }
  const items = []; const add = (o, at) => { o.userData.at = at; items.push(o); board.add(o); };
  for (const yr of T.years || []) { const v = typeof yr === 'object' ? yr : { year: yr }; const tk = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.004), ink); tk.position.set(X(v.year), ly, 0.005); const lbl = textPlane(v.label || String(v.year), { font: FONTS.hand, size: 140, color: '#1d1d1d', pad: 4 }, 0.3); lbl.position.set(X(v.year), ly + 0.3, 0.006); const g = new THREE.Group(); g.add(tk, lbl); add(g, v.at ?? 0); }
  let lastEvX = -1e9, stag = 0; for (const ev of [...(T.events || [])].sort((a, b) => (a.x ?? X(a.year)) - (b.x ?? X(b.year)))) { const ex = ev.x ?? X(ev.year); stag = ex - lastEvX < 1.25 ? stag + 1 : 0; lastEvX = ex; const dyS = (ev.dy ?? -0.36 * (stag % 2)); const tk = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.16, 0.004), red); tk.position.set(X(ev.year), ly - 0.1, 0.005); const lbl = textPlane(ev.text, { font: FONTS.hand, size: 90, color: '#d63a45', pad: 4, align: 'left', weight: 400 }, 0.11 * String(ev.text).split('\n').length * 1.15); lbl.position.set(ex + (lbl.geometry.parameters.width / 2) - 0.05, ly - 0.32 + dyS - (String(ev.text).split('\n').length - 1) * 0.06, 0.006); tk.position.x = ex; const g = new THREE.Group(); g.add(tk, lbl); add(g, ev.at ?? 0); }
  const r = rng(T.seed || 5); const pinCols = ['red', 'green', 'yellow', 'blue'];
  for (const ph of T.photos || []) { const m = await photoMesh({ pins: [pinCols[Math.floor(r() * 4)], pinCols[Math.floor(r() * 4)]], ...ph }, E.base, ph.h || 0.9); m.position.set(ph.x ?? X(ph.year), ly + (ph.y ?? 1.0), 0.01 + r() * 0.004); m.rotation.z = deg(ph.rot ?? (r() - 0.5) * 4); add(m, ph.at ?? 0); }
  for (const n of T.notes || []) { const s = n.size || 0.62; const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s, 6, 6), new THREE.MeshStandardMaterial({ map: stickyTex(n.text, n.color), roughness: 0.75 })); const pa = m.geometry.attributes.position; for (let i = 0; i < pa.count; i++) { const yy = pa.getY(i); pa.setZ(i, yy < -s * 0.2 ? Math.pow((-yy - s * 0.2) / (s * 0.3), 2) * 0.03 : 0); } m.geometry.computeVertexNormals(); g.add(m, paperShadow(s, s)); if (n.pin !== false) { const p = pin(n.pin || pinCols[Math.floor(r() * 4)]); p.position.set(0, s * 0.36, 0.01); g.add(p); } g.position.set(n.x ?? X(n.year), ly + (n.y ?? -1.0), 0.02); g.rotation.z = deg(n.rot ?? (r() - 0.5) * 6); add(g, n.at ?? 0); }
  for (const d of T.docs || []) { const w = d.w || 0.9, h = w * 1.3; const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: docTex(d.kind, d.seed || r() * 100, d.icon), roughness: 0.8 })); g.add(m, paperShadow(w, h)); g.position.set(d.x ?? X(d.year), ly + (d.y ?? -1.3), 0.008); g.rotation.z = deg(d.rot ?? (r() - 0.5) * 3); add(g, d.at ?? 0); }
  for (const c of T.clips || []) { const g = clip(); g.position.set(c.x ?? X(c.year), ly + (c.y ?? -0.9), 0.04); add(g, c.at ?? 0); }
  for (const t of T.texts || []) { const p = textPlane(t.text, { font: FONTS.hand, size: 120, color: t.color === 'red' ? '#d63a45' : '#1d1d1d', pad: 4 }, t.size || 0.25); p.position.set(t.x ?? X(t.year), ly + (t.y ?? 1.6), 0.006); add(p, t.at ?? 0); }
  board.traverse((o) => { if (o.isMesh && o !== surf && !o.material.transparent) o.castShadow = true; });
  const camera = new THREE.PerspectiveCamera(35, E.W / E.H, 0.05, 100);
  const C = T.camera || spec.camera || { from: { year: y0 + (y1 - y0) * 0.15, y: 0.3, dist: 4.6 }, to: { year: y0 + (y1 - y0) * 0.45, y: 0.3, dist: 4.4 } };
  const F = { y: 0.3, dist: 4.5, yaw: -8, pitch: 0, fov: 35, ...(C.from || C) }, Tt = { ...F, ...(C.to || {}) }; const ease = EASE[C.ease || 'cam'];
  const look = new THREE.Vector3();
  return {
    scene, camera, post: { look: 'board', dof: spec.dof === false ? null : { focus: 3, aperture: spec.aperture ?? 0.0035, maxblur: 0.01 } },
    update(u, p) {
      const e = ease(p); const xa = F.x ?? X(F.year), xb = Tt.x ?? X(Tt.year ?? F.year);
      look.set(lerp(xa, xb, e), ly + lerp(F.y, Tt.y, e), 0); const d = lerp(F.dist, Tt.dist, e), yaw = deg(lerp(F.yaw, Tt.yaw, e)), pit = deg(lerp(F.pitch, Tt.pitch, e));
      camera.position.set(look.x + Math.sin(yaw) * d, look.y + Math.sin(pit) * d, Math.cos(yaw) * Math.cos(pit) * d); camera.fov = lerp(F.fov, Tt.fov, e); camera.updateProjectionMatrix(); camera.lookAt(look); this.dofFocus = d;
      items.forEach((o) => { const a = o.userData.at || 0; const k = easeOut(range(u, a, a + 0.35)); o.visible = u >= a; if (a > 0) { o.scale.setScalar(0.85 + 0.15 * k); o.position.z = (o.userData.z0 ??= o.position.z) + (1 - k) * 0.08; } });
    },
  };
});

// ------------------------------------------------------------------ whiteboard diagram on a stand
register('board', async (spec, E) => {
  const D = spec.diagram || spec; const scene = new THREE.Scene(); scene.background = new THREE.Color('#b3a690');
  scene.environment = studioEnv(E.renderer); scene.environmentIntensity = 0.5; scene.add(new THREE.HemisphereLight('#ffffff', '#cdbfa6', 1.25));
  const dl = new THREE.DirectionalLight('#fff', 1.3); dl.position.set(-1.5, 4, 5); scene.add(dl);
  const Wb = 4.8, Hb = 2.7; const grp = new THREE.Group(); scene.add(grp);
  const cw = 2048, chh = 1152; const c = makeCanvas(cw, chh), g = c.getContext('2d'); const tex = canvasTexture(c); const bg = boardSurface(Wb, Hb).image;
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(Wb, Hb), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3 })); grp.add(surf); frameAround(grp, Wb, Hb, 0.05);
  if (D.stand !== false) { stand(grp, -Wb / 2 - 0.12, Hb); stand(grp, Wb / 2 + 0.12, Hb); }
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), new THREE.MeshStandardMaterial({ color: '#b2a48c', roughness: 1 })); wall.position.z = -4; scene.add(wall);
  const imgs = await preloadDiagram(D.items, E.base);
  const camera = new THREE.PerspectiveCamera(35, E.W / E.H, 0.05, 100);
  const C = D.camera || { from: { az: 90, el: 0, dist: 0.74, fov: 35 }, to: { az: 90, el: 0, dist: 0.69, fov: 35 } };
  // az 90 = straight on (board faces +Z); dist relative to board width
  const rig = cameraRig(camera, C, { center: new THREE.Vector3(0, 0, 0), size: Wb * 1.5, defaults: { az: 90, el: 0, dist: 1.0, fov: 35 } });
  return {
    scene, camera, post: { look: 'board', dof: D.dof ? { focus: 6, aperture: 0.002, maxblur: 0.008 } : null },
    update(u, p) { g.drawImage(bg, 0, 0, cw, chh); drawDiagram(g, D.items, u, { W: cw, H: chh, imgs }); tex.needsUpdate = true; const lk = rig(p, u); this.dofFocus = camera.position.distanceTo(lk); },
  };
});
