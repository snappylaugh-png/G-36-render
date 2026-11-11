// aircraft.js — aircraft for every shot: loaded 3D models (GLB/GLTF/FBX/OBJ) or the built-in procedural builder.
// Aircraft frame: +X = nose (forward), +Y = up, +Z = left (port) wing. Units: metres. Wheels sit on y = 0.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { deg, makeCanvas, canvasTexture, rng, FONTS, clamp, lerp } from './util.js';

// ------------------------------------------------------------------ finishes (liveries)
export const FINISHES = {
  aluminum: { color: '#c3c8cd', metalness: 0.88, roughness: 0.34, panel: 0.22 },
  polished: { color: '#d4d8dc', metalness: 0.95, roughness: 0.2, panel: 0.15 },
  navy_grey: { color: '#8e979f', metalness: 0.25, roughness: 0.55, panel: 0.16 },
  light_grey: { color: '#a9b0b6', metalness: 0.2, roughness: 0.55, panel: 0.14 },
  olive: { color: '#5a6142', metalness: 0.1, roughness: 0.7, panel: 0.18 },
  dark_grey: { color: '#4d5257', metalness: 0.25, roughness: 0.5, panel: 0.16 },
  black: { color: '#1d1f22', metalness: 0.3, roughness: 0.45, panel: 0.12 },
  white: { color: '#e6e7e8', metalness: 0.1, roughness: 0.45, panel: 0.12 },
  navy_blue: { color: '#2a3a5a', metalness: 0.3, roughness: 0.45, panel: 0.14 },
  sand: { color: '#b49e78', metalness: 0.1, roughness: 0.7, panel: 0.15 },
};

// ------------------------------------------------------------------ presets (approximate shapes — real numbers go in specs)
export const PRESETS = {
  // single-engine piston fighter (P-51 / Spitfire class)
  fighter_prop: { fuselage: { L: 9.8, W: 1.05, H: 1.55, nose: 0.2, tail: 0.42, upsweep: 0.25, noseDrop: -0.05, tailEnd: 0.08, power: 2.1 },
    wing: { x: 0.43, y: -0.45, span: 11.3, root: 2.7, tip: 1.2, sweep: 4, dihedral: 6, thick: 0.15 },
    hstab: { x: 0.92, y: 0.25, span: 4.2, root: 1.3, tip: 0.7, sweep: 8 }, fin: { x: 0.9, height: 1.6, root: 1.5, tip: 0.6, sweep: 30 },
    engines: [{ type: 'nose', d: 1.0 }], props: [{ at: 'nose', blades: 4, d: 3.4 }],
    canopy: { type: 'bubble', x: 0.52, len: 1.9, w: 0.7, h: 0.55 }, gear: { type: 'taildragger', mainSpan: 3.6, mainX: 0.62, h: 1.5 },
    radiator: true, finish: 'aluminum', insignia: 'usa' },
  // twin-fuselage piston fighter (F-82 class)
  twin_fuselage: { base: 'fighter_prop', fuselages: [{ z: 2.6 }, { z: -2.6 }], wing: { x: 0.43, y: -0.45, span: 15.6, root: 2.7, tip: 1.2, sweep: 4, dihedral: 4, thick: 0.15 },
    centerStab: true, engines: [{ type: 'nose', d: 1.0, z: 2.6 }, { type: 'nose', d: 1.0, z: -2.6 }],
    props: [{ at: 'nose', blades: 4, d: 3.4, z: 2.6, dir: 1 }, { at: 'nose', blades: 4, d: 3.4, z: -2.6, dir: -1 }],
    canopy: [{ type: 'bubble', x: 0.52, len: 1.8, w: 0.7, h: 0.55, z: 2.6 }, { type: 'bubble', x: 0.52, len: 1.8, w: 0.7, h: 0.55, z: -2.6 }],
    gear: { type: 'taildragger', mainSpan: 2.2, mainX: 0.62, h: 1.5, perFuselage: true }, finish: 'aluminum', insignia: 'usa' },
  // twin-engine piston airliner / transport (DC-3 / C-47 class)
  airliner_twin_prop: { fuselage: { L: 19.6, W: 2.5, H: 2.7, nose: 0.17, tail: 0.42, upsweep: 0.7, noseDrop: -0.15, tailEnd: 0.06, power: 2.05 },
    wing: { x: 0.36, y: -0.85, span: 29, root: 4.9, tip: 1.6, sweep: 12, dihedral: 6, thick: 0.17 },
    hstab: { x: 0.94, y: 0.75, span: 8.3, root: 2.6, tip: 1.2, sweep: 10 }, fin: { x: 0.92, height: 3.1, root: 3.3, tip: 1.0, sweep: 38 },
    engines: [{ type: 'radial_nacelle', d: 1.45, span: 0.2 }, { type: 'radial_nacelle', d: 1.45, span: -0.2 }],
    props: [{ at: 'engine0', blades: 3, d: 3.5 }, { at: 'engine1', blades: 3, d: 3.5 }],
    windows: { count: 7, from: 0.27, to: 0.62, size: 0.42 }, cockpit: { type: 'airliner' }, gear: { type: 'taildragger', mainSpan: 5.8, mainX: 0.38, h: 2.6 },
    finish: 'polished', stripe: '#232a33', insignia: 'none' },
  // trimotor (Ford Trimotor / Fokker F.VII class)
  trimotor: { base: 'airliner_twin_prop', fuselage: { L: 15.2, W: 1.8, H: 2.3, nose: 0.1, tail: 0.45, upsweep: 0.5, noseDrop: 0, tailEnd: 0.06, power: 3.2 },
    wing: { x: 0.33, y: 1.15, span: 23.7, root: 3.6, tip: 2.0, sweep: 0, dihedral: 1, thick: 0.17 },
    hstab: { x: 0.95, y: 0.5, span: 6.6, root: 1.9, tip: 1.3, sweep: 0 }, fin: { x: 0.94, height: 2.0, root: 2.0, tip: 1.2, sweep: 15 },
    engines: [{ type: 'nose_radial', d: 1.25 }, { type: 'radial_nacelle', d: 1.2, span: 0.24, under: true }, { type: 'radial_nacelle', d: 1.2, span: -0.24, under: true }],
    props: [{ at: 'nose', blades: 2, d: 2.8 }, { at: 'engine1', blades: 2, d: 2.6 }, { at: 'engine2', blades: 2, d: 2.6 }],
    struts: true, windows: { count: 6, from: 0.25, to: 0.6, size: 0.45, square: true }, corrugated: true, gear: { type: 'taildragger', mainSpan: 5, mainX: 0.33, h: 2.4 },
    finish: 'aluminum', insignia: 'none' },
  // single-engine high-wing record monoplane (Spirit of St. Louis / Ryan class)
  monoplane_high_wing: { fuselage: { L: 8.4, W: 1.05, H: 1.35, nose: 0.12, tail: 0.5, upsweep: 0.2, noseDrop: 0, tailEnd: 0.06, power: 3.0 },
    wing: { x: 0.3, y: 0.95, span: 14, root: 2.1, tip: 2.0, sweep: 0, dihedral: 0, thick: 0.13, roundTips: true },
    hstab: { x: 0.93, y: 0.2, span: 3.6, root: 1.15, tip: 0.8, sweep: 0 }, fin: { x: 0.94, height: 1.25, root: 1.1, tip: 0.7, sweep: 18, round: true },
    engines: [{ type: 'nose_radial', d: 1.15, exposed: true }], props: [{ at: 'nose', blades: 2, d: 2.6 }],
    struts: true, gear: { type: 'taildragger', mainSpan: 3.0, mainX: 0.25, h: 1.9, splay: true }, windows: { count: 1, from: 0.33, to: 0.36, size: 0.45, square: true },
    noWindshield: true, finish: 'aluminum', insignia: 'none', registration: 'N-X-211' },
  // tiltrotor (V-22 class)
  tiltrotor: { fuselage: { L: 17.5, W: 2.6, H: 3.0, nose: 0.14, tail: 0.38, upsweep: 0.85, noseDrop: -0.25, tailEnd: 0.12, power: 2.6 },
    wing: { x: 0.45, y: 1.35, span: 14.0, root: 2.6, tip: 2.6, sweep: -6, dihedral: 2, thick: 0.21 },
    hstab: { x: 0.95, y: 1.35, span: 5.6, root: 1.6, tip: 1.6, sweep: 0 }, twinFins: { height: 2.2, root: 1.8, tip: 1.2, sweep: 20 },
    tiltNacelles: { len: 5.0, d: 1.25, tilt: 90 }, rotors: [{ at: 'nacelleL', blades: 3, d: 11.6 }, { at: 'nacelleR', blades: 3, d: 11.6 }],
    sponsons: true, cockpit: { type: 'helo' }, gear: { type: 'tricycle', mainSpan: 4.6, mainX: 0.48, noseX: 0.12, h: 1.1 }, finish: 'light_grey', insignia: 'usa_low' },
  // heavy transport helicopter (CH-53 / CH-46 class)
  helicopter_heavy: { fuselage: { L: 20, W: 2.8, H: 3.2, nose: 0.12, tail: 0.5, upsweep: 1.2, noseDrop: -0.35, tailEnd: 0.18, power: 2.6, boom: true },
    fin: { x: 0.97, height: 3.2, root: 1.8, tip: 1.2, sweep: 12 }, mainRotor: { blades: 7, d: 24, x: 0.45, mast: 0.9 }, tailRotor: { blades: 4, d: 6 },
    sponsons: true, cockpit: { type: 'helo' }, gear: { type: 'tricycle', mainSpan: 4, mainX: 0.5, noseX: 0.14, h: 0.9 }, finish: 'dark_grey', insignia: 'usa_low' },
  // light helicopter (Bell 206 / UH-1 class)
  helicopter_light: { fuselage: { L: 12, W: 1.6, H: 2.2, nose: 0.12, tail: 0.6, upsweep: 0.6, noseDrop: -0.2, tailEnd: 0.1, power: 2.3, boom: true },
    hstab: { x: 0.85, y: 1.0, span: 2.6, root: 0.6, tip: 0.5, sweep: 0 }, fin: { x: 0.97, height: 1.6, root: 1.0, tip: 0.6, sweep: 30 },
    mainRotor: { blades: 2, d: 14.6, x: 0.38, mast: 0.6 }, tailRotor: { blades: 2, d: 2.6 }, cockpit: { type: 'helo' }, skids: true, finish: 'olive', insignia: 'usa_low' },
  // four-engine piston bomber (B-29 / B-17 class)
  bomber_4prop: { fuselage: { L: 30, W: 2.9, H: 2.9, nose: 0.11, tail: 0.36, upsweep: 0.6, noseDrop: 0, tailEnd: 0.12, power: 2.0, glassNose: true },
    wing: { x: 0.42, y: -0.4, span: 43, root: 5.8, tip: 1.8, sweep: 6, dihedral: 4, thick: 0.18 },
    hstab: { x: 0.93, y: 0.8, span: 13.2, root: 3.6, tip: 1.6, sweep: 10 }, fin: { x: 0.9, height: 6.2, root: 5.2, tip: 1.6, sweep: 32 },
    engines: [{ type: 'radial_nacelle', d: 1.6, span: 0.16 }, { type: 'radial_nacelle', d: 1.6, span: 0.33 }, { type: 'radial_nacelle', d: 1.6, span: -0.16 }, { type: 'radial_nacelle', d: 1.6, span: -0.33 }],
    props: [0, 1, 2, 3].map((i) => ({ at: 'engine' + i, blades: 4, d: 5 })), gear: { type: 'tricycle', mainSpan: 8.7, mainX: 0.42, noseX: 0.14, h: 2.6 },
    finish: 'polished', insignia: 'usa' },
  // jet fighter (F-86 / MiG class)
  fighter_jet: { fuselage: { L: 11.4, W: 1.45, H: 1.6, nose: 0.15, tail: 0.3, upsweep: 0.1, noseDrop: 0, tailEnd: 0.45, power: 2.0, intakeNose: true },
    wing: { x: 0.42, y: -0.2, span: 11.3, root: 3.4, tip: 1.3, sweep: 35, dihedral: 3, thick: 0.1 },
    hstab: { x: 0.9, y: 0.35, span: 3.8, root: 1.4, tip: 0.6, sweep: 35 }, fin: { x: 0.86, height: 2.2, root: 2.2, tip: 0.8, sweep: 45 },
    canopy: { type: 'bubble', x: 0.7, len: 2.2, w: 0.75, h: 0.6 }, gear: { type: 'tricycle', mainSpan: 2.4, mainX: 0.52, noseX: 0.22, h: 1.5 }, finish: 'polished', insignia: 'usa' },
  // twin-engine jet airliner (737 / A320 class)
  airliner_jet: { fuselage: { L: 37.6, W: 3.76, H: 4.0, nose: 0.1, tail: 0.3, upsweep: 1.0, noseDrop: -0.3, tailEnd: 0.08, power: 2.0 },
    wing: { x: 0.4, y: -1.2, span: 34.3, root: 7.0, tip: 1.4, sweep: 27, dihedral: 6, thick: 0.13 },
    hstab: { x: 0.95, y: 0.9, span: 13, root: 3.8, tip: 1.3, sweep: 32 }, fin: { x: 0.9, height: 7.0, root: 5.6, tip: 1.8, sweep: 40 },
    engines: [{ type: 'jet_pod', d: 2.0, len: 4.6, span: 0.32 }, { type: 'jet_pod', d: 2.0, len: 4.6, span: -0.32 }],
    windows: { count: 26, from: 0.18, to: 0.8, size: 0.3 }, cockpit: { type: 'airliner' }, gear: { type: 'tricycle', mainSpan: 5.7, mainX: 0.47, noseX: 0.1, h: 3.0 },
    finish: 'white', stripe: '#1f4e8c', insignia: 'none' },
};

