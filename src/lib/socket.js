import { io } from "socket.io-client";
import { BACKEND_URL } from "./config";
import { setMyId, setPeerId, maybeStartCall, initRTCSignal } from "./rtc";

export const sock = io(BACKEND_URL);

initRTCSignal();

// 방 입장
export function joinRoom(roomId, name) {
  window.__roomId = roomId;
  sock.emit("join", { roomId, name });
}

// ready / claim
export function sendReady(roomId) {
  sock.emit("ready", { roomId });
}
export function claimSpot(roomId, spotIdx) {
  sock.emit("claim", { roomId, spotIdx });
}

// WebRTC 시그널 래퍼
export function emitSignal(to, data) {
  sock.emit("signal", { to, data });
}
export function onSignal(fn) {
  sock.on("signal", ({ from, data }) => fn(from, data));
}

// 로스터/ID 연동 & 핸드셰이크
sock.on("joined", (p) => {
  setMyId(p.you);
  const others = (p.roster?.players || [])
    .map((v) => v.id)
    .filter((id) => id !== p.you);
  if (others[0]) {
    setPeerId(others[0]);
    maybeStartCall();
  }
});

sock.on("peer-joined", (p) => {
  setPeerId(p.peer);
  maybeStartCall();
});
