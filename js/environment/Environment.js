import { Matrix4, normalMatrix, normalize3 } from '../core/Matrix4.js';
import {
  bez,
  makeQuad,
  makeSphere,
  makeTorus,
  makeTube,
} from '../core/Geometry.js';
import { createNode, createPart } from '../core/MyObject.js';

const GOLD = [.98, .78, .15];
const LIGHT = [.55, .85, .45];

export class Environment {
  constructor(gl, resources = {}) {
    if (!gl || !resources.renderer || !resources.shader) {
      throw new Error('Environment requires gl, renderer, and shader resources');
    }
    this.gl = gl;
    this.renderer = resources.renderer;
    this.shader = resources.shader;
    this.rings = [];
    this.palms = [];
    this.flowers = [];
    this.clouds = [];
    this.randomSeed = 7;
    this.meshes = this.#createMeshes();
    this.root = this.#createScene();
    this.skyPart = this.#part('sphere', [0, 0, 0], [1, 1, 1], [1, 1, 1], { mode: 1, spec: 0 });
    this.shadow = createNode({ parts: [this.#part('sphere', [0, 0, 0], [.6, .01, .6], [0, 0, 0], { mode: 4, alpha: .4 })] });
  }

  #random() {
    this.randomSeed |= 0;
    this.randomSeed = this.randomSeed + 0x6D2B79F5 | 0;
    let value = Math.imul(this.randomSeed ^ this.randomSeed >>> 15, 1 | this.randomSeed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  }

  #createMeshes() {
    const upload = (mesh) => this.renderer.uploadMesh(mesh);
    return {
      sphere: upload(makeSphere()),
      torus: upload(makeTorus(.36, .09)),
      quad: upload(makeQuad()),
      path: upload(makeTube((u) => this.#pathPosition(u), 260, 14, () => 1.25, { closed: true, up: [0, 1, 0], sN: .05, sB: 1 })),
      trunk: upload(makeTube(bez([0, 0, 0], [.3, 1.7, 0], [.8, 3.4, 0], [.6, 5, 0]), 16, 10, (t) => .3 - .14 * t)),
      leaf: upload(makeTube(bez([0, 0, 0], [1.2, .9, 0], [2.4, .9, 0], [3.4, -.3, 0]), 14, 8, (t) => .04 + .34 * Math.pow(Math.sin(Math.PI * Math.min(1, t * .98 + .02)), .8) * (1 - .3 * t), { up: [0, 1, 0], sN: .12, sB: 1 })),
      stem: upload(makeTube((t) => [0, t * 1.1, 0], 4, 6, () => .03)),
    };
  }

  #pathPosition(u) {
    const angle = u * Math.PI * 2;
    return [10 * Math.cos(angle) + 1.2 * Math.cos(2 * angle), 0, 7 * Math.sin(angle)];
  }

  #part(mesh, position, scale, color, options = {}) {
    return createPart(this.meshes[mesh], position, scale, color, options);
  }

  #createScene() {
    const node = (options = {}) => createNode(options);
    const add = (parent, child) => parent.addChild(child);
    const root = node({ name: 'environment' });
    const pathPoints = [];
    for (let i = 0; i < 160; i += 1) pathPoints.push(this.#pathPosition(i / 160));

    add(root, node({ parts: [this.#part('quad', [0, 0, 0], [110, 1, 110], [1, 1, 1], { mode: 2, spec: 0 })] }));
    add(root, node({ parts: [this.#part('path', [0, 0, 0], [1, 1, 1], [.86, .72, .44], { spec: .05 })] }));

    for (let a = 0; a < 12; a += 1) {
      const angle = a * Math.PI * 2 / 12 + .2;
      const radius = 36 + ((a * 7) % 5) * 3;
      add(root, node({ t: [Math.cos(angle) * radius, -1.5, Math.sin(angle) * radius], parts: [
        this.#part('sphere', [0, 0, 0], [9 + (a % 3) * 3, 6 + (a % 4) * 2.2, 8], [1, 1, 1], { mode: 3, spec: 0 }),
      ] }));
    }
    [[-21, -10], [21, 12], [-23, 13], [22, -12]].forEach((position, index) => add(root, node({
      t: [position[0], -1.2, position[1]],
      parts: [this.#part('sphere', [0, 0, 0], [6 + index, 3.6, 5], [1, 1, 1], { mode: 3, spec: 0 })],
    })));

    const palmPositions = [[-2.5, -1.5], [3, 1.8], [-14, 6], [15, -6], [-16, -8], [0, 10.5], [0, -10.5], [17, 7], [-8, 11]];
    palmPositions.forEach((position, index) => {
      const scale = .9 + (index % 3) * .15;
      const palm = node({ t: [position[0], 0, position[1]], r: [0, this.#random() * Math.PI * 2, 0], s: [scale, scale, scale], parts: [
        this.#part('trunk', [0, 0, 0], [1, 1, 1], [.55, .36, .18], { spec: .05 }),
      ] });
      const top = add(palm, node({ t: [.6, 5, 0] }));
      for (let k = 0; k < 8; k += 1) add(top, node({
        r: [0, k * Math.PI * 2 / 8 + .2 * (k % 2), -.35 + .12 * (k % 3)],
        parts: [this.#part('leaf', [0, 0, 0], [1, 1, 1], k % 2 ? [.10, .50, .12] : [.14, .60, .14], { spec: .15 })],
      }));
      for (let k = 0; k < 3; k += 1) top.parts.push(this.#part('sphere', [.15 * Math.cos(k * 2.1), -.25, .15 * Math.sin(k * 2.1)], [.16, .2, .16], [.35, .22, .1]));
      this.palms.push({ node: palm, phase: index * 1.3 });
      add(root, palm);
    });

    const flowers = [];
    for (let index = 0; index < 26 && flowers.length < 20; index += 1) {
      const x = (this.#random() - .5) * 40;
      const z = (this.#random() - .5) * 26;
      if (pathPoints.some((point) => Math.hypot(point[0] - x, point[2] - z) < 2.4)) continue;
      const flower = node({ t: [x, 0, z], r: [0, this.#random() * Math.PI * 2, 0], parts: [
        this.#part('stem', [0, 0, 0], [1, 1, 1], [.15, .55, .15]),
      ] });
      const flowerHead = add(flower, node({ t: [0, 1.1, 0], r: [-.25, 0, 0], parts: [
        this.#part('sphere', [0, 0, 0], [.26, .26, .05], [1, .83, .10]),
        this.#part('sphere', [0, 0, .04], [.12, .12, .06], [.45, .25, .08]),
      ] }));
      this.flowers.push({ node: flower, phase: this.#random() * 6, head: flowerHead });
      add(root, flower);
    }

    for (let index = 0; index < 10; index += 1) {
      const angle = index * Math.PI * 2 / 10 + .3;
      const radius = 30 + (index % 3) * 10;
      const cloud = node({ t: [Math.cos(angle) * radius, 16 + (index % 4) * 3, Math.sin(angle) * radius] });
      [[0, 0, 0, 3.2, 1.2, 1.8], [2.6, -.2, .3, 2.4, 1, 1.5], [-2.6, -.3, -.2, 2.4, .9, 1.4], [.8, .7, 0, 2, 1, 1.4]].forEach((part) => cloud.parts.push(this.#part('sphere', part.slice(0, 3), part.slice(3), [1, 1, 1], { spec: 0 })));
      this.clouds.push({ node: cloud, initialX: cloud.t[0], speed: .5 + .12 * (index % 3) });
      add(root, cloud);
    }

    for (let index = 0; index < 24; index += 1) {
      const u = (index + .5) / 24;
      const position = this.#pathPosition(u);
      const ring = node({ t: [position[0], .95, position[2]], r: [Math.PI / 2, 0, 0], parts: [
        this.#part('torus', [0, 0, 0], [1, 1, 1], GOLD, { spec: .9, shin: 60, rim: .3 }),
      ] });
      this.rings.push(ring);
      add(root, ring);
    }
    return root;
  }

  getRoot() { return this.root; }

  update(elapsedTime, state = {}) {
    this.palms.forEach((palm) => { palm.node.r[2] = .025 * Math.sin(elapsedTime * .8 + palm.phase); });
    this.flowers.forEach((flower) => { flower.node.r[2] = .07 * Math.sin(elapsedTime * 1.4 + flower.phase); });
    this.clouds.forEach((cloud) => { cloud.node.t[0] = ((cloud.initialX + elapsedTime * cloud.speed + 80) % 160) - 80; });
    this.rings.forEach((ring, index) => {
      ring.visible = true;
      ring.s = [1, 1, 1];
      ring.aa = { a: [0, 1, 0], ang: elapsedTime * 2.2 + index * .5 };
      ring.t[1] = .95 + .08 * Math.sin(elapsedTime * 3 + index);
    });
    const position = state.shadowPosition || [0, 0, 0];
    this.shadow.t = [position[0], .08, position[2]];
    const scale = state.shadowScale || 1;
    this.shadow.parts[0].s = [.6 * scale, .01, .6 * scale];
    this.shadow.parts[0].alpha = .42;
  }

  #renderPart(part, world, context) {
    this.renderer.drawMesh(part.mesh, this.shader, {
      uModel: world,
      uView: context.viewMatrix,
      uProj: context.projectionMatrix,
      uNorm: normalMatrix(world),
      uColor: part.color,
      uCam: context.cameraPosition,
      uLight: context.lightDirection || LIGHT,
      uMode: part.mode,
      uSpec: part.spec,
      uShin: part.shin,
      uRim: part.rim,
      uAlpha: part.alpha,
    });
  }

  render(context) {
    const gl = context.gl;
    gl.disable(gl.DEPTH_TEST);
    this.#renderPart(this.skyPart, Matrix4.multiply(Matrix4.translation(context.cameraPosition[0], context.cameraPosition[1], context.cameraPosition[2]), Matrix4.scale(300, 300, 300)), context);
    gl.enable(gl.DEPTH_TEST);
    this.root.traverse(Matrix4.identity(), (_node, _world, part, world) => this.#renderPart(part, world, context));
    this.shadow.traverse(Matrix4.identity(), (_node, _world, part, world) => this.#renderPart(part, world, context));
  }
}
