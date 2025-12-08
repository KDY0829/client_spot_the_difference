// client/src/components/SpotGame.jsx
import { useEffect, useRef, useState } from "react";
import ImageCanvas from "./ImageCanvas";
import { sock, sendReady, claimSpot } from "../lib/socket";
import { onRT, sendRT } from "../lib/rtc";

export default function SpotGame() {
  const [phase, setPhase] = useState("idle"); // idle | ready | countdown | playing
  const [count, setCount] = useState(null);
  const [endsAt, setEndsAt] = useState(null);

  const [image, setImage] = useState(null);
  const [base, setBase] = useState({ w: 1024, h: 500 });
  const [spots, setSpots] = useState([]); // 픽셀 변환된 spots {id,x,y,r}

  const [hits, setHits] = useState([]); // 확정 잠금 spotId[]
  const [scores, setScores] = useState({});
  const [result, setResult] = useState(null);
  const [leftSec, setLeftSec] = useState(null);

  const drawRef = useRef(null);
  const registerDraw = (fn) => (drawRef.current = fn);
  const draw = (op) => drawRef.current && drawRef.current(op);

  // 서버 start 수신
  useEffect(() => {
    const onStart = ({ image, base, spots, startsAt, endsAt }) => {
      setImage(image);
      if (base?.w && base?.h) setBase(base);
      // 정규화 spots → 픽셀로 변환
      const toPx = (s) => ({
        id: s.id,
        x: Math.round(s.nx * base.w),
        y: Math.round(s.ny * base.h),
        r: Math.round(s.nr * base.w), // 가로 기준
      });
      setSpots((spots || []).map(toPx));

      setPhase("countdown");
      setHits([]);
      setScores({});
      setResult(null);
      setEndsAt(endsAt);

      // 카운트다운
      let t;
      const tick = () => {
        const remain = Math.max(0, Math.ceil((startsAt - Date.now()) / 1000));
        setCount(remain);
        if (remain === 0) {
          setPhase("playing");
          clearInterval(t);
        }
      };
      tick();
      t = setInterval(tick, 200);
    };
    sock.on("start", onStart);
    return () => sock.off("start", onStart);
  }, []);

  // lock 수신
  useEffect(() => {
    const onLock = ({ spotId, scores }) => {
      setHits((prev) => (prev.includes(spotId) ? prev : [...prev, spotId]));
      if (scores) setScores(scores);
      const s = spots.find((v) => v.id === spotId);
      if (s) draw({ x: s.x, y: s.y, r: s.r, kind: "lock" });
    };
    sock.on("lock", onLock);
    return () => sock.off("lock", onLock);
  }, [spots]);

  // 라운드 종료
  useEffect(() => {
    const onOver = ({ scores, winners, reason }) => {
      setResult({ scores, winners, reason });
      setPhase("idle");
      setEndsAt(null);
    };
    sock.on("round-over", onOver);
    return () => sock.off("round-over", onOver);
  }, []);

  // RT 마커 동기화
  useEffect(() => {
    onRT((msg) => {
      if (msg.t === "mark")
        draw({ x: msg.x, y: msg.y, r: msg.r, kind: msg.kind });
    });
  }, []);

  // 남은 시간 타이머 (effect 본문 즉시 setState 금지)
  useEffect(() => {
    if (phase !== "playing" || !endsAt) return;
    const tick = () =>
      setLeftSec(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [phase, endsAt]);

  const handleReady = () => {
    const rid = window.__roomId || "abc";
    sendReady(rid);
    setPhase("ready");
  };

  const handleClick = (ux, uy) => {
    if (phase !== "playing") return;

    // 가장 가까운 spot
    let best = null,
      bestD = Infinity;
    for (const s of spots) {
      const d = Math.hypot(s.x - ux, s.y - uy);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }

    if (best && bestD <= best.r) {
      draw({ x: best.x, y: best.y, r: best.r, kind: "hit" });
      sendRT({ t: "mark", x: best.x, y: best.y, r: best.r, kind: "hit" });
      const rid = window.__roomId || "abc";
      claimSpot(rid, best.id); // spotId로 통일
    } else {
      draw({ x: ux, y: uy, r: 10, kind: "miss" });
      sendRT({ t: "mark", x: ux, y: uy, r: 10, kind: "miss" });
    }
  };

  const total = spots.length;
  const myId = sock.id;
  const myScore = scores && myId ? scores[myId] || 0 : 0;

  return (
    <div>
      <div
        style={{
          marginBottom: 8,
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={handleReady}
          disabled={phase !== "idle" && phase !== "ready"}
        >
          {phase === "ready" ? "상대 대기중…" : "준비"}
        </button>
        {result && (
          <button
            onClick={() => {
              setHits([]);
              setResult(null);
              setEndsAt(null);
              handleReady();
            }}
          >
            다시하기
          </button>
        )}
        {phase === "countdown" && <span>시작: {count}</span>}
        {phase === "playing" && leftSec != null && (
          <span>남은시간: {leftSec}s</span>
        )}
        <span style={{ marginLeft: "auto" }}>
          점수: <b>{myScore}</b>
        </span>
        <span>
          정답 {hits.length}/{total}
        </span>
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: 1024,
          margin: "0 auto",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 12,
          background: "#0e1320",
          userSelect: "none",
          touchAction: "none",
        }}
      >
        {image ? (
          <ImageCanvas
            src={image}
            base={base}
            onClick={handleClick}
            registerDraw={registerDraw}
            // ↓ 좌표 뽑기 모드 필요하면 true 로
            // captureMode={true}
            // defaultRadiusPx={18}
          />
        ) : (
          <div style={{ opacity: 0.7 }}>이미지 대기… (Join → 준비)</div>
        )}

        <div style={{ marginTop: 8, opacity: 0.85 }}>
          {hits.length ? `확정 스팟: ${hits.join(",")}` : "정답을 찾아보세요"}
        </div>

        {result && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              border: "1px dashed var(--border)",
              borderRadius: 8,
            }}
          >
            <div>라운드 종료 ({result.reason || "-"})</div>
            <div>
              내 점수: <b>{myScore}</b>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
