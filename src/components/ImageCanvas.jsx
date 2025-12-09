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

    const { x, y, r, kind } = op;
    ctx.save();
    ctx.lineWidth = 3;

    if (kind === "hit" || kind === "lock") {
      // 정답: 초록/노랑 (크기 0.7배로 축소)
      ctx.strokeStyle = kind === "hit" ? "#3BE37F" : "#FFD166";
      ctx.beginPath();
      // 크기가 여전히 크면 아래 0.7 을 0.5로 바꾸세요.
      ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // 오답: 빨강 X
      ctx.strokeStyle = "#FF5E57";
      ctx.beginPath();
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + r, y - r);
      ctx.lineTo(x - r, y + r);
      ctx.stroke();
    }
    ctx.restore();
  }

  useEffect(() => {
    if (registerDraw) registerDraw(drawMark);
  }, [registerDraw]);

  // 캔버스 크기 동기화
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
