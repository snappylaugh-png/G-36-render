// render.mjs — deterministic frame renderer (headless Chromium -> ffmpeg) for Hangar Studio projects.
//   node render.mjs --project projects/my-video                         full video -> build/video_silent.mp4
//   node render.mjs --project P --from 30 --to 45 --scale 0.5            preview a time range -> build/preview.mp4 (with narration)
//   node render.mjs --project P --shots s012,s013 --scale 0.5            preview just these shots
//   node render.mjs --project P --sheet [--scale 0.4] [--at 0.55]        one still per shot -> build/sheets/sheet_XX.png
//   node render.mjs --project P --stills 3.5,12,40                       stills at times -> build/stills/
//   node render.mjs --project P --shots s042 --patch                     re-render shots and splice them into build/video_silent.mp4
//   node render.mjs --project P --thumbs                                 thumbnails: every shot of plan/thumbs.json -> out/thumbnails/<id>.png (1280x720)
// Options: --quality draft|standard|high  --size 1920x1080|2560x1440|3840x2160  --workers N  --scale K  --gl auto|gpu|swiftshader
//          --browser chromium|msedge|chrome  --crf 18  --preset medium  --out FILE  --plan plan/other.json  --fresh  --allow-lowres
// Quality: draft = previews only (no anti-aliasing / bloom / depth of field); standard = 4x multisampling; high = supersampling
// (each frame rendered at 2x and scaled down: the cleanest edges; ~3-4x the work, made for a graphics card).
// Full renders are resumable: they are cut into 10-second pieces in build/parts; run the same command again to continue.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = {}; { const a = process.argv.slice(2); for (let i = 0; i < a.length; i++) { if (a[i].startsWith('--')) { const k = a[i].slice(2); const v = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; args[k] = v; } } }
if (!args.project) { console.log('usage: node render.mjs --project projects/<name> [--sheet | --stills t1,t2 | --from A --to B | --shots ids] [--scale 0.5] [--quality draft]'); process.exit(args.help ? 0 : 1); }
const PROJECT = path.resolve(args.project);
if (!fs.existsSync(path.join(PROJECT, 'config.json'))) { console.error(`no project at ${PROJECT} (config.json missing) — create it with py/new_project.py`); process.exit(1); }
const BUILD = path.join(PROJECT, 'build'); fs.mkdirSync(BUILD, { recursive: true });
const projPath = (p) => (path.isAbsolute(p) ? p : path.join(PROJECT, p));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.fbx': 'application/octet-stream', '.obj': 'text/plain', '.mtl': 'text/plain', '.wasm': 'application/wasm', '.ktx2': 'image/ktx2' };
const server = http.createServer((req, res) => {
  const [rawPath, query] = req.url.split('?'); const url = decodeURIComponent(rawPath);
  if (url === '/__list') { const dir = new URLSearchParams(query).get('dir') || ''; const d = path.join(PROJECT, dir); const out = fs.existsSync(d) ? fs.readdirSync(d) : []; res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(out)); }
  const p = url.startsWith('/project/') ? path.join(PROJECT, url.slice(9)) : path.join(ROOT, url);
  const ok = (p.startsWith(ROOT) || p.startsWith(PROJECT)) && fs.existsSync(p) && !fs.statSync(p).isDirectory();
  if (!ok) { res.writeHead(404); return res.end(); }
  if (req.method === 'HEAD') { res.writeHead(200); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(p).pipe(res);
}).listen(0);
const PORT = server.address().port;
const gl = args.gl || (process.platform === 'linux' ? 'swiftshader' : 'auto');
const ANGLE = gl === 'swiftshader' ? ['--use-angle=swiftshader'] : process.platform === 'win32' ? ['--use-angle=d3d11'] : process.platform === 'darwin' ? ['--use-angle=metal'] : ['--use-angle=default'];
const LAUNCH = { args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--use-gl=angle', ...ANGLE, ...(gl !== 'swiftshader' ? ['--enable-gpu', '--enable-gpu-rasterization'] : [])] };
// browser: the bundled Chromium, or the computer's own Edge / Chrome (on Windows Edge is always there, so nothing to download)
const BROWSER = args.browser || (process.platform === 'win32' ? 'msedge' : 'chromium');
async function launch() {
  if (BROWSER !== 'chromium') { try { return await chromium.launch({ ...LAUNCH, channel: BROWSER }); } catch (e) { if (!launch.warned) { console.log(`(${BROWSER} could not start: ${String(e.message).split('\n')[0]} — using the bundled Chromium)`); launch.warned = true; } } }
  try { return await chromium.launch(LAUNCH); }
  catch (e) { if (/Executable doesn't exist|npx playwright install/i.test(e.message)) throw new Error(`no browser to render with. Run once in ${ROOT}:  npx playwright install chromium`); throw e; }
}
const CFG = JSON.parse(fs.readFileSync(path.join(PROJECT, 'config.json'), 'utf8'));
const FPS = CFG.fps || 30;
// the channel name and logo are required: they are painted on the hangar wall in every hangar / title shot
{ const B = CFG.brand || {}; const fix = `python <kit>/py/brand.py "${PROJECT}" --logo <path to your logo>  plus one of  --name "Your Channel" | --random-name | --no-name`;
  const mode = B.nameMode || (String(B.name || '').trim() ? 'own' : null);
  const bad = !mode ? 'no name option chosen for the hangar wall (your channel name, a random name, or no name)' : mode !== 'none' && !String(B.name || '').trim() ? 'name missing for the hangar wall'
    : !B.logo ? 'no channel logo' : !fs.existsSync(path.join(PROJECT, B.logo)) ? `channel logo file missing (${B.logo})` : null;
  if (bad) { console.error(`STOP: ${bad}. Every video carries your own logo on the hangar wall, with your channel name, a random name or no name.\nFix:  ${fix}`); process.exit(2); } }
// a patch must match the video it is spliced into (size and quality of the last full render)
if (args.patch) { try { const ri = JSON.parse(fs.readFileSync(path.join(BUILD, 'render_info.json'), 'utf8')); args.size ||= `${ri.width}x${ri.height}`; args.quality ||= ri.quality; } catch {} }
if (args.thumbs) { args.plan ||= 'plan/thumbs.json'; args.size ||= '1280x720'; args.format = 'png'; args.out ||= 'out/thumbnails'; }
const FORMAT = args.format === 'png' ? 'png' : 'jpeg';

async function openPlayer(browser) {
  const qs = new URLSearchParams(); for (const k of ['scale', 'quality', 'plan', 'size', 'ss']) if (args[k]) qs.set(k, args[k]);
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => { const t = m.text(); if (/ERROR|missing|unknown|failed/i.test(t)) console.log('[page]', t.slice(0, 400)); });
  await page.goto(`http://localhost:${PORT}/player.html?${qs}`);
  await page.waitForFunction('window.READY === true || !!window.BOOT_ERROR', null, { timeout: 180000 });
  const boot = await page.evaluate('window.BOOT_ERROR'); if (boot) throw new Error('Player failed to boot: ' + boot);
  const [w, h] = await page.evaluate('window.OUT'); await page.setViewportSize({ width: w, height: h });
  return page;
}
async function gpuInfo(page) { return page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const e = c && c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; }); }
let JPEG_Q = 0.93;   // previews; full renders use 0.97 so the frames going into the encoder are clean
const grab = async (page, f) => { await page.evaluate((i) => window.renderFrame(i), f); const b64 = await page.evaluate(([fmt, q]) => (window.FRAME_CANVAS || document.getElementById('c')).toDataURL(fmt === 'png' ? 'image/png' : 'image/jpeg', q).split(',')[1], [FORMAT, JPEG_Q]); return Buffer.from(b64, 'base64'); };
const fmtT = (s) => `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s`;
const KIDS = new Set();   // running ffmpeg encoders: killed on failure / Ctrl+C so the renderer always exits
const stopAll = (code) => { for (const k of KIDS) { try { k.kill('SIGKILL'); } catch {} } KIDS.clear(); try { server.close(); } catch {} process.exit(code); };
process.on('SIGINT', () => { console.log('\nStopped. Finished 10-second pieces are kept: run the same command again to continue.'); stopAll(130); });
process.on('SIGTERM', () => stopAll(143));
const run = (bin, a) => new Promise((res, rej) => spawn(bin, a, { stdio: 'inherit' }).on('close', (c) => (c ? rej(new Error(bin + ' failed')) : res())));

