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

  // ★ 참여자 목록 상태
  const [players, setPlayers] = useState([]);

  const [spots, setSpots] = useState([]);
  const spotsRef = useRef([]);

  const [hits, setHits] = useState([]);
  const [scores, setScores] = useState({});
  const [result, setResult] = useState(null);
  const [leftSec, setLeftSec] = useState(null);

  const drawRef = useRef(null);
  const draw = (op) => drawRef.current && drawRef.current(op);
  const registerDraw = (fn) => (drawRef.current = fn);

  // 화면 갱신
  const redrawHits = (currentHits) => {
    draw({ type: "clear" });
    currentHits.forEach((spotId) => {
      const s = spotsRef.current.find((v) => v.id === spotId);
      if (s) draw({ x: s.x, y: s.y, r: s.r, kind: "lock" });
    });
  };

  // ★ 참여자 목록(roster) 수신
  useEffect(() => {
    const handleRoster = (data) => {
      if (data.roster && data.roster.players) {
        setPlayers(data.roster.players);
      }
    };
    sock.on("joined", handleRoster);
    sock.on("peer-joined", handleRoster);
    sock.on("peer-left", handleRoster);
    return () => {
      sock.off("joined", handleRoster);
      sock.off("peer-joined", handleRoster);
      sock.off("peer-left", handleRoster);
    };
  }, []);

  // 게임 시작
  useEffect(() => {
    const onStart = ({ image, base, spots, startsAt, endsAt }) => {
      setImage(image);
      if (base?.w) setBase(base);

      const toPx = (s) => ({
        id: s.id, // ★ ID가 여기서 매핑됩니다.
        x: Math.round(s.nx * base.w),
        y: Math.round(s.ny * base.h),
        r: Math.round(s.nr * base.w),
      });

      const pxSpots = (spots || []).map(toPx);
      setSpots(pxSpots);
      spotsRef.current = pxSpots;

      setPhase("countdown");
      setHits([]);
      setScores({});
      setResult(null);
      setEndsAt(endsAt);

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

  // 정답(lock) 수신
  useEffect(() => {
    const onLock = ({ spotId, scores }) => {
      if (scores) setScores(scores);

      setHits((prev) => {
        if (prev.includes(spotId)) return prev;
        const next = [...prev, spotId];

        const s = spotsRef.current.find((v) => v.id === spotId);
        if (s) draw({ x: s.x, y: s.y, r: s.r, kind: "lock" });

        return next;
      });
    };
    sock.on("lock", onLock);
    return () => sock.off("lock", onLock);
  }, []);

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
      if (msg.t === "mark") draw({ ...msg });
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
    const rid = window.__roomId || localStorage.getItem("roomId");
    if (!rid) {
      alert("방 이름이 없습니다. 새로고침 후 다시 Join 해주세요.");
      return;
    }
    sendReady(rid);
    setPhase("ready");
  };

  const handleClick = (ux, uy) => {
    if (phase !== "playing") return;

    let best = null,
      bestD = Infinity;
    for (const s of spotsRef.current) {
      const d = Math.hypot(s.x - ux, s.y - uy);
      if (!hits.includes(s.id) && d < bestD) {
        bestD = d;
        best = s;
      }
    }

    if (best && bestD <= best.r) {
      // [정답]
      if (best.id) {
        // ID가 있을 때만 전송
        draw({ x: best.x, y: best.y, r: best.r, kind: "hit" });
        sendRT({ t: "mark", x: best.x, y: best.y, r: best.r, kind: "hit" });

        const rid = window.__roomId || localStorage.getItem("roomId");
        claimSpot(rid, best.id);
      } else {
        console.error("ID가 없는 스팟을 클릭했습니다:", best);
      }
    } else {
      // [오답]
      draw({ x: ux, y: uy, r: 10, kind: "miss" });
      sendRT({ t: "mark", x: ux, y: uy, r: 10, kind: "miss" });

      setTimeout(() => {
        setHits((prev) => {
          redrawHits(prev);
          return prev;
        });
      }, 3000);
    }
  };

  const myId = sock.id;
  const myScore = scores && myId ? scores[myId] || 0 : 0;
  const total = spots.length;

  return (
    <div>
      {/* ★ 참여자 명단 표시 */}
      <div
        style={{
          background: "#1a2030",
          padding: "8px 12px",
          borderRadius: 8,
          marginBottom: 10,
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: "0.95rem",
        }}
      >
        <span style={{ color: "#aaa" }}>참여자:</span>
        {players.length > 0 ? (
          players.map((p) => (
            <span
              key={p.id}
              style={{
                background: p.id === myId ? "#6aa3ff" : "#273043",
                color: p.id === myId ? "#fff" : "#ccc",
                padding: "4px 8px",
                borderRadius: 4,
                fontWeight: p.id === myId ? "bold" : "normal",
              }}
            >
              {p.name} {p.id === myId ? "(나)" : ""}
            </span>
          ))
        ) : (
          <span style={{ color: "#666" }}>접속 중...</span>
        )}
      </div>

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

        <span style={{ marginLeft: "auto", fontSize: "1.1em" }}>
          점수: <b style={{ color: "#6aa3ff" }}>{myScore}</b>
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
          <div style={{ opacity: 0.7 }}>이미지 대기 중... (Join → 준비)</div>
        )}
      </div>
    </div>
  );
}
