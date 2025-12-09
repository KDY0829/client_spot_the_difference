import { useEffect, useRef, useState } from "react";
import ImageCanvas from "./ImageCanvas";
import { sock, sendReady, claimSpot } from "../lib/socket";
import { onRT, sendRT } from "../lib/rtc";

export default function SpotGame() {
  const [phase, setPhase] = useState("idle");
  const [count, setCount] = useState(null);
  const [endsAt, setEndsAt] = useState(null);

  const [image, setImage] = useState(null);
  const [base, setBase] = useState({ w: 1024, h: 500 });
  const [spots, setSpots] = useState([]);

  // 상태 관리
  const [hits, setHits] = useState([]); // 찾은 정답들의 ID 목록
  const [scores, setScores] = useState({});
  const [result, setResult] = useState(null);
  const [leftSec, setLeftSec] = useState(null);

  const drawRef = useRef(null);
  const draw = (op) => drawRef.current && drawRef.current(op);
  const registerDraw = (fn) => (drawRef.current = fn);

  // ✅ 핵심 함수: 화면을 싹 지우고 "찾은 정답(O)"들만 다시 그림
  const redrawHits = (currentHits) => {
    // 1. 전체 지우기 (X표시 삭제됨)
    draw({ type: "clear" });

    // 2. 서버에서 인정한 정답들(hits) 다시 그리기 (O표시 복구)
    currentHits.forEach((spotId) => {
      const s = spots.find((v) => v.id === spotId);
      if (s) draw({ x: s.x, y: s.y, r: s.r, kind: "lock" }); // lock = 노란/초록 O
    });
  };

  // 게임 시작 데이터 수신
  useEffect(() => {
    const onStart = ({ image, base, spots, startsAt, endsAt }) => {
      setImage(image);
      if (base?.w && base?.h) setBase(base);

      const toPx = (s) => ({
        id: s.id,
        x: Math.round(s.nx * base.w),
        y: Math.round(s.ny * base.h),
        r: Math.round(s.nr * base.w),
      });
      // 서버 데이터로 spots 덮어쓰기
      setSpots((spots || []).map(toPx));

      setPhase("countdown");
      setHits([]);
      setScores({});
      setResult(null);
      setEndsAt(endsAt);

      draw({ type: "clear" }); // 화면 초기화

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

  // ★ 정답 인정(lock) 수신 -> 점수판 반영
  useEffect(() => {
    const onLock = ({ spotId, scores }) => {
      if (scores) setScores(scores); // 점수 업데이트

      setHits((prev) => {
        if (prev.includes(spotId)) return prev;
        const next = [...prev, spotId];

        // 정답 O 그리기
        const s = spots.find((v) => v.id === spotId);
        if (s) draw({ x: s.x, y: s.y, r: s.r, kind: "lock" });

        return next;
      });
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

  // 상대방 마우스 효과(실시간)
  useEffect(() => {
    onRT((msg) => {
      if (msg.t === "mark") {
        draw({ x: msg.x, y: msg.y, r: msg.r, kind: msg.kind });
      }
    });
  }, []);

  // 남은 시간 타이머
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

  // ★ 클릭 처리
  const handleClick = (ux, uy) => {
    if (phase !== "playing") return;

    // 1. 가장 가까운 스팟 찾기
    let best = null,
      bestD = Infinity;
    for (const s of spots) {
      const d = Math.hypot(s.x - ux, s.y - uy);
      if (!hits.includes(s.id) && d < bestD) {
        // 이미 찾은건 제외
        bestD = d;
        best = s;
      }
    }

    // 2. 판정 (반지름 이내인가?)
    if (best && bestD <= best.r) {
      // [정답]
      // 일단 내 화면에 O를 그림
      draw({ x: best.x, y: best.y, r: best.r, kind: "hit" });
      sendRT({ t: "mark", x: best.x, y: best.y, r: best.r, kind: "hit" });

      // 서버에 "나 맞췄어!" 라고 알림 -> 서버가 인정해야 점수가 오름
      const rid = window.__roomId || "abc";
      claimSpot(rid, best.id);
    } else {
      // [오답]
      // X 표시 그리기
      draw({ x: ux, y: uy, r: 10, kind: "miss" });
      sendRT({ t: "mark", x: ux, y: uy, r: 10, kind: "miss" });

      // ★ 3초 뒤 X표시만 지우기 (화면 전체 지우고 정답들 복구)
      setTimeout(() => {
        setHits((prevHits) => {
          redrawHits(prevHits); // 현재까지 찾은 정답들 다시 그리기
          return prevHits;
        });
      }, 3000);
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

        {/* 점수 표시 */}
        <span style={{ marginLeft: "auto" }}>
          점수: <b style={{ fontSize: "1.3em", color: "#6aa3ff" }}>{myScore}</b>
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
          />
        ) : (
          <div style={{ opacity: 0.7 }}>이미지 대기… (Join → 준비)</div>
        )}
      </div>
    </div>
  );
}
