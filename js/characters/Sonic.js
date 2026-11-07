import { Matrix4, normalMatrix, normalize3 } from '../core/Matrix4.js';
import { clamp, smoothStep } from '../core/MathUtils.js';
import { bez, makeCone, makeCylinder, makeParaboloid, makeQuill, makeSphere, makeTube } from '../core/Geometry.js';
import { createNode, createPart } from '../core/MyObject.js';
import { assertRenderContext } from '../rendering/Renderer.js';

const COLORS = {
  blue: [.07, .25, .90],
  tan: [.96, .78, .52],
  white: [.95, .96, 1],
  red: [.87, .06, .09],
  gold: [.98, .78, .15],
  black: [.03, .03, .04],
  green: [.10, .72, .25],
};
const DEFAULT_LIGHT = [.55, .85, .45];

// Tinggi pelvis dari tanah, sekaligus tinggi titik pivot badan untuk rotasi
// (spin bola dan salto berputar di sekitar titik ini).
const PELVIS_Y = 1.055;
const BODY_PIVOT_Y = 1.055;
const ROOT_Y = .06;
const ROLL_ROTATIONS_PER_SECOND = 6 / 5.9;

/* ------------------------------------------------------------------
 * Pose = kumpulan sudut sendi (radian) dan parameter tubuh.
 *   hipL/R, kneeL/R   rotasi X pinggul dan lutut
 *   shL/R             ayunan bahu (rotasi X)
 *   spL/R             bukaan bahu ke samping (rotasi Z)
 *   elL/R, wrR        siku (X) dan pergelangan kanan (Z)
 *   tx, ty            rotasi torso X/Y
 *   hx, hy, hz        rotasi kepala X/Y/Z
 *   qw                goyangan duri dari baseline (lihat #applyPose)
 *   blink             skala Y mata (1 = terbuka)
 *   pv                tinggi pivot badan
 *   sx, sy, sz        skala seluruh tubuh
 *   ball              0 = tubuh normal, 1 = menggulung jadi bola
 * ------------------------------------------------------------------ */
function pose(values = {}) {
  return Object.assign({
    hipL: 0, hipR: 0, kneeL: 0, kneeR: 0,
    shL: 0, shR: 0, spL: .2, spR: .2, elL: -.4, elR: -.4, wrR: 0,
    tx: 0, ty: 0, hx: 0, hy: 0, hz: 0, qw: 0, blink: 1,
    pv: BODY_PIVOT_Y, sx: 1, sy: 1, sz: 1, ball: 0,
  }, values);
}

// Interpolasi linear setiap nilai pose (amount 0 = from, 1 = to).
function blendPose(from, to, amount) {
  const blended = {};
  for (const key of Object.keys(from)) blended[key] = from[key] + (to[key] - from[key]) * amount;
  return blended;
}

// Idle: napas (skala), ketukan ujung kaki, kepala menoleh, dan kedipan.
function poseIdle(time) {
  const body = Math.sin(time * 2.3);
  const tap = smoothStep(3, 3.6, time) * (1 - smoothStep(7.4, 8, time));
  const toeTap = Math.max(0, Math.sin(time * 9));
  const blinkTime = time % 3.7;
  const blink = blinkTime < .16 ? Math.sin((blinkTime / .16) * Math.PI) : 0;
  return pose({
    sy: 1 + .014 * body, sx: 1 - .007 * body, sz: 1 - .007 * body,
    spL: .22 + .02 * body, spR: .22 + .02 * body,
    elL: -.55, elR: -.55, shL: .05, shR: .05,
    hipR: -.03 - .16 * tap * toeTap, kneeR: .03 + .3 * tap * toeTap,
    hipL: -.03, kneeL: .03,
    hy: .14 * Math.sin(time * .7), hx: 0, hz: 0,
    tx: .05, qw: .03 * Math.sin(time * 3), blink: 1 - .92 * blink,
  });
}

