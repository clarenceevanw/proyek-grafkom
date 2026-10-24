/* =====================================================================
   main.js - Class TailsCharacter (OOP), Animasi Arbitrary Axis,
   dan Kontrol Mode Inspeksi Geometri.
   Bergantung pada libs.js (harus dimuat lebih dulu di index.html).
   ===================================================================== */

class TailsCharacter {
  constructor(parentScene) {
    this.root = grp(parentScene, [0, 0, 0]);
    this.ctrlNodes = [];
    this.arbAxisNodes = [];
    this.eyes = [];
    this.arms = {};
    this.legs = {};
    this.tails = {};
    this.ears = {};

    this.W = { walk: 0, fly: 0, wave: 0 };
    this.target = { walk: 0, fly: 0, wave: 0 };
    this.walkPh = 0;
    this.spinPh = 0;
    this.nextBlink = 2.0;
    this.blinkStart = -10;

    // Titik P0 dan P1 untuk Sumbu Putar Arbitrer (Arbitrary Axis) Baling-Baling Ekor
    this.tailAxisP0 = [0, 0.12, -0.15];
    this.tailAxisP1 = [0, -0.08, -1.15];

    this._buildModel();
  }

  _addCtrl(parent, P) {
    P.forEach((p, i) => {
      const n = mk(parent, MESH.sph, i % 3 === 0 ? [0.1, 0.9, 0.3] : [1, 0.1, 0.3], p, [0, 0, 0], [0.04, 0.04, 0.04], 0.7, true);
      n.hidden = true;
      this.ctrlNodes.push(n);
    });
  }

  // Helper pembuat untai poni dengan Kurva Bézier Kubik 3D (type: 'bezier')
  _curveStrand(parent, P, rBase, rMid, rTip, color) {
    const radiusFn = t => {
      if (t < 0.35) return lerp(rBase, rMid, t / 0.35);
      return rMid * Math.pow(Math.max(0, 1 - (t - 0.35) / 0.65), 0.72) + rTip * (1 - t);
    };
    const mesh = makeMesh(genBezierTube(P, radiusFn, () => color, 40, 16), 'bezier');
    const node = mk(parent, mesh, [1, 1, 1], [0, 0, 0], [0, 0, 0], [1, 1, 1], 0.10);
    this._addCtrl(parent, P);
    return node;
  }

