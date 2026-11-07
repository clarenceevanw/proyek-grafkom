import { normalMatrix } from '../core/Matrix4.js';
import {
  bez,
  makeQuad,
  makeSphere,
  makeTorus,
  makeTube,
} from '../core/Geometry.js';
import { createNode, createPart } from '../core/MyObject.js';
import { assertRenderContext } from '../rendering/Renderer.js';

const GOLD = [.98, .78, .15];
const DEFAULT_LIGHT = [.55, .85, .45];

// Lintasan lurus sepanjang sumbu Z, dari garis start ke garis finish.
const TRACK_START_Z = -30;
const TRACK_FINISH_Z = 30;
const TRACK_LENGTH = TRACK_FINISH_Z - TRACK_START_Z;
const TRACK_HALF_WIDTH = 3.8;
const LANE_OFFSET = TRACK_HALF_WIDTH / 3;

// Nilai uMode di shader environment (lihat shaders/environmentShader.js).
const MODE_GRASS = 2;
const MODE_HILL = 3;

// Green Hill: tanah, lintasan, ring, bukit, pohon palem, bunga, dan awan.
// Environment memiliki shader sendiri dan tidak bergantung pada karakter.
export class Environment {
  constructor(gl, resources = {}) {
    if (!gl || !resources.renderer || !resources.shader) {
      throw new Error('Environment requires gl, renderer, and shader resources');
    }
    this.gl = gl;
    this.renderer = resources.renderer;
    this.shader = resources.shader;
    // Objek yang dianimasikan di update().
    this.rings = [];
    this.palms = [];
    this.flowers = [];
    this.clouds = [];
    // Seed tetap agar posisi bunga/rotasi palem selalu sama setiap dibuka.
    this.randomSeed = 7;
    this.meshes = this.#createMeshes();
    this.root = this.#createScene();
  }

  // PRNG mulberry32 (deterministik).
  #random() {
    this.randomSeed |= 0;
    this.randomSeed = this.randomSeed + 0x6D2B79F5 | 0;
    let value = Math.imul(this.randomSeed ^ this.randomSeed >>> 15, 1 | this.randomSeed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  }

  #createMeshes() {
    const upload = (mesh) => this.renderer.uploadMesh(mesh);
    const leafWidth = (t) => .04 + .34 * Math.pow(Math.sin(Math.PI * Math.min(1, t * .98 + .02)), .8) * (1 - .3 * t);
    return {
      sphere: upload(makeSphere()),
      torus: upload(makeTorus(.36, .09)),
      quad: upload(makeQuad()),
      path: upload(makeTube((u) => this.#pathPosition(u), 1, 14, () => TRACK_HALF_WIDTH, { up: [0, 1, 0], sN: .03, sB: 1 })),
      laneLeft: upload(makeTube((u) => this.#lanePosition(TRACK_START_Z + TRACK_LENGTH * u, -LANE_OFFSET), 1, 6, () => .045, { up: [0, 1, 0] })),
      laneRight: upload(makeTube((u) => this.#lanePosition(TRACK_START_Z + TRACK_LENGTH * u, LANE_OFFSET), 1, 6, () => .045, { up: [0, 1, 0] })),
      // Batang palem dan daun palem adalah tabung di sepanjang kurva Bezier 3D.
      trunk: upload(makeTube(bez([0, 0, 0], [.3, 1.7, 0], [.8, 3.4, 0], [.6, 5, 0]), 16, 10, (t) => .3 - .14 * t)),
      leaf: upload(makeTube(bez([0, 0, 0], [1.2, .9, 0], [2.4, .9, 0], [3.4, -.3, 0]), 14, 8, leafWidth, { up: [0, 1, 0], sN: .12, sB: 1 })),
      stem: upload(makeTube((t) => [0, t * 1.1, 0], 4, 6, () => .03)),
    };
  }

  #pathPosition(u) {
    return [0, 0, TRACK_START_Z + TRACK_LENGTH * u];
  }

  #lanePosition(z, offset) {
    return [offset, .15, z];
  }

  #part(mesh, position, scale, color, options = {}) {
    return createPart(this.meshes[mesh], position, scale, color, options);
  }

  // Node tanpa child berisi satu part, langsung ditambahkan ke root.
  #addProp(root, mesh, position, scale, color, options) {
    root.addChild(createNode({ parts: [this.#part(mesh, position, scale, color, options)] }));
  }

  #createScene() {
    const root = createNode({ name: 'environment' });
    this.#addGroundAndTrack(root);
    this.#addRings(root);
    this.#addHills(root);
    this.#addPalms(root);
    this.#addFlowers(root);
    this.#addClouds(root);
    return root;
  }

  #addGroundAndTrack(root) {
    this.#addProp(root, 'quad', [0, 0, 0], [110, 1, 110], [1, 1, 1], { mode: MODE_GRASS, spec: 0 });
    this.#addProp(root, 'path', [0, 0, 0], [1, 1, 1], [.86, .72, .44], { spec: .05 });
    for (const mesh of ['laneLeft', 'laneRight']) {
      this.#addProp(root, mesh, [0, 0, 0], [1, 1, 1], [.98, .88, .48], { spec: .12 });
    }
    // Garis start putih.
    this.#addProp(root, 'quad', [0, .14, TRACK_START_Z], [TRACK_HALF_WIDTH, 1, .09], [.96, .96, .94], { spec: .05 });
    // Garis finish kotak-kotak hitam-putih (2 baris x 12 kolom).
    const tileCount = 12;
    const tileWidth = (TRACK_HALF_WIDTH * 2) / tileCount;
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < tileCount; column += 1) {
        const color = (row + column) % 2 === 0 ? [.04, .04, .05] : [.96, .96, .94];
        this.#addProp(
          root,
          'quad',
          [-TRACK_HALF_WIDTH + tileWidth * (column + .5), .14, TRACK_FINISH_Z + (row - .5) * .18],
          [tileWidth * .5, 1, .09],
          color,
          { spec: .05 },
        );
      }
    }
  }

