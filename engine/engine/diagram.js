// diagram.js — marker-on-whiteboard / pencil-on-paper diagrams, animated by time. Virtual canvas 1600 x 900.
// Items (all take at = start time s, dur = draw-on time s):
//  text  {x,y,text,size,color,font:'hand'|'sans',align,rot}           line/arrow {pts:[[x,y]..],color,width,head}
//  circle {x,y,r,fill,stroke}   sector {x,y,r,from,to,fill}   rect {x,y,w,h,fill,stroke,radius}
//  icon {kind,x,y,size,rot,color}   rotor {x,y,r,blades,rps,color}   airflow {x,y,w,h,dir,color,count}
//  bars {x,y,w,h,title,items:[{label,value,color}],max,ticks}   dots {x,y,w,h,title,rows:[{label,icon,color,value}],perCol}
//  flow {from:[x,y],to:[{x,y,text}],color}   image {file,x,y,w,h}   counter {x,y,value,from,unit,size,color}
import { FONTS, range, easeOut, smooth, clamp, loadImage, dual } from './util.js';
import { drawIcon } from './icons.js';

export const INK = { black: '#232323', red: '#d8343c', blue: '#3d55c9', green: '#2f9a48', grey: '#8a8a8a', pink: '#f6c9c9', lightgreen: '#cdf3cf', yellow: '#f0c419' };
const ink = (c) => INK[c] || c || INK.black;

export async function preloadDiagram(items, base) { const imgs = {}; for (const it of items || []) if (it.type === 'image' && it.file) { try { imgs[it.file] = await loadImage(base + it.file); } catch (e) { imgs[it.file] = null; } } return imgs; }

