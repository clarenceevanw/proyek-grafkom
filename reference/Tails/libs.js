/* =====================================================================
   libs.js - Pustaka Matematika Matriks, 7-Step Arbitrary Axis Rotation,
   Shader WebGL, Generator Quadric Objects & Kurva Bezier 3D, Scene Graph
   dengan dukungan Mode Inspeksi Geometri & Wireframe.
   Harus dimuat SEBELUM main.js.
   ===================================================================== */

const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl', { antialias: true, alpha: true });
if (!gl) {
  document.body.innerHTML = '<p style="padding:20px">WebGL tidak didukung di browser ini.</p>';
  throw new Error('no webgl');
}

/* ---------------------------- Status Visualisasi Global ---------------------------- */
const VIEW_STATE = {
  mode: 'normal',   // 'normal' | 'parts' | 'clay'
  wireframe: false  // true | false
};

// Warna pembeda untuk tiap jenis geometri saat mode 'parts' aktif
const TYPE_COLORS = {
  ellipsoid:   [0.22, 0.52, 1.00], // Biru Cerah
  cylinder:    [1.00, 0.84, 0.10], // Kuning Emas
  cone:        [1.00, 0.22, 0.28], // Merah Coral (Quadric 1)
  paraboloid:  [0.72, 0.27, 1.00], // Ungu (Quadric 2)
  hyperboloid: [0.00, 0.85, 0.80], // Toska / Cyan (Quadric 3)
  bezier:      [0.12, 0.84, 0.33], // Hijau Zamrud (Kurva Bezier 3D)
  helper:      [0.90, 0.90, 0.90]
};

/* ---------------------------- Matematika Vektor ---------------------------- */
const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const scale3 = (a, s) => [a[0]*s, a[1]*s, a[2]*s];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };
const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [lerp(a[0],b[0],t), lerp(a[1],b[1],t), lerp(a[2],b[2],t)];
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t*t*(3 - 2*t); };

/* ---------------------------- Matriks 4x4 & Arbitrary Axis ---------------------------- */
const M4 = {
  ident: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k*4 + r] * b[c*4 + k];
      o[c*4 + r] = s;
    }
    return o;
  },
  translation(tx, ty, tz) {
    return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, tx,ty,tz,1]);
  },
  rotationZ(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]);
  },
  persp(fov, asp, n, f) {
    const t = 1 / Math.tan(fov / 2);
    return new Float32Array([t/asp,0,0,0, 0,t,0,0, 0,0,(f+n)/(n-f),-1, 0,0,2*f*n/(n-f),0]);
  },
  lookAt(e, c, u) {
    const z = norm(sub(e, c)), x = norm(cross(u, z)), y = cross(z, x);
    return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -dot(x,e),-dot(y,e),-dot(z,e),1]);
  },
  trs(p, r, s) {
    const cx = Math.cos(r[0]), sx = Math.sin(r[0]);
    const cy = Math.cos(r[1]), sy = Math.sin(r[1]);
    const cz = Math.cos(r[2]), sz = Math.sin(r[2]);
    const r00 = cz*cy, r01 = cz*sy*sx - sz*cx, r02 = cz*sy*cx + sz*sx;
    const r10 = sz*cy, r11 = sz*sy*sx + cz*cx, r12 = sz*sy*cx - cz*sx;
    const r20 = -sy,   r21 = cy*sx,            r22 = cy*cx;
    return new Float32Array([
      r00*s[0], r10*s[0], r20*s[0], 0,
      r01*s[1], r11*s[1], r21*s[1], 0,
      r02*s[2], r12*s[2], r22*s[2], 0,
      p[0], p[1], p[2], 1]);
  },

  /* ===================================================================
     ROTATION ABOUT AN ARBITRARY AXIS (7 Langkah Matriks Minggu 04 & 07)
     T = [D]^-1 * [Rx]^-1 * [Ry]^-1 * [Rz(theta)] * [Ry] * [Rx] * [D]
     =================================================================== */
  rotateArbitraryAxis(P0, P1, theta) {
    const A = P1[0] - P0[0], B = P1[1] - P0[1], C = P1[2] - P0[2];
    const L = Math.hypot(A, B, C);
    if (L < 1e-6) return M4.ident();
    const V = Math.hypot(B, C);

    const D    = M4.translation(-P0[0], -P0[1], -P0[2]);
    const Dinv = M4.translation( P0[0],  P0[1],  P0[2]);

    let Rx = M4.ident(), RxInv = M4.ident();
    if (V > 1e-6) {
      const cos1 = C / V, sin1 = B / V;
      Rx    = new Float32Array([1,0,0,0,  0, cos1,sin1,0,  0,-sin1,cos1,0,  0,0,0,1]);
      RxInv = new Float32Array([1,0,0,0,  0, cos1,-sin1,0, 0, sin1,cos1,0,  0,0,0,1]);
    }

    const cos2 = V / L, sin2 = -A / L;
    const Ry    = new Float32Array([cos2,0,-sin2,0,  0,1,0,0,  sin2,0,cos2,0,  0,0,0,1]);
    const RyInv = new Float32Array([cos2,0, sin2,0,  0,1,0,0, -sin2,0,cos2,0,  0,0,0,1]);
    const Rz    = M4.rotationZ(theta);

    let M = M4.mul(Dinv, RxInv);
    M = M4.mul(M, RyInv);
    M = M4.mul(M, Rz);
    M = M4.mul(M, Ry);
    M = M4.mul(M, Rx);
    M = M4.mul(M, D);
    return M;
  }
};

