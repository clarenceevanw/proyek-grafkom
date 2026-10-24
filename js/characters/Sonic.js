import { Matrix4, normalMatrix, normalize3 } from '../core/Matrix4.js';
import { bez, makeCone, makeCylinder, makeParaboloid, makeQuill, makeSphere, makeTube } from '../core/Geometry.js';
import { createNode, createPart } from '../core/MyObject.js';

const blue = [.07, .25, .90];
const tan = [.96, .78, .52];
const white = [.95, .96, 1];
const red = [.87, .06, .09];
const gold = [.98, .78, .15];
const black = [.03, .03, .04];
const green = [.10, .72, .25];
const PELVY = 1.055;
const PIV = 1.055;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pose(values = {}) {
  return Object.assign({
    hipL: 0, hipR: 0, kneeL: 0, kneeR: 0,
    shL: 0, shR: 0, spL: .2, spR: .2, elL: -.4, elR: -.4, wrR: 0,
    tx: 0, ty: 0, hx: 0, hy: 0, hz: 0, qw: 0, blink: 1,
    pv: PIV, sx: 1, sy: 1, sz: 1, ball: 0,
  }, values);
}

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
    hy: 0, hx: 0, hz: 0,
    tx: .05, qw: .03 * Math.sin(time * 3), blink: 1 - .92 * blink,
  });
}

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
    pv: PIV - .06 + .07 * Math.abs(cosine),
  });
}

function poseJump() {
  return pose({
    hipL: -1.1, hipR: -.5, kneeL: 1.2, kneeR: .9,
    shL: -2.7, shR: -2.7, spL: .5, spR: .5,
    elL: -.3, elR: -.3, tx: -.1, hx: -.25, qw: .5,
  });
}

function blendPose(from, to, amount) {
  const blended = {};
  for (const key of Object.keys(from)) blended[key] = from[key] + (to[key] - from[key]) * amount;
  return blended;
}

