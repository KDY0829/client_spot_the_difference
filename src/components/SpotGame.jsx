// client/src/components/SpotGame.jsx
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

  const [hits, setHits] = useState([]); // 확정된 spot ID 목록
  const [scores, setScores] = useState({});
  const [result, setResult] = useState(null);
  const [leftSec, setLeftSec] = useState(null);

  const drawRef = useRef(null);
  const draw = (op) => drawRef.current && drawRef.current(op);
  const registerDraw = (fn) => (drawRef.current = fn);

  // ★ 헬퍼 함수: 화면 싹 지우고 정답(hits)만 다시 그리기
  const redrawHits = (currentHits) => {
    // 1. 싹 지우기
    draw({ type: "clear" });
    // 2. 확정된 정답들 다시 그리기
    currentHits.forEach((spotId) => {
      const s = spots.find((v) => v.id === spotId);
      if (s) draw({ x: s.x, y: s.y, r: s.r, kind: "lock" });
    });
  };

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
      // ★ 중요: 서버 데이터로 spots 덮어쓰기
      const newSpots = (spots || []).map(toPx);
      setSpots(newSpots);

      setPhase("countdown");
      setHits([]);
      setScores({});
      setResult(null);
      setEndsAt(endsAt);

      // (재시작 시 캔버스 초기화)
      draw({ type: "clear" });

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

  // ★ 점수/정답 수신
  useEffect(() => {
    const onLock = ({ spotId, scores }) => {
      // 1. 점수 업데이트
      if (scores) setScores(scores);

      // 2. 내 화면 확정 목록(hits)에 추가
      setHits((prev) => {
        if (prev.includes(spotId)) return prev;
        const next = [...prev, spotId];
        // 3. 화면에 노란색 Lock 그리기
        const s = spots.find((v) => v.id === spotId);
        if (s) draw({ x: s.x, y: s.y, r: s.r, kind: "lock" });
        return next;
      });
    };
    sock.on("lock", onLock);
    return () => sock.off("lock", onLock);
  }, [spots]); // spots가 로드된 후 실행되어야 함

  useEffect(() => {
    const onOver = ({ scores, winners, reason }) => {
      setResult({ scores, winners, reason });
      setPhase("idle");
      setEndsAt(null);
    };
    sock.on("round-over", onOver);
    return () => sock.off("round-over", onOver);
  }, []);

  useEffect(() => {
    onRT((msg) => {
      if (msg.t === "mark") {
        draw({ x: msg.x, y: msg.y, r: msg.r, kind: msg.kind });
      }
    });
  }, []);

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

    let best = null,
      bestD = Infinity;

    // 가장 가까운 스팟 찾기
    for (const s of spots) {
      const d = Math.hypot(s.x - ux, s.y - uy);
      // 이미 찾은건 제외하고 계산
      if (!hits.includes(s.id) && d < bestD) {
        bestD = d;
        best = s;
      }
    }

    if (best && bestD <= best.r) {
      // [정답]
      // 1. 즉시 초록색 그리기
      draw({ x: best.x, y: best.y, r: best.r, kind: "hit" });
      sendRT({ t: "mark", x: best.x, y: best.y, r: best.r, kind: "hit" });

      // 2. 서버에 정답 요청 (여기가 핵심!)
      const rid = window.__roomId || "abc";
      claimSpot(rid, best.id);
    } else {
      // [오답]
      // 1. X 표시 그리기
      draw({ x: ux, y: uy, r: 10, kind: "miss" });
      sendRT({ t: "mark", x: ux, y: uy, r: 10, kind: "miss" });

      // 2. ★ 3초 뒤에 X표시 지우기 (전체 지우고 정답만 다시 그림)
      setTimeout(() => {
        // hits는 state라 클로저 문제 생길 수 있으므로,
        // setState의 콜백이나 현재 시점의 hits를 참조해야 하는데,
        // 여기서는 간단히 redrawHits에 현재 state인 hits를 인자로 넘기는게 불가능(옛날 hits임).
        // 따라서, 그냥 화면을 갱신하는 방식을 씁니다.
        // (가장 정확한 방법: hits State가 바뀔 때마다 화면 갱신이 맞지만, 성능 위해 수동 처리)
        // **수정**: setHits 내부 콜백을 이용할 수 없으니,
        // 리액트 컴포넌트 밖의 변수나 ref를 쓰거나, 그냥 지우고 다시 그립니다.
        // 여기서는 간단히 "현재 시점의 hits"를 가져오기 위해
        // setHits((prev) => { redrawHits(prev); return prev; }) 트릭을 씁니다.
        setHits((prev) => {
          redrawHits(prev);
          return prev;
        });
      }, 3000);
    }
  };

  const total = spots.length;
  // ★ 점수 표기: sock.id를 사용하여 내 점수 정확히 표시
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
          점수: <b style={{ fontSize: "1.2em", color: "#6aa3ff" }}>{myScore}</b>
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

        <div style={{ marginTop: 8, opacity: 0.85 }}>
          {hits.length
            ? `찾은 개수: ${hits.length}`
            : "틀린 그림을 찾아보세요!"}
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
