import { Renderer } from './rendering/Renderer.js';
import { ShaderProgram } from './rendering/ShaderProgram.js';
import { KNUCKLES_SHADER } from './shaders/knucklesShader.js';
import { Knuckles, DEBUG_SHAPE_COLORS, DEBUG_SHAPE_LABELS } from './characters/Knuckles.js';
import { OrbitCamera } from './app/OrbitCamera.js';
import {
  FrameClock,
  bindButtons,
  createWebGLContext,
  resizeCanvas,
  setActiveButton,
  showRenderStatus,
  startRenderLoop,
} from './app/viewerSetup.js';

const canvas = document.getElementById('gl');
const status = document.getElementById('status');
const modeTitle = document.getElementById('mode-title');
const modeCopy = document.getElementById('mode-copy');
const gl = createWebGLContext(canvas, status);

const renderer = new Renderer(gl);
const knuckles = new Knuckles(gl, { renderer, shader: new ShaderProgram(gl, KNUCKLES_SHADER) });
knuckles.setAnimation('idle');

// DEBUG SEMENTARA: legenda warna per jenis bentuk (hanya saat ?debugShapes=1).
if (knuckles.debugShapes) {
  const counts = knuckles.countPartsByShape();
  const legend = document.createElement('div');
  legend.style.cssText = 'position:absolute;top:8px;left:8px;max-width:calc(100% - 16px);padding:8px 10px;'
    + 'background:rgba(0,0,0,.72);color:#fff;font:12px/1.5 sans-serif;border-radius:6px;';
  legend.innerHTML = '<strong>Debug bentuk</strong>';
  // Tombol buka/tutup: hanya menyembunyikan isi legenda, judul tetap tampil.
  const toggleButton = document.createElement('button');
  toggleButton.type = 'button';
  toggleButton.style.cssText = 'float:right;margin-left:12px;padding:0 6px;font:inherit;color:#fff;'
    + 'background:transparent;border:1px solid #fff;border-radius:4px;cursor:pointer;';
  legend.prepend(toggleButton);
  const rows = document.createElement('div');
  Object.keys(DEBUG_SHAPE_COLORS).forEach((kind) => {
    const rgb = DEBUG_SHAPE_COLORS[kind].map((v) => Math.round(v * 255)).join(',');
    const row = document.createElement('div');
    row.innerHTML = `<span style="display:inline-block;width:12px;height:12px;margin-right:6px;vertical-align:-2px;`
      + `border:1px solid #fff;background:rgb(${rgb})"></span>${DEBUG_SHAPE_LABELS[kind]} (${counts[kind] || 0})`;
    rows.appendChild(row);
  });
  legend.appendChild(rows);
  const setLegendOpen = (open) => {
    rows.hidden = !open;
    toggleButton.textContent = open ? 'Tutup' : 'Buka';
    toggleButton.setAttribute('aria-expanded', String(open));
  };
  toggleButton.addEventListener('click', () => setLegendOpen(rows.hidden));
  setLegendOpen(true);
  const stage = canvas.parentElement;
  stage.style.position = 'relative';
  stage.appendChild(legend);
}

// Checklist bentuk: satu checkbox per node (dibuat otomatis dari scene graph).
// Mencentang hanya mengatur node.partsVisible; traversal dan matriks tidak berubah.
const NODE_LABELS = {
  root: 'akar', knucklesModel: 'model, skala 1.2', tor: 'badan atas', body: 'perut', head: 'kepala',
  eyeL: 'mata kiri', eyeR: 'mata kanan', quillMain: 'duri utama', quillBack: 'duri belakang', tailG: 'ekor',
  armL: 'lengan atas kiri', foreL: 'lengan bawah kiri', handL: 'tangan kiri',
  armR: 'lengan atas kanan', foreR: 'lengan bawah kanan', handR: 'tangan kanan',
  legL: 'paha kiri', kneeL: 'betis kiri', footL: 'kaki kiri',
  legR: 'paha kanan', kneeR: 'betis kanan', footR: 'kaki kanan',
};

const collectSubtree = (node, out = []) => {
  out.push(node);
  node.children.forEach((child) => collectSubtree(child, out));
  return out;
};

