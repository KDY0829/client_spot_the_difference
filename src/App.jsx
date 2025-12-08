import { useState } from "react";
import SpotGame from "./components/SpotGame";
import { joinRoom } from "./lib/socket";
import "./App.css";

export default function App() {
  const [room, setRoom] = useState(localStorage.getItem("roomId") || "abc");
  const [nick, setNick] = useState(localStorage.getItem("nick") || "");

  const doJoin = () => {
    if (!room.trim()) return;
    const r = room.trim();
    const n = nick.trim() || "Player";
    localStorage.setItem("roomId", r);
    localStorage.setItem("nick", n);
    joinRoom(r, n);
  };

  return (
    <div className="app">
      <div
        className="app__topbar"
        style={{ display: "flex", gap: 8, alignItems: "center" }}
      >
        <input
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          placeholder="Room"
          style={{
            padding: "6px 8px",
            border: "1px solid var(--border)",
            borderRadius: 6,
            width: 120,
          }}
        />
        <input
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          placeholder="Nickname"
          style={{
            padding: "6px 8px",
            border: "1px solid var(--border)",
            borderRadius: 6,
            width: 140,
          }}
        />
        <button onClick={doJoin}>Join</button>
      </div>

      <header className="app__header">
        <h1>틀린그림찾기</h1>
      </header>

      <main className="app__main">
        <SpotGame />
      </main>

      <footer className="app__footer">Vite + React</footer>
    </div>
  );
}
