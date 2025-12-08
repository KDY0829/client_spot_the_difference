// src/lib/geom.js
export function denormPoint({ x, y }, box) {
  // box: { x, y, w, h } 픽셀 단위
  return { X: box.x + x * box.w, Y: box.y + y * box.h };
}
export function hitCircle(normSpot, box, px, py) {
  const { X, Y } = denormPoint(normSpot, box);
  const R = normSpot.r * Math.min(box.w, box.h);
  const dx = px - X,
    dy = py - Y;
  return dx * dx + dy * dy <= R * R;
}
