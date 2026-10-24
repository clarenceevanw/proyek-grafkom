/* ===== KNUCKLES - WebGL murni (tanpa Three.js) =====
   Objek yang dipakai:
   - Ellipsoid (quadric): kepala, moncong, hidung, mata, badan, dada, bahu, tangan, jari, kaki, sepatu, tali sepatu
   - Elliptic paraboloid (quadric): rambut lapisan bawah (utama, belakang), manset sarung tangan
   - Cylinder (quadric): lengan, kaki, kaos kaki, sol sepatu (silinder elips)
   - Cone (quadric): paku sarung tangan
   - Hyperbolic paraboloid (quadric): alas telapak sepatu
   - Kurva Bezier 3D kubik -> mesh: helai rambut atas, rambut samping, ekor & mulut
   - Permukaan parametrik: lambang bulan sabit di dada (menempel di permukaan ellipsoid dada)
*/

const cv = document.getElementById('c');
const gl = cv.getContext('webgl', { antialias: true });

const VS = `
  attribute vec3 aP, aN;
  uniform mat4 uP, uV, uM;
  uniform mat3 uNM;
  varying vec3 vN, vW;
  void main() {
    vec4 w = uM * vec4(aP, 1.);
    vW = w.xyz;
    vN = uNM * aN;
    gl_Position = uP * uV * w;
  }
`;

const FS = `
  precision mediump float;
  varying vec3 vN, vW;
  uniform vec3 uC, uCam;
  uniform float uSp;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(uCam - vW);
    if (dot(n, v) < 0.) n = -n;
    vec3 l = normalize(vec3(.5, 1., .8));
    vec3 h = normalize(l + v);
    float d = max(dot(n, l), 0.);
    vec3 c = uC * (.26 + .2 * (.5 + .5 * n.y) + .75 * d) + vec3(.55) * pow(max(dot(n, h), 0.), 40.) * uSp;
    c += uC * pow(1. - max(dot(n, v), 0.), 3.) * .3;
    gl_FragColor = vec4(pow(c, vec3(.8)), 1.);
  }
`;

function sh(t, s) {
  const o = gl.createShader(t);
  gl.shaderSource(o, s);
  gl.compileShader(o);
  if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o));
  return o;
}

const pr = gl.createProgram();
gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
gl.linkProgram(pr);
gl.useProgram(pr);

const U = n => gl.getUniformLocation(pr, n);
const uP = U('uP'), uV = U('uV'), uM = U('uM'), uNM = U('uNM'), uC = U('uC'), uCam = U('uCam'), uSp = U('uSp');
const aP = gl.getAttribLocation(pr, 'aP');
const aN = gl.getAttribLocation(pr, 'aN');
gl.enableVertexAttribArray(aP);
gl.enableVertexAttribArray(aN);
gl.enable(gl.DEPTH_TEST);

/* ---------- matematika (matriks column-major) ---------- */

const I4 = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function mul(a, b) {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      o[i * 4 + j] = s;
    }
  }
  return o;
}

const Tm = t => { const m = I4(); m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; return m; };
const Sm = s => { const m = I4(); m[0] = s[0]; m[5] = s[1]; m[10] = s[2]; return m; };

const Rx = a => {
  const m = I4(), c = Math.cos(a), s = Math.sin(a);
  m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
  return m;
};
const Ry = a => {
  const m = I4(), c = Math.cos(a), s = Math.sin(a);
  m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
  return m;
};
const Rz = a => {
  const m = I4(), c = Math.cos(a), s = Math.sin(a);
  m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
  return m;
};

const sb = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

function persp(fov, as, n, f) {
  const m = new Float32Array(16), t = 1 / Math.tan(fov / 2);
  m[0] = t / as; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f);
  return m;
}

function look(e, c) {
  const z = nm(sb(e, c)), x = nm(cr([0, 1, 0], z)), y = cr(z, x);
  const d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -d(x, e), -d(y, e), -d(z, e), 1
  ]);
}

function nmat(m) {
  const r = (i, j) => m[j * 4 + i];
  const o = new Float32Array(9);
  let d = 0;
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const c = r((i + 1) % 3, (j + 1) % 3) * r((i + 2) % 3, (j + 2) % 3)
              - r((i + 1) % 3, (j + 2) % 3) * r((i + 2) % 3, (j + 1) % 3);
      o[j * 3 + i] = c;
      if (i == 0) d += r(0, j) * c;
    }
  }
  return o.map(x => x / d);
}

/* ---------- generator permukaan parametrik (normal dari turunan numerik) ---------- */