function resolvePreset(name, over = {}) {
  const p = PRESETS[name]; if (!p) throw new Error(`unknown aircraft preset "${name}" (have: ${Object.keys(PRESETS).join(', ')})`);
  const base = p.base ? resolvePreset(p.base) : {};
  const out = { ...base, ...p }; delete out.base;
  for (const k in over) { out[k] = (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) ? { ...out[k], ...over[k] } : over[k]; }
  return out;
}

// ------------------------------------------------------------------ geometry builders
// fuselage: lofted superellipse rings. seam at the bottom. u = 0 nose -> 1 tail, v = 0 bottom, .25 port, .5 top, .75 starboard
function fuselageGeo(F) {
  const NS = 96, NR = 48, L = F.L, pos = [], uv = [], idx = [];
  const nose = F.nose ?? 0.15, tail = F.tail ?? 0.4, p = F.power ?? 2;
  const prof = (s) => {
    let k = 1, yc = 0;
    if (s < nose) { const q = s / nose; k = Math.pow(1 - Math.pow(1 - q, F.glassNose ? 1.6 : 2.4), 0.55) * 0.97 + 0.03; yc = (F.noseDrop || 0) * Math.pow(1 - q, 2); }
    if (s > 1 - tail) {
      const q = (s - (1 - tail)) / tail; const end = F.tailEnd ?? 0.08;
      if (F.boom) { k = q < 0.35 ? 1 - (1 - 0.3) * Math.pow(q / 0.35, 1.3) : 0.3 - (0.3 - end) * ((q - 0.35) / 0.65); }
      else k = 1 - (1 - end) * Math.pow(q, 1.5);
      yc = (F.upsweep || 0) * Math.pow(q, 1.6);
    }
    return { k, yc };
  };
  for (let i = 0; i <= NS; i++) {
    const s = i / NS, x = L * (0.5 - s); const { k, yc } = prof(s);
    // tail sections get flatter/taller (vertical slab under the fin)
    const ws = (F.W / 2) * k * (s > 1 - tail ? lerp(1, 0.75, (s - (1 - tail)) / tail) : 1), hs = (F.H / 2) * k;
    for (let j = 0; j <= NR; j++) {
      const a = -Math.PI / 2 + (j / NR) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      const cz = Math.sign(c) * Math.pow(Math.abs(c), 2 / p), sy = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / p);
      pos.push(x, yc + hs * sy, ws * cz); uv.push(s, j / NR);
    }
  }
  for (let i = 0; i < NS; i++) for (let j = 0; j < NR; j++) { const a = i * (NR + 1) + j, b = a + NR + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }   // outward-facing (counter-clockwise seen from outside)
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  g.userData.profile = prof; return g;
}

