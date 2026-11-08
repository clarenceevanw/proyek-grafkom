import { normalMatrix, normalize3, cross3 } from '../core/Matrix4.js';
import { TAU, smoothStep } from '../core/MathUtils.js';
import { MyObject, createPart } from '../core/MyObject.js';
import { evaluateBezier3D, makeParametricSurface, mergeMeshes } from '../core/Geometry.js';
import { assertRenderContext } from '../rendering/Renderer.js';

const COLORS = {
  red: [.86, .08, .18],
  redDark: [.78, .06, .15],
  tan: [.87, .66, .47],
  white: [.96, .96, .97],
  gloveShade: [.86, .86, .9],
  sockGreen: [.3, .6, .3],
  yellow: [.96, .8, .25],
  black: [.05, .04, .06],
  purple: [.45, .15, .6],
  soleWhite: [.88, .88, .9],
  soleGray: [.5, .5, .55],
  mouth: [.22, .08, .1],
};

const PI = Math.PI;

// DEBUG SEMENTARA: warna per jenis bentuk, aktif dengan ?debugShapes=1 di URL.
// Warna asli part tidak diubah; penimpaan hanya terjadi saat render.
export const DEBUG_SHAPE_LABELS = {
  ellipsoid: 'Ellipsoid - kepala, badan, mata, hidung, kepalan, jari, sendi, sepatu, tali, kelopak',
  cylinder: 'Cylinder - lengan, paha, betis, kaos kaki, sol',
  quillMain: 'Elliptic paraboloid - duri utama',
  quillBack: 'Elliptic paraboloid - duri belakang',
  cuff: 'Elliptic paraboloid - manset sarung tangan',
  cone: 'Cone - tonjolan tinju',
  hyperbolic: 'Hyperbolic paraboloid - alas telapak sepatu',
  bezierTube: 'Tabung Bezier 3D - mulut, ekor, helai samping',
  hairLock: 'Pita Bezier (hairLockMesh) - helai atas',
  crescent: 'Permukaan parametrik - tanda dada',
};
export const DEBUG_SHAPE_COLORS = {
  ellipsoid: [.7, .7, .7],
  cylinder: [0, .4, 1],
  quillMain: [1, 1, 0],
  quillBack: [1, .5, 0],
  cuff: [.6, .2, 1],
  cone: [0, 1, 1],
  hyperbolic: [1, 0, 1],
  bezierTube: [0, 1, 0],
  hairLock: [1, 1, 1],
  crescent: [1, 0, 0],
};
const isDebugShapesEnabled = () => {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('debugShapes') === '1';
  } catch {
    return false;
  }
};

// DEBUG SEMENTARA: ?debugNodes=1 mewarnai part milik node tor (merah) dan body (hijau).
const DEBUG_NODE_COLORS = { tor: [1, 0, 0], body: [0, 1, 0] };
const isDebugNodesEnabled = () => {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('debugNodes') === '1';
  } catch {
    return false;
  }
};

// Ukuran tubuh (unit model, sebelum skala 1.2 pada node model).
const LEG_EXTRA = .25;                       // tambahan panjang kaki
const HIP_Y = 1.45 + 2 * LEG_EXTRA;          // tinggi pinggul/torso dari tanah
const UPPER_LEG_LENGTH = .7 + LEG_EXTRA;
const LOWER_LEG_LENGTH = .5 + LEG_EXTRA;
const MODEL_SCALE = 1.2;
const CHEST_CENTER = [0, .82, .08];
const CHEST_RADII = [.62, .44, .4];
const HEAD_CENTER_Y = .42;
const HEAD_RADII = [.86, .82, .78];
const UPPER_ARM_LENGTH = .55;
const FOREARM_LENGTH = .5;
const ARM_RADIUS = .1;

/* ------------------------------------------------------------------
 * Generator mesh khusus Knuckles. Semuanya permukaan parametrik
 * (u, v) -> [x, y, z] yang dibuat dengan makeParametricSurface.
 * ------------------------------------------------------------------ */

const subtract3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const signOrPositive = (x) => (x ? Math.sign(x) : 1);

// Ellipsoid dengan jari-jari a (x), b (y), c (z).
const ellipsoidMesh = (a, b, c) => makeParametricSurface((u, v) => {
  const t = u * TAU;
  const p = v * Math.PI;
  return [a * Math.sin(p) * Math.cos(t), b * Math.cos(p), c * Math.sin(p) * Math.sin(t)];
}, 24, 16);

// Paraboloid eliptik: puncak di y = h, alas elips (a, b) di y = 0.
const paraboloidMesh = (a, b, h) => makeParametricSurface((u, v) => {
  const t = u * TAU;
  return [a * v * Math.cos(t), h * (1 - v * v), b * v * Math.sin(t)];
}, 20, 10);

const discMesh = (r, y) => makeParametricSurface((u, v) => [r * v * Math.cos(u * TAU), y, r * v * Math.sin(u * TAU)], 20, 2);

// Silinder tertutup setinggi h, berpusat di origin.
const cylinderMesh = (r, h) => mergeMeshes(
  makeParametricSurface((u, v) => [r * Math.cos(u * TAU), (v - .5) * h, r * Math.sin(u * TAU)], 20, 2),
  discMesh(r, h / 2),
  discMesh(r, -h / 2),
);

// Kerucut dengan alas di y = 0 dan puncak di y = h.
const coneMesh = (r, h) => mergeMeshes(
  makeParametricSurface((u, v) => [r * (1 - v) * Math.cos(u * TAU), v * h, r * (1 - v) * Math.sin(u * TAU)], 20, 4),
  discMesh(r, 0),
);

// Paraboloid hiperbolik (pelana) y = k (x^2/a^2 - z^2/b^2). Dipakai untuk sol sepatu.
const hyperbolicParaboloidMesh = (a, b, k) => makeParametricSurface((u, v) => {
  const t = u * TAU;
  const x = a * v * Math.cos(t);
  const z = b * v * Math.sin(t);
  return [x, k * (x * x / a / a - z * z / b / b), z];
}, 24, 8);

