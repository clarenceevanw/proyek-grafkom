import { Matrix4 } from './core/Matrix4.js';
import { Renderer } from './rendering/Renderer.js';
import { ShaderProgram } from './rendering/ShaderProgram.js';
import {
  SONIC_ATTRIBUTE_BINDINGS,
  SONIC_FRAGMENT_SOURCE,
  SONIC_UNIFORMS,
  SONIC_VERTEX_SOURCE,
} from './shaders/sonicShader.js';
import { Sonic } from './characters/Sonic.js';

const canvas = document.getElementById('gl');
const status = document.getElementById('status');
const modeTitle = document.getElementById('mode-title');
const modeCopy = document.getElementById('mode-copy');
const gl = canvas.getContext('webgl', { antialias: true });
if (!gl) throw new Error('WebGL tidak tersedia');

const renderer = new Renderer(gl);
const shader = new ShaderProgram(gl, {
  vertexSource: SONIC_VERTEX_SOURCE,
  fragmentSource: SONIC_FRAGMENT_SOURCE,
  attributeBindings: SONIC_ATTRIBUTE_BINDINGS,
  uniformNames: SONIC_UNIFORMS,
});
const sonic = new Sonic(gl, { renderer, shader });
sonic.setAnimation('idle');

let radius = 5.8;
const target = [0, 1.05, 0];
let yaw = 0;
let pitch = 0;
let dragging = false;
let lastX = 0;
let lastY = 0;
let lastFrame = performance.now();
let elapsed = 0;

const animationInfo = {
  idle: ['Idle', 'Gerakan dasar untuk membandingkan pose Sonic tanpa perpindahan besar.'],
  translate: ['Jalan maju-mundur / Translate', 'Sonic bergerak lurus maju dan mundur pada sumbu depan-belakang (Z), dengan siklus langkah lari.'],
  rotate: ['Spin Bola / Rotasi', 'Sonic menggulung menjadi bola, berputar satu kali di tempat pada sumbu X, lalu membuka kembali dan kembali idle.'],
  scale: ['Scale', 'Ukuran Sonic berubah secara bertahap; bagian tubuh juga memperlihatkan perubahan skala pada sumbu yang berbeda.'],
  arbitrary: ['Salto / Arbitrary Axis', 'Sonic melompat dan melakukan satu salto pada sumbu diagonal tetap (1,1,0) yang dinormalisasi. Dilihat dari depan, sumbu ini memiringkan putaran agar lebih mudah terlihat. Lintasan lompat adalah translasi; saltonya rotasi Rodrigues pada sumbu yang bukan X, Y, atau Z. Setelah mendarat, Sonic kembali idle.'],
  hierarchical: ['Hierarchical', 'Sendi bergerak sebagai rantai parent-child: misalnya gerak bahu membawa lengan, siku, dan tangan, sedangkan gerak siku hanya memengaruhi bagian di bawahnya.']
};

function setAnimation(mode) {
  sonic.setAnimation(mode);
  elapsed = 0;
  lastFrame = performance.now();
  document.querySelectorAll('[data-animation]').forEach((button) => {
    button.classList.toggle('active', button.dataset.animation === mode);
  });
  [modeTitle.textContent, modeCopy.textContent] = animationInfo[mode];
}

document.querySelectorAll('[data-animation]').forEach((button) => {
  button.addEventListener('click', () => setAnimation(button.dataset.animation));
});
document.getElementById('reset').addEventListener('click', () => {
  sonic.reset();
  setAnimation('idle');
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
canvas.addEventListener('pointerdown', (event) => {
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.remove('active'));
  document.querySelector('[data-view="free"]').classList.add('active');
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
  radius = Math.max(3.2, Math.min(10, radius + Math.sign(event.deltaY) * .35));
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
  sonic.update(dt, elapsed);

  const horizontal = Math.cos(pitch) * radius;
  const cameraPosition = [
    target[0] + Math.sin(yaw) * horizontal,
    target[1] + Math.sin(pitch) * radius,
    target[2] + Math.cos(yaw) * horizontal,
  ];
  const viewMatrix = Matrix4.lookAt(cameraPosition, target, [0, 1, 0]);
  const projectionMatrix = Matrix4.perspective(.72, canvas.width / canvas.height, .1, 100);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(.78, .91, 1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const partCount = sonic.render({
    gl,
    viewMatrix,
    projectionMatrix,
    cameraPosition,
    lightDirection: [.55, .85, .45],
  });
  const error = gl.getError();
  status.textContent = `Parts: ${partCount} | WebGL: ${error === gl.NO_ERROR ? 'OK' : error}`;
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
