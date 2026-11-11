// overlays.js — the annotation language of the reference videos:
//   red dimension lines "14 m / 45 ft", red counting stats "25,000 ft / 7,620 m", magenta part highlights,
//   mint x-ray volumes (fuel tanks, engines, drive shafts), blue/green low-poly people for scale, angle arcs, labels.
import * as THREE from 'three';
import { textPlane, FONTS, dual, clamp, easeOut, smooth, range, deg, lerp } from './util.js';
import { resolvePoint } from './cameras.js';

export const OV = { red: '#e3404c', magenta: '#ec6fdc', mint: '#86e6c6', blue: '#8cc6ef', green: '#5fd23f', dark: '#26292d' };

// ---------- people (low-poly mannequins)
let personGeo = null, seatedGeo = null;
function limb(a, b, r1, r2, seg = 6) { const v = new THREE.Vector3().subVectors(b, a); const g = new THREE.CylinderGeometry(r2, r1, v.length(), seg, 1); g.translate(0, v.length() / 2, 0); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize()); g.applyQuaternion(q); g.translate(a.x, a.y, a.z); return g; }
function blob(c, sx, sy, sz, det = 1) { const g = new THREE.IcosahedronGeometry(1, det); g.scale(sx, sy, sz); g.translate(c.x, c.y, c.z); return g; }
async function merge(geos) { const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js'); const nonIdx = geos.map((g) => (g.index ? g.toNonIndexed() : g)); nonIdx.forEach((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k); }); const m = mergeGeometries(nonIdx); m.computeVertexNormals(); return m; }
const V = (x, y, z) => new THREE.Vector3(x, y, z);
export async function personGeometry(seated = false) {
  if (!seated && personGeo) return personGeo; if (seated && seatedGeo) return seatedGeo;
  const g = [];
  g.push(blob(V(0, 1.66, 0), 0.105, 0.13, 0.11, 1)); // head
  g.push(limb(V(0, 1.44, 0), V(0, 1.56, 0), 0.055, 0.05)); // neck
  g.push(limb(V(0, 1.0, 0), V(0, 1.47, 0), 0.15, 0.2, 7)); // torso
  g.push(blob(V(0, 1.38, 0), 0.215, 0.09, 0.12, 1)); // shoulders
  g.push(blob(V(0, 0.98, 0), 0.17, 0.11, 0.12, 1)); // pelvis
  if (!seated) {
    for (const s of [1, -1]) { g.push(limb(V(0, 0.92, 0.09 * s), V(0, 0.5, 0.1 * s), 0.08, 0.065)); g.push(limb(V(0, 0.5, 0.1 * s), V(0.0, 0.08, 0.1 * s), 0.06, 0.05)); g.push(blob(V(0.06, 0.04, 0.1 * s), 0.12, 0.04, 0.05, 0));
      g.push(limb(V(0, 1.4, 0.21 * s), V(0.0, 1.1, 0.25 * s), 0.05, 0.045)); g.push(limb(V(0.0, 1.1, 0.25 * s), V(0.04, 0.83, 0.25 * s), 0.042, 0.035)); g.push(blob(V(0.05, 0.77, 0.25 * s), 0.035, 0.06, 0.03, 0)); }
  } else {
    for (const s of [1, -1]) { g.push(limb(V(0, 0.95, 0.1 * s), V(0.45, 0.98, 0.11 * s), 0.08, 0.065)); g.push(limb(V(0.45, 0.98, 0.11 * s), V(0.5, 0.55, 0.12 * s), 0.06, 0.05)); g.push(blob(V(0.56, 0.5, 0.12 * s), 0.12, 0.04, 0.05, 0));
      g.push(limb(V(0, 1.4, 0.21 * s), V(0.12, 1.15, 0.24 * s), 0.05, 0.045)); g.push(limb(V(0.12, 1.15, 0.24 * s), V(0.4, 1.12, 0.18 * s), 0.042, 0.035)); g.push(blob(V(0.45, 1.12, 0.17 * s), 0.05, 0.035, 0.03, 0)); }
  }
  const m = await merge(g); if (seated) seatedGeo = m; else personGeo = m; return m;
}
export async function people({ count = 1, cols = null, spacing = 0.75, color = 'blue', at = [0, 0, 0], facing = 0, seated = false, seed = 1 } = {}) {
  const geo = await personGeometry(seated);
  const mat = new THREE.MeshStandardMaterial({ color: OV[color] || color, roughness: 0.62, metalness: 0.0, flatShading: true });
  const im = new THREE.InstancedMesh(geo, mat, count); im.castShadow = true; im.receiveShadow = true;
  const c = cols || Math.ceil(Math.sqrt(count)); const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); let r = seed;
  for (let i = 0; i < count; i++) { const row = Math.floor(i / c), k = i % c; r = (r * 9301 + 49297) % 233280; const j = (r / 233280 - 0.5) * 0.08;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), deg(facing) + j * 2); m.compose(new THREE.Vector3(at[0] - row * spacing * 1.1, at[1], at[2] + (k - (c - 1) / 2) * spacing), q, new THREE.Vector3(1, 1 + j, 1)); im.setMatrixAt(i, m); }
  im.userData.count = count; return im;
}

