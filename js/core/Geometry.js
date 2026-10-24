const TAU = Math.PI * 2;

function normalize3(a) {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
}

function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

// CPU mesh descriptor matching the baseline's p/n/i/c fields before GPU upload.
export function mkMesh(pos, nor, idx) {
  return {
    p: new Float32Array(pos),
    n: new Float32Array(nor),
    i: new Uint16Array(idx),
    c: idx.length,
  };
}

function grid(indexes, rows, columns) {
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      indexes.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
}

// Unit sphere; ellipsoid shapes are produced by the caller's local scale.
export function makeSphere(sl = 36, st = 24) {
  const pos = [];
  const nor = [];
  const idx = [];
  for (let i = 0; i <= st; i += 1) {
    const theta = (i / st) * Math.PI;
    for (let j = 0; j <= sl; j += 1) {
      const phi = (j / sl) * TAU;
      const x = Math.sin(theta) * Math.cos(phi);
      const y = Math.cos(theta);
      const z = Math.sin(theta) * Math.sin(phi);
      pos.push(x, y, z);
      nor.push(x, y, z);
    }
  }
  grid(idx, st, sl);
  return mkMesh(pos, nor, idx);
}

// Unit elliptic cone: base at y=0 and sharp point at y=1.
export function makeCone(seg = 28) {
  const pos = [];
  const nor = [];
  const idx = [];
  const k = Math.SQRT1_2;
  for (let j = 0; j <= seg; j += 1) {
    const angle = (j / seg) * TAU;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    pos.push(cosine, 0, sine, 0, 1, 0);
    nor.push(cosine * k, k, sine * k, cosine * k, k, sine * k);
  }
  for (let j = 0; j < seg; j += 1) {
    const a = 2 * j;
    idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
  }
  const center = pos.length / 3;
  pos.push(0, 0, 0);
  nor.push(0, -1, 0);
  for (let j = 0; j <= seg; j += 1) {
    const angle = (j / seg) * TAU;
    pos.push(Math.cos(angle), 0, Math.sin(angle));
    nor.push(0, -1, 0);
  }
  for (let j = 0; j < seg; j += 1) {
    idx.push(center, center + 1 + j, center + 2 + j);
  }
  return mkMesh(pos, nor, idx);
}

// Unit elliptic paraboloid with a rounded dome at y=1 and flat base at y=0.
export function makeParaboloid(seg = 28, rows = 14) {
  const pos = [];
  const nor = [];
  const idx = [];
  for (let i = 0; i <= rows; i += 1) {
    const radius = i / rows;
    const y = 1 - radius * radius;
    for (let j = 0; j <= seg; j += 1) {
      const angle = (j / seg) * TAU;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      pos.push(radius * cosine, y, radius * sine);
      const normal = normalize3([2 * radius * cosine, 1, 2 * radius * sine]);
      nor.push(normal[0], normal[1], normal[2]);
    }
  }
  grid(idx, rows, seg);
  const center = pos.length / 3;
  pos.push(0, 0, 0);
  nor.push(0, -1, 0);
  for (let j = 0; j <= seg; j += 1) {
    const angle = (j / seg) * TAU;
    pos.push(Math.cos(angle), 0, Math.sin(angle));
    nor.push(0, -1, 0);
  }
  for (let j = 0; j < seg; j += 1) {
    idx.push(center, center + 1 + j, center + 2 + j);
  }
  return mkMesh(pos, nor, idx);
}

// Unit cylinder from y=-1 to y=0, including both caps.
export function makeCylinder(seg = 28) {
  const pos = [];
  const nor = [];
  const idx = [];
  for (let j = 0; j <= seg; j += 1) {
    const angle = (j / seg) * TAU;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    pos.push(cosine, -1, sine, cosine, 0, sine);
    nor.push(cosine, 0, sine, cosine, 0, sine);
  }
  for (let j = 0; j < seg; j += 1) {
    const a = 2 * j;
    idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
  }
  for (const y of [0, -1]) {
    const center = pos.length / 3;
    const normalY = y === 0 ? 1 : -1;
    pos.push(0, y, 0);
    nor.push(0, normalY, 0);
    for (let j = 0; j <= seg; j += 1) {
      const angle = (j / seg) * TAU;
      pos.push(Math.cos(angle), y, Math.sin(angle));
      nor.push(0, normalY, 0);
    }
    for (let j = 0; j < seg; j += 1) {
      idx.push(center, center + 1 + j, center + 2 + j);
    }
  }
  return mkMesh(pos, nor, idx);
}

