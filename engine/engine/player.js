// player.js — boots a project in the browser: config, shot plan, aircraft, fonts; exposes renderFrame(f) for render.mjs.
import { Engine } from './core.js';
import './studio.js';
import './flight.js';
import './maps.js';
import './board.js';
import './desk.js';
import './cockpit.js';
import './thumb.js';

const j = async (u, d) => { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) { if (d !== undefined) return d; throw new Error(`missing ${u}`); } return r.json(); };

export async function boot() {
  const qs = new URLSearchParams(location.search);
  const base = '/project/';
  const cfg = await j(base + 'config.json');
  const plan = await j(base + (qs.get('plan') || cfg.plan || 'plan/shots.json'));
  const shots = (plan.shots || plan).filter((s) => !s.skip);
  const list = await j('/__list?dir=aircraft', []);
  cfg.aircraftDefs = {};
  for (const f of list.filter((n) => n.endsWith('.json'))) { const d = await j(base + 'aircraft/' + f); d.id ||= f.replace(/\.json$/, ''); cfg.aircraftDefs[d.id] = d; }
  // a single-model check page: ?model=<id> renders a turntable with axes
  const scale = +(qs.get('scale') || 1); const [w0, h0] = (qs.get('size') || cfg.size || '1920x1080').split('x').map(Number);
  const OW = Math.round((w0 * scale) / 2) * 2, OH = Math.round((h0 * scale) / 2) * 2;   // output frame size
  cfg.quality = qs.get('quality') || cfg.quality || 'standard'; if (cfg.quality === 'draft') cfg.msaa = 0;
  // quality 'high' = supersampling: every frame is rendered larger (2x for 1080p / 1440p, capped at 2880 px tall) and scaled down,
  // which smooths every edge, thin propeller blades, struts, wires and shiny highlights that multisampling alone leaves jagged.
  const ss = +(qs.get('ss') || (cfg.quality === 'high' ? Math.max(1, Math.min(2, 2880 / OH)) : 1));
  if (ss > 1 && cfg.msaa == null) cfg.msaa = ss >= 2 ? 2 : 4;
  const W = Math.round((OW * ss) / 2) * 2, H = Math.round((OH * ss) / 2) * 2;
  await document.fonts.load('400 40px "Patrick Hand"'); await Promise.all(['400 20px "Open Sans"', '600 20px "Open Sans"', '700 20px "Open Sans"', 'italic 700 20px "Open Sans"', '800 20px "Open Sans"', '400 20px "Fira Sans Condensed"', 'italic 400 20px "Fira Sans Condensed"', '500 20px "Fira Sans Condensed"', '600 20px "Fira Sans Condensed"', '300 20px Montserrat', '400 20px Montserrat'].map((f) => document.fonts.load(f)));
  const canvas = document.getElementById('c'); canvas.width = W; canvas.height = H; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const fps = cfg.fps || 30;
  const E = new Engine({ canvas, W, H, fps, cfg, base }); E.setShots(shots);
  const end = Math.max(...shots.map((s) => s.end)); window.TOTAL_FRAMES = Math.round(end * fps);
  window.SHOT_LIST = E.shots.map((s) => ({ id: s.id, start: s.start, end: s.end, type: s.type, ok: true }));
  window.OUT = [OW, OH]; window.SS = ss; window.ENGINE = E; window.ERRORS = E.errors;
  let out = canvas;
  if (W !== OW || H !== OH) {   // scale the big frame down into the output canvas (high-quality filtering)
    out = document.createElement('canvas'); out.id = 'o'; out.width = OW; out.height = OH; document.body.appendChild(out);
    canvas.style.display = 'none';
  }
  const octx = out !== canvas ? out.getContext('2d', { alpha: false }) : null;
  window.FRAME_CANVAS = out;
  window.renderFrame = async (f) => {
    await E.renderFrame(f);
    if (octx) { octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high'; octx.drawImage(canvas, 0, 0, OW, OH); }
  };
  window.READY = true;
}
