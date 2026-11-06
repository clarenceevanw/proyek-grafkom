import { Matrix4 } from './core/Matrix4.js';
import { RaceScene } from './scenes/RaceScene.js';

const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl', { antialias: true });
if (!gl) throw new Error('WebGL tidak tersedia');

const scene = new RaceScene(gl);
const target = [0, 1.8, -22];
let radius = 54;
let yaw = 0;
let pitch = .55;
let dragging = false;
let lastX = 0;
let lastY = 0;
const pressedKeys = new Set();
let lastFrame = performance.now();
let elapsed = 0;
let webglErrorReported = false;

canvas.addEventListener('pointerdown', (event) => {
  canvas.focus({ preventScroll: true });
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  yaw -= (event.clientX - lastX) * .008;
  pitch = Math.max(-.15, Math.min(1.25, pitch + (event.clientY - lastY) * .008));
  lastX = event.clientX;
  lastY = event.clientY;
});
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointercancel', () => { dragging = false; });
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  radius = Math.max(24, Math.min(100, radius + Math.sign(event.deltaY) * 2));
}, { passive: false });

window.addEventListener('keydown', (event) => {
  const code = event.code;
  if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(code)) return;
  if (code.startsWith('Key')) event.preventDefault();
  pressedKeys.add(code);
});
window.addEventListener('keyup', (event) => pressedKeys.delete(event.code));
window.addEventListener('blur', () => pressedKeys.clear());

function moveCamera(dt) {
  const forward = Number(pressedKeys.has('KeyW')) - Number(pressedKeys.has('KeyS'));
  const strafe = Number(pressedKeys.has('KeyD')) - Number(pressedKeys.has('KeyA'));
  if (!forward && !strafe) return;

  const length = Math.hypot(forward, strafe);
  const speed = 12 * (pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight') ? 2.5 : 1);
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const distance = speed * dt / length;
  target[0] += (forwardX * forward + rightX * strafe) * distance;
  target[2] += (forwardZ * forward + rightZ * strafe) * distance;
}

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
  moveCamera(dt);
  scene.update(dt, elapsed);

  const horizontal = Math.cos(pitch) * radius;
  const cameraPosition = [
    target[0] + Math.sin(yaw) * horizontal,
    target[1] + Math.sin(pitch) * radius,
    target[2] + Math.cos(yaw) * horizontal,
  ];
  const viewMatrix = Matrix4.lookAt(cameraPosition, target, [0, 1, 0]);
  const projectionMatrix = Matrix4.perspective(.78, canvas.width / canvas.height, .1, 250);

  gl.clearColor(.78, .91, 1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  scene.render({
    gl,
    viewMatrix,
    projectionMatrix,
    cameraPosition,
    lightDirection: [.55, .85, .45],
  });

  const error = gl.getError();
  if (error !== gl.NO_ERROR && !webglErrorReported) {
    webglErrorReported = true;
    console.error(`Race viewer WebGL error: ${error}`);
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
