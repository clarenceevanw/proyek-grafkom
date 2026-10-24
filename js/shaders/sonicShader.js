// Sonic shader source kept equivalent to reference/sonic_webgl_v2.html.

export const SONIC_VERTEX_SOURCE = `
attribute vec3 aPos; attribute vec3 aNor;
uniform mat4 uModel,uView,uProj; uniform mat3 uNorm;
varying vec3 vN,vW;
void main(){ vec4 w=uModel*vec4(aPos,1.0); vW=w.xyz; vN=uNorm*aNor; gl_Position=uProj*uView*w; }`;

export const SONIC_FRAGMENT_SOURCE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec3 vN; varying vec3 vW;
uniform vec3 uColor,uCam,uLight;
uniform float uMode,uSpec,uShin,uRim,uAlpha;
void main(){
  vec3 L=normalize(uLight);
  vec3 hor=vec3(.80,.93,1.0);
  if(uMode>.5&&uMode<1.5){
    vec3 d=normalize(vW-uCam); float h=clamp(d.y,0.,1.);
    vec3 c=mix(hor,vec3(.12,.40,.95),pow(h,.5));
    float sn=max(dot(d,L),0.);
    c+=vec3(1.,.93,.65)*(pow(sn,700.)*3.+pow(sn,14.)*.22);
    gl_FragColor=vec4(c,1.); return; }
  if(uMode>3.5&&uMode<4.5){ gl_FragColor=vec4(0.,0.,0.,uAlpha); return; }
  if(uMode>4.5){ gl_FragColor=vec4(uColor,uAlpha); return; }
  vec3 N=normalize(vN); vec3 V=normalize(uCam-vW);
  vec3 col=uColor;
  if(uMode>1.5&&uMode<2.5){
    vec2 g=floor(vW.xz*.6); float c=mod(g.x+g.y,2.);
    col=mix(vec3(.22,.64,.13),vec3(.16,.53,.10),c);
  } else if(uMode>2.5&&uMode<3.5){
    vec3 g=floor(vW*.9); float c=mod(g.x+g.y+g.z,2.);
    vec3 br=mix(vec3(.56,.33,.12),vec3(.43,.23,.08),c);
    vec3 gr=mix(vec3(.26,.70,.16),vec3(.18,.56,.11),c);
    col=mix(br,gr,smoothstep(.5,.72,N.y));
  }
  float diff=max(dot(N,L),0.);
  vec3 amb=mix(vec3(.30,.26,.20),vec3(.38,.48,.65),N.y*.5+.5);
  vec3 c=col*(amb+vec3(1.,.95,.85)*diff*.9);
  vec3 Hh=normalize(L+V);
  c+=vec3(1.,.97,.9)*pow(max(dot(N,Hh),0.),uShin)*uSpec*step(.0,diff);
  c+=vec3(.55,.75,1.)*pow(1.-max(dot(N,V),0.),3.)*uRim;
  float dist=length(uCam-vW);
  c=mix(c,hor,1.-exp(-dist*dist*.00011));
  gl_FragColor=vec4(c,uAlpha);
}`;

export const SONIC_ATTRIBUTE_BINDINGS = {
  aPos: 0,
  aNor: 1,
};

export const SONIC_UNIFORMS = [
  'uModel', 'uView', 'uProj', 'uNorm',
  'uColor', 'uCam', 'uLight', 'uMode',
  'uSpec', 'uShin', 'uRim', 'uAlpha',
];