function surf(f, nu, nv) {
  const P = [], N = [], Ix = [], e = .002;
  const cl = x => Math.min(1 - e, Math.max(e, x));
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const u = i / nu, v = j / nv, p = f(u, v), a = cl(u), b = cl(v);
      const n = nm(cr(sb(f(a + e, b), f(a - e, b)), sb(f(a, b + e), f(a, b - e))));
      P.push(p[0], p[1], p[2]);
      N.push(n[0], n[1], n[2]);
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + nv + 1;
      Ix.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { P, N, I: Ix };
}

function mg(...gs) {
  const r = { P: [], N: [], I: [] };
  for (const g of gs) {
    const o = r.P.length / 3;
    g.P.forEach(x => r.P.push(x));
    g.N.forEach(x => r.N.push(x));
    g.I.forEach(i => r.I.push(i + o));
  }
  return r;
}

const TAU = Math.PI * 2, sin = Math.sin, cos = Math.cos;

// Ellipsoid: (a sin p cos t, b cos p, c sin p sin t)
const ell = (a, b, c) => surf((u, v) => {
  const t = u * TAU, p = v * Math.PI;
  return [a * sin(p) * cos(t), b * cos(p), c * sin(p) * sin(t)];
}, 24, 16);

// Elliptic paraboloid (ujung runcing di +y): y = h(1 - x^2/a^2 - z^2/b^2)
const epar = (a, b, h) => surf((u, v) => {
  const t = u * TAU;
  return [a * v * cos(t), h * (1 - v * v), b * v * sin(t)];
}, 20, 10);

const disc = (r, y) => surf((u, v) => [r * v * cos(u * TAU), y, r * v * sin(u * TAU)], 20, 2);

// Cylinder (berpusat di origin sepanjang y) + tutup
const cyl = (r, h) => mg(
  surf((u, v) => [r * cos(u * TAU), (v - .5) * h, r * sin(u * TAU)], 20, 2),
  disc(r, h / 2),
  disc(r, -h / 2)
);

// Cone (dasar di y=0, ujung di y=h)
const cone = (r, h) => mg(
  surf((u, v) => [r * (1 - v) * cos(u * TAU), v * h, r * (1 - v) * sin(u * TAU)], 20, 4),
  disc(r, 0)
);

// Hyperbolic paraboloid: y = k(x^2/a^2 - z^2/b^2) pada domain elips
const hpar = (a, b, k) => surf((u, v) => {
  const t = u * TAU, x = a * v * cos(t), z = b * v * sin(t);
  return [x, k * (x * x / a / a - z * z / b / b), z];
}, 24, 8);

// Kurva Bezier kubik 3D -> mesh tabung (frame Frenet dengan vektor referensi)
const bz = (p, t) => {
  const s = 1 - t;
  return [0, 1, 2].map(i => s * s * s * p[0][i] + 3 * s * s * t * p[1][i] + 3 * s * t * t * p[2][i] + t * t * t * p[3][i]);
};
const tube = (p, r0, r1, ref) => surf((u, v) => {
  const c = bz(p, v);
  const T = nm(sb(bz(p, Math.min(1, v + .002)), bz(p, Math.max(0, v - .002))));
  const N = nm(cr(T, ref)), B = cr(T, N);
  const r = (r0 + (r1 - r0) * v) * Math.min(1, Math.sqrt(v * 14), Math.sqrt((1 - v) * 14));
  const a = u * TAU;
  return [0, 1, 2].map(i => c[i] + r * (N[i] * cos(a) + B[i] * sin(a)));
}, 14, 36);

/* ---------- scene graph ---------- */

function mkbuf(g) {
  const p = gl.createBuffer(), n = gl.createBuffer(), x = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, p);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.P), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, n);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.N), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, x);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(g.I), gl.STATIC_DRAW);
  return { p, n, x, c: g.I.length };
}

const G = (t = [0, 0, 0], r = [0, 0, 0]) => ({ t: [...t], r: [...r], tt: [...t], tr: [...r], k: [] });

const M = (g, c, t = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], sp = .25) => {
  const n = G(t, r);
  n.b = mkbuf(g);
  n.c = c;
  n.s = [...s];
  n.s0 = [...s];
  n.sp = sp;
  n.r0 = [...r];
  return n;
};

const add = (p, ...c) => { c.forEach(x => p.k.push(x)); return p; };

function draw(n, pw) {
  const m = mul(pw, mul(Tm(n.t), mul(Rz(n.r[2]), mul(Ry(n.r[1]), Rx(n.r[0])))));
  if (n.b) {
    const m2 = mul(m, Sm(n.s));
    gl.uniformMatrix4fv(uM, false, m2);
    gl.uniformMatrix3fv(uNM, false, nmat(m2));
    gl.uniform3fv(uC, n.c);
    gl.uniform1f(uSp, n.sp);
    gl.bindBuffer(gl.ARRAY_BUFFER, n.b.p);
    gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, n.b.n);
    gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, n.b.x);
    gl.drawElements(gl.TRIANGLES, n.b.c, gl.UNSIGNED_SHORT, 0);
  }
  n.k.forEach(k => draw(k, m));
}

