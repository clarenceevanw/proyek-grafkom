import { Matrix4 } from '../core/Matrix4.js';

// Renderer kecil untuk WebGL 1: upload mesh ke GPU dan menggambar mesh
// dengan ShaderProgram tertentu. Renderer tidak tahu nama uniform karakter;
// setiap karakter mengirim uniform miliknya sendiri.
export class Renderer {
  constructor(gl) {
    if (!gl) throw new Error('Renderer requires an existing WebGL context');
    this.gl = gl;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  // Mesh CPU { p, n, i, c } -> buffer GPU { p, n, i, c }.
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

  // Urutan gambar satu mesh: useProgram -> bind atribut posisi & normal
  // (lokasi diambil dari program ini) -> set uniform -> drawElements.
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

  // Menggambar seluruh scene graph di bawah `root`. makeUniforms(part, world)
  // mengembalikan uniform untuk satu part. Mengembalikan jumlah part yang digambar.
  drawTree(root, shaderProgram, makeUniforms) {
    let count = 0;
    root.traverse(Matrix4.identity(), (_node, _nodeWorld, part, world) => {
      this.drawMesh(part.mesh, shaderProgram, makeUniforms(part, world));
      count += 1;
    });
    return count;
  }

  #setUniforms(shaderProgram, uniforms) {
    for (const [name, value] of Object.entries(uniforms || {})) {
      const location = shaderProgram.uniforms[name];
      if (location === undefined || location === null) continue;
      this.#setUniform(name, location, value);
    }
  }

  #setUniform(name, location, value) {
    const gl = this.gl;
    if (typeof value === 'number') {
      gl.uniform1f(location, value);
    } else if (value != null && typeof value.length === 'number' && value.length === 16) {
      gl.uniformMatrix4fv(location, false, value);
    } else if (value != null && typeof value.length === 'number' && value.length === 9) {
      gl.uniformMatrix3fv(location, false, value);
    } else if (value != null && typeof value.length === 'number' && value.length === 3) {
      gl.uniform3fv(location, value);
    } else {
      throw new TypeError(`Uniform "${name}" must be a number or a vector/matrix of length 3, 9, or 16`);
    }
  }
}

// Validasi renderContext bersama yang dikirim main loop ke setiap objek.
export function assertRenderContext(context, owner) {
  if (!context || !context.viewMatrix || !context.projectionMatrix || !context.cameraPosition) {
    throw new Error(`${owner} renderContext needs viewMatrix, projectionMatrix, and cameraPosition`);
  }
}