function normalMat(m) {
  const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
  const A = e*i - f*h, B = -(d*i - f*g), C = d*h - e*g;
  const D = -(b*i - c*h), E = a*i - c*g, F = -(a*h - b*g);
  const G = b*f - c*e, H = -(a*f - c*d), I = a*e - b*d;
  const k = 1 / (a*A + b*B + c*C || 1);
  return new Float32Array([A*k, D*k, G*k, B*k, E*k, H*k, C*k, F*k, I*k]);
}

/* ---------------------------- Shader ---------------------------- */
const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol;
uniform mat4 uModel, uView, uProj; uniform mat3 uNorm;
varying vec3 vN, vW, vC;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  vW = w.xyz; vN = normalize(uNorm * aNor); vC = aCol;
  gl_Position = uProj * uView * w;
}`;

const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec3 uColor, uEye, uLight;
uniform float uAlpha, uSpec, uUseVertCol;
varying vec3 vN, vW, vC;
void main(){
  vec3 N = normalize(vN), V = normalize(uEye - vW), L = normalize(uLight);
  vec3 vertCol = mix(vec3(1.0), vC, uUseVertCol);
  vec3 base = uColor * vertCol;

  float ndl = dot(N, L);
  float wrap = clamp((ndl + 0.45) / 1.45, 0.0, 1.0);
  float softToon = smoothstep(0.15, 0.60, wrap);
  float diff = mix(wrap, softToon, 0.28);

  vec3 hemi = mix(vec3(0.54, 0.44, 0.30), vec3(0.95, 0.96, 1.0), N.y * 0.5 + 0.5);
  vec3 L2 = normalize(vec3(-0.65, 0.25, -0.35));
  float fill = max(dot(N, L2), 0.0) * 0.20;

  vec3 col = base * (hemi * 0.48 + vec3(1.0, 0.98, 0.92) * diff * 0.76 + fill);

  float ndv = max(dot(N, V), 0.0);
  float fresnel = pow(1.0 - ndv, 3.0);
  float isFur = clamp((0.25 - uSpec) * 5.0, 0.0, 1.0);
  col += mix(base, vec3(1.0, 0.97, 0.88), 0.5) * fresnel * (0.22 * isFur + 0.08);

  vec3 H = normalize(L + V);
  col += vec3(1.0, 0.99, 0.95) * pow(max(dot(N, H), 0.0), 46.0) * uSpec;

  gl_FragColor = vec4(col, uAlpha);
}`;

