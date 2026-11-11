// cockpit.js — dark cockpit interiors with a blue mannequin pilot (vintage gauges or modern glass), and a cabin interior.
import * as THREE from 'three';
import { register } from './core.js';
import { studioEnv } from './studio.js';
import { personGeometry, OV } from './overlays.js';
import { makeCanvas, canvasTexture, rng, deg, FONTS, noise1 } from './util.js';
import { cameraRig } from './cameras.js';

function panelTexture(style, u = 0, seed = 2) {
  const w = 2048, h = 900, c = makeCanvas(w, h), g = c.getContext('2d'); const r = rng(seed);
  g.fillStyle = style === 'modern' ? '#2a2d31' : '#26272a'; g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.08; for (let i = 0; i < 400; i++) { g.fillStyle = r() < 0.5 ? '#fff' : '#000'; g.fillRect(r() * w, r() * h, 60, 2); } g.globalAlpha = 1;
  if (style === 'modern') {
    for (let i = 0; i < 4; i++) { const x = 160 + i * 440, y = 160; g.fillStyle = '#0c0f12'; g.fillRect(x, y, 380, 380); g.strokeStyle = '#555'; g.lineWidth = 6; g.strokeRect(x, y, 380, 380);
      const gr = g.createLinearGradient(x, y, x, y + 380); gr.addColorStop(0, i % 2 ? '#1c3a5c' : '#2b4f7a'); gr.addColorStop(0.5, i % 2 ? '#0e1d2c' : '#6b4a2a'); gr.addColorStop(1, '#0b0e12'); g.fillStyle = gr; g.fillRect(x + 20, y + 20, 340, 340);
      g.strokeStyle = '#7cf08f'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + 40, y + 190); g.lineTo(x + 340, y + 190); g.stroke(); g.fillStyle = '#7cf08f'; g.font = `600 28px ${FONTS.sans}`; g.fillText(String(120 + i * 35), x + 40, y + 60); }
    for (let i = 0; i < 40; i++) { g.fillStyle = '#4a4e53'; g.fillRect(140 + (i % 20) * 88, 600 + Math.floor(i / 20) * 70, 60, 40); }
  } else {
    const gauges = [[300, 300, 150, 'AIR SPEED'], [620, 260, 120, 'ALT'], [900, 300, 140, 'COMPASS'], [1200, 260, 110, 'RPM'], [1480, 300, 140, 'OIL'], [1760, 280, 110, 'FUEL'], [460, 620, 110, 'CLIMB'], [780, 640, 100, 'BANK'], [1080, 620, 120, 'TEMP'], [1380, 640, 100, 'PRESS'], [1680, 620, 110, 'TIME']];
    for (const [x, y, R, lbl] of gauges) {
      g.fillStyle = '#b8a473'; g.beginPath(); g.arc(x, y, R + 14, 0, Math.PI * 2); g.fill(); g.fillStyle = '#121418'; g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#e9e6dc'; g.lineWidth = 3; for (let k = 0; k <= 30; k++) { const a = -Math.PI * 1.25 + (k / 30) * Math.PI * 1.5; const l = k % 5 ? 0.88 : 0.78; g.beginPath(); g.moveTo(x + Math.cos(a) * R * 0.95, y + Math.sin(a) * R * 0.95); g.lineTo(x + Math.cos(a) * R * l, y + Math.sin(a) * R * l); g.stroke(); }
      g.fillStyle = '#e9e6dc'; g.font = `600 ${R * 0.16}px ${FONTS.sans}`; g.textAlign = 'center'; g.fillText(lbl, x, y + R * 0.45);
      const a = -Math.PI * 1.25 + (0.35 + 0.25 * noise1(u * 0.4 + x, 3)) * Math.PI * 1.5; g.strokeStyle = '#f2efe6'; g.lineWidth = 6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * R * 0.8, y + Math.sin(a) * R * 0.8); g.stroke(); g.fillStyle = '#333'; g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.ellipse(x - R * 0.3, y - R * 0.4, R * 0.5, R * 0.25, -0.5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#c9b78a'; for (let i = 0; i < 20; i++) { g.beginPath(); g.arc(r() * w, 40 + r() * (h - 80), 8, 0, Math.PI * 2); g.fill(); }
  }
  return c;
}

