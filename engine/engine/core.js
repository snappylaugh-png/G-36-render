// core.js — renderer, timeline, transitions, house grade, screen-space UI layer.
// A shot type is an async builder (spec, ctx) -> { scene, camera, update(u, p), ui?(g, u, p), post, dispose? }.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { makeCanvas, clamp, disposeTree } from './util.js';

export const SHOT_TYPES = {};
export const register = (name, fn) => { SHOT_TYPES[name] = fn; };

// ---- looks: measured from the reference (soft contrast, whites ~ 225-235, gentle cool cast in the hangar)
export const LOOKS = {
  hangar: { exposure: 1.0, lift: 0.035, gain: 0.94, gamma: 1.0, sat: 0.9, tint: [0.995, 1.0, 1.012], vignette: 0.16, grain: 0.012, bloom: 0.08 },
  void: { exposure: 1.0, lift: 0.03, gain: 0.93, gamma: 1.0, sat: 0.9, tint: [1.0, 1.0, 1.01], vignette: 0.12, grain: 0.012, bloom: 0.05 },
  flight: { exposure: 1.0, lift: 0.03, gain: 0.96, gamma: 1.0, sat: 0.95, tint: [1.0, 1.0, 1.0], vignette: 0.18, grain: 0.012, bloom: 0.15 },
  sunset: { exposure: 1.0, lift: 0.03, gain: 0.97, gamma: 1.02, sat: 1.0, tint: [1.03, 1.0, 0.97], vignette: 0.24, grain: 0.014, bloom: 0.25 },
  board: { exposure: 1.0, lift: 0.03, gain: 0.95, gamma: 1.0, sat: 0.95, tint: [1.0, 1.0, 1.0], vignette: 0.14, grain: 0.012, bloom: 0.0 },
  map: { exposure: 1.0, lift: 0.025, gain: 0.96, gamma: 1.0, sat: 0.92, tint: [1.0, 1.0, 1.0], vignette: 0.16, grain: 0.012, bloom: 0.0 },
  desk: { exposure: 1.0, lift: 0.03, gain: 0.96, gamma: 1.0, sat: 0.95, tint: [1.01, 1.0, 0.99], vignette: 0.2, grain: 0.014, bloom: 0.0 },
  cockpit: { exposure: 1.0, lift: 0.015, gain: 0.97, gamma: 1.0, sat: 0.92, tint: [0.99, 1.0, 1.02], vignette: 0.3, grain: 0.016, bloom: 0.2 },
  black: { exposure: 1, lift: 0, gain: 1, gamma: 1, sat: 1, tint: [1, 1, 1], vignette: 0, grain: 0, bloom: 0 },
};

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, lift: { value: 0 }, gain: { value: 1 }, gamma: { value: 1 }, sat: { value: 1 }, tint: { value: new THREE.Vector3(1, 1, 1) },
    vignette: { value: 0.15 }, grain: { value: 0.01 }, seed: { value: 0 }, aspect: { value: 16 / 9 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float lift, gain, gamma, sat, vignette, grain, seed, aspect; uniform vec3 tint; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + seed) * 43758.5453); }
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = lift + c * (gain - lift); c = pow(max(c, 0.0), vec3(1.0/gamma)); c *= tint;
      float l = dot(c, vec3(0.2126,0.7152,0.0722)); c = mix(vec3(l), c, sat);
      vec2 q = (vUv - 0.5) * vec2(aspect, 1.0); float v = smoothstep(0.35, 1.25, length(q)); c *= 1.0 - vignette * v;
      c += (h(vUv * 1000.0) - 0.5) * grain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); }`,
};
const PresentShader = {
  uniforms: { tA: { value: null }, uA: { value: null }, tB: { value: null }, uB: { value: null }, mixv: { value: 0 }, fade: { value: 1 }, hasB: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D tA, uA, tB, uB; uniform float mixv, fade, hasB; varying vec2 vUv;
    vec3 comp(sampler2D t, sampler2D u){ vec4 ui = texture2D(u, vUv); vec3 c = texture2D(t, vUv).rgb; return c * (1.0 - ui.a) + ui.rgb; }
    void main(){ vec3 a = comp(tA, uA); vec3 c = a; if (hasB > 0.5) c = mix(a, comp(tB, uB), mixv); gl_FragColor = vec4(c * fade, 1.0); }`,
};

