// Shader karakter Sonic.
// Lighting: ambient arah permukaan + diffuse + Blinn-Phong + rim light.

const VERTEX_SOURCE = `
attribute vec3 aPos; attribute vec3 aNor;
uniform mat4 uModel,uView,uProj; uniform mat3 uNorm;
varying vec3 vN,vW;
void main(){ vec4 w=uModel*vec4(aPos,1.0); vW=w.xyz; vN=uNorm*aNor; gl_Position=uProj*uView*w; }`;

const FRAGMENT_SOURCE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vN; varying vec3 vW;
uniform vec3 uColor,uCam,uLight;
uniform float uSpec,uShin,uRim,uAlpha;
void main(){
  vec3 L=normalize(uLight);
  vec3 N=normalize(vN); vec3 V=normalize(uCam-vW);
  vec3 col=uColor;
  float diff=max(dot(N,L),0.);
  vec3 amb=mix(vec3(.30,.26,.20),vec3(.38,.48,.65),N.y*.5+.5);
  vec3 c=col*(amb+vec3(1.,.95,.85)*diff*.9);
  vec3 Hh=normalize(L+V);
  c+=vec3(1.,.97,.9)*pow(max(dot(N,Hh),0.),uShin)*uSpec*step(.0,diff);
  c+=vec3(.55,.75,1.)*pow(1.-max(dot(N,V),0.),3.)*uRim;
  gl_FragColor=vec4(c,uAlpha);
}`;

// Konfigurasi untuk `new ShaderProgram(gl, SONIC_SHADER)`.
export const SONIC_SHADER = {
  vertexSource: VERTEX_SOURCE,
  fragmentSource: FRAGMENT_SOURCE,
  attributeBindings: { aPos: 0, aNor: 1 },
  uniformNames: ['uModel', 'uView', 'uProj', 'uNorm', 'uColor', 'uCam', 'uLight', 'uSpec', 'uShin', 'uRim', 'uAlpha'],
};
