import { Renderer } from './rendering/Renderer.js';
import { ShaderProgram } from './rendering/ShaderProgram.js';
import { KNUCKLES_SHADER } from './shaders/knucklesShader.js';
import { Knuckles } from './characters/Knuckles.js';
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
