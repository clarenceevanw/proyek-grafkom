export class ShaderProgram {
  constructor(gl, options) {
    this.gl = gl;
    this.program = this.#createProgram(
      options.vertexSource,
      options.fragmentSource,
      options.attributeBindings || {},
    );
    this.attributes = {};
    for (const name of options.attributeNames || Object.keys(options.attributeBindings || {})) {
      this.attributes[name] = gl.getAttribLocation(this.program, name);
    }
    this.uniforms = {};
    for (const name of options.uniformNames || []) {
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    }
  }

  use() {
    this.gl.useProgram(this.program);
  }

  #createProgram(vertexSource, fragmentSource, attributeBindings) {
    const gl = this.gl;
    const vertexShader = this.#compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.#compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    for (const [name, location] of Object.entries(attributeBindings)) {
      gl.bindAttribLocation(program, location, name);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`WebGL program link failed: ${gl.getProgramInfoLog(program)}`);
    }
    return program;
  }

  #compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`WebGL shader compilation failed: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  }
}
