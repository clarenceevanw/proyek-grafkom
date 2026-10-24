import { Matrix4 } from './core/Matrix4.js';
import { Renderer } from './rendering/Renderer.js';
import { ShaderProgram } from './rendering/ShaderProgram.js';
import {
  TAILS_ATTRIBUTE_BINDINGS,
  TAILS_FRAGMENT_SOURCE,
  TAILS_UNIFORMS,
  TAILS_VERTEX_SOURCE,
} from './shaders/tailsShader.js';
import { Tails } from './characters/Tails.js';

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
    stage.innerHTML = '<div style="padding:24px;color:#ff9d1c;font-weight:600;">Inisialisasi WebGL gagal. Browser Anda tidak mendukung WebGL 1.</div>';
  }
  throw new Error('WebGL 1 tidak tersedia');
}

const renderer = new Renderer(gl);
const shader = new ShaderProgram(gl, {
  vertexSource: TAILS_VERTEX_SOURCE,
  fragmentSource: TAILS_FRAGMENT_SOURCE,
  attributeBindings: TAILS_ATTRIBUTE_BINDINGS,
  uniformNames: TAILS_UNIFORMS,
});

const tails = new Tails(gl, { renderer, shader });

let radius = 6.8;
const target = [0, 1.35, 0];
let yaw = 0;
let pitch = 0.05;
let dragging = false;
let lastX = 0;
let lastY = 0;
let lastFrame = performance.now();
let elapsed = 0;

const animationInfo = {
  idle: [
    'Idle',
    'Tails berada pada pose dasar dengan napas halus pada dada, goyangan ekor santai, dan kedipan mata berkala.',
  ],
  walk: [
    'Walk / Jalan',
    'Siklus langkah berjalan terkoordinasi secara hierarkis: kaki berayun bergantian dengan tekukan lutut, lengan berayun berlawanan kaki, tubuh berayun harmonis, dan kedua ekor bergoyang lembut.',
  ],
  fly: [
    'Fly / Terbang (Dual-Tail Propeller)',
    'Tails melayang di udara dengan gerakan hovering naik-turun. Tubuh condong ke depan, kaki terlipat aerodinamis, dan kedua ekornya berputar cepat membentuk baling-baling helikopter mengelilingi sumbu putar arbitrer.',
  ],
};

function setAnimation(mode) {
  tails.setAnimation(mode);
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

function setView(view) {
  pitch = 0.05;
  if (view === 'front') { yaw = 0; }
  else if (view === 'side') { yaw = Math.PI / 2; }
  else if (view === 'back') { yaw = Math.PI; }
  else if (view === 'threequarter') { yaw = -Math.PI / 4; pitch = 0.08; }
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
}

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});

document.getElementById('reset').addEventListener('click', () => {
  tails.reset();
  elapsed = 0;
  lastFrame = performance.now();
  setAnimation('idle');
});

document.getElementById('camera-reset').addEventListener('click', () => {
  radius = 6.8;
  target[0] = 0;
  target[1] = 1.35;
  target[2] = 0;
  setView('front');
});

// URL parameter parsing for easy inspection and test automation
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

// Mouse and pointer interaction
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
  yaw -= (event.clientX - lastX) * 0.008;
  pitch = Math.max(-1.25, Math.min(1.25, pitch + (event.clientY - lastY) * 0.008));
  lastX = event.clientX;
  lastY = event.clientY;
});

canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  radius = Math.max(3.8, Math.min(16.0, radius + Math.sign(event.deltaY) * 0.45));
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
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  elapsed += dt;

  resize();
  tails.update(dt, elapsed);

  // Smooth camera height adjustment during flight hovering
  const isFlying = tails.animation === 'fly';
  const destY = isFlying ? 1.65 : 1.35;
  target[1] += (destY - target[1]) * 0.08;

  const horizontal = Math.cos(pitch) * radius;
  const cameraPosition = [
    target[0] + Math.sin(yaw) * horizontal,
    target[1] + Math.sin(pitch) * radius,
    target[2] + Math.cos(yaw) * horizontal,
  ];

  const viewMatrix = Matrix4.lookAt(cameraPosition, target, [0, 1, 0]);
  const projectionMatrix = Matrix4.perspective(0.72, canvas.width / canvas.height, 0.1, 100);

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.04, 0.05, 0.08, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const partCount = tails.render({
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