// Baris checklist: { title, label, nodes, subtree, depth }. Saudara bernama
// prefix_N (mis. quillMain_0..4) digabung menjadi satu baris.
function buildChecklistEntries(node, depth = 0, entries = []) {
  entries.push({ title: node.name, label: NODE_LABELS[node.name], nodes: [node], subtree: collectSubtree(node), depth });
  const groups = new Map();
  node.children.forEach((child) => {
    const match = /^(.*)_(\d+)$/.exec(child.name);
    const key = match ? match[1] : child;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(child);
  });
  groups.forEach((members, key) => {
    if (typeof key === 'string' && members.length > 1) {
      entries.push({
        title: `${key}_0..${members.length - 1}`,
        label: NODE_LABELS[key],
        nodes: members,
        subtree: members.flatMap((member) => collectSubtree(member)),
        depth: depth + 1,
      });
    } else {
      members.forEach((member) => buildChecklistEntries(member, depth + 1, entries));
    }
  });
  return entries;
}

function setupNodeChecklist(root) {
  const list = document.getElementById('node-list');
  const rows = buildChecklistEntries(root).map((entry) => {
    const row = document.createElement('div');
    row.className = 'node-row';
    row.style.paddingLeft = `${entry.depth * 14}px`;

    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.addEventListener('change', () => {
      entry.nodes.forEach((node) => { node.partsVisible = checkbox.checked; });
      refresh();
    });
    const partCount = entry.nodes.reduce((sum, node) => sum + node.parts.length, 0);
    const text = document.createElement('span');
    text.textContent = entry.label ? `${entry.title} (${entry.label})` : entry.title;
    const count = document.createElement('span');
    count.className = 'node-count';
    count.textContent = `${partCount} part`;
    label.append(checkbox, text, count);
    row.appendChild(label);

    // "+anak" hanya untuk node yang punya turunan.
    if (entry.subtree.length > entry.nodes.length) {
      const subtreeButton = document.createElement('button');
      subtreeButton.type = 'button';
      subtreeButton.textContent = '+anak';
      subtreeButton.title = 'Centang atau kosongkan node ini beserta seluruh turunannya';
      subtreeButton.addEventListener('click', () => {
        const allVisible = entry.subtree.every((node) => node.partsVisible);
        entry.subtree.forEach((node) => { node.partsVisible = !allVisible; });
        refresh();
      });
      row.appendChild(subtreeButton);
    }
    list.appendChild(row);
    return { entry, checkbox };
  });

  function refresh() {
    rows.forEach(({ entry, checkbox }) => {
      const visibleCount = entry.nodes.filter((node) => node.partsVisible).length;
      checkbox.checked = visibleCount === entry.nodes.length;
      checkbox.indeterminate = visibleCount > 0 && visibleCount < entry.nodes.length;
    });
  }

  const setAll = (visible) => {
    collectSubtree(root).forEach((node) => { node.partsVisible = visible; });
    refresh();
  };
  document.getElementById('nodes-all').addEventListener('click', () => setAll(true));
  document.getElementById('nodes-none').addEventListener('click', () => setAll(false));
  refresh();
}

setupNodeChecklist(knuckles.getRoot());

const DEFAULT_TARGET = [0, 2.2, 0];
const DEFAULT_RADIUS = 8.5;
const camera = new OrbitCamera({ target: DEFAULT_TARGET, radius: DEFAULT_RADIUS, minRadius: 4.5, maxRadius: 18.0, zoomStep: .5 });
const clock = new FrameClock();