// Siklus lari. phase = sudut siklus, amount = kekuatan gerakan (0..1).
function poseRun(phase, amount) {
  const sine = Math.sin(phase);
  const cosine = Math.cos(phase);
  return pose({
    hipL: -1.0 * sine * amount, hipR: 1.0 * sine * amount,
    kneeL: .15 + 1.35 * Math.max(0, cosine) * amount,
    kneeR: .15 + 1.35 * Math.max(0, -cosine) * amount,
    shL: (.55 + .75 * sine) * amount, shR: (.55 - .75 * sine) * amount,
    spL: .14, spR: .14, elL: -.9, elR: -.9,
    tx: .42 * amount, qw: .25 * amount,
    pv: BODY_PIVOT_Y - .06 + .07 * Math.abs(cosine),
  });
}

function poseJump() {
  return pose({
    hipL: -1.1, hipR: -.5, kneeL: 1.2, kneeR: .9,
    shL: -2.7, shR: -2.7, spL: .5, spR: .5,
    elL: -.3, elR: -.3, tx: -.1, hx: -.25, qw: .5,
  });
}

// Demo hierarchical: setiap sendi bergerak dengan fase berbeda.
function poseHierarchical(time) {
  return pose({
    hipL: .6 * Math.sin(time * 1.5),
    kneeL: .55 + .5 * Math.sin(time * 1.5 - 1.6),
    hipR: -.6 * Math.sin(time * 1.5),
    kneeR: .55 + .5 * Math.sin(time * 1.5 + 1.5),
    shL: 1.1 * Math.sin(time * 1.5 + .5),
    elL: -.9 + .8 * Math.sin(time * 1.5 + 1.4),
    shR: -1.4 + .5 * Math.sin(time * 1.2),
    elR: -.8 + .6 * Math.sin(time * 3),
    wrR: .6 * Math.sin(time * 6), spL: .3, spR: .3,
    tx: .2 * Math.sin(time * 1.5), ty: .5 * Math.sin(time * .9),
    hx: .25 * Math.sin(time * 1.9), hy: .6 * Math.sin(time * 1.1),
    qw: .3 + .3 * Math.sin(time * 3),
  });
}

const MODES = ['idle', 'translate', 'rotate', 'roll', 'scale', 'arbitrary', 'hierarchical'];

/* ------------------------------------------------------------------
 * Hierarki Sonic:
 *   root -> scl (skala) -> piv (pivot rotasi) -> off -> bodyGroup -> pelvis
 *     pelvis -> torso -> head -> eyeL/eyeR, 6 quill
 *            -> torso -> shL -> elL -> wrL   (dan sisi R)
 *            -> hipL -> kneeL -> ankL         (dan sisi R)
 *   off -> ballShell (bola berduri, hanya tampil saat menggulung)
 * piv ditaruh di tinggi pelvis lalu off menggeser balik, sehingga rotasi
 * pada piv berputar di sekitar pinggang, bukan di sekitar kaki.
 * ------------------------------------------------------------------ */
export class Sonic {
  constructor(gl, resources = {}) {
    if (!gl || !resources.renderer || !resources.shader) {
      throw new Error('Sonic requires gl, renderer, and shader resources');
    }
    this.gl = gl;
    this.renderer = resources.renderer;
    this.shader = resources.shader;
    this.meshes = this.#createMeshes();
    this.joints = {};
    this.quills = [];
    this.root = this.#createHierarchy();
    this.animation = 'idle';
    this.rollRunPhaseOffset = 0;
    this.reset();
  }

  /* ----------------------------- Geometri ----------------------------- */