/* ---------- membangun Knuckles (gaya Sonic Forces) ---------- */

const RED = [.86, .08, .18], TAN = [.87, .66, .47], WH = [.96, .96, .97], GR = [.3, .6, .3];
const YE = [.96, .8, .25], BK = [.05, .04, .06], PU = [.45, .15, .6], SOL = [.5, .5, .55], MO = [.22, .08, .1];
const RED2 = [.78, .06, .15]; // merah sedikit lebih gelap, selang-seling antar helai
const SOLW = [.88, .88, .9];  // putih kusam untuk badan sol sepatu
const WH2 = [.86, .86, .9];   // putih sedikit abu untuk jari (memberi kesan lipatan)

const PI = Math.PI;
const D = .25; // tambahan panjang kaki (naikkan ke .35 kalau mau lebih panjang lagi)
const root = G(), tor = G([0, 1.45 + 2 * D, 0]), head = G([0, 1.15, 0]), tailG = G([0, .05, -.3]);
const ground = M(ell(6, .06, 6), [.17, .19, .27], [0, -.14, 0], [0, 0, 0], [1, 1, 1], .05); // platform terpisah dari root
const body = M(ell(.46, .7, .37), RED, [0, .5, 0]);   // badan bawah lebih pendek & ramping (tidak menjuntai di bawah pinggul)
const eyes = [], quills = [], legs = [], knees = [], arms = [], fores = [], hands = [];

add(root, tor);

/* lambang bulan sabit di dada (tanduk mengarah ke atas), menempel di permukaan ellipsoid dada
   R = jari-jari busur, A = setengah sudut busur, hw = setengah lebar maksimum (di tengah),
   yb = tinggi titik terbawah, lift = jarak angkat dari permukaan dada */
const CHEST_C = [0, .82, .08], CHEST_R = [.62, .44, .4];
const crescent = (R, A, hw, yb, lift) => {
  const cy = yb + R;
  return surf((u, v) => {
    const a = (u * 2 - 1) * A;
    const w = hw * Math.pow(Math.max(0, cos(a / A * PI / 2)), .7) * (v * 2 - 1);  // lebar mengecil ke ujung
    const rr = R + w;
    const x = rr * sin(a), y = cy - rr * cos(a);
    const q = 1 - (x / CHEST_R[0]) ** 2 - ((y - CHEST_C[1]) / CHEST_R[1]) ** 2;
    const z = CHEST_C[2] + CHEST_R[2] * Math.sqrt(Math.max(0, q)) + lift;         // proyeksi ke permukaan dada
    return [x, y, z];
  }, 32, 4);
};

//body (duri punggung dihapus supaya siluet bersih seperti referensi)
add(tor, body,
  M(ell(CHEST_R[0], CHEST_R[1], CHEST_R[2]), RED, CHEST_C),        // dada lebih lebar
  M(ell(.24, .2, .24), RED, [-.5, .95, 0]),                        // bahu kiri
  M(ell(.24, .2, .24), RED, [.5, .95, 0]),                         // bahu kanan
  M(crescent(.34, .95, .07, .77, .02), WH, [0, 0, 0], [0, 0, 0], [1, 1, 1], .5), // lambang dada: bulan sabit
  head, tailG
);


//tail: lebih pendek & runcing
add(tailG, M(tube([[0, 0, 0], [0, -.15, -.25], [0, -.02, -.5], [0, .18, -.65]], .09, .01, [1, 0, 0]), RED)); // ekor: Bezier 3D

// kepala (mulut smirk: ujung kanan naik, ujung kiri turun)
add(head,
  M(ell(.86, .82, .78), RED, [0, .42, 0]),
  M(ell(.6, .42, .3), TAN, [0, .28, .5]),
  M(ell(.46, .32, .38), TAN, [0, .2, .62]),
  M(ell(.11, .09, .09), BK, [0, .32, .97], [0, 0, 0], [1, 1, 1], .8),
  M(tube([[-.34, 0, .8], [-.15, -.1, .92], [.15, -.13, .92], [.42, .2, .8]], .028, .028, [0, 0, 1]), MO) // mulut: Bezier 3D
);