// NACA-like cambered airfoil, closed loop TE->upper->LE->lower->TE, x 0..1 (LE..TE)
function airfoil(t = 0.15, camber = 0.02, n = 22) {
  const pts = [];
  const yt = (x) => 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const yc = (x) => (x < 0.4 ? (camber / 0.16) * (0.8 * x - x * x) : (camber / 0.36) * (0.2 + 0.8 * x - x * x));
  for (let i = n; i >= 0; i--) { const x = 0.5 * (1 - Math.cos((i / n) * Math.PI)); pts.push([x, yc(x) + yt(x)]); }
  for (let i = 1; i < n; i++) { const x = 0.5 * (1 - Math.cos((i / n) * Math.PI)); pts.push([x, yc(x) - yt(x)]); }
  return pts;
}
// one wing panel spanning +Z from root (z=0). W: {span(half), root, tip, sweep(deg LE), dihedral(deg), thick, roundTips}
function wingGeo(W, side = 1, camber = 0.02) {
  const af = airfoil(W.thick ?? 0.15, camber), NA = af.length, NSP = 24, b = W.half, pos = [], uv = [], idx = [];
  const tanS = Math.tan(deg(W.sweep || 0)), tanD = Math.tan(deg(W.dihedral || 0));
  for (let i = 0; i <= NSP; i++) {
    let e = i / NSP; let c = lerp(W.root, W.tip, e); let thk = 1;
    const tipZone = W.roundTips ? 0.12 : 0.05;
    if (e > 1 - tipZone) { const q = (e - (1 - tipZone)) / tipZone; const r = Math.sqrt(Math.max(0, 1 - q * q)); c *= lerp(1, 0.25, 1 - r); thk = lerp(1, 0.3, 1 - r); }
    const le = -tanS * e * b + (W.root - c) * (W.roundTips && e > 0.88 ? 0.5 : 0), y = tanD * e * b, z = e * b * side;
    for (let j = 0; j < NA; j++) { const [ax, ay] = af[j]; pos.push(le - ax * c, y + ay * c * thk, z); uv.push(ax, e); }
  }
  for (let i = 0; i < NSP; i++) for (let j = 0; j < NA; j++) {
    const a = i * NA + j, b2 = i * NA + ((j + 1) % NA), c2 = a + NA, d2 = b2 + NA;
    if (side > 0) idx.push(a, c2, b2, b2, c2, d2); else idx.push(a, b2, c2, b2, d2, c2);   // outward-facing
  }
  // tip cap (fan)
  const base = NSP * NA, cIdx = pos.length / 3; let cx = 0, cy = 0, cz = 0;
  for (let j = 0; j < NA; j++) { cx += pos[(base + j) * 3]; cy += pos[(base + j) * 3 + 1]; cz += pos[(base + j) * 3 + 2]; }
  pos.push(cx / NA, cy / NA, cz / NA); uv.push(0.5, 1);
  for (let j = 0; j < NA; j++) { const a = base + j, b2 = base + ((j + 1) % NA); if (side > 0) idx.push(a, b2, cIdx); else idx.push(a, cIdx, b2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function lathe(profile, seg = 40) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), seg); }