function poseHier(time) {
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

function smoothStep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

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
    this.reset();
  }

  #createMeshes() {
    const upload = (mesh) => this.renderer.uploadMesh(mesh);
    return {
      sphere: upload(makeSphere()),
      cone: upload(makeCone()),
      paraboloid: upload(makeParaboloid()),
      cylinder: upload(makeCylinder()),
      smile: upload(makeTube(
        bez([-.14, .14, .40], [-.07, .06, .49], [.07, .06, .49], [.14, .14, .40]),
        14, 6, () => .012,
      )),
    };
  }

  #part(mesh, position, scale, color, options = {}) {
    return createPart(this.meshes[mesh], position, scale, color, options);
  }

  #quadric(mesh, position, direction, rx, rz, length, color, options = {}) {
    const axis = normalize3(direction);
    return this.#part(mesh, position, [rx, length, rz], color, Object.assign({
      r: [Math.acos(clamp(axis[1], -1, 1)), Math.atan2(axis[0], axis[2]), 0],
    }, options));
  }

  #cone(position, direction, rx, rz, length, color, options) {
    return this.#quadric('cone', position, direction, rx, rz, length, color, options);
  }

  #paraboloid(position, direction, rx, rz, length, color, options) {
    return this.#quadric('paraboloid', position, direction, rx, rz, length, color, options);
  }

  #cylinder(position, radius, length, color, options = {}) {
    return this.#part('cylinder', position, [radius, length, radius], color, options);
  }

  #createHierarchy() {
    const add = (parent, child) => parent.addChild(child);
    const node = (options = {}) => createNode(options);
    const part = (mesh, position, scale, color, options) => this.#part(mesh, position, scale, color, options);
    const cone = (position, direction, rx, rz, length, color, options) => this.#cone(position, direction, rx, rz, length, color, options);
    const head = node({ name: 'head', t: [0, .44, 0] });
    const torso = node({ name: 'torso', t: [0, .26, 0], parts: [
      part('sphere', [0, .1, 0], [.27, .35, .22], blue),
      part('sphere', [0, .06, .145], [.185, .25, .10], tan),
      this.#paraboloid([0, .28, -.18], [0, .35, -1], .09, .05, .28, blue),
      this.#paraboloid([.13, .14, -.18], [.3, .15, -1], .08, .045, .24, blue),
      this.#paraboloid([-.13, .14, -.18], [-.3, .15, -1], .08, .045, .24, blue),
    ] });
    const pelvis = node({ name: 'pelvis', t: [0, PELVY, 0], parts: [
      part('sphere', [0, 0, 0], [.25, .19, .21], blue),
      this.#paraboloid([0, -.02, -.17], [0, -.3, -1], .10, .065, .30, blue),
    ] });

    const root = node({ name: 'root' });
    const scl = add(root, node({ name: 'scl' }));
    const piv = add(scl, node({ name: 'piv', t: [0, PIV, 0] }));
    const off = add(piv, node({ name: 'off', t: [0, -PIV, 0] }));
    const bodyGroup = add(off, node({ name: 'bodyGroup' }));
    add(bodyGroup, pelvis);
    add(pelvis, torso);
    add(torso, head);
    Object.assign(this.joints, { root, scl, piv, off, bodyGroup, pelvis, torso, head });

    head.parts.push(
      part('sphere', [0, .32, 0], [.45, .43, .43], blue),
      part('sphere', [0, .3425, -.135], [.36, .3375, .27], blue),
      part('sphere', [0, .19, .30], [.235, .165, .20], tan),
      part('sphere', [0, .29, .47], [.055, .04, .05], black, { spec: .9, shin: 80 }),
      part('smile', [0, 0, 0], [1, 1, 1], [.12, .04, .04]),
    );

    for (const side of [1, -1]) {
      head.parts.push(
        part('sphere', [side * .16, .64, .29], [.20, .05, .12], blue, { r: [0, 0, side * .32] }),
        part('cone', [side * .25, .60, -.02], [.14, .36, .06], blue, { r: [0, 0, -side * .30] }),
        part('cone', [side * .255, .60, .015], [.085, .27, .035], tan, { r: [0, 0, -side * .30] }),
      );
      const eye = add(head, node({ name: side > 0 ? 'eyeL' : 'eyeR', t: [side * .15, .40, .31], parts: [
        part('sphere', [0, 0, 0], [.17, .21, .09], white, { spec: .5, shin: 60 }),
        part('sphere', [-side * .03, -.015, .065], [.075, .105, .04], green, { spec: .6, shin: 60 }),
        part('sphere', [-side * .03, -.015, .100], [.04, .06, .025], black, { spec: .9, shin: 90 }),
      ] }));
      this.joints[eye.name] = eye;
    }

    const quillDefinitions = [
      { name: 'upper-left', p: [[-.18, .18, -.28], [-.32, .24, -.52], [-.49, .19, -.82], [-.56, .10, -1.08]], width: .40, depth: .22, taper: .58 },
      { name: 'upper-center', p: [[0, .08, -.20], [0, .36, -.46], [0, .59, -.74], [0, .58, -1.02]], width: .30, depth: .18, taper: .58 },
      { name: 'upper-right', p: [[.18, .18, -.28], [.32, .24, -.52], [.49, .19, -.82], [.56, .10, -1.08]], width: .40, depth: .22, taper: .58 },
      { name: 'lower-left', p: [[-.18, -.02, -.34], [-.29, -.10, -.50], [-.43, -.19, -.72], [-.56, -.27, -.88]], width: .34, depth: .18, taper: .76 },
      { name: 'lower-center', p: [[0, -.075, -.33], [0, -.12, -.49], [0, -.25, -.68], [0, -.34, -.84]], width: .36, depth: .18, taper: .58 },
      { name: 'lower-right', p: [[.18, -.02, -.34], [.29, -.10, -.50], [.43, -.19, -.72], [.56, -.27, -.88]], width: .34, depth: .18, taper: .76 },
    ];
    quillDefinitions.forEach((definition, index) => {
      const curve = bez(...definition.p);
      const quillMesh = this.renderer.uploadMesh(makeQuill(
        curve,
        24,
        12,
        (t) => definition.width * (.78 + .18 * Math.sin(Math.PI * t)) * Math.pow(1 - t, definition.taper) + .004,
        (t) => definition.depth * (.82 + .12 * Math.sin(Math.PI * t)) * Math.pow(1 - t, definition.taper) + .003,
        { widthAlongBinormal: true },
      ));
      const parts = [createPart(quillMesh, [0, 0, 0], [1, 1, 1], blue, { spec: .3 })];
      const quill = add(head, node({ t: [0, .26, 0], parts, name: `quill-${definition.name}` }));
      this.quills.push({ node: quill, index, side: Math.sign(definition.p[0][0]) });
    });

    const buildArm = (side, label) => {
      const shoulder = add(torso, node({ name: `sh${label}`, t: [side * .27, .25, 0], parts: [
        part('sphere', [0, 0, 0], [.075, .075, .075], tan), this.#cylinder([0, 0, 0], .052, .30, tan),
      ] }));
      const elbow = add(shoulder, node({ name: `el${label}`, t: [0, -.3, .01], parts: [
        part('sphere', [0, 0, 0], [.055, .055, .055], tan), this.#cylinder([0, 0, 0], .045, .29, tan),
      ] }));
      const wrist = add(elbow, node({ name: `wr${label}`, t: [0, -.29, .03], parts: [
        this.#cylinder([0, .045, 0], .088, .075, white),
        part('sphere', [0, -.07, .02], [.115, .105, .115], white, { spec: .15 }),
        part('sphere', [-side * .07, -.05, .09], [.045, .055, .05], white),
      ] }));
      this.joints[shoulder.name] = shoulder;
      this.joints[elbow.name] = elbow;
      this.joints[wrist.name] = wrist;
    };
    const buildLeg = (side, label) => {
      const hip = add(pelvis, node({ name: `hip${label}`, t: [side * .12, -.12, 0], parts: [
        part('sphere', [0, 0, 0], [.09, .09, .09], blue), this.#cylinder([0, 0, 0], .080, .43, blue),
      ] }));
      const knee = add(hip, node({ name: `knee${label}`, t: [0, -.43, .02], parts: [
        part('sphere', [0, 0, 0], [.075, .075, .075], blue), this.#cylinder([0, 0, 0], .064, .37, blue),
      ] }));
      const ankle = add(knee, node({ name: `ank${label}`, t: [0, -.37, 0], parts: [
        this.#cylinder([0, .10, 0], .108, .16, white, { spec: .1 }),
        part('sphere', [0, -.045, .075], [.135, .09, .235], red, { spec: .7, shin: 50 }),
        part('sphere', [0, -.105, .075], [.14, .03, .24], white),
        this.#cylinder([0, -.005, .03], .125, .05, white, { spec: .4, r: [Math.PI / 2, 0, 0], s: [.135, .12, .07] }),
        part('sphere', [side * .135, -.02, .03], [.03, .045, .05], gold, { spec: .9, shin: 70 }),
      ] }));
      this.joints[hip.name] = hip;
      this.joints[knee.name] = knee;
      this.joints[ankle.name] = ankle;
    };
    buildArm(1, 'L'); buildArm(-1, 'R'); buildLeg(1, 'L'); buildLeg(-1, 'R');

    const ballShell = node({ name: 'ballShell', visible: false, t: [0, PELVY + .16, -.03], s: [.0001, .0001, .0001], parts: [
      part('sphere', [0, 0, 0], [.46, .46, .46], blue, { spec: .35, rim: .3 }),
    ] });
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < 16; i += 1) {
      const y = 1 - (i / 15) * 2;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const point = [Math.cos(golden * i) * radius, y, Math.sin(golden * i) * radius];
      const length = .15 + .05 * (i % 3);
      const spikeRadius = .085 + .015 * (i % 2);
      ballShell.parts.push(this.#quadric('cone', [point[0] * .46, point[1] * .46, point[2] * .46], point, spikeRadius, spikeRadius * .6, length, blue, { spec: .3 }));
    }
    add(off, ballShell);
    this.joints.ballShell = ballShell;

    root.traverse(Matrix4.identity(), (_node, _world, currentPart) => {
      if (currentPart.mode === 0) currentPart.rim = .28;
    });
    return root;
  }

  getRoot() { return this.root; }

  setAnimation(mode) {
    const modes = ['idle', 'translate', 'rotate', 'scale', 'arbitrary', 'hierarchical'];
    if (!modes.includes(mode)) throw new Error(`Unsupported Sonic animation mode: ${mode}`);
    this.animation = mode;
  }

  reset() {
    this.animation = 'idle';
    this.#resetTransforms();
    this.#applyPose(pose(), 0);
  }

  #resetTransforms() {
    this.root.t = [0, .06, 0]; this.root.r = [0, 0, 0]; this.root.s = [1, 1, 1];
    this.joints.scl.s = [1, 1, 1];
    this.joints.piv.t = [0, PIV, 0];
    this.joints.piv.r = [0, 0, 0]; this.joints.piv.aa = null;
    this.joints.bodyGroup.visible = true; this.joints.bodyGroup.s = [1, 1, 1];
    this.joints.ballShell.visible = false; this.joints.ballShell.s = [.0001, .0001, .0001];
    this.joints.eyeL.s = [1, 1, 1]; this.joints.eyeR.s = [1, 1, 1];
  }

  update(_dt, elapsedTime) {
    this.#resetTransforms();
    const time = elapsedTime;
    let currentPose = poseIdle(time + 10);
    if (this.animation === 'translate') {
      const z = 2 * Math.sin(time * .7);
      this.root.t = [0, .06, z];
      this.root.r[1] = 0;
      currentPose = poseRun(time * 9, .75);
    } else if (this.animation === 'rotate') {
      const curlDuration = .45;
      const spinDuration = 1.3;
      const unfoldEnd = curlDuration + spinDuration + .45;
      if (time < unfoldEnd) {
        const ball = time < curlDuration
          ? smoothStep(0, curlDuration, time)
          : time < curlDuration + spinDuration
            ? 1
            : 1 - smoothStep(curlDuration + spinDuration, unfoldEnd, time);
        const spinProgress = clamp((time - curlDuration) / spinDuration, 0, 1);
        this.root.t = [0, .06, 0];
        this.joints.piv.r = [spinProgress * Math.PI * 2, 0, 0];
        currentPose = poseIdle(time + 10);
        currentPose.ball = ball;
      }
    } else if (this.animation === 'scale') {
      const cycle = time % 12;
      const first = smoothStep(3.4, 4, cycle) * (1 - smoothStep(7.4, 8, cycle));
      const second = smoothStep(7.4, 8, cycle) * (1 - smoothStep(11.4, 12, cycle));
      const firstScale = 1 + .6 * Math.sin(time * 1.6);
      const secondScaleY = 1 + .5 * Math.sin(time * 2.5);
      const secondScaleXZ = 1 / Math.sqrt(Math.max(.0001, secondScaleY));
      const thirdScale = [1 + .4 * Math.sin(time * 2), 1 + .4 * Math.sin(time * 2 + 2.1), 1 + .4 * Math.sin(time * 2 + 4.2)];
      const firstWeight = 1 - first - second;
      currentPose.sx = firstScale * firstWeight + secondScaleXZ * first + thirdScale[0] * second;
      currentPose.sy = firstScale * firstWeight + secondScaleY * first + thirdScale[1] * second;
      currentPose.sz = firstScale * firstWeight + secondScaleXZ * first + thirdScale[2] * second;
    } else if (this.animation === 'arbitrary') {
      const duration = 2.6;
      if (time < duration) {
        const progress = time / duration;
        const jumpBlend = smoothStep(0, .2, time) * (1 - smoothStep(2.3, duration, time));
        this.root.t = [0, .06 + 1.25 * 4 * progress * (1 - progress), 0];
        this.joints.piv.aa = { a: normalize3([1, 1, 0]), ang: progress * Math.PI * 2 };
        currentPose = blendPose(currentPose, poseJump(), jumpBlend);
      }
    } else if (this.animation === 'hierarchical') {
      currentPose = poseHier(time);
    }
    this.#applyPose(currentPose, time);
  }

  getModeInfo() {
    return { mode: this.animation };
  }

  #applyPose(currentPose, time) {
    const j = this.joints;
    j.hipL.r[0] = currentPose.hipL; j.hipR.r[0] = currentPose.hipR;
    j.kneeL.r[0] = currentPose.kneeL; j.kneeR.r[0] = currentPose.kneeR;
    j.ankL.r[0] = clamp(-(currentPose.hipL + currentPose.kneeL) * .55, -.6, .6);
    j.ankR.r[0] = clamp(-(currentPose.hipR + currentPose.kneeR) * .55, -.6, .6);
    j.shL.r[0] = currentPose.shL; j.shL.r[2] = currentPose.spL;
    j.shR.r[0] = currentPose.shR; j.shR.r[2] = -currentPose.spR;
    j.elL.r[0] = currentPose.elL; j.elR.r[0] = currentPose.elR; j.wrR.r[2] = currentPose.wrR;
    j.torso.r[0] = currentPose.tx; j.torso.r[1] = currentPose.ty;
    j.head.r[0] = currentPose.hx; j.head.r[1] = currentPose.hy; j.head.r[2] = currentPose.hz;
    this.quills.forEach((quill) => {
      quill.node.r = [0, 0, 0];
    });
    j.eyeL.s[1] = Math.max(.05, currentPose.blink); j.eyeR.s[1] = Math.max(.05, currentPose.blink);
    j.scl.s = [currentPose.sx, currentPose.sy, currentPose.sz]; j.piv.t[1] = currentPose.pv;
    const ballScale = Math.max(.0001, currentPose.ball);
    const bodyScale = Math.max(.0001, 1 - currentPose.ball);
    j.ballShell.visible = currentPose.ball > .012; j.ballShell.s = [ballScale, ballScale, ballScale];
    j.bodyGroup.visible = currentPose.ball < .988; j.bodyGroup.s = [bodyScale, bodyScale, bodyScale];
  }

  render(renderContext) {
    const context = renderContext || {};
    const view = context.viewMatrix;
    const projection = context.projectionMatrix;
    const camera = context.cameraPosition;
    const light = context.lightDirection || [.55, .85, .45];
    if (!view || !projection || !camera) throw new Error('Sonic renderContext needs viewMatrix, projectionMatrix, and cameraPosition');
    let count = 0;
    this.root.traverse(Matrix4.identity(), (_node, _world, part, world) => {
      this.renderer.drawMesh(part.mesh, this.shader, {
        uModel: world,
        uView: view,
        uProj: projection,
        uNorm: normalMatrix(world),
        uColor: part.color,
        uCam: camera,
        uLight: light,
        uMode: part.mode,
        uSpec: part.spec,
        uShin: part.shin,
        uRim: part.rim,
        uAlpha: part.alpha,
      });
      count += 1;
    });
    return count;
  }
}
