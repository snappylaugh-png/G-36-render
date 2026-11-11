// icons.js — flat top-view aircraft silhouettes (map route icons, diagram tables) drawn on a 2D canvas, nose pointing UP.
export const ICON_KINDS = ['prop', 'fighter', 'twin', 'airliner', 'jet', 'bomber', 'helicopter', 'tiltrotor', 'ship', 'trimotor', 'twinboom'];
export function drawIcon(g, kind, cx, cy, s, color = '#1b1b1b', rot = 0) {
  g.save(); g.translate(cx, cy); g.rotate(rot); g.fillStyle = color; g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round';
  const fus = (len, w, noseY = -len / 2) => { g.beginPath(); g.ellipse(0, noseY + len / 2, w / 2, len / 2, 0, 0, Math.PI * 2); g.fill(); };
  const wing = (span, chordRoot, chordTip, y, sweep = 0) => { g.beginPath(); g.moveTo(-span / 2, y + sweep); g.lineTo(-chordRoot * 0.3, y); g.lineTo(chordRoot * 0.3, y); g.lineTo(span / 2, y + sweep); g.lineTo(span / 2, y + sweep + chordTip); g.lineTo(0, y + chordRoot); g.lineTo(-span / 2, y + sweep + chordTip); g.closePath(); g.fill(); };
  const k = s;
  switch (kind) {
    case 'helicopter': fus(k * 0.55, k * 0.2, -k * 0.35); g.fillRect(-k * 0.035, 0, k * 0.07, k * 0.55); g.fillRect(-k * 0.12, k * 0.5, k * 0.24, k * 0.05); g.lineWidth = k * 0.035; for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.3; g.beginPath(); g.moveTo(0, -k * 0.1); g.lineTo(Math.cos(a) * k * 0.5, -k * 0.1 + Math.sin(a) * k * 0.5); g.stroke(); } break;
    case 'tiltrotor': fus(k * 0.9, k * 0.16); g.fillRect(-k * 0.42, -k * 0.08, k * 0.84, k * 0.1); g.fillRect(-k * 0.2, k * 0.36, k * 0.4, k * 0.06); g.lineWidth = k * 0.03; for (const sx of [-1, 1]) { g.fillRect(sx * k * 0.42 - k * 0.04, -k * 0.18, k * 0.08, k * 0.24); for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 - 1.2; g.beginPath(); g.moveTo(sx * k * 0.42, -k * 0.18); g.lineTo(sx * k * 0.42 + Math.cos(a) * k * 0.32, -k * 0.18 + Math.sin(a) * k * 0.32); g.stroke(); } } break;
    case 'jet': fus(k * 0.95, k * 0.12); wing(k * 0.75, k * 0.38, k * 0.1, -k * 0.02, k * 0.24); wing(k * 0.32, k * 0.14, k * 0.05, k * 0.33, k * 0.08); break;
    case 'fighter': fus(k * 0.9, k * 0.14); wing(k * 0.95, k * 0.24, k * 0.12, -k * 0.12, k * 0.02); wing(k * 0.36, k * 0.12, k * 0.07, k * 0.34, 0); g.fillRect(-k * 0.2, -k * 0.47, k * 0.4, k * 0.025); break;
    case 'twinboom': for (const sx of [-1, 1]) { g.save(); g.translate(sx * k * 0.2, 0); fus(k * 0.85, k * 0.11); g.restore(); g.fillRect(sx * k * 0.2 - k * 0.15, -k * 0.44, k * 0.3, k * 0.02); } wing(k * 1.0, k * 0.22, k * 0.11, -k * 0.12, 0.0); g.fillRect(-k * 0.24, k * 0.34, k * 0.48, k * 0.07); break;
    case 'twin': case 'airliner': fus(k * 0.92, k * 0.12); wing(k * 1.0, k * 0.24, k * 0.08, -k * 0.08, k * 0.06); wing(k * 0.34, k * 0.12, k * 0.06, k * 0.36, k * 0.02); for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * k * 0.2, -k * 0.1, k * 0.045, k * 0.13, 0, 0, Math.PI * 2); g.fill(); } break;
    case 'trimotor': fus(k * 0.8, k * 0.14); wing(k * 1.05, k * 0.2, k * 0.14, -k * 0.12, 0); wing(k * 0.34, k * 0.1, k * 0.08, k * 0.3, 0); for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * k * 0.22, -k * 0.16, k * 0.05, k * 0.09, 0, 0, Math.PI * 2); g.fill(); } break;
    case 'bomber': fus(k * 0.85, k * 0.11); wing(k * 1.1, k * 0.2, k * 0.07, -k * 0.08, k * 0.03); wing(k * 0.36, k * 0.11, k * 0.06, k * 0.33, 0); for (const x of [-0.36, -0.2, 0.2, 0.36]) { g.beginPath(); g.ellipse(x * k, -k * 0.1, k * 0.035, k * 0.1, 0, 0, Math.PI * 2); g.fill(); } break;
    case 'ship': g.beginPath(); g.moveTo(0, -k * 0.5); g.quadraticCurveTo(k * 0.13, -k * 0.2, k * 0.12, k * 0.45); g.lineTo(-k * 0.12, k * 0.45); g.quadraticCurveTo(-k * 0.13, -k * 0.2, 0, -k * 0.5); g.fill(); break;
    case 'prop': default: fus(k * 0.78, k * 0.13); wing(k * 1.0, k * 0.2, k * 0.12, -k * 0.1, 0.01 * k); wing(k * 0.36, k * 0.11, k * 0.07, k * 0.28, 0); g.fillRect(-k * 0.15, -k * 0.42, k * 0.3, k * 0.02); break;
  }
  g.restore();
}
