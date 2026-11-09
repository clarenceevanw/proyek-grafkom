import { Renderer } from './rendering/Renderer.js';
import { ShaderProgram } from './rendering/ShaderProgram.js';
import { SONIC_SHADER } from './shaders/sonicShader.js';
import { Sonic } from './characters/Sonic.js';
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
const sonic = new Sonic(gl, { renderer, shader: new ShaderProgram(gl, SONIC_SHADER) });
sonic.setAnimation('idle');

const camera = new OrbitCamera({ target: [0, 1.05, 0], radius: 5.8, minRadius: 3.2, maxRadius: 10, zoomStep: .35 });
const clock = new FrameClock();

// Animasi Sonic dihitung dari waktu sejak mode dimulai, jadi jam di-restart.
function setAnimation(mode) {
  sonic.setAnimation(mode);
  clock.restart();
}

const VIEW_ANGLES = { front: [0, 0], back: [Math.PI, 0], side: [Math.PI / 2, 0] };

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

function setView(view) {
  if (VIEW_ANGLES[view]) [camera.yaw, camera.pitch] = VIEW_ANGLES[view];
}

camera.attach(canvas);

window.addEventListener('keydown', (e) => {
  const map = { '1': 'idle', '2': 'translate', '3': 'rotate', '4': 'arbitrary' };
  if (map[e.key]) setAnimation(map[e.key]);
});

startRenderLoop((now) => {
  const dt = clock.tick(now);
  resizeCanvas(gl, canvas);
  updateAxisGizmo();
  sonic.update(dt, clock.elapsed);

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.04, 0.05, 0.08, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const partCount = sonic.render({
    gl,
    ...camera.frame(canvas.width / canvas.height),
    lightDirection: [.55, .85, .45],
  });
  showRenderStatus(status, gl, partCount);
});
