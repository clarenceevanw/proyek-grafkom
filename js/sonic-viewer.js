import { Renderer } from './rendering/Renderer.js';
import { ShaderProgram } from './rendering/ShaderProgram.js';
import { SONIC_SHADER } from './shaders/sonicShader.js';
import { Sonic } from './characters/Sonic.js';
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
const axisGizmo = document.getElementById('axis-gizmo');
const gl = createWebGLContext(canvas, status);

const renderer = new Renderer(gl);
const sonic = new Sonic(gl, { renderer, shader: new ShaderProgram(gl, SONIC_SHADER) });
sonic.setAnimation('idle');

const camera = new OrbitCamera({ target: [0, 1.05, 0], radius: 5.8, minRadius: 3.2, maxRadius: 10, zoomStep: .35 });
const clock = new FrameClock();

const animationInfo = {
  idle: ['Idle', 'Gerakan dasar untuk membandingkan pose Sonic tanpa perpindahan besar.'],
  translate: ['Lari maju / Translate', 'Sonic berlari ke depan pada sumbu Z dengan ayunan tangan-kaki cepat dan pantulan badan. Jarak geraknya dibatasi agar tetap terlihat di viewer.'],
  rotate: ['Spin Bola / Rotasi', 'Sonic menggulung menjadi bola, berputar satu kali di tempat pada sumbu X, lalu membuka kembali dan kembali idle.'],
  arbitrary: ['Salto / Arbitrary Axis', 'Sonic melompat dan melakukan satu salto pada sumbu diagonal tetap (1,1,0) yang dinormalisasi. Dilihat dari depan, sumbu ini memiringkan putaran agar lebih mudah terlihat. Lintasan lompat adalah translasi; saltonya rotasi Rodrigues pada sumbu yang bukan X, Y, atau Z. Setelah mendarat, Sonic kembali idle.'],
};

// Animasi Sonic dihitung dari waktu sejak mode dimulai, jadi jam di-restart.
function setAnimation(mode) {
  sonic.setAnimation(mode);
  clock.restart();
  setActiveButton('animation', mode);
  [modeTitle.textContent, modeCopy.textContent] = animationInfo[mode];
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
  setActiveButton('view', view);
}

bindButtons('animation', setAnimation);
bindButtons('view', setView);
document.getElementById('reset').addEventListener('click', () => {
  sonic.reset();
  setAnimation('idle');
});
camera.attach(canvas, { onDragStart: () => setActiveButton('view', 'free') });

startRenderLoop((now) => {
  const dt = clock.tick(now);
  resizeCanvas(gl, canvas);
  updateAxisGizmo();
  sonic.update(dt, clock.elapsed);

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(.78, .91, 1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const partCount = sonic.render({
    gl,
    ...camera.frame(canvas.width / canvas.height),
    lightDirection: [.55, .85, .45],
  });
  showRenderStatus(status, gl, partCount);
});