  _buildModel() {
    /* ==================== 1. BADAN, LEHER (Hyperboloid), & BULU DADA ==================== */
    this.torso = grp(this.root, [0, 1.05, 0]);
    mk(this.torso, MESH.sph,  COL.orange, [0, 0.30, 0],      [0, 0, 0], [0.285, 0.34, 0.24], 0.08);
    mk(this.torso, MESH.sph,  COL.orange, [0, 0.14, -0.015], [0, 0, 0], [0.265, 0.21, 0.23], 0.08);
    // Leher / Sambungan Bahu Atas: Quadric Hyperboloid of 1 Sheet
    mk(this.torso, MESH.hyp1, COL.orange, [0, 0.61, 0],      [0, 0, 0], [0.23, 0.18, 0.20], 0.08);

    // Bulu Dada: Ellipsoid + 5 Elliptic Paraboloid
    mk(this.torso, MESH.sph, COL.white, [0, 0.35, 0.115], [-0.06, 0, 0], [0.225, 0.28, 0.155], 0.08);
    [
      [[ 0.00, 0.56, 0.205], [2.30,  0.00,  0.00], [0.105, 0.23, 0.060]],
      [[-0.11, 0.55, 0.190], [2.20, -0.22, -0.38], [0.092, 0.21, 0.052]],
      [[ 0.11, 0.55, 0.190], [2.20,  0.22,  0.38], [0.092, 0.21, 0.052]],
      [[-0.14, 0.61, 0.155], [1.90, -0.35, -0.62], [0.072, 0.17, 0.045]],
      [[ 0.14, 0.61, 0.155], [1.90,  0.35,  0.62], [0.072, 0.17, 0.045]]
    ].forEach(([p, r, s]) => mk(this.torso, MESH.par, COL.white, p, r, s, 0.08));

    /* ==================== 2. KEPALA KAPSUL (Ellipsoid + Cylinder + Ellipsoid) ==================== */
    // Sesuai saran asdos: Ellipsoid atas + Cylinder sabuk tengah + Ellipsoid bawah
    this.neck = grp(this.torso, [0, 0.66, 0]);
    this.head = grp(this.neck, [0, 0.46, 0.02]);

    mk(this.head, MESH.sph, COL.orange, [0,  0.12, -0.02], [0, 0, 0], [0.548, 0.44, 0.488], 0.08); // Ellipsoid Atas (Dahi)
    mk(this.head, MESH.cyl, COL.orange, [0,  0.01, -0.02], [0, 0, 0], [0.552, 0.24, 0.492], 0.08); // Cylinder Tengah (Sabuk Wajah)
    mk(this.head, MESH.sph, COL.orange, [0, -0.10, -0.02], [0, 0, 0], [0.548, 0.43, 0.488], 0.08); // Ellipsoid Bawah (Rahang)

    /* ==================== 3. MONCONG (2 Ellipsoid + 1 Cylinder) & HIDUNG ==================== */
    mk(this.head, MESH.cyl, COL.white, [0, -0.22, 0.25], [0, 0, Math.PI / 2], [0.192, 0.36, 0.222], 0.08); // Cylinder Tengah Moncong
    mk(this.head, MESH.sph, COL.white, [-0.18, -0.22, 0.25], [0, 0, 0], [0.22, 0.19, 0.22], 0.08);         // Ellipsoid Pipi Kiri
    mk(this.head, MESH.sph, COL.white, [ 0.18, -0.22, 0.25], [0, 0, 0], [0.22, 0.19, 0.22], 0.08);         // Ellipsoid Pipi Kanan
    mk(this.head, MESH.sph, COL.white, [0, -0.23, 0.35], [0, 0, 0], [0.25, 0.17, 0.17], 0.10);             // Ellipsoid Ujung Moncong

    // Hidung: Ellipsoid hitam
    mk(this.head, MESH.sph, COL.black, [0, -0.13, 0.535], [-0.15, 0, 0], [0.062, 0.044, 0.052], 0.90);

    /* ==================== 4. MULUT (Mesh Kurva Bézier Kubik 3D) ==================== */
    const mouthP = [[-0.14, -0.22, 0.522], [-0.06, -0.295, 0.558], [0.06, -0.295, 0.558], [0.14, -0.22, 0.522]];
    const mouthMesh = makeMesh(genBezierTube(mouthP,
      t => 0.005 + 0.009 * Math.pow(Math.sin(Math.PI * t), 0.5),
      () => COL.mouthLine, 36, 12), 'bezier');
    mk(this.head, mouthMesh, [1, 1, 1], [0, 0, 0], [0, 0, 0], [1, 1, 1], 0.15);
    this._addCtrl(this.head, mouthP);

    /* ==================== 5. MATA (Ellipsoid Pipih) ==================== */
    [-1, 1].forEach(s => {
      const eye = grp(this.head, [s * 0.14, 0.07, 0.43], [-0.02, s * 0.20, 0]);
      mk(eye, MESH.sph, COL.white,     [0, 0.025, 0],              [0, 0, 0], [0.152, 0.240, 0.075], 0.40);
      mk(eye, MESH.sph, COL.irisOuter, [s * -0.012, -0.02, 0.046], [0, 0, 0], [0.094, 0.148, 0.042], 0.65);
      mk(eye, MESH.sph, COL.blue,      [s * -0.012, -0.02, 0.052], [0, 0, 0], [0.086, 0.136, 0.040], 0.70);
      mk(eye, MESH.sph, COL.irisInner, [s * -0.012, -0.046, 0.060],[0, 0, 0], [0.064, 0.080, 0.034], 0.75);
      mk(eye, MESH.sph, COL.black,     [s * -0.012, -0.018, 0.072],[0, 0, 0], [0.048, 0.086, 0.028], 0.80);
      mk(eye, MESH.sph, COL.white,     [s * -0.034, 0.050, 0.090], [0, 0, 0], [0.024, 0.032, 0.014], 1.00);
      mk(eye, MESH.sph, COL.white,     [s *  0.018,-0.064, 0.086], [0, 0, 0], [0.012, 0.016, 0.010], 1.00);
      this.eyes.push(eye);
    });

    /* ==================== 6. TELINGA (Quadric Elliptic Cone Dipipihkan) ==================== */
    [-1, 1].forEach(s => {
      const ear = grp(this.head, [s * 0.26, 0.38, -0.05], [0.05, s * 0.16, s * -0.40]);
      mk(ear, MESH.cone, COL.orange,   [0, 0, 0],               [0, 0, 0],        [0.29, 0.72, 0.12], 0.08);
      mk(ear, MESH.cone, COL.earIn,    [0, 0.03, 0.042],        [0.02, 0, 0],     [0.20, 0.56, 0.07], 0.06);
      mk(ear, MESH.par,  COL.orangeDk, [s * 0.08, 0.01, 0.040], [0, 0, s * 0.22], [0.08, 0.26, 0.05], 0.08);
      this.ears[s] = ear;
    });

    /* ==================== 7. BULU PIPI / KUMIS KANAN-KIRI (Quadric Elliptic Cone) ==================== */
    [-1, 1].forEach(s => {
      const cheekBase = grp(this.head, [s * 0.28, -0.21, 0.24], [0, s * -0.28, 0]);
      mk(cheekBase, MESH.cone, COL.white, [0,  0.045, 0], [0, 0, s * -1.36], [0.052, 0.38, 0.095], 0.08);
      mk(cheekBase, MESH.cone, COL.white, [0, -0.005, 0], [0, 0, s * -1.62], [0.055, 0.41, 0.102], 0.08);
      mk(cheekBase, MESH.cone, COL.white, [0, -0.055, 0], [0, 0, s * -1.90], [0.048, 0.34, 0.088], 0.08);
    });

    /* ==================== 8. PONI 3 HELAI (Mesh Kurva Bézier 3D - Tanpa Jambul Atas) ==================== */
    this.bangsGrp = grp(this.head, [0, 0, 0]);
    const bangTop = [[ 0.00, 0.44, 0.26], [ 0.00, 0.68, 0.50], [ 0.00, 0.62, 0.78], [ 0.00, 0.36, 0.88]];
    const bangMid = [[-0.02, 0.41, 0.29], [-0.06, 0.58, 0.52], [-0.08, 0.48, 0.76], [-0.05, 0.24, 0.82]];
    const bangBot = [[ 0.02, 0.38, 0.31], [ 0.06, 0.48, 0.52], [ 0.07, 0.36, 0.70], [ 0.04, 0.14, 0.74]];
    this._curveStrand(this.bangsGrp, bangTop, 0.042, 0.068, 0.004, COL.orange);
    this._curveStrand(this.bangsGrp, bangMid, 0.038, 0.060, 0.004, COL.orange);
    this._curveStrand(this.bangsGrp, bangBot, 0.034, 0.052, 0.004, COL.orange);

    /* ==================== 9. TANGAN & SARUNG TANGAN (Ellipsoid + Cylinder) ==================== */
    [-1, 1].forEach(s => {
      const sh = grp(this.torso, [s * 0.25, 0.55, 0]);
      mk(sh, MESH.sph, COL.orange, [0, 0, 0], [0, 0, 0], [0.074, 0.074, 0.074], 0.08);
      const up = grp(sh, [0, 0, 0]);
      mk(up, MESH.cyl, COL.orange, [0, -0.15, 0], [0, 0, 0], [0.058, 0.30, 0.058], 0.08);
      const el = grp(up, [0, -0.30, 0]);
      mk(el, MESH.sph, COL.orange, [0, 0, 0], [0, 0, 0], [0.066, 0.066, 0.066], 0.08);
      mk(el, MESH.cyl, COL.orange, [0, -0.12, 0], [0, 0, 0], [0.055, 0.24, 0.055], 0.08);

      const wrist = grp(el, [0, -0.24, 0]);
      mk(wrist, MESH.cylCuff, COL.white, [0,  0.02, 0], [0.08, 0, 0],  [0.134, 0.075, 0.134], 0.18);
      mk(wrist, MESH.cylCuff, COL.white, [0, -0.04, 0], [-0.05, 0, 0], [0.142, 0.075, 0.142], 0.18);
      mk(wrist, MESH.cyl,     COL.black, [0, -0.08, 0], [0, 0, 0],     [0.114, 0.030, 0.114], 0.15);

      const palm = grp(wrist, [0, -0.18, 0.02]);
      mk(palm, MESH.sph, COL.white, [0, 0, 0], [0, 0, 0], [0.152, 0.142, 0.138], 0.22);
      [-0.088, -0.029, 0.029, 0.088].forEach(fx => {
        const fin = grp(palm, [fx, -0.02, 0.088], [0, 0, 0]);
        mk(fin, MESH.sph, COL.white, [0,  0.028, 0.018], [0, 0, 0],    [0.045, 0.045, 0.046], 0.22);
        mk(fin, MESH.cyl, COL.white, [0, -0.020, 0.018], [0.3, 0, 0],  [0.040, 0.078, 0.040], 0.22);
        mk(fin, MESH.sph, COL.white, [0, -0.058, 0.000], [0, 0, 0],    [0.042, 0.042, 0.042], 0.22);
        mk(fin, MESH.cyl, COL.white, [0, -0.058,-0.038], [1.45, 0, 0], [0.036, 0.078, 0.036], 0.22);
      });
      const thumb = grp(palm, [s * -0.088, 0.038, 0.078], [0.2, s * -0.4, s * -1.1]);
      mk(thumb, MESH.sph, COL.white, [0, 0, 0],       [0, 0, 0], [0.052, 0.052, 0.052], 0.22);
      mk(thumb, MESH.cyl, COL.white, [0, -0.048, 0],  [0, 0, 0], [0.046, 0.088, 0.046], 0.22);
      mk(thumb, MESH.sph, COL.white, [0, -0.092, 0],  [0, 0, 0], [0.046, 0.046, 0.046], 0.22);

      this.arms[s] = { sh: up, el, s };
    });

    /* ==================== 10. KAKI & SEPATU (Ellipsoid + Cylinder + Paraboloid) ==================== */
    [-1, 1].forEach(s => {
      const hip = grp(this.root, [s * 0.135, 1.02, 0]);
      mk(hip, MESH.sph, COL.orange, [0, 0, 0],     [0, 0, 0], [0.085, 0.085, 0.085], 0.08);
      mk(hip, MESH.cyl, COL.orange, [0, -0.19, 0], [0, 0, 0], [0.068, 0.38, 0.068], 0.08);
      const knee = grp(hip, [0, -0.38, 0]);
      mk(knee, MESH.sph, COL.orange, [0, 0, 0],     [0, 0, 0], [0.070, 0.070, 0.070], 0.08);
      mk(knee, MESH.cyl, COL.orange, [0, -0.19, 0], [0, 0, 0], [0.064, 0.38, 0.064], 0.08);

      const foot = grp(knee, [0, -0.40, 0], [0, s * -0.08, 0]);
      mk(foot, MESH.cylCuff, COL.white, [0, 0.11, 0], [0.04, 0, 0],  [0.154, 0.075, 0.160], 0.18);
      mk(foot, MESH.cylCuff, COL.white, [0, 0.05, 0], [-0.04, 0, 0], [0.162, 0.075, 0.168], 0.18);
      mk(foot, MESH.cyl,     COL.black, [0, 0.00, 0], [0, 0, 0],     [0.134, 0.040, 0.144], 0.15);

      mk(foot, MESH.sph, COL.red,   [0, -0.11, -0.04], [0, 0, 0],    [0.194, 0.154, 0.222], 0.42);
      mk(foot, MESH.cyl, COL.red,   [0, -0.06, -0.02], [0, 0, 0],    [0.150, 0.120, 0.160], 0.42);
      mk(foot, MESH.sph, COL.white, [0, -0.125, 0.14], [0.08, 0, 0], [0.190, 0.148, 0.270], 0.38);
      mk(foot, MESH.par, COL.white, [0, -0.185, 0.08], [Math.PI/2, 0, 0], [0.192, 0.34, 0.135], 0.38);
      mk(foot, MESH.cyl, COL.gray,  [0, -0.205, 0.05], [0, 0, 0],    [0.196, 0.038, 0.360], 0.15);
      mk(foot, MESH.sph, COL.gray,  [0, -0.195, 0.05], [0, 0, 0],    [0.202, 0.028, 0.375], 0.15);

      this.legs[s] = { hip, knee, foot };
    });

    /* ==================== 11. DUA EKOR (Kurva Bézier 3D + Arbitrary Axis) ==================== */
    const tailRadius = t => {
      if (t < 0.58) return 0.055 + 0.225 * Math.sin((t / 0.58) * (Math.PI / 2));
      const u = (t - 0.58) / 0.42;
      return 0.28 * Math.pow(Math.max(0, 1 - Math.pow(u, 1.55)), 0.80);
    };
    const tailColor = (t, a) => {
      const th = 0.52 + 0.068 * Math.sin(a * 4.0 + 0.8) + 0.035 * Math.cos(a * 8.0);
      return mix3(COL.orange, COL.white, sstep(th - 0.015, th + 0.015, t));
    };

    this.tailPropellerHub = grp(this.torso, [0, 0, 0]);

    [-1, 1].forEach(s => {
      const P = [
        [0.00, 0.00, 0.00],
        [s * 0.27, -0.28, -0.36],
        [s * 0.58, -0.42, -0.80],
        [s * 0.74, -0.06, -1.20]
      ];
      const pivot = grp(this.tailPropellerHub, [s * 0.04, 0.12, -0.18]);
      mk(pivot, makeMesh(genBezierTube(P, tailRadius, tailColor, 64, 26), 'bezier'), [1, 1, 1], [0, 0, 0], [0, 0, 0], [1, 1, 1], 0.08);
      this._addCtrl(pivot, P);

      // Jumbai bulu runcing di ujung ekor menggunakan Quadric Elliptic Cone
      [
        { t: 0.74, ang: 1.2,  sc: [0.058, 0.23, 0.048] },
        { t: 0.78, ang: 2.5,  sc: [0.058, 0.25, 0.048] },
        { t: 0.82, ang: -1.6, sc: [0.052, 0.23, 0.042] },
        { t: 0.86, ang: 0.2,  sc: [0.052, 0.26, 0.042] },
        { t: 0.91, ang: 3.1,  sc: [0.048, 0.23, 0.040] }
      ].forEach(sp => {
        const c = bez(P, sp.t), T = norm(bezD(P, sp.t));
        const side = norm(cross(T, [0, 1, 0])), up = cross(side, T);
        const r = tailRadius(sp.t) * 0.72;
        const off = add(scale3(side, Math.cos(sp.ang) * r), scale3(up, Math.sin(sp.ang) * r));
        const d = norm(add(T, scale3(off, 2.2)));
        const rx = Math.asin(d[2]), rz = Math.atan2(-d[0], d[1]);
        mk(pivot, MESH.cone, COL.white, add(c, off), [rx, 0, rz], sp.sc, 0.08);
      });
      this.tails[s] = pivot;
    });

    /* ==================== 12. VISUALISASI GARIS SUMBU ARBITRARY AXIS ==================== */
    const axisLineMesh = makeMesh(genBezierTube(
      [
        this.tailAxisP0,
        mix3(this.tailAxisP0, this.tailAxisP1, 0.33),
        mix3(this.tailAxisP0, this.tailAxisP1, 0.66),
        this.tailAxisP1
      ],
      () => 0.014,
      () => COL.axisNeon, 12, 10
    ), 'helper');
    const axisLineNode = mk(this.torso, axisLineMesh, [1, 1, 1], [0, 0, 0], [0, 0, 0], [1, 1, 1], 0.8, true);
    const p0Node = mk(this.torso, MESH.sph,  [0, 1, 0.3],   this.tailAxisP0, [0, 0, 0],     [0.045, 0.045, 0.045], 0.9, true);
    const p1Node = mk(this.torso, MESH.cone, [1, 0.2, 0.2], this.tailAxisP1, [-1.75, 0, 0], [0.045, 0.12, 0.045],  0.9, true);
    this.arbAxisNodes.push(axisLineNode, p0Node, p1Node);
  }