  // 3 lajur x 6 ring emas. Fase berbeda agar ring tidak berputar serempak.
  #addRings(root) {
    const laneOffsets = [-LANE_OFFSET * 2, 0, LANE_OFFSET * 2];
    laneOffsets.forEach((offset, lane) => {
      for (const z of [-25, -15, -5, 5, 15, 25]) {
        const position = this.#lanePosition(z, offset);
        const station = (z + 25) / 10;
        const phase = lane * .7 + station * .45;
        const ring = root.addChild(createNode({
          t: [position[0], .95, position[2]],
          r: [Math.PI / 2, 0, 0],
          parts: [this.#part('torus', [0, 0, 0], [1, 1, 1], GOLD, { spec: .9, shin: 60, rim: .3 })],
        }));
        this.rings.push({ node: ring, phase });
      }
    });
  }

  // Bukit = sphere yang di-scale menjadi ellipsoid dan setengah terbenam.
  #addHills(root) {
    const hills = [
      { position: [35.2824, 7.1521], scale: [9, 6, 8], y: -1.5 },
      { position: [-29.7939, 33.7243], scale: [12, 6, 8], y: -1.5 },
      { position: [-34.1315, 11.4473], scale: [15, 8.2, 8], y: -1.5 },
      { position: [-41.1628, -8.3441], scale: [9, 10.4, 8], y: -1.5 },
      { position: [-35.9725, -31.7801], scale: [12, 12.6, 8], y: -1.5 },
      { position: [-25, -38], scale: [15, 6, 8], y: -1.5 },
      { position: [23.8351, -26.9794], scale: [12, 10.4, 8], y: -1.5 },
      { position: [39.8201, -13.3552], scale: [15, 12.6, 8], y: -1.5 },
      // Bukit kecil di dekat lintasan.
      { position: [-21, -10], scale: [6, 3.6, 5], y: -1.2 },
      { position: [21, 12], scale: [7, 3.6, 5], y: -1.2 },
      { position: [-23, 13], scale: [8, 3.6, 5], y: -1.2 },
      { position: [22, -12], scale: [9, 3.6, 5], y: -1.2 },
    ];
    hills.forEach(({ position, scale, y }) => {
      root.addChild(createNode({
        t: [position[0], y, position[1]],
        parts: [this.#part('sphere', [0, 0, 0], scale, [1, 1, 1], { mode: MODE_HILL, spec: 0 })],
      }));
    });
  }

