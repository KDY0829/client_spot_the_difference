import { useEffect, useRef } from "react";

export default function ImageCanvas({
  src,
  base,
  onClick,
  registerDraw,
  captureMode = false,
  defaultRadiusPx = 18,
}) {
  const wrapRef = useRef(null);
  const imgRef = useRef(null);
  const cvsRef = useRef(null);

  // 그림 그리는 함수
  function drawMark(op) {
    const cvs = cvsRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");

    // [기능 추가] 캔버스 전체 지우기 (X표 제거용)
    if (op.type === "clear") {
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      return;
    }

    const { x, y, r, kind } = op;
    ctx.save();
    ctx.lineWidth = 3;

    if (kind === "hit") {
      // [수정] O 표시 크기를 0.7배로 축소 (작게)
      ctx.strokeStyle = "#3BE37F";
      ctx.beginPath();
      ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
      ctx.stroke();
    } else if (kind === "lock") {
      // [수정] 확정된 정답도 작게
      ctx.strokeStyle = "#FFD166";
      ctx.beginPath();
      ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // X 표시는 그대로
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
      // 리사이즈 시 초기화되므로 필요시 외부에서 다시 그려야 함
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

    // 화면 → 원본 좌표 변환
    const ux = Math.round((localX * base.w) / rect.width);
    const uy = Math.round((localY * base.h) / rect.height);

    onClick?.(ux, uy);

    // 좌표 추출 모드 (개발용)
    if (captureMode) {
      const nx = +(ux / base.w).toFixed(4);
      const ny = +(uy / base.h).toFixed(4);
      const nr = +(defaultRadiusPx / base.w).toFixed(4);
      console.log(
        `{ id: "spot_${Date.now()}", nx: ${nx}, ny: ${ny}, nr: ${nr} },`
      );
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
          cursor: captureMode ? "crosshair" : "default",
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