  update(dt, t) {
    const k = 1 - Math.exp(-dt * 6);
    for (const key in this.W) this.W[key] += (this.target[key] - this.W[key]) * k;

    this.walkPh += dt * 7.5 * this.W.walk;
    const breath = Math.sin(t * 2.2);

    this.root.pos[1] = this.W.fly * (0.68 + 0.10 * Math.sin(t * 3.5)) + this.W.walk * Math.abs(Math.cos(this.walkPh)) * 0.06;
    this.torso.pos[1] = 1.05 + breath * 0.007;

    const breathScale = 1 + 0.015 * breath;
    this.torso.scale = [breathScale, 1, breathScale];

    this.torso.rot[0] = this.W.fly * 0.36 + this.W.walk * 0.12;
    this.torso.rot[1] = this.W.walk * Math.sin(this.walkPh) * 0.10;
    this.torso.rot[2] = this.W.walk * Math.cos(this.walkPh) * 0.04;

    this.neck.rot[0] = 0.03 * breath + this.W.fly * -0.22 - this.W.walk * 0.06;
    this.head.rot[1] = 0.14 * Math.sin(t * 0.7) * (1 - this.W.walk * 0.6);
    this.head.rot[2] = 0.03 * Math.sin(t * 0.9 + 1) + this.W.wave * 0.08;
    this.bangsGrp.rot[0] = 0.03 * Math.sin(t * 3.0) - this.W.fly * 0.08;

    [-1, 1].forEach(s => {
      const earTwitch = Math.sin(t * 2.8 + s) * 0.06;
      this.ears[s].customMat = M4.rotateArbitraryAxis(
        [s * 0.15, 0.32, -0.05],
        [s * 0.35, 0.42, 0.05],
        earTwitch
      );
    });

    [[1, this.walkPh], [-1, this.walkPh + Math.PI]].forEach(([s, ph]) => {
      const L = this.legs[s];
      const spread = s * 0.068 * (1 - this.W.walk * 0.8);
      const hip = -Math.sin(ph) * 0.65 * W_val(this.W.walk) + this.W.fly * 0.28;
      const knee = Math.max(0, Math.cos(ph)) * 0.92 * this.W.walk + this.W.fly * 0.65 + 0.02;
      L.hip.rot[0] = hip;
      L.hip.rot[2] = spread;
      L.knee.rot[0] = knee;
      L.foot.rot[0] = -(hip + knee) * 0.68 * this.W.walk + this.W.fly * 0.52;
      L.foot.rot[2] = -spread * 0.85;
    });

    [-1, 1].forEach(s => {
      const A = this.arms[s];
      let rx = 0.35 + 0.03 * breath, ry = s * -0.34, rz = s * 0.42;
      let elx = -1.62, ely = s * 0.34, elz = s * -0.16;

      rx  = lerp(rx,  s * Math.sin(this.walkPh) * 0.72, this.W.walk);
      rz  = lerp(rz,  s * 0.32, this.W.walk);
      elx = lerp(elx, -1.10, this.W.walk);

      rx  = lerp(rx,  0.24, this.W.fly);
      rz  = lerp(rz,  s * 0.82, this.W.fly);
      elx = lerp(elx, -0.85, this.W.fly);

      if (s > 0 && this.W.wave > 0.001) {
        rx  = lerp(rx,  -0.25, this.W.wave);
        ry  = lerp(ry,   0.00, this.W.wave);
        rz  = lerp(rz,   2.35, this.W.wave);
        elx = lerp(elx, -0.35, this.W.wave);
        ely = lerp(ely,  0.00, this.W.wave);
        elz = lerp(elz,  0.50 * Math.sin(t * 9), this.W.wave);
      }

      A.sh.rot[0] = rx;  A.sh.rot[1] = ry;  A.sh.rot[2] = rz;
      A.el.rot[0] = elx; A.el.rot[1] = ely; A.el.rot[2] = elz;
    });

    this.spinPh += dt * (this.W.fly * 34 + this.W.walk * 9);
    if (this.W.fly < 0.02 && this.W.walk < 0.02) {
      this.spinPh += (Math.round(this.spinPh / (Math.PI * 2)) * Math.PI * 2 - this.spinPh) * Math.min(1, dt * 6);
    }
    this.tailPropellerHub.customMat = M4.rotateArbitraryAxis(this.tailAxisP0, this.tailAxisP1, this.spinPh);

    const wag = Math.sin(t * 2.3) * 0.08 * (1 - this.W.fly);
    const bob = 0.04 * Math.sin(t * 3.0) * (1 - this.W.fly);
    this.tails[1].rot[1] = wag; this.tails[-1].rot[1] = -wag;
    this.tails[1].rot[0] = this.tails[-1].rot[0] = bob;

    if (t > this.nextBlink) { this.blinkStart = t; this.nextBlink = t + 2.3 + Math.random() * 2.5; }
    const bt = (t - this.blinkStart) / 0.16;
    const sy = bt >= 0 && bt <= 1 ? 1 - 0.92 * Math.sin(Math.PI * bt) : 1;
    this.eyes.forEach(e => e.scale[1] = sy);
  }
}
const W_val = x => x;

