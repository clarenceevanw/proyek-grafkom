import { Matrix4 } from '../core/Matrix4.js';

const DRAG_SENSITIVITY = .008;

// Kamera orbit: berputar mengelilingi titik `target` pada jarak `radius`.
//   yaw   = sudut horizontal (0 = melihat dari depan, sumbu +Z)
//   pitch = sudut vertikal (positif = dari atas)
// Drag mouse mengubah yaw/pitch, scroll mengubah radius (zoom).
export class OrbitCamera {
  constructor(options) {
    this.target = [...options.target];
    this.radius = options.radius;
    this.yaw = options.yaw ?? 0;
    this.pitch = options.pitch ?? 0;
    this.minRadius = options.minRadius;
    this.maxRadius = options.maxRadius;
    this.zoomStep = options.zoomStep;
    this.minPitch = options.minPitch ?? -1.25;
    this.maxPitch = options.maxPitch ?? 1.25;
    this.fov = options.fov ?? .72;
    this.near = options.near ?? .1;
    this.far = options.far ?? 100;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
  }

  // Pasang kontrol mouse/touch. onDragStart(event) dipanggil saat drag dimulai.
  attach(canvas, { onDragStart } = {}) {
    canvas.addEventListener('pointerdown', (event) => {
      if (onDragStart) onDragStart(event);
      this.dragging = true;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      this.yaw -= (event.clientX - this.lastX) * DRAG_SENSITIVITY;
      this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch + (event.clientY - this.lastY) * DRAG_SENSITIVITY));
      this.lastX = event.clientX;
      this.lastY = event.clientY;
    });
    canvas.addEventListener('pointerup', () => { this.dragging = false; });
    canvas.addEventListener('pointercancel', () => { this.dragging = false; });
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.radius = Math.max(this.minRadius, Math.min(this.maxRadius, this.radius + Math.sign(event.deltaY) * this.zoomStep));
    }, { passive: false });
  }

  // Posisi mata kamera dalam koordinat bola di sekitar target.
  position() {
    const horizontal = Math.cos(this.pitch) * this.radius;
    return [
      this.target[0] + Math.sin(this.yaw) * horizontal,
      this.target[1] + Math.sin(this.pitch) * this.radius,
      this.target[2] + Math.cos(this.yaw) * horizontal,
    ];
  }

  // Data kamera bersama untuk satu frame (bagian dari renderContext).
  frame(aspect) {
    const cameraPosition = this.position();
    return {
      cameraPosition,
      viewMatrix: Matrix4.lookAt(cameraPosition, this.target, [0, 1, 0]),
      projectionMatrix: Matrix4.perspective(this.fov, aspect, this.near, this.far),
    };
  }
}
