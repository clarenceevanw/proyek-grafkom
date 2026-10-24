export class Renderer {
  constructor(gl) {
    if (!gl) throw new Error('Renderer requires an existing WebGL context');
    this.gl = gl;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  uploadMesh(mesh) {
    if (!mesh || !(mesh.p instanceof Float32Array)
      || !(mesh.n instanceof Float32Array)
      || !(mesh.i instanceof Uint16Array)) {
      throw new TypeError('Mesh must contain Float32Array p/n and Uint16Array i');
    }
    if (mesh.p.length % 3 !== 0 || mesh.n.length !== mesh.p.length) {
      throw new RangeError('Mesh position and normal dimensions are incompatible');
    }
    if (mesh.c < 0 || mesh.c > mesh.i.length) {
      throw new RangeError('Mesh count is outside the index buffer');
    }
    const gl = this.gl;
    const buffer = (target, data) => {
      const handle = gl.createBuffer();
      gl.bindBuffer(target, handle);
      gl.bufferData(target, data, gl.STATIC_DRAW);
      return handle;
    };
    return {
      p: buffer(gl.ARRAY_BUFFER, mesh.p),
      n: buffer(gl.ARRAY_BUFFER, mesh.n),
      i: buffer(gl.ELEMENT_ARRAY_BUFFER, mesh.i),
      c: mesh.c,
    };
  }

  drawMesh(mesh, shaderProgram, uniforms) {
    const gl = this.gl;
    shaderProgram.use();
    const position = shaderProgram.attributes.aPos;
    const normal = shaderProgram.attributes.aNor;
    if (position === undefined || normal === undefined) {
      throw new Error('Shader program must expose aPos and aNor for this mesh');
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.p);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.n);
    gl.enableVertexAttribArray(normal);
    gl.vertexAttribPointer(normal, 3, gl.FLOAT, false, 0, 0);
    this.#setUniforms(shaderProgram, uniforms);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.i);
    gl.drawElements(gl.TRIANGLES, mesh.c, gl.UNSIGNED_SHORT, 0);
  }

  #setUniforms(shaderProgram, uniforms) {
    for (const [name, value] of Object.entries(uniforms || {})) {
      const location = shaderProgram.uniforms[name];
      if (location === undefined || location === null) continue;
      this.#setUniform(location, value);
    }
  }

  #setUniform(location, value) {
    const gl = this.gl;
    if (typeof value === 'number') {
      gl.uniform1f(location, value);
    } else if (value.length === 16) {
      gl.uniformMatrix4fv(location, false, value);
    } else if (value.length === 9) {
      gl.uniformMatrix3fv(location, false, value);
    } else if (value.length === 3) {
      gl.uniform3fv(location, value);
    } else {
      throw new TypeError('Unsupported uniform value shape');
    }
  }
}
