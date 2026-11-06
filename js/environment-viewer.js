import { Matrix4 } from './core/Matrix4.js';
import { Renderer } from './rendering/Renderer.js';
import { ShaderProgram } from './rendering/ShaderProgram.js';
import {
  ENVIRONMENT_ATTRIBUTE_BINDINGS,
  ENVIRONMENT_FRAGMENT_SOURCE,
  ENVIRONMENT_UNIFORMS,
  ENVIRONMENT_VERTEX_SOURCE,
} from './shaders/environmentShader.js';
import { Environment } from './environment/Environment.js';

const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl', { antialias: true });
if (!gl) throw new Error('WebGL tidak tersedia');

const renderer = new Renderer(gl);
const shader = new ShaderProgram(gl, {
  vertexSource: ENVIRONMENT_VERTEX_SOURCE,
  fragmentSource: ENVIRONMENT_FRAGMENT_SOURCE,
  attributeBindings: ENVIRONMENT_ATTRIBUTE_BINDINGS,
  uniformNames: ENVIRONMENT_UNIFORMS,
});
const environment = new Environment(gl, { renderer, shader });
environment.shadow.visible = false;

let radius = 65;
let yaw = 0;
let pitch = .85;
let dragging = false;
let lastX = 0;
let lastY = 0;
let lastFrame = performance.now();
let elapsed = 0;
let webglErrorReported = false;
const target = [0, 2.5, 0];

canvas.addEventListener('pointerdown', (event) => {
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
  radius = Math.max(18, Math.min(90, radius + Math.sign(event.deltaY) * 2));
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
  environment.update(elapsed);

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
  environment.render({
    gl,
    viewMatrix,
    projectionMatrix,
    cameraPosition,
    lightDirection: [.55, .85, .45],
  });
  const error = gl.getError();
  if (error !== gl.NO_ERROR && !webglErrorReported) {
    webglErrorReported = true;
    console.error(`Environment WebGL error: ${error}`);
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
