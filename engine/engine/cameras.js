// cameras.js — the house camera: always drifting, eased orbit / dolly / push moves, optional handheld shake.
// orbit spec: { from:{az,el,dist,fov,target,ty,roll}, to:{...}, ease:'cam' }  az 0 = in front of the nose, 90 = port side,
// 180 = behind, 270 = starboard; el = degrees above the horizon; dist = multiples of the subject size (1 = one aircraft-size away).
// linear spec: { from:{pos:[x,y,z], look:[x,y,z], fov}, to:{...} }
import * as THREE from 'three';
import { EASE, lerp, deg, noise1 } from './util.js';

const lerpAngle = (a, b, t) => { let d = ((b - a + 540) % 360) - 180; return a + d * t; };
export function resolvePoint(v, anchors, fallback) {
  if (v == null) return fallback.clone();
  if (typeof v === 'string') { const [name, ...off] = v.split('+'); const a = anchors?.[name]; if (!a) throw new Error(`unknown anchor "${name}" (have: ${Object.keys(anchors || {}).join(', ')})`); return a.clone(); }
  if (Array.isArray(v)) return new THREE.Vector3(...v);
  return new THREE.Vector3(v.x, v.y, v.z);
}
export function cameraRig(camera, spec = {}, { anchors = {}, center = new THREE.Vector3(), size = 10, defaults = {} } = {}) {
  const ease = EASE[spec.ease || 'cam'] || EASE.cam;
  const F = { ...defaults, ...(spec.from || spec) }, T = { ...F, ...(spec.to || {}) };
  const shake = spec.shake ?? 0; const seed = spec.seed ?? 3;
  const linear = !!F.pos;
  const tA = resolvePoint(F.target ?? F.look, anchors, center), tB = resolvePoint(T.target ?? T.look ?? F.target ?? F.look, anchors, center);
  if (F.ty != null) tA.y += F.ty; if (T.ty != null) tB.y += T.ty; if (F.tx != null) tA.x += F.tx; if (T.tx != null) tB.x += T.tx; if (F.tz != null) tA.z += F.tz; if (T.tz != null) tB.z += T.tz;
  const tmp = new THREE.Vector3(), look = new THREE.Vector3();
  return (p, u = 0) => {
    const e = ease(p);
    look.lerpVectors(tA, tB, e);
    if (linear) { tmp.set(...F.pos).lerp(new THREE.Vector3(...(T.pos || F.pos)), e); }
    else {
      const az = deg(lerpAngle(F.az ?? 30, T.az ?? F.az ?? 30, e)), el = deg(lerp(F.el ?? 10, T.el ?? F.el ?? 10, e)), d = lerp(F.dist ?? 1.3, T.dist ?? F.dist ?? 1.3, e) * (F.meters ? 1 : size);
      tmp.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).multiplyScalar(d).add(look);
      if (spec.minY != null) tmp.y = Math.max(spec.minY, tmp.y);
    }
    camera.position.copy(tmp);
    camera.fov = lerp(F.fov ?? 35, T.fov ?? F.fov ?? 35, e); camera.updateProjectionMatrix();
    camera.lookAt(look);
    const roll = lerp(F.roll ?? 0, T.roll ?? F.roll ?? 0, e); if (roll) camera.rotateZ(deg(roll));
    if (shake) { const s = shake * 0.6; camera.rotateX(deg(noise1(u * 0.9, seed) * s)); camera.rotateY(deg(noise1(u * 0.7, seed + 5) * s)); camera.rotateZ(deg(noise1(u * 0.5, seed + 9) * s * 0.6)); }
    camera.updateMatrixWorld(); return look;
  };
}
