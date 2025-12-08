// client/src/components/ImageCanvas.jsx
import { useEffect, useRef } from "react";

export default function ImageCanvas({
  src,
  base,
  onClick,
  registerDraw,
  captureMode = false, // 좌표 뽑기용 토글
  defaultRadiusPx = 18, // 콘솔 출력용 기본 r(px)
}) {
  const wrapRef = useRef(null);
  const imgRef = useRef(null);
  const cvsRef = useRef(null);

  // ★ drawMark를 먼저 선언 (eslint 경고 방지)
  function drawMark({ x, y, r, kind }) {
    const cvs = cvsRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    ctx.save();
    ctx.lineWidth = 3;

    if (kind === "hit") {
      ctx.strokeStyle = "#3BE37F";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (kind === "lock") {
      ctx.strokeStyle = "#FFD166";
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    } else {
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

  // 외부에서 draw 호출 가능하도록 등록
  useEffect(() => {
    if (!registerDraw) return;
    registerDraw((op) => drawMark(op));
  }, [registerDraw]);

  // 이미지 ↔ 캔버스 크기 동기화
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
      const ctx = cvs.getContext("2d");
      ctx.clearRect(0, 0, cvs.width, cvs.height);
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

    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    // 화면 → 원본 좌표
    const ux = Math.round((localX * base.w) / rect.width);
    const uy = Math.round((localY * base.h) / rect.height);

    onClick?.(ux, uy);

    // 좌표 에디터 모드: 0..1로 콘솔 출력
    if (captureMode) {
      const nx = +(ux / base.w).toFixed(4);
      const ny = +(uy / base.h).toFixed(4);
      const nr = +(defaultRadiusPx / base.w).toFixed(4);
      console.log(`{ id: ?, nx: ${nx}, ny: ${ny}, nr: ${nr} },`);
      drawMark({ x: ux, y: uy, r: defaultRadiusPx, kind: "hit" });
    }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <img
        ref={imgRef}
        src={src}
        alt=""
        onClick={handlePointer}
        onTouchStart={handlePointer}
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          borderRadius: 8,
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
