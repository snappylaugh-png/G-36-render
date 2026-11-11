// maps.js — the two map looks of the reference:
//   paper : pastel political map (cream/beige countries, grey-blue water, red city dots / capital squares, steel-blue country names)
//   wall  : blue wall map (teal ocean deepening away from the coast, cream land, huge letter-spaced ocean names)
// seen as a physical sheet in 3D (camera push / tilt / pan, shallow focus), with animated routes and aircraft icons.
import * as THREE from 'three';
import { register } from './core.js';
import { makeCanvas, canvasTexture, FONTS, EASE, range, clamp, smooth, easeOut, lerp, deg, textPlane, rng } from './util.js';
import { drawIcon } from './icons.js';

let topo = null;
async function world(res = '50m') {
  if (!window.topojson) await new Promise((ok, err) => { const s = document.createElement('script'); s.src = '/engine/topojson-client.min.js'; s.onload = ok; s.onerror = err; document.head.appendChild(s); });
  topo ||= {}; if (!topo[res]) topo[res] = await (await fetch(`/data/countries-${res}.json`)).json(); return topo[res];
}
const R = 6378137; const mx = (lon) => (R * lon * Math.PI) / 180; const my = (lat) => R * Math.log(Math.tan(Math.PI / 4 + (clamp(lat, -85, 85) * Math.PI) / 360));
export function projector(bounds, cw) {
  let [w, s, e, n] = bounds; const wrap = e < w; if (wrap) e += 360;
  const X0 = mx(w), X1 = mx(e), Y0 = my(s), Y1 = my(n); const ch = Math.round((cw * (Y1 - Y0)) / (X1 - X0));
  const fixLon = (lon) => (wrap && lon < w - 1e-9 ? lon + 360 : lon);
  const px = (lon, lat) => [((mx(fixLon(lon)) - X0) / (X1 - X0)) * cw, ((Y1 - my(lat)) / (Y1 - Y0)) * ch];
  const kmPerPx = ((X1 - X0) / cw / 1000) * Math.cos(((s + n) / 2) * Math.PI / 180);
  return { px, cw, ch, kmPerPx, bounds, wrap, fixLon };
}
// great-circle interpolation
function gc([lo1, la1], [lo2, la2], n = 64) {
  const t = (d) => (d * Math.PI) / 180, f = (r) => (r * 180) / Math.PI; const p1 = [Math.cos(t(la1)) * Math.cos(t(lo1)), Math.cos(t(la1)) * Math.sin(t(lo1)), Math.sin(t(la1))], p2 = [Math.cos(t(la2)) * Math.cos(t(lo2)), Math.cos(t(la2)) * Math.sin(t(lo2)), Math.sin(t(la2))];
  const d = Math.acos(clamp(p1[0] * p2[0] + p1[1] * p2[1] + p1[2] * p2[2], -1, 1)); if (d < 1e-6) return [[lo1, la1], [lo2, la2]]; const out = [];
  for (let i = 0; i <= n; i++) { const k = i / n, A = Math.sin((1 - k) * d) / Math.sin(d), B = Math.sin(k * d) / Math.sin(d); const x = A * p1[0] + B * p2[0], y = A * p1[1] + B * p2[1], z = A * p1[2] + B * p2[2]; out.push([f(Math.atan2(y, x)), f(Math.atan2(z, Math.hypot(x, y)))]); }
  return out;
}
const STYLE = {
  paper: { water: '#a9bdc8', waterLine: '#7c97a8', lands: ['#e3dcc2', '#d8d1ca', '#e3d9cf', '#dfdfcc', '#e8e0cd', '#d9d6c3'], focus: '#eae7e1', border: '#7d8790', country: '#4a6c88', city: '#3a3d42', dot: '#e8434d', sea: '#5b7f99', paper: true },
  wall: { water: '#7094a2', shelf: '#9fbcc2', waterLine: '#5f8796', lands: ['#ece8dd', '#e6e1d2', '#efebe2', '#e8e4d8'], focus: '#f2efe8', border: '#9aa39f', country: '#1f3d55', city: '#1f2b36', dot: '#e8434d', sea: '#28506a', paper: false },
};
async function mapTexture(M, outH = 1080) {
  const st = { ...STYLE[M.style || 'paper'], ...(M.colors || {}) };
  // texture resolution follows the framing: ~1.4 texels per output pixel at the widest view
  const P0 = projector(M.bounds, 1000); const boundsKm = 1000 * P0.kmPerPx; const vw = Math.max(M.view?.from?.width_km || M.view?.width_km || boundsKm * 0.6, M.view?.to?.width_km || 0);
  const cw = M.resolution || Math.round(clamp((2700 * Math.min(2, Math.max(1, outH / 1080)) * boundsKm) / Math.max(1, vw), 2048, 8192) / 2) * 2;   // more texels for 1440p / 4K
  const P = projector(M.bounds, cw); const { ch } = P;
  const viewPx = (Math.sqrt((M.view?.from?.width_km || vw) * (M.view?.to?.width_km || vw))) / P.kmPerPx; // texture px across the frame
  const c = makeCanvas(cw, ch), g = c.getContext('2d'); const topology = await world(M.detail || '50m');
  const feats = window.topojson.feature(topology, topology.objects.countries).features;
  const path = (geom, ctx) => { const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : []; for (const poly of polys) for (const ring of poly) { ring.forEach(([lo, la], i) => { const [x, y] = P.px(lo, la); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); } };
  const lineStr = (mesh, ctx) => { for (const line of mesh.coordinates) { line.forEach(([lo, la], i) => { const [x, y] = P.px(lo, la); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); } };
  // water
  g.fillStyle = st.water; g.fillRect(0, 0, cw, ch);
  if (!st.paper) { // shelf glow near the coast
    const k = 8, sw = Math.ceil(cw / k), sh = Math.ceil(ch / k); const m = makeCanvas(sw, sh), mg = m.getContext('2d'); mg.scale(1 / k, 1 / k); mg.fillStyle = '#fff'; mg.beginPath(); feats.forEach((f) => path(f.geometry, mg)); mg.fill();
    for (const [blur, a] of [[60, 0.55], [18, 0.5], [6, 0.45]]) { const b = makeCanvas(sw, sh), bg = b.getContext('2d'); bg.filter = `blur(${Math.max(1, blur * (cw / 4096) / k * 2)}px)`; bg.drawImage(m, 0, 0); g.save(); g.globalAlpha = a; g.imageSmoothingQuality = 'high'; g.drawImage(b, 0, 0, cw, ch); g.restore(); }
    g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = st.shelf; g.fillRect(0, 0, cw, ch); g.restore();
    const r = rng(4); const bl = makeCanvas(Math.ceil(cw / 8), Math.ceil(ch / 8)), bg2 = bl.getContext('2d'); bg2.filter = 'blur(6px)'; for (let i = 0; i < 300; i++) { bg2.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.5)' : 'rgba(32,72,94,.5)'; bg2.beginPath(); bg2.ellipse(r() * cw / 8, r() * ch / 8, 5 + r() * 20, 3 + r() * 9, r() * 3, 0, Math.PI * 2); bg2.fill(); } g.save(); g.globalAlpha = 0.12; g.drawImage(bl, 0, 0, cw, ch); g.restore();
  }
  // countries
  const focus = new Set([].concat(M.focus || []).map((s) => s.toLowerCase()));
  feats.forEach((f, i) => { const nm = (f.properties?.name || '').toLowerCase(); g.fillStyle = focus.has(nm) ? st.focus : st.lands[(i * 7 + nm.length) % st.lands.length]; if (M.highlight && [].concat(M.highlight).map((s) => s.toLowerCase()).includes(nm)) g.fillStyle = M.highlightColor || '#f0d9a8'; g.beginPath(); path(f.geometry, g); g.fill(); });
  // coastline + borders
  const lw = viewPx / 1400;
  g.strokeStyle = st.waterLine; g.lineWidth = 2.6 * lw; g.beginPath(); lineStr(window.topojson.mesh(topology, topology.objects.countries, (a, b) => a === b), g); g.stroke();
  g.strokeStyle = st.border; g.lineWidth = 1.6 * lw; g.beginPath(); lineStr(window.topojson.mesh(topology, topology.objects.countries, (a, b) => a !== b), g); g.stroke();
  // paper grain
  if (st.paper) { const r = rng(7); g.save(); g.globalAlpha = 0.035; for (let i = 0; i < 2500; i++) { g.fillStyle = r() < 0.5 ? '#000' : '#fff'; g.fillRect(r() * cw, r() * ch, 2 + r() * 3, 2 + r() * 3); } g.restore(); }
  // labels
  const txt = (s, x, y, { size, color, weight = 500, style = 'normal', spacing = 0, font = FONTS.map, align = 'center', alpha = 1 }) => {
    g.save(); g.globalAlpha = alpha; g.font = `${style} ${weight} ${size}px ${font}`; g.fillStyle = color; g.textBaseline = 'middle';
    const chars = [...s]; const widths = chars.map((ch2) => g.measureText(ch2).width); const total = widths.reduce((a, b) => a + b, 0) + spacing * size * (chars.length - 1);
    let x0 = align === 'left' ? x : align === 'right' ? x - total : x - total / 2; chars.forEach((ch2, i) => { g.fillText(ch2, x0, y); x0 += widths[i] + spacing * size; }); g.restore(); };
  const kmToPx = (km) => km / P.kmPerPx; const base = viewPx / 1100;
  if (M.countries !== 'none') {
    const want = Array.isArray(M.countries) ? M.countries : null; const hide = new Set([].concat(M.hideCountries || []).map((s) => s.toLowerCase()));
    if (want) want.forEach((L) => { const [x, y] = P.px(L.lon, L.lat); txt(String(L.name).toUpperCase(), x, y, { size: (L.size || 1) * 34 * base, color: st.country, weight: 600, spacing: 0.08 }); });
    else feats.forEach((f) => {
      const nm = f.properties?.name; if (!nm || hide.has(nm.toLowerCase())) return; const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
      let best = null; for (const poly of polys) { const pts = poly[0].map(([lo, la]) => P.px(lo, la)); let a = 0, cx = 0, cy = 0; for (let i = 0; i < pts.length - 1; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[i + 1]; const cr = x1 * y2 - x2 * y1; a += cr; cx += (x1 + x2) * cr; cy += (y1 + y2) * cr; } a /= 2; if (Math.abs(a) < 1) continue; cx /= 6 * a; cy /= 6 * a; if (!best || Math.abs(a) > best.a) best = { a: Math.abs(a), cx, cy }; }
      if (!best || best.cx < 0 || best.cx > cw || best.cy < 0 || best.cy > ch) return; const size = clamp(Math.sqrt(best.a) * 0.08, 22 * base, 46 * base); if (Math.sqrt(best.a) < 90 * base) return;
      txt(nm.toUpperCase(), best.cx, best.cy, { size, color: st.country, weight: 600, spacing: 0.06 });
    });
  }
  for (const S of M.seas || []) { const [x, y] = P.px(S.lon, S.lat); const lines = String(S.name).split('\n'); lines.forEach((l, i) => txt(st.paper ? l : l.toUpperCase(), x, y + i * (S.size || 1) * 40 * base * 1.15, { size: (S.size || 1) * (st.paper ? 30 : 64) * base, color: st.sea, style: st.paper ? 'italic' : 'normal', weight: st.paper ? 400 : 500, spacing: st.paper ? 0.05 : 0.9, alpha: st.paper ? 1 : 0.75 })); }
  for (const C of M.cities || []) {
    const [x, y] = P.px(C.lon, C.lat); const s = (C.size || 1) * 26 * base; g.fillStyle = st.dot;
    if (C.capital) g.fillRect(x - s * 0.32, y - s * 0.32, s * 0.64, s * 0.64); else { g.beginPath(); g.arc(x, y, s * 0.26, 0, Math.PI * 2); g.fill(); }
    const al = C.align || 'right'; const dx = al === 'right' ? s * 0.6 : al === 'left' ? -s * 0.6 : 0, dy = al === 'above' ? -s * 0.9 : al === 'below' ? s * 0.9 : 0;
    txt(C.name, x + dx, y + dy, { size: s * (C.capital ? 1.25 : 1.1), color: st.city, weight: C.capital ? 600 : 400, align: al === 'right' ? 'left' : al === 'left' ? 'right' : 'center' });
  }
  for (const L of M.texts || []) { const [x, y] = P.px(L.lon, L.lat); txt(L.text, x, y, { size: (L.size || 1) * 28 * base, color: L.color || st.city, style: L.italic ? 'italic' : 'normal', weight: L.weight || 400 }); }
  const tex = canvasTexture(c); tex.anisotropy = 16; return { tex, P, st };
}

function ribbon(points, width) { // flat strip on y=0 through points [[x,z],...]
  const pos = [], idx = []; for (let i = 0; i < points.length; i++) { const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)]; let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; pos.push(points[i][0] - dz * width / 2, 0, points[i][1] + dx * width / 2, points[i][0] + dz * width / 2, 0, points[i][1] - dx * width / 2); if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
}
function iconTexture(kind) { const c = makeCanvas(256, 256), g = c.getContext('2d'); drawIcon(g, kind, 128, 128, 220, '#191919'); return canvasTexture(c); }

register('map', async (spec, E) => {
  const M = spec.map || spec; const scene = new THREE.Scene(); const style = M.style || 'paper';
  const { tex, P, st } = await mapTexture(M, E.H);
  const Wm = 100, Hm = (Wm * P.ch) / P.cw; const toW = (lon, lat) => { const [x, y] = P.px(lon, lat); return new THREE.Vector3((x / P.cw - 0.5) * Wm, 0, (y / P.ch - 0.5) * Hm); };
  const unitsPerKm = Wm / (P.cw * P.kmPerPx);
  scene.background = new THREE.Color(style === 'wall' ? '#4e6b78' : '#9a9184');
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(Wm, Hm).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: style === 'wall' ? 0.55 : 0.92, metalness: 0 })); sheet.receiveShadow = true; scene.add(sheet);
  scene.add(new THREE.HemisphereLight('#ffffff', '#d9d4c8', 1.6)); const dl = new THREE.DirectionalLight('#fff', 1.4); dl.position.set(-20, 60, -30); dl.castShadow = true; Object.assign(dl.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 200 }); dl.shadow.mapSize.set(2048, 2048); dl.shadow.radius = 4; scene.add(dl);
  // camera: view = {center:[lon,lat], width_km, tilt, heading}
  const camera = new THREE.PerspectiveCamera(M.fov || 30, E.W / E.H, 0.05, 1000);
  const V0 = { tilt: 25, heading: 0, ...(M.view?.from || M.view || {}) }; const V1 = { ...V0, ...(M.view?.to || {}) };
  if (!V0.center) { const [w, s, e, n] = M.bounds; V0.center = [(w + (e < w ? e + 360 : e)) / 2, (s + n) / 2]; V1.center ||= V0.center; }
  V0.width_km ??= P.cw * P.kmPerPx * 0.6; V1.width_km ??= V0.width_km;
  const ease = EASE[M.ease || 'cam'];
  const viewAt = (p) => { const e = ease(p); const lon = lerp(V0.center[0], V1.center[0], e), lat = lerp(V0.center[1], V1.center[1], e); const wk = Math.exp(lerp(Math.log(V0.width_km), Math.log(V1.width_km), e)); return { c: toW(lon, lat), wk, tilt: lerp(V0.tilt, V1.tilt, e), heading: lerp(V0.heading, V1.heading, e) }; };
  // routes
  const routes = (M.routes || []).map((Rt, ri) => {
    let ll = Rt.points || [Rt.from, Rt.to]; if (Rt.greatCircle !== false && ll.length === 2) ll = gc(ll[0], ll[1], 96);
    let pts = ll.map(([lo, la]) => { const v = toW(lo, la); return [v.x, v.z]; });
    if (Rt.arc) { const a = pts[0], b = pts[pts.length - 1]; const nx = -(b[1] - a[1]), nz = b[0] - a[0]; pts = pts.map((p, i) => { const k = i / (pts.length - 1); const bulge = Math.sin(Math.PI * k) * Rt.arc; return [p[0] + nx * bulge, p[1] + nz * bulge]; }); }
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); const total = cum[cum.length - 1];
    const at = (d) => { d = clamp(d, 0, total); let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const k = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]); return { x: lerp(pts[i - 1][0], pts[i][0], k), z: lerp(pts[i - 1][1], pts[i][1], k), dir: Math.atan2(pts[i][0] - pts[i - 1][0], -(pts[i][1] - pts[i - 1][1])) }; };
    const color = Rt.color || '#151515'; const grp = new THREE.Group(); grp.position.y = 0.02; scene.add(grp);
    const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false, depthWrite: false, transparent: true, side: THREE.DoubleSide });
    const wv = (Rt.width || 1) * 0.0024 * Math.min(V0.width_km, V1.width_km) * unitsPerKm;
    const solid = new THREE.Mesh(ribbon(pts, wv), mat); grp.add(solid);
    // dashes along the whole path (used for "dashed" style and for the planned part ahead)
    const dashLen = wv * 5, gap = wv * 4; const dashes = []; for (let d = 0; d < total; d += dashLen + gap) { const seg = []; for (let k = 0; k <= 4; k++) { const q = at(Math.min(total, d + (dashLen * k) / 4)); seg.push([q.x, q.z]); } const m = new THREE.Mesh(ribbon(seg, wv * 0.9), mat); m.userData.d = d; grp.add(m); dashes.push(m); }
    const icons = []; const n = Rt.count || 1; const kind = Rt.icon || 'prop';
    if (kind !== 'none') { const it = iconTexture(kind); const isz = (Rt.iconSize || 1) * 0.045 * Math.min(V0.width_km, V1.width_km) * unitsPerKm;
      for (let i = 0; i < n; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(isz, isz).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: it, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })); m.position.y = 0.05; const sh = m.clone(); sh.material = new THREE.MeshBasicMaterial({ map: it, transparent: true, opacity: 0.18, depthWrite: false, color: '#000' }); sh.position.y = 0.03; grp.add(sh, m); icons.push({ m, sh, off: Rt.formation?.[i] || [((i % 3) - 1) * 0.7, -Math.floor(i / 3) * 0.8 - (i % 3 === 1 ? 0 : 0.35)] }); } }
    let lbl = null; if (Rt.label) { const lp = Rt.labelAt ? toW(Rt.labelAt[0], Rt.labelAt[1]) : (() => { const q = at(total * 0.6); return new THREE.Vector3(q.x, 0, q.z); })(); lbl = textPlane(Rt.label, { font: FONTS.map, weight: 500, style: 'italic', size: 96, color: '#26292c', pad: 8 }, (Rt.labelSize || 1) * 0.035 * V0.width_km * unitsPerKm); lbl.rotation.x = -Math.PI / 2; lbl.position.copy(lp).setY(0.06); if (Rt.labelOffset) { lbl.position.x += Rt.labelOffset[0] * V0.width_km * unitsPerKm; lbl.position.z += Rt.labelOffset[1] * V0.width_km * unitsPerKm; } scene.add(lbl); }
    return { Rt, grp, solid, dashes, icons, at, total, pts, lbl };
  });
  const markers = (M.markers || []).map((Mk) => { const c = makeCanvas(128, 128), g = c.getContext('2d'); g.strokeStyle = g.fillStyle = Mk.color || '#e3343f'; g.lineWidth = 16; g.lineCap = 'round';
    if (Mk.kind === 'x') { g.beginPath(); g.moveTo(30, 30); g.lineTo(98, 98); g.moveTo(98, 30); g.lineTo(30, 98); g.stroke(); } else if (Mk.kind === 'square') g.fillRect(34, 34, 60, 60); else if (Mk.kind === 'ship') drawIcon(g, 'ship', 64, 64, 110, '#191919', Math.PI / 2); else { g.beginPath(); g.arc(64, 64, 30, 0, Math.PI * 2); g.fill(); }
    const s = (Mk.size || 1) * 0.02 * V0.width_km * unitsPerKm; const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: canvasTexture(c), transparent: true, depthWrite: false, toneMapped: false })); m.position.copy(toW(Mk.lon, Mk.lat)).setY(0.07); scene.add(m); return { Mk, m }; });
  const look = new THREE.Vector3();
  return {
    scene, camera, post: { look: 'map', dof: M.dof === false ? null : { focus: 20, aperture: M.aperture ?? 0.0009, maxblur: 0.008 } },
    update(u, p) {
      const v = viewAt(p);
      // follow a route's lead icon if asked
      if (M.follow != null && routes[M.follow]) { const r = routes[M.follow]; const k = EASE.inout(range(u, ...(r.Rt.draw || [0.3, (spec.end - spec.start) - 0.5]))); const q = r.at(k * r.total); v.c.lerp(new THREE.Vector3(q.x, 0, q.z), M.followAmount ?? 0.7); }
      const visW = v.wk * unitsPerKm; const dist = visW / (2 * Math.tan(deg(camera.fov / 2)) * camera.aspect);
      const tilt = deg(v.tilt), hd = deg(v.heading);
      camera.position.set(v.c.x + Math.sin(hd) * Math.sin(tilt) * dist, Math.cos(tilt) * dist, v.c.z + Math.cos(hd) * Math.sin(tilt) * dist);
      camera.up.set(-Math.sin(hd), 0, -Math.cos(hd)); if (v.tilt > 1) camera.up.set(0, 1, 0); camera.lookAt(v.c); this.dofFocus = dist;
      for (const r of routes) {
        const [t0, t1] = r.Rt.draw || [0.3, Math.max(0.8, (spec.end - spec.start) - 0.5)]; const k = (EASE[r.Rt.ease || 'inout'])(range(u, t0, t1)); const d = k * r.total;
        const shown = u >= (r.Rt.appear ?? t0 - 0.2);
        r.grp.visible = shown;
        const styleDone = r.Rt.style || 'solid', ahead = r.Rt.ahead || 'none';
        // solid traveled part via draw range on the ribbon
        const segs = r.pts.length - 1; let nSeg = 0; { let acc = 0; for (let i = 1; i < r.pts.length; i++) { acc += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]); if (acc <= d) nSeg = i; } }
        r.solid.visible = styleDone === 'solid'; r.solid.geometry.setDrawRange(0, nSeg * 6);
        r.dashes.forEach((m) => { const before = m.userData.d < d; m.visible = (styleDone === 'dashed' && before) || (ahead === 'dashed' && !before); });
        const q = r.at(d); r.icons.forEach((ic, i) => { const off = ic.off; const s = (r.Rt.iconSize || 1) * 0.045 * Math.min(V0.width_km, V1.width_km) * unitsPerKm; const ox = (Math.cos(q.dir) * off[0] - Math.sin(q.dir) * off[1]) * s, oz = (Math.sin(q.dir) * off[0] + Math.cos(q.dir) * off[1]) * s;
          ic.m.position.set(q.x + ox, 0.05, q.z + oz); ic.m.rotation.y = -q.dir; ic.sh.position.set(q.x + ox + s * 0.08, 0.03, q.z + oz + s * 0.1); ic.sh.rotation.y = -q.dir; const vis = shown && !(r.Rt.hideIconAtEnd && k >= 1); ic.m.visible = ic.sh.visible = vis; });
        if (r.lbl) r.lbl.material.opacity = smooth(range(u, r.Rt.labelAt_t ?? t1 - 0.2, (r.Rt.labelAt_t ?? t1 - 0.2) + 0.4));
      }
      markers.forEach(({ Mk, m }) => { const a = Mk.at ?? 0; const k = easeOut(range(u, a, a + 0.35)); m.visible = u >= a; m.scale.setScalar(Math.max(0.001, 0.6 + 0.4 * k)); m.material.opacity = k; });
    },
  };
});