export function makeTorus(R, r, a = 36, b = 16) {
  const pos = [];
  const nor = [];
  const idx = [];
  for (let i = 0; i <= a; i += 1) {
    const u = (i / a) * TAU;
    for (let j = 0; j <= b; j += 1) {
      const v = (j / b) * TAU;
      pos.push(
        (R + r * Math.cos(v)) * Math.cos(u),
        r * Math.sin(v),
        (R + r * Math.cos(v)) * Math.sin(u),
      );
      nor.push(Math.cos(v) * Math.cos(u), Math.sin(v), Math.cos(v) * Math.sin(u));
    }
  }
  grid(idx, a, b);
  return mkMesh(pos, nor, idx);
}

export function makeQuad() {
  return mkMesh(
    [-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1],
    [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    [0, 2, 1, 0, 3, 2],
  );
}

// Cubic 3D Bezier curve with the same parameter orientation as the baseline.
export function bez(p0, p1, p2, p3) {
  return (t) => {
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    return [
      a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
      a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2],
    ];
  };
}

// Tube frame and mesh generation follow the baseline, including its boundary cases.
export function makeTube(fn, segs, radial, rfn, options = {}) {
  const sN = options.sN || 1;
  const sB = options.sB || 1;
  const closed = !!options.closed;
  const up = options.up;
  const pos = [];
  const nor = [];
  const idx = [];
  let previousNormal = null;

  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    const epsilon = 0.0015;
    const point = fn(t);
    const before = fn(closed ? t - epsilon : Math.max(0, t - epsilon));
    const after = fn(closed ? t + epsilon : Math.min(1, t + epsilon));
    const tangent = normalize3([
      after[0] - before[0],
      after[1] - before[1],
      after[2] - before[2],
    ]);
    let normal;
    let binormal;
    if (up) {
      binormal = normalize3(cross3(tangent, up));
      normal = cross3(binormal, tangent);
    } else {
      if (!previousNormal) {
        const helper = Math.abs(tangent[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        previousNormal = normalize3(cross3(cross3(tangent, helper), tangent));
      }
      const projection = previousNormal[0] * tangent[0]
        + previousNormal[1] * tangent[1]
        + previousNormal[2] * tangent[2];
      normal = normalize3([
        previousNormal[0] - tangent[0] * projection,
        previousNormal[1] - tangent[1] * projection,
        previousNormal[2] - tangent[2] * projection,
      ]);
      binormal = cross3(tangent, normal);
      previousNormal = normal;
    }
    const radius = rfn(t);
    for (let j = 0; j <= radial; j += 1) {
      const phi = (j / radial) * TAU;
      const cosine = Math.cos(phi);
      const sine = Math.sin(phi);
      pos.push(
        point[0] + radius * (cosine * sN * normal[0] + sine * sB * binormal[0]),
        point[1] + radius * (cosine * sN * normal[1] + sine * sB * binormal[1]),
        point[2] + radius * (cosine * sN * normal[2] + sine * sB * binormal[2]),
      );
      const vertexNormal = normalize3([
        (cosine / sN) * normal[0] + (sine / sB) * binormal[0],
        (cosine / sN) * normal[1] + (sine / sB) * binormal[1],
        (cosine / sN) * normal[2] + (sine / sB) * binormal[2],
      ]);
      nor.push(vertexNormal[0], vertexNormal[1], vertexNormal[2]);
    }
  }
  grid(idx, segs, radial);
  return mkMesh(pos, nor, idx);
}

// A closed, smooth 3D surface around a centerline. Width and thickness are
// sampled independently so each quill can have its own silhouette.
export function makeQuill(fn, segs = 16, radial = 10, widthFn, thicknessFn, options = {}) {
  const pos = [];
  const nor = [];
  const idx = [];
  const up = options.up;
  const widthAt = widthFn || (() => 1);
  const thicknessAt = thicknessFn || (() => 1);
  let previousNormal = null;
  const widthAlongBinormal = !!options.widthAlongBinormal;

  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    const eps = .0015;
    const point = fn(t);
    const before = fn(Math.max(0, t - eps));
    const after = fn(Math.min(1, t + eps));
    const tangent = normalize3([
      after[0] - before[0],
      after[1] - before[1],
      after[2] - before[2],
    ]);
    let normal;
    let binormal;
    if (up) {
      binormal = normalize3(cross3(tangent, up));
      normal = cross3(binormal, tangent);
    } else {
      if (!previousNormal) {
        const helper = Math.abs(tangent[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
        previousNormal = normalize3(cross3(cross3(tangent, helper), tangent));
      }
      const projection = previousNormal[0] * tangent[0]
        + previousNormal[1] * tangent[1]
        + previousNormal[2] * tangent[2];
      normal = normalize3([
        previousNormal[0] - tangent[0] * projection,
        previousNormal[1] - tangent[1] * projection,
        previousNormal[2] - tangent[2] * projection,
      ]);
      binormal = cross3(tangent, normal);
      previousNormal = normal;
    }

    const width = Math.max(0, widthAt(t));
    const thickness = Math.max(0, thicknessAt(t));
    const widthAxis = widthAlongBinormal ? binormal : normal;
    const thicknessAxis = widthAlongBinormal
      ? [-normal[0], -normal[1], -normal[2]]
      : binormal;
    for (let j = 0; j <= radial; j += 1) {
      const phi = (j / radial) * TAU;
      const cosine = Math.cos(phi);
      const sine = Math.sin(phi);
      pos.push(
        point[0] + cosine * width * widthAxis[0] + sine * thickness * thicknessAxis[0],
        point[1] + cosine * width * widthAxis[1] + sine * thickness * thicknessAxis[1],
        point[2] + cosine * width * widthAxis[2] + sine * thickness * thicknessAxis[2],
      );
      nor.push(0, 0, 0);
    }
  }

  const ringSize = radial + 1;
  for (let i = 0; i < segs; i += 1) {
    for (let j = 0; j < radial; j += 1) {
      const a = i * ringSize + j;
      const b = (i + 1) * ringSize + j;
      const c = a + 1;
      const d = b + 1;
      idx.push(a, c, b, b, c, d);
    }
  }

  const tipCenter = pos.length / 3;
  const tip = fn(1);
  pos.push(tip[0], tip[1], tip[2]);
  nor.push(0, 0, 0);
  for (let j = 0; j < radial; j += 1) {
    const tipA = segs * ringSize + j;
    const tipB = tipA + 1;
    idx.push(tipCenter, tipA, tipB);
  }

  const addFaceNormal = (a, b, c) => {
    const ax = pos[b * 3] - pos[a * 3];
    const ay = pos[b * 3 + 1] - pos[a * 3 + 1];
    const az = pos[b * 3 + 2] - pos[a * 3 + 2];
    const bx = pos[c * 3] - pos[a * 3];
    const by = pos[c * 3 + 1] - pos[a * 3 + 1];
    const bz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    for (const vertex of [a, b, c]) {
      nor[vertex * 3] += nx;
      nor[vertex * 3 + 1] += ny;
      nor[vertex * 3 + 2] += nz;
    }
  };
  for (let i = 0; i < idx.length; i += 3) addFaceNormal(idx[i], idx[i + 1], idx[i + 2]);
  for (let i = 0; i < nor.length; i += 3) {
    const normal = normalize3([nor[i], nor[i + 1], nor[i + 2]]);
    nor[i] = normal[0];
    nor[i + 1] = normal[1];
    nor[i + 2] = normal[2];
  }
  return mkMesh(pos, nor, idx);
}