// ---------- 3D overlay objects
function lineMesh(a, b, r, color) { const v = new THREE.Vector3().subVectors(b, a); const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 8), new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, depthTest: false })); m.renderOrder = 20; m.userData.a = a.clone(); m.userData.b = b.clone(); m.userData.r = r; return m; }
function placeLine(m, a, b) { const v = new THREE.Vector3().subVectors(b, a); const L = Math.max(1e-4, v.length()); m.scale.set(1, L, 1); m.position.copy(a).addScaledVector(v, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); }

export function buildOverlays(list = [], { scene, camera, root, anchors, size, W, H }) {
  const updaters = [], uis = [];
  for (const o of list) {
    const at = o.at ?? 0.4;
    if (o.type === 'dimension') {
      const off = new THREE.Vector3(...(o.offset || [0, 0, 0]));
      const A = resolvePoint(o.from, anchors).add(off), B = resolvePoint(o.to, anchors).add(off);
      const color = o.color || OV.red; const r = (o.thickness || 0.012) * size * 0.5;
      const grp = new THREE.Group(); scene.add(grp);
      const ln = lineMesh(A, B, r, color); grp.add(ln); const t1 = lineMesh(A, A, r, color), t2 = lineMesh(B, B, r, color); grp.add(t1, t2);
      const label = o.label || (o.value != null ? dual(o.value, o.unit || 'm', o) : '');
      const tp = textPlane(label, { font: FONTS.sans, weight: 700, style: 'italic', size: 96, color, pad: 10 }, (o.textSize || 0.045) * size); tp.material.depthTest = false; tp.renderOrder = 21; grp.add(tp);
      const dir = new THREE.Vector3(), mid = new THREE.Vector3(), camRight = new THREE.Vector3(), toCam = new THREE.Vector3(), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), M = new THREE.Matrix4();
      updaters.push((u) => {
        const k = easeOut(range(u, at, at + (o.drawTime ?? 0.6))); const vis = u >= at && (o.until == null || u < o.until);
        grp.visible = vis; if (!vis) return;
        mid.lerpVectors(A, B, 0.5); dir.subVectors(B, A); const half = dir.length() / 2 * k; dir.normalize();
        const a = mid.clone().addScaledVector(dir, -half), b = mid.clone().addScaledVector(dir, half); placeLine(ln, a, b);
        // ticks perpendicular to the line, facing the camera
        camRight.setFromMatrixColumn(camera.matrixWorld, 0); toCam.subVectors(camera.position, mid).normalize();
        Z.copy(toCam).addScaledVector(dir, -toCam.dot(dir)).normalize(); Y.crossVectors(Z, dir).normalize();
        const tick = (o.tick ?? 0.03) * size; placeLine(t1, a.clone().addScaledVector(Y, -tick), a.clone().addScaledVector(Y, tick)); placeLine(t2, b.clone().addScaledVector(Y, -tick), b.clone().addScaledVector(Y, tick));
        // label along the line, reading left-to-right on screen, lifted off the line
        X.copy(dir); if (X.dot(camRight) < 0) X.negate(); const Yt = new THREE.Vector3().crossVectors(Z, X).normalize();
        M.makeBasis(X, Yt, Z); tp.quaternion.setFromRotationMatrix(M); tp.position.copy(mid).addScaledVector(Yt, (o.textOffset ?? 0.035) * size);
        tp.material.opacity = smooth(range(u, at + 0.25, at + 0.6));
      });
    } else if (o.type === 'highlight' || o.type === 'xray') {
      const color = o.color || (o.type === 'xray' ? OV.mint : OV.magenta); const meshes = [];
      const re = o.parts ? new RegExp(o.parts, 'i') : null;
      const named = root?.userData?.parts?.named || {};
      if (re && root) root.traverse((n) => { if (n.isMesh && (re.test(n.name) || Object.entries(named).some(([k, arr]) => re.test(k) && [].concat(arr).includes(n)))) meshes.push(n); });
      const grp = new THREE.Group(); scene.add(grp);
      const mk = (geo, matrixWorld) => {
        const mat = o.type === 'xray'
          ? new THREE.ShaderMaterial({ transparent: true, depthTest: !!o.depthTest, depthWrite: false, uniforms: { c: { value: new THREE.Color(color) }, a: { value: 0 } },
            vertexShader: 'varying vec3 n; varying vec3 vv; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vv = normalize(-mv.xyz); n = normalize(normalMatrix*normal); gl_Position = projectionMatrix*mv; }',
            fragmentShader: 'uniform vec3 c; uniform float a; varying vec3 n; varying vec3 vv; void main(){ float f = pow(1.0-abs(dot(normalize(n),normalize(vv))), 1.6); gl_FragColor = vec4(mix(c*0.9, vec3(1.0), f*0.35), a*(0.38+0.5*f)); }' })
          : new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthTest: true });
        const m = new THREE.Mesh(geo, mat); m.matrixAutoUpdate = false; if (matrixWorld) m.matrix.copy(matrixWorld); m.renderOrder = 15; grp.add(m);
        if (o.type === 'xray') { const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: '#e9fff7', transparent: true, opacity: 0, depthTest: false })); e.matrixAutoUpdate = false; e.matrix.copy(m.matrix); e.renderOrder = 16; grp.add(e); }
        return m;
      };
      root?.updateMatrixWorld(true);
      meshes.forEach((n) => mk(n.geometry, n.matrixWorld));
      for (const s of o.shapes || []) {
        const sz = s.size || [1, 1, 1]; let geo;
        if (s.shape === 'cylinder') { geo = new THREE.CylinderGeometry(sz[0] / 2, sz[0] / 2, sz[1], 24); }
        else if (s.shape === 'capsule') { geo = new THREE.CapsuleGeometry(sz[0] / 2, Math.max(0.01, sz[1] - sz[0]), 8, 20); }
        else if (s.shape === 'sphere') { geo = new THREE.SphereGeometry(sz[0] / 2, 24, 16); }
        else geo = new THREE.BoxGeometry(...sz);
        const M = new THREE.Matrix4().compose(resolvePoint(s.pos || [0, 0, 0], anchors).add(new THREE.Vector3(...(s.offset || [0, 0, 0]))), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(s.rot || [0, 0, 0]).map(deg))), new THREE.Vector3(1, 1, 1)); mk(geo, M);
      }
      const until = o.until;
      updaters.push((u) => { const k = smooth(range(u, at, at + (o.fade ?? 0.5))) * (until != null ? 1 - smooth(range(u, until - 0.3, until)) : 1); const pulse = o.type === 'xray' ? 0.85 + 0.15 * Math.sin(u * 3.2) : 1;
        grp.visible = k > 0.001; grp.children.forEach((m) => { if (m.material.uniforms) m.material.uniforms.a.value = k * pulse; else m.material.opacity = (m.isLineSegments ? 0.55 : (o.opacity ?? 0.92)) * k; }); });
    } else if (o.type === 'people') {
      const prom = people({ ...o, at: o.pos || [0, 0, 0] }); prom.then((im) => { scene.add(im); im.visible = false; const n = im.userData.count; const base = []; const m = new THREE.Matrix4();
        for (let i = 0; i < n; i++) { im.getMatrixAt(i, m); base.push(m.clone()); }
        updaters.push((u) => { const vis = u >= at; im.visible = vis; if (!vis) return; const stag = o.stagger ?? Math.min(0.04, 1.2 / n); let shown = 0;
          for (let i = 0; i < n; i++) { const k = easeOut(range(u, at + i * stag, at + i * stag + 0.25)); const mm = base[i].clone(); const s = Math.max(1e-3, k); mm.multiply(new THREE.Matrix4().makeScale(s, s, s)); im.setMatrixAt(i, mm); if (k > 0) shown++; }
          im.instanceMatrix.needsUpdate = true; }); });
      updaters.push(() => {}); updaters.promises = (updaters.promises || []).concat(prom);
    } else if (o.type === 'angle') {
      const c = resolvePoint(o.pos || 'bottom', anchors); const R = (o.radius || 0.2) * size; const a0 = deg(o.from ?? 0), a1 = deg(o.to ?? 12);
      const pts = []; for (let i = 0; i <= 40; i++) { const a = lerp(a0, a1, i / 40); pts.push(new THREE.Vector3(c.x - Math.cos(a) * R, c.y + Math.sin(a) * R, c.z + (o.z || 0))); }
      const grp = new THREE.Group(); scene.add(grp); const color = o.color || OV.red; const r = 0.006 * size;
      const segs = pts.slice(1).map((p2, i) => { const m = lineMesh(pts[i], p2, r, color); placeLine(m, pts[i], p2); grp.add(m); return m; });
      const base = lineMesh(c, c, r, color); placeLine(base, new THREE.Vector3(c.x - R * 1.3, c.y, c.z + (o.z || 0)), new THREE.Vector3(c.x, c.y, c.z + (o.z || 0))); grp.add(base);
      const tp = textPlane(o.label || `${o.to ?? 12}°`, { font: FONTS.sans, weight: 700, size: 96, color, pad: 8 }, 0.06 * size); tp.material.depthTest = false; tp.renderOrder = 22; grp.add(tp);
      const mid = lerp(a0, a1, 0.5); tp.position.set(c.x - Math.cos(mid) * R * 1.35, c.y + Math.sin(mid) * R * 1.35, c.z + (o.z || 0));
      updaters.push((u) => { const k = range(u, at, at + 0.6); grp.visible = u >= at; segs.forEach((m, i) => (m.visible = i / segs.length <= k)); tp.material.opacity = smooth(range(u, at + 0.4, at + 0.8)); tp.quaternion.copy(camera.quaternion); });
    } else if (o.type === 'arrow3d') {
      const A = resolvePoint(o.from, anchors), B = resolvePoint(o.to, anchors); const color = o.color || OV.red; const r = (o.thickness || 0.008) * size;
      const shaft = lineMesh(A, B, r, color); scene.add(shaft); const head = new THREE.Mesh(new THREE.ConeGeometry(r * 3.5, r * 9, 12), new THREE.MeshBasicMaterial({ color, toneMapped: false, depthTest: false, transparent: true })); head.renderOrder = 21; scene.add(head);
      updaters.push((u) => { const k = easeOut(range(u, at, at + 0.7)); const vis = u >= at; shaft.visible = head.visible = vis; if (!vis) return; const e = A.clone().lerp(B, k); placeLine(shaft, A, e); head.position.copy(e); head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); });
    } else if (o.type === 'stat' || o.type === 'label' || o.type === 'caption') {
      uis.push(statUI(o, { camera, anchors }));
    }
  }
  return { update: (u) => updaters.forEach((f) => f(u)), ui: uis.length ? (g, u, p, W2, H2) => uis.forEach((f) => f(g, u, p, W2, H2)) : null, ready: Promise.all(updaters.promises || []) };
}