const animationInfo = {
  idle: [
    'Idle',
    'Knuckles berada pada pose dasar dengan napas halus, kedipan mata periodik, dan goyangan rambut/ekor santai.',
  ],
  walk: [
    'Jalan di Tempat / Walk Cycle',
    'Siklus langkah berjalan di tempat. Kaki kiri dan kanan melangkah bergantian, lutut menekuk ke belakang saat mengayun, lengan mengayun terkoordinasi berlawanan arah langkah, dan tubuh sedikit condong serta berotasi harmonis.',
  ],
  run: [
    'Lari / Run',
    'Knuckles berlari kencang dengan langkah cepat berfrekuensi tinggi, badan condong tajam ke depan 0.5 rad, lengan mengayun kuat dengan siku ditekuk 1.5 rad, dan amplitudo ayunan kaki lebih lebar.',
  ],
  jump: [
    'Lompat / Jump',
    'Siklus lompat akrobatik: Knuckles berjongkok mengambil ancang-ancang, melesat ke udara sambil melipat kaki dan berputar penuh 360 derajat mengelilingi sumbu vertikal, lalu mendarat meredam dengan lutut menekuk.',
  ],
  punch: [
    'Tinju / Punch (Boxing)',
    'Knuckles masuk ke kuda-kuda tinju dengan pantulan ritmis, memasang guard di depan dagu, lalu melancarkan kombinasi pukulan beruntun: jab kiri, cross kanan dengan putaran pinggang, uppercut, dan weave menghindar.',
  ],
  pushup: [
    'Push Up (Inverse Kinematics)',
    'Knuckles merebahkan badan bertumpu pada ujung jari kaki dan menapakkan kedua telapak tangan di lantai. Menggunakan sistem IK 2-ruas (bahu, siku, pergelangan) untuk melakukan gerakan push-up secara presisi menyentuh lantai.',
  ],
  warmup: [
    'Pemanasan / Arm Circle',
    'Persiapan sebelum balapan: kedua lengan diputar penuh pada sendi bahu memakai rotasi sumbu sembarang (Rodrigues). Sumbu lengan kanan (1, 0, 1) dan lengan kiri (1, 0, -1) yang dinormalisasi, sehingga putarannya miring diagonal. Lengan bawah dan tangan ikut berputar karena hierarki bahu - siku - tangan.',
  ],
  translate: [
    'Jalan Maju-Mundur / Translate',
    'Knuckles bergerak lurus maju dan mundur pada sumbu depan-belakang (Z) dengan animasi langkah berjalan penuh.',
  ],
  rotate: [
    'Rotasi 360 / Rotate',
    'Model Knuckles berotasi penuh 360 derajat mengelilingi sumbu vertikal (Y) untuk demonstrasi transformasi rotasi.',
  ],
  scale: [
    'Scale / Skala',
    'Seluruh model Knuckles membesar dan mengecil secara seragam dengan proporsi anatomi tetap terjaga.',
  ],
  arbitrary: [
    'Arbitrary Axis / Sumbu Sembarang',
    'Rotasi menggunakan rumus Rodrigues mengelilingi sumbu diagonal sembarang (1, 1, 0) yang dinormalisasi.',
  ],
  hierarchical: [
    'Hierarchical Transform',
    'Demonstrasi pergerakan rantai sendi bertingkat: sendi bahu menggerakkan lengan dan kepalan, sendi pinggul menggerakkan paha, lutut, dan sepatu.',
  ],
};

function setAnimation(mode) {
  knuckles.setAnimation(mode, clock.elapsed);
  setActiveButton('animation', mode);
  if (animationInfo[mode]) {
    [modeTitle.textContent, modeCopy.textContent] = animationInfo[mode];
  }
}

const VIEW_ANGLES = { front: [0, 0], back: [Math.PI, 0], side: [Math.PI / 2, 0] };

function setView(view) {
  if (VIEW_ANGLES[view]) [camera.yaw, camera.pitch] = VIEW_ANGLES[view];
  setActiveButton('view', view);
}

bindButtons('animation', setAnimation);
bindButtons('view', setView);
document.getElementById('reset').addEventListener('click', () => {
  knuckles.reset();
  clock.restart();
  setAnimation('idle');
  setView('front');
  camera.radius = DEFAULT_RADIUS;
  camera.target = [...DEFAULT_TARGET];
});
camera.attach(canvas, { onDragStart: () => setActiveButton('view', 'free') });

// Parameter URL untuk inspeksi cepat, mis. ?anim=pushup&view=side&t=2
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('view')) setView(urlParams.get('view'));
if (urlParams.has('anim')) setAnimation(urlParams.get('anim'));
if (urlParams.has('t')) clock.elapsed = parseFloat(urlParams.get('t')) || 0;

startRenderLoop((now) => {
  const dt = clock.tick(now);
  resizeCanvas(gl, canvas);
  knuckles.update(dt, clock.elapsed);

  // Saat push up, kamera turun dan maju perlahan agar badan tetap di tengah.
  const isPushup = knuckles.animation === 'pushup';
  const targetY = isPushup ? 1.0 : 2.2;
  const targetZ = isPushup ? 1.4 : 0.0;
  camera.target[1] += (targetY - camera.target[1]) * 0.08;
  camera.target[2] += (targetZ - camera.target[2]) * 0.08;

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(.08, .09, .13, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const partCount = knuckles.render({ gl, ...camera.frame(canvas.width / canvas.height) });
  showRenderStatus(status, gl, partCount);
});