//mata + rambut samping (helai Bezier melengkung dari pelipis)
for (const s of [-1, 1]) {
  const e = M(ell(.23, .3, .1), WH, [s * .29, .62, .7], [0, 0, 0], [1, 1, 1], .6);
  const ir = M(ell(.12, .2, .05), PU, [s * .25, .6, .76]);                         // iris lebih besar
  const pu = M(ell(.055, .12, .03), BK, [s * .25, .6, .79], [0, 0, 0], [1, 1, 1], .8);
  const hl = M(ell(.028, .035, .015), WH, [s * .225, .67, .812], [0, 0, 0], [1, 1, 1], .9); // kilap mata
  eyes.push(e, ir, pu, hl);
  add(head, e, ir, pu, hl,
    M(ell(.32, .13, .15), RED, [s * .3, .84, .68], [0, 0, s * .35]),           // kelopak atas tebal
    // rambut samping utama: dari pelipis, melengkung keluar lalu menjuntai dan meruncing
    M(tube([[s * .7, .8, .15], [s * 1.0, .65, .1], [s * .95, .05, -.05], [s * .82, -.45, -.25]], .22, .02, [1, 0, 0]), RED, [0, 0, 0], [0, 0, 0], [1, 1, 1], .3),
    // helai kedua: lebih pendek, di depan helai utama
    M(tube([[s * .62, .55, .45], [s * .9, .42, .4], [s * .88, -.05, .3], [s * .78, -.4, .2]], .14, .015, [1, 0, 0]), RED2, [0, 0, 0], [0, 0, 0], [1, 1, 1], .3)
  );
}

const sgn = x => x ? Math.sign(x) : 1;

// rambut utama menjuntai (paraboloid, lapisan bawah)
[-.5, -.25, 0, .25, .5].forEach((x, i) => {
  const q = M(epar(.3, .26, [1.6, 1.8, 1.95, 1.8, 1.6][i]), RED,
    [x, [.7, .85, .9, .85, .7][i], -.35], [-3.0, -sgn(x) * Math.PI / 2, 0]);
  quills.push(q);
  add(head, q);
});

const crownY = (x, z) => .42 + .82 * Math.sqrt(Math.max(0, 1 - (x / .86) ** 2 - (z / .78) ** 2));

// rambut belakang kepala (paraboloid, lapisan bawah)
[
  [-.28, [-.65, -.4, -.15, .15, .4, .65], 1.5],
  [-.5, [-.55, -.3, -.05, .2, .45], 1.3],
  [-.66, [-.4, -.15, .15, .4], 1.05],
  [-.78, [-.18, .18], .8]
].forEach(([z, xs, h]) => xs.forEach(x => {
  const q = M(epar(.24, .21, h), RED, [x, crownY(x, z) - .05, z], [-3.0, -sgn(x) * Math.PI / 2, 0]);
  quills.push(q);
  add(head, q);
}));

/* helai rambut (lapisan atas): 2 kurva Bezier kubik disambung mulus (kontinu turunan pertama)
   1) kurva menempel di busur tengkorak dari a0 (dahi) ke a1 (belakang atas)
      titik kontrol dari elips kepala: P1 = P0 + k*P'(a0), P2 = P3 - k*P'(a1), k = 4/3 tan((a1-a0)/4)
   2) kurva lepas dari kepala di titik a1, searah singgung busur, lalu menjuntai ke bawah-belakang sampai ujung runcing
   penampang elips pipih: lebar sepanjang sumbu x, tebal searah normal luar helai
   x = posisi samping, len = panjang bagian menjuntai, w = setengah lebar, th = tebal, ci = indeks warna */
const HC = .42, HR = [.86, .82, .78];
const lock = (x, a0, a1, len, w, th, ci) => {
  const s = Math.sqrt(1 - (x / HR[0]) ** 2), ry = HR[1] * s, rz = HR[2] * s;
  const P = a => [x, HC + ry * cos(a), rz * sin(a)];
  const dP = a => [0, -ry * sin(a), rz * cos(a)];
  const k = 4 / 3 * Math.tan((a1 - a0) / 4);
  const p0 = P(a0), p3 = P(a1), d0 = dP(a0), d1 = dP(a1);
  const c1 = [p0, p0.map((v, i) => v + k * d0[i]), p3.map((v, i) => v - k * d1[i]), p3];

  // kurva 2: arah awal = arah singgung di ujung kurva 1, lalu menjuntai
  const T1 = nm(d1.map(v => -v));
  const tip = [p3[0] + x * .2, p3[1] - len, p3[2] - len * .3];
  const c2 = [
    p3,
    p3.map((v, i) => v + T1[i] * len * .4),
    [tip[0], tip[1] + len * .45, tip[2] + len * .12],
    tip
  ];

  const C = v => v < .5 ? bz(c1, v * 2) : bz(c2, v * 2 - 1);
  const g = surf((u, v) => {
    const c = C(v);
    const T = nm(sb(C(Math.min(1, v + .002)), C(Math.max(0, v - .002))));
    const Bv = nm(sb([1, 0, 0], T.map(q => q * T[0])));   // arah lebar ~ sumbu x, tegak lurus T
    const N = cr(Bv, T);                                   // arah tebal = normal luar helai
    const e1 = sin(Math.min(1, v / .12) * PI / 2);         // pangkal membesar halus
    const q = Math.max(0, (v - .5) / .5);
    const pf = e1 * Math.pow(1 - q, .75);                  // ujung meruncing
    const t = u * TAU;
    return [0, 1, 2].map(i => c[i] + N[i] * (.01 + th * pf * cos(t)) + Bv[i] * w * (1 + .4 * v) * pf * sin(t));
  }, 16, 64);
  add(head, M(g, ci % 2 ? RED2 : RED, [0, 0, 0], [0, 0, 0], [1, 1, 1], .3));
};