// ------------------------------------------------------------------ textures
function panelTexture({ base = '#c3c8cd', lines = 0.2, w = 2048, h = 1024, chordwise = false, corrugated = false, seed = 3 }) {
  const c = makeCanvas(w, h), g = c.getContext('2d'); const r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  // subtle sheet-to-sheet tone variation
  const cols = chordwise ? 10 : 22, rows = chordwise ? 14 : 8;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.015 + r() * 0.035})`; g.fillRect((i * w) / cols, (j * h) / rows, w / cols, h / rows); }
  g.strokeStyle = `rgba(20,24,28,${lines})`; g.lineWidth = 2;
  for (let i = 1; i < cols; i++) { const x = (i * w) / cols + (r() - 0.5) * 8; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let j = 1; j < rows; j++) { const y = (j * h) / rows; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.fillStyle = `rgba(20,24,28,${lines * 0.7})`; // rivet rows
  for (let i = 1; i < cols; i++) for (let y = 4; y < h; y += 14) { g.fillRect((i * w) / cols + 6, y, 2, 2); }
  if (corrugated) { for (let y = 0; y < h; y += 10) { g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(0, y, w, 3); g.fillStyle = 'rgba(0,0,0,.10)'; g.fillRect(0, y + 5, w, 3); } }
  return c;
}
function drawInsignia(g, kind, cx, cy, R) {
  g.save(); g.translate(cx, cy);
  if (kind === 'usa' || kind === 'usa_low') {
    const low = kind === 'usa_low';
    g.fillStyle = low ? '#3d4651' : '#1d2a52'; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
    g.fillRect(R * 0.5, -R * 0.45, R * 1.5, R * 0.9); g.fillRect(-R * 2.0, -R * 0.45, R * 1.5, R * 0.9);
    g.fillStyle = low ? '#b9c0c6' : '#f1f1f1'; g.fillRect(R * 0.55, -R * 0.33, R * 1.38, R * 0.66); g.fillRect(-R * 1.93, -R * 0.33, R * 1.38, R * 0.66);
    if (!low) { g.fillStyle = '#b3242b'; g.fillRect(R * 0.6, -R * 0.1, R * 1.3, R * 0.2); g.fillRect(-R * 1.9, -R * 0.1, R * 1.3, R * 0.2); }
    g.fillStyle = low ? '#b9c0c6' : '#f1f1f1'; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? R * 0.38 : R * 0.95; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.fill();
  } else if (kind === 'roundel') {
    [['#24356b', 1], ['#f1f1f1', 0.66], ['#b3242b', 0.36]].forEach(([c, k]) => { g.fillStyle = c; g.beginPath(); g.arc(0, 0, R * k, 0, Math.PI * 2); g.fill(); });
  }
  g.restore();
}
function fuselageTexture(P, fin) {
  const w = 4096, h = 1024; const c = panelTexture({ base: fin.color, lines: fin.panel, w, h, corrugated: P.corrugated, seed: 11 }); const g = c.getContext('2d');
  // side decal helper (canvas textures are flipY, so canvas y = (1 - v) h). v = .25 is the +z side (canvas y .75h, 'up' = -y,
  // the nose is on the viewer's right there, so text is mirrored in place); v = .75 is the -z side (canvas y .25h, 'up' = +y, so flip y).
  // Positions (X along the fuselage, Yv up the side) mean the same thing on both sides; use sideText() for anything with a reading direction.
  const onSide = (side, fn) => { for (const s of side === 'both' ? ['zpos', 'zneg'] : [side]) { g.save(); if (s === 'zpos') g.translate(0, 0.75 * h); else { g.translate(0, 0.25 * h); g.scale(1, -1); } fn(g, s, s === 'zpos'); g.restore(); } };
  const sideText = (g2, str, x, y, mirror) => { g2.save(); g2.translate(x, y); if (mirror) g2.scale(-1, 1); g2.fillText(str, 0, 0); g2.restore(); };
  const L = P.fuselage.L;
  const X = (s) => s * w;                   // u (0 nose .. 1 tail) -> px
  const Yv = (dv) => -dv * h;               // offset around from side centre (positive = up the side)
  if (P.stripe) onSide('both', (g2) => { g2.fillStyle = P.stripe; g2.fillRect(X(0.02), Yv(0.035), X(0.9), h * 0.03); });
  if (P.windows) {
    const W = P.windows; onSide('both', (g2) => {
      for (let i = 0; i < W.count; i++) {
        const s = lerp(W.from, W.to, W.count > 1 ? i / (W.count - 1) : 0.5); const ww = (W.size / L) * w * (W.square ? 1.1 : 0.85), hh = W.size * 1.6 / (Math.PI * P.fuselage.H) * h * 0.5;
        g2.fillStyle = '#1b2228'; g2.beginPath(); g2.roundRect(X(s) - ww / 2, Yv(0.06) - hh / 2, ww, hh, W.square ? 4 : ww * 0.35); g2.fill();
        g2.fillStyle = 'rgba(160,190,210,.35)'; g2.fillRect(X(s) - ww / 2 + 3, Yv(0.06) - hh / 2 + 3, ww * 0.35, hh * 0.4);
      }
    });
  }
  if (P.cockpit && (P.cockpit.type === 'airliner' || P.cockpit.type === 'helo')) {
    onSide('both', (g2) => { // windshield panes wrapping onto the side near the nose
      const s0 = P.cockpit.type === 'helo' ? 0.035 : 0.06, s1 = P.cockpit.type === 'helo' ? 0.16 : 0.12;
      g2.fillStyle = P.cockpit.type === 'helo' ? '#2b2e52' : '#141a20';
      const lo = P.cockpit.type === 'helo' ? -0.02 : 0.075, hi = P.cockpit.type === 'helo' ? 0.13 : 0.125;
      g2.beginPath(); g2.moveTo(X(s0), Yv(hi - 0.01)); g2.lineTo(X(s1), Yv(hi)); g2.lineTo(X(s1), Yv(lo)); g2.lineTo(X(s0 + 0.012), Yv(lo - 0.005)); g2.closePath(); g2.fill();
      if (P.cockpit.type !== 'helo') { g2.strokeStyle = 'rgba(200,205,210,.7)'; g2.lineWidth = 5; g2.beginPath(); g2.moveTo(X((s0 + s1) / 2), Yv(hi)); g2.lineTo(X((s0 + s1) / 2), Yv(lo)); g2.stroke(); }
    });
    // front windshield across the top of the nose (v around .5)
    g.fillStyle = P.cockpit.type === 'helo' ? '#2b2e52' : '#141a20'; const s0 = P.cockpit.type === 'helo' ? 0.03 : 0.055;
    const t0 = P.cockpit.type === 'helo' ? 0.33 : 0.385, t1 = 1 - t0;   // across the top of the nose, clear of the side panes
    g.beginPath(); g.moveTo(X(s0), h * (t0 + 0.02)); g.lineTo(X(s0 + 0.028), h * t0); g.lineTo(X(s0 + 0.028), h * t1); g.lineTo(X(s0), h * (t1 - 0.02)); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(200,205,210,.8)'; g.lineWidth = 6; g.beginPath(); g.moveTo(X(s0), h * 0.5); g.lineTo(X(s0 + 0.03), h * 0.5); g.stroke();
  }
  if (P.insignia && P.insignia !== 'none') onSide('both', (g2) => drawInsignia(g2, P.insignia, X(P.insigniaAt ?? 0.66), Yv(0.0), h * 0.06));
  if (P.registration) onSide('both', (g2, sd, mir) => { g2.fillStyle = '#20252a'; g2.font = `700 ${h * 0.07}px ${FONTS.sans}`; g2.textAlign = 'center'; g2.textBaseline = 'middle'; sideText(g2, P.registration, X(0.8), Yv(0.01), mir); });
  if (P.name) onSide('both', (g2, sd, mir) => { g2.fillStyle = '#20252a'; g2.font = `italic 700 ${h * 0.05}px Georgia, serif`; g2.textAlign = 'center'; g2.textBaseline = 'middle'; sideText(g2, P.name, X(0.07), Yv(0.02), mir); });
  if (P.anti_glare) { g.fillStyle = '#2b2f2a'; g.fillRect(X(0.0), h * 0.46, X(0.4), h * 0.08); }
  return c;
}
function wingTexture(fin, P, side, top = true) {
  const c = panelTexture({ base: fin.color, lines: fin.panel, w: 1024, h: 2048, chordwise: true, corrugated: P.corrugated, seed: side > 0 ? 21 : 22 }); const g = c.getContext('2d');
  // u = chord (0 LE .. 1 TE) -> x ; v = span fraction (0 root .. 1 tip) -> canvas y = (1-v)
  if (P.insignia && P.insignia !== 'none' && ((top && side > 0) || (!top && side < 0) || P.insignia === 'usa_low')) {
    g.save(); g.translate(1024 * 0.45, 2048 * (1 - 0.72)); g.rotate(side > 0 ? Math.PI / 2 : -Math.PI / 2); drawInsignia(g, P.insignia, 0, 0, 170); g.restore();
  }
  return c;
}
function radialFaceTexture() {
  const c = makeCanvas(512, 512), g = c.getContext('2d'); g.fillStyle = '#1b1c1e'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; g.save(); g.translate(256, 256); g.rotate(a); const grd = g.createLinearGradient(0, 40, 0, 230); grd.addColorStop(0, '#3a3c40'); grd.addColorStop(1, '#6b6e73'); g.fillStyle = grd; g.fillRect(-26, 50, 52, 180); g.fillStyle = 'rgba(0,0,0,.5)'; for (let k = 60; k < 225; k += 14) g.fillRect(-26, k, 52, 5); g.restore(); }
  g.fillStyle = '#2a2b2e'; g.beginPath(); g.arc(256, 256, 70, 0, Math.PI * 2); g.fill(); return c;
}

// ------------------------------------------------------------------ parts
function propeller({ blades = 3, d = 3, color = '#16181a', tips = '#e3b51f', spinner = '#d0d4d8', hub = 0.18 }) {
  const grp = new THREE.Group(); const R = d / 2;
  const bladeMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.2 });
  const tipMat = new THREE.MeshStandardMaterial({ color: tips, roughness: 0.5 });
  const shape = new THREE.Shape(); const cw = Math.max(0.12, d * 0.07);
  shape.moveTo(0, -cw * 0.35); shape.bezierCurveTo(R * 0.3, -cw * 0.6, R * 0.75, -cw * 0.55, R * 0.97, -cw * 0.25); shape.quadraticCurveTo(R, 0, R * 0.97, cw * 0.25);
  shape.bezierCurveTo(R * 0.75, cw * 0.45, R * 0.3, cw * 0.5, 0, cw * 0.35); shape.closePath();
  const bg = new THREE.ExtrudeGeometry(shape, { depth: cw * 0.12, bevelEnabled: true, bevelThickness: cw * 0.04, bevelSize: cw * 0.04, bevelSegments: 2, curveSegments: 10 }); bg.translate(0, 0, -cw * 0.06);
  for (let i = 0; i < blades; i++) {
    const piv = new THREE.Group(); piv.rotation.x = (i / blades) * Math.PI * 2;
    const b = new THREE.Mesh(bg, bladeMat); b.rotation.set(0, 0, Math.PI / 2); b.rotation.y = deg(18); // pitch
    const bh = new THREE.Group(); bh.add(b); bh.rotation.y = Math.PI / 2; // blade length along +Y in prop disc (YZ plane)
    // yellow tip band
    const tip = new THREE.Mesh(new THREE.BoxGeometry(cw * 0.2, R * 0.08, cw * 0.9), tipMat); tip.position.set(0, R * 0.93, 0); if (tips) bh.add(tip);
    b.position.set(0, 0, 0); piv.add(bh); grp.add(piv);
  }
  const sp = new THREE.Mesh(lathe([[0, 0], [hub * 0.9, 0.0], [hub, -hub * 0.4], [hub * 0.75, -hub * 1.4], [0.02, -hub * 2.0]].map(([r, y]) => [r, -y]), 32),
    new THREE.MeshStandardMaterial({ color: spinner, metalness: 0.6, roughness: 0.3 }));
  sp.rotation.z = -Math.PI / 2; grp.add(sp);
  // translucent blur disc shown when spinning fast
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R * 0.98, 64), new THREE.MeshBasicMaterial({ color: '#202224', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  disc.rotation.y = Math.PI / 2; grp.add(disc); grp.userData.disc = disc; grp.userData.blades = grp.children.filter((ch) => ch.type === 'Group');
  grp.userData.kind = 'prop'; return grp;
}
function rotor({ blades = 3, d = 11, chord = null, color = '#2b2d30', droop = 2 }) {
  const grp = new THREE.Group(); const R = d / 2; const ch = chord || Math.max(0.35, d * 0.055);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2 });
  const stripe = new THREE.MeshStandardMaterial({ color: '#e9e9e9', roughness: 0.5 });
  for (let i = 0; i < blades; i++) {
    const piv = new THREE.Group(); piv.rotation.y = (i / blades) * Math.PI * 2;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(R * 0.92, ch * 0.12, ch), mat); blade.position.x = R * 0.54; blade.rotation.z = -deg(droop * 0.3);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(R * 0.03, ch * 0.13, ch * 1.01), stripe); tip.position.x = R * 0.8; blade.add(tip.clone()); tip.position.x = R * 0.86 - R * 0.54; blade.add(tip);
    const fold = new THREE.Group(); fold.position.x = R * 0.08; fold.add(blade); blade.position.x = R * 0.46; piv.add(fold); piv.userData.fold = fold; grp.add(piv);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.07, R * 0.09, R * 0.08, 24), new THREE.MeshStandardMaterial({ color: '#3c3f43', metalness: 0.5, roughness: 0.4 })); grp.add(hub);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 72), new THREE.MeshBasicMaterial({ color: '#1e2022', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); disc.rotation.x = -Math.PI / 2; grp.add(disc);
  grp.userData.disc = disc; grp.userData.kind = 'rotor'; grp.userData.pivots = grp.children.filter((c) => c.userData.fold); return grp;
}
function wheel(r, w) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(r * 0.72, r * 0.28, 16, 32), new THREE.MeshStandardMaterial({ color: '#1c1c1c', roughness: 0.85 }));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w * 0.8, 24), new THREE.MeshStandardMaterial({ color: '#9aa0a6', metalness: 0.7, roughness: 0.35 })); hub.rotation.x = Math.PI / 2;
  tire.scale.z = w / (r * 0.56); g.add(tire, hub); return g;
}
function strut(a, b, rad, mat) {
  const v = new THREE.Vector3().subVectors(b, a); const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, v.length(), 10), mat);
  m.position.copy(a).addScaledVector(v, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize()); return m;
}

// ------------------------------------------------------------------ procedural builder
export function buildProcedural(def) {
  const P = resolvePreset(def.preset || 'fighter_prop', def.params || {});
  if (def.livery) Object.assign(P, def.livery);
  const fin = { ...(FINISHES[P.finish] || FINISHES.aluminum), ...(P.color ? { color: P.color } : {}) };
  const root = new THREE.Group(); root.name = def.id || 'aircraft';
  const parts = { props: [], rotors: [], nacelles: [], wings: null, gear: [], named: {} };
  const skinTex = canvasTexture(fuselageTexture(P, fin)); skinTex.anisotropy = 8;
  const skin = new THREE.MeshStandardMaterial({ map: skinTex, metalness: fin.metalness, roughness: fin.roughness });
  const plain = new THREE.MeshStandardMaterial({ color: fin.color, metalness: fin.metalness, roughness: fin.roughness });
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2d31', metalness: 0.4, roughness: 0.5 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#2a3442', metalness: 0.1, roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.88 });
  const F = P.fuselage; const L = F.L;
  const fusZ = P.fuselages ? P.fuselages.map((f) => f.z) : [0];
  const fusGeo = fuselageGeo(F);
  const fusMeshes = fusZ.map((z, i) => { const m = new THREE.Mesh(fusGeo, skin); m.position.z = z; m.name = 'fuselage' + (i || ''); root.add(m); return m; });
  parts.named.fuselage = fusMeshes;
  const xAt = (frac) => L * (0.5 - frac); // station fraction -> x
  // glass nose (bomber) / nose intake (jet)
  if (F.glassNose) { const n = new THREE.Mesh(new THREE.SphereGeometry(F.W * 0.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass); n.rotation.z = -Math.PI / 2; n.scale.set(1.0, 0.9, 1); n.position.x = L / 2 - F.W * 0.42; root.add(n); }
  if (F.intakeNose) { const ring = new THREE.Mesh(new THREE.TorusGeometry(F.W * 0.22, F.W * 0.06, 12, 32), plain); ring.rotation.y = Math.PI / 2; ring.position.x = L / 2 - 0.05; root.add(ring); const hole = new THREE.Mesh(new THREE.CircleGeometry(F.W * 0.22, 32), dark); hole.rotation.y = Math.PI / 2; hole.position.x = L / 2 - 0.12; root.add(hole); }
  // canopy
  for (const C of [].concat(P.canopy || [])) {
    const prof = fusGeo.userData.profile(C.x); const yTop = prof.yc + (F.H / 2) * prof.k * 0.92;
    const cg = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2); const cm = new THREE.Mesh(cg, glass); cm.scale.set(C.len / 2, C.h, C.w / 2); cm.position.set(xAt(C.x), yTop - 0.05, C.z || 0); cm.name = 'canopy'; root.add(cm);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(1, 0.02, 6, 24, Math.PI), dark); frame.scale.set(C.w / 2, C.h, 1); frame.rotation.y = Math.PI / 2; frame.position.copy(cm.position); frame.position.x += C.len * 0.18; root.add(frame);
  }
  // radiator scoop (P-51)
  if (P.radiator) for (const z of fusZ) { const r = new THREE.Mesh(new THREE.CapsuleGeometry(F.W * 0.22, L * 0.14, 6, 16), plain); r.rotation.z = Math.PI / 2; r.scale.set(1, 1, 1.15); const pr = fusGeo.userData.profile(0.55); r.position.set(xAt(0.56), pr.yc - (F.H / 2) * pr.k - F.W * 0.08, z); root.add(r); }
  // sponsons
  if (P.sponsons) for (const s of [1, -1]) { const sp = new THREE.Mesh(new THREE.CapsuleGeometry(F.H * 0.2, L * 0.24, 8, 20), plain); sp.rotation.z = Math.PI / 2; sp.scale.set(1, 1, 1.3); sp.position.set(xAt(0.47), -F.H * 0.28, s * F.W * 0.5); sp.name = 'sponson'; root.add(sp); (parts.named.sponsons ||= []).push(sp); }
  // wings
  const wingGrp = new THREE.Group(); wingGrp.name = 'wing'; root.add(wingGrp); parts.wings = wingGrp;
  let wingInfo = null;
  if (P.wing) {
    const Wd = { ...P.wing, half: P.wing.span / 2 };
    const rootX = xAt(P.wing.x) + Wd.root * 0.5; // LE of root at station
    wingInfo = { rootX, y: P.wing.y, half: Wd.half, Wd };
    for (const side of [1, -1]) {
      const top = canvasTexture(wingTexture(fin, P, side, true));
      const m = new THREE.Mesh(wingGeo(Wd, side), new THREE.MeshStandardMaterial({ map: top, metalness: fin.metalness, roughness: fin.roughness }));
      m.position.set(rootX, P.wing.y, 0); m.name = side > 0 ? 'wingL' : 'wingR'; wingGrp.add(m); parts.named[m.name] = m;
    }
    // wing pivot at the root centre (for wing-stow)
    wingGrp.position.set(rootX - Wd.root * 0.5, P.wing.y, 0); wingGrp.children.forEach((c) => { c.position.x -= rootX - Wd.root * 0.5; c.position.y -= P.wing.y; });
  }
  const wingPoint = (spanFrac, chordFrac = 0.3) => { // point on wing (in root coords) at signed span fraction (-1..1 of half span)
    const W = wingInfo.Wd; const e = Math.abs(spanFrac); const c = lerp(W.root, W.tip, e);
    return new THREE.Vector3(wingInfo.rootX - Math.tan(deg(W.sweep || 0)) * e * W.half - chordFrac * c, wingInfo.y + Math.tan(deg(W.dihedral || 0)) * e * W.half, Math.sign(spanFrac) * e * W.half);
  };
  // tail
  const tailX = (frac) => xAt(frac);
  if (P.hstab) {
    const H = { ...P.hstab, half: P.hstab.span / 2, thick: 0.1 };
    const zs = P.centerStab ? [0] : fusZ;
    for (const z of zs) for (const side of [1, -1]) {
      const half = P.centerStab ? (Math.abs(fusZ[0]) + H.half) : H.half;
      const g = wingGeo({ ...H, half }, side, 0); const m = new THREE.Mesh(g, plain); const pr = fusGeo.userData.profile(H.x);
      m.position.set(tailX(H.x) + H.root * 0.5, pr.yc + (H.y ?? 0) * 0.3, z); m.name = 'hstab'; root.add(m);
    }
  }
  const finMeshes = [];
  const makeFin = (Fn, x, y, z, s = 1) => { const g = wingGeo({ ...Fn, half: Fn.height, thick: 0.1, roundTips: Fn.round, dihedral: 0 }, 1, 0); const m = new THREE.Mesh(g, plain); m.rotation.x = -Math.PI / 2 * s; m.position.set(x, y, z); m.name = 'fin'; root.add(m); finMeshes.push(m); return m; };
  if (P.fin) for (const z of fusZ) { const pr = fusGeo.userData.profile(P.fin.x); makeFin(P.fin, tailX(P.fin.x) + P.fin.root * 0.5, pr.yc + (F.H / 2) * pr.k * 0.6, z); }
  if (P.twinFins && P.hstab) { const pr = fusGeo.userData.profile(P.hstab.x); for (const s of [1, -1]) { const m = makeFin(P.twinFins, tailX(P.hstab.x) + P.twinFins.root * 0.5, pr.yc + (P.hstab.y ?? 0) * 0.3 - P.twinFins.height * 0.35, s * P.hstab.span / 2); } }
  // engines + props
  const engPos = [];
  (P.engines || []).forEach((E, i) => {
    if (E.type === 'nose' || E.type === 'nose_radial') {
      const z = E.z || 0; const p = new THREE.Vector3(L / 2, fusGeo.userData.profile(0).yc, z); engPos.push(p);
      if (E.type === 'nose_radial') { const cowl = new THREE.Mesh(new THREE.CylinderGeometry(E.d / 2, E.d / 2 * 0.95, E.d * 0.35, 32, 1, true), E.exposed ? dark : plain); cowl.rotation.z = Math.PI / 2; cowl.position.set(L / 2 - E.d * 0.05, p.y, z); root.add(cowl); const face = new THREE.Mesh(new THREE.CircleGeometry(E.d / 2 * 0.97, 32), new THREE.MeshStandardMaterial({ map: canvasTexture(radialFaceTexture()), roughness: 0.6, metalness: 0.5 })); face.rotation.y = Math.PI / 2; face.position.set(L / 2 + E.d * 0.1, p.y, z); root.add(face); p.x = L / 2 + E.d * 0.14;
        if (E.exposed) { for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; const cyl = new THREE.Mesh(new THREE.CylinderGeometry(E.d * 0.07, E.d * 0.08, E.d * 0.3, 12), new THREE.MeshStandardMaterial({ color: '#55585c', metalness: 0.7, roughness: 0.4 })); cyl.position.set(L / 2 + E.d * 0.02, p.y + Math.sin(a) * E.d * 0.42, z + Math.cos(a) * E.d * 0.42); cyl.rotation.x = -a + Math.PI / 2; root.add(cyl); } }
      }
      return;
    }
    if (!wingInfo) return;
    const wp = wingPoint(E.span, 0.0);
    if (E.type === 'radial_nacelle') {
      const pusher = !!E.pusher;
      const leX = wp.x, teX = wingPoint(E.span, 1.0).x, chord = leX - teX;
      const len = pusher ? chord + E.d * 1.6 : E.d * (E.under ? 1.6 : 3.2);
      const prof = [[0.0, 0], [E.d * 0.5, 0.04], [E.d * 0.5, E.d * 0.5], [E.d * 0.47, len * 0.45], [E.d * 0.3, len * 0.85], [0.02, len]];
      const n = new THREE.Mesh(lathe(prof, 32), plain); n.rotation.z = Math.PI / 2; const ny = E.under ? wp.y - E.d * 0.75 : wp.y - E.d * 0.08;
      const tipX = pusher ? leX + E.d * 0.3 : wp.x + E.d * 1.1;   // front tip of the nacelle (pusher: just ahead of the leading edge)
      n.position.set(tipX, ny, wp.z); wingGrp.add(n); n.position.sub(wingGrp.position);
      const face = new THREE.Mesh(new THREE.CircleGeometry(E.d * 0.48, 32), new THREE.MeshStandardMaterial({ map: canvasTexture(radialFaceTexture()), roughness: 0.6, metalness: 0.5 }));
      if (pusher) { face.rotation.y = -Math.PI / 2; face.position.set(tipX - len - 0.01, ny, wp.z); }   // engine face at the rear, behind the wing
      else { face.rotation.y = Math.PI / 2; face.position.set(wp.x + E.d * 1.1 + 0.01, ny, wp.z); }
      face.position.sub(wingGrp.position); wingGrp.add(face);
      n.name = 'nacelle'; const ep = pusher ? new THREE.Vector3(tipX - len - E.d * 0.15, ny, wp.z) : new THREE.Vector3(wp.x + E.d * 1.25, ny, wp.z); engPos.push(ep); parts.nacelles.push(n);
      if (E.under) { wingGrp.add(strut(new THREE.Vector3(wp.x + E.d * 0.3, ny, wp.z).sub(wingGrp.position), new THREE.Vector3(wp.x, wp.y, wp.z).sub(wingGrp.position), 0.05, dark)); wingGrp.add(strut(new THREE.Vector3(wp.x + E.d * 0.3, ny, wp.z).sub(wingGrp.position), new THREE.Vector3(xAt(0.2), -F.H * 0.3, Math.sign(E.span) * F.W * 0.4).sub(wingGrp.position), 0.05, dark)); }
    } else if (E.type === 'jet_pod') {
      const prof = [[E.d * 0.42, 0], [E.d * 0.5, E.len * 0.08], [E.d * 0.5, E.len * 0.55], [E.d * 0.36, E.len * 0.95], [E.d * 0.2, E.len]];
      const n = new THREE.Mesh(lathe(prof, 36), plain); n.rotation.z = Math.PI / 2; n.position.set(wp.x + E.len * 0.55, wp.y - E.d * 0.75, wp.z); n.position.sub(wingGrp.position); wingGrp.add(n);
      const inl = new THREE.Mesh(new THREE.CircleGeometry(E.d * 0.42, 32), dark); inl.rotation.y = Math.PI / 2; inl.position.copy(n.position); inl.position.x -= 0.02 - 0; inl.position.x += 0; wingGrp.add(inl);
      const pyl = new THREE.Mesh(new THREE.BoxGeometry(E.len * 0.5, E.d * 0.5, 0.18), plain); pyl.position.set(wp.x + E.len * 0.1, wp.y - E.d * 0.35, wp.z); pyl.position.sub(wingGrp.position); wingGrp.add(pyl); n.name = 'nacelle'; parts.nacelles.push(n);
    }
  });
  (P.props || []).forEach((Pp) => {
    let p; if (Pp.at === 'nose') p = engPos.find((e) => Math.abs(e.z - (Pp.z || 0)) < 0.01 && e.x >= L / 2 - 0.5) || new THREE.Vector3(L / 2, 0, Pp.z || 0); else p = engPos[+String(Pp.at).replace('engine', '')];
    if (!p) return; const pr = propeller({ blades: Pp.blades, d: Pp.d, tips: P.insignia === 'none' ? null : '#e3b51f', spinner: P.spinner || (P.finish === 'olive' ? '#6b7350' : '#d0d4d8') });
    pr.position.copy(p); pr.position.x += 0.05; pr.userData.dir = Pp.dir || 1;
    const engDef = Pp.at !== 'nose' && P.engines ? P.engines[+String(Pp.at).replace('engine', '')] : null;
    if (engDef && engDef.pusher) pr.rotation.y = Math.PI;   // pusher: spinner points aft (rotation.x spin is preserved)
    const inWing = Pp.at !== 'nose'; if (inWing) { pr.position.sub(wingGrp.position); wingGrp.add(pr); } else root.add(pr); parts.props.push(pr);
  });
  // tilt-rotor nacelles at the wing tips
  if (P.tiltNacelles && wingInfo) {
    const T = P.tiltNacelles; P.rotors.forEach((R, i) => {
      const side = i === 0 ? 1 : -1; const tip = wingPoint(side * 1.0, 0.5);
      const piv = new THREE.Group(); piv.position.copy(tip).sub(wingGrp.position); piv.position.z += side * T.d * 0.45; wingGrp.add(piv); piv.name = side > 0 ? 'nacelleL' : 'nacelleR';
      const body = new THREE.Mesh(lathe([[0.02, 0], [T.d * 0.45, T.len * 0.06], [T.d * 0.55, T.len * 0.3], [T.d * 0.52, T.len * 0.85], [T.d * 0.3, T.len]], 28), plain); body.name = 'nacelle';
      body.rotation.z = -Math.PI / 2; body.position.x = -T.len * 0.42; piv.add(body);
      const rt = rotor({ blades: R.blades, d: R.d, droop: 0 }); rt.rotation.z = -Math.PI / 2; rt.position.x = T.len * 0.58 + 0.12; piv.add(rt); rt.userData.dir = side;
      piv.rotation.z = deg(T.tilt ?? 90); parts.nacelles.push(piv); parts.rotors.push(rt);
    });
  }
  // helicopter rotors
  if (P.mainRotor) { const M = P.mainRotor; const pr = fusGeo.userData.profile(M.x); const top = pr.yc + (F.H / 2) * pr.k; const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, M.mast, 12), dark); mast.position.set(xAt(M.x), top + M.mast / 2, 0); root.add(mast);
    const rt = rotor({ blades: M.blades, d: M.d }); rt.position.set(xAt(M.x), top + M.mast, 0); root.add(rt); parts.rotors.push(rt);
    const hump = new THREE.Mesh(new THREE.CapsuleGeometry(F.W * 0.3, L * 0.18, 6, 16), plain); hump.rotation.z = Math.PI / 2; hump.position.set(xAt(M.x + 0.02), top - 0.05, 0); hump.scale.set(1, 0.7, 1); root.add(hump); }
  if (P.tailRotor && P.fin) { const pr = fusGeo.userData.profile(P.fin.x); const rt = rotor({ blades: P.tailRotor.blades, d: P.tailRotor.d, droop: 0 }); rt.rotation.x = Math.PI / 2; rt.position.set(tailX(P.fin.x) + 0.3, pr.yc + (F.H / 2) * pr.k + P.fin.height * 0.55, -0.35); root.add(rt); parts.rotors.push(rt); rt.userData.tail = true; }
  // struts (high wing)
  if (P.struts && wingInfo) for (const s of [1, -1]) { const a = wingPoint(s * 0.42, 0.25); const b = wingPoint(s * 0.42, 0.7); const base = new THREE.Vector3(xAt(P.wing.x + 0.05), -F.H * 0.42, s * F.W * 0.48); root.add(strut(base, a, 0.045, dark)); root.add(strut(base, b, 0.045, dark)); }
  // landing gear
  const G = P.gear; let groundY = null;
  const fusBottom = (frac) => { const pr = fusGeo.userData.profile(frac); return pr.yc - (F.H / 2) * pr.k; };
  if (P.skids) { for (const s of [1, -1]) { const sk = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, L * 0.3, 4, 8), dark); sk.rotation.z = Math.PI / 2; sk.position.set(xAt(0.3), fusBottom(0.3) - 0.5, s * F.W * 0.55); root.add(sk); root.add(strut(new THREE.Vector3(xAt(0.22), fusBottom(0.22), s * F.W * 0.3), new THREE.Vector3(xAt(0.22), fusBottom(0.3) - 0.5, s * F.W * 0.55), 0.04, dark)); root.add(strut(new THREE.Vector3(xAt(0.4), fusBottom(0.4), s * F.W * 0.3), new THREE.Vector3(xAt(0.4), fusBottom(0.3) - 0.5, s * F.W * 0.55), 0.04, dark)); } groundY = fusBottom(0.3) - 0.55; }
  else if (G) {
    const gearGrp = new THREE.Group(); gearGrp.name = 'gear'; root.add(gearGrp); parts.gear.push(gearGrp);
    const mainX = xAt(G.mainX); const yb = Math.min(...fusZ.map(() => fusBottom(G.mainX))) - G.h * 0.55; const wr = Math.max(0.25, G.h * 0.22);
    groundY = yb - wr;
    const mains = G.perFuselage ? fusZ.flatMap((z) => [z + G.mainSpan / 2 * 0.0 + (z > 0 ? 0.0 : 0), z]) : [G.mainSpan / 2, -G.mainSpan / 2];
    const mainsZ = G.perFuselage ? fusZ : mains;
    for (const z of mainsZ) { const w = wheel(wr, wr * 0.7); w.position.set(mainX, yb, z); gearGrp.add(w); const top = new THREE.Vector3(mainX + 0.1, wingInfo && !P.struts ? wingInfo.y - 0.1 : fusBottom(G.mainX), G.splay ? Math.sign(z) * F.W * 0.45 : z * 0.95); gearGrp.add(strut(top, new THREE.Vector3(mainX, yb, z), 0.07, dark)); }
    if (G.type === 'tricycle') { const nx = xAt(G.noseX); const w = wheel(wr * 0.75, wr * 0.55); w.position.set(nx, yb + wr * 0.25, 0); gearGrp.add(w); gearGrp.add(strut(new THREE.Vector3(nx, fusBottom(G.noseX), 0), new THREE.Vector3(nx, yb + wr * 0.25, 0), 0.06, dark)); }
  }
  // ground the aircraft: lowest wheel on y = 0 (tail-draggers sit nose-up: rotate about main wheels)
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const inner = new THREE.Group(); while (root.children.length) inner.add(root.children[0]); root.add(inner);
  if (G && G.type === 'taildragger' && parts.gear[0]) {
    // sit nose-up on the main wheels at a realistic ground angle, then hang the tail wheel under the tail
    const gearGrp = parts.gear[0]; const wr = Math.max(0.25, G.h * 0.22); const rt = wr * 0.42; const tx = xAt(0.93), tyF = fusBottom(0.93);
    let pitch = deg(G.pitch ?? 11), mb = 0, tp = null;
    for (let it = 0; it < 14; it++) {
      inner.rotation.z = pitch; inner.position.set(0, 0, 0); inner.updateMatrix();
      mb = new THREE.Vector3(xAt(G.mainX), groundY, 0).applyMatrix4(inner.matrix).y; tp = new THREE.Vector3(tx, tyF, 0).applyMatrix4(inner.matrix);
      if (tp.y - mb >= rt * 2.4 || pitch <= deg(2)) break; pitch -= deg(1);
    }
    const inv = inner.matrix.clone().invert();
    for (const z of fusZ) { const wc = new THREE.Vector3(tp.x - 0.05, mb + rt, z).applyMatrix4(inv); const w = wheel(rt, rt * 0.75); w.position.copy(wc); w.rotation.z = -pitch; gearGrp.add(w); gearGrp.add(strut(new THREE.Vector3(tx, tyF + 0.05, z), wc, 0.04, dark)); }
    inner.userData.groundPitch = pitch;
  }
  root.updateMatrixWorld(true); const box2 = new THREE.Box3().setFromObject(inner); inner.position.y = -box2.min.y; inner.position.x = -(box2.min.x + box2.max.x) / 2;
  root.userData.inner = inner; root.userData.parts = parts; root.userData.preset = P; root.userData.groundPitch = inner.rotation.z;
  inner.updateMatrix(); const toRoot = (v) => v.clone().applyMatrix4(inner.matrix);
  const geo = {}; if (wingInfo) { geo.wingtipL = toRoot(wingPoint(1, 0.45)); geo.wingtipR = toRoot(wingPoint(-1, 0.45)); geo.wingL = toRoot(wingPoint(0.6, 0.4)); geo.wingR = toRoot(wingPoint(-0.6, 0.4)); geo.wingRoot = toRoot(wingPoint(0.05, 0.4)); }
  const pr0 = fusGeo.userData.profile(0.02), prT = fusGeo.userData.profile(0.99);
  geo.nose = toRoot(new THREE.Vector3(L / 2, pr0.yc, 0)); geo.tail = toRoot(new THREE.Vector3(-L / 2, prT.yc, 0));
  geo.cockpit = toRoot(new THREE.Vector3(xAt(0.12), fusGeo.userData.profile(0.12).yc + F.H * 0.35, 0));
  engPos.forEach((e, i) => (geo['engine' + i] = toRoot(e)));
  root.userData.geoAnchors = geo;
  return root;
}

// ------------------------------------------------------------------ loaded models
const loaders = {};
function loaderFor(ext) {
  if (ext === 'glb' || ext === 'gltf') { if (!loaders.gltf) { loaders.gltf = new GLTFLoader(); const d = new DRACOLoader(); d.setDecoderPath('/node_modules/three/examples/jsm/libs/draco/'); loaders.gltf.setDRACOLoader(d); } return loaders.gltf; }
  if (ext === 'fbx') return (loaders.fbx ||= new FBXLoader());
  if (ext === 'obj') return (loaders.obj ||= new OBJLoader());
  throw new Error('unsupported model format: ' + ext);
}
const modelCache = new Map();
async function loadFile(url) {
  if (modelCache.has(url)) return modelCache.get(url);
  const ext = url.split('?')[0].split('.').pop().toLowerCase();
  const pr = (async () => {
    if (ext === 'obj') { const mtlUrl = url.replace(/\.obj$/i, '.mtl'); try { const r = await fetch(mtlUrl, { method: 'HEAD' }); if (r.ok) { const mtl = await new MTLLoader().setPath(mtlUrl.slice(0, mtlUrl.lastIndexOf('/') + 1)).loadAsync(mtlUrl.split('/').pop()); mtl.preload(); const l = new OBJLoader(); l.setMaterials(mtl); return await l.loadAsync(url); } } catch (e) { /* no mtl */ } }
    const res = await loaderFor(ext).loadAsync(url); return res.scene || res;
  })();
  modelCache.set(url, pr); return pr;
}
export async function buildFromModel(def, base) {
  const M = def.model; const src = await loadFile(base + M.file);
  const obj = src.clone(true);
  obj.traverse((n) => { if (n.isMesh) { n.castShadow = n.receiveShadow = true; if (n.material) { const fix = (m) => { m = m.clone(); if (m.isMeshPhongMaterial || m.isMeshLambertMaterial) { m = new THREE.MeshStandardMaterial({ color: m.color, map: m.map, roughness: 0.55, metalness: 0.2 }); } if (M.metalness != null) m.metalness = M.metalness; if (M.roughness != null) m.roughness = M.roughness; return m; }; n.material = Array.isArray(n.material) ? n.material.map(fix) : fix(n.material); } } });
  const TEX = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'bumpMap', 'alphaMap', 'specularMap'];
  obj.traverse((n) => { if (n.isMesh) for (const m of [].concat(n.material || [])) for (const k of TEX) if (m[k] && m[k].anisotropy < 16) { m[k].anisotropy = 16; m[k].needsUpdate = true; } });   // crisp textures at grazing angles
  for (const name of M.hide || []) obj.traverse((n) => { if (new RegExp(name, 'i').test(n.name)) n.visible = false; });
  const root = new THREE.Group(); root.name = def.id; const inner = new THREE.Group(); inner.add(obj); root.add(inner);
  const r = M.rotate || [0, 0, 0]; obj.rotation.set(deg(r[0]), deg(r[1]), deg(r[2]));
  root.updateMatrixWorld(true); let box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const target = M.length_m || def.specs?.length_m; const span = M.span_m || def.specs?.span_m;
  const s = M.scale || (target ? target / size.x : span ? span / size.z : 1); obj.scale.multiplyScalar(s);
  root.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(obj); const c = box.getCenter(new THREE.Vector3());
  obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= box.min.y; obj.position.y += M.lift || 0;
  // spinning parts: re-pivot each matched node about its own bbox centre
  const parts = { props: [], rotors: [], nacelles: [], wings: null, gear: [], named: {} };
  root.updateMatrixWorld(true);
  for (const sp of M.spin || []) {
    const re = new RegExp(sp.match, 'i'); const hits = []; obj.traverse((n) => { if (re.test(n.name) && !hits.some((h) => isAncestor(h, n))) hits.push(n); });
    for (const n of hits) {
      const bb = new THREE.Box3().setFromObject(n); const ctr = bb.getCenter(new THREE.Vector3());
      const piv = new THREE.Group(); n.parent.add(piv); piv.position.copy(n.parent.worldToLocal(ctr.clone())); piv.attach(n);
      piv.userData = { kind: sp.kind || 'prop', axis: sp.axis || 'x', rps: sp.rps, dir: sp.dir || 1, spinParent: true };
      (sp.kind === 'rotor' ? parts.rotors : parts.props).push(piv);
    }
  }
  for (const [name, rx] of Object.entries(M.parts || {})) { const re = new RegExp(rx, 'i'); const list = []; obj.traverse((n) => { if (n.isMesh && re.test(n.name)) list.push(n); }); parts.named[name] = list; }
  root.userData.inner = inner; root.userData.parts = parts; root.userData.model = true; return root;
}
const isAncestor = (a, n) => { let p = n.parent; while (p) { if (p === a) return true; p = p.parent; } return false; };

// ------------------------------------------------------------------ public: make an aircraft instance for a shot
// def = aircraft/<id>.json from the project. state per shot: { props: rps|'off', gear: 'down'|'up', tilt: deg, stow: 0..1, fold: 0..1 }
export async function makeAircraft(def, base) {
  const root = def.model && def.model.file ? await buildFromModel(def, base) : buildProcedural(def);
  root.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  root.userData.def = def; root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root); root.userData.box = box;
  root.userData.anchors = { ...anchorsFrom(box, def), ...(root.userData.geoAnchors || {}) }; for (const [k, v] of Object.entries(def.anchors || {})) root.userData.anchors[k] = new THREE.Vector3(...v);
  return root;
}
export function anchorsFrom(box, def = {}) {
  const c = box.getCenter(new THREE.Vector3()), mn = box.min, mx = box.max; const A = {
    center: c.clone(), nose: new THREE.Vector3(mx.x, c.y, 0), tail: new THREE.Vector3(mn.x, c.y, 0), top: new THREE.Vector3(c.x, mx.y, 0), bottom: new THREE.Vector3(c.x, 0, 0),
    wingtipL: new THREE.Vector3(c.x, c.y, mx.z), wingtipR: new THREE.Vector3(c.x, c.y, mn.z), cockpit: new THREE.Vector3(mn.x + (mx.x - mn.x) * 0.82, mx.y * 0.55, 0),
    front: new THREE.Vector3(mx.x, 0, 0), back: new THREE.Vector3(mn.x, 0, 0), left: new THREE.Vector3(c.x, 0, mx.z), right: new THREE.Vector3(c.x, 0, mn.z),
  };
  for (const [k, v] of Object.entries(def.anchors || {})) A[k] = new THREE.Vector3(...v);
  return A;
}
// per-frame animation of spinning parts, nacelle tilt, wing stow, blade fold, gear
export function animateAircraft(root, t, st = {}) {
  const parts = root.userData.parts; if (!parts) return;
  const propRps = st.props === 'off' || st.props === 0 ? 0 : st.props ?? 0;
  const rotorRps = st.rotors === 'off' || st.rotors === 0 ? 0 : st.rotors ?? 0;
  const spinOne = (p, rps, isRotor) => {
    const dir = p.userData.dir || 1;
    // apparent speed: fast real rotation strobes at 30 fps, so show a slow apparent spin + a blur disc
    const apparent = rps > 0 ? (isRotor ? Math.min(rps, 1.35) : Math.min(rps, 0.9) + 0.3) : 0; const ang = dir * apparent * t * Math.PI * 2;
    if (p.userData.spinParent) { p.rotation[p.userData.axis || 'x'] = ang * (p.userData.kind === 'rotor' ? 1 : 3.1); }
    else if (p.userData.kind === 'prop') { p.rotation.x = ang * 3.1; }
    else if (p.userData.kind === 'rotor') { p.rotation.y = ang; }
    const disc = p.userData.disc; if (disc) disc.material.opacity = rps > 0 ? (isRotor ? 0.12 : 0.28) * clamp(rps / 5) : 0;
    if (p.userData.blades && !isRotor) p.userData.blades.forEach((b) => (b.visible = !(rps > 8)));
  };
  parts.props.forEach((p) => spinOne(p, st.propsRps ?? propRps, false));
  parts.rotors.forEach((p) => spinOne(p, p.userData.tail ? (rotorRps ? rotorRps * 4 : 0) : rotorRps, true));
  if (st.tilt != null) parts.nacelles.forEach((n) => { if (n.name?.startsWith('nacelle')) n.rotation.z = deg(st.tilt); });
  if (st.stow != null && parts.wings) parts.wings.rotation.y = -deg(90) * clamp(st.stow);
  if (st.fold != null) parts.rotors.forEach((r) => (r.userData.pivots || []).forEach((pv, i) => { if (i > 0) pv.userData.fold.rotation.y = (i === 1 ? -1 : 1) * deg(100) * clamp(st.fold); }));
  if (st.gear != null) parts.gear.forEach((g) => (g.visible = st.gear !== 'up'));
}
