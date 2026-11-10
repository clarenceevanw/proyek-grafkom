import { normalMatrix, normalize3, cross3 } from '../core/Matrix4.js';
import { clamp } from '../core/MathUtils.js';
import { createNode, createPart } from '../core/MyObject.js';
import {
  bezierDerivative3D,
  evaluateBezier3D,
  makeBezierTube,
  makeCone,
  makeCylinder,
  makeHyperboloidOneSheet,
  makeParaboloid,
  makeSphere,
} from '../core/Geometry.js';
import { assertRenderContext } from '../rendering/Renderer.js';

const COLORS = {
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

const MODES = ['idle', 'walk', 'fly'];

/* ------------------------------------------------------------------
 * Hierarki Tails:
 *   TailsRoot -> Body (torso) -> Neck -> Head -> mata, telinga, pipi, poni
 *             -> Body -> Shoulder -> UpperArm -> Elbow -> Wrist -> Palm -> jari
 *             -> Body -> TailPropellerHub -> TailPivot (2 ekor)
 *   TailsRoot -> Hip -> Knee -> Foot
 *
 * Animasi memakai bobot (weights) yang berpindah halus antar mode:
 * weights.walk dan weights.fly bergerak menuju targetWeights setiap frame,
 * lalu setiap sendi mencampur pose idle, jalan, dan terbang sesuai bobot.
 * ------------------------------------------------------------------ */
export class Tails {
  constructor(gl, resources = {}) {
    if (!gl || !resources.renderer || !resources.shader) {
      throw new Error('Tails requires gl, renderer, and shader resources');
    }
    this.gl = gl;
    this.renderer = resources.renderer;
    this.shader = resources.shader;

    const upload = (mesh) => this.renderer.uploadMesh(mesh);
    this.mesh = {
      sphere: upload(makeSphere(32, 20)),
      cylinder: upload(makeCylinder(32, { centered: true })),
      cylinderCuff: upload(makeCylinder(32, { centered: true, bevel: 0.30 })),
      cone: upload(makeCone(32, 16)),
      paraboloid: upload(makeParaboloid(32, 16, { baseFirst: true })),
      hyperboloid: upload(makeHyperboloidOneSheet(32, 16, 0.72)),
    };

    this.root = createNode({ name: 'TailsRoot' });
    // joints.legs/arms/ears/tails diindeks dengan sisi: -1 atau 1.
    this.joints = { legs: {}, arms: {}, ears: {}, tails: {} };
    this.eyes = [];

    this.animation = 'idle';
    this.#build();
    this.reset();
  }

  /* ----------------------------- Hierarki ----------------------------- */

  #part(node, meshKey, t = [0, 0, 0], s = [1, 1, 1], color = COLORS.orange, spec = 0.10, extra = {}) {
    node.parts.push(createPart(this.mesh[meshKey], t, s, color, { spec, shin: 30, ...extra }));
  }

  #node(parent, name, t = [0, 0, 0], r = [0, 0, 0]) {
    return parent.addChild(createNode({ name, t, r }));
  }

  // Satu helai rambut: tabung Bezier yang menebal lalu meruncing.
  #curveStrand(parent, name, P, rBase, rMid, rTip, color) {
    const radiusFn = (t) => {
      if (t < 0.35) return rBase + (rMid - rBase) * (t / 0.35);
      return rMid * Math.pow(Math.max(0, 1 - (t - 0.35) / 0.65), 0.72) + rTip * (1 - t);
    };
    const tubeMesh = this.renderer.uploadMesh(makeBezierTube(P, radiusFn, 32, 14));
    const node = this.#node(parent, name);
    node.parts.push(createPart(tubeMesh, [0, 0, 0], [1, 1, 1], color, { spec: 0.10 }));
    return node;
  }

  #build() {
    this.#buildTorso();
    this.#buildHead();
    this.#buildEyes();
    this.#buildEarsAndCheeks();
    this.#buildBangs();
    this.#buildArms();
    this.#buildLegs();
    this.#buildTails();
  }

  // Badan: ellipsoid, leher hiperboloid, dan 5 jumbai bulu dada (paraboloid).
  #buildTorso() {
    this.torso = this.#node(this.root, 'Body', [0, 1.05, 0]);
    this.joints.body = this.torso;

    // Body ellipsoids
    this.#part(this.torso, 'sphere', [0, 0.30, 0], [0.285, 0.34, 0.24], COLORS.orange, 0.08);
    this.#part(this.torso, 'sphere', [0, 0.14, -0.015], [0.265, 0.21, 0.23], COLORS.orange, 0.08);

    // Upper neck / shoulder transition (Hyperboloid of 1 sheet)
    this.#part(this.torso, 'hyperboloid', [0, 0.61, 0], [0.23, 0.18, 0.20], COLORS.orange, 0.08);

    // Chest fur base (white ellipsoid)
    this.#part(this.torso, 'sphere', [0, 0.35, 0.115], [0.225, 0.28, 0.155], COLORS.white, 0.08, { r: [-0.06, 0, 0] });

    // 5 Chest fur tufts (Elliptic Paraboloids)
    const chestTufts = [
      [[ 0.00, 0.56, 0.205], [2.30,  0.00,  0.00], [0.105, 0.23, 0.060]],
      [[-0.11, 0.55, 0.190], [2.20, -0.22, -0.38], [0.092, 0.21, 0.052]],
      [[ 0.11, 0.55, 0.190], [2.20,  0.22,  0.38], [0.092, 0.21, 0.052]],
      [[-0.14, 0.61, 0.155], [1.90, -0.35, -0.62], [0.072, 0.17, 0.045]],
      [[ 0.14, 0.61, 0.155], [1.90,  0.35,  0.62], [0.072, 0.17, 0.045]],
    ];
    chestTufts.forEach(([p, r, s]) => {
      this.#part(this.torso, 'paraboloid', p, s, COLORS.white, 0.08, { r });
    });
  }

  // Kepala kapsul (ellipsoid + silinder), moncong, hidung, dan mulut (kurva Bezier 3D).
  #buildHead() {
    this.neck = this.#node(this.torso, 'Neck', [0, 0.66, 0]);
    this.head = this.#node(this.neck, 'Head', [0, 0.46, 0.02]);
    this.joints.head = this.head;

    // Head capsule (top ellipsoid + middle cylinder + bottom ellipsoid)
    this.#part(this.head, 'sphere', [0,  0.12, -0.02], [0.548, 0.44, 0.488], COLORS.orange, 0.08);
    this.#part(this.head, 'cylinder', [0,  0.01, -0.02], [0.552, 0.24, 0.492], COLORS.orange, 0.08);
    this.#part(this.head, 'sphere', [0, -0.10, -0.02], [0.548, 0.43, 0.488], COLORS.orange, 0.08);

    // Muzzle (middle cylinder + left/right cheeks + front tip)
    this.#part(this.head, 'cylinder', [0, -0.22, 0.25], [0.192, 0.36, 0.222], COLORS.white, 0.08, { r: [0, 0, Math.PI / 2] });
    this.#part(this.head, 'sphere', [-0.18, -0.22, 0.25], [0.22, 0.19, 0.22], COLORS.white, 0.08);
    this.#part(this.head, 'sphere', [ 0.18, -0.22, 0.25], [0.22, 0.19, 0.22], COLORS.white, 0.08);
    this.#part(this.head, 'sphere', [0, -0.23, 0.35], [0.25, 0.17, 0.17], COLORS.white, 0.10);

    // Black nose
    this.#part(this.head, 'sphere', [0, -0.13, 0.535], [0.062, 0.044, 0.052], COLORS.black, 0.85, { r: [-0.15, 0, 0] });

    // Mouth line (3D Cubic Bezier tube)
    const mouthP = [
      [-0.14, -0.22, 0.522],
      [-0.06, -0.295, 0.558],
      [ 0.06, -0.295, 0.558],
      [ 0.14, -0.22, 0.522],
    ];
    const mouthMesh = this.renderer.uploadMesh(makeBezierTube(
      mouthP,
      (t) => 0.005 + 0.009 * Math.pow(Math.sin(Math.PI * t), 0.5),
      28, 10
    ));
    this.head.parts.push(createPart(mouthMesh, [0, 0, 0], [1, 1, 1], COLORS.mouthLine, { spec: 0.15 }));
  }

  // Mata: putih, iris berlapis, pupil, dan dua highlight.
  #buildEyes() {
    for (const s of [-1, 1]) {
      const eyeNode = this.#node(this.head, `Eye${s}`, [s * 0.14, 0.07, 0.43], [-0.02, s * 0.20, 0]);
      this.#part(eyeNode, 'sphere', [0, 0.025, 0],              [0.152, 0.240, 0.075], COLORS.white,     0.40);
      this.#part(eyeNode, 'sphere', [s * -0.012, -0.02, 0.046], [0.094, 0.148, 0.042], COLORS.irisOuter, 0.65);
      this.#part(eyeNode, 'sphere', [s * -0.012, -0.02, 0.052], [0.086, 0.136, 0.040], COLORS.blue,      0.70);
      this.#part(eyeNode, 'sphere', [s * -0.012, -0.046, 0.060],[0.064, 0.080, 0.034], COLORS.irisInner, 0.75);
      this.#part(eyeNode, 'sphere', [s * -0.012, -0.018, 0.072],[0.048, 0.086, 0.028], COLORS.black,     0.80);
      this.#part(eyeNode, 'sphere', [s * -0.034,  0.050, 0.090],[0.024, 0.032, 0.014], COLORS.white,     0.95);
      this.#part(eyeNode, 'sphere', [s *  0.018, -0.064, 0.086],[0.012, 0.016, 0.010], COLORS.white,     0.95);
      this.eyes.push(eyeNode);
    }
  }

  // Telinga (cone) dan bulu pipi (cone).
  #buildEarsAndCheeks() {
    for (const s of [-1, 1]) {
      const ear = this.#node(this.head, `Ear${s}`, [s * 0.26, 0.38, -0.05], [0.05, s * 0.16, s * -0.40]);
      this.#part(ear, 'cone',       [0, 0, 0],               [0.29, 0.72, 0.12], COLORS.orange,   0.08);
      this.#part(ear, 'cone',       [0, 0.03, 0.042],        [0.20, 0.56, 0.07], COLORS.earIn,    0.06, { r: [0.02, 0, 0] });
      this.joints.ears[s] = ear;

      // Cheek fur cones
      const cheekBase = this.#node(this.head, `Cheek${s}`, [s * 0.28, -0.21, 0.24], [0, s * -0.28, 0]);
      this.#part(cheekBase, 'cone', [0,  0.045, 0], [0.052, 0.38, 0.095], COLORS.white, 0.08, { r: [0, 0, s * -1.36] });
      this.#part(cheekBase, 'cone', [0, -0.005, 0], [0.055, 0.41, 0.102], COLORS.white, 0.08, { r: [0, 0, s * -1.62] });
      this.#part(cheekBase, 'cone', [0, -0.055, 0], [0.048, 0.34, 0.088], COLORS.white, 0.08, { r: [0, 0, s * -1.90] });
    }
  }

  // Poni: 3 helai rambut berupa tabung Bezier.
  #buildBangs() {
    this.bangsGrp = this.#node(this.head, 'Bangs', [0, 0, 0]);
    const bangTop = [[ 0.00, 0.44, 0.26], [ 0.00, 0.68, 0.50], [ 0.00, 0.62, 0.78], [ 0.00, 0.36, 0.88]];
    const bangMid = [[-0.02, 0.41, 0.29], [-0.06, 0.58, 0.52], [-0.08, 0.48, 0.76], [-0.05, 0.24, 0.82]];
    const bangBot = [[ 0.02, 0.38, 0.31], [ 0.06, 0.48, 0.52], [ 0.07, 0.36, 0.70], [ 0.04, 0.14, 0.74]];
    this.#curveStrand(this.bangsGrp, 'BangTop', bangTop, 0.042, 0.068, 0.004, COLORS.orange);
    this.#curveStrand(this.bangsGrp, 'BangMid', bangMid, 0.038, 0.060, 0.004, COLORS.orange);
    this.#curveStrand(this.bangsGrp, 'BangBot', bangBot, 0.034, 0.052, 0.004, COLORS.orange);
  }

  // Rantai lengan: Shoulder -> UpperArm -> Elbow -> Wrist -> Palm -> jari.
  #buildArms() {
    for (const s of [-1, 1]) {
      const sh = this.#node(this.torso, `Shoulder${s}`, [s * 0.25, 0.55, 0]);
      this.#part(sh, 'sphere', [0, 0, 0], [0.074, 0.074, 0.074], COLORS.orange, 0.08);

      const up = this.#node(sh, `UpperArm${s}`, [0, 0, 0]);
      this.#part(up, 'cylinder', [0, -0.15, 0], [0.058, 0.30, 0.058], COLORS.orange, 0.08);

      const el = this.#node(up, `Elbow${s}`, [0, -0.30, 0]);
      this.#part(el, 'sphere',   [0, 0, 0],     [0.066, 0.066, 0.066], COLORS.orange, 0.08);
      this.#part(el, 'cylinder', [0, -0.12, 0], [0.055, 0.24, 0.055], COLORS.orange, 0.08);

      const wrist = this.#node(el, `Wrist${s}`, [0, -0.24, 0]);
      this.#part(wrist, 'cylinderCuff', [0,  0.02, 0], [0.134, 0.075, 0.134], COLORS.white, 0.18, { r: [0.08, 0, 0] });
      this.#part(wrist, 'cylinderCuff', [0, -0.04, 0], [0.142, 0.075, 0.142], COLORS.white, 0.18, { r: [-0.05, 0, 0] });
      this.#part(wrist, 'cylinder',     [0, -0.08, 0], [0.114, 0.030, 0.114], COLORS.black, 0.15);

      const palm = this.#node(wrist, `Palm${s}`, [0, -0.18, 0.02]);
      this.#part(palm, 'sphere', [0, 0, 0], [0.152, 0.142, 0.138], COLORS.white, 0.22);

      // 4 Fingers
      [-0.088, -0.029, 0.029, 0.088].forEach((fx, fi) => {
        const fin = this.#node(palm, `Finger${s}_${fi}`, [fx, -0.02, 0.088]);
        this.#part(fin, 'sphere',   [0,  0.028, 0.018],  [0.045, 0.045, 0.046], COLORS.white, 0.22);
        this.#part(fin, 'cylinder', [0, -0.020, 0.018],  [0.040, 0.078, 0.040], COLORS.white, 0.22, { r: [0.30, 0, 0] });
        this.#part(fin, 'sphere',   [0, -0.058, 0.000],  [0.042, 0.042, 0.042], COLORS.white, 0.22);
        this.#part(fin, 'cylinder', [0, -0.058, -0.038], [0.036, 0.078, 0.036], COLORS.white, 0.22, { r: [1.45, 0, 0] });
      });

      // Thumb
      this.#part(palm, 'sphere', [s * 0.11, 0.015, 0.045], [0.050, 0.055, 0.050], COLORS.white, 0.22);

      this.joints.arms[s] = { sh: up, el, s };
    }
  }

  // Rantai kaki: Hip -> Knee -> Foot (sepatu).
  #buildLegs() {
    for (const s of [-1, 1]) {
      const hip = this.#node(this.root, `Hip${s}`, [s * 0.135, 1.02, 0]);
      this.#part(hip, 'sphere',   [0, 0, 0],     [0.085, 0.085, 0.085], COLORS.orange, 0.08);
      this.#part(hip, 'cylinder', [0, -0.19, 0], [0.068, 0.38, 0.068],  COLORS.orange, 0.08);

      const knee = this.#node(hip, `Knee${s}`, [0, -0.38, 0]);
      this.#part(knee, 'sphere',   [0, 0, 0],     [0.070, 0.070, 0.070], COLORS.orange, 0.08);
      this.#part(knee, 'cylinder', [0, -0.19, 0], [0.064, 0.38, 0.064],  COLORS.orange, 0.08);

      const foot = this.#node(knee, `Foot${s}`, [0, -0.40, 0], [0, s * -0.08, 0]);
      this.#part(foot, 'cylinderCuff', [0, 0.045, 0], [0.160, 0.075, 0.164], COLORS.white, 0.18);
      this.#part(foot, 'cylinder',     [0, 0.00, 0], [0.134, 0.040, 0.144], COLORS.black, 0.15);

      // Red heel
      this.#part(foot, 'sphere',   [0, -0.11, -0.04], [0.194, 0.154, 0.222], COLORS.red, 0.42);
      this.#part(foot, 'cylinder', [0, -0.06, -0.02], [0.150, 0.120, 0.160], COLORS.red, 0.42);

      // White shoe front
      this.#part(foot, 'sphere',   [0, -0.125, 0.14], [0.190, 0.148, 0.270], COLORS.white, 0.38, { r: [0.08, 0, 0] });

      // Gray sole
      this.#part(foot, 'cylinder', [0, -0.205, 0.05], [0.196, 0.038, 0.360], COLORS.gray, 0.15);
      this.#part(foot, 'sphere',   [0, -0.195, 0.05], [0.202, 0.028, 0.375], COLORS.gray, 0.15);

      this.joints.legs[s] = { hip, knee, foot };
    }
  }

  // Dua ekor (tabung Bezier dua warna) pada satu hub baling-baling.
  #buildTails() {
    const tailRadius = (t) => {
      if (t < 0.58) return 0.055 + 0.225 * Math.sin((t / 0.58) * (Math.PI / 2));
      const u = (t - 0.58) / 0.42;
      return 0.28 * Math.pow(Math.max(0, 1 - Math.pow(u, 1.55)), 0.80);
    };

    // Propeller axis vector connecting P0 [0, 0.12, -0.15] to P1 [0, -0.08, -1.15]
    // Inisialisasi Arbitrary Axis Rotation (AA) sumbu Y-Z
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
      const tailOrangeMesh = this.renderer.uploadMesh(makeBezierTube(P, tailRadius, 28, 16, 0.0, 0.58));
      const tailWhiteMesh = this.renderer.uploadMesh(makeBezierTube(P, tailRadius, 20, 16, 0.58, 1.0));
      pivot.parts.push(createPart(tailOrangeMesh, [0, 0, 0], [1, 1, 1], COLORS.orange, { spec: 0.10 }));
      pivot.parts.push(createPart(tailWhiteMesh, [0, 0, 0], [1, 1, 1], COLORS.white,  { spec: 0.10 }));

      // 5 White tuft cones around tip
      [
        { t: 0.74, ang: 1.2,  sc: [0.058, 0.23, 0.048] },
        { t: 0.78, ang: 2.5,  sc: [0.058, 0.25, 0.048] },
        { t: 0.82, ang: -1.6, sc: [0.052, 0.23, 0.042] },
        { t: 0.86, ang: 0.2,  sc: [0.052, 0.26, 0.042] },
        { t: 0.91, ang: 3.1,  sc: [0.048, 0.23, 0.040] },
      ].forEach((sp) => {
        const c = evaluateBezier3D(P, sp.t), T = normalize3(bezierDerivative3D(P, sp.t));
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
          COLORS.white,
          { r: [rx, 0, rz], spec: 0.08 }
        ));
      });
      this.joints.tails[s] = pivot;
    }
  }

  /* ----------------------------- Kontrak karakter ----------------------------- */

  getRoot() {
    return this.root;
  }

  // Mode hanya mengganti bobot target; transisinya terjadi di update().
  setAnimation(mode) {
    if (!MODES.includes(mode)) {
      throw new Error(`Unknown Tails animation mode: ${mode}`);
    }
    this.animation = mode;
    this.targetWeights = { walk: 0, fly: 0 };
    if (mode === 'walk') this.targetWeights.walk = 1;
    if (mode === 'fly') this.targetWeights.fly = 1;
  }

  reset() {
    this.animation = 'idle';
    this.targetWeights = { walk: 0, fly: 0 };
    this.weights = { walk: 0, fly: 0 };
    this.walkPhase = 0;
    this.tailSpin = 0;
    this.nextBlink = 2.0;
    this.blinkStart = -10;

    this.root.t = [0, 0, 0];
    this.root.r = [0, 0, 0];
    this.root.s = [1, 1, 1];
    this.root.aa = null;

    this.torso.t = [0, 1.05, 0];
    this.torso.r = [0, 0, 0];
    this.torso.s = [1, 1, 1];
    this.neck.r = [0, 0, 0];
    this.head.r = [0, 0, 0];
    this.bangsGrp.r = [0, 0, 0];

    for (const s of [-1, 1]) {
      this.joints.ears[s].r = [0.05, s * 0.16, s * -0.40];

      const arm = this.joints.arms[s];
      arm.sh.r = [0.35, s * -0.34, s * 0.42];
      arm.el.r = [-1.62, s * 0.34, s * -0.16];

      const leg = this.joints.legs[s];
      leg.hip.r = [0, 0, s * 0.068];
      leg.knee.r = [0.02, 0, 0];
      leg.foot.r = [0, s * -0.08, -s * 0.068 * 0.85];

      this.joints.tails[s].r = [0, 0, 0];
    }

    this.tailPropellerHub.aa = null;
    this.tailPropellerHub.r = [0, 0, 0];
    this.eyes.forEach((eye) => { eye.s = [1, 1, 1]; });
  }

  update(dt, elapsedTime) {
    const t = elapsedTime;
    const safeDt = Math.min(0.05, Math.max(0, dt || 0.016));

    // Bobot bergerak eksponensial menuju target (transisi sekitar 0.3 detik).
    const k = 1 - Math.exp(-safeDt * 7.0);
    this.weights.walk += (this.targetWeights.walk - this.weights.walk) * k;
    this.weights.fly += (this.targetWeights.fly - this.weights.fly) * k;
    this.walkPhase += safeDt * 7.5 * this.weights.walk;

    const breath = Math.sin(t * 2.2);
    this.#animateBody(t, breath);
    this.#animateLegs();
    this.#animateArms();
    this.#animateTails(t, safeDt);
    this.#animateBlink(t);
  }

  /* ----------------------------- Animasi per bagian ----------------------------- */

  // Root melayang (terbang) atau memantul (jalan); torso bernapas dan condong.
  // Translasi Torso sumbu Y dan Scaling Torso sumbu X/Z Pernapasan
  #animateBody(t, breath) {
    const { walk, fly } = this.weights;
    const flyHover = 0.68 + 0.10 * Math.sin(t * 3.5);
    const walkBob = Math.abs(Math.cos(this.walkPhase)) * 0.06;
    this.root.t[1] = fly * flyHover + walk * walkBob;
    // Translasi Torso
    this.torso.t[1] = 1.05 + breath * 0.007 * (1 - fly);
    const breathScale = 1 + 0.015 * breath * (1 - fly);
    // Scaling Torso
    this.torso.s = [breathScale, 1, breathScale];

    this.torso.r[0] = fly * 0.36 + walk * 0.12;

    // Translasi Leher ikut gerakan torso
    this.neck.r[0] = 0.03 * breath * walk * (1 - fly) + fly * -0.22 - walk * 0.06;

    // Rotasi Kepala sumbu Y
    this.head.r[1] = 0.14 * Math.sin(t * 0.7) * (1 - walk * 0.6) * (1 - fly * 0.8);
    this.head.r[2] = 0.03 * Math.sin(t * 0.9 + 1) * walk * (1 - fly);
    this.bangsGrp.r[0] = 0.03 * Math.sin(t * 3.0) - fly * 0.08;

    for (const s of [-1, 1]) {
     
      this.joints.ears[s].r[0] = 0.05;
    }
  }


  #animateLegs() {
    const { walk, fly } = this.weights;
    for (const [s, phase] of [[1, this.walkPhase], [-1, this.walkPhase + Math.PI]]) {
      const leg = this.joints.legs[s];
      const spread = s * 0.068;
      const walkHip = -Math.sin(phase) * 0.65;
      const walkKnee = Math.max(0, Math.cos(phase)) * 0.92;
      const walkFoot = -(walkHip + walkKnee) * 0.68;
      //mode jalan dia rotasi sumbu X 
      const hipX = walkHip * walk + 0.28 * fly;
      const kneeX = (walkKnee + 0.02) * walk + 0.65 * fly;
      const footX = walkFoot * walk + 0.52 * fly;

      leg.hip.r = [hipX, 0, spread];
      leg.knee.r = [kneeX, 0, 0];
      leg.foot.r = [footX, s * -0.08, -spread * 0.85];
    }
  }

  // Pose idle dicampur ke pose jalan (lengan berlawanan kaki), lalu ke pose terbang.
  #animateArms() {
    const { walk, fly } = this.weights;
    for (const s of [-1, 1]) {
      const arm = this.joints.arms[s];
      let rx = 0.35;
      const ry = s * -0.34;
      let rz = s * 0.42;
      let elx = -1.62;
      const ely = s * 0.34;
      const elz = s * -0.16;
      //mode jalan dia rotasi sumbu X
      //saat walk
      rx += (s * Math.sin(this.walkPhase) * 0.72 - rx) * walk;
      elx += (-1.10 - elx) * walk;
      //saat fly
      rx += (0.24 - rx) * fly;
      rz += (s * 0.82 - rz) * fly;
      elx += (-0.85 - elx) * fly;

      arm.sh.r = [rx, ry, rz];
      arm.el.r = [elx, ely, elz];
    }
  }

  // Ekor: hub berputar pada sumbu tailAxis (rotasi sumbu sembarang) seperti
  // baling-baling saat terbang; saat diam kembali halus ke sudut kelipatan 2*PI.
  #animateTails(t, dt) {
    const { walk, fly } = this.weights;
    this.tailSpin += dt * (fly * 32.0 + walk * 6.0); //kecepatan putar ekor kalau fly / walk
    if (fly < 0.02 && walk < 0.02) {
      const restAngle = Math.round(this.tailSpin / (Math.PI * 2)) * Math.PI * 2;
      this.tailSpin += (restAngle - this.tailSpin) * Math.min(1, dt * 6);
    }
    this.tailPropellerHub.aa = { a: this.tailAxis, ang: this.tailSpin };

    //Rotasi Ekor: bob rotasi sumbu X (naik-turun) dan wag rotasi sumbu Y (kiri-kanan) untuk kedua ekor
    const wag = Math.sin(t * 2.3) * 0.08 * (1 - fly);
    const bob = 0.04 * Math.sin(t * 3.0) * (1 - fly);
    this.joints.tails[1].r = [bob, wag, 0];
    this.joints.tails[-1].r = [bob, -wag, 0];
  }

  // Kedipan pada interval acak 2.4 - 5.0 detik.

  #animateBlink(t) {
    if (t > this.nextBlink) {
      this.blinkStart = t;
      this.nextBlink = t + 2.4 + Math.random() * 2.6;
    }
    //Scaling mata sumbu Y
    const blinkProgress = (t - this.blinkStart) / 0.16;
    const eyeScaleY = blinkProgress >= 0 && blinkProgress <= 1 ? 1 - 0.92 * Math.sin(Math.PI * blinkProgress) : 1;
    this.eyes.forEach((eye) => { eye.s = [1, eyeScaleY, 1]; });
  }

  render(context) {
    assertRenderContext(context, 'Tails');
    return this.renderer.drawTree(this.root, this.shader, (part, world) => ({
      uModel: world,
      uView: context.viewMatrix,
      uProj: context.projectionMatrix,
      uNorm: normalMatrix(world),
      uColor: part.color,
      uCam: context.cameraPosition,
      uSpec: part.spec !== undefined ? part.spec : 0.10,
    }));
  }
}