function compile(type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
const prog = gl.createProgram();
gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
gl.linkProgram(prog);
gl.useProgram(prog);

const loc = {};
['aPos','aNor','aCol'].forEach(n => { loc[n] = gl.getAttribLocation(prog, n); gl.enableVertexAttribArray(loc[n]); });
['uModel','uView','uProj','uNorm','uColor','uEye','uLight','uAlpha','uSpec','uUseVertCol'].forEach(n => loc[n] = gl.getUniformLocation(prog, n));

gl.enable(gl.DEPTH_TEST);
gl.enable(gl.BLEND);
gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

/* ---------------------------- Generator Quadric & Geometri ---------------------------- */
function makeMesh(g, type = 'ellipsoid') {
  const buf = (data, isIdx) => {
    const b = gl.createBuffer();
    const t = isIdx ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
    gl.bindBuffer(t, b);
    gl.bufferData(t, isIdx ? new Uint16Array(data) : new Float32Array(data), gl.STATIC_DRAW);
    return b;
  };
  // Buat index buffer khusus untuk garis jaring Wireframe (gl.LINES)
  const wIdx = [];
  for (let i = 0; i < g.idx.length; i += 3) {
    const a = g.idx[i], b = g.idx[i+1], c = g.idx[i+2];
    wIdx.push(a, b, b, c, c, a);
  }
  return {
    pos: buf(g.pos), nor: buf(g.nor), col: buf(g.col),
    idx: buf(g.idx, true), count: g.idx.length,
    wireIdx: buf(wIdx, true), wireCount: wIdx.length,
    type
  };
}

function gridIndices(rows, cols, idx) {
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const a = i*(cols+1) + j, b = a + cols + 1;
    idx.push(a, b, a+1, a+1, b, b+1);
  }
}
const white3 = [1, 1, 1];

// 1. ELLIPSOID: (x/a)^2 + (y/b)^2 + (z/c)^2 = 1
function genSphere(seg = 36, ring = 24) {
  const pos = [], nor = [], col = [], idx = [];
  for (let i = 0; i <= ring; i++) {
    const th = i / ring * Math.PI;
    for (let j = 0; j <= seg; j++) {
      const ph = j / seg * Math.PI * 2;
      const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
      pos.push(x, y, z); nor.push(x, y, z); col.push(...white3);
    }
  }
  gridIndices(ring, seg, idx);
  return { pos, nor, col, idx };
}

// 2. CYLINDER: x^2 + z^2 = r^2, y in [-0.5, 0.5]
function genCylinder(seg = 36, bevel = 0.0) {
  const pos = [], nor = [], col = [], idx = [];
  const profile = bevel > 0 ? [
    [-0.5, 1 - bevel, 0, -1],
    [-0.5 + bevel * 0.8, 1, 1, -0.35],
    [0.0, 1 + bevel * 0.16, 1, 0.0],
    [0.5 - bevel * 0.8, 1, 1, 0.35],
    [0.5, 1 - bevel, 0, 1]
  ] : [[-0.5, 1, 1, 0], [0.5, 1, 1, 0]];

  for (let i = 0; i < profile.length; i++) {
    const [y, rad, nr, ny] = profile[i];
    for (let j = 0; j <= seg; j++) {
      const u = j / seg * Math.PI * 2;
      const cu = Math.cos(u), su = Math.sin(u);
      pos.push(cu * rad, y, su * rad);
      nor.push(...norm([cu * nr, ny, su * nr]));
      col.push(...white3);
    }
  }
  gridIndices(profile.length - 1, seg, idx);
  for (const side of [-1, 1]) {
    const c0 = pos.length / 3;
    const rad = bevel > 0 ? 1 - bevel : 1;
    pos.push(0, side * 0.5, 0); nor.push(0, side, 0); col.push(...white3);
    for (let j = 0; j <= seg; j++) {
      const u = j / seg * Math.PI * 2;
      pos.push(Math.cos(u) * rad, side * 0.5, Math.sin(u) * rad);
      nor.push(0, side, 0); col.push(...white3);
    }
    for (let j = 0; j < seg; j++) side > 0 ? idx.push(c0, c0 + 1 + j + 1, c0 + 1 + j) : idx.push(c0, c0 + 1 + j, c0 + 1 + j + 1);
  }
  return { pos, nor, col, idx };
}

// 3. QUADRIC WAJIB 1 - ELLIPTIC CONE: (x/a)^2 + (z/b)^2 = (1 - y/h)^2
function genEllipticCone(seg = 32, rings = 16) {
  const pos = [], nor = [], col = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const v = i / rings, r = 1 - v;
    for (let j = 0; j <= seg; j++) {
      const u = (j / seg) * Math.PI * 2;
      const cu = Math.cos(u), su = Math.sin(u);
      pos.push(r * cu, v, r * su);
      nor.push(...norm([cu, 1.0, su]));
      col.push(...white3);
    }
  }
  gridIndices(rings, seg, idx);
  const c0 = pos.length / 3;
  pos.push(0, 0, 0); nor.push(0, -1, 0); col.push(...white3);
  for (let j = 0; j <= seg; j++) {
    const u = j / seg * Math.PI * 2;
    pos.push(Math.cos(u), 0, Math.sin(u)); nor.push(0, -1, 0); col.push(...white3);
  }
  for (let j = 0; j < seg; j++) idx.push(c0, c0 + 1 + j + 1, c0 + 1 + j);
  return { pos, nor, col, idx };
}