// lapisan atas: helai lebih ramping & panjang, menyapu jauh ke belakang (a1 lebih negatif)
lock(0, .8, -1.35, 1.4, .17, .1, 0);
for (const s of [-1, 1]) {
  lock(s * .27, .85, -1.35, 1.3, .17, .1, 1);
  lock(s * .52, .95, -1.3, 1.15, .16, .09, 0);
  lock(s * .74, 1.05, -.9, 1.0, .13, .08, 1);   // helai samping atas
}

// kaki: panjang & ramping, kaos kaki hijau, sepatu besar, sol lebih kecil & tipis, tali sepatu tipis
for (const s of [-1, 1]) {
  const knee = G([0, -.7 - D, 0]), leg = G([s * .3, 1.45 + 2 * D, 0]), foot = G([0, -D, 0]);

  add(foot,
    M(cyl(.24, .58), GR, [0, -.43, 0]),                          // kaos kaki hijau: tebal & naik
    M(ell(.52, .29, .74), RED, [0, -.55, .2]),                   // sepatu merah (lebih besar)
    M(ell(.53, .29, .37), YE, [0, -.55, .18]),                   // bagian kuning

    // sol sepatu: silinder elips (quadric), lebih kecil & tipis
    M(cyl(1, .08), SOLW, [0, -.76, .2], [0, 0, 0], [.45, 1, .68], .3),     // badan sol putih kusam
    M(cyl(1, .05), SOL, [0, -.825, .2], [0, 0, 0], [.44, 1, .67], .15),    // telapak abu-abu
    M(hpar(.42, .64, .02), SOL, [0, -.855, .2], [0, 0, 0], [1, 1, 1], .15) // alas telapak: hyperbolic paraboloid
  );

  // tali sepatu hitam: ellipsoid pipih melintang, menempel di lengkung atas sepatu
  [.34, .44, .54, .64].forEach(z => {
    const k = Math.sqrt(1 - ((z - .2) / .74) ** 2);
    add(foot, M(ell(.3 * k, .035, .04), BK, [0, -.55 + .29 * k - .01, z]));
  });

  add(knee, M(ell(.15, .15, .15), RED), M(cyl(.12, .5 + D), RED, [0, -(.5 + D) / 2, 0]), foot);
  add(leg, M(ell(.18, .2, .18), RED), M(cyl(.15, .7 + D), RED, [0, -(.7 + D) / 2, 0]), knee);
  add(root, leg);
  legs.push(leg);
  knees.push(knee);
}

// tangan: lengan lebih pendek (tangan menggantung di sekitar paha), manset corong, kepalan dengan jari & jempol
const UA = .55; // panjang lengan atas
const FA = .5;  // panjang lengan bawah
const AR = .1;  // radius lengan (silinder & sendi disamakan supaya mulus)
for (const s of [-1, 1]) {
  const gl_ = G([0, -FA, 0]), fore = G([0, -UA, 0]), arm = G([s * .6, .85, 0], [0, 0, s * .15]);
  add(gl_,
    // manset: elliptic paraboloid terbalik -> corong lebar yang terbuka ke atas
    M(epar(.31, .31, .3), WH, [0, .16, 0], [PI, 0, 0], [1, 1, 1], .4),
    // kepalan utama
    M(ell(.38, .42, .4), WH, [0, -.32, .03], [0, 0, 0], [1, 1, 1], .4),
    // 4 jari menekuk di sisi dalam telapak
    M(ell(.1, .15, .075), WH2, [-s * .3, -.4, .24], [0, 0, 0], [1, 1, 1], .35),
    M(ell(.1, .16, .075), WH2, [-s * .33, -.4, .09], [0, 0, 0], [1, 1, 1], .35),
    M(ell(.1, .16, .075), WH2, [-s * .33, -.4, -.07], [0, 0, 0], [1, 1, 1], .35),
    M(ell(.1, .14, .075), WH2, [-s * .3, -.4, -.22], [0, 0, 0], [1, 1, 1], .35),
    // jempol
    M(ell(.11, .08, .17), WH2, [-s * .15, -.25, .4], [.35, 0, 0], [1, 1, 1], .35),
    // paku buku jari
    M(cone(.1, .3), WH, [s * .36, -.3, .13], [.5, 0, -s * PI / 2]),
    M(cone(.1, .3), WH, [s * .36, -.3, -.12], [.5, 0, -s * PI / 2])
  );
  add(fore,
    M(ell(AR, AR, AR), RED),                                           // siku
    M(cyl(AR, FA), RED, [0, -FA / 2, 0]),                              // lengan bawah
    M(ell(AR, AR * 1.3, AR), RED, [0, -FA - .02, 0]),                  // pergelangan
    gl_
  );
  add(arm,
    M(ell(AR * 1.1, AR * 1.1, AR * 1.1), RED),                         // sendi bahu
    M(cyl(AR, UA), RED, [0, -UA / 2, 0]),                              // lengan atas
    fore
  );
  add(tor, arm);
  arms.push(arm);
  fores.push(fore);
  hands.push(gl_);                                                     // dipakai mode push up (telapak diratakan ke lantai)
}