// Tabung di sepanjang kurva Bezier 3D `points`, jari-jari r0 -> r1, ujung membulat.
// `ref` = vektor acuan untuk menghitung normal penampang.
const curveTubeMesh = (points, r0, r1, ref) => makeParametricSurface((u, v) => {
  const c = evaluateBezier3D(points, v);
  const T = normalize3(subtract3(evaluateBezier3D(points, Math.min(1, v + .002)), evaluateBezier3D(points, Math.max(0, v - .002))));
  const N = normalize3(cross3(T, ref));
  const B = cross3(T, N);
  const r = (r0 + (r1 - r0) * v) * Math.min(1, Math.sqrt(v * 14), Math.sqrt((1 - v) * 14));
  const a = u * TAU;
  return [0, 1, 2].map((i) => c[i] + r * (N[i] * Math.cos(a) + B[i] * Math.sin(a)));
}, 14, 36);

// Pita putih berbentuk bulan sabit di dada, ditempel mengikuti permukaan
// ellipsoid dada (z dihitung dari persamaan ellipsoid).
const chestCrescentMesh = (R, A, halfWidth, bottomY, lift) => {
  const centerY = bottomY + R;
  return makeParametricSurface((u, v) => {
    const a = (u * 2 - 1) * A;
    const w = halfWidth * Math.pow(Math.max(0, Math.cos(a / A * PI / 2)), .7) * (v * 2 - 1);
    const rr = R + w;
    const x = rr * Math.sin(a);
    const y = centerY - rr * Math.cos(a);
    const q = 1 - (x / CHEST_RADII[0]) ** 2 - ((y - CHEST_CENTER[1]) / CHEST_RADII[1]) ** 2;
    const z = CHEST_CENTER[2] + CHEST_RADII[2] * Math.sqrt(Math.max(0, q)) + lift;
    return [x, y, z];
  }, 32, 4);
};

// Tinggi permukaan atas kepala di (x, z), untuk menempatkan duri belakang.
const headCrownY = (x, z) => .42 + .82 * Math.sqrt(Math.max(0, 1 - (x / .86) ** 2 - (z / .78) ** 2));

// Gimbal rambut: kurva Bezier pertama mengikuti lengkung kepala pada bidang
// x tetap (sudut a0 -> a1), kurva kedua menjuntai ke bawah sepanjang `len`.
const hairLockMesh = (x, a0, a1, len, width, thickness) => {
  const s = Math.sqrt(Math.max(0, 1 - (x / HEAD_RADII[0]) ** 2));
  const ry = HEAD_RADII[1] * s;
  const rz = HEAD_RADII[2] * s;
  const P = (a) => [x, HEAD_CENTER_Y + ry * Math.cos(a), rz * Math.sin(a)];
  const dP = (a) => [0, -ry * Math.sin(a), rz * Math.cos(a)];
  const k = 4 / 3 * Math.tan((a1 - a0) / 4);
  const p0 = P(a0);
  const p3 = P(a1);
  const d0 = dP(a0);
  const d1 = dP(a1);
  const alongHead = [p0, p0.map((v, i) => v + k * d0[i]), p3.map((v, i) => v - k * d1[i]), p3];
  const T1 = normalize3(d1.map((v) => -v));
  const tip = [p3[0] + x * .2, p3[1] - len, p3[2] - len * .3];
  const hanging = [
    p3,
    p3.map((v, i) => v + T1[i] * len * .4),
    [tip[0], tip[1] + len * .45, tip[2] + len * .12],
    tip,
  ];
  const curve = (v) => (v < .5 ? evaluateBezier3D(alongHead, v * 2) : evaluateBezier3D(hanging, v * 2 - 1));
  return makeParametricSurface((u, v) => {
    const c = curve(v);
    const T = normalize3(subtract3(curve(Math.min(1, v + .002)), curve(Math.max(0, v - .002))));
    const Bv = normalize3(subtract3([1, 0, 0], T.map((q) => q * T[0])));
    const N = cross3(Bv, T);
    const e1 = Math.sin(Math.min(1, v / .12) * PI / 2);
    const q = Math.max(0, (v - .5) / .5);
    const profile = e1 * Math.pow(1 - q, .75);
    const t = u * TAU;
    return [0, 1, 2].map((i) => c[i] + N[i] * (.01 + thickness * profile * Math.cos(t)) + Bv[i] * width * (1 + .4 * v) * profile * Math.sin(t));
  }, 16, 64);
};

const lerp3 = (a, b, amount) => a.map((v, i) => v + (b[i] - v) * amount);

const MODES = ['idle', 'walk', 'run', 'jump', 'punch', 'pushup', 'translate', 'rotate', 'scale', 'arbitrary', 'hierarchical', 'warmup'];

/* ------------------------------------------------------------------
 * Hierarki Knuckles (semua node memakai urutan rotasi ZYX):
 *   root -> model (skala 1.2)
 *     model -> tor -> body, head (mata, duri, gimbal), tailG (ekor)
 *               tor -> armL/R -> foreL/R -> handL/R
 *     model -> legL/R -> kneeL/R -> footL/R
 * Array arms/fores/hands/legs/knees: index 0 = kiri, 1 = kanan.
 * ------------------------------------------------------------------ */
export class Knuckles {
  constructor(gl, resources = {}) {
    if (!gl || !resources.renderer || !resources.shader) {
      throw new Error('Knuckles requires gl, renderer, and shader resources');
    }
    this.gl = gl;
    this.renderer = resources.renderer;
    this.shader = resources.shader;

    this.joints = {};
    this.quills = [];
    this.eyes = [];
    this.legs = [];
    this.knees = [];
    this.arms = [];
    this.fores = [];
    this.hands = [];
    this.debugShapes = isDebugShapesEnabled();
    this.debugNodes = isDebugNodesEnabled();

    this.root = this.#buildHierarchy();
    if (this.debugShapes) console.table(this.countPartsByShape());
    this.animation = 'idle';
    this.warmupProfile = null;
    this.reset();
  }