// 4. QUADRIC WAJIB 2 - ELLIPTIC PARABOLOID: (x/a)^2 + (z/b)^2 = 1 - y/h
function genParaboloid(seg = 32, rings = 18) {
  const pos = [], nor = [], col = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const v = i / rings, r = Math.sqrt(1 - v);
    for (let j = 0; j <= seg; j++) {
      const u = (j / seg) * Math.PI * 2;
      const x = r * Math.cos(u), z = r * Math.sin(u);
      pos.push(x, v, z);
      nor.push(...norm([2 * x, 1, 2 * z]));
      col.push(...white3);
    }
  }
  gridIndices(rings, seg, idx);
  const c0 = pos.length / 3;
  pos.push(0, 0, 0); nor.push(0, -1, 0); col.push(...white3);
  for (let j = 0; j <= seg; j++) {
    const u = j / seg * Math.PI * 2;
    pos.push(Math.cos(u), 0, Math.sin(u)); nor.push(0, -1, 0); col.push(...white3);
  }
  for (let j = 0; j < seg; j++) idx.push(c0, c0 + 1 + j + 1, c0 + 1 + j);
  return { pos, nor, col, idx };
}

// 5. QUADRIC WAJIB 3 - HYPERBOLOID OF 1 SHEET: (x/a)^2 + (z/b)^2 - (y/c)^2 = 1
function genHyperboloid1Sheet(seg = 32, rings = 16, waist = 0.72) {
  const pos = [], nor = [], col = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const y = (i / rings) - 0.5;
    const r = waist * Math.sqrt(1 + 3.2 * y * y);
    for (let j = 0; j <= seg; j++) {
      const u = (j / seg) * Math.PI * 2;
      const cu = Math.cos(u), su = Math.sin(u);
      pos.push(r * cu, y, r * su);
      nor.push(...norm([cu, -1.5 * y, su]));
      col.push(...white3);
    }
  }
  gridIndices(rings, seg, idx);
  return { pos, nor, col, idx };
}

/* ------------- 6. KURVA BÉZIER KUBIK 3D ------------- */
function bez(P, t) {
  const u = 1 - t, a = u*u*u, b = 3*u*u*t, c = 3*u*t*t, d = t*t*t;
  return [0, 1, 2].map(k => a*P[0][k] + b*P[1][k] + c*P[2][k] + d*P[3][k]);
}
function bezD(P, t) {
  const u = 1 - t, a = 3*u*u, b = 6*u*t, c = 3*t*t;
  return [0, 1, 2].map(k => a*(P[1][k]-P[0][k]) + b*(P[2][k]-P[1][k]) + c*(P[3][k]-P[2][k]));
}