register('cockpit', async (spec, E) => {
  const K = spec.cockpit || spec; const style = K.style || 'vintage'; const scene = new THREE.Scene(); scene.background = new THREE.Color('#050506');
  scene.environment = studioEnv(E.renderer); scene.environmentIntensity = 0.18;
  const dark = new THREE.MeshStandardMaterial({ color: style === 'modern' ? '#3a3d42' : '#3b3c40', roughness: 0.62, metalness: 0.25 }); const tube = new THREE.MeshStandardMaterial({ color: '#8f9399', roughness: 0.35, metalness: 0.8 });
  const room = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.5, 2.6), new THREE.MeshStandardMaterial({ color: '#2b2c30', roughness: 0.8, side: THREE.BackSide })); room.position.set(0, 0.75, 0); room.receiveShadow = true; scene.add(room);
  // windows (bright) on both sides + small front window
  const winMat = new THREE.MeshBasicMaterial({ color: K.outside || '#dfe9f2', toneMapped: true }); for (const s of [1, -1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.42), winMat); w.position.set(s * 0.69, 1.12, 0.25); w.rotation.y = -s * Math.PI / 2; scene.add(w); const l = new THREE.RectAreaLight ? null : null; }
  if (K.frontWindow !== false && style !== 'vintage_blind') { const fw = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.35), winMat); fw.position.set(0, 1.25, -1.29); scene.add(fw); }
  // instrument panel
  const pc = panelTexture(style, 0, K.seed || 2); const ptex = canvasTexture(pc); const panel = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.55, 40, 1, true, -0.42, 0.84), new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.55, metalness: 0.3, side: THREE.DoubleSide }));
  panel.rotation.y = Math.PI; panel.position.set(0, 0.92, 0.55); panel.scale.set(1, 1, 1); scene.add(panel);
  // frame tubes
  const tubeAt = (a, b) => { const v = new THREE.Vector3().subVectors(b, a); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, v.length(), 10), tube); m.position.copy(a).addScaledVector(v, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); m.castShadow = true; scene.add(m); };
  for (const s of [1, -1]) { tubeAt(new THREE.Vector3(s * 0.62, 0.2, -1.0), new THREE.Vector3(s * 0.62, 1.45, -0.2)); tubeAt(new THREE.Vector3(s * 0.62, 1.45, -0.2), new THREE.Vector3(s * 0.62, 0.3, 0.9)); tubeAt(new THREE.Vector3(s * 0.62, 0.95, -1.2), new THREE.Vector3(s * 0.62, 0.95, 1.2)); }
  // seat, stick, pilot
  const seatMat = new THREE.MeshStandardMaterial({ color: style === 'vintage' ? '#b8a07a' : '#2d3036', roughness: 0.9 });
  const seat = new THREE.Group(); const sb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), seatMat); sb.position.set(0, 0.45, 0); const sbk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.06), seatMat); sbk.position.set(0, 0.8, -0.27); sbk.rotation.x = -0.12; seat.add(sb, sbk); seat.position.set(0, 0, -0.45); seat.traverse((n) => { n.castShadow = n.receiveShadow = true; }); scene.add(seat);
  const stick = new THREE.Group(); const st = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.55, 10), new THREE.MeshStandardMaterial({ color: '#1d1d1f', metalness: 0.5, roughness: 0.4 })); st.position.y = 0.27; const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshStandardMaterial({ color: '#e7dcc7', roughness: 0.5 })); knob.position.y = 0.56; stick.add(st, knob); stick.position.set(0.0, 0.2, 0.05); scene.add(stick);
  let pilot = null;
  if (K.pilot !== false) { const geo = await personGeometry(true); pilot = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: OV.blue, roughness: 0.6, flatShading: true })); pilot.rotation.y = -Math.PI / 2; pilot.position.set(0, -0.47, -0.5); pilot.castShadow = true; scene.add(pilot); }
  // light: through the side windows + soft fill
  const key = new THREE.DirectionalLight('#eef4ff', 2.6); key.position.set(2.5, 2.2, 0.4); key.target.position.set(0, 0.8, -0.2); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: 0.1, far: 6 }); key.shadow.radius = 5; scene.add(key, key.target);
  scene.add(new THREE.HemisphereLight('#9fb2c8', '#1a1a1c', 0.55)); const fill = new THREE.PointLight('#ffffff', 0.6, 3); fill.position.set(0, 1.3, 0.6); scene.add(fill);
  const camera = new THREE.PerspectiveCamera(40, E.W / E.H, 0.01, 30);
  const views = {
    over_shoulder: { from: { pos: [0.42, 1.28, -1.2], look: [0.0, 0.92, 0.6], fov: 44 }, to: { pos: [0.38, 1.25, -1.08], look: [0.0, 0.92, 0.6], fov: 42 } },
    panel: { from: { pos: [0.15, 1.1, -0.1], look: [0.05, 0.95, 0.6], fov: 38 }, to: { pos: [0.1, 1.05, 0.1], look: [0.0, 0.93, 0.6], fov: 36 } },
    pilot: { from: { pos: [0.5, 1.1, 0.45], look: [0.0, 0.95, -0.5], fov: 40 }, to: { pos: [0.45, 1.08, 0.35], look: [0.0, 0.95, -0.5], fov: 38 } },
    rear: { from: { pos: [0.0, 1.25, -1.25], look: [0.0, 1.0, 0.8], fov: 50 }, to: { pos: [0.0, 1.22, -1.1], look: [0.0, 1.0, 0.8], fov: 48 } },
  };
  const C = K.camera || views[K.view || 'over_shoulder'] || views.over_shoulder;
  const rig = cameraRig(camera, C, { center: new THREE.Vector3(0, 1, 0), size: 1 });
  return {
    scene, camera, post: { look: 'cockpit' },
    update(u, p) { if (style !== 'modern') { const c2 = panelTexture(style, u, K.seed || 2); ptex.image = c2; ptex.needsUpdate = true; } rig(p, u); if (pilot) pilot.rotation.z = noise1(u * 0.5, 4) * 0.01; stick.rotation.x = noise1(u * 0.7, 6) * 0.06; },
  };
});

