import { RaceScene } from './scenes/RaceScene.js';
import { CharacterIntroductionScene } from './scenes/CharacterIntroductionScene.js';
import { OrbitCamera } from './app/OrbitCamera.js';
import {
  FrameClock,
  createGLErrorReporter,
  createWebGLContext,
  resizeCanvas,
  startRenderLoop,
} from './app/viewerSetup.js';

// Kontrol keyboard:
//   1 / 2 / 3  intro Sonic / Knuckles / Tails      0  batalkan intro
//   G          mulai balapan
//   W A S D    geser kamera (Shift = lebih cepat)

const canvas = document.getElementById('gl');
const gl = createWebGLContext(canvas);

const raceScene = new RaceScene(gl);
const introductionScene = new CharacterIntroductionScene(raceScene);
let activeScene = raceScene;

const camera = new OrbitCamera({
  target: [0, 1.8, -22], radius: 54, pitch: .55,
  minPitch: -.15, maxPitch: 1.25, minRadius: 24, maxRadius: 100, zoomStep: 2,
  fov: .78, far: 250,
});
camera.attach(canvas, { onDragStart: () => canvas.focus({ preventScroll: true }) });
const clock = new FrameClock();
const reportGLError = createGLErrorReporter(gl, 'Race viewer');

const INTRO_KEYS = {
  Digit1: 'sonic', Numpad1: 'sonic',
  Digit2: 'knuckles', Numpad2: 'knuckles',
  Digit3: 'tails', Numpad3: 'tails',
};
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'];
const pressedKeys = new Set();

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  const code = event.code;
  if (INTRO_KEYS[code]) {
    event.preventDefault();
    if (activeScene === raceScene && introductionScene.start(INTRO_KEYS[code])) {
      activeScene = introductionScene;
    }
    return;
  }
  if (code === 'Digit0' || code === 'Numpad0') {
    event.preventDefault();
    if (activeScene === introductionScene && introductionScene.cancel()) {
      activeScene = raceScene;
    }
    return;
  }
  if (code === 'KeyG') {
    event.preventDefault();
    if (activeScene === raceScene) raceScene.startRace();
    return;
  }
  if (!MOVE_KEYS.includes(code)) return;
  if (code.startsWith('Key')) event.preventDefault();
  pressedKeys.add(code);
});
window.addEventListener('keyup', (event) => pressedKeys.delete(event.code));
window.addEventListener('blur', () => pressedKeys.clear());

// Geser titik fokus kamera di bidang XZ relatif terhadap arah pandang (yaw).
function moveCamera(dt) {
  const forward = Number(pressedKeys.has('KeyW')) - Number(pressedKeys.has('KeyS'));
  const strafe = Number(pressedKeys.has('KeyD')) - Number(pressedKeys.has('KeyA'));
  if (!forward && !strafe) return;

  const length = Math.hypot(forward, strafe);
  const speed = 5 * (pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight') ? 2.5 : 1);
  const forwardX = -Math.sin(camera.yaw);
  const forwardZ = -Math.cos(camera.yaw);
  const rightX = Math.cos(camera.yaw);
  const rightZ = -Math.sin(camera.yaw);
  const distance = speed * dt / length;
  camera.target[0] += (forwardX * forward + rightX * strafe) * distance;
  camera.target[2] += (forwardZ * forward + rightZ * strafe) * distance;
}

startRenderLoop((now) => {
  const dt = clock.tick(now);
  resizeCanvas(gl, canvas);
  moveCamera(dt);
  activeScene.update(dt, clock.elapsed);
  if (activeScene === introductionScene && !introductionScene.active) activeScene = raceScene;

  gl.clearColor(.78, .91, 1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  activeScene.render({
    gl,
    ...camera.frame(canvas.width / canvas.height),
    lightDirection: [.55, .85, .45],
  });
  reportGLError();
});