  #createMeshes() {
    const upload = (mesh) => this.renderer.uploadMesh(mesh);
    return {
      sphere: upload(makeSphere()),
      cone: upload(makeCone()),
      paraboloid: upload(makeParaboloid()),
      cylinder: upload(makeCylinder()),
      // Senyum = tabung tipis di sepanjang kurva Bezier 3D.
      smile: upload(makeTube(
        bez([-.14, .14, .40], [-.07, .06, .49], [.07, .06, .49], [.14, .14, .40]),
        14, 6, () => .012,
      )),
    };
  }

  #part(mesh, position, scale, color, options = {}) {
    return createPart(this.meshes[mesh], position, scale, color, options);
  }

  // Quadric (cone/paraboloid) yang sumbu Y-nya diarahkan ke `direction`.
  #quadric(mesh, position, direction, rx, rz, length, color, options = {}) {
    const axis = normalize3(direction);
    return this.#part(mesh, position, [rx, length, rz], color, Object.assign({
      r: [Math.acos(clamp(axis[1], -1, 1)), Math.atan2(axis[0], axis[2]), 0],
    }, options));
  }

  #paraboloid(position, direction, rx, rz, length, color, options) {
    return this.#quadric('paraboloid', position, direction, rx, rz, length, color, options);
  }

  #cylinder(position, radius, length, color, options = {}) {
    return this.#part('cylinder', position, [radius, length, radius], color, options);
  }

  #addJoint(parent, options) {
    const joint = parent.addChild(createNode(options));
    this.joints[joint.name] = joint;
    return joint;
  }

  /* ----------------------------- Hierarki ----------------------------- */

  #createHierarchy() {
    const { blue, tan } = COLORS;
    const part = (...args) => this.#part(...args);

    const root = createNode({ name: 'root' });
    const scl = this.#addJoint(root, { name: 'scl' });
    const piv = this.#addJoint(scl, { name: 'piv', t: [0, BODY_PIVOT_Y, 0] });
    const off = this.#addJoint(piv, { name: 'off', t: [0, -BODY_PIVOT_Y, 0] });
    const bodyGroup = this.#addJoint(off, { name: 'bodyGroup' });
    this.joints.root = root;

    const pelvis = this.#addJoint(bodyGroup, { name: 'pelvis', t: [0, PELVIS_Y, 0], parts: [
      part('sphere', [0, 0, 0], [.25, .19, .21], blue),
      this.#paraboloid([0, -.02, -.17], [0, -.3, -1], .10, .065, .30, blue),
    ] });
    const torso = this.#addJoint(pelvis, { name: 'torso', t: [0, .26, 0], parts: [
      part('sphere', [0, .1, 0], [.27, .35, .22], blue),
      part('sphere', [0, .06, .145], [.185, .25, .10], tan),
      // Duri punggung = paraboloid.
      this.#paraboloid([0, .28, -.18], [0, .35, -1], .09, .05, .28, blue),
      this.#paraboloid([.13, .14, -.18], [.3, .15, -1], .08, .045, .24, blue),
      this.#paraboloid([-.13, .14, -.18], [-.3, .15, -1], .08, .045, .24, blue),
    ] });
    const head = this.#addJoint(torso, { name: 'head', t: [0, .44, 0] });

    this.#buildHead(head);
    this.#buildQuills(head);
    this.#buildArm(torso, 1, 'L');
    this.#buildArm(torso, -1, 'R');
    this.#buildLeg(pelvis, 1, 'L');
    this.#buildLeg(pelvis, -1, 'R');
    this.#buildBallShell(off);

    // Rim light untuk semua part bermaterial normal (mode 0). ballShell masih
    // tersembunyi di titik ini sehingga traversal tidak mengubah part-nya.
    root.traverse(Matrix4.identity(), (_node, _world, currentPart) => {
      if (currentPart.mode === 0) currentPart.rim = .28;
    });
    return root;
  }

  #buildHead(head) {
    const { blue, tan, white, black, green } = COLORS;
    const part = (...args) => this.#part(...args);
    head.parts.push(
      part('sphere', [0, .32, 0], [.45, .43, .43], blue),
      part('sphere', [0, .3425, -.135], [.36, .3375, .27], blue),
      part('sphere', [0, .19, .30], [.235, .165, .20], tan),
      part('sphere', [0, .29, .47], [.055, .04, .05], black, { spec: .9, shin: 80 }),
      part('smile', [0, 0, 0], [1, 1, 1], [.12, .04, .04]),
    );

    for (const side of [1, -1]) {
      // Alis dan telinga (cone biru dengan cone krem di dalamnya).
      head.parts.push(
        part('sphere', [side * .16, .64, .34], [.20, .08, .1], blue, { r: [0, 0, side * .25] }),
        part('cone', [side * .25, .60, -.02], [.14, .36, .06], blue, { r: [0, 0, -side * .30] }),
        part('cone', [side * .255, .60, .015], [.085, .27, .035], tan, { r: [0, 0, -side * .30] }),
      );
      // Mata: putih, iris hijau, pupil, highlight. Node sendiri agar bisa berkedip.
      this.#addJoint(head, { name: side > 0 ? 'eyeL' : 'eyeR', t: [side * .16, .41, .385], parts: [
        part('sphere', [0, 0, 0], [.15, .20, .05], white, { spec: .5, shin: 60 }),
        part('sphere', [0, -.01, .032], [.08, .13, .028], green, { spec: .6, shin: 60 }),
        part('sphere', [0, -.01, .05], [.042, .076, .016], black, { spec: .9, shin: 90 }),
        part('sphere', [-side * .018, .025, .062], [.02, .03, .006], white, { spec: .95, shin: 100 }),
      ] });
    }
  }

  // Enam duri kepala. Masing-masing adalah permukaan di sepanjang kurva Bezier 3D.
  #buildQuills(head) {
    const quillDefinitions = [
      { name: 'upper-left', p: [[-.16, .16, -.28], [-.32, .22, -.52], [-.49, .19, -.82], [-.56, .10, -1.08]], width: .40, depth: .22, taper: .58 },
      { name: 'upper-center', p: [[0, .08, -.20], [0, .36, -.46], [0, .59, -.74], [0, .58, -1.02]], width: .30, depth: .18, taper: .58 },
      { name: 'upper-right', p: [[.16, .16, -.28], [.32, .22, -.52], [.49, .19, -.82], [.56, .10, -1.08]], width: .40, depth: .22, taper: .58 },
      { name: 'lower-left', p: [[-.18, .04, -.34], [-.29, -.05, -.50], [-.43, -.16, -.72], [-.56, -.27, -.88]], width: .37, depth: .19, taper: .76 },
      { name: 'lower-center', p: [[0, -.075, -.33], [0, -.12, -.49], [0, -.25, -.68], [0, -.34, -.84]], width: .36, depth: .18, taper: .58 },
      { name: 'lower-right', p: [[.18, .04, -.34], [.29, -.05, -.50], [.43, -.16, -.72], [.56, -.27, -.88]], width: .37, depth: .19, taper: .76 },
    ];
    for (const definition of quillDefinitions) {
      const quillMesh = this.renderer.uploadMesh(makeQuill(
        bez(...definition.p),
        24,
        12,
        (t) => definition.width * (.78 + .18 * Math.sin(Math.PI * t)) * Math.pow(1 - t, definition.taper) + .004,
        (t) => definition.depth * (.82 + .12 * Math.sin(Math.PI * t)) * Math.pow(1 - t, definition.taper) + .003,
        { widthAlongBinormal: true },
      ));
      const quill = head.addChild(createNode({
        t: [0, .26, 0],
        name: `quill-${definition.name}`,
        parts: [createPart(quillMesh, [0, 0, 0], [1, 1, 1], COLORS.blue, { spec: .3 })],
      }));
      this.quills.push(quill);
    }
  }

  // Rantai lengan: bahu -> siku -> pergelangan (sarung tangan).
  #buildArm(torso, side, label) {
    const { tan, white } = COLORS;
    const part = (...args) => this.#part(...args);
    const shoulder = this.#addJoint(torso, { name: `sh${label}`, t: [side * .27, .25, 0], parts: [
      part('sphere', [0, 0, 0], [.075, .075, .075], tan), this.#cylinder([0, 0, 0], .052, .30, tan),
    ] });
    const elbow = this.#addJoint(shoulder, { name: `el${label}`, t: [0, -.3, .01], parts: [
      part('sphere', [0, 0, 0], [.055, .055, .055], tan), this.#cylinder([0, 0, 0], .045, .29, tan),
    ] });
    this.#addJoint(elbow, { name: `wr${label}`, t: [0, -.29, .03], parts: [
      this.#cylinder([0, .045, 0], .088, .075, white),
      part('sphere', [0, -.07, .02], [.115, .105, .115], white, { spec: .15 }),
      part('sphere', [-side * .07, -.05, .09], [.045, .055, .05], white),
    ] });
  }

  // Rantai kaki: pinggul -> lutut -> pergelangan kaki (sepatu).
  #buildLeg(pelvis, side, label) {
    const { blue, white, red, gold } = COLORS;
    const part = (...args) => this.#part(...args);
    const hip = this.#addJoint(pelvis, { name: `hip${label}`, t: [side * .12, -.12, 0], parts: [
      part('sphere', [0, 0, 0], [.09, .09, .09], blue), this.#cylinder([0, 0, 0], .080, .43, blue),
    ] });
    const knee = this.#addJoint(hip, { name: `knee${label}`, t: [0, -.43, .02], parts: [
      part('sphere', [0, 0, 0], [.075, .075, .075], blue), this.#cylinder([0, 0, 0], .064, .37, blue),
    ] });
    this.#addJoint(knee, { name: `ank${label}`, t: [0, -.37, 0], parts: [
      this.#cylinder([0, .10, 0], .108, .16, white, { spec: .1 }),
      part('sphere', [0, -.045, .075], [.135, .09, .235], red, { spec: .7, shin: 50 }),
      part('sphere', [0, -.04, .14], [.135, .09, .02], white, { spec: .28, shin: 36 }),
      part('sphere', [0, -.105, .075], [.14, .03, .24], white),
      this.#cylinder([0, -.005, .03], .125, .05, white, { spec: .4, r: [Math.PI / 2, 0, 0], s: [.135, .12, .07] }),
      part('sphere', [side * .135, -.02, .03], [.03, .045, .05], gold, { spec: .9, shin: 70 }),
    ] });
  }

  // Bola Spin Dash: sphere biru + 16 duri paraboloid yang disebar merata
  // dengan pola spiral golden angle (Fibonacci sphere).
  #buildBallShell(off) {
    const { blue } = COLORS;
    const ballShell = this.#addJoint(off, {
      name: 'ballShell',
      visible: false,
      t: [0, PELVIS_Y + .16, -.03],
      s: [.0001, .0001, .0001],
      parts: [this.#part('sphere', [0, 0, 0], [.46, .46, .46], blue, { spec: .35, rim: .3 })],
    });
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < 16; i += 1) {
      const y = 1 - (i / 15) * 2;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const point = [Math.cos(golden * i) * radius, y, Math.sin(golden * i) * radius];
      const length = .15 + .05 * (i % 3);
      const spikeRadius = .085 + .015 * (i % 2);
      ballShell.parts.push(this.#paraboloid([point[0] * .46, point[1] * .46, point[2] * .46], point, spikeRadius, spikeRadius * .6, length, blue, { spec: .3 }));
    }
  }

  /* ----------------------------- Kontrak karakter ----------------------------- */

  getRoot() { return this.root; }

  setAnimation(mode, _elapsedTime = 0, options = {}) {
    if (!MODES.includes(mode)) throw new Error(`Unsupported Sonic animation mode: ${mode}`);
    this.animation = mode;
    this.rollRunPhaseOffset = mode === 'roll' ? (options.runPhaseOffset || 0) : 0;
  }

  reset() {
    this.animation = 'idle';
    this.rollRunPhaseOffset = 0;
    this.#resetTransforms();
    this.#applyPose(pose());
  }

  // Dipanggil setiap frame sebelum animasi, agar transform tidak menumpuk.
  #resetTransforms() {
    const j = this.joints;
    this.root.t = [0, ROOT_Y, 0]; this.root.r = [0, 0, 0]; this.root.s = [1, 1, 1];
    j.scl.s = [1, 1, 1];
    j.piv.t = [0, BODY_PIVOT_Y, 0];
    j.piv.r = [0, 0, 0]; j.piv.aa = null;
    j.bodyGroup.visible = true; j.bodyGroup.s = [1, 1, 1];
    j.ballShell.visible = false; j.ballShell.s = [.0001, .0001, .0001];
    j.eyeL.s = [1, 1, 1]; j.eyeR.s = [1, 1, 1];
  }

  // elapsedTime = waktu sejak mode dimulai (detik).
  update(_dt, elapsedTime) {
    this.#resetTransforms();
    const time = elapsedTime;
    let currentPose;
    switch (this.animation) {
      case 'translate': currentPose = this.#animateTranslate(time); break;
      case 'rotate': currentPose = this.#animateSpinBall(time); break;
      case 'roll': currentPose = this.#animateRoll(time); break;
      case 'scale': currentPose = this.#animateScale(time); break;
      case 'arbitrary': currentPose = this.#animateSomersault(time); break;
      case 'hierarchical': currentPose = poseHierarchical(time); break;
      default: currentPose = poseIdle(time + 10);
    }
    this.#applyPose(currentPose);
  }

  /* ----------------------------- Mode animasi ----------------------------- */

  // Translasi: lari maju pada sumbu Z (maks 0.7 unit) sambil memantul.
  #animateTranslate(time) {
    const z = Math.min(time * .32, .7);
    this.root.t = [0, ROOT_Y + Math.abs(Math.sin(time * 20)) * .14, z];
    return poseRun(time * 20, 1);
  }

  // Rotasi: menggulung jadi bola, berputar 6 kali pada sumbu X, lalu membuka.
  #animateSpinBall(time) {
    const curlDuration = .45;
    const spinDuration = 5.9;
    const unfoldEnd = curlDuration + spinDuration + .45;
    const currentPose = poseIdle(time + 10);
    if (time >= unfoldEnd) return currentPose;

    let ball;
    if (time < curlDuration) ball = smoothStep(0, curlDuration, time);
    else if (time < curlDuration + spinDuration) ball = 1;
    else ball = 1 - smoothStep(curlDuration + spinDuration, unfoldEnd, time);

    const spinProgress = clamp((time - curlDuration) / spinDuration, 0, 1);
    this.joints.piv.r = [spinProgress * Math.PI * 2 * 6, 0, 0];
    currentPose.ball = ball;
    return currentPose;
  }

  // Roll (dipakai intro): dari lari berubah menjadi bola yang terus berputar.
  #animateRoll(time) {
    const curlDuration = .45;
    const ball = smoothStep(0, curlDuration, time);
    const runPhase = time * 20 + this.rollRunPhaseOffset;
    this.root.t = [0, ROOT_Y + (1 - ball) * Math.abs(Math.sin(runPhase)) * .14, 0];
    this.joints.piv.r = [Math.max(0, time - curlDuration) * Math.PI * 2 * ROLL_ROTATIONS_PER_SECOND, 0, 0];
    const currentPose = blendPose(poseRun(runPhase, 1), poseIdle(time + 10), ball);
    currentPose.ball = ball;
    return currentPose;
  }

  // Scale: seluruh tubuh membesar-mengecil seragam (0.4x .. 1.6x).
  #animateScale(time) {
    const currentPose = poseIdle(time + 10);
    const uniformScale = 1 + .6 * Math.sin(time * 1.6);
    currentPose.sx = uniformScale;
    currentPose.sy = uniformScale;
    currentPose.sz = uniformScale;
    return currentPose;
  }

  // Arbitrary axis: lompat parabola + salto 360 derajat pada sumbu (1,1,0)
  // yang dinormalisasi (rumus Rodrigues di Matrix4.rotateAxis).
  #animateSomersault(time) {
    const duration = 2.6;
    const idlePose = poseIdle(time + 10);
    if (time >= duration) return idlePose;
    const progress = time / duration;
    const jumpBlend = smoothStep(0, .2, time) * (1 - smoothStep(2.3, duration, time));
    this.root.t = [0, ROOT_Y + 1.25 * 4 * progress * (1 - progress), 0];
    this.joints.piv.aa = { a: normalize3([1, 1, 0]), ang: -progress * Math.PI * 2 };
    return blendPose(idlePose, poseJump(), jumpBlend);
  }

  // Menulis nilai pose ke sendi-sendi pada scene graph.
  #applyPose(currentPose) {
    const j = this.joints;
    j.hipL.r[0] = currentPose.hipL; j.hipR.r[0] = currentPose.hipR;
    j.kneeL.r[0] = currentPose.kneeL; j.kneeR.r[0] = currentPose.kneeR;
    // Pergelangan kaki mengimbangi pinggul + lutut agar telapak tetap datar.
    j.ankL.r[0] = clamp(-(currentPose.hipL + currentPose.kneeL) * .55, -.6, .6);
    j.ankR.r[0] = clamp(-(currentPose.hipR + currentPose.kneeR) * .55, -.6, .6);
    j.shL.r[0] = currentPose.shL; j.shL.r[2] = currentPose.spL;
    j.shR.r[0] = currentPose.shR; j.shR.r[2] = -currentPose.spR;
    j.elL.r[0] = currentPose.elL; j.elR.r[0] = currentPose.elR; j.wrR.r[2] = currentPose.wrR;
    j.torso.r[0] = currentPose.tx; j.torso.r[1] = currentPose.ty;
    j.head.r[0] = currentPose.hx; j.head.r[1] = currentPose.hy; j.head.r[2] = currentPose.hz;
    // Baseline menggoyangkan duri memakai pose.qw. Versi modular sengaja
    // menahan duri diam, sehingga nilai qw tidak diterapkan.
    this.quills.forEach((quill) => { quill.r = [0, 0, 0]; });
    j.eyeL.s[1] = Math.max(.05, currentPose.blink); j.eyeR.s[1] = Math.max(.05, currentPose.blink);
    j.scl.s = [currentPose.sx, currentPose.sy, currentPose.sz];
    j.piv.t[1] = currentPose.pv;
    // Tubuh mengecil saat bola membesar (dan sebaliknya).
    const ballScale = Math.max(.0001, currentPose.ball);
    const bodyScale = Math.max(.0001, 1 - currentPose.ball);
    j.ballShell.visible = currentPose.ball > .012; j.ballShell.s = [ballScale, ballScale, ballScale];
    j.bodyGroup.visible = currentPose.ball < .988; j.bodyGroup.s = [bodyScale, bodyScale, bodyScale];
  }

  render(context) {
    assertRenderContext(context, 'Sonic');
    const light = context.lightDirection || DEFAULT_LIGHT;
    return this.renderer.drawTree(this.root, this.shader, (part, world) => ({
      uModel: world,
      uView: context.viewMatrix,
      uProj: context.projectionMatrix,
      uNorm: normalMatrix(world),
      uColor: part.color,
      uCam: context.cameraPosition,
      uLight: light,
      uMode: part.mode,
      uSpec: part.spec,
      uShin: part.shin,
      uRim: part.rim,
      uAlpha: part.alpha,
    }));
  }
}
