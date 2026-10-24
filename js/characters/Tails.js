import { Matrix4, normalMatrix, normalize3, cross3, dot3 } from '../core/Matrix4.js';
import { createNode, createPart } from '../core/MyObject.js';
import { ShaderProgram } from '../rendering/ShaderProgram.js';
import { Renderer } from '../rendering/Renderer.js';
import {
  TAILS_ATTRIBUTE_BINDINGS,
  TAILS_FRAGMENT_SOURCE,
  TAILS_UNIFORMS,
  TAILS_VERTEX_SOURCE,
} from '../shaders/tailsShader.js';

// Color palette matching the reference implementation
export const COL = {
  orange:    [0.95, 0.62, 0.10],
  orangeDk:  [0.85, 0.51, 0.06],
  white:     [0.95, 0.96, 0.98],
  earIn:     [0.84, 0.85, 0.89],
  irisOuter: [0.02, 0.34, 0.78],
  blue:      [0.08, 0.62, 0.98],
  irisInner: [0.32, 0.82, 1.00],
  black:     [0.05, 0.05, 0.07],
  mouthLine: [0.25, 0.11, 0.10],
  red:       [0.86, 0.09, 0.11],
  gray:      [0.48, 0.50, 0.54],
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------------------------- Geometry Generators ---------------------------- */

function genSphere(seg = 32, ring = 20) {
  const pos = [], nor = [], idx = [];
  for (let i = 0; i <= ring; i++) {
    const th = (i / ring) * Math.PI;
    const sinTh = Math.sin(th), cosTh = Math.cos(th);
    for (let j = 0; j <= seg; j++) {
      const ph = (j / seg) * Math.PI * 2;
      const x = sinTh * Math.cos(ph), y = cosTh, z = sinTh * Math.sin(ph);
      pos.push(x, y, z);
      nor.push(x, y, z);
    }
  }
  for (let i = 0; i < ring; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return {
    p: new Float32Array(pos),
    n: new Float32Array(nor),
    i: new Uint16Array(idx),
    c: idx.length,
  };
}

function genCylinder(seg = 32, bevel = 0.0) {
  const pos = [], nor = [], idx = [];
  const profile = bevel > 0 ? [
    [-0.5, 1 - bevel, 0, -1],
    [-0.5 + bevel * 0.8, 1, 1, -0.35],
    [0.0, 1 + bevel * 0.16, 1, 0.0],
    [0.5 - bevel * 0.8, 1, 1, 0.35],
    [0.5, 1 - bevel, 0, 1],
  ] : [[-0.5, 1, 1, 0], [0.5, 1, 1, 0]];

  for (let i = 0; i < profile.length; i++) {
    const [y, rad, nr, ny] = profile[i];
    for (let j = 0; j <= seg; j++) {
      const u = (j / seg) * Math.PI * 2;
      const cu = Math.cos(u), su = Math.sin(u);
      pos.push(cu * rad, y, su * rad);
      const n = normalize3([cu * nr, ny, su * nr]);
      nor.push(n[0], n[1], n[2]);
    }
  }
  for (let i = 0; i < profile.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  for (const side of [-1, 1]) {
    const c0 = pos.length / 3;
    const rad = bevel > 0 ? 1 - bevel : 1;
    pos.push(0, side * 0.5, 0);
    nor.push(0, side, 0);
    for (let j = 0; j <= seg; j++) {
      const u = (j / seg) * Math.PI * 2;
      pos.push(Math.cos(u) * rad, side * 0.5, Math.sin(u) * rad);
      nor.push(0, side, 0);
    }
    for (let j = 0; j < seg; j++) {
      if (side > 0) idx.push(c0, c0 + 1 + j + 1, c0 + 1 + j);
      else idx.push(c0, c0 + 1 + j, c0 + 1 + j + 1);
    }
  }
  return {
    p: new Float32Array(pos),
    n: new Float32Array(nor),
    i: new Uint16Array(idx),
    c: idx.length,
  };
}

function genEllipticCone(seg = 32, rings = 16) {
  const pos = [], nor = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const v = i / rings, r = 1 - v;
    for (let j = 0; j <= seg; j++) {
      const u = (j / seg) * Math.PI * 2;
      const cu = Math.cos(u), su = Math.sin(u);
      pos.push(r * cu, v, r * su);
      const n = normalize3([cu, 1.0, su]);
      nor.push(n[0], n[1], n[2]);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const c0 = pos.length / 3;
  pos.push(0, 0, 0); nor.push(0, -1, 0);
  for (let j = 0; j <= seg; j++) {
    const u = (j / seg) * Math.PI * 2;
    pos.push(Math.cos(u), 0, Math.sin(u)); nor.push(0, -1, 0);
  }
  for (let j = 0; j < seg; j++) idx.push(c0, c0 + 1 + j + 1, c0 + 1 + j);
  return {
    p: new Float32Array(pos),
    n: new Float32Array(nor),
    i: new Uint16Array(idx),
    c: idx.length,
  };
}

function genParaboloid(seg = 32, rings = 16) {
  const pos = [], nor = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const v = i / rings, r = Math.sqrt(Math.max(0, 1 - v));
    for (let j = 0; j <= seg; j++) {
      const u = (j / seg) * Math.PI * 2;
      const x = r * Math.cos(u), z = r * Math.sin(u);
      pos.push(x, v, z);
      const n = normalize3([2 * x, 1, 2 * z]);
      nor.push(n[0], n[1], n[2]);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const c0 = pos.length / 3;
  pos.push(0, 0, 0); nor.push(0, -1, 0);
  for (let j = 0; j <= seg; j++) {
    const u = (j / seg) * Math.PI * 2;
    pos.push(Math.cos(u), 0, Math.sin(u)); nor.push(0, -1, 0);
  }
  for (let j = 0; j < seg; j++) idx.push(c0, c0 + 1 + j + 1, c0 + 1 + j);
  return {
    p: new Float32Array(pos),
    n: new Float32Array(nor),
    i: new Uint16Array(idx),
    c: idx.length,
  };
}

function genHyperboloid1Sheet(seg = 32, rings = 16, waist = 0.72) {
  const pos = [], nor = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const y = (i / rings) - 0.5;
    const r = waist * Math.sqrt(1 + 3.2 * y * y);
    for (let j = 0; j <= seg; j++) {
      const u = (j / seg) * Math.PI * 2;
      const cu = Math.cos(u), su = Math.sin(u);
      pos.push(r * cu, y, r * su);
      const n = normalize3([cu, -1.5 * y, su]);
      nor.push(n[0], n[1], n[2]);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return {
    p: new Float32Array(pos),
    n: new Float32Array(nor),
    i: new Uint16Array(idx),
    c: idx.length,
  };
}

function bez(P, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * P[0][0] + b * P[1][0] + c * P[2][0] + d * P[3][0],
    a * P[0][1] + b * P[1][1] + c * P[2][1] + d * P[3][1],
    a * P[0][2] + b * P[1][2] + c * P[2][2] + d * P[3][2],
  ];
}

function bezD(P, t) {
  const u = 1 - t;
  const a = 3 * u * u;
  const b = 6 * u * t;
  const c = 3 * t * t;
  return [
    a * (P[1][0] - P[0][0]) + b * (P[2][0] - P[1][0]) + c * (P[3][0] - P[2][0]),
    a * (P[1][1] - P[0][1]) + b * (P[2][1] - P[1][1]) + c * (P[3][1] - P[2][1]),
    a * (P[1][2] - P[0][2]) + b * (P[2][2] - P[1][2]) + c * (P[3][2] - P[2][2]),
  ];
}

function genBezierTube(P, radiusFn, nu = 36, nv = 16, tMin = 0, tMax = 1) {
  const pos = [], nor = [], idx = [];
  let initT = normalize3(bezD(P, 0));
  let upVec = Math.abs(initT[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let N = normalize3(cross3(initT, upVec));
  for (let i = 0; i <= nu; i++) {
    const t = tMin + (i / nu) * (tMax - tMin);
    const c = bez(P, t), d = bezD(P, t);
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    const T = [d[0] / len, d[1] / len, d[2] / len];
    const dn = dot3(N, T);
    N = normalize3([N[0] - T[0] * dn, N[1] - T[1] * dn, N[2] - T[2] * dn]);
    const B = cross3(T, N);
    const t0 = Math.max(0, t - 1e-3), t1 = Math.min(1, t + 1e-3);
    const drds = (radiusFn(t1) - radiusFn(t0)) / (t1 - t0) / len;
    const r = radiusFn(t);
    for (let j = 0; j <= nv; j++) {
      const a = (j / nv) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const dir = [N[0] * ca + B[0] * sa, N[1] * ca + B[1] * sa, N[2] * ca + B[2] * sa];
      pos.push(c[0] + dir[0] * r, c[1] + dir[1] * r, c[2] + dir[2] * r);
      const n = normalize3([dir[0] - T[0] * drds, dir[1] - T[1] * drds, dir[2] - T[2] * drds]);
      nor.push(n[0], n[1], n[2]);
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + nv + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return {
    p: new Float32Array(pos),
    n: new Float32Array(nor),
    i: new Uint16Array(idx),
    c: idx.length,
  };
}

/* ---------------------------- Tails Character Class ---------------------------- */

export class Tails {
  constructor(gl, resources = {}) {
    if (!gl) throw new Error('Tails requires an existing WebGL context');
    this.gl = gl;
    this.renderer = resources.renderer || new Renderer(gl);
    this.shader = resources.shader || new ShaderProgram(gl, {
      vertexSource: TAILS_VERTEX_SOURCE,
      fragmentSource: TAILS_FRAGMENT_SOURCE,
      attributeBindings: TAILS_ATTRIBUTE_BINDINGS,
      uniformNames: TAILS_UNIFORMS,
    });

    const upload = (mesh) => this.renderer.uploadMesh(mesh);
    this.mesh = {
      sphere: upload(genSphere(32, 20)),
      cylinder: upload(genCylinder(32, 0.0)),
      cylinderCuff: upload(genCylinder(32, 0.30)),
      cone: upload(genEllipticCone(32, 16)),
      paraboloid: upload(genParaboloid(32, 16)),
      hyperboloid: upload(genHyperboloid1Sheet(32, 16, 0.72)),
    };

    this.root = createNode({ name: 'TailsRoot' });
    this.joints = { legs: {}, arms: {}, ears: {}, tails: {} };
    this.eyes = [];

    // Animation states & blending
    this.animation = 'idle';
    this.W = { walk: 0, fly: 0 };
    this.target = { walk: 0, fly: 0 };
    this.walkPh = 0;
    this.spinPh = 0;
    this.nextBlink = 2.0;
    this.blinkStart = -10;

    this.#build();
    this.reset();
  }

  #part(node, meshKey, t = [0, 0, 0], s = [1, 1, 1], color = COL.orange, spec = 0.10, extra = {}) {
    node.parts.push(createPart(this.mesh[meshKey], t, s, color, { spec, shin: 30, ...extra }));
  }

  #node(parent, name, t = [0, 0, 0], r = [0, 0, 0]) {
    const n = createNode({ name, t, r });
    parent.addChild(n);
    return n;
  }

  #curveStrand(parent, name, P, rBase, rMid, rTip, color) {
    const radiusFn = (t) => {
      if (t < 0.35) return rBase + (rMid - rBase) * (t / 0.35);
      return rMid * Math.pow(Math.max(0, 1 - (t - 0.35) / 0.65), 0.72) + rTip * (1 - t);
    };
    const tubeMesh = this.renderer.uploadMesh(genBezierTube(P, radiusFn, 32, 14));
    const node = this.#node(parent, name);
    node.parts.push(createPart(tubeMesh, [0, 0, 0], [1, 1, 1], color, { spec: 0.10 }));
    return node;
  }

  #build() {
    const upload = (mesh) => this.renderer.uploadMesh(mesh);

    /* ==================== 1. TORSO & CHEST FUR ==================== */
    this.torso = this.#node(this.root, 'Body', [0, 1.05, 0]);
    this.joints.body = this.torso;

    // Body ellipsoids
    this.#part(this.torso, 'sphere', [0, 0.30, 0], [0.285, 0.34, 0.24], COL.orange, 0.08);
    this.#part(this.torso, 'sphere', [0, 0.14, -0.015], [0.265, 0.21, 0.23], COL.orange, 0.08);

    // Upper neck / shoulder transition (Hyperboloid of 1 sheet)
    this.#part(this.torso, 'hyperboloid', [0, 0.61, 0], [0.23, 0.18, 0.20], COL.orange, 0.08);

    // Chest fur base (white ellipsoid)
    this.#part(this.torso, 'sphere', [0, 0.35, 0.115], [0.225, 0.28, 0.155], COL.white, 0.08, { r: [-0.06, 0, 0] });

    // 5 Chest fur tufts (Elliptic Paraboloids)
    const chestTufts = [
      [[ 0.00, 0.56, 0.205], [2.30,  0.00,  0.00], [0.105, 0.23, 0.060]],
      [[-0.11, 0.55, 0.190], [2.20, -0.22, -0.38], [0.092, 0.21, 0.052]],
      [[ 0.11, 0.55, 0.190], [2.20,  0.22,  0.38], [0.092, 0.21, 0.052]],
      [[-0.14, 0.61, 0.155], [1.90, -0.35, -0.62], [0.072, 0.17, 0.045]],
      [[ 0.14, 0.61, 0.155], [1.90,  0.35,  0.62], [0.072, 0.17, 0.045]],
    ];
    chestTufts.forEach(([p, r, s], idx) => {
      this.#part(this.torso, 'paraboloid', p, s, COL.white, 0.08, { r });
    });

    /* ==================== 2. HEAD CAPSULE & MUZZLE ==================== */
    this.neck = this.#node(this.torso, 'Neck', [0, 0.66, 0]);
    this.head = this.#node(this.neck, 'Head', [0, 0.46, 0.02]);
    this.joints.head = this.head;

    // Head capsule (top ellipsoid + middle cylinder + bottom ellipsoid)
    this.#part(this.head, 'sphere', [0,  0.12, -0.02], [0.548, 0.44, 0.488], COL.orange, 0.08);
    this.#part(this.head, 'cylinder', [0,  0.01, -0.02], [0.552, 0.24, 0.492], COL.orange, 0.08);
    this.#part(this.head, 'sphere', [0, -0.10, -0.02], [0.548, 0.43, 0.488], COL.orange, 0.08);

    // Muzzle (middle cylinder + left/right cheeks + front tip)
    this.#part(this.head, 'cylinder', [0, -0.22, 0.25], [0.192, 0.36, 0.222], COL.white, 0.08, { r: [0, 0, Math.PI / 2] });
    this.#part(this.head, 'sphere', [-0.18, -0.22, 0.25], [0.22, 0.19, 0.22], COL.white, 0.08);
    this.#part(this.head, 'sphere', [ 0.18, -0.22, 0.25], [0.22, 0.19, 0.22], COL.white, 0.08);
    this.#part(this.head, 'sphere', [0, -0.23, 0.35], [0.25, 0.17, 0.17], COL.white, 0.10);

    // Black nose
    this.#part(this.head, 'sphere', [0, -0.13, 0.535], [0.062, 0.044, 0.052], COL.black, 0.85, { r: [-0.15, 0, 0] });

    // Mouth line (3D Cubic Bezier tube)
    const mouthP = [
      [-0.14, -0.22, 0.522],
      [-0.06, -0.295, 0.558],
      [ 0.06, -0.295, 0.558],
      [ 0.14, -0.22, 0.522],
    ];
    const mouthMesh = upload(genBezierTube(
      mouthP,
      (t) => 0.005 + 0.009 * Math.pow(Math.sin(Math.PI * t), 0.5),
      28, 10
    ));
    this.head.parts.push(createPart(mouthMesh, [0, 0, 0], [1, 1, 1], COL.mouthLine, { spec: 0.15 }));

    /* ==================== 3. EYES ==================== */
    for (const s of [-1, 1]) {
      const eyeNode = this.#node(this.head, `Eye${s}`, [s * 0.14, 0.07, 0.43], [-0.02, s * 0.20, 0]);
      this.#part(eyeNode, 'sphere', [0, 0.025, 0],              [0.152, 0.240, 0.075], COL.white,     0.40);
      this.#part(eyeNode, 'sphere', [s * -0.012, -0.02, 0.046], [0.094, 0.148, 0.042], COL.irisOuter, 0.65);
      this.#part(eyeNode, 'sphere', [s * -0.012, -0.02, 0.052], [0.086, 0.136, 0.040], COL.blue,      0.70);
      this.#part(eyeNode, 'sphere', [s * -0.012, -0.046, 0.060],[0.064, 0.080, 0.034], COL.irisInner, 0.75);
      this.#part(eyeNode, 'sphere', [s * -0.012, -0.018, 0.072],[0.048, 0.086, 0.028], COL.black,     0.80);
      this.#part(eyeNode, 'sphere', [s * -0.034,  0.050, 0.090],[0.024, 0.032, 0.014], COL.white,     0.95);
      this.#part(eyeNode, 'sphere', [s *  0.018, -0.064, 0.086],[0.012, 0.016, 0.010], COL.white,     0.95);
      this.eyes.push(eyeNode);
    }

    /* ==================== 4. EARS & CHEEK WHISKERS ==================== */
    for (const s of [-1, 1]) {
      const ear = this.#node(this.head, `Ear${s}`, [s * 0.26, 0.38, -0.05], [0.05, s * 0.16, s * -0.40]);
      this.#part(ear, 'cone',       [0, 0, 0],               [0.29, 0.72, 0.12], COL.orange,   0.08);
      this.#part(ear, 'cone',       [0, 0.03, 0.042],        [0.20, 0.56, 0.07], COL.earIn,    0.06, { r: [0.02, 0, 0] });
      this.#part(ear, 'paraboloid', [s * 0.08, 0.01, 0.040], [0.08, 0.26, 0.05], COL.orangeDk, 0.08, { r: [0, 0, s * 0.22] });
      this.joints.ears[s] = ear;

      // Cheek fur cones
      const cheekBase = this.#node(this.head, `Cheek${s}`, [s * 0.28, -0.21, 0.24], [0, s * -0.28, 0]);
      this.#part(cheekBase, 'cone', [0,  0.045, 0], [0.052, 0.38, 0.095], COL.white, 0.08, { r: [0, 0, s * -1.36] });
      this.#part(cheekBase, 'cone', [0, -0.005, 0], [0.055, 0.41, 0.102], COL.white, 0.08, { r: [0, 0, s * -1.62] });
      this.#part(cheekBase, 'cone', [0, -0.055, 0], [0.048, 0.34, 0.088], COL.white, 0.08, { r: [0, 0, s * -1.90] });
    }

    /* ==================== 5. BANGS (3 Forehead Strands) ==================== */
    this.bangsGrp = this.#node(this.head, 'Bangs', [0, 0, 0]);
    const bangTop = [[ 0.00, 0.44, 0.26], [ 0.00, 0.68, 0.50], [ 0.00, 0.62, 0.78], [ 0.00, 0.36, 0.88]];
    const bangMid = [[-0.02, 0.41, 0.29], [-0.06, 0.58, 0.52], [-0.08, 0.48, 0.76], [-0.05, 0.24, 0.82]];
    const bangBot = [[ 0.02, 0.38, 0.31], [ 0.06, 0.48, 0.52], [ 0.07, 0.36, 0.70], [ 0.04, 0.14, 0.74]];
    this.#curveStrand(this.bangsGrp, 'BangTop', bangTop, 0.042, 0.068, 0.004, COL.orange);
    this.#curveStrand(this.bangsGrp, 'BangMid', bangMid, 0.038, 0.060, 0.004, COL.orange);
    this.#curveStrand(this.bangsGrp, 'BangBot', bangBot, 0.034, 0.052, 0.004, COL.orange);

    /* ==================== 6. ARMS, GLOVES & HANDS ==================== */
    for (const s of [-1, 1]) {
      const sh = this.#node(this.torso, `Shoulder${s}`, [s * 0.25, 0.55, 0]);
      this.#part(sh, 'sphere', [0, 0, 0], [0.074, 0.074, 0.074], COL.orange, 0.08);

      const up = this.#node(sh, `UpperArm${s}`, [0, 0, 0]);
      this.#part(up, 'cylinder', [0, -0.15, 0], [0.058, 0.30, 0.058], COL.orange, 0.08);

      const el = this.#node(up, `Elbow${s}`, [0, -0.30, 0]);
      this.#part(el, 'sphere',   [0, 0, 0],     [0.066, 0.066, 0.066], COL.orange, 0.08);
      this.#part(el, 'cylinder', [0, -0.12, 0], [0.055, 0.24, 0.055], COL.orange, 0.08);

      const wrist = this.#node(el, `Wrist${s}`, [0, -0.24, 0]);
      this.#part(wrist, 'cylinderCuff', [0,  0.02, 0], [0.134, 0.075, 0.134], COL.white, 0.18, { r: [0.08, 0, 0] });
      this.#part(wrist, 'cylinderCuff', [0, -0.04, 0], [0.142, 0.075, 0.142], COL.white, 0.18, { r: [-0.05, 0, 0] });
      this.#part(wrist, 'cylinder',     [0, -0.08, 0], [0.114, 0.030, 0.114], COL.black, 0.15);

      const palm = this.#node(wrist, `Palm${s}`, [0, -0.18, 0.02]);
      this.#part(palm, 'sphere', [0, 0, 0], [0.152, 0.142, 0.138], COL.white, 0.22);

      // 4 Fingers
      [-0.088, -0.029, 0.029, 0.088].forEach((fx, fi) => {
        const fin = this.#node(palm, `Finger${s}_${fi}`, [fx, -0.02, 0.088]);
        this.#part(fin, 'sphere',   [0,  0.028, 0.018],  [0.045, 0.045, 0.046], COL.white, 0.22);
        this.#part(fin, 'cylinder', [0, -0.020, 0.018],  [0.040, 0.078, 0.040], COL.white, 0.22, { r: [0.30, 0, 0] });
        this.#part(fin, 'sphere',   [0, -0.058, 0.000],  [0.042, 0.042, 0.042], COL.white, 0.22);
        this.#part(fin, 'cylinder', [0, -0.058, -0.038], [0.036, 0.078, 0.036], COL.white, 0.22, { r: [1.45, 0, 0] });
      });

      // Thumb
      const thumb = this.#node(palm, `Thumb${s}`, [s * -0.088, 0.038, 0.078], [0.2, s * -0.4, s * -1.1]);
      this.#part(thumb, 'sphere',   [0, 0, 0],      [0.052, 0.052, 0.052], COL.white, 0.22);
      this.#part(thumb, 'cylinder', [0, -0.048, 0], [0.046, 0.088, 0.046], COL.white, 0.22);
      this.#part(thumb, 'sphere',   [0, -0.092, 0], [0.046, 0.046, 0.046], COL.white, 0.22);

      this.joints.arms[s] = { sh: up, el, s };
    }

    /* ==================== 7. LEGS, SOCKS & SHOES ==================== */
    for (const s of [-1, 1]) {
      const hip = this.#node(this.root, `Hip${s}`, [s * 0.135, 1.02, 0]);
      this.#part(hip, 'sphere',   [0, 0, 0],     [0.085, 0.085, 0.085], COL.orange, 0.08);
      this.#part(hip, 'cylinder', [0, -0.19, 0], [0.068, 0.38, 0.068],  COL.orange, 0.08);

      const knee = this.#node(hip, `Knee${s}`, [0, -0.38, 0]);
      this.#part(knee, 'sphere',   [0, 0, 0],     [0.070, 0.070, 0.070], COL.orange, 0.08);
      this.#part(knee, 'cylinder', [0, -0.19, 0], [0.064, 0.38, 0.064],  COL.orange, 0.08);

      const foot = this.#node(knee, `Foot${s}`, [0, -0.40, 0], [0, s * -0.08, 0]);
      this.#part(foot, 'cylinderCuff', [0, 0.11, 0], [0.154, 0.075, 0.160], COL.white, 0.18, { r: [0.04, 0, 0] });
      this.#part(foot, 'cylinderCuff', [0, 0.05, 0], [0.162, 0.075, 0.168], COL.white, 0.18, { r: [-0.04, 0, 0] });
      this.#part(foot, 'cylinder',     [0, 0.00, 0], [0.134, 0.040, 0.144], COL.black, 0.15);

      // Red heel
      this.#part(foot, 'sphere',   [0, -0.11, -0.04], [0.194, 0.154, 0.222], COL.red, 0.42);
      this.#part(foot, 'cylinder', [0, -0.06, -0.02], [0.150, 0.120, 0.160], COL.red, 0.42);

      // White shoe front
      this.#part(foot, 'sphere',     [0, -0.125, 0.14], [0.190, 0.148, 0.270], COL.white, 0.38, { r: [0.08, 0, 0] });
      this.#part(foot, 'paraboloid', [0, -0.185, 0.08], [0.192, 0.340, 0.135], COL.white, 0.38, { r: [Math.PI / 2, 0, 0] });

      // Gray sole
      this.#part(foot, 'cylinder', [0, -0.205, 0.05], [0.196, 0.038, 0.360], COL.gray, 0.15);
      this.#part(foot, 'sphere',   [0, -0.195, 0.05], [0.202, 0.028, 0.375], COL.gray, 0.15);

      this.joints.legs[s] = { hip, knee, foot };
    }

    /* ==================== 8. TWO TAILS & PROPELLER HUB ==================== */
    const tailRadius = (t) => {
      if (t < 0.58) return 0.055 + 0.225 * Math.sin((t / 0.58) * (Math.PI / 2));
      const u = (t - 0.58) / 0.42;
      return 0.28 * Math.pow(Math.max(0, 1 - Math.pow(u, 1.55)), 0.80);
    };

    // Propeller axis vector connecting P0 [0, 0.12, -0.15] to P1 [0, -0.08, -1.15]
    this.tailAxis = normalize3([0, -0.08 - 0.12, -1.15 - (-0.15)]);
    this.tailPropellerHub = this.#node(this.torso, 'TailPropellerHub', [0, 0.12, -0.15]);

    for (const s of [-1, 1]) {
      const P = [
        [0.00, 0.00, 0.00],
        [s * 0.27, -0.28, -0.36],
        [s * 0.58, -0.42, -0.80],
        [s * 0.74, -0.06, -1.20]
      ];
      const pivot = this.#node(this.tailPropellerHub, `TailPivot${s}`, [s * 0.04, 0, -0.03]);

      // Two-tone tail tube: Orange body (0.0 to 0.58) and White tip (0.58 to 1.0)
      const tailOrangeMesh = upload(genBezierTube(P, tailRadius, 28, 16, 0.0, 0.58));
      const tailWhiteMesh = upload(genBezierTube(P, tailRadius, 20, 16, 0.58, 1.0));
      pivot.parts.push(createPart(tailOrangeMesh, [0, 0, 0], [1, 1, 1], COL.orange, { spec: 0.10 }));
      pivot.parts.push(createPart(tailWhiteMesh, [0, 0, 0], [1, 1, 1], COL.white,  { spec: 0.10 }));

      // 5 White tuft cones around tip
      [
        { t: 0.74, ang: 1.2,  sc: [0.058, 0.23, 0.048] },
        { t: 0.78, ang: 2.5,  sc: [0.058, 0.25, 0.048] },
        { t: 0.82, ang: -1.6, sc: [0.052, 0.23, 0.042] },
        { t: 0.86, ang: 0.2,  sc: [0.052, 0.26, 0.042] },
        { t: 0.91, ang: 3.1,  sc: [0.048, 0.23, 0.040] },
      ].forEach((sp) => {
        const c = bez(P, sp.t), T = normalize3(bezD(P, sp.t));
        const side = normalize3(cross3(T, [0, 1, 0])), up = cross3(side, T);
        const r = tailRadius(sp.t) * 0.72;
        const off = [
          side[0] * Math.cos(sp.ang) * r + up[0] * Math.sin(sp.ang) * r,
          side[1] * Math.cos(sp.ang) * r + up[1] * Math.sin(sp.ang) * r,
          side[2] * Math.cos(sp.ang) * r + up[2] * Math.sin(sp.ang) * r,
        ];
        const d = normalize3([T[0] + off[0] * 2.2, T[1] + off[1] * 2.2, T[2] + off[2] * 2.2]);
        const rx = Math.asin(clamp(d[2], -1, 1)), rz = Math.atan2(-d[0], d[1]);
        pivot.parts.push(createPart(
          this.mesh.cone,
          [c[0] + off[0], c[1] + off[1], c[2] + off[2]],
          sp.sc,
          COL.white,
          { r: [rx, 0, rz], spec: 0.08 }
        ));
      });
      this.joints.tails[s] = pivot;
    }
  }

  getRoot() {
    return this.root;
  }

  getModeInfo() {
    return { mode: this.animation };
  }

  setAnimation(mode) {
    if (!['idle', 'walk', 'fly'].includes(mode)) {
      throw new Error(`Unknown Tails animation mode: ${mode}`);
    }
    this.animation = mode;
    this.target = { walk: 0, fly: 0 };
    if (mode === 'walk') this.target.walk = 1;
    if (mode === 'fly') this.target.fly = 1;
  }

  reset() {
    this.animation = 'idle';
    this.target = { walk: 0, fly: 0 };
    this.W = { walk: 0, fly: 0 };
    this.walkPh = 0;
    this.spinPh = 0;
    this.nextBlink = 2.0;
    this.blinkStart = -10;

    // Reset root transform
    this.root.t = [0, 0, 0];
    this.root.r = [0, 0, 0];
    this.root.s = [1, 1, 1];
    this.root.aa = null;

    // Reset body joints
    this.torso.t = [0, 1.05, 0];
    this.torso.r = [0, 0, 0];
    this.torso.s = [1, 1, 1];
    this.neck.r = [0, 0, 0];
    this.head.r = [0, 0, 0];
    this.bangsGrp.r = [0, 0, 0];

    // Reset ears
    for (const s of [-1, 1]) {
      this.joints.ears[s].r = [0.05, s * 0.16, s * -0.40];
    }

    // Reset arms
    for (const s of [-1, 1]) {
      const A = this.joints.arms[s];
      A.sh.r = [0.35, s * -0.34, s * 0.42];
      A.el.r = [-1.62, s * 0.34, s * -0.16];
    }

    // Reset legs
    for (const s of [-1, 1]) {
      const L = this.joints.legs[s];
      L.hip.r = [0, 0, s * 0.068];
      L.knee.r = [0.02, 0, 0];
      L.foot.r = [0, s * -0.08, -s * 0.068 * 0.85];
    }

    // Reset tails & propeller hub
    this.tailPropellerHub.aa = null;
    this.tailPropellerHub.r = [0, 0, 0];
    for (const s of [-1, 1]) {
      this.joints.tails[s].r = [0, 0, 0];
    }

    // Reset eyes
    this.eyes.forEach(e => { e.s = [1, 1, 1]; });
  }

  update(dt, elapsedTime) {
    const t = elapsedTime;
    const safeDt = Math.min(0.05, Math.max(0, dt || 0.016));

    // Smooth weight blending toward current target (transitions in ~0.3s)
    const k = 1 - Math.exp(-safeDt * 7.0);
    this.W.walk += (this.target.walk - this.W.walk) * k;
    this.W.fly  += (this.target.fly  - this.W.fly)  * k;

    this.walkPh += safeDt * 7.5 * this.W.walk;
    const breath = Math.sin(t * 2.2);

    // Root elevation: fly hovering or walk cycle bobbing
    const flyHover = 0.68 + 0.10 * Math.sin(t * 3.5);
    const walkBob = Math.abs(Math.cos(this.walkPh)) * 0.06;
    this.root.t[1] = this.W.fly * flyHover + this.W.walk * walkBob;

    // Torso breathing & lean
    this.torso.t[1] = 1.05 + breath * 0.007 * (1 - this.W.fly);
    const breathScale = 1 + 0.015 * breath * (1 - this.W.fly);
    this.torso.s = [breathScale, 1, breathScale];

    this.torso.r[0] = this.W.fly * 0.36 + this.W.walk * 0.12;
    this.torso.r[1] = this.W.walk * Math.sin(this.walkPh) * 0.10;
    this.torso.r[2] = this.W.walk * Math.cos(this.walkPh) * 0.04;

    this.neck.r[0] = 0.03 * breath * (1 - this.W.fly) + this.W.fly * -0.22 - this.W.walk * 0.06;
    this.head.r[1] = 0.14 * Math.sin(t * 0.7) * (1 - this.W.walk * 0.6) * (1 - this.W.fly * 0.8);
    this.head.r[2] = 0.03 * Math.sin(t * 0.9 + 1) * (1 - this.W.fly);
    this.bangsGrp.r[0] = 0.03 * Math.sin(t * 3.0) - this.W.fly * 0.08;

    // Ears subtle twitch
    for (const s of [-1, 1]) {
      this.joints.ears[s].r[0] = 0.05 + Math.sin(t * 2.8 + s) * 0.06 * (1 - this.W.fly);
    }

    // Legs animation
    for (const [s, ph] of [[1, this.walkPh], [-1, this.walkPh + Math.PI]]) {
      const L = this.joints.legs[s];
      const spread = s * 0.068 * (1 - this.W.walk * 0.8);
      const walkHip = -Math.sin(ph) * 0.65;
      const walkKnee = Math.max(0, Math.cos(ph)) * 0.92;
      const walkFoot = -(walkHip + walkKnee) * 0.68;

      const hipX = walkHip * this.W.walk + 0.28 * this.W.fly;
      const kneeX = (walkKnee + 0.02) * this.W.walk + 0.65 * this.W.fly;
      const footX = walkFoot * this.W.walk + 0.52 * this.W.fly;

      L.hip.r = [hipX, 0, spread];
      L.knee.r = [kneeX, 0, 0];
      L.foot.r = [footX, s * -0.08, -spread * 0.85];
    }

    // Arms animation
    for (const s of [-1, 1]) {
      const A = this.joints.arms[s];
      let rx = 0.35 + 0.03 * breath, ry = s * -0.34, rz = s * 0.42;
      let elx = -1.62, ely = s * 0.34, elz = s * -0.16;

      // Blend walk: opposite to legs
      rx += (s * Math.sin(this.walkPh) * 0.72 - rx) * this.W.walk;
      rz += (s * 0.32 - rz) * this.W.walk;
      elx += (-1.10 - elx) * this.W.walk;

      // Blend fly: aerodynamic balance pose
      rx += (0.24 - rx) * this.W.fly;
      rz += (s * 0.82 - rz) * this.W.fly;
      elx += (-0.85 - elx) * this.W.fly;

      A.sh.r = [rx, ry, rz];
      A.el.r = [elx, ely, elz];
    }

    // Tail Propeller spin in fly mode
    this.spinPh += safeDt * (this.W.fly * 32.0 + this.W.walk * 6.0);
    if (this.W.fly < 0.02 && this.W.walk < 0.02) {
      // Return gently to rest angle
      const targetSpin = Math.round(this.spinPh / (Math.PI * 2)) * Math.PI * 2;
      this.spinPh += (targetSpin - this.spinPh) * Math.min(1, safeDt * 6);
    }
    this.tailPropellerHub.aa = { a: this.tailAxis, ang: this.spinPh };

    // Gentle wag in idle & walk
    const wag = Math.sin(t * 2.3) * 0.08 * (1 - this.W.fly);
    const bob = 0.04 * Math.sin(t * 3.0) * (1 - this.W.fly);
    this.joints.tails[1].r = [bob, wag, 0];
    this.joints.tails[-1].r = [bob, -wag, 0];

    // Blinking
    if (t > this.nextBlink) {
      this.blinkStart = t;
      this.nextBlink = t + 2.4 + Math.random() * 2.6;
    }
    const bt = (t - this.blinkStart) / 0.16;
    const sy = bt >= 0 && bt <= 1 ? 1 - 0.92 * Math.sin(Math.PI * bt) : 1;
    this.eyes.forEach(e => { e.s = [1, sy, 1]; });
  }

  render(renderContext) {
    const context = renderContext || {};
    const view = context.viewMatrix;
    const projection = context.projectionMatrix;
    const camera = context.cameraPosition;
    if (!view || !projection || !camera) {
      throw new Error('Tails renderContext requires viewMatrix, projectionMatrix, and cameraPosition');
    }

    const shader = context.shaderProgram || this.shader;
    let count = 0;

    this.root.traverse(Matrix4.identity(), (_node, _world, part, world) => {
      this.renderer.drawMesh(part.mesh, shader, {
        uModel: world,
        uView: view,
        uProj: projection,
        uNorm: normalMatrix(world),
        uColor: part.color,
        uCam: camera,
        uSpec: part.spec !== undefined ? part.spec : 0.10,
      });
      count += 1;
    });

    return count;
  }
}
