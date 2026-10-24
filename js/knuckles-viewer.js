import { Matrix4 } from './core/Matrix4.js';
import { Renderer } from './rendering/Renderer.js';
import { ShaderProgram } from './rendering/ShaderProgram.js';
import {
  KNUCKLES_ATTRIBUTE_BINDINGS,
  KNUCKLES_FRAGMENT_SOURCE,
  KNUCKLES_UNIFORMS,
  KNUCKLES_VERTEX_SOURCE,
} from './shaders/knucklesShader.js';
import { Knuckles } from './characters/Knuckles.js';

const canvas = document.getElementById('gl');
const status = document.getElementById('status');
const modeTitle = document.getElementById('mode-title');
const modeCopy = document.getElementById('mode-copy');

if (!canvas) {
  throw new Error('Canvas element #gl tidak ditemukan');
}

const gl = canvas.getContext('webgl', { antialias: true }) || canvas.getContext('experimental-webgl');
if (!gl) {
  if (status) status.textContent = 'Error: WebGL 1 tidak didukung pada browser ini';
  const stage = canvas.parentElement;
  if (stage) {
    stage.innerHTML = '<div style="padding:24px;color:#ff6b6b;font-weight:600;">Inisialisasi WebGL gagal. Browser Anda tidak mendukung WebGL 1.</div>';
  }
  throw new Error('WebGL 1 tidak tersedia');
}

const renderer = new Renderer(gl);
const shader = new ShaderProgram(gl, {
  vertexSource: KNUCKLES_VERTEX_SOURCE,
  fragmentSource: KNUCKLES_FRAGMENT_SOURCE,
  attributeBindings: KNUCKLES_ATTRIBUTE_BINDINGS,
  uniformNames: KNUCKLES_UNIFORMS,
});
const knuckles = new Knuckles(gl, { renderer, shader });
knuckles.setAnimation('idle');

let radius = 8.5;
const target = [0, 2.2, 0];
let yaw = 0;
let pitch = 0;
let dragging = false;
let lastX = 0;
let lastY = 0;
let lastFrame = performance.now();
let elapsed = 0;

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
  knuckles.setAnimation(mode, elapsed);
  document.querySelectorAll('[data-animation]').forEach((button) => {
    button.classList.toggle('active', button.dataset.animation === mode);
  });
  if (animationInfo[mode]) {
    [modeTitle.textContent, modeCopy.textContent] = animationInfo[mode];
  }
}

document.querySelectorAll('[data-animation]').forEach((button) => {
  button.addEventListener('click', () => setAnimation(button.dataset.animation));
});

document.getElementById('reset').addEventListener('click', () => {
  knuckles.reset();
  elapsed = 0;
  lastFrame = performance.now();
  setAnimation('idle');
  setView('front');
  radius = 8.5;
  target[0] = 0;
  target[1] = 2.2;
  target[2] = 0;
});

function setView(view) {
  if (view === 'front') { yaw = 0; pitch = 0; }
  if (view === 'back') { yaw = Math.PI; pitch = 0; }
  if (view === 'side') { yaw = Math.PI / 2; pitch = 0; }
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
}

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('view')) {
  setView(urlParams.get('view'));
}
if (urlParams.has('anim')) {
  setAnimation(urlParams.get('anim'));
}
if (urlParams.has('t')) {
  elapsed = parseFloat(urlParams.get('t')) || 0;
}

canvas.addEventListener('pointerdown', (event) => {
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.remove('active'));
  const freeBtn = document.querySelector('[data-view="free"]');
  if (freeBtn) freeBtn.classList.add('active');
});

canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  yaw -= (event.clientX - lastX) * .008;
  pitch = Math.max(-1.25, Math.min(1.25, pitch + (event.clientY - lastY) * .008));
  lastX = event.clientX;
  lastY = event.clientY;
});

canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  radius = Math.max(4.5, Math.min(18.0, radius + Math.sign(event.deltaY) * .5));
}, { passive: false });

function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.floor(canvas.clientWidth * ratio);
  const height = Math.floor(canvas.clientHeight * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function frame(now) {
  const dt = Math.min(.05, (now - lastFrame) / 1000);
  lastFrame = now;
  elapsed += dt;
  resize();
  knuckles.update(dt, elapsed);

  // Smooth camera panning for pushup pose
  const isPushup = knuckles.animation === 'pushup';
  const destY = isPushup ? 1.0 : 2.2;
  const destZ = isPushup ? 1.4 : 0.0;
  target[1] += (destY - target[1]) * 0.08;
  target[2] += (destZ - target[2]) * 0.08;

  const horizontal = Math.cos(pitch) * radius;
  const cameraPosition = [
    target[0] + Math.sin(yaw) * horizontal,
    target[1] + Math.sin(pitch) * radius,
    target[2] + Math.cos(yaw) * horizontal,
  ];
  const viewMatrix = Matrix4.lookAt(cameraPosition, target, [0, 1, 0]);
  const projectionMatrix = Matrix4.perspective(.72, canvas.width / canvas.height, .1, 100);

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(.08, .09, .13, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const partCount = knuckles.render({
    gl,
    viewMatrix,
    projectionMatrix,
    cameraPosition,
  });

  const error = gl.getError();
  if (status) {
    status.textContent = `Parts: ${partCount} | WebGL: ${error === gl.NO_ERROR ? 'OK' : error}`;
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