/* ---------------------------- Inisialisasi Scene & Objek Tails ---------------------------- */
const scene = new Node();

const stageNode = grp(scene, [0, 0, 0]);
stageNode.hidden = true;
mk(stageNode, MESH.cyl, COL.stage, [0, -0.03, 0], [0, 0, 0], [2.5, 0.06, 2.5], 0.05, true);
mk(stageNode, MESH.cyl, [0.90, 0.52, 0.03], [0, -0.036, 0], [0, 0, 0], [2.64, 0.05, 2.64], 0.05, true);

const tailsChar = new TailsCharacter(scene);

const shadow = mk(stageNode, MESH.sph, [0, 0, 0], [0, 0.004, 0], [0, 0, 0], [1.0, 0.004, 1.0], 0, true);
shadow.alpha = 0.24; shadow.noDepth = true;

/* ---------------------------- Kamera & Input ---------------------------- */
const cam = { yaw: 0.0, pitch: 0.06, dist: 6.4, targetYaw: null, targetPitch: null };
let dragging = false, lx = 0, ly = 0;

canvas.addEventListener('pointerdown', e => {
  dragging = true; lx = e.clientX; ly = e.clientY;
  cam.targetYaw = null; cam.targetPitch = null;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointerup', () => dragging = false);
canvas.addEventListener('pointermove', e => {
  if (!dragging) return;
  cam.yaw -= (e.clientX - lx) * 0.008;
  cam.pitch = Math.max(-0.35, Math.min(1.25, cam.pitch + (e.clientY - ly) * 0.006));
  lx = e.clientX; ly = e.clientY;
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  cam.dist = Math.max(3.6, Math.min(15, cam.dist * (1 + e.deltaY * 0.001)));
}, { passive: false });

document.querySelectorAll('#ui button[data-mode]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#ui button[data-mode]').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  tailsChar.target = { walk: 0, fly: 0, wave: 0 };
  const m = b.dataset.mode;
  if (m !== 'idle') tailsChar.target[m] = 1;
}));

