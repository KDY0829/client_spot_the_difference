import React, { useEffect, useRef, useState } from "react";
import { sock, sendReady, claimSpot } from "../lib/socket";
import { sendRT, onRT } from "../lib/rtc";

export default function SpotGame() {
  // ---- 게임 상태 ----
  const [phase, setPhase] = useState("idle"); // idle | ready | countdown | playing
  const [count, setCount] = useState(null);
  const [myId, setMyId] = useState(null);

  // ---- 라운드 데이터 ----
  const [imgs, setImgs] = useState(null); // { left, right }
  const [base, setBase] = useState({ w: 467, h: 514 }); // 서버 start에서 갱신
  const [spots, setSpots] = useState([]); // [{id, side, x, y, r}, ...]
  const [endsAt, setEndsAt] = useState(null); // ★ 라운드 종료 시각(ms)

  // ---- 진행/점수 ----
  const [hits, setHits] = useState([]); // 확정 잠금 목록(spot id)
  const [scores, setScores] = useState({}); // { socketId: count }
  const [result, setResult] = useState(null); // { scores, winners, reason }

  // ---- 로비/명단 & 에러 ----
  const [roster, setRoster] = useState([]);
  const [roomError, setRoomError] = useState(null);

  // ---- 캔버스/스테이지 ----
  const stageRef = useRef(null);
  const leftCanvasRef = useRef(null);
  const rightCanvasRef = useRef(null);

  // ---- 프리로딩 / 중복 클릭 방지 ----
  const [assetsReady, setAssetsReady] = useState(false);
  const clickBlockUntilRef = useRef(0);

  // 내 소켓 ID + 로스터 구독
  useEffect(() => {
    const onJoined = (p) => {
      setMyId(p.you);
      setRoster(p.roster?.players || []);
    };
    const onPeerJoined = (p) => setRoster(p.roster?.players || []);
    const onPeerLeft = (p) => {
      setRoster(p.roster?.players || []);
      // 게임 중 상대가 나가면 UI를 idle로 돌리고 안내
      if (phase === "playing" || phase === "countdown") {
        setResult({ scores, winners: [], reason: "peer-left" });
        setPhase("idle");
      }
    };
    const onFull = () => setRoomError("이 방은 정원이 가득 찼습니다.");

    sock.on("joined", onJoined);
    sock.on("peer-joined", onPeerJoined);
    sock.on("peer-left", onPeerLeft);
    sock.on("room-full", onFull);
    return () => {
      sock.off("joined", onJoined);
      sock.off("peer-joined", onPeerJoined);
      sock.off("peer-left", onPeerLeft);
      sock.off("room-full", onFull);
    };
  }, [phase, scores]);

  // 라운드 시작 수신 → 데이터 세팅 + 프리로딩 + 카운트다운 + 타이머
  useEffect(() => {
    const onStart = async ({ images, spots, startsAt, endsAt, base: b }) => {
      setImgs(images);
      setSpots(spots);
      setEndsAt(endsAt || null);
      if (b?.w && b?.h) setBase(b);
      setHits([]);
      setScores({});
      setResult(null);
      setAssetsReady(false);
      setPhase("countdown");

      // 캔버스 초기화
      const L = leftCanvasRef.current,
        R = rightCanvasRef.current;
      if (L && R) {
        L.width = b?.w || base.w;
        L.height = b?.h || base.h;
        R.width = b?.w || base.w;
        R.height = b?.h || base.h;
        L.getContext("2d").clearRect(0, 0, L.width, L.height);
        R.getContext("2d").clearRect(0, 0, R.width, R.height);
      }

      // ★ 이미지 프리로딩
      await preloadImages([images.left, images.right]);
      setAssetsReady(true);

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
  }, [base.w, base.h]);

  // 라운드 종료 수신(타임아웃/모두 락/퇴장)
  useEffect(() => {
    const onOver = ({ scores, winners, reason }) => {
      setResult({ scores, winners, reason });
      setPhase("idle");
    };
    sock.on("round-over", onOver);
    return () => sock.off("round-over", onOver);
  }, []);

  // 서버 lock 수신 → 확정표시 및 스코어 갱신
  useEffect(() => {
    const onLock = ({ spotIdx, scores }) => {
      setHits((prev) => (prev.includes(spotIdx) ? prev : [...prev, spotIdx]));
      if (scores) setScores(scores);

      const s = spots.find((v) => v.id === spotIdx);
      if (s) {
        drawMark("L", { x: s.x, y: s.y, r: s.r, kind: "lock" });
        drawMark("R", { x: s.x, y: s.y, r: s.r, kind: "lock" });
      }
    };
    sock.on("lock", onLock);
    return () => sock.off("lock", onLock);
  }, [spots]);

  // RT 수신 → 마커 동기화
  useEffect(() => {
    onRT((msg) => {
      if (msg.t === "mark") {
        drawMark(msg.side, { x: msg.x, y: msg.y, r: msg.r, kind: msg.kind });
      }
    });
  }, []);

  // 이미지/베이스 바뀔 때 캔버스 픽셀 사이즈 맞추고 클리어
  useEffect(() => {
    const L = leftCanvasRef.current,
      R = rightCanvasRef.current;
    if (!L || !R) return;
    L.width = base.w;
    L.height = base.h;
    R.width = base.w;
    R.height = base.h;
    L.getContext("2d").clearRect(0, 0, base.w, base.h);
    R.getContext("2d").clearRect(0, 0, base.w, base.h);
  }, [imgs, base]);

  // ====== 포인터/터치 통합 처리 ======
  const handlePointer = (clientX, clientY) => {
    if (phase !== "playing" || !stageRef.current || !assetsReady) return;

    // 디바운스
    const now = performance.now();
    if (now < clickBlockUntilRef.current) return;
    clickBlockUntilRef.current = now + 160;

    const rect = stageRef.current.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    const side = localX < rect.width / 2 ? "L" : "R";
    const halfW = rect.width / 2;
    const xInPane = side === "L" ? localX : localX - halfW;
    const yInPane = localY;

    const scaleX = base.w / halfW;
    const scaleY = base.h / rect.height;
    const ux = Math.round(xInPane * scaleX);
    const uy = Math.round(yInPane * scaleY);

    // 가장 가까운 스팟
    let best = null,
      bestD = Infinity;
    for (const s of spots) {
      if (s.side !== side) continue;
      const dx = s.x - ux,
        dy = s.y - uy;
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }

    if (best && bestD <= best.r) {
      drawMark(side, { x: best.x, y: best.y, r: best.r, kind: "hit" });
      sendRT({ t: "mark", side, x: best.x, y: best.y, r: best.r, kind: "hit" });
      const rid = window.__roomId || "abc";
      claimSpot(rid, best.id);
    } else {
      drawMark(side, { x: ux, y: uy, r: 10, kind: "miss" });
      sendRT({ t: "mark", side, x: ux, y: uy, r: 10, kind: "miss" });
    }
  };

  const handleClick = (e) => handlePointer(e.clientX, e.clientY);
  const handleTouch = (e) => {
    if (!e.touches || e.touches.length === 0) return;
    const t = e.touches[0];
    handlePointer(t.clientX, t.clientY);
  };

  // 마커 그리기
  function drawMark(side, { x, y, r, kind = "miss" } = {}) {
    const cvs = side === "L" ? leftCanvasRef.current : rightCanvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    ctx.save();
    ctx.lineWidth = 3;

    if (kind === "hit") {
      ctx.strokeStyle = "#3BE37F"; // 녹색 원
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (kind === "lock") {
      ctx.strokeStyle = "#FFD166"; // 노란 확정 링
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // miss
      ctx.strokeStyle = "#FF5E57"; // 빨간 X
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

  const totalAnswers = new Set(spots.map((s) => s.id)).size;
  const myScore = scores && myId ? scores[myId] || 0 : 0;

  // 남은 시간 표시
  const [leftSec, setLeftSec] = useState(null);
  useEffect(() => {
    if (!endsAt) {
      setLeftSec(null);
      return;
    }
    const tick = () =>
      setLeftSec(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [endsAt]);

  return (
    <div>
      {/* 상단 컨트롤 바 + 로비 표시 */}
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
          onClick={() => {
            const rid = window.__roomId || "abc";
            sendReady(rid);
            setPhase("ready");
          }}
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
              const rid = window.__roomId || "abc";
              sendReady(rid);
              setPhase("ready");
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
          정답 {hits.length}/{totalAnswers || 0}
        </span>
        <span style={{ opacity: 0.8 }}>
          &nbsp;· 참가자:{" "}
          {roster
            .map((p) => p.name || (p.id === myId ? "나" : p.id.slice(0, 4)))
            .join(" , ") || "-"}
        </span>
        {roomError && <span style={{ color: "#ff6b6b" }}>{roomError}</span>}
      </div>

      {/* 게임 스테이지 */}
      <div
        ref={stageRef}
        onClick={handleClick}
        onTouchStart={handleTouch}
        style={{
          width: "100%",
          maxWidth: 960,
          margin: "0 auto",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 12,
          background: "#0e1320",
          touchAction: "none", // ★ 터치 스크롤/줌 방지
          userSelect: "none",
        }}
      >
        {!assetsReady && phase !== "idle" && (
          <div style={{ textAlign: "center", padding: 12, opacity: 0.8 }}>
            이미지 불러오는 중…
          </div>
        )}

        <figure
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            margin: 0,
          }}
        >
          {imgs ? (
            <>
              <div style={{ position: "relative" }}>
                <img
                  src={imgs.left}
                  alt=""
                  style={{ width: "100%", height: "auto", borderRadius: 8 }}
                />
                <canvas
                  ref={leftCanvasRef}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                  }}
                />
              </div>
              <div style={{ position: "relative" }}>
                <img
                  src={imgs.right}
                  alt=""
                  style={{ width: "100%", height: "auto", borderRadius: 8 }}
                />
                <canvas
                  ref={rightCanvasRef}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                  }}
                />
              </div>
            </>
          ) : (
            <div style={{ gridColumn: "1/3", opacity: 0.7 }}>
              이미지 로딩 대기… (상단에서 Join & 준비)
            </div>
          )}
        </figure>

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
            <div>
              우승:{" "}
              {result.winners?.includes(myId)
                ? "나"
                : result.winners && result.winners.length
                ? "상대"
                : "없음"}
              {result.winners && result.winners.length > 1 ? " (동점)" : ""}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== util: 이미지 프리로딩 =====
function preloadImages(urls) {
  return Promise.all(
    urls.map(
      (src) =>
        new Promise((res, rej) => {
          const img = new Image();
          img.onload = () => res(src);
          img.onerror = rej;
          img.src = src;
        })
    )
  );
}