// ---------- screen-space stats / labels / captions
const ICONS = {
  altitude: (g, s) => { g.beginPath(); g.moveTo(-s * 0.5, s * 0.45); g.lineTo(-s * 0.1, -s * 0.2); g.lineTo(s * 0.1, s * 0.05); g.lineTo(s * 0.5, -s * 0.45); g.stroke(); g.beginPath(); g.moveTo(s * 0.5, -s * 0.45); g.lineTo(s * 0.18, -s * 0.42); g.moveTo(s * 0.5, -s * 0.45); g.lineTo(s * 0.47, -s * 0.13); g.stroke(); },
  speed: (g, s) => { g.beginPath(); g.arc(0, s * 0.15, s * 0.5, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); g.beginPath(); g.moveTo(0, s * 0.15); g.lineTo(s * 0.3, -s * 0.15); g.stroke(); },
  weight: (g, s) => { g.beginPath(); g.moveTo(-s * 0.4, s * 0.45); g.lineTo(-s * 0.28, -s * 0.2); g.lineTo(s * 0.28, -s * 0.2); g.lineTo(s * 0.4, s * 0.45); g.closePath(); g.stroke(); g.beginPath(); g.arc(0, -s * 0.33, s * 0.12, 0, Math.PI * 2); g.stroke(); },
  range: (g, s) => { g.beginPath(); g.arc(0, 0, s * 0.45, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(-s * 0.45, 0); g.lineTo(s * 0.45, 0); g.moveTo(0, -s * 0.45); g.lineTo(0, s * 0.45); g.stroke(); },
  power: (g, s) => { g.beginPath(); g.moveTo(s * 0.1, -s * 0.5); g.lineTo(-s * 0.25, s * 0.05); g.lineTo(s * 0.05, s * 0.05); g.lineTo(-s * 0.1, s * 0.5); g.lineTo(s * 0.3, -s * 0.08); g.lineTo(0, -s * 0.08); g.closePath(); g.stroke(); },
  time: (g, s) => { g.beginPath(); g.arc(0, 0, s * 0.45, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -s * 0.3); g.moveTo(0, 0); g.lineTo(s * 0.22, 0); g.stroke(); },
};
export function formatStat(o, k) {
  if (o.text && !o.count) return o.text;
  if (o.value == null) return o.text || '';
  const v = o.value * k; const from = o.fromValue ?? 0; const cur = from + (o.value - from) * k;
  return dual(o.round === false ? cur : (Math.abs(o.value) >= 100 ? Math.round(cur / (o.step || 1)) * (o.step || 1) : cur), o.unit || '', { ...o, single: !o.unit || o.single });
}
function statUI(o, { camera, anchors }) {
  const at = o.at ?? 0.4; const color = o.color || (o.type === 'stat' ? OV.red : OV.dark);
  return (g, u, p, W, H) => {
    if (u < at || (o.until != null && u > o.until)) return;
    const k = o.count === false ? 1 : easeOut(range(u, at, at + (o.countTime ?? 1.4)));
    const a = smooth(range(u, at, at + 0.25)) * (o.until != null ? 1 - smooth(range(u, o.until - 0.25, o.until)) : 1);
    const txt = o.type === 'stat' ? formatStat(o, k) : o.text;
    let x = W / 2, y = H * 0.8;
    if (o.anchor) { const v = resolvePoint(o.anchor, anchors).project(camera); x = (v.x * 0.5 + 0.5) * W; y = (-v.y * 0.5 + 0.5) * H + (o.dy || 0) * H; }
    else if (Array.isArray(o.pos)) { x = o.pos[0] * W; y = o.pos[1] * H; }
    else if (o.pos === 'center') y = H * 0.5; else if (o.pos === 'upper') y = H * 0.2; else if (o.pos === 'lower' || !o.pos) y = H * (o.type === 'caption' ? 0.9 : 0.8);
    const size = (o.size || (o.type === 'stat' ? 0.05 : o.type === 'caption' ? 0.032 : 0.028)) * H;
    g.save(); g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (o.type === 'caption') { g.font = `600 ${size}px ${FONTS.sans}`; g.fillStyle = o.color || '#5b5d61'; g.fillText(txt, x, y); g.restore(); return; }
    g.font = `${o.type === 'stat' ? 800 : 600} ${size}px ${o.font === 'hand' ? FONTS.hand : FONTS.sans}`; g.fillStyle = color;
    if (o.skew) g.setTransform(1, 0, -o.skew, 1, 0, 0);
    const tw = g.measureText(txt).width;
    if (o.icon && ICONS[o.icon]) { g.save(); g.translate(x - tw / 2 - size * 0.75, y); g.strokeStyle = color; g.lineWidth = size * 0.09; g.lineCap = 'round'; g.lineJoin = 'round'; ICONS[o.icon](g, size * 0.85); g.restore(); }
    g.shadowColor = 'rgba(255,255,255,0.25)'; g.shadowBlur = size * 0.1; g.fillText(txt, x, y);
    if (o.type === 'label' && o.leader) { const tv = resolvePoint(o.leader, anchors).project(camera); g.strokeStyle = color; g.lineWidth = Math.max(1.5, H * 0.0019); g.beginPath(); g.moveTo(x, y + size * 0.6); g.lineTo((tv.x * 0.5 + 0.5) * W, (-tv.y * 0.5 + 0.5) * H); g.stroke(); }
    g.restore();
  };
}