/* ---------- animasi ---------- */

let mode = 'idle', ang = 0, K = .14, auto = false, modeT = 0;
const sm = [root, tor, head, ...legs, ...knees, ...arms, ...fores];
const wr = d => d - TAU * Math.round(d / TAU);
const abs = Math.abs;

function pose(t, dt) {
  const w = { idle: 2, walk: 6, run: 20, punch: 0, jump: 0, pushup: 0 }[mode];
  const S = sin(t * w), C = cos(t * w);
  const ru = mode == 'run', wk = mode == 'walk', pn = mode == 'punch', jp = mode == 'jump', pu = mode == 'pushup';
  const mv = wk || ru;

  root.tt = [0, ru ? abs(S) * .22 : (wk ? abs(S) * .07 : 0), 0];
  root.tr = [0, 0, 0];

  tor.tr = [ru ? .5 : (wk ? .08 : 0), mv ? .15 * S : 0, 0];
  head.tr = [ru ? -.25 : 0, mode == 'idle' ? .3 * sin(t * .6) : (ru ? .06 * sin(t * 10) : 0), mode == 'idle' ? .05 * sin(t * 1.3) : 0];

  const amp = ru ? 1.3 : .6;
  for (let i = 0; i < 2; i++) {
    const d = i ? -1 : 1, s = i ? 1 : -1;
    legs[i].tr = [mv ? d * S * amp : 0, 0, s * .03];
    knees[i].tr = [mv ? Math.max(0, -d * C) * amp * 1.4 : 0, 0, 0];
    arms[i].tr = [mv ? -d * S * amp * 1.05 : .05 * S, 0, mv ? s * .12 : s * .15];
    fores[i].tr = [ru ? -1.5 : (wk ? -.4 : 0), 0, 0];
  }

  // telapak kembali lurus kecuali saat push up
  if (!pu) hands.forEach(h => h.r[0] = 0);

  /* ---------- mode push up: badan lurus bertumpu di ujung sepatu, tangan menapak lantai (IK 2 ruas) ---------- */
  if (pu) {
    const rp = Math.min(1, (t - modeT) / .8);                 // transisi masuk dari berdiri ke plank
    const rs = rp * rp * (3 - 2 * rp);
    const cyc = .5 - .5 * cos((t - modeT) * TAU / 2.6);       // 0 = atas (lengan lurus), 1 = bawah
    const th = rs * (1.27 + .18 * cyc);                        // kemiringan badan dari tegak (rad)
    const c = cos(th), s = sin(th);

    // titik terendah sepatu (ujung sol & ujung ellipsoid sepatu) -> badan diangkat sampai menyentuh lantai
    const lowShoe = Math.min(
      -.115 * c - .88 * s,
      (c - s) * .2 - Math.sqrt((c * .29) ** 2 + (s * .74) ** 2)
    );
    const lift = -.08 - lowShoe;                               // -.08 = permukaan lantai

    root.tt = [0, lift, 0];
    root.tr = [th, 0, 0];
    tor.tr = [0, 0, 0];
    head.tr = [-th + .2 * rs, 0, 0];                           // kepala diangkat supaya menatap ke depan, tidak menabrak lantai

    // IK: bahu -> siku -> telapak tepat di bawah bahu
    const L1 = UA, L2 = FA + .74;                              // .74 = jarak pergelangan ke dasar kepalan
    const dd = Math.min(L1 + L2 - .002, 2.83 * c + lift + .08); // jarak bahu ke lantai
    const al = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd)))); // lengan atas condong ke belakang
    const ga = Math.asin(Math.min(1, L1 * sin(al) / L2));      // lengan bawah condong ke depan

    for (let i = 0; i < 2; i++) {
      const sd = i ? 1 : -1;
      legs[i].tr = [0, 0, sd * .03];
      knees[i].tr = [0, 0, 0];
      arms[i].tr = [al - th, 0, sd * .04];
      fores[i].tr = [-ga - al, 0, 0];
      hands[i].r[0] = ga;                                      // telapak rata dengan lantai
    }
  }

  /* ---------- mode lompat: jongkok -> lompat + berputar -> mendarat meredam ---------- */
  if (jp) {
    const ph = (t / 1.8) % 1;                  // satu siklus 1.8 detik
    const sm3 = x => x * x * (3 - 2 * x);
    let bend = 0, air = false, u = 0;

    if (ph < .2) {                             // jongkok (ancang-ancang)
      bend = sm3(ph / .2);
    } else if (ph < .7) {                      // di udara
      air = true;
      u = (ph - .2) / .5;
    } else {                                   // mendarat: lutut meredam lalu bangun
      const e = (ph - .7) / .3;
      bend = .8 * sin(PI * Math.min(1, e * 1.5));
    }

    const tuck = air ? sin(PI * u) : 0;        // kaki menekuk di puncak lompatan
    const raise = air ? Math.min(1, u * 4) * Math.min(1, (1 - u) * 4) : 0; // tangan terangkat

    root.tt = [0, -.2 * bend + (air ? 1.4 * 4 * u * (1 - u) : 0), 0];
    root.tr = [0, air ? u * TAU : 0, 0];       // berputar satu kali di udara

    tor.tr = [.35 * bend, 0, 0];
    head.tr = [.1 * bend - .15 * raise, 0, 0];

    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      legs[i].tr = [-.5 * bend - .4 * tuck, 0, s * .03];
      knees[i].tr = [1.0 * bend + .8 * tuck, 0, 0];
      arms[i].tr = [.7 * bend - 2.7 * raise, 0, s * (.15 + .3 * raise)];
      fores[i].tr = [-.3 * raise, 0, 0];
    }
  }

  /* ---------- mode boxing ---------- */
  if (pn) {
    const L = (a, b, e) => a.map((v, i) => v + (b[i] - v) * e);
    const env = x => { // keluar cepat -> tahan -> tarik balik
      let e = x < .22 ? x / .22 : (x < .32 ? 1 : Math.max(0, 1 - (x - .32) / .4));
      return e * e * (3 - 2 * e);
    };

    const bob = abs(sin(t * 7));                              // pantulan kuda-kuda
    const seq = [[0, 'jab'], [1, 'cross'], [0, 'upper'], [1, 'cross']];
    const c = t * 2.4, beat = Math.floor(c) % 6, ph = c % 1;  // 4 pukulan + 2 ketukan jeda

    // kuda-kuda: badan menyamping, kaki kiri di depan, lutut ditekuk
    root.tt = [0, -.12 + .04 * bob, 0];
    root.tr = [0, .35, 0];
    tor.tr = [.12, 0, 0];
    head.tr = [.05, -.25, 0];                                 // dagu turun, wajah tetap ke depan

    legs[0].tr = [-.35, 0, -.12];                             // kaki depan
    legs[1].tr = [.25, 0, .12];                               // kaki belakang
    knees[0].tr = [.45 + .08 * bob, 0, 0];
    knees[1].tr = [.4 + .08 * bob, 0, 0];

    // guard: kedua tangan di depan dagu
    const guardA = s => [-.9, -s * .15, s * .3];
    const guardF = -1.7;
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      arms[i].tr = guardA(s);
      fores[i].tr = [guardF, 0, 0];
    }

    if (beat < 4) {
      const [idx, type] = seq[beat], s = idx ? 1 : -1, e = env(ph);

      if (type == 'upper') {
        // uppercut: tangan naik dari bawah, badan sedikit condong ke belakang
        arms[idx].tr = L(guardA(s), [-1.35, -s * .3, s * .1], e);
        fores[idx].tr = [guardF + (-1.6 - guardF) * e, 0, 0];
        tor.tr = [.12 - .18 * e, -s * .35 * e, 0];
        root.tt[1] += .06 * e;                                // dorongan dari kaki
      } else {
        // jab / cross: lengan lurus ke depan + putaran pinggang
        const tw = type == 'cross' ? .6 : .3;
        arms[idx].tr = L(guardA(s), [-1.55, -s * .15, s * .05], e);
        fores[idx].tr = [guardF + (-.05 - guardF) * e, 0, 0];
        tor.tr = [.12 + .1 * e, -s * tw * e, 0];
        head.tr = [.05, -.25 + s * tw * .5 * e, 0];          // kepala tetap menatap lawan
        if (type == 'cross') knees[1].tr[0] += .15 * e;       // pivot kaki belakang
      }
    } else {
      // jeda: goyang badan (weave)
      const wv = sin(t * 4);
      tor.tr = [.12 + .05 * abs(wv), 0, .12 * wv];
      head.tr = [.05, -.25, -.06 * wv];
    }
  }

  // smoothing (push up tanpa smoothing supaya telapak & lantai tetap sinkron; boxing & lompat lebih cepat)
  const k = pu ? 1 : ((pn || jp) ? .38 : K);
  sm.forEach(n => {
    for (let i = 0; i < 3; i++) {
      n.r[i] += wr(n.tr[i] - n.r[i]) * k;
      n.t[i] += (n.tt[i] - n.t[i]) * k;
    }
  });

  // langsung (tanpa smoothing): napas, kedip, ekor, rambut
  const br = sin(t * (ru || pn || pu ? 6 : 2.2));
  body.s = body.s0.map((v, i) => v * (1 + (i == 1 ? .015 : .022) * br));

  const ph2 = t % 3.2, bl = ph2 > 3.05 ? sin((ph2 - 3.05) / .15 * PI) : 0;
  eyes.forEach(e => e.s[1] = e.s0[1] * (1 - .92 * bl));

  tailG.r = [.15 * sin(t * 3), .4 * sin(t * (mode == 'idle' ? 2.5 : 7)), 0];

  // rambut paraboloid goyang (helai Bezier menempel di kepala, ikut gerak kepala saja)
  const f = (mv || pn || jp) ? 2.5 : 1;
  quills.forEach((q, i) => q.r = [q.r0[0] + .06 * f * sin(t * 2 * f + i), q.r0[1], q.r0[2] + .05 * f * sin(t * 1.7 * f + i * 1.3)]);
}