export function drawDiagram(g, items, u, { W = 2048, H = 1152, imgs = {}, pencil = false } = {}) {
  const s = W / 1600; g.save(); g.scale(s, s); g.lineCap = 'round'; g.lineJoin = 'round';
  for (const it of items || []) {
    const at = it.at ?? 0, dur = it.dur ?? 0.6; if (u < at) continue; if (it.until != null && u > it.until) continue;
    const k = dur > 0 ? easeOut(range(u, at, at + dur)) : 1; const a = smooth(range(u, at, at + Math.min(0.25, dur || 0.25)));
    g.save(); g.globalAlpha = (it.alpha ?? 1) * (it.fade === false ? 1 : a);
    const font = (it.font === 'sans' ? FONTS.sans : FONTS.hand);
    const strokeW = (it.width || 4) * (pencil ? 0.8 : 1);
    switch (it.type) {
      case 'text': {
        const txt = String(it.text); const n = it.write === false ? txt.length : Math.ceil(txt.length * k);
        g.font = `${it.weight || 400} ${it.size || 40}px ${font}`; g.fillStyle = ink(it.color); g.textAlign = it.align || 'center'; g.textBaseline = 'middle';
        g.translate(it.x, it.y); if (it.rot) g.rotate((it.rot * Math.PI) / 180);
        txt.slice(0, n).split('\n').forEach((l, i) => g.fillText(l, 0, i * (it.size || 40) * 1.15)); break; }
      case 'line': case 'arrow': {
        const P = it.pts; let L = 0; const seg = []; for (let i = 1; i < P.length; i++) { const d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); seg.push(d); L += d; }
        let rem = L * k; g.strokeStyle = ink(it.color); g.lineWidth = strokeW; if (it.dash) g.setLineDash(it.dash); g.beginPath(); g.moveTo(...P[0]); let end = P[0], dir = [1, 0];
        for (let i = 1; i < P.length && rem > 0; i++) { const f = Math.min(1, rem / seg[i - 1]); end = [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f]; dir = [P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]]; g.lineTo(...end); rem -= seg[i - 1]; }
        g.stroke(); g.setLineDash([]);
        if ((it.type === 'arrow' || it.head) && k > 0.05) { const an = Math.atan2(dir[1], dir[0]); const hs = it.headSize || strokeW * 4 + 6; g.fillStyle = ink(it.color); g.beginPath(); g.moveTo(end[0] + Math.cos(an) * hs * 0.3, end[1] + Math.sin(an) * hs * 0.3); g.lineTo(end[0] - Math.cos(an - 0.45) * hs, end[1] - Math.sin(an - 0.45) * hs); g.lineTo(end[0] - Math.cos(an + 0.45) * hs, end[1] - Math.sin(an + 0.45) * hs); g.closePath(); g.fill(); }
        break; }
      case 'circle': { g.beginPath(); g.arc(it.x, it.y, it.r * (it.grow === false ? 1 : k), 0, Math.PI * 2); if (it.fill) { g.fillStyle = ink(it.fill); g.fill(); } if (it.stroke) { g.strokeStyle = ink(it.stroke); g.lineWidth = strokeW; g.stroke(); } break; }
      case 'sector': { const f = ((it.from ?? 0) - 90) * Math.PI / 180, t = ((it.to ?? 180) - 90) * Math.PI / 180; g.beginPath(); g.moveTo(it.x, it.y); g.arc(it.x, it.y, it.r, f, f + (t - f) * k); g.closePath(); g.fillStyle = ink(it.fill || 'pink'); g.fill(); break; }
      case 'rect': { g.beginPath(); g.roundRect(it.x, it.y, it.w * (it.grow ? k : 1), it.h, it.radius || 0); if (it.fill) { g.fillStyle = ink(it.fill); g.fill(); } if (it.stroke !== false) { g.strokeStyle = ink(it.stroke || 'black'); g.lineWidth = strokeW; g.stroke(); } break; }
      case 'icon': { const sz = (it.size || 200) * (it.pop ? 0.7 + 0.3 * k : 1), rot = ((it.rot || 0) * Math.PI) / 180;
        if (it.outline !== false && (it.fill || it.outline)) { const o = it.outlineWidth || 4; for (const [dx, dy] of [[o, 0], [-o, 0], [0, o], [0, -o], [o * 0.7, o * 0.7], [-o * 0.7, o * 0.7], [o * 0.7, -o * 0.7], [-o * 0.7, -o * 0.7]]) drawIcon(g, it.kind || 'prop', it.x + dx, it.y + dy, sz, ink(it.outline || 'black'), rot); }
        drawIcon(g, it.kind || 'prop', it.x, it.y, sz, it.fill ? ink(it.fill) : ink(it.color), rot); break; }
      case 'rotor': { const ang = (u - at) * (it.rps ?? 0.25) * Math.PI * 2 + ((it.phase || 0) * Math.PI) / 180; g.translate(it.x, it.y); g.rotate(ang); g.fillStyle = ink(it.color || '#3a3a3a'); const n = it.blades || 2; for (let i = 0; i < n; i++) { g.save(); g.rotate((i / n) * Math.PI * 2); g.beginPath(); g.roundRect(-it.r * 0.03, -it.r, it.r * 0.06, it.r, it.r * 0.02); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 2; g.stroke(); g.restore(); } g.beginPath(); g.arc(0, 0, it.r * 0.07, 0, Math.PI * 2); g.fillStyle = '#222'; g.fill(); break; }
      case 'airflow': { // falling / moving thin arrows
        const n = it.count || 8; g.strokeStyle = ink(it.color || 'black'); g.lineWidth = 2; const dirY = it.dir === 'up' ? -1 : 1;
        for (let i = 0; i < n; i++) { const x = it.x + (it.w * (i + 0.5)) / n; const ph = ((u - at) * (it.speed ?? 0.6) + i * 0.37) % 1; const y0 = it.y + ((dirY > 0 ? ph : 1 - ph) * it.h); const len = it.len || 120; g.globalAlpha = a * Math.sin(Math.PI * ph); g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + dirY * len); g.stroke(); g.beginPath(); g.moveTo(x, y0 + dirY * len); g.lineTo(x - 6, y0 + dirY * (len - 12)); g.moveTo(x, y0 + dirY * len); g.lineTo(x + 6, y0 + dirY * (len - 12)); g.stroke(); }
        break; }
      case 'bars': { // horizontal bar chart, hand-drawn axes, bars grow in order
        const { x, y, w, h } = it; const items = it.items || []; const max = it.max || Math.max(...items.map((b) => b.value)) * 1.15; const lx = x + (it.labelW || 230);
        g.font = `400 ${it.size || 38}px ${font}`; g.fillStyle = INK.black; g.textBaseline = 'middle';
        if (it.title) { g.textAlign = 'center'; g.font = `400 ${(it.size || 38) * 1.2}px ${font}`; g.fillText(it.title, x + w / 2, y - 60); g.font = `400 ${it.size || 38}px ${font}`; }
        g.strokeStyle = INK.black; g.lineWidth = 3; const axisK = smooth(range(u, at, at + 0.4)); g.beginPath(); g.moveTo(lx, y + h); g.lineTo(lx, y + h - (h + 30) * axisK); g.moveTo(lx, y + h); g.lineTo(lx + (w - (lx - x)) * axisK, y + h); g.stroke();
        (it.ticks || []).forEach((t) => { const tx = lx + ((w - (lx - x) - 30) * t) / max; g.textAlign = 'center'; g.font = `400 ${(it.size || 38) * 0.75}px ${font}`; g.fillText(String(t), tx, y + h + 34); g.beginPath(); g.moveTo(tx, y + h - 8); g.lineTo(tx, y + h + 8); g.stroke(); });
        const bh = (h / Math.max(1, items.length)) * 0.42;
        items.forEach((b, i) => { const by = y + (h * (i + 0.5)) / items.length; g.textAlign = 'right'; g.font = `400 ${it.size || 38}px ${font}`; g.fillStyle = INK.black; g.fillText(b.label, lx - 24, by); const kb = easeOut(range(u, at + 0.4 + i * (it.stagger ?? 0.5), at + 0.4 + i * (it.stagger ?? 0.5) + (it.grow ?? 1.0))); const bw = ((w - (lx - x) - 30) * b.value * kb) / max; if (bw > 0) { g.fillStyle = ink(b.color || '#d9d9d9'); g.fillRect(lx, by - bh / 2, bw, bh); g.strokeStyle = INK.black; g.lineWidth = 2; g.strokeRect(lx, by - bh / 2, bw, bh); } if (b.show && kb > 0.95) { g.textAlign = 'left'; g.fillStyle = ink(b.color === '#d9d9d9' ? 'black' : b.color || 'black'); g.fillText(b.show, lx + bw + 14, by); } });
        break; }
      case 'dots': { // pictogram table: icon | dots | number (AIRCRAFT ORDERS)
        const { x, y, w, h } = it; const rows = it.rows || []; const rh = h / rows.length; const iw = it.iconW || 240;
        if (it.title) { g.font = `400 ${(it.size || 40) * 1.25}px ${font}`; g.fillStyle = INK.black; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(it.title, x + 10, y - 45); }
        g.strokeStyle = INK.black; g.lineWidth = 4;
        rows.forEach((r, i) => { const ry = y + i * rh; g.strokeRect(x, ry, iw, rh); g.strokeRect(x + iw + 6, ry, w - iw - 6, rh);
          drawIcon(g, r.icon || 'twin', x + iw / 2, ry + rh * 0.4, rh * 0.62, ink(r.color), 0); g.fillStyle = INK.black; g.textAlign = 'center'; g.font = `400 ${it.size || 34}px ${font}`; g.fillText(r.label, x + iw / 2, ry + rh * 0.86);
          const kd = range(u, at + 0.3 + i * (it.stagger ?? 0.8), at + 0.3 + i * (it.stagger ?? 0.8) + (it.grow ?? 1.4)); const n = Math.floor(r.value * kd); const per = it.perCol || 10; const dr = Math.min(rh / (per + 1) * 0.42, 11); const gap = dr * 2.45;
          g.fillStyle = ink(r.color); for (let d = 0; d < n; d++) { const col = Math.floor(d / per), row = d % per; g.beginPath(); g.arc(x + iw + 30 + col * gap, ry + (rh - (per - 1) * gap) / 2 + row * gap, dr, 0, Math.PI * 2); g.fill(); }
          if (kd > 0) { g.font = `400 ${(it.size || 34) * 1.5}px ${font}`; g.textAlign = 'right'; g.fillText(String(n), x + w - 18, ry + rh * 0.75); } });
        break; }
      case 'flow': { const [fx, fy] = it.from; (it.to || []).forEach((t, i) => { const ki = range(u, at + i * (it.stagger ?? 0.35), at + i * (it.stagger ?? 0.35) + 0.5); if (ki <= 0) return; const cx = fx + (t.x - fx) * 0.45; g.strokeStyle = ink(it.color); g.lineWidth = 3; g.beginPath(); g.moveTo(fx, fy); const ex = fx + (t.x - fx) * ki, ey = fy + (t.y - fy) * ki; g.bezierCurveTo(cx, fy, cx, t.y, ex, ey); g.stroke(); if (ki > 0.95) { g.fillStyle = ink(it.color); g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(t.x - 16, t.y - 8); g.lineTo(t.x - 16, t.y + 8); g.closePath(); g.fill(); g.font = `400 ${it.size || 38}px ${FONTS.sans}`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(t.text, t.x + 12, t.y); } }); break; }
      case 'image': { const im = imgs[it.file]; if (im) g.drawImage(im, it.x, it.y, it.w, it.h); break; }
      case 'counter': { const v = (it.from ?? 0) + (it.value - (it.from ?? 0)) * k; g.font = `${it.weight || 400} ${it.size || 60}px ${font}`; g.fillStyle = ink(it.color); g.textAlign = it.align || 'center'; g.textBaseline = 'middle'; g.fillText(it.unit ? dual(Math.round(v), it.unit, it) : Math.round(v).toLocaleString('en-US') + (it.suffix || ''), it.x, it.y); break; }
    }
    g.restore();
  }
  g.restore();
}