document.querySelectorAll('#ui button[data-cam]').forEach(b => b.addEventListener('click', () => {
  const v = b.dataset.cam;
  autoBox.checked = false;
  cam.targetPitch = 0.05;
  if (v === 'front') cam.targetYaw = 0.0;
  if (v === 'side')  cam.targetYaw = -Math.PI / 2;
  if (v === 'back')  cam.targetYaw = Math.PI;
}));

const legendEl = document.getElementById('legend');
document.getElementById('viewMode').addEventListener('change', e => {
  VIEW_STATE.mode = e.target.value;
  legendEl.style.display = VIEW_STATE.mode === 'parts' ? 'block' : 'none';
});
document.getElementById('wireBox').addEventListener('change', e => {
  VIEW_STATE.wireframe = e.target.checked;
});

const autoBox = document.getElementById('auto');
document.getElementById('arbBox').addEventListener('change', e => tailsChar.arbAxisNodes.forEach(n => n.hidden = !e.target.checked));
document.getElementById('ctrl').addEventListener('change', e => tailsChar.ctrlNodes.forEach(n => n.hidden = !e.target.checked));
document.getElementById('stageToggle').addEventListener('change', e => stageNode.hidden = !e.target.checked);

/* ---------------------------- Render Loop ---------------------------- */
let last = 0;
function frame(ms) {
  const t = ms / 1000, dt = Math.min(0.05, t - last || 0.016); last = t;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(canvas.clientWidth * dpr), h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  gl.viewport(0, 0, w, h);
  gl.depthMask(true);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  if (autoBox.checked) {
    cam.yaw += dt * 0.6;
  } else if (cam.targetYaw !== null) {
    cam.yaw += (cam.targetYaw - cam.yaw) * Math.min(1, dt * 8);
    cam.pitch += (cam.targetPitch - cam.pitch) * Math.min(1, dt * 8);
  }

  tailsChar.update(dt, t);

  const hChar = tailsChar.root.pos[1];
  shadow.scale[0] = shadow.scale[2] = 1.0 * (1 - Math.min(0.5, hChar * 0.35));
  shadow.alpha = 0.24 * (1 - Math.min(0.6, hChar * 0.5));

  const target3 = [0, 1.32, 0];
  const dir = [Math.cos(cam.pitch) * Math.sin(cam.yaw), Math.sin(cam.pitch), Math.cos(cam.pitch) * Math.cos(cam.yaw)];
  const eye = [target3[0] + dir[0] * cam.dist, target3[1] + dir[1] * cam.dist, target3[2] + dir[2] * cam.dist];
  const light = norm([dir[0] * 0.6 + 0.4, dir[1] * 0.6 + 0.78, dir[2] * 0.6 + 0.35]);

  gl.uniformMatrix4fv(loc.uProj, false, M4.persp(36 * Math.PI / 180, w / h, 0.1, 60));
  gl.uniformMatrix4fv(loc.uView, false, M4.lookAt(eye, target3, [0, 1, 0]));
  gl.uniform3fv(loc.uEye, eye);
  gl.uniform3fv(loc.uLight, light);

  scene.draw(M4.ident());
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);