// cabin: rows of seats down a fuselage tube (airliner / transport), seen from the front or the back
register('cabin', async (spec, E) => {
  const K = spec.cabin || spec; const scene = new THREE.Scene(); scene.background = new THREE.Color('#08080a'); scene.environment = studioEnv(E.renderer); scene.environmentIntensity = 0.2;
  const L = K.length || 12, R = K.radius || 1.25; const tubeG = new THREE.CylinderGeometry(R, R, L, 40, 1, true); tubeG.rotateX(Math.PI / 2); const tube = new THREE.Mesh(tubeG, new THREE.MeshStandardMaterial({ color: K.wall || '#3a3b3e', roughness: 0.75, side: THREE.BackSide })); tube.position.y = R * 0.85; scene.add(tube);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(R * 1.6, L).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2a2b2d', roughness: 0.9 })); floor.position.y = 0.02; scene.add(floor);
  const seatMat = new THREE.MeshStandardMaterial({ color: K.seat || '#3c4048', roughness: 0.8 }); const n = K.rows || 10;
  if (K.layout === 'bench') { for (const s of [1, -1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, L * 0.85), seatMat); b.position.set(s * R * 0.62, 0.45, 0); scene.add(b); const bk = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, L * 0.85), seatMat); bk.position.set(s * R * 0.84, 0.8, 0); scene.add(bk); } }
  else for (let i = 0; i < n; i++) for (const x of K.cols || [-0.75, -0.3, 0.45]) { const g = new THREE.Group(); const sb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.45), seatMat); sb.position.y = 0.45; const bk = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.65, 0.08), seatMat); bk.position.set(0, 0.8, 0.22); g.add(sb, bk); g.position.set(x, 0, -L / 2 + 1 + i * ((L - 2) / n)); scene.add(g); }
  const winMat = new THREE.MeshBasicMaterial({ color: '#e8eef5' }); for (let i = 0; i < n; i++) for (const s of [1, -1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.36), winMat); w.position.set(s * (R - 0.05), 1.15, -L / 2 + 1.2 + i * ((L - 2) / n)); w.rotation.y = -s * Math.PI / 2; scene.add(w); }
  scene.add(new THREE.HemisphereLight('#cfd8e2', '#111', 0.7)); for (let i = 0; i < 5; i++) { const pl = new THREE.PointLight('#fff2e0', 1.2, 4); pl.position.set(0, 1.9, -L / 2 + 1 + i * (L / 5)); scene.add(pl); }
  const camera = new THREE.PerspectiveCamera(50, E.W / E.H, 0.05, 50);
  const rig = cameraRig(camera, K.camera || { from: { pos: [0, 1.4, L / 2 - 0.3], look: [0, 1.1, -L / 2], fov: 55 }, to: { pos: [0, 1.38, L / 2 - 1.2], look: [0, 1.1, -L / 2], fov: 55 } }, { center: new THREE.Vector3(), size: 1 });
  return { scene, camera, post: { look: 'cockpit' }, update(u, p) { rig(p, u); } };
});

// archival placeholder: the finishing step lays framed footage / photos over this black slot
register('archival', async (spec, E) => { const scene = new THREE.Scene(); scene.background = new THREE.Color('#0c0c0c'); return { scene, camera: new THREE.PerspectiveCamera(40, E.W / E.H, 0.1, 10), post: { look: 'black' } }; });
