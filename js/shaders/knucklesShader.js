// Knuckles shader source based on reference/Project/script.js

export const KNUCKLES_VERTEX_SOURCE = `
attribute vec3 aPos;
attribute vec3 aNor;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
uniform mat3 uNorm;
varying vec3 vN;
varying vec3 vW;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vW = w.xyz;
  vN = uNorm * aNor;
  gl_Position = uProj * uView * w;
}
`;

export const KNUCKLES_FRAGMENT_SOURCE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vN;
varying vec3 vW;
uniform vec3 uColor;
uniform vec3 uCam;
uniform float uSpec;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(uCam - vW);
  if (dot(n, v) < 0.0) n = -n;
  vec3 l = normalize(vec3(0.5, 1.0, 0.8));
  vec3 h = normalize(l + v);
  float d = max(dot(n, l), 0.0);
  vec3 c = uColor * (0.26 + 0.2 * (0.5 + 0.5 * n.y) + 0.75 * d) + vec3(0.55) * pow(max(dot(n, h), 0.0), 40.0) * uSpec;
  c += uColor * pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.3;
  gl_FragColor = vec4(pow(c, vec3(0.8)), 1.0);
}
`;

export const KNUCKLES_ATTRIBUTE_BINDINGS = {
  aPos: 0,
  aNor: 1,
};

export const KNUCKLES_UNIFORMS = [
  'uModel',
  'uView',
  'uProj',
  'uNorm',
  'uColor',
  'uCam',
  'uSpec',
];
