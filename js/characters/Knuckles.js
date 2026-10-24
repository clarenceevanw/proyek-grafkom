import { Matrix4, normalMatrix, normalize3 } from '../core/Matrix4.js';
import { MyObject, createPart } from '../core/MyObject.js';
import { ShaderProgram } from '../rendering/ShaderProgram.js';
import { Renderer } from '../rendering/Renderer.js';
import {
  KNUCKLES_ATTRIBUTE_BINDINGS,
  KNUCKLES_FRAGMENT_SOURCE,
  KNUCKLES_UNIFORMS,
  KNUCKLES_VERTEX_SOURCE,
} from '../shaders/knucklesShader.js';

const RED = [.86, .08, .18];
const TAN = [.87, .66, .47];
const WH = [.96, .96, .97];
const GR = [.3, .6, .3];
const YE = [.96, .8, .25];
const BK = [.05, .04, .06];
const PU = [.45, .15, .6];
const SOL = [.5, .5, .55];
const MO = [.22, .08, .1];
const RED2 = [.78, .06, .15];
const SOLW = [.88, .88, .9];
const WH2 = [.86, .86, .9];

const PI = Math.PI;
const TAU = Math.PI * 2;
const D = .25;
const CHEST_C = [0, .82, .08];
const CHEST_R = [.62, .44, .4];
const HC = .42;
const HR = [.86, .82, .78];
const UA = .55;
const FA = .5;
const AR = .1;

const sb = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cr = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const nm = v => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

