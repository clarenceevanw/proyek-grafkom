// Shader Tails (dari reference Tails). Struktur sama dengan Knuckles,
// dengan konstanta lighting dan gamma pow(c, 0.85) milik Tails.

const VERTEX_SOURCE = `
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

const FRAGMENT_SOURCE = `
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
  vec3 c = uColor * (0.28 + 0.22 * (0.5 + 0.5 * n.y) + 0.72 * d) + vec3(0.55) * pow(max(dot(n, h), 0.0), 38.0) * uSpec;
  c += uColor * pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.28;
  gl_FragColor = vec4(pow(c, vec3(0.85)), 1.0);
}
`;

// Konfigurasi untuk `new ShaderProgram(gl, TAILS_SHADER)`.
export const TAILS_SHADER = {
  vertexSource: VERTEX_SOURCE,
  fragmentSource: FRAGMENT_SOURCE,
  attributeBindings: { aPos: 0, aNor: 1 },
  uniformNames: ['uModel', 'uView', 'uProj', 'uNorm', 'uColor', 'uCam', 'uSpec'],
};