/* ---------- kamera & UI ---------- */

let az = .5, el = .25, dist = 11;

cv.addEventListener('pointermove', e => {
  if (e.buttons) {
    az -= e.movementX * .008;
    el = Math.max(-.2, Math.min(1.4, el + e.movementY * .008));
  }
});

cv.addEventListener('wheel', e => {
  e.preventDefault();
  dist = Math.max(4, Math.min(22, dist * (1 + e.deltaY * .001)));
}, { passive: false });

const ui = document.getElementById('ui');
const modes = [['idle', 'Diam'], ['walk', 'Jalan'], ['run', 'Lari'], ['punch', 'Pukul'], ['jump', 'Lompat'], ['pushup', 'Push Up']];
const bt = {};

function setMode(m) {
  mode = m;
  modeT = performance.now() / 1000;            // waktu mulai mode (untuk transisi masuk push up)
  for (const k in bt) bt[k].className = (k == m ? 'on' : '');
}

modes.forEach(([k, l], i) => {
  const b = document.createElement('button');
  b.textContent = (i + 1) + '. ' + l;
  b.onclick = () => setMode(k);
  ui.appendChild(b);
  bt[k] = b;
});

const ab = document.createElement('button');
ab.textContent = 'Auto-rotate';
ab.onclick = () => { auto = !auto; ab.className = (auto ? 'on' : ''); };
ui.appendChild(ab);