  /* ----------------------------- Hierarki ----------------------------- */

  // kind = jenis bentuk (kunci DEBUG_SHAPE_COLORS), disimpan untuk mode debug.
  #meshKinds = new WeakMap();

  #upload(mesh, kind) {
    const gpuMesh = this.renderer.uploadMesh(mesh);
    this.#meshKinds.set(gpuMesh, kind);
    return gpuMesh;
  }

  #node(options = {}) {
    return new MyObject(Object.assign({ rotationOrder: 'ZYX' }, options));
  }

  #part(mesh, color, t = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], spec = .25) {
    return createPart(mesh, t, s, color, { r, spec, rotationOrder: 'ZYX', shapeKind: this.#meshKinds.get(mesh) });
  }

  // DEBUG: jumlah part per jenis bentuk di seluruh pohon (dihitung dari node nyata).
  countPartsByShape() {
    const counts = {};
    const visit = (node) => {
      node.parts.forEach((part) => { counts[part.shapeKind] = (counts[part.shapeKind] || 0) + 1; });
      (node.children || []).forEach(visit);
    };
    visit(this.root);
    return counts;
  }

  #buildHierarchy() {
    const root = this.#node({ name: 'root' });
    const model = root.addChild(this.#node({ name: 'knucklesModel', s: [MODEL_SCALE, MODEL_SCALE, MODEL_SCALE] }));
    const tor = model.addChild(this.#node({ name: 'tor', t: [0, HIP_Y, 0] }));

    this.#buildTorso(tor);
    const head = tor.addChild(this.#node({ name: 'head', t: [0, 1.15, 0] }));
    const tailG = tor.addChild(this.#node({ name: 'tailG', t: [0, .05, -.2] }));
    this.#buildTail(tailG);
    this.#buildFace(head);
    this.#buildHair(head);
    this.#buildArms(tor);
    this.#buildLegs(model);

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

  #buildTorso(tor) {
    const { red, white } = COLORS;
    // Perut punya node sendiri agar bisa "bernapas" (di-scale).
    const bodyMesh = this.#upload(ellipsoidMesh(.46, .7, .37), 'ellipsoid');
    this.bodyNode = tor.addChild(this.#node({ name: 'body', t: [0, .5, 0], parts: [this.#part(bodyMesh, red)] }));

    const chestMesh = this.#upload(ellipsoidMesh(CHEST_RADII[0], CHEST_RADII[1], CHEST_RADII[2]), 'ellipsoid');
    const shoulderMesh = this.#upload(ellipsoidMesh(.24, .2, .24), 'ellipsoid');
    const crescentMesh = this.#upload(chestCrescentMesh(.34, .95, .07, .77, .02), 'crescent');
    tor.parts.push(
      this.#part(chestMesh, red, CHEST_CENTER),
      this.#part(shoulderMesh, red, [-.5, .95, 0]),
      this.#part(shoulderMesh, red, [.5, .95, 0]),
      this.#part(crescentMesh, white, [0, 0, 0], [0, 0, 0], [1, 1, 1], .5),
    );
    // DEBUG: tandai pemilik part untuk ?debugNodes=1.
    tor.parts.forEach((part) => { part.debugNode = 'tor'; });
    this.bodyNode.parts.forEach((part) => { part.debugNode = 'body'; });
  }

  #buildTail(tailG) {
    const tailMesh = this.#upload(curveTubeMesh([[0, 0, 0], [0, -.15, -.25], [0, -.02, -.5], [0, .18, -.65]], .09, .01, [1, 0, 0]), 'bezierTube');
    tailG.parts.push(this.#part(tailMesh, COLORS.red));
  }

  // Kepala, moncong, hidung, mulut (kurva 3D), mata, kelopak, dan duri samping.
  #buildFace(head) {
    const { red, redDark, tan, white, black, purple, mouth } = COLORS;
    const headMesh = this.#upload(ellipsoidMesh(HEAD_RADII[0], HEAD_RADII[1], HEAD_RADII[2]), 'ellipsoid');
    const muzzleUpperMesh = this.#upload(ellipsoidMesh(.6, .42, .3), 'ellipsoid');
    const muzzleLowerMesh = this.#upload(ellipsoidMesh(.46, .32, .38), 'ellipsoid');
    const noseMesh = this.#upload(ellipsoidMesh(.11, .09, .09), 'ellipsoid');
    const mouthMesh = this.#upload(curveTubeMesh([[-.34, 0, .8], [-.15, -.1, .92], [.15, -.13, .92], [.42, .2, .8]], .028, .028, [0, 0, 1]), 'bezierTube');
    head.parts.push(
      this.#part(headMesh, red, [0, HEAD_CENTER_Y, 0]),
      this.#part(muzzleUpperMesh, tan, [0, .28, .5]),
      this.#part(muzzleLowerMesh, tan, [0, .2, .62]),
      this.#part(noseMesh, black, [0, .32, .97], [0, 0, 0], [1, 1, 1], .8),
      this.#part(mouthMesh, mouth),
    );

    const eyeWhiteMesh = this.#upload(ellipsoidMesh(.23, .3, .1), 'ellipsoid');
    const eyeIrisMesh = this.#upload(ellipsoidMesh(.12, .2, .05), 'ellipsoid');
    const eyePupilMesh = this.#upload(ellipsoidMesh(.055, .12, .03), 'ellipsoid');
    const eyeHighlightMesh = this.#upload(ellipsoidMesh(.028, .035, .015), 'ellipsoid');
    const eyelidMesh = this.#upload(ellipsoidMesh(.32, .13, .15), 'ellipsoid');

    for (const s of [-1, 1]) {
      const eyeNode = head.addChild(this.#node({ name: s > 0 ? 'eyeR' : 'eyeL', t: [0, .62, 0] }));
      eyeNode.parts.push(
        this.#part(eyeWhiteMesh, white, [s * .29, 0, .7], [0, 0, 0], [1, 1, 1], .6),
        this.#part(eyeIrisMesh, purple, [s * .25, -.02, .76]),
        this.#part(eyePupilMesh, black, [s * .25, -.02, .79], [0, 0, 0], [1, 1, 1], .8),
        this.#part(eyeHighlightMesh, white, [s * .225, .05, .812], [0, 0, 0], [1, 1, 1], .9),
      );
      this.eyes.push(eyeNode);

      const sideQuillOuter = this.#upload(curveTubeMesh([[s * .7, .8, .15], [s * 1.0, .65, .1], [s * .95, .05, -.05], [s * .82, -.45, -.25]], .22, .02, [1, 0, 0]), 'bezierTube');
      const sideQuillInner = this.#upload(curveTubeMesh([[s * .62, .55, .45], [s * .9, .42, .4], [s * .88, -.05, .3], [s * .78, -.4, .2]], .14, .015, [1, 0, 0]), 'bezierTube');
      head.parts.push(
        this.#part(eyelidMesh, red, [s * .3, .84, .68], [0, 0, s * .35]),
        this.#part(sideQuillOuter, red, [0, 0, 0], [0, 0, 0], [1, 1, 1], .3),
        this.#part(sideQuillInner, redDark, [0, 0, 0], [0, 0, 0], [1, 1, 1], .3),
      );
    }
  }

  // Rambut: duri utama dan duri belakang (paraboloid, bisa bergoyang)
  // ditambah gimbal atas (permukaan kurva Bezier).
  #buildHair(head) {
    const { red, redDark } = COLORS;
    const addQuill = (name, mesh, t, x) => {
      const quill = head.addChild(this.#node({
        name,
        t,
        r: [-3.0, -signOrPositive(x) * Math.PI / 2, 0],
        parts: [this.#part(mesh, red)],
      }));
      this.quills.push({ node: quill, baseRotation: [...quill.r] });
    };

    const mainHeights = [1.6, 1.8, 1.95, 1.8, 1.6];
    const mainYs = [.7, .85, .9, .85, .7];
    [-.5, -.25, 0, .25, .5].forEach((x, i) => {
      const mesh = this.#upload(paraboloidMesh(.3, .26, mainHeights[i]), 'quillMain');
      addQuill(`quillMain_${i}`, mesh, [x, mainYs[i], -.35], x);
    });

    // Baris duri belakang: [z, daftar posisi x, tinggi duri].
    const backRows = [
      [-.28, [-.65, -.4, -.15, .15, .4, .65], 1.5],
      [-.5, [-.55, -.3, -.05, .2, .45], 1.3],
      [-.66, [-.4, -.15, .15, .4], 1.05],
      [-.78, [-.18, .18], .8],
    ];
    let backIndex = 0;
    backRows.forEach(([z, xs, height]) => {
      const mesh = this.#upload(paraboloidMesh(.24, .21, height), 'quillBack');
      xs.forEach((x) => {
        addQuill(`quillBack_${backIndex}`, mesh, [x, headCrownY(x, z) - .05, z], x);
        backIndex += 1;
      });
    });

    const lockDefinitions = [
      { x: 0, a0: .8, a1: -1.35, len: 1.4, w: .17, th: .1, color: red },
      { x: -.27, a0: .85, a1: -1.35, len: 1.3, w: .17, th: .1, color: redDark },
      { x: .27, a0: .85, a1: -1.35, len: 1.3, w: .17, th: .1, color: redDark },
      { x: -.52, a0: .95, a1: -1.3, len: 1.15, w: .16, th: .09, color: red },
      { x: .52, a0: .95, a1: -1.3, len: 1.15, w: .16, th: .09, color: red },
      { x: -.74, a0: 1.05, a1: -.9, len: 1.0, w: .13, th: .08, color: redDark },
      { x: .74, a0: 1.05, a1: -.9, len: 1.0, w: .13, th: .08, color: redDark },
    ];
    lockDefinitions.forEach((lock) => {
      const mesh = this.#upload(hairLockMesh(lock.x, lock.a0, lock.a1, lock.len, lock.w, lock.th), 'hairLock');
      head.parts.push(this.#part(mesh, lock.color, [0, 0, 0], [0, 0, 0], [1, 1, 1], .3));
    });
  }

  // Rantai lengan: arm (bahu) -> fore (siku) -> hand (sarung tinju berduri).
  #buildArms(tor) {
    const { red, white, gloveShade } = COLORS;
    const shoulderJointMesh = this.#upload(ellipsoidMesh(ARM_RADIUS * 1.1, ARM_RADIUS * 1.1, ARM_RADIUS * 1.1), 'ellipsoid');
    const upperArmMesh = this.#upload(cylinderMesh(ARM_RADIUS, UPPER_ARM_LENGTH), 'cylinder');
    const elbowJointMesh = this.#upload(ellipsoidMesh(ARM_RADIUS, ARM_RADIUS, ARM_RADIUS), 'ellipsoid');
    const forearmMesh = this.#upload(cylinderMesh(ARM_RADIUS, FOREARM_LENGTH), 'cylinder');
    const wristJointMesh = this.#upload(ellipsoidMesh(ARM_RADIUS, ARM_RADIUS * 1.3, ARM_RADIUS), 'ellipsoid');

    const cuffMesh = this.#upload(paraboloidMesh(.31, .31, .3), 'cuff');
    const fistMesh = this.#upload(ellipsoidMesh(.38, .42, .4), 'ellipsoid');
    const fingerOuterMesh = this.#upload(ellipsoidMesh(.1, .15, .075), 'ellipsoid');
    const fingerMiddleMesh = this.#upload(ellipsoidMesh(.1, .16, .075), 'ellipsoid');
    const fingerInnerMesh = this.#upload(ellipsoidMesh(.1, .14, .075), 'ellipsoid');
    const thumbMesh = this.#upload(ellipsoidMesh(.11, .08, .17), 'ellipsoid');
    const spikeMesh = this.#upload(coneMesh(.1, .3), 'cone');

    for (const s of [-1, 1]) {
      const arm = this.#node({ name: s > 0 ? 'armR' : 'armL', t: [s * .6, .85, 0], r: [0, 0, s * .15] });
      const fore = this.#node({ name: s > 0 ? 'foreR' : 'foreL', t: [0, -UPPER_ARM_LENGTH, 0] });
      const hand = this.#node({ name: s > 0 ? 'handR' : 'handL', t: [0, -FOREARM_LENGTH, 0] });

      arm.parts.push(
        this.#part(shoulderJointMesh, red),
        this.#part(upperArmMesh, red, [0, -UPPER_ARM_LENGTH / 2, 0]),
      );
      fore.parts.push(
        this.#part(elbowJointMesh, red),
        this.#part(forearmMesh, red, [0, -FOREARM_LENGTH / 2, 0]),
        this.#part(wristJointMesh, red, [0, -FOREARM_LENGTH - .02, 0]),
      );
      hand.parts.push(
        this.#part(cuffMesh, white, [0, .16, 0], [PI, 0, 0], [1, 1, 1], .4),
        this.#part(fistMesh, white, [0, -.32, .03], [0, 0, 0], [1, 1, 1], .4),
        this.#part(fingerOuterMesh, gloveShade, [-s * .3, -.4, .24], [0, 0, 0], [1, 1, 1], .35),
        this.#part(fingerMiddleMesh, gloveShade, [-s * .33, -.4, .09], [0, 0, 0], [1, 1, 1], .35),
        this.#part(fingerMiddleMesh, gloveShade, [-s * .33, -.4, -.07], [0, 0, 0], [1, 1, 1], .35),
        this.#part(fingerInnerMesh, gloveShade, [-s * .3, -.4, -.22], [0, 0, 0], [1, 1, 1], .35),
        this.#part(thumbMesh, gloveShade, [-s * .15, -.25, .4], [.35, 0, 0], [1, 1, 1], .35),
        this.#part(spikeMesh, white, [s * .36, -.3, .13], [.5, 0, -s * PI / 2]),
        this.#part(spikeMesh, white, [s * .36, -.3, -.12], [.5, 0, -s * PI / 2]),
      );

      fore.addChild(hand);
      arm.addChild(fore);
      tor.addChild(arm);
      this.arms.push(arm);
      this.fores.push(fore);
      this.hands.push(hand);
    }
  }

  // Rantai kaki: leg (pinggul) -> knee (lutut) -> foot (kaus kaki + sepatu).
  #buildLegs(model) {
    const { red, sockGreen, yellow, black, soleWhite, soleGray } = COLORS;
    const hipJointMesh = this.#upload(ellipsoidMesh(.18, .2, .18), 'ellipsoid');
    const upperLegMesh = this.#upload(cylinderMesh(.15, UPPER_LEG_LENGTH), 'cylinder');
    const kneeJointMesh = this.#upload(ellipsoidMesh(.15, .15, .15), 'ellipsoid');
    const lowerLegMesh = this.#upload(cylinderMesh(.12, LOWER_LEG_LENGTH), 'cylinder');

    const sockMesh = this.#upload(cylinderMesh(.24, .58), 'cylinder');
    const shoeRedMesh = this.#upload(ellipsoidMesh(.52, .29, .74), 'ellipsoid');
    const shoeYellowMesh = this.#upload(ellipsoidMesh(.53, .29, .37), 'ellipsoid');
    const soleWhiteMesh = this.#upload(cylinderMesh(1, .08), 'cylinder');
    const soleGrayMesh = this.#upload(cylinderMesh(1, .05), 'cylinder');
    const soleTreadMesh = this.#upload(hyperbolicParaboloidMesh(.42, .64, .02), 'hyperbolic');

    // Tali sepatu: 4 ellipsoid pipih yang mengikuti lengkung sepatu.
    const laces = [.34, .44, .54, .64].map((z) => {
      const k = Math.sqrt(Math.max(0, 1 - ((z - .2) / .74) ** 2));
      return {
        mesh: this.#upload(ellipsoidMesh(.3 * k, .035, .04), 'ellipsoid'),
        t: [0, -.55 + .29 * k - .01, z],
      };
    });

    for (const s of [-1, 1]) {
      const leg = this.#node({ name: s > 0 ? 'legR' : 'legL', t: [s * .3, HIP_Y, 0], r: [0, 0, s * .03] });
      const knee = this.#node({ name: s > 0 ? 'kneeR' : 'kneeL', t: [0, -UPPER_LEG_LENGTH, 0] });
      const foot = this.#node({ name: s > 0 ? 'footR' : 'footL', t: [0, -LEG_EXTRA, 0] });

      leg.parts.push(
        this.#part(hipJointMesh, red),
        this.#part(upperLegMesh, red, [0, -UPPER_LEG_LENGTH / 2, 0]),
      );
      knee.parts.push(
        this.#part(kneeJointMesh, red),
        this.#part(lowerLegMesh, red, [0, -LOWER_LEG_LENGTH / 2, 0]),
      );
      foot.parts.push(
        this.#part(sockMesh, sockGreen, [0, -.43, 0]),
        this.#part(shoeRedMesh, red, [0, -.55, .2]),
        this.#part(shoeYellowMesh, yellow, [0, -.55, .18]),
        this.#part(soleWhiteMesh, soleWhite, [0, -.76, .2], [0, 0, 0], [.45, 1, .68], .3),
        this.#part(soleGrayMesh, soleGray, [0, -.825, .2], [0, 0, 0], [.44, 1, .67], .15),
        this.#part(soleTreadMesh, soleGray, [0, -.855, .2], [0, 0, 0], [1, 1, 1], .15),
      );
      laces.forEach((lace) => foot.parts.push(this.#part(lace.mesh, black, lace.t)));

      knee.addChild(foot);
      leg.addChild(knee);
      model.addChild(leg);
      this.legs.push(leg);
      this.knees.push(knee);
    }
  }

  /* ----------------------------- Kontrak karakter ----------------------------- */

  getRoot() {
    return this.root;
  }

  // elapsedTime dicatat sebagai awal mode (dipakai pushup dan warmup).
  // options.warmupProfile = { duration, revolutions } untuk putaran lengan terjadwal.
  setAnimation(mode, elapsedTime = 0, options = {}) {
    if (!MODES.includes(mode)) {
      throw new Error(`Unsupported Knuckles animation mode: ${mode}`);
    }
    this.animation = mode;
    this.modeStartTime = typeof elapsedTime === 'number' ? elapsedTime : 0;
    this.warmupProfile = mode === 'warmup' ? options.warmupProfile || null : null;
  }

  reset() {
    this.animation = 'idle';
    this.modeStartTime = 0;
    this.warmupProfile = null;
    this.#resetTransforms();
  }

  // Kembalikan semua sendi ke pose dasar (dipanggil di awal setiap update).
  #resetTransforms() {
    const j = this.joints;
    this.root.t = [0, 0, 0];
    this.root.r = [0, 0, 0];
    this.root.s = [1, 1, 1];
    this.root.aa = null;

    j.model.t = [0, 0, 0];
    j.model.r = [0, 0, 0];
    j.model.s = [MODEL_SCALE, MODEL_SCALE, MODEL_SCALE];
    j.tor.t = [0, HIP_Y, 0];
    j.tor.r = [0, 0, 0];
    j.head.t = [0, 1.15, 0];
    j.head.r = [0, 0, 0];
    j.tailG.r = [0, 0, 0];

    for (let i = 0; i < 2; i += 1) {
      const s = i ? 1 : -1;
      this.legs[i].r = [0, 0, s * .03];
      this.knees[i].r = [0, 0, 0];
      this.arms[i].r = [0, 0, s * .15];
      this.arms[i].aa = null;
      this.fores[i].r = [0, 0, 0];
      this.hands[i].r = [0, 0, 0];
    }

    this.bodyNode.s = [1, 1, 1];
    this.eyes.forEach((eye) => { eye.s = [1, 1, 1]; });
    this.quills.forEach((quill) => { quill.node.r = [...quill.baseRotation]; });
  }

  update(_dt, elapsedTime) {
    this.#resetTransforms();
    const time = elapsedTime;
    this.#animateSecondaryMotion(time);
    switch (this.animation) {
      case 'idle': this.#animateIdle(time); break;
      case 'walk': this.#animateWalk(time, false); break;
      case 'translate': this.#animateWalk(time, true); break;
      case 'run': this.#animateRun(time); break;
      case 'jump': this.#animateJump(time); break;
      case 'punch': this.#animatePunch(time); break;
      case 'pushup': this.#animatePushup(time); break;
      case 'rotate': this.#animateRotate(time); break;
      case 'scale': this.#animateScale(time); break;
      case 'arbitrary': this.#animateArbitrary(time); break;
      case 'hierarchical': this.#animateHierarchical(time); break;
      case 'warmup': this.#animateWarmup(time); break;
      default: break;
    }
  }

  /* ----------------------------- Mode animasi ----------------------------- */

  // Gerakan kecil yang selalu aktif: napas, kedipan, dan goyangan duri.
  #animateSecondaryMotion(time) {
    const mode = this.animation;
    const isWalking = mode === 'walk' || mode === 'translate';
    const isFast = mode === 'run' || mode === 'punch' || mode === 'pushup';

    const breath = Math.sin(time * (isFast ? 6.0 : (isWalking ? 4.5 : 2.2)));
    this.bodyNode.s = [1 + .022 * breath, 1 + .015 * breath, 1 + .022 * breath];

    const blinkPhase = time % 3.2;
    const blink = blinkPhase > 3.05 ? Math.sin((blinkPhase - 3.05) / .15 * PI) : 0;
    this.eyes.forEach((eye) => {
      eye.s = [1, Math.max(0.08, 1 - .92 * blink), 1];
    });

    const swayFactor = (isWalking || isFast || mode === 'jump') ? 2.5 : 1;
    this.quills.forEach(({ node, baseRotation }, i) => {
      node.r = [
        baseRotation[0] + .06 * swayFactor * Math.sin(time * 2 * swayFactor + i),
        baseRotation[1],
        baseRotation[2] + .05 * swayFactor * Math.sin(time * 1.7 * swayFactor + i * 1.3),
      ];
    });
  }

  #animateIdle(time) {
    this.joints.head.r = [0, .3 * Math.sin(time * .6), .05 * Math.sin(time * 1.3)];
    this.joints.tailG.r = [.15 * Math.sin(time * 3), .4 * Math.sin(time * 2.5), 0];
    for (let i = 0; i < 2; i += 1) {
      const s = i ? 1 : -1;
      this.arms[i].r = [.05 * Math.sin(time * 2), 0, s * .15];
    }
  }

  // Jalan di tempat. moveForward = true untuk mode translate (maju-mundur di Z).
  #animateWalk(time, moveForward) {
    const S = Math.sin(time * 6);
    const C = Math.cos(time * 6);
    const amp = 0.6;

    this.joints.model.t[1] = Math.abs(S) * 0.07;   // pantulan vertikal
    this.joints.tor.r = [0.08, 0.15 * S, 0];        // condong + memutar
    this.joints.head.r = [0, 0, 0];

    // Kaki dan lengan bergantian: kaki kiri maju bersama lengan kanan.
    for (let i = 0; i < 2; i += 1) {
      const d = i ? -1 : 1;
      const s = i ? 1 : -1;
      this.legs[i].r = [d * S * amp, 0, s * .03];
      this.knees[i].r = [Math.max(0, -d * C) * amp * 1.4, 0, 0];
      this.arms[i].r = [-d * S * amp * 1.05, 0, s * .12];
      this.fores[i].r = [-0.4, 0, 0];
    }
    this.joints.tailG.r = [.15 * Math.sin(time * 3), .4 * Math.sin(time * 7), 0];

    if (moveForward) {
      this.root.t = [0, 0, 2.0 * Math.sin(time * 0.8)];
    }
  }

  #animateRun(time) {
    const S = Math.sin(time * 13);
    const C = Math.cos(time * 13);
    const amp = 1.3;

    this.joints.model.t[1] = Math.abs(S) * 0.22;
    this.joints.tor.r = [0.5, 0.15 * S, 0];
    this.joints.head.r = [-0.25, 0.06 * Math.sin(time * 10), 0];
    for (let i = 0; i < 2; i += 1) {
      const d = i ? -1 : 1;
      const s = i ? 1 : -1;
      this.legs[i].r = [d * S * amp, 0, s * 0.03];
      this.knees[i].r = [Math.max(0, -d * C) * amp * 1.4, 0, 0];
      this.arms[i].r = [-d * S * amp * 1.05, 0, s * 0.12];
      this.fores[i].r = [-1.5, 0, 0];
    }
    this.joints.tailG.r = [0.15 * Math.sin(time * 3), 0.4 * Math.sin(time * 7), 0];
  }

  // Siklus 1.8 detik: jongkok (0-20%), melayang + putar 360 (20-70%), mendarat.
  #animateJump(time) {
    const phase = (time / 1.8) % 1;
    let bend = 0;
    let air = false;
    let u = 0;
    if (phase < 0.2) {
      bend = smoothStep(0, 0.2, phase);
    } else if (phase < 0.7) {
      air = true;
      u = (phase - 0.2) / 0.5;
    } else {
      const landing = (phase - 0.7) / 0.3;
      bend = 0.8 * Math.sin(PI * Math.min(1, landing * 1.5));
    }

    const tuck = air ? Math.sin(PI * u) : 0;
    const raise = air ? Math.min(1, u * 4) * Math.min(1, (1 - u) * 4) : 0;

    this.joints.model.t[1] = -0.2 * bend + (air ? 1.4 * 4 * u * (1 - u) : 0);
    this.joints.model.r = [0, air ? u * TAU : 0, 0];
    this.joints.tor.r = [0.35 * bend, 0, 0];
    this.joints.head.r = [0.1 * bend - 0.15 * raise, 0, 0];
    for (let i = 0; i < 2; i += 1) {
      const s = i ? 1 : -1;
      this.legs[i].r = [-0.5 * bend - 0.4 * tuck, 0, s * 0.03];
      this.knees[i].r = [1.0 * bend + 0.8 * tuck, 0, 0];
      this.arms[i].r = [0.7 * bend - 2.7 * raise, 0, s * (0.15 + 0.3 * raise)];
      this.fores[i].r = [-0.3 * raise, 0, 0];
    }
    this.joints.tailG.r = [0.15 * Math.sin(time * 3), 0.4 * Math.sin(time * 6), 0];
  }

  // Kuda-kuda tinju, lalu kombinasi 6 ketukan: jab, cross, uppercut, cross, weave.
  #animatePunch(time) {
    // Kurva pukulan dalam satu ketukan: naik cepat, tahan, lalu kembali.
    const punchEnvelope = (x) => {
      const e = x < 0.22 ? x / 0.22 : (x < 0.32 ? 1 : Math.max(0, 1 - (x - 0.32) / 0.4));
      return e * e * (3 - 2 * e);
    };
    const guardArm = (s) => [-0.9, -s * 0.15, s * 0.3];
    const guardForearm = -1.7;

    const bob = Math.abs(Math.sin(time * 7));
    const sequence = [[0, 'jab'], [1, 'cross'], [0, 'upper'], [1, 'cross']];
    const beatClock = time * 2.4;
    const beat = Math.floor(beatClock) % 6;
    const beatPhase = beatClock % 1;

    this.joints.model.t[1] = -0.12 + 0.04 * bob;
    this.joints.model.r = [0, 0.35, 0];
    this.joints.tor.r = [0.12, 0, 0];
    this.joints.head.r = [0.05, -0.25, 0];

    this.legs[0].r = [-0.35, 0, -0.12];
    this.legs[1].r = [0.25, 0, 0.12];
    this.knees[0].r = [0.45 + 0.08 * bob, 0, 0];
    this.knees[1].r = [0.4 + 0.08 * bob, 0, 0];

    for (let i = 0; i < 2; i += 1) {
      this.arms[i].r = guardArm(i ? 1 : -1);
      this.fores[i].r = [guardForearm, 0, 0];
    }

    if (beat < 4) {
      const [arm, type] = sequence[beat];
      const s = arm ? 1 : -1;
      const e = punchEnvelope(beatPhase);
      if (type === 'upper') {
        this.arms[arm].r = lerp3(guardArm(s), [-1.35, -s * 0.3, s * 0.1], e);
        this.fores[arm].r = [guardForearm + (-1.6 - guardForearm) * e, 0, 0];
        this.joints.tor.r = [0.12 - 0.18 * e, -s * 0.35 * e, 0];
        this.joints.model.t[1] += 0.06 * e;
      } else {
        const twist = type === 'cross' ? 0.6 : 0.3;
        this.arms[arm].r = lerp3(guardArm(s), [-1.55, -s * 0.15, s * 0.05], e);
        this.fores[arm].r = [guardForearm + (-0.05 - guardForearm) * e, 0, 0];
        this.joints.tor.r = [0.12 + 0.1 * e, -s * twist * e, 0];
        this.joints.head.r = [0.05, -0.25 + s * twist * 0.5 * e, 0];
        if (type === 'cross') this.knees[1].r[0] += 0.15 * e;
      }
    } else {
      // Ketukan 4-5: weave (menghindar ke kiri-kanan).
      const weave = Math.sin(time * 4);
      this.joints.tor.r = [0.12 + 0.05 * Math.abs(weave), 0, 0.12 * weave];
      this.joints.head.r = [0.05, -0.25, -0.06 * weave];
    }
    this.joints.tailG.r = [0.15 * Math.sin(time * 4), 0.4 * Math.sin(time * 6), 0];
  }

  // Push up: tubuh dimiringkan sebesar `tilt`, lalu sudut bahu/siku/tangan
  // dihitung dengan inverse kinematics 2 ruas (hukum cosinus) agar telapak
  // tangan tetap menyentuh lantai.
  #animatePushup(time) {
    const relativeTime = Math.max(0, time - (this.modeStartTime || 0));
    const enter = smoothStep(0, 0.8, relativeTime);
    const cycle = 0.5 - 0.5 * Math.cos(relativeTime * TAU / 2.6);
    const tilt = enter * (1.27 + 0.18 * cycle);
    const c = Math.cos(tilt);
    const s = Math.sin(tilt);

    // Angkat model agar ujung sepatu tepat di lantai.
    const lowestShoeY = Math.min(
      -0.115 * c - 0.88 * s,
      (c - s) * 0.2 - Math.sqrt((c * 0.29) ** 2 + (s * 0.74) ** 2),
    );
    const lift = -0.08 - lowestShoeY;

    this.joints.model.t = [0, lift, 0];
    this.joints.model.r = [tilt, 0, 0];
    this.joints.tor.r = [0, 0, 0];
    this.joints.head.r = [-tilt + 0.2 * enter, 0, 0];

    const L1 = UPPER_ARM_LENGTH;
    const L2 = FOREARM_LENGTH + 0.74;
    const reach = Math.min(L1 + L2 - 0.002, 2.83 * c + lift + 0.08);
    const shoulderAngle = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + reach * reach - L2 * L2) / (2 * L1 * reach))));
    const handAngle = Math.asin(Math.max(-1, Math.min(1, L1 * Math.sin(shoulderAngle) / L2)));

    for (let i = 0; i < 2; i += 1) {
      const side = i ? 1 : -1;
      this.legs[i].r = [0, 0, side * 0.03];
      this.knees[i].r = [0, 0, 0];
      this.arms[i].r = [shoulderAngle - tilt, 0, side * 0.04];
      this.fores[i].r = [-handAngle - shoulderAngle, 0, 0];
      this.hands[i].r = [handAngle, 0, 0];
    }
    this.joints.tailG.r = [0.1 * Math.sin(time * 2), 0.2 * Math.sin(time * 3), 0];
  }

  // Rotasi: root berputar penuh pada sumbu Y.
  #animateRotate(time) {
    this.root.r = [0, (time * 1.6) % TAU, 0];
    this.joints.tailG.r = [.15 * Math.sin(time * 3), .4 * Math.sin(time * 2.5), 0];
  }

  // Scale: root membesar-mengecil seragam (0.65x .. 1.35x).
  #animateScale(time) {
    const scale = 1 + 0.35 * Math.sin(time * 2);
    this.root.s = [scale, scale, scale];
    this.joints.head.r = [0, .3 * Math.sin(time * .6), .05 * Math.sin(time * 1.3)];
    this.joints.tailG.r = [.15 * Math.sin(time * 3), .4 * Math.sin(time * 2.5), 0];
  }

  // Arbitrary axis: root berputar pada sumbu (1, 1, 0) yang dinormalisasi.
  #animateArbitrary(time) {
    this.root.aa = { a: normalize3([1, 1, 0]), ang: (time * 1.6) % TAU };
  }

  // Hierarchical: bahu -> siku -> tangan dan pinggul -> lutut bergerak berantai.
  #animateHierarchical(time) {
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

  // Pemanasan: lengan diputar penuh pada sumbu miring melalui bahu
  // (rotasi sumbu sembarang / Rodrigues). Sumbu kanan normalize(1, 0, 1),
  // kiri normalize(1, 0, -1) agar simetris. Lengan bawah dan tangan ikut
  // berputar karena merupakan child dari node arm (hierarki).
  #animateWarmup(time) {
    const relativeTime = Math.max(0, time - (this.modeStartTime || 0));
    const enter = smoothStep(0, 0.6, relativeTime);
    let angle;
    if (this.warmupProfile) {
      const progress = smoothStep(0, this.warmupProfile.duration, relativeTime);
      angle = -TAU * this.warmupProfile.revolutions * progress;
    } else {
      angle = -3.2 * relativeTime;
    }
    const abduct = .15 + (.95 - .15) * enter;

    this.joints.model.t[1] = -0.04 * enter + 0.03 * Math.sin(angle * 2);
    this.joints.tor.r = [0.05, 0, 0];
    this.joints.head.r = [0.04 * Math.sin(angle), 0, 0];
    for (let i = 0; i < 2; i += 1) {
      const s = i ? 1 : -1;
      this.arms[i].r = [0, 0, s * abduct];
      this.arms[i].aa = { a: normalize3([1, 0, s]), ang: angle };
      this.fores[i].r = [-0.15, 0, 0];
      this.hands[i].r = [0.25 * Math.sin(angle * 2), 0, 0];
      this.legs[i].r = [0, 0, s * .08];
      this.knees[i].r = [0.08 + 0.06 * (0.5 - 0.5 * Math.cos(angle * 2)), 0, 0];
    }
    this.joints.tailG.r = [.15 * Math.sin(time * 3), .4 * Math.sin(time * 2.5), 0];
  }

  render(context) {
    assertRenderContext(context, 'Knuckles');
    return this.renderer.drawTree(this.root, this.shader, (part, world) => ({
      uModel: world,
      uView: context.viewMatrix,
      uProj: context.projectionMatrix,
      uNorm: normalMatrix(world),
      uColor: (this.debugNodes && DEBUG_NODE_COLORS[part.debugNode])
        || (this.debugShapes && DEBUG_SHAPE_COLORS[part.shapeKind]) || part.color,
      uCam: context.cameraPosition,
      uSpec: part.spec !== undefined ? part.spec : 0.25,
    }));
  }
}