async function renderVideo() {
  const b0 = await launch(); const p0 = await openPlayer(b0);
  const total = await p0.evaluate('window.TOTAL_FRAMES'); const list = await p0.evaluate('window.SHOT_LIST');
  const [OW, OH] = await p0.evaluate('window.OUT'); const SS = await p0.evaluate('window.SS');
  const gpu = await gpuInfo(p0); const soft = /swiftshader|llvmpipe|software/i.test(gpu);
  console.log(`GPU: ${gpu}${soft ? (gl === 'gpu' || process.platform !== 'linux' ? '  (the graphics card was NOT used: update its driver, or try --browser chrome / --browser chromium)' : '  (software rendering: slow — rendering on a graphics card is many times faster)') : ''}`);
  await b0.close();
  let f0 = Math.max(0, Math.round((+args.from || 0) * FPS)), f1 = Math.min(total, args.to ? Math.round(+args.to * FPS) : total);
  if (args.shots) { const ids = String(args.shots).split(','); const sel = list.filter((s) => ids.includes(s.id)); if (!sel.length) throw new Error('no such shots: ' + args.shots); f0 = Math.round(Math.min(...sel.map((s) => s.start)) * FPS); f1 = Math.round(Math.max(...sel.map((s) => s.end)) * FPS); }
  if (args.patch && !fs.existsSync(path.join(BUILD, 'video_silent.mp4'))) throw new Error('--patch needs an existing build/video_silent.mp4');
  // --parts 37 | 37-39 | 37,40,42 : render only those 10-second pieces (global indices),
  // at full quality, into build/parts_gh/ named part_XXXX.mp4 with the global index.
  // No final video, no voiceover: the pieces drop straight into build/parts/ on the
  // machine that stitches the full video. Resumable: finished pieces are skipped.
  const SEG = Math.max(30, Math.round(+(args.segment || 10) * FPS));
  let partSel = null;
  if (args.parts) {
    partSel = [];
    for (const tok of String(args.parts).split(',')) {
      const m = tok.trim().match(/^(\d+)(?:-(\d+))?$/);
      if (!m) throw new Error('--parts takes segment numbers like 37, 37-39, or 37,40,42');
      const a = +m[1], b = m[2] ? +m[2] : a;
      if (b < a) throw new Error(`--parts range ${tok} is backwards`);
      for (let i = a; i <= b; i++) partSel.push(i);
    }
    partSel = [...new Set(partSel)].sort((x, y) => x - y);
    const nSegs = Math.ceil(total / SEG);
    if (partSel[partSel.length - 1] >= nSegs) throw new Error(`--parts segment ${partSel[partSel.length - 1]} is past the end of the video (${nSegs} segments)`);
  }
  const isPreview = (args.from || args.to || args.shots) && !args.patch && !partSel;
  const quality = args.quality || CFG.quality || 'standard'; const scale = +(args.scale || 1);
  // the finished video is never rendered at preview settings (that is what made earlier videos soft and jagged)
  if (!isPreview && (quality === 'draft' || scale < 1) && !args['allow-lowres']) {
    console.error(`STOP: a full render at ${quality === 'draft' ? 'draft quality (no anti-aliasing)' : `scale ${scale} (${OW}x${OH})`} would make a soft, jagged video.\n` +
      `Render the finished video at full size with --quality standard or high (high is best and is made for a graphics card).\n` +
      `Use --allow-lowres only for a deliberate low-resolution test.`); process.exit(2);
  }
  if (!isPreview) JPEG_Q = 0.97;
  const defW = soft ? Math.max(1, Math.min(3, Math.floor(os.cpus().length / 4))) : Math.max(1, Math.min(4, Math.floor(os.cpus().length / 3)));
  // work list: 10-second pieces; a full render keeps finished pieces, so running the same command again continues where it stopped
  const segs = partSel ? partSel.map((i) => [i * SEG, Math.min(total, (i + 1) * SEG)]) : (() => { const s = []; for (let a = f0; a < f1; a += SEG) s.push([a, Math.min(f1, a + SEG)]); return s; })();
  const W = Math.max(1, Math.min(+(args.workers || defW), segs.length));
  const partsDir = path.join(BUILD, partSel ? 'parts_gh' : isPreview || args.patch ? 'parts_preview' : 'parts');
  const sig = { f0, f1, SEG, OW, OH, SS, quality, fps: FPS, plan: args.plan || CFG.plan || 'plan/shots.json', planMtime: (() => { try { return fs.statSync(projPath(args.plan || CFG.plan || 'plan/shots.json')).mtimeMs; } catch { return 0; } })(), ...(partSel ? { parts: partSel } : {}) };
  const sigFile = path.join(partsDir, 'render.json');
  const same = !args.fresh && !isPreview && !args.patch && fs.existsSync(sigFile) && JSON.stringify(JSON.parse(fs.readFileSync(sigFile, 'utf8'))) === JSON.stringify(sig);
  if (!same) { fs.rmSync(partsDir, { recursive: true, force: true }); fs.mkdirSync(partsDir, { recursive: true }); fs.writeFileSync(sigFile, JSON.stringify(sig)); }
  const partName = (i) => path.join(partsDir, `part_${String(partSel ? partSel[i] : i).padStart(4, '0')}.mp4`);
  const todo = segs.map((_, i) => i).filter((i) => !fs.existsSync(partName(i)));
  const skipped = segs.length - todo.length; const todoFrames = todo.reduce((n, i) => n + segs[i][1] - segs[i][0], 0);
  const skippedFrames = segs.reduce((n, s) => n + s[1] - s[0], 0) - todoFrames;
  let done = 0; const t0 = Date.now(); const errs = new Set();
  console.log(`Rendering ${OW}x${OH}${SS > 1 ? ` (supersampled from ${Math.round(OW * SS)}x${Math.round(OH * SS)})` : ''}, ${quality} quality: frames ${f0}-${f1} (${((f1 - f0) / FPS).toFixed(1)} s at ${FPS} fps) with ${Math.min(W, Math.max(1, todo.length))} worker(s)…` +
    (skipped ? `\n  continuing: ${skipped} of ${segs.length} pieces already done` : ''));
  const queue = todo.slice();
  const work = async () => {
    if (!queue.length) return;
    const browser = await launch(); const page = await openPlayer(browser);
    while (queue.length) {
      const i = queue.shift(); const [a, b] = segs[i]; const out = partName(i), tmp = out.replace(/\.mp4$/, '.tmp.mp4');
      const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', args.preset || 'medium', '-crf', String(args.crf || (quality === 'high' ? 16 : 18)), '-pix_fmt', 'yuv420p', '-r', String(FPS), tmp], { stdio: ['pipe', 'inherit', 'inherit'] });
      KIDS.add(ff); ff.on('close', () => KIDS.delete(ff)); ff.stdin.on('error', () => {});
      for (let f = a; f < b; f++) {
        const img = await grab(page, f); if (!ff.stdin.write(img)) await new Promise((r) => ff.stdin.once('drain', r)); done++;
        if (done % 60 === 0) { const el = (Date.now() - t0) / 1000, eta = (el / done) * (todoFrames - done); console.log(`  ${done + skippedFrames}/${skippedFrames + todoFrames} frames  ${(done / el).toFixed(2)} fps  elapsed ${fmtT(el)}  eta ${fmtT(eta)}`); }
      }
      ff.stdin.end(); const code = await new Promise((r) => ff.on('close', r)); if (code) throw new Error('ffmpeg failed on piece ' + i);
      fs.renameSync(tmp, out);
    }
    (await page.evaluate('window.ERRORS')).forEach((e) => errs.add(e));
    await browser.close();
  };
  await Promise.all([...Array(W)].map(() => work()));
  if (partSel) {
    if (errs.size) { console.log(`\n${errs.size} shot error(s):`); [...errs].slice(0, 40).forEach((e) => console.log('  ' + e)); }
    console.log(`\nDone: ${segs.length} piece(s) in ${partsDir}  (${fmtT((Date.now() - t0) / 1000)})`);
    return;
  }
  const parts = segs.map((_, i) => partName(i));
  const lst = path.join(partsDir, 'list.txt'); fs.writeFileSync(lst, parts.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
  const out = args.patch ? path.join(BUILD, 'patch.mp4') : args.out ? projPath(args.out) : path.join(BUILD, isPreview ? 'preview.mp4' : 'video_silent.mp4');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', out]);
  const vo = CFG.voiceover && path.join(PROJECT, CFG.voiceover);
  if (isPreview && vo && fs.existsSync(vo)) { const withA = out.replace(/\.mp4$/, '_vo.mp4'); await run('ffmpeg', ['-y', '-v', 'error', '-i', out, '-ss', (f0 / FPS).toFixed(3), '-t', ((f1 - f0) / FPS).toFixed(3), '-i', vo, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', withA]); if (fs.existsSync(withA)) fs.renameSync(withA, out); }
  if (args.patch) {
    const full = path.join(BUILD, 'video_silent.mp4'), bak = path.join(BUILD, 'video_silent_prev.mp4'), tmp = path.join(BUILD, 'video_silent_patched.mp4');
    fs.copyFileSync(full, bak); const segs = []; let fc = '';
    if (f0 > 0) { fc += `[0:v]trim=start_frame=0:end_frame=${f0},setpts=PTS-STARTPTS[a];`; segs.push('[a]'); }
    fc += '[1:v]setpts=PTS-STARTPTS[b];'; segs.push('[b]');
    if (f1 < total) { fc += `[0:v]trim=start_frame=${f1},setpts=PTS-STARTPTS[c];`; segs.push('[c]'); }
    fc += `${segs.join('')}concat=n=${segs.length}:v=1:a=0[v]`;
    await run('ffmpeg', ['-y', '-v', 'error', '-i', bak, '-i', out, '-filter_complex', fc, '-map', '[v]', '-c:v', 'libx264', '-preset', args.preset || 'medium', '-crf', String(args.crf || 18), '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', tmp]);
    fs.renameSync(tmp, full); fs.rmSync(out, { force: true }); console.log('Patched build/video_silent.mp4 — run py/finish.py again to rebuild the final MP4');
  }
  if (!isPreview) fs.writeFileSync(path.join(BUILD, 'render_info.json'), JSON.stringify({ width: OW, height: OH, quality, supersample: SS, gpu, fps: FPS, rendered: new Date().toISOString() }, null, 1));
  if (errs.size) { console.log(`\n${errs.size} shot error(s):`); [...errs].slice(0, 40).forEach((e) => console.log('  ' + e)); }
  console.log(`\nDone: ${args.patch ? path.join(BUILD, 'video_silent.mp4') : out}  (${fmtT((Date.now() - t0) / 1000)})`);
}
async function contactSheet(browser, items, outFile, cols = 4, cellW = 440) {
  const page = await browser.newPage({ viewport: { width: cols * (cellW + 12) + 12, height: 400 } });
  const html = `<html><body style="margin:0;background:#111;font:600 14px sans-serif;color:#eee"><div style="display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:12px;padding:12px">${items.map((it) => `<div><img src="data:image/jpeg;base64,${it.img.toString('base64')}" style="width:${cellW}px;display:block;border-radius:3px"><div style="padding:4px 2px">${it.label.replace(/</g, '&lt;')}</div></div>`).join('')}</div></body></html>`;
  await page.setContent(html); await page.screenshot({ path: outFile, fullPage: true }); await page.close();
}
async function renderStills() {
  const dir = args.out ? projPath(args.out) : path.join(BUILD, args.sheet ? 'sheets' : 'stills');
  if (!args.out) fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const browser = await launch(); const page = await openPlayer(browser);
  console.log(`GPU: ${await gpuInfo(page)}`);
  const list = await page.evaluate('window.SHOT_LIST'); let targets;
  if (args.sheet) { const only = args.shots ? String(args.shots).split(',') : null; const at = +(args.at || 0.55);
    targets = list.filter((s) => !only || only.includes(s.id)).map((s) => ({ t: s.start + (s.end - s.start) * at, label: `${s.id}  ${s.start.toFixed(1)}s  [${s.type}]` })); }
  else if (args.thumbs) targets = list.map((s) => ({ t: s.start + (s.end - s.start) * 0.5, label: s.id, name: `${s.id}.png` }));
  else targets = String(args.stills || '1').split(',').map(Number).map((t) => ({ t, label: `${t}s` }));
  const all = []; const t0 = Date.now();
  for (const tg of targets) { const img = await grab(page, Math.round(tg.t * FPS)); const name = tg.name || `${tg.label.split(' ')[0].replace(/[^\w.]/g, '')}_${tg.t.toFixed(2)}.${FORMAT === 'png' ? 'png' : 'jpg'}`; fs.writeFileSync(path.join(dir, name), img); all.push({ img, label: tg.label }); }
  (await page.evaluate('window.ERRORS')).forEach((e) => console.log('  shot error:', e));
  if (args.sheet || all.length > 1) for (let i = 0; i < all.length; i += 20) await contactSheet(browser, all.slice(i, i + 20), path.join(dir, `sheet_${String(i / 20 + 1).padStart(2, '0')}.png`));
  await browser.close(); console.log(`Wrote ${all.length} stills${all.length > 1 ? ' + contact sheet(s)' : ''} to ${dir}  (${fmtT((Date.now() - t0) / 1000)})`);
}
try { if (args.sheet || args.stills || args.thumbs) await renderStills(); else await renderVideo(); }
catch (e) { console.error('RENDER FAILED:', e.message); stopAll(1); }
finally { server.close(); }
