import { useState } from "react";
import SpotGame from "./components/SpotGame";
import { joinRoom } from "./lib/socket";
import "./App.css";

export default function App() {
  // 로컬 스토리지에 저장된 값이 있으면 불러오기
  const [room, setRoom] = useState(localStorage.getItem("roomId") || "room1");
  const [nick, setNick] = useState(localStorage.getItem("nick") || "");

  const doJoin = () => {
    if (!room.trim()) {
      alert("방 이름을 입력해주세요!");
      return;
    }
    const r = room.trim();
    const n = nick.trim() || "Player"; // 닉네임 없으면 Player로 설정

    // 다음 접속을 위해 저장
    localStorage.setItem("roomId", r);
    localStorage.setItem("nick", n);

    // 서버에 입장 요청 (socket.js의 joinRoom 함수)
    joinRoom(r, n);
  };

  return (
    <div className="app">
      {/* 상단 컨트롤 바 */}
      <div
        className="app__topbar"
        style={{ display: "flex", gap: 8, alignItems: "center" }}
      >
        <input
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          placeholder="Room Name"
          style={{
            padding: "8px 10px",
            border: "1px solid var(--border)",
            background: "#1a2030",
            color: "white",
            borderRadius: 6,
            width: 120,
          }}
        />
        <input
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          placeholder="Nickname"
          style={{
            padding: "8px 10px",
            border: "1px solid var(--border)",
            background: "#1a2030",
            color: "white",
            borderRadius: 6,
            width: 140,
          }}
        />
        <button
          onClick={doJoin}
          style={{
            background: "#6aa3ff",
            color: "white",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Join
        </button>
      </div>

      <header className="app__header">
        <h1>틀린그림찾기 (WebRTC)</h1>
      </header>

      <main className="app__main">
        {/* 게임 컴포넌트 렌더링 */}
        <SpotGame />
      </main>

      <footer className="app__footer">Real-time Spot the Difference</footer>
    </div>
  );
}