  // Palem: batang (tabung Bezier) -> top -> 8 daun + 3 buah kelapa.
  #addPalms(root) {
    const palmPositions = [[-10, -25], [10, -18], [-10, -11], [10, -4], [-10, 4], [10, 11], [-10, 18], [10, 25], [12, 0], [9.5, 36], [-9.5, 36]];
    palmPositions.forEach((position, index) => {
      const scale = .9 + (index % 3) * .15;
      const palm = createNode({
        t: [position[0], 0, position[1]],
        r: [0, this.#random() * Math.PI * 2, 0],
        s: [scale, scale, scale],
        parts: [this.#part('trunk', [0, 0, 0], [1, 1, 1], [.55, .36, .18], { spec: .05 })],
      });
      const top = palm.addChild(createNode({ t: [.6, 5, 0] }));
      for (let k = 0; k < 8; k += 1) {
        top.addChild(createNode({
          r: [0, k * Math.PI * 2 / 8 + .2 * (k % 2), -.35 + .12 * (k % 3)],
          parts: [this.#part('leaf', [0, 0, 0], [1, 1, 1], k % 2 ? [.10, .50, .12] : [.14, .60, .14], { spec: .15 })],
        }));
      }
      for (let k = 0; k < 3; k += 1) {
        top.parts.push(this.#part('sphere', [.15 * Math.cos(k * 2.1), -.25, .15 * Math.sin(k * 2.1)], [.16, .2, .16], [.35, .22, .1]));
      }
      this.palms.push({ node: palm, phase: index * 1.3 });
      root.addChild(palm);
    });
  }

  // 26 percobaan posisi acak; posisi yang terlalu dekat lintasan dilewati.
  #addFlowers(root) {
    const pathPoints = [];
    for (let i = 0; i < 160; i += 1) pathPoints.push(this.#pathPosition(i / 160));
    const isOnTrack = (x, z) => pathPoints.some((point) => Math.hypot(point[0] - x, point[2] - z) < TRACK_HALF_WIDTH + .6);

    for (let attempt = 0; attempt < 26; attempt += 1) {
      const x = (this.#random() - .5) * 40;
      const z = (this.#random() - .5) * 26;
      if (isOnTrack(x, z)) continue;
      const flower = createNode({
        t: [x, 0, z],
        r: [0, this.#random() * Math.PI * 2, 0],
        parts: [this.#part('stem', [0, 0, 0], [1, 1, 1], [.15, .55, .15])],
      });
      flower.addChild(createNode({
        t: [0, 1.1, 0],
        r: [-.25, 0, 0],
        parts: [
          this.#part('sphere', [0, 0, 0], [.26, .26, .05], [1, .83, .10]),
          this.#part('sphere', [0, 0, .04], [.12, .12, .06], [.45, .25, .08]),
        ],
      }));
      this.flowers.push({ node: flower, phase: this.#random() * 6 });
      root.addChild(flower);
    }
  }

  // Awan = 4 sphere putih yang di-scale, melingkar di langit.
  #addClouds(root) {
    const puffs = [[0, 0, 0, 3.2, 1.2, 1.8], [2.6, -.2, .3, 2.4, 1, 1.5], [-2.6, -.3, -.2, 2.4, .9, 1.4], [.8, .7, 0, 2, 1, 1.4]];
    for (let index = 0; index < 10; index += 1) {
      const angle = index * Math.PI * 2 / 10 + .3;
      const radius = 30 + (index % 3) * 10;
      const cloud = createNode({ t: [Math.cos(angle) * radius, 16 + (index % 4) * 3, Math.sin(angle) * radius] });
      puffs.forEach((puff) => cloud.parts.push(this.#part('sphere', puff.slice(0, 3), puff.slice(3), [1, 1, 1], { spec: 0 })));
      this.clouds.push({ node: cloud, initialX: cloud.t[0], speed: .5 + .12 * (index % 3) });
      root.addChild(cloud);
    }
  }

  getRoot() { return this.root; }

  update(elapsedTime) {
    // Palem dan bunga bergoyang (rotasi Z), awan bergeser dan berulang di X.
    this.palms.forEach((palm) => { palm.node.r[2] = .025 * Math.sin(elapsedTime * .8 + palm.phase); });
    this.flowers.forEach((flower) => { flower.node.r[2] = .07 * Math.sin(elapsedTime * 1.4 + flower.phase); });
    this.clouds.forEach((cloud) => { cloud.node.t[0] = ((cloud.initialX + elapsedTime * cloud.speed + 80) % 160) - 80; });
    // Ring berputar pada sumbu Y (rotasi sumbu sembarang) dan naik-turun.
    this.rings.forEach(({ node: ring, phase }) => {
      ring.aa = { a: [0, 1, 0], ang: elapsedTime * 2.2 + phase };
      ring.t[1] = .95 + .08 * Math.sin(elapsedTime * 3 + phase);
    });
  }

  render(context) {
    assertRenderContext(context, 'Environment');
    return this.renderer.drawTree(this.root, this.shader, (part, world) => ({
      uModel: world,
      uView: context.viewMatrix,
      uProj: context.projectionMatrix,
      uNorm: normalMatrix(world),
      uColor: part.color,
      uCam: context.cameraPosition,
      uLight: context.lightDirection || DEFAULT_LIGHT,
      uMode: part.mode,
      uSpec: part.spec,
      uShin: part.shin,
      uRim: part.rim,
      uAlpha: part.alpha,
    }));
  }
}