addEventListener('keydown', e => {
  const i = +e.key - 1;
  if (i >= 0 && i < modes.length) setMode(modes[i][0]);
  if (e.code == 'Space') { e.preventDefault(); ab.onclick(); }
});

setMode('idle');

let last = 0, gy = -.14;   // gy = tinggi lantai (dihaluskan supaya tidak loncat saat ganti mode)
let ty = 2.05, tz = 0;     // titik bidik kamera (bergeser ke badan saat push up)
function frame(ms) {
  const t = ms / 1000, dt = Math.min(.05, t - last);
  last = t;

  const dpr = devicePixelRatio || 1;
  const W = cv.clientWidth * dpr | 0, H = cv.clientHeight * dpr | 0;
  if (cv.width != W || cv.height != H) { cv.width = W; cv.height = H; }

  gl.viewport(0, 0, W, H);
  gl.clearColor(.08, .09, .13, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  if (auto) az += dt * .4;
  pose(t, dt);

  // mode Lompat & Push Up: lantai tetap; mode lain: lantai ikut badan seperti sebelumnya
  const fixedFloor = mode == 'jump' || mode == 'pushup';
  gy += ((fixedFloor ? -.14 : root.t[1] - .14) - gy) * .25;
  ground.t = [root.t[0], gy, root.t[2]];

  // kamera: saat push up, bidik badan yang rebah (tengah badan lebih rendah & ke depan)
  ty += ((mode == 'pushup' ? 1.3 : 2.05) - ty) * .1;
  tz += ((mode == 'pushup' ? 2 : 0) - tz) * .1;

  const eye = [dist * cos(el) * sin(az), ty + dist * sin(el), tz + dist * cos(el) * cos(az)];
  gl.uniformMatrix4fv(uP, false, persp(.8, W / H, .1, 100));
  gl.uniformMatrix4fv(uV, false, look(eye, [0, ty, tz]));
  gl.uniform3fv(uCam, eye);

  draw(root, Sm([1.2, 1.2, 1.2]));
  draw(ground, Sm([1.2, 1.2, 1.2]));
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);