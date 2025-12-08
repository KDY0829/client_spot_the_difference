// src/components/ImageCanvas.jsx
import { useEffect, useRef, useState } from "react";

/**
 * 자동 리사이즈 캔버스
 * - 부모 박스 폭에 맞춰 width 100%
 * - height = width * (crop.sh / crop.sw)
 * - DPR 반영
 *
 * props:
 *   img: HTMLImageElement (스프라이트)
 *   crop: { sx, sy, sw, sh }  // 스프라이트에서 잘라낼 영역
 *   drawMarks: [{ type:'hit'|'miss', x, y, r }] // 이미 화면좌표(px) 기준
 *   onClick: (localX, localY, canvasW, canvasH) => void
 */
export default function ImageCanvas({ img, crop, drawMarks = [], onClick }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 }); // 렌더 크기(px)

  // 부모 폭 변화에 반응해 캔버스 픽셀 사이즈 갱신
  useEffect(() => {
    const wrapEl = wrapRef.current;
    if (!wrapEl) return;

    const update = () => {
      const cssW = Math.max(1, wrapEl.clientWidth); // 가로 100%
      const aspect = crop ? crop.sh / crop.sw : 1; // 세로 비율
      const cssH = Math.round(cssW * aspect);

      const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));

      const canvas = canvasRef.current;
      if (!canvas) return;

      // CSS 크기
      canvas.style.width = cssW + "px";
      canvas.style.height = cssH + "px";

      // 실제 픽셀 크기
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);

      setSize({ w: cssW, h: cssH });
    };

    const ro = new ResizeObserver(update);
    ro.observe(wrapEl);
    update();
    return () => ro.disconnect();
  }, [crop?.sw, crop?.sh]);

  // 그리기
  useEffect(() => {
    if (!img || !crop) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));

    // 캔버스 픽셀 단위로 그림
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // 원본에서 crop 영역을 캔버스 전체로 스케일 렌더
    ctx.drawImage(
      img,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      0,
      0,
      canvas.width,
      canvas.height
    );

    // 마크(이미 화면 좌표 px 기준이므로, DPR 반영해서 그리기)
    drawMarks.forEach((m) => {
      if (m.type === "hit") {
        ctx.lineWidth = 4 * dpr;
        ctx.strokeStyle = "#22c55e";
        ctx.beginPath();
        ctx.arc(m.x * dpr, m.y * dpr, m.r * dpr, 0, Math.PI * 2);
        ctx.stroke();
      } else if (m.type === "miss") {
        const R = m.r * dpr;
        ctx.lineWidth = 4 * dpr;
        ctx.strokeStyle = "#ef4444";
        ctx.beginPath();
        ctx.moveTo(m.x * dpr - R, m.y * dpr - R);
        ctx.lineTo(m.x * dpr + R, m.y * dpr + R);
        ctx.moveTo(m.x * dpr + R, m.y * dpr - R);
        ctx.lineTo(m.x * dpr - R, m.y * dpr + R);
        ctx.stroke();
      }
    });

    ctx.restore();
  }, [img, crop, drawMarks, size.w, size.h]);

  function handleClick(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    onClick && onClick(cx, cy, rect.width, rect.height); // 현재 렌더 크기 전달
  }

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <canvas ref={canvasRef} onClick={handleClick} />
    </div>
  );
}
