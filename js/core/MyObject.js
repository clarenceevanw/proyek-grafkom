import { Matrix4 } from './Matrix4.js';

// Matriks rotasi Euler. Urutan default 'YXZ' berarti R = Ry * Rx * Rz
// (baseline Sonic); 'ZYX' berarti R = Rz * Ry * Rx (dipakai Knuckles).
function eulerRotation(r, order) {
  if (order === 'ZYX') {
    return Matrix4.multiply(
      Matrix4.rotateZ(r[2]),
      Matrix4.multiply(Matrix4.rotateY(r[1]), Matrix4.rotateX(r[0])),
    );
  }
  return Matrix4.multiply(
    Matrix4.rotateY(r[1]),
    Matrix4.multiply(Matrix4.rotateX(r[0]), Matrix4.rotateZ(r[2])),
  );
}

function hasRotation(r) {
  return r[0] || r[1] || r[2];
}

// Part = satu mesh yang digambar pada sebuah node, beserta transform lokal
// kecil (t/r/s) dan material (warna, specular, dll).
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

// Node scene graph. Setiap node menyimpan transform lokal:
//   t  = translasi, r = rotasi Euler (radian), s = skala,
//   aa = rotasi sumbu sembarang { a: axis, ang: sudut } (Rodrigues).
// Matriks dunia dihitung sebagai world = parentWorld * local.
export class MyObject {
  constructor(options = {}) {
    this.name = options.name || '';
    this.t = options.t === undefined ? [0, 0, 0] : options.t;
    this.r = options.r === undefined ? [0, 0, 0] : options.r;
    this.s = options.s === undefined ? [1, 1, 1] : options.s;
    this.rotationOrder = options.rotationOrder || 'YXZ';
    this.aa = options.aa || null;
    this.parts = options.parts || [];
    this.children = options.children || [];
    this.visible = options.visible === undefined ? true : options.visible;
    // partsVisible = false: part milik node ini saja yang tidak digambar;
    // matriks tetap dihitung dan anak-anaknya tetap ditelusuri.
    this.partsVisible = options.partsVisible === undefined ? true : options.partsVisible;
  }

  addChild(child) {
    this.children.push(child);
    return child;
  }

  // local = T * R_arbitrary * R_euler * S
  localMatrix() {
    let matrix = Matrix4.translation(this.t[0], this.t[1], this.t[2]);
    if (this.aa) {
      matrix = Matrix4.multiply(matrix, Matrix4.rotateAxis(this.aa.a, this.aa.ang));
    }
    if (hasRotation(this.r)) {
      matrix = Matrix4.multiply(matrix, eulerRotation(this.r, this.rotationOrder));
    }
    if (this.s[0] !== 1 || this.s[1] !== 1 || this.s[2] !== 1) {
      matrix = Matrix4.multiply(matrix, Matrix4.scale(this.s[0], this.s[1], this.s[2]));
    }
    return matrix;
  }

  // partWorld = nodeWorld * T * R_euler * S
  partMatrix(nodeWorld, part) {
    let matrix = Matrix4.multiply(nodeWorld, Matrix4.translation(part.t[0], part.t[1], part.t[2]));
    const rotation = part.r || [0, 0, 0];
    if (hasRotation(rotation)) {
      const order = part.rotationOrder || this.rotationOrder || 'YXZ';
      matrix = Matrix4.multiply(matrix, eulerRotation(rotation, order));
    }
    return Matrix4.multiply(matrix, Matrix4.scale(part.s[0], part.s[1], part.s[2]));
  }

  // Menelusuri node ini dan seluruh turunannya (depth-first).
  // visit(node, nodeWorld, part, partWorld) dipanggil untuk setiap part.
  traverse(parentWorld, visit) {
    if (!this.visible) return;
    const world = Matrix4.multiply(parentWorld, this.localMatrix());
    if (this.partsVisible) {
      for (const part of this.parts) {
        visit(this, world, part, this.partMatrix(world, part));
      }
    }
    for (const child of this.children) {
      child.traverse(world, visit);
    }
  }
}

export function createNode(options = {}) {
  return new MyObject(options);
}