function surf(f, nu, nv) {
  const P = [], N = [], Ix = [], e = .002;
  const cl = x => Math.min(1 - e, Math.max(e, x));
  for (let i = 0; i <= nu; i += 1) {
    for (let j = 0; j <= nv; j += 1) {
      const u = i / nu, v = j / nv, p = f(u, v), a = cl(u), b = cl(v);
      const n = nm(cr(sb(f(a + e, b), f(a - e, b)), sb(f(a, b + e), f(a, b - e))));
      P.push(p[0], p[1], p[2]);
      N.push(n[0], n[1], n[2]);
    }
  }
  for (let i = 0; i < nu; i += 1) {
    for (let j = 0; j < nv; j += 1) {
      const a = i * (nv + 1) + j, b = a + nv + 1;
      Ix.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { P, N, I: Ix };
}

function mg(...gs) {
  const r = { P: [], N: [], I: [] };
  for (const g of gs) {
    const o = r.P.length / 3;
    g.P.forEach(x => r.P.push(x));
    g.N.forEach(x => r.N.push(x));
    g.I.forEach(i => r.I.push(i + o));
  }
  return r;
}

const ell = (a, b, c) => surf((u, v) => {
  const t = u * TAU, p = v * Math.PI;
  return [a * Math.sin(p) * Math.cos(t), b * Math.cos(p), c * Math.sin(p) * Math.sin(t)];
}, 24, 16);

const epar = (a, b, h) => surf((u, v) => {
  const t = u * TAU;
  return [a * v * Math.cos(t), h * (1 - v * v), b * v * Math.sin(t)];
}, 20, 10);

const disc = (r, y) => surf((u, v) => [r * v * Math.cos(u * TAU), y, r * v * Math.sin(u * TAU)], 20, 2);

const cyl = (r, h) => mg(
  surf((u, v) => [r * Math.cos(u * TAU), (v - .5) * h, r * Math.sin(u * TAU)], 20, 2),
  disc(r, h / 2),
  disc(r, -h / 2),
);

const cone = (r, h) => mg(
  surf((u, v) => [r * (1 - v) * Math.cos(u * TAU), v * h, r * (1 - v) * Math.sin(u * TAU)], 20, 4),
  disc(r, 0),
);

const hpar = (a, b, k) => surf((u, v) => {
  const t = u * TAU, x = a * v * Math.cos(t), z = b * v * Math.sin(t);
  return [x, k * (x * x / a / a - z * z / b / b), z];
}, 24, 8);

const bz = (p, t) => {
  const s = 1 - t;
  return [0, 1, 2].map(i => s * s * s * p[0][i] + 3 * s * s * t * p[1][i] + 3 * s * t * t * p[2][i] + t * t * t * p[3][i]);
};

const tube = (p, r0, r1, ref) => surf((u, v) => {
  const c = bz(p, v);
  const T = nm(sb(bz(p, Math.min(1, v + .002)), bz(p, Math.max(0, v - .002))));
  const N = nm(cr(T, ref)), B = cr(T, N);
  const r = (r0 + (r1 - r0) * v) * Math.min(1, Math.sqrt(v * 14), Math.sqrt((1 - v) * 14));
  const a = u * TAU;
  return [0, 1, 2].map(i => c[i] + r * (N[i] * Math.cos(a) + B[i] * Math.sin(a)));
}, 14, 36);

const crescent = (R, A, hw, yb, lift) => {
  const cy = yb + R;
  return surf((u, v) => {
    const a = (u * 2 - 1) * A;
    const w = hw * Math.pow(Math.max(0, Math.cos(a / A * PI / 2)), .7) * (v * 2 - 1);
    const rr = R + w;
    const x = rr * Math.sin(a), y = cy - rr * Math.cos(a);
    const q = 1 - (x / CHEST_R[0]) ** 2 - ((y - CHEST_C[1]) / CHEST_R[1]) ** 2;
    const z = CHEST_C[2] + CHEST_R[2] * Math.sqrt(Math.max(0, q)) + lift;
    return [x, y, z];
  }, 32, 4);
};

const crownY = (x, z) => .42 + .82 * Math.sqrt(Math.max(0, 1 - (x / .86) ** 2 - (z / .78) ** 2));

const lockMesh = (x, a0, a1, len, w, th) => {
  const s = Math.sqrt(Math.max(0, 1 - (x / HR[0]) ** 2)), ry = HR[1] * s, rz = HR[2] * s;
  const P = a => [x, HC + ry * Math.cos(a), rz * Math.sin(a)];
  const dP = a => [0, -ry * Math.sin(a), rz * Math.cos(a)];
  const k = 4 / 3 * Math.tan((a1 - a0) / 4);
  const p0 = P(a0), p3 = P(a1), d0 = dP(a0), d1 = dP(a1);
  const c1 = [p0, p0.map((v, i) => v + k * d0[i]), p3.map((v, i) => v - k * d1[i]), p3];
  const T1 = nm(d1.map(v => -v));
  const tip = [p3[0] + x * .2, p3[1] - len, p3[2] - len * .3];
  const c2 = [
    p3,
    p3.map((v, i) => v + T1[i] * len * .4),
    [tip[0], tip[1] + len * .45, tip[2] + len * .12],
    tip,
  ];
  const C = v => v < .5 ? bz(c1, v * 2) : bz(c2, v * 2 - 1);
  return surf((u, v) => {
    const c = C(v);
    const T = nm(sb(C(Math.min(1, v + .002)), C(Math.max(0, v - .002))));
    const Bv = nm(sb([1, 0, 0], T.map(q => q * T[0])));
    const N = cr(Bv, T);
    const e1 = Math.sin(Math.min(1, v / .12) * PI / 2);
    const q = Math.max(0, (v - .5) / .5);
    const pf = e1 * Math.pow(1 - q, .75);
    const t = u * TAU;
    return [0, 1, 2].map(i => c[i] + N[i] * (.01 + th * pf * Math.cos(t)) + Bv[i] * w * (1 + .4 * v) * pf * Math.sin(t));
  }, 16, 64);
};

function toUploadableMesh(g) {
  return {
    p: new Float32Array(g.P),
    n: new Float32Array(g.N),
    i: new Uint16Array(g.I),
    c: g.I.length,
  };
}

const sgn = x => x ? Math.sign(x) : 1;

export class Knuckles {
  constructor(gl, resources = {}) {
    if (!gl) {
      throw new Error('Knuckles requires an active WebGL context');
    }
    this.gl = gl;
    this.renderer = resources.renderer || new Renderer(gl);
    this.shader = resources.shader || new ShaderProgram(gl, {
      vertexSource: KNUCKLES_VERTEX_SOURCE,
      fragmentSource: KNUCKLES_FRAGMENT_SOURCE,
      attributeBindings: KNUCKLES_ATTRIBUTE_BINDINGS,
      uniformNames: KNUCKLES_UNIFORMS,
    });

    this.joints = {};
    this.quills = [];
    this.eyes = [];
    this.legs = [];
    this.knees = [];
    this.arms = [];
    this.fores = [];
    this.hands = [];

    this.root = this.#buildHierarchy();
    this.animation = 'idle';
    this.reset();
  }

  #upload(g) {
    return this.renderer.uploadMesh(toUploadableMesh(g));
  }

  #buildHierarchy() {
    const node = (options = {}) => new MyObject(Object.assign({ rotationOrder: 'ZYX' }, options));
    const part = (mesh, color, t = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], spec = .25) =>
      createPart(mesh, t, s, color, { r, spec, rotationOrder: 'ZYX' });

    const root = node({ name: 'root' });
    const model = node({ name: 'knucklesModel', s: [1.2, 1.2, 1.2] });
    root.addChild(model);

    const tor = node({ name: 'tor', t: [0, 1.45 + 2 * D, 0] });
    const head = node({ name: 'head', t: [0, 1.15, 0] });
    const tailG = node({ name: 'tailG', t: [0, .05, -.3] });

    model.addChild(tor);

    // Torso body & chest
    const bodyMesh = this.#upload(ell(.46, .7, .37));
    const bodyNode = node({ name: 'body', t: [0, .5, 0], parts: [part(bodyMesh, RED)] });
    tor.addChild(bodyNode);
    this.bodyNode = bodyNode;

    const chestMesh = this.#upload(ell(CHEST_R[0], CHEST_R[1], CHEST_R[2]));
    const shoulderMesh = this.#upload(ell(.24, .2, .24));
    const crescentMesh = this.#upload(crescent(.34, .95, .07, .77, .02));

    tor.parts.push(
      part(chestMesh, RED, CHEST_C),
      part(shoulderMesh, RED, [-.5, .95, 0]),
      part(shoulderMesh, RED, [.5, .95, 0]),
      part(crescentMesh, WH, [0, 0, 0], [0, 0, 0], [1, 1, 1], .5),
    );

    tor.addChild(head);
    tor.addChild(tailG);

    // Tail
    const tailMesh = this.#upload(tube([[0, 0, 0], [0, -.15, -.25], [0, -.02, -.5], [0, .18, -.65]], .09, .01, [1, 0, 0]));
    tailG.parts.push(part(tailMesh, RED));

    // Head
    const headMesh = this.#upload(ell(.86, .82, .78));
    const muzzle1Mesh = this.#upload(ell(.6, .42, .3));
    const muzzle2Mesh = this.#upload(ell(.46, .32, .38));
    const noseMesh = this.#upload(ell(.11, .09, .09));
    const mouthMesh = this.#upload(tube([[-.34, 0, .8], [-.15, -.1, .92], [.15, -.13, .92], [.42, .2, .8]], .028, .028, [0, 0, 1]));

    head.parts.push(
      part(headMesh, RED, [0, .42, 0]),
      part(muzzle1Mesh, TAN, [0, .28, .5]),
      part(muzzle2Mesh, TAN, [0, .2, .62]),
      part(noseMesh, BK, [0, .32, .97], [0, 0, 0], [1, 1, 1], .8),
      part(mouthMesh, MO),
    );

    // Eyes and side quills
    const eyeWhiteMesh = this.#upload(ell(.23, .3, .1));
    const eyeIrisMesh = this.#upload(ell(.12, .2, .05));
    const eyePupilMesh = this.#upload(ell(.055, .12, .03));
    const eyeHlMesh = this.#upload(ell(.028, .035, .015));
    const eyelidMesh = this.#upload(ell(.32, .13, .15));

    for (const s of [-1, 1]) {
      const eyeNode = node({ name: s > 0 ? 'eyeR' : 'eyeL', t: [0, .62, 0] });
      eyeNode.parts.push(
        part(eyeWhiteMesh, WH, [s * .29, 0, .7], [0, 0, 0], [1, 1, 1], .6),
        part(eyeIrisMesh, PU, [s * .25, -.02, .76]),
        part(eyePupilMesh, BK, [s * .25, -.02, .79], [0, 0, 0], [1, 1, 1], .8),
        part(eyeHlMesh, WH, [s * .225, .05, .812], [0, 0, 0], [1, 1, 1], .9),
      );
      head.addChild(eyeNode);
      this.eyes.push(eyeNode);

      const sideQuill1 = this.#upload(tube([[s * .7, .8, .15], [s * 1.0, .65, .1], [s * .95, .05, -.05], [s * .82, -.45, -.25]], .22, .02, [1, 0, 0]));
      const sideQuill2 = this.#upload(tube([[s * .62, .55, .45], [s * .9, .42, .4], [s * .88, -.05, .3], [s * .78, -.4, .2]], .14, .015, [1, 0, 0]));

      head.parts.push(
        part(eyelidMesh, RED, [s * .3, .84, .68], [0, 0, s * .35]),
        part(sideQuill1, RED, [0, 0, 0], [0, 0, 0], [1, 1, 1], .3),
        part(sideQuill2, RED2, [0, 0, 0], [0, 0, 0], [1, 1, 1], .3),
      );
    }

    // Main quills (paraboloids, bottom layer)
    const mainHeights = [1.6, 1.8, 1.95, 1.8, 1.6];
    const mainYs = [.7, .85, .9, .85, .7];
    [-.5, -.25, 0, .25, .5].forEach((x, i) => {
      const qMesh = this.#upload(epar(.3, .26, mainHeights[i]));
      const qNode = node({
        name: `quillMain_${i}`,
        t: [x, mainYs[i], -.35],
        r: [-3.0, -sgn(x) * Math.PI / 2, 0],
        parts: [part(qMesh, RED)],
      });
      qNode.r0 = [...qNode.r];
      this.quills.push(qNode);
      head.addChild(qNode);
    });

    // Back quills (paraboloids)
    const backQuillsDef = [
      [-.28, [-.65, -.4, -.15, .15, .4, .65], 1.5],
      [-.5, [-.55, -.3, -.05, .2, .45], 1.3],
      [-.66, [-.4, -.15, .15, .4], 1.05],
      [-.78, [-.18, .18], .8],
    ];
    let backIdx = 0;
    backQuillsDef.forEach(([z, xs, h]) => {
      const qMesh = this.#upload(epar(.24, .21, h));
      xs.forEach(x => {
        const qNode = node({
          name: `quillBack_${backIdx}`,
          t: [x, crownY(x, z) - .05, z],
          r: [-3.0, -sgn(x) * Math.PI / 2, 0],
          parts: [part(qMesh, RED)],
        });
        qNode.r0 = [...qNode.r];
        this.quills.push(qNode);
        head.addChild(qNode);
        backIdx += 1;
      });
    });

    // Top locks (curved Bezier surface dreadlocks)
    const lockDefs = [
      { x: 0, a0: .8, a1: -1.35, len: 1.4, w: .17, th: .1, col: RED },
      { x: -.27, a0: .85, a1: -1.35, len: 1.3, w: .17, th: .1, col: RED2 },
      { x: .27, a0: .85, a1: -1.35, len: 1.3, w: .17, th: .1, col: RED2 },
      { x: -.52, a0: .95, a1: -1.3, len: 1.15, w: .16, th: .09, col: RED },
      { x: .52, a0: .95, a1: -1.3, len: 1.15, w: .16, th: .09, col: RED },
      { x: -.74, a0: 1.05, a1: -.9, len: 1.0, w: .13, th: .08, col: RED2 },
      { x: .74, a0: 1.05, a1: -.9, len: 1.0, w: .13, th: .08, col: RED2 },
    ];
    lockDefs.forEach(ld => {
      const g = lockMesh(ld.x, ld.a0, ld.a1, ld.len, ld.w, ld.th);
      const mesh = this.#upload(g);
      head.parts.push(part(mesh, ld.col, [0, 0, 0], [0, 0, 0], [1, 1, 1], .3));
    });

    // Arms
    const shoulderJointMesh = this.#upload(ell(AR * 1.1, AR * 1.1, AR * 1.1));
    const upperArmMesh = this.#upload(cyl(AR, UA));
    const elbowJointMesh = this.#upload(ell(AR, AR, AR));
    const forearmMesh = this.#upload(cyl(AR, FA));
    const wristJointMesh = this.#upload(ell(AR, AR * 1.3, AR));

    const cuffMesh = this.#upload(epar(.31, .31, .3));
    const fistMesh = this.#upload(ell(.38, .42, .4));
    const finger1Mesh = this.#upload(ell(.1, .15, .075));
    const finger2Mesh = this.#upload(ell(.1, .16, .075));
    const finger3Mesh = this.#upload(ell(.1, .14, .075));
    const thumbMesh = this.#upload(ell(.11, .08, .17));
    const spikeMesh = this.#upload(cone(.1, .3));

    for (const s of [-1, 1]) {
      const arm = node({ name: s > 0 ? 'armR' : 'armL', t: [s * .6, .85, 0], r: [0, 0, s * .15] });
      const fore = node({ name: s > 0 ? 'foreR' : 'foreL', t: [0, -UA, 0] });
      const hand = node({ name: s > 0 ? 'handR' : 'handL', t: [0, -FA, 0] });

      arm.parts.push(
        part(shoulderJointMesh, RED),
        part(upperArmMesh, RED, [0, -UA / 2, 0]),
      );

      fore.parts.push(
        part(elbowJointMesh, RED),
        part(forearmMesh, RED, [0, -FA / 2, 0]),
        part(wristJointMesh, RED, [0, -FA - .02, 0]),
      );

      hand.parts.push(
        part(cuffMesh, WH, [0, .16, 0], [PI, 0, 0], [1, 1, 1], .4),
        part(fistMesh, WH, [0, -.32, .03], [0, 0, 0], [1, 1, 1], .4),
        part(finger1Mesh, WH2, [-s * .3, -.4, .24], [0, 0, 0], [1, 1, 1], .35),
        part(finger2Mesh, WH2, [-s * .33, -.4, .09], [0, 0, 0], [1, 1, 1], .35),
        part(finger2Mesh, WH2, [-s * .33, -.4, -.07], [0, 0, 0], [1, 1, 1], .35),
        part(finger3Mesh, WH2, [-s * .3, -.4, -.22], [0, 0, 0], [1, 1, 1], .35),
        part(thumbMesh, WH2, [-s * .15, -.25, .4], [.35, 0, 0], [1, 1, 1], .35),
        part(spikeMesh, WH, [s * .36, -.3, .13], [.5, 0, -s * PI / 2]),
        part(spikeMesh, WH, [s * .36, -.3, -.12], [.5, 0, -s * PI / 2]),
      );

      fore.addChild(hand);
      arm.addChild(fore);
      tor.addChild(arm);

      this.arms.push(arm);
      this.fores.push(fore);
      this.hands.push(hand);
    }

    // Legs
    const hipJointMesh = this.#upload(ell(.18, .2, .18));
    const upperLegMesh = this.#upload(cyl(.15, .7 + D));
    const kneeJointMesh = this.#upload(ell(.15, .15, .15));
    const lowerLegMesh = this.#upload(cyl(.12, .5 + D));

    const sockMesh = this.#upload(cyl(.24, .58));
    const shoeRedMesh = this.#upload(ell(.52, .29, .74));
    const shoeYellowMesh = this.#upload(ell(.53, .29, .37));
    const soleWhiteMesh = this.#upload(cyl(1, .08));
    const soleGrayMesh = this.#upload(cyl(1, .05));
    const soleTreadMesh = this.#upload(hpar(.42, .64, .02));

    const laceMeshes = [.34, .44, .54, .64].map(z => {
      const k = Math.sqrt(Math.max(0, 1 - ((z - .2) / .74) ** 2));
      return {
        mesh: this.#upload(ell(.3 * k, .035, .04)),
        t: [0, -.55 + .29 * k - .01, z],
      };
    });

    for (const s of [-1, 1]) {
      const leg = node({ name: s > 0 ? 'legR' : 'legL', t: [s * .3, 1.45 + 2 * D, 0], r: [0, 0, s * .03] });
      const knee = node({ name: s > 0 ? 'kneeR' : 'kneeL', t: [0, -.7 - D, 0] });
      const foot = node({ name: s > 0 ? 'footR' : 'footL', t: [0, -D, 0] });

      leg.parts.push(
        part(hipJointMesh, RED),
        part(upperLegMesh, RED, [0, -(.7 + D) / 2, 0]),
      );

      knee.parts.push(
        part(kneeJointMesh, RED),
        part(lowerLegMesh, RED, [0, -(.5 + D) / 2, 0]),
      );

      foot.parts.push(
        part(sockMesh, GR, [0, -.43, 0]),
        part(shoeRedMesh, RED, [0, -.55, .2]),
        part(shoeYellowMesh, YE, [0, -.55, .18]),
        part(soleWhiteMesh, SOLW, [0, -.76, .2], [0, 0, 0], [.45, 1, .68], .3),
        part(soleGrayMesh, SOL, [0, -.825, .2], [0, 0, 0], [.44, 1, .67], .15),
        part(soleTreadMesh, SOL, [0, -.855, .2], [0, 0, 0], [1, 1, 1], .15),
      );

      laceMeshes.forEach(l => {
        foot.parts.push(part(l.mesh, BK, l.t));
      });

      knee.addChild(foot);
      leg.addChild(knee);
      model.addChild(leg);

      this.legs.push(leg);
      this.knees.push(knee);
    }

    Object.assign(this.joints, {
      root,
      model,
      tor,
      head,
      tailG,
      armL: this.arms[0],
      armR: this.arms[1],
      foreL: this.fores[0],
      foreR: this.fores[1],
      handL: this.hands[0],
      handR: this.hands[1],
      legL: this.legs[0],
      legR: this.legs[1],
      kneeL: this.knees[0],
      kneeR: this.knees[1],
    });

    return root;
  }

  getRoot() {
    return this.root;
  }

  setAnimation(mode, elapsedTime = 0) {
    const validModes = [
      'idle',
      'walk',
      'run',
      'jump',
      'lompat',
      'punch',
      'tinju',
      'pushup',
      'translate',
      'walk-forward',
      'rotate',
      'scale',
      'arbitrary',
      'hierarchical',
    ];
    if (!validModes.includes(mode)) {
      throw new Error(`Unsupported Knuckles animation mode: ${mode}`);
    }
    this.animation = mode;
    this.modeStartTime = typeof elapsedTime === 'number' ? elapsedTime : 0;
  }

  reset() {
    this.animation = 'idle';
    this.modeStartTime = 0;
    this.#resetTransforms();
  }

  #resetTransforms() {
    this.root.t = [0, 0, 0];
    this.root.r = [0, 0, 0];
    this.root.s = [1, 1, 1];
    this.root.aa = null;

    this.joints.model.t = [0, 0, 0];
    this.joints.model.r = [0, 0, 0];
    this.joints.model.s = [1.2, 1.2, 1.2];

    this.joints.tor.t = [0, 1.45 + 2 * D, 0];
    this.joints.tor.r = [0, 0, 0];

    this.joints.head.t = [0, 1.15, 0];
    this.joints.head.r = [0, 0, 0];

    this.joints.tailG.r = [0, 0, 0];

    for (let i = 0; i < 2; i += 1) {
      const s = i ? 1 : -1;
      this.legs[i].r = [0, 0, s * .03];
      this.knees[i].r = [0, 0, 0];
      this.arms[i].r = [0, 0, s * .15];
      this.fores[i].r = [0, 0, 0];
      this.hands[i].r = [0, 0, 0];
    }

    if (this.bodyNode) this.bodyNode.s = [1, 1, 1];
    this.eyes.forEach(e => { e.s = [1, 1, 1]; });
    this.quills.forEach(q => { q.r = [...q.r0]; });
  }

  update(_dt, elapsedTime) {
    this.#resetTransforms();
    const time = elapsedTime;
    const mode = this.animation;

    // Breathing (subtle body scaling)
    const isWalking = mode === 'walk' || mode === 'translate' || mode === 'walk-forward';
    const isFast = mode === 'run' || mode === 'punch' || mode === 'tinju' || mode === 'pushup';
    const br = Math.sin(time * (isFast ? 6.0 : (isWalking ? 4.5 : 2.2)));
    if (this.bodyNode) {
      this.bodyNode.s = [1 + .022 * br, 1 + .015 * br, 1 + .022 * br];
    }

    // Blinking
    const ph2 = time % 3.2;
    const bl = ph2 > 3.05 ? Math.sin((ph2 - 3.05) / .15 * PI) : 0;
    this.eyes.forEach(e => {
      e.s = [1, Math.max(0.08, 1 - .92 * bl), 1];
    });

    // Quills gentle sway
    const f = (isWalking || isFast || mode === 'jump' || mode === 'lompat') ? 2.5 : 1;
    this.quills.forEach((q, i) => {
      q.r = [
        q.r0[0] + .06 * f * Math.sin(time * 2 * f + i),
        q.r0[1],
        q.r0[2] + .05 * f * Math.sin(time * 1.7 * f + i * 1.3),
      ];
    });

    if (mode === 'idle') {
      this.joints.tor.r = [0, 0, 0];
      this.joints.head.r = [
        0,
        .3 * Math.sin(time * .6),
        .05 * Math.sin(time * 1.3),
      ];
      this.joints.tailG.r = [
        .15 * Math.sin(time * 3),
        .4 * Math.sin(time * 2.5),
        0,
      ];
      for (let i = 0; i < 2; i += 1) {
        const s = i ? 1 : -1;
        this.arms[i].r = [.05 * Math.sin(time * 2), 0, s * .15];
      }
    } else if (isWalking) {
      const w = 6;
      const S = Math.sin(time * w);
      const C = Math.cos(time * w);
      const amp = 0.6;

      // Vertical bounce
      this.joints.model.t[1] = Math.abs(S) * 0.07;

      // Torso lean and twist
      this.joints.tor.r = [0.08, 0.15 * S, 0];

      // Head stays stable
      this.joints.head.r = [0, 0, 0];

      // Alternating limbs:
      // leg 0 (left) vs leg 1 (right)
      for (let i = 0; i < 2; i += 1) {
        const d = i ? -1 : 1;
        const s = i ? 1 : -1;
        this.legs[i].r = [d * S * amp, 0, s * .03];
        this.knees[i].r = [Math.max(0, -d * C) * amp * 1.4, 0, 0];
        this.arms[i].r = [-d * S * amp * 1.05, 0, s * .12];
        this.fores[i].r = [-0.4, 0, 0];
      }

      this.joints.tailG.r = [
        .15 * Math.sin(time * 3),
        .4 * Math.sin(time * 7),
        0,
      ];

      // If forward walking: translate root along Z
      if (mode === 'translate' || mode === 'walk-forward') {
        const z = 2.0 * Math.sin(time * 0.8);
        this.root.t = [0, 0, z];
      }
    } else if (mode === 'run') {
      const w = 20;
      const S = Math.sin(time * w);
      const C = Math.cos(time * w);
      const amp = 1.3;

      this.joints.model.t[1] = Math.abs(S) * 0.22;
      this.joints.tor.r = [0.5, 0.15 * S, 0];
      this.joints.head.r = [-0.25, 0.06 * Math.sin(time * 10), 0];

      for (let i = 0; i < 2; i += 1) {
        const d = i ? -1 : 1;
        const sd = i ? 1 : -1;
        this.legs[i].r = [d * S * amp, 0, sd * 0.03];
        this.knees[i].r = [Math.max(0, -d * C) * amp * 1.4, 0, 0];
        this.arms[i].r = [-d * S * amp * 1.05, 0, sd * 0.12];
        this.fores[i].r = [-1.5, 0, 0];
      }
      this.joints.tailG.r = [0.15 * Math.sin(time * 3), 0.4 * Math.sin(time * 7), 0];
    } else if (mode === 'jump' || mode === 'lompat') {
      const ph = (time / 1.8) % 1;
      const sm3 = x => x * x * (3 - 2 * x);
      let bend = 0;
      let air = false;
      let u = 0;

      if (ph < 0.2) {
        bend = sm3(ph / 0.2);
      } else if (ph < 0.7) {
        air = true;
        u = (ph - 0.2) / 0.5;
      } else {
        const e = (ph - 0.7) / 0.3;
        bend = 0.8 * Math.sin(PI * Math.min(1, e * 1.5));
      }

      const tuck = air ? Math.sin(PI * u) : 0;
      const raise = air ? Math.min(1, u * 4) * Math.min(1, (1 - u) * 4) : 0;

      this.joints.model.t[1] = -0.2 * bend + (air ? 1.4 * 4 * u * (1 - u) : 0);
      this.joints.model.r = [0, air ? u * TAU : 0, 0];
      this.joints.tor.r = [0.35 * bend, 0, 0];
      this.joints.head.r = [0.1 * bend - 0.15 * raise, 0, 0];

      for (let i = 0; i < 2; i += 1) {
        const sd = i ? 1 : -1;
        this.legs[i].r = [-0.5 * bend - 0.4 * tuck, 0, sd * 0.03];
        this.knees[i].r = [1.0 * bend + 0.8 * tuck, 0, 0];
        this.arms[i].r = [0.7 * bend - 2.7 * raise, 0, sd * (0.15 + 0.3 * raise)];
        this.fores[i].r = [-0.3 * raise, 0, 0];
      }
      this.joints.tailG.r = [0.15 * Math.sin(time * 3), 0.4 * Math.sin(time * 6), 0];
    } else if (mode === 'punch' || mode === 'tinju') {
      const L = (a, b, e) => a.map((v, i) => v + (b[i] - v) * e);
      const env = x => {
        const e = x < 0.22 ? x / 0.22 : (x < 0.32 ? 1 : Math.max(0, 1 - (x - 0.32) / 0.4));
        return e * e * (3 - 2 * e);
      };

      const bob = Math.abs(Math.sin(time * 7));
      const seq = [[0, 'jab'], [1, 'cross'], [0, 'upper'], [1, 'cross']];
      const c = time * 2.4;
      const beat = Math.floor(c) % 6;
      const ph = c % 1;

      this.joints.model.t[1] = -0.12 + 0.04 * bob;
      this.joints.model.r = [0, 0.35, 0];
      this.joints.tor.r = [0.12, 0, 0];
      this.joints.head.r = [0.05, -0.25, 0];

      this.legs[0].r = [-0.35, 0, -0.12];
      this.legs[1].r = [0.25, 0, 0.12];
      this.knees[0].r = [0.45 + 0.08 * bob, 0, 0];
      this.knees[1].r = [0.4 + 0.08 * bob, 0, 0];

      const guardA = sd => [-0.9, -sd * 0.15, sd * 0.3];
      const guardF = -1.7;
      for (let i = 0; i < 2; i += 1) {
        const sd = i ? 1 : -1;
        this.arms[i].r = guardA(sd);
        this.fores[i].r = [guardF, 0, 0];
      }

      if (beat < 4) {
        const [idx, type] = seq[beat];
        const sd = idx ? 1 : -1;
        const e = env(ph);

        if (type === 'upper') {
          this.arms[idx].r = L(guardA(sd), [-1.35, -sd * 0.3, sd * 0.1], e);
          this.fores[idx].r = [guardF + (-1.6 - guardF) * e, 0, 0];
          this.joints.tor.r = [0.12 - 0.18 * e, -sd * 0.35 * e, 0];
          this.joints.model.t[1] += 0.06 * e;
        } else {
          const tw = type === 'cross' ? 0.6 : 0.3;
          this.arms[idx].r = L(guardA(sd), [-1.55, -sd * 0.15, sd * 0.05], e);
          this.fores[idx].r = [guardF + (-0.05 - guardF) * e, 0, 0];
          this.joints.tor.r = [0.12 + 0.1 * e, -sd * tw * e, 0];
          this.joints.head.r = [0.05, -0.25 + sd * tw * 0.5 * e, 0];
          if (type === 'cross') this.knees[1].r[0] += 0.15 * e;
        }
      } else {
        const wv = Math.sin(time * 4);
        this.joints.tor.r = [0.12 + 0.05 * Math.abs(wv), 0, 0.12 * wv];
        this.joints.head.r = [0.05, -0.25, -0.06 * wv];
      }
      this.joints.tailG.r = [0.15 * Math.sin(time * 4), 0.4 * Math.sin(time * 6), 0];
    } else if (mode === 'pushup') {
      const relT = Math.max(0, time - (this.modeStartTime || 0));
      const rp = Math.min(1, relT / 0.8);
      const rs = rp * rp * (3 - 2 * rp);
      const cyc = 0.5 - 0.5 * Math.cos(relT * TAU / 2.6);
      const th = rs * (1.27 + 0.18 * cyc);
      const c = Math.cos(th);
      const s = Math.sin(th);

      const lowShoe = Math.min(
        -0.115 * c - 0.88 * s,
        (c - s) * 0.2 - Math.sqrt((c * 0.29) ** 2 + (s * 0.74) ** 2)
      );
      const lift = -0.08 - lowShoe;

      this.joints.model.t = [0, lift, 0];
      this.joints.model.r = [th, 0, 0];
      this.joints.tor.r = [0, 0, 0];
      this.joints.head.r = [-th + 0.2 * rs, 0, 0];

      const L1 = UA;
      const L2 = FA + 0.74;
      const dd = Math.min(L1 + L2 - 0.002, 2.83 * c + lift + 0.08);
      const al = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd))));
      const ga = Math.asin(Math.max(-1, Math.min(1, L1 * Math.sin(al) / L2)));

      for (let i = 0; i < 2; i += 1) {
        const sd = i ? 1 : -1;
        this.legs[i].r = [0, 0, sd * 0.03];
        this.knees[i].r = [0, 0, 0];
        this.arms[i].r = [al - th, 0, sd * 0.04];
        this.fores[i].r = [-ga - al, 0, 0];
        this.hands[i].r = [ga, 0, 0];
      }
      this.joints.tailG.r = [0.1 * Math.sin(time * 2), 0.2 * Math.sin(time * 3), 0];
    } else if (mode === 'rotate') {
      this.root.r = [0, (time * 1.6) % TAU, 0];
      this.joints.tor.r = [0, 0, 0];
      this.joints.head.r = [0, 0, 0];
      this.joints.tailG.r = [.15 * Math.sin(time * 3), .4 * Math.sin(time * 2.5), 0];
    } else if (mode === 'scale') {
      const sc = 1 + 0.35 * Math.sin(time * 2);
      this.root.s = [sc, sc, sc];
      this.joints.tor.r = [0, 0, 0];
      this.joints.head.r = [0, .3 * Math.sin(time * .6), .05 * Math.sin(time * 1.3)];
      this.joints.tailG.r = [.15 * Math.sin(time * 3), .4 * Math.sin(time * 2.5), 0];
    } else if (mode === 'arbitrary') {
      const axis = normalize3([1, 1, 0]);
      this.root.aa = { a: axis, ang: (time * 1.6) % TAU };
      this.joints.tor.r = [0, 0, 0];
      this.joints.head.r = [0, 0, 0];
    } else if (mode === 'hierarchical') {
      // Joint chain: shoulder -> elbow -> wrist, hip -> knee
      const sw = Math.sin(time * 2);
      const cw = Math.cos(time * 2);
      this.arms[0].r = [sw * 0.9, 0, -0.2];
      this.fores[0].r = [-0.6 + Math.sin(time * 3 + 1) * 0.5, 0, 0];
      this.hands[0].r = [Math.sin(time * 4) * 0.4, 0, 0];

      this.arms[1].r = [-sw * 0.9, 0, 0.2];
      this.fores[1].r = [-0.6 - Math.sin(time * 3 + 1) * 0.5, 0, 0];
      this.hands[1].r = [-Math.sin(time * 4) * 0.4, 0, 0];

      this.legs[0].r = [sw * 0.6, 0, -0.05];
      this.knees[0].r = [Math.max(0, -cw) * 0.9, 0, 0];
      this.legs[1].r = [-sw * 0.6, 0, 0.05];
      this.knees[1].r = [Math.max(0, cw) * 0.9, 0, 0];

      this.joints.tor.r = [0.1 * sw, 0.2 * cw, 0];
      this.joints.head.r = [0.15 * cw, -0.3 * sw, 0];
      this.joints.tailG.r = [.2 * Math.sin(time * 4), .4 * Math.sin(time * 5), 0];
    }
  }

  getModeInfo() {
    return { mode: this.animation };
  }

  render(renderContext) {
    const context = renderContext || {};
    const view = context.viewMatrix;
    const projection = context.projectionMatrix;
    const camera = context.cameraPosition;
    if (!view || !projection || !camera) {
      throw new Error('Knuckles renderContext needs viewMatrix, projectionMatrix, and cameraPosition');
    }

    let count = 0;
    this.root.traverse(Matrix4.identity(), (_node, _world, part, world) => {
      this.renderer.drawMesh(part.mesh, this.shader, {
        uModel: world,
        uView: view,
        uProj: projection,
        uNorm: normalMatrix(world),
        uColor: part.color,
        uCam: camera,
        uSpec: part.spec !== undefined ? part.spec : 0.25,
      });
      count += 1;
    });
    return count;
  }
}
