// util.js — small shared helpers (easing, seeded random, colours, canvas text, unit formatting)
import * as THREE from 'three';

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smoother = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeIn = (t) => Math.pow(clamp(t), 3);
// the house camera ease: gentle start, gentle stop, never fully static
export const camEase = (t) => { t = clamp(t); return 0.15 * t + 0.85 * smoother(t); };
export const EASE = { linear: (t) => clamp(t), inout: smoother, out: easeOut, in: easeIn, cam: camEase, smooth };
export const deg = (d) => (d * Math.PI) / 180;
export const range = (t, a, b) => clamp((t - a) / (b - a));   // 0..1 progress of t through [a,b]

// deterministic random: same seed -> same scene on every render worker
export function rng(seed = 1) {
  let s = (typeof seed === 'string' ? [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) : seed) >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; };
}
// smooth value noise 1D (for handheld shake, cloud drift)
export function noise1(x, seed = 0) {
  const h = (n) => { const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return s - Math.floor(s); };
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u) * 2 - 1;
}
export function fbm2(x, y, oct = 5, seed = 0) {
  let a = 0.5, f = 1, s = 0;
  for (let o = 0; o < oct; o++) { s += a * vnoise2(x * f, y * f, seed + o * 17); f *= 2.03; a *= 0.5; }
  return s;
}
export function vnoise2(x, y, seed = 0) {
  const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(h(i, j), h(i + 1, j), ux), lerp(h(i, j + 1), h(i + 1, j + 1), ux), uy) * 2 - 1;
}

export const col = (c) => new THREE.Color(c);

// ---------- units: the house always shows metric first then imperial ("14 m / 45 ft")
const fmtNum = (v, dp) => { const s = Number(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }); return s; };
export function dual(value, unit, opts = {}) {
  const v = +value; const dp = opts.dp ?? (Math.abs(v) < 20 ? 1 : 0);
  const conv = {
    m: [v * 3.28084, 'ft'], km: [v * 0.621371, 'mi'], 'km/h': [v * 0.621371, 'mph'], kg: [v * 2.20462, 'lb'],
    kW: [v * 1.34102, 'hp'], ft: [v / 3.28084, 'm'], mi: [v / 0.621371, 'km'], mph: [v / 0.621371, 'km/h'],
    lb: [v / 2.20462, 'kg'], hp: [v / 1.34102, 'kW'], kn: [v * 1.852, 'km/h'], nmi: [v * 1.852, 'km'], 'l': [v * 0.264172, 'US gal'],
  }[unit];
  if (!conv || opts.single) return `${fmtNum(v, dp)} ${unit}`;
  const dp2 = opts.dp2 ?? (Math.abs(conv[0]) < 20 ? 1 : 0);
  return opts.imperialFirst ? `${fmtNum(conv[0], dp2)} ${conv[1]} / ${fmtNum(v, dp)} ${unit}` : `${fmtNum(v, dp)} ${unit} / ${fmtNum(conv[0], dp2)} ${conv[1]}`;
}

// ---------- canvas text textures
export const FONTS = {
  hand: '"Patrick Hand", "Comic Sans MS", sans-serif',
  sans: '"Open Sans", Arial, sans-serif',
  map: '"Fira Sans Condensed", "Arial Narrow", sans-serif',
  brand: '"Montserrat", Arial, sans-serif',
};
export function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function canvasTexture(c, { srgb = true, aniso = 8, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.needsUpdate = true; return t;
}
// text drawn to a tight canvas; returns {canvas, w, h} in px
export function textCanvas(text, { font = FONTS.sans, size = 96, weight = 400, style = 'normal', color = '#000', spacing = 0, pad = 16, lineH = 1.15, align = 'center', stroke = null, strokeW = 0, shadow = null } = {}) {
  const lines = String(text).split('\n');
  const m = makeCanvas(8, 8).getContext('2d'); m.font = `${style} ${weight} ${size}px ${font}`;
  const widthOf = (l) => m.measureText(l).width + spacing * Math.max(0, [...l].length - 1);
  const w = Math.ceil(Math.max(...lines.map(widthOf)) + pad * 2), h = Math.ceil(lines.length * size * lineH + pad * 2);
  const c = makeCanvas(w, h), g = c.getContext('2d'); g.font = m.font; g.textBaseline = 'middle'; g.fillStyle = color;
  if (shadow) { g.shadowColor = shadow.color || 'rgba(0,0,0,.35)'; g.shadowBlur = shadow.blur || 8; g.shadowOffsetY = shadow.y || 2; }
  lines.forEach((l, i) => {
    const lw = widthOf(l); let x = align === 'left' ? pad : align === 'right' ? w - pad - lw : (w - lw) / 2; const y = pad + (i + 0.5) * size * lineH;
    if (spacing) { for (const ch of l) { if (stroke) { g.lineWidth = strokeW; g.strokeStyle = stroke; g.strokeText(ch, x, y); } g.fillText(ch, x, y); x += m.measureText(ch).width + spacing; } }
    else { if (stroke) { g.lineWidth = strokeW; g.strokeStyle = stroke; g.strokeText(l, x, y); } g.fillText(l, x, y); }
  });
  return { canvas: c, w, h };
}
// a flat text plane (metres), unlit — used for in-world labels
export function textPlane(text, opts = {}, heightM = 0.5) {
  const { canvas, w, h } = textCanvas(text, opts);
  const tex = canvasTexture(canvas);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(heightM * (w / h), heightM), mat);
  m.userData.aspect = w / h; return m;
}
export function disposeTree(o) {
  o.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    if (n.material) (Array.isArray(n.material) ? n.material : [n.material]).forEach((mt) => { for (const k in mt) { const v = mt[k]; if (v && v.isTexture && !v.userData?.shared) v.dispose(); } mt.dispose(); });
  });
}
export function loadImage(url) { return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('image not found: ' + url)); i.src = url; }); }
