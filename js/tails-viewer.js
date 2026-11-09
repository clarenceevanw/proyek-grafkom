import { Renderer } from './rendering/Renderer.js';
import { ShaderProgram } from './rendering/ShaderProgram.js';
import { TAILS_SHADER } from './shaders/tailsShader.js';
import { Tails } from './characters/Tails.js';
import { OrbitCamera } from './app/OrbitCamera.js';
import {
  FrameClock,
  createWebGLContext,
  resizeCanvas,
  showRenderStatus,
  startRenderLoop,
} from './app/viewerSetup.js';

const canvas = document.getElementById('gl');
const status = document.getElementById('status');
const axisGizmo = document.getElementById('axis-gizmo');
const gl = createWebGLContext(canvas, status);

const renderer = new Renderer(gl);
const tails = new Tails(gl, { renderer, shader: new ShaderProgram(gl, TAILS_SHADER) });

const DEFAULT_TARGET = [0, 1.35, 0];
const DEFAULT_RADIUS = 6.8;
const camera = new OrbitCamera({ target: DEFAULT_TARGET, radius: DEFAULT_RADIUS, pitch: 0.05, minRadius: 3.8, maxRadius: 16.0, zoomStep: 0.45 });
const clock = new FrameClock();

function setAnimation(mode) {
  tails.setAnimation(mode);
}

function updateAxisGizmo() {
  const { yaw, pitch } = camera;
  const axes = [
    { id: 'x', screenX: Math.cos(yaw), screenY: Math.sin(yaw) * Math.sin(pitch) },
    { id: 'y', screenX: 0, screenY: -Math.cos(pitch) },
    { id: 'z', screenX: -Math.sin(yaw), screenY: Math.cos(yaw) * Math.sin(pitch) },
  ];
  for (const axis of axes) {
    const group = axisGizmo.querySelector(`.axis-${axis.id}`);
    const endX = 50 + axis.screenX * 31;
    const endY = 50 + axis.screenY * 31;
    group.querySelector('line').setAttribute('x2', endX);
    group.querySelector('line').setAttribute('y2', endY);
    group.querySelector('text').setAttribute('x', endX + (Math.abs(axis.screenX) < .1 ? 0 : Math.sign(axis.screenX) * 6));
    group.querySelector('text').setAttribute('y', endY + (Math.abs(axis.screenY) < .1 ? 0 : Math.sign(axis.screenY) * 6));
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
}

camera.attach(canvas);

window.addEventListener('keydown', (e) => {
  const map = { '1': 'idle', '2': 'walk', '3': 'fly' };
  if (map[e.key]) setAnimation(map[e.key]);
});

// Parameter URL untuk inspeksi cepat, mis. ?anim=fly&view=side&t=2
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('view')) setView(urlParams.get('view'));
if (urlParams.has('anim')) setAnimation(urlParams.get('anim'));
if (urlParams.has('t')) clock.elapsed = parseFloat(urlParams.get('t')) || 0;

startRenderLoop((now) => {
  const dt = clock.tick(now);
  resizeCanvas(gl, canvas);
  updateAxisGizmo();
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
