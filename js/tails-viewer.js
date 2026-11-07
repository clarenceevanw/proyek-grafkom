import { Renderer } from './rendering/Renderer.js';
import { ShaderProgram } from './rendering/ShaderProgram.js';
import { TAILS_SHADER } from './shaders/tailsShader.js';
import { Tails } from './characters/Tails.js';
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
const tails = new Tails(gl, { renderer, shader: new ShaderProgram(gl, TAILS_SHADER) });

const DEFAULT_TARGET = [0, 1.35, 0];
const DEFAULT_RADIUS = 6.8;
const camera = new OrbitCamera({ target: DEFAULT_TARGET, radius: DEFAULT_RADIUS, pitch: 0.05, minRadius: 3.8, maxRadius: 16.0, zoomStep: 0.45 });
const clock = new FrameClock();

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
  setActiveButton('animation', mode);
  if (animationInfo[mode]) {
    [modeTitle.textContent, modeCopy.textContent] = animationInfo[mode];
  }
}

// [yaw, pitch]; 'free' mempertahankan yaw tetapi pitch kembali ke default.
const VIEW_ANGLES = {
  front: [0, 0.05],
  side: [Math.PI / 2, 0.05],
  back: [Math.PI, 0.05],
  threequarter: [-Math.PI / 4, 0.08],
};

function setView(view) {
  camera.pitch = 0.05;
  if (VIEW_ANGLES[view]) [camera.yaw, camera.pitch] = VIEW_ANGLES[view];
  setActiveButton('view', view);
}

bindButtons('animation', setAnimation);
bindButtons('view', setView);
document.getElementById('reset').addEventListener('click', () => {
  tails.reset();
  clock.restart();
  setAnimation('idle');
});
document.getElementById('camera-reset').addEventListener('click', () => {
  camera.radius = DEFAULT_RADIUS;
  camera.target = [...DEFAULT_TARGET];
  setView('front');
});
camera.attach(canvas, { onDragStart: () => setActiveButton('view', 'free') });

// Parameter URL untuk inspeksi cepat, mis. ?anim=fly&view=side&t=2
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('view')) setView(urlParams.get('view'));
if (urlParams.has('anim')) setAnimation(urlParams.get('anim'));
if (urlParams.has('t')) clock.elapsed = parseFloat(urlParams.get('t')) || 0;

startRenderLoop((now) => {
  const dt = clock.tick(now);
  resizeCanvas(gl, canvas);
  tails.update(dt, clock.elapsed);

  // Saat terbang, titik fokus kamera naik perlahan mengikuti Tails.
  const targetY = tails.animation === 'fly' ? 1.65 : 1.35;
  camera.target[1] += (targetY - camera.target[1]) * 0.08;

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.04, 0.05, 0.08, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const partCount = tails.render({ gl, ...camera.frame(canvas.width / canvas.height) });
  showRenderStatus(status, gl, partCount);
});