function genBezierTube(P, radiusFn, colorFn, nu = 56, nv = 22) {
  const pos = [], nor = [], col = [], idx = [];
  let initT = norm(bezD(P, 0));
  let upVec = Math.abs(initT[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let N = norm(cross(initT, upVec));
  for (let i = 0; i <= nu; i++) {
    const t = i / nu, c = bez(P, t), d = bezD(P, t), len = Math.hypot(d[0], d[1], d[2]) || 1;
    const T = [d[0]/len, d[1]/len, d[2]/len];
    const dn = dot(N, T);
    N = norm([N[0] - T[0]*dn, N[1] - T[1]*dn, N[2] - T[2]*dn]);
    const B = cross(T, N);
    const t0 = Math.max(0, t - 1e-3), t1 = Math.min(1, t + 1e-3);
    const drds = (radiusFn(t1) - radiusFn(t0)) / (t1 - t0) / len;
    const r = radiusFn(t);
    for (let j = 0; j <= nv; j++) {
      const a = j / nv * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const dir = [N[0]*ca + B[0]*sa, N[1]*ca + B[1]*sa, N[2]*ca + B[2]*sa];
      pos.push(c[0] + dir[0]*r, c[1] + dir[1]*r, c[2] + dir[2]*r);
      nor.push(...norm([dir[0] - T[0]*drds, dir[1] - T[1]*drds, dir[2] - T[2]*drds]));
      col.push(...colorFn(t, a));
    }
  }
  gridIndices(nu, nv, idx);
  return { pos, nor, col, idx };
}

// Kumpulan Primitif Standar beserta Label Jenis Objeknya
const MESH = {
  sph:     makeMesh(genSphere(), 'ellipsoid'),
  cyl:     makeMesh(genCylinder(36, 0.0), 'cylinder'),
  cylCuff: makeMesh(genCylinder(36, 0.30), 'cylinder'),
  cone:    makeMesh(genEllipticCone(32, 16), 'cone'),          // Quadric 1
  par:     makeMesh(genParaboloid(32, 18), 'paraboloid'),      // Quadric 2
  hyp1:    makeMesh(genHyperboloid1Sheet(32, 16), 'hyperboloid') // Quadric 3
};

/* ---------------------------- Scene Graph (Hierarchical Modeling) ---------------------------- */
class Node {
  constructor(o = {}) {
    this.mesh = o.mesh || null;
    this.color = o.color || [1, 1, 1];
    this.pos = (o.pos || [0, 0, 0]).slice();
    this.rot = (o.rot || [0, 0, 0]).slice();
    this.scale = (o.scale || [1, 1, 1]).slice();
    this.customMat = null;
    this.spec = o.spec === undefined ? 0.10 : o.spec;
    this.alpha = 1; this.noDepth = false; this.hidden = false;
    this.isHelper = o.isHelper || false; // Penanda untuk panggung/bayangan/garis bantu
    this.children = [];
  }
  add(n) { this.children.push(n); return n; }
  draw(parent) {
    if (this.hidden) return;
    let local = M4.trs(this.pos, this.rot, this.scale);
    if (this.customMat) local = M4.mul(this.customMat, local);
    const w = M4.mul(parent, local);

    if (this.mesh) {
      gl.uniformMatrix4fv(loc.uModel, false, w);
      gl.uniformMatrix3fv(loc.uNorm, false, normalMat(w));

      // Pilih warna berdasarkan Mode Tampilan (Normal / Warna per Jenis Objek / Clay Abu-abu)
      let activeColor = this.color;
      let useVertCol = 1.0;
      if (!this.isHelper) {
        if (VIEW_STATE.mode === 'parts') {
          activeColor = TYPE_COLORS[this.mesh.type] || [0.85, 0.85, 0.85];
          useVertCol = 0.0; // Matikan vertex color ekor agar warna hijau Kurva Bezier seragam
        } else if (VIEW_STATE.mode === 'clay') {
          activeColor = [0.82, 0.84, 0.88];
          useVertCol = 0.0;
        }
      }

      gl.uniform3fv(loc.uColor, activeColor);
      gl.uniform1f(loc.uUseVertCol, useVertCol);
      gl.uniform1f(loc.uAlpha, this.alpha);
      gl.uniform1f(loc.uSpec, VIEW_STATE.mode === 'normal' ? this.spec : 0.15);
      gl.depthMask(!this.noDepth);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.mesh.pos); gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.mesh.nor); gl.vertexAttribPointer(loc.aNor, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.mesh.col); gl.vertexAttribPointer(loc.aCol, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.mesh.idx);
      gl.drawElements(gl.TRIANGLES, this.mesh.count, gl.UNSIGNED_SHORT, 0);

      // Gambar overlay garis jaring (Wireframe) jika checkbox aktif
      if (VIEW_STATE.wireframe && !this.isHelper && this.mesh.wireIdx) {
        gl.uniform3fv(loc.uColor, [0.08, 0.12, 0.24]);
        gl.uniform1f(loc.uUseVertCol, 0.0);
        gl.uniform1f(loc.uAlpha, 0.45);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.mesh.wireIdx);
        gl.drawElements(gl.LINES, this.mesh.wireCount, gl.UNSIGNED_SHORT, 0);
      }
    }
    for (const c of this.children) c.draw(w);
  }
}
const mk  = (parent, mesh, color, pos, rot, scale, spec, isHelper = false) =>
  parent.add(new Node({ mesh, color, pos, rot, scale, spec, isHelper }));
const grp = (parent, pos, rot) => parent.add(new Node({ pos, rot }));

/* ---------------------------- Palet Warna ---------------------------- */
const COL = {
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
  stage:     [1.00, 0.80, 0.04],
  axisNeon:  [0.00, 0.95, 0.45]
};