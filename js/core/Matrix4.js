// Matrix helpers compatible with the Sonic baseline.

export function normalize3(a) {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
}

export function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export const Matrix4 = {
  identity() {
    return new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
  },

  multiply(a, b) {
    const out = new Float32Array(16);
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        let sum = 0;
        for (let k = 0; k < 4; k += 1) {
          sum += a[k * 4 + row] * b[column * 4 + k];
        }
        out[column * 4 + row] = sum;
      }
    }
    return out;
  },

  translation(x, y, z) {
    const out = Matrix4.identity();
    out[12] = x;
    out[13] = y;
    out[14] = z;
    return out;
  },

  scale(x, y, z) {
    const out = Matrix4.identity();
    out[0] = x;
    out[5] = y;
    out[10] = z;
    return out;
  },

  rotateX(angle) {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const out = Matrix4.identity();
    out[5] = cosine;
    out[6] = sine;
    out[9] = -sine;
    out[10] = cosine;
    return out;
  },

  rotateY(angle) {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const out = Matrix4.identity();
    out[0] = cosine;
    out[2] = -sine;
    out[8] = sine;
    out[10] = cosine;
    return out;
  },

  rotateZ(angle) {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const out = Matrix4.identity();
    out[0] = cosine;
    out[1] = sine;
    out[4] = -sine;
    out[5] = cosine;
    return out;
  },

  // Rodrigues rotation; the axis is normalized exactly as in the baseline.
  rotateAxis(axis, angle) {
    const [x, y, z] = normalize3(axis);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const oneMinusCosine = 1 - cosine;
    const out = Matrix4.identity();
    out[0] = cosine + x * x * oneMinusCosine;
    out[1] = x * y * oneMinusCosine + z * sine;
    out[2] = x * z * oneMinusCosine - y * sine;
    out[4] = x * y * oneMinusCosine - z * sine;
    out[5] = cosine + y * y * oneMinusCosine;
    out[6] = y * z * oneMinusCosine + x * sine;
    out[8] = x * z * oneMinusCosine + y * sine;
    out[9] = y * z * oneMinusCosine - x * sine;
    out[10] = cosine + z * z * oneMinusCosine;
    return out;
  },

  perspective(fov, aspect, near, far) {
    const factor = 1 / Math.tan(fov / 2);
    const out = new Float32Array(16);
    out[0] = factor / aspect;
    out[5] = factor;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  },

  lookAt(eye, center, up) {
    const z = normalize3([
      eye[0] - center[0],
      eye[1] - center[1],
      eye[2] - center[2],
    ]);
    const x = normalize3(cross3(up, z));
    const y = cross3(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1,
    ]);
  },
};

// Reuses one output buffer, matching the baseline's normalMat behavior.
const normalMatrixOutput = new Float32Array(9);

export function normalMatrix(matrix) {
  const a00 = matrix[0];
  const a01 = matrix[4];
  const a02 = matrix[8];
  const a10 = matrix[1];
  const a11 = matrix[5];
  const a12 = matrix[9];
  const a20 = matrix[2];
  const a21 = matrix[6];
  const a22 = matrix[10];

  const c00 = a11 * a22 - a12 * a21;
  const c01 = -(a10 * a22 - a12 * a20);
  const c02 = a10 * a21 - a11 * a20;
  const c10 = -(a01 * a22 - a02 * a21);
  const c11 = a00 * a22 - a02 * a20;
  const c12 = -(a00 * a21 - a01 * a20);
  const c20 = a01 * a12 - a02 * a11;
  const c21 = -(a00 * a12 - a02 * a10);
  const c22 = a00 * a11 - a01 * a10;
  const sign = (a00 * c00 + a01 * c01 + a02 * c02) < 0 ? -1 : 1;

  normalMatrixOutput[0] = c00 * sign;
  normalMatrixOutput[1] = c10 * sign;
  normalMatrixOutput[2] = c20 * sign;
  normalMatrixOutput[3] = c01 * sign;
  normalMatrixOutput[4] = c11 * sign;
  normalMatrixOutput[5] = c21 * sign;
  normalMatrixOutput[6] = c02 * sign;
  normalMatrixOutput[7] = c12 * sign;
  normalMatrixOutput[8] = c22 * sign;
  return normalMatrixOutput;
}
