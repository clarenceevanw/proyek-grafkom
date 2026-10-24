import { Matrix4 } from './Matrix4.js';

function defaultTransform(value, fallback) {
  return value === undefined ? fallback.slice() : value;
}

export function createPart(mesh, t, s, color, options = {}) {
  return Object.assign({
    mesh,
    t,
    r: [0, 0, 0],
    s,
    color,
    mode: 0,
    spec: 0.25,
    shin: 30,
    rim: 0,
    alpha: 1,
  }, options);
}

export class MyObject {
  constructor(options = {}) {
    this.name = options.name || '';
    this.t = defaultTransform(options.t, [0, 0, 0]);
    this.r = defaultTransform(options.r, [0, 0, 0]);
    this.s = defaultTransform(options.s, [1, 1, 1]);
    this.aa = options.aa || null;
    this.parts = options.parts || [];
    this.children = options.children || [];
    this.visible = options.visible === undefined ? true : options.visible;
    this.worldMatrix = null;
  }

  addChild(child) {
    this.children.push(child);
    return child;
  }

  localMatrix() {
    let matrix = Matrix4.translation(this.t[0], this.t[1], this.t[2]);
    if (this.aa) {
      matrix = Matrix4.multiply(matrix, Matrix4.rotateAxis(this.aa.a, this.aa.ang));
    }
    if (this.r[0] || this.r[1] || this.r[2]) {
      matrix = Matrix4.multiply(
        matrix,
        Matrix4.multiply(
          Matrix4.rotateY(this.r[1]),
          Matrix4.multiply(Matrix4.rotateX(this.r[0]), Matrix4.rotateZ(this.r[2])),
        ),
      );
    }
    if (this.s[0] !== 1 || this.s[1] !== 1 || this.s[2] !== 1) {
      matrix = Matrix4.multiply(matrix, Matrix4.scale(this.s[0], this.s[1], this.s[2]));
    }
    return matrix;
  }

  partMatrix(parentMatrix, part) {
    let matrix = Matrix4.multiply(parentMatrix, Matrix4.translation(part.t[0], part.t[1], part.t[2]));
    if (part.r[0] || part.r[1] || part.r[2]) {
      matrix = Matrix4.multiply(
        matrix,
        Matrix4.multiply(
          Matrix4.rotateY(part.r[1]),
          Matrix4.multiply(Matrix4.rotateX(part.r[0]), Matrix4.rotateZ(part.r[2])),
        ),
      );
    }
    return Matrix4.multiply(matrix, Matrix4.scale(part.s[0], part.s[1], part.s[2]));
  }

  // Visitor receives (node, nodeWorld, part, partWorld) without knowing WebGL details.
  traverse(parentWorld, visit) {
    if (!this.visible) return;
    const world = Matrix4.multiply(parentWorld, this.localMatrix());
    this.worldMatrix = world;
    for (const part of this.parts) {
      visit(this, world, part, this.partMatrix(world, part));
    }
    for (const child of this.children) {
      child.traverse(world, visit);
    }
  }
}

export function createNode(options = {}) {
  return new MyObject(options);
}
