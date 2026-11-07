import { Renderer } from './rendering/Renderer.js';
import { ShaderProgram } from './rendering/ShaderProgram.js';
import { ENVIRONMENT_SHADER } from './shaders/environmentShader.js';
import { Environment } from './environment/Environment.js';
import { OrbitCamera } from './app/OrbitCamera.js';
import {
  FrameClock,
  createGLErrorReporter,
  createWebGLContext,
  resizeCanvas,
  startRenderLoop,
} from './app/viewerSetup.js';

const canvas = document.getElementById('gl');
const gl = createWebGLContext(canvas);

const renderer = new Renderer(gl);
const environment = new Environment(gl, { renderer, shader: new ShaderProgram(gl, ENVIRONMENT_SHADER) });

const camera = new OrbitCamera({
  target: [0, 2.5, 0], radius: 65, pitch: .85,
  minPitch: -.15, maxPitch: 1.25, minRadius: 18, maxRadius: 90, zoomStep: 2,
  fov: .78, far: 250,
});
camera.attach(canvas);
const clock = new FrameClock();
const reportGLError = createGLErrorReporter(gl, 'Environment');

startRenderLoop((now) => {
  clock.tick(now);
  resizeCanvas(gl, canvas);
  environment.update(clock.elapsed);

  gl.clearColor(.78, .91, 1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  environment.render({
    gl,
    ...camera.frame(canvas.width / canvas.height),
    lightDirection: [.55, .85, .45],
  });
  reportGLError();
});
