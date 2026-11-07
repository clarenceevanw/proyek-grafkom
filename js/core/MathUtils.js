// Helper skalar kecil yang dipakai bersama oleh karakter dan scene.

export const TAU = Math.PI * 2;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

// Hermite smoothstep: 0 di edge0, 1 di edge1, dengan awal/akhir yang halus.
export function smoothStep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
