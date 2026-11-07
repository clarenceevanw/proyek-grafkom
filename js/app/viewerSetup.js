// Utilitas bersama untuk halaman viewer: WebGL context, resize canvas,
// jam frame, loop animasi, dan tombol UI berbasis atribut data-*.

// Membuat context WebGL 1. Jika gagal, tampilkan pesan di halaman lalu hentikan script.
export function createWebGLContext(canvas, statusElement = null) {
  if (!canvas) throw new Error('Canvas element #gl tidak ditemukan');
  const gl = canvas.getContext('webgl', { antialias: true }) || canvas.getContext('experimental-webgl');
  if (!gl) {
    if (statusElement) statusElement.textContent = 'Error: WebGL 1 tidak didukung pada browser ini';
    const stage = canvas.parentElement;
    if (stage && stage !== document.body) {
      stage.innerHTML = '<div style="padding:24px;color:#ff6b6b;font-weight:600;">Inisialisasi WebGL gagal. Browser Anda tidak mendukung WebGL 1.</div>';
    }
    throw new Error('WebGL 1 tidak tersedia');
  }
  return gl;
}

// Samakan resolusi canvas dengan ukuran tampilannya (maks 2x devicePixelRatio).
export function resizeCanvas(gl, canvas) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.floor(canvas.clientWidth * ratio);
  const height = Math.floor(canvas.clientHeight * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
}

// Menghitung dt per frame (dibatasi 0.05 detik) dan total waktu berjalan.
export class FrameClock {
  constructor() {
    this.restart();
  }

  restart() {
    this.lastFrame = performance.now();
    this.elapsed = 0;
  }

  tick(now) {
    const dt = Math.min(.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.elapsed += dt;
    return dt;
  }
}

// Satu-satunya requestAnimationFrame loop di halaman.
export function startRenderLoop(frame) {
  const loop = (now) => {
    frame(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// Pasang klik untuk semua tombol [data-<name>], mis. name = 'animation'.
export function bindButtons(name, onSelect) {
  document.querySelectorAll(`[data-${name}]`).forEach((button) => {
    button.addEventListener('click', () => onSelect(button.dataset[name]));
  });
}

// Tandai tombol [data-<name>="<value>"] sebagai aktif, yang lain tidak.
export function setActiveButton(name, value) {
  document.querySelectorAll(`[data-${name}]`).forEach((button) => {
    button.classList.toggle('active', button.dataset[name] === value);
  });
}

// Teks status di pojok viewer: jumlah part yang digambar dan error WebGL.
export function showRenderStatus(statusElement, gl, partCount) {
  if (!statusElement) return;
  const error = gl.getError();
  statusElement.textContent = `Parts: ${partCount} | WebGL: ${error === gl.NO_ERROR ? 'OK' : error}`;
}

// Laporkan error WebGL pertama ke console (untuk viewer tanpa teks status).
export function createGLErrorReporter(gl, label) {
  let reported = false;
  return () => {
    const error = gl.getError();
    if (error !== gl.NO_ERROR && !reported) {
      reported = true;
      console.error(`${label} WebGL error: ${error}`);
    }
  };
}
