import { useEffect, useRef } from "react";

export default function ImageCanvas({ src, base, onClick, registerDraw }) {
  const imgRef = useRef(null);
  const cvsRef = useRef(null);

  function drawMark(op) {
    const cvs = cvsRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");

    if (op.type === "clear") {
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      return;
    }

    const { x, y, kind } = op;
    const FIXED_RADIUS = 15; // 정답 원 크기

    ctx.save();
    ctx.lineWidth = 3;

    if (kind === "hit" || kind === "lock") {
      ctx.strokeStyle = kind === "hit" ? "#3BE37F" : "#FFD166";
      ctx.beginPath();
      ctx.arc(x, y, FIXED_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const X_SIZE = 10;
      ctx.strokeStyle = "#FF5E57";
      ctx.beginPath();
      ctx.moveTo(x - X_SIZE, y - X_SIZE);
      ctx.lineTo(x + X_SIZE, y + X_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + X_SIZE, y - X_SIZE);
      ctx.lineTo(x - X_SIZE, y + X_SIZE);
      ctx.stroke();
    }
    ctx.restore();
  }

  useEffect(() => {
    if (registerDraw) registerDraw(drawMark);
  }, [registerDraw]);

  useEffect(() => {
    const img = imgRef.current;
    const cvs = cvsRef.current;
    if (!img || !cvs) return;

    const sync = () => {
      const rect = img.getBoundingClientRect();
      cvs.style.width = rect.width + "px";
      cvs.style.height = rect.height + "px";
      cvs.width = base.w;
      cvs.height = base.h;
    };
    sync();
    const obs = new ResizeObserver(sync);
    obs.observe(img);
    return () => obs.disconnect();
  }, [src, base.w, base.h]);

  const handlePointer = (e) => {
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const ux = Math.round(((clientX - rect.left) * base.w) / rect.width);
    const uy = Math.round(((clientY - rect.top) * base.h) / rect.height);

    onClick?.(ux, uy);
  };

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <img
        ref={imgRef}
        src={src}
        alt="game"
        onClick={handlePointer}
        onTouchStart={handlePointer}
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          borderRadius: 8,
          cursor: "crosshair",
        }}
      />
      <canvas
        ref={cvsRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