export class Engine {
  constructor({ canvas, W, H, fps, cfg, base }) {
    this.W = W; this.H = H; this.fps = fps; this.cfg = cfg; this.base = base; this.errors = [];
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(1); r.setSize(W, H, false); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0; r.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = r; this.live = new Map();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ ...PresentShader, uniforms: THREE.UniformsUtils.clone(PresentShader.uniforms), depthTest: false, depthWrite: false }));
    this.qScene = new THREE.Scene(); this.qScene.add(this.quad); this.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); this.blank.needsUpdate = true;
  }
  setShots(shots) { this.shots = shots.slice().sort((a, b) => a.start - b.start); }
  shotAt(t) { const s = this.shots; let lo = 0, hi = s.length - 1, k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (s[m].start <= t + 1e-6) { k = m; lo = m + 1; } else hi = m - 1; } return k; }

  async instance(spec) {
    if (this.live.has(spec.id)) return this.live.get(spec.id);
    let inst; const W = this.W, H = this.H;
    try {
      const fn = SHOT_TYPES[spec.type]; if (!fn) throw new Error(`unknown shot type "${spec.type}"`);
      inst = await fn(spec, this);
    } catch (e) {
      const msg = `${spec.id}: ${e.message}`; console.log('ERROR ' + msg); this.errors.push(msg);
      inst = await SHOT_TYPES.error({ ...spec, message: msg }, this);
    }
    inst.spec = spec;
    // composer per shot: scene -> (dof) -> (bloom) -> output (tonemap+sRGB) -> grade -> own target
    const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: this.cfg.msaa ?? 4 });
    const comp = new EffectComposer(this.renderer, rt); comp.renderToScreen = false;
    comp.addPass(new RenderPass(inst.scene, inst.camera));
    const post = inst.post || {}; const look = { ...(LOOKS[post.look] || LOOKS.hangar), ...(post.grade || {}) };
    if (post.dof && this.cfg.quality !== 'draft') { const b = new BokehPass(inst.scene, inst.camera, { focus: post.dof.focus || 10, aperture: post.dof.aperture ?? 0.002, maxblur: post.dof.maxblur ?? 0.006 }); comp.addPass(b); inst.bokeh = b; }
    if ((look.bloom || 0) > 0 && this.cfg.quality !== 'draft') comp.addPass(new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), look.bloom, 0.6, 0.92));
    this.renderer.toneMappingExposure = look.exposure ?? 1; comp.addPass(new OutputPass());
    const grade = new ShaderPass(GradeShader); const u = grade.uniforms; u.lift.value = look.lift; u.gain.value = look.gain; u.gamma.value = look.gamma; u.sat.value = look.sat; u.tint.value.set(...look.tint); u.vignette.value = look.vignette; u.grain.value = look.grain; u.aspect.value = W / H;
    comp.addPass(grade); inst.grade = grade; inst.look = look;
    const out = new THREE.WebGLRenderTarget(W, H); inst.out = out; inst.comp = comp;
    if (inst.ui) { inst.uiCanvas = makeCanvas(W, H); inst.uiCtx = inst.uiCanvas.getContext('2d'); inst.uiTex = new THREE.CanvasTexture(inst.uiCanvas); inst.uiTex.premultiplyAlpha = false; inst.uiTex.colorSpace = THREE.NoColorSpace; }
    this.live.set(spec.id, inst); return inst;
  }
  drawInstance(inst, t, frame) {
    const s = inst.spec; const dur = Math.max(1e-3, s.end - s.start); const u = t - s.start; const p = u / dur;
    try { inst.update && inst.update(u, p, t); } catch (e) { const m = `${s.id}: update: ${e.message}`; if (!this.errors.includes(m)) this.errors.push(m); }
    this.renderer.toneMappingExposure = inst.look.exposure ?? 1;
    inst.grade.uniforms.seed.value = (frame % 97) * 1.37;
    if (inst.bokeh && inst.dofFocus != null) inst.bokeh.uniforms.focus.value = inst.dofFocus;
    inst.comp.render();
    // copy composer result into the shot's own output target
    this.renderer.setRenderTarget(inst.out); this.copy ||= new ShaderPass({ uniforms: { tDiffuse: { value: null } }, vertexShader: GradeShader.vertexShader, fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }' });
    this.copy.uniforms.tDiffuse.value = inst.comp.readBuffer.texture; this.copy.fsQuad.render(this.renderer); this.renderer.setRenderTarget(null);
    if (inst.ui) { const g = inst.uiCtx; g.clearRect(0, 0, this.W, this.H); try { inst.ui(g, u, p, this.W, this.H); } catch (e) { const m = `${s.id}: ui: ${e.message}`; if (!this.errors.includes(m)) this.errors.push(m); } inst.uiTex.needsUpdate = true; }
    return inst;
  }
  dispose(id) { const inst = this.live.get(id); if (!inst) return; try { inst.dispose && inst.dispose(); disposeTree(inst.scene); inst.comp.dispose?.(); inst.out.dispose(); } catch (e) { /* ignore */ } this.live.delete(id); }

  async renderFrame(frame) {
    const t = frame / this.fps; const k = this.shotAt(t); if (k < 0) return;
    const A = this.shots[k]; const next = this.shots[k + 1]; const prev = this.shots[k - 1];
    let mixv = 0, fade = 1, B = null;
    // incoming transition of the next shot that starts within half its length
    const tr = (s) => ({ type: s.in || 'cut', n: (s.inFrames || (s.in === 'dip' ? 14 : 8)) / this.fps });
    if (next) { const T = tr(next); if (T.type === 'dissolve' && t >= next.start - T.n / 2) { B = next; mixv = clamp((t - (next.start - T.n / 2)) / T.n); } if (T.type === 'dip' && t >= next.start - T.n / 2) fade = clamp((next.start - t) / (T.n / 2)); }
    { const T = tr(A); if (T.type === 'dissolve' && prev && t < A.start + T.n / 2) { B = A; mixv = clamp((t - (A.start - T.n / 2)) / T.n); } if (T.type === 'dip' && t < A.start + T.n / 2) fade = Math.min(fade, clamp((t - A.start) / (T.n / 2))); }
    let first = A; if (B === A) first = prev;
    // keep only what we need alive
    const need = new Set([first.id, B?.id].filter(Boolean));
    for (const id of [...this.live.keys()]) if (!need.has(id) && !(next && id === next.id)) this.dispose(id);
    const ia = await this.instance(first); this.drawInstance(ia, t, frame);
    let ib = null; if (B && B !== first) { ib = await this.instance(B); this.drawInstance(ib, t, frame); }
    const q = this.quad.material.uniforms; q.tA.value = ia.out.texture; q.uA.value = ia.uiTex || this.blank; q.hasB.value = ib ? 1 : 0; q.tB.value = ib ? ib.out.texture : this.blank; q.uB.value = ib?.uiTex || this.blank; q.mixv.value = mixv; q.fade.value = fade;
    this.renderer.setRenderTarget(null); this.renderer.render(this.qScene, this.qCam);
  }
}

// a loud error card so a broken shot is never missed on a contact sheet
register('error', async (spec, E) => {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#5a1030'); const camera = new THREE.PerspectiveCamera(40, E.W / E.H, 0.1, 100);
  return { scene, camera, post: { look: 'black' }, ui: (g, u, p, W, H) => { g.fillStyle = '#fff'; g.font = `600 ${H * 0.035}px sans-serif`; g.textAlign = 'center'; g.fillText('SHOT ERROR', W / 2, H * 0.42); g.font = `400 ${H * 0.022}px monospace`; String(spec.message).match(/.{1,90}/g).forEach((l, i) => g.fillText(l, W / 2, H * 0.5 + i * H * 0.03)); } };
});
register('black', async (spec, E) => { const scene = new THREE.Scene(); scene.background = new THREE.Color(spec.color || '#0c0c0c'); return { scene, camera: new THREE.PerspectiveCamera(40, E.W / E.H, 0.1, 10), post: { look: 'black' } }; });
