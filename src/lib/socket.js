import { io } from "socket.io-client";
import { BACKEND_URL } from "./config";
import { setMyId, setPeerId, maybeStartCall, initRTCSignal } from "./rtc";

export const sock = io(BACKEND_URL, {
  transports: ["websocket"],
  withCredentials: false,
});

initRTCSignal();

// 방 입장
export function joinRoom(roomId, name) {
  window.__roomId = roomId;
  sock.emit("join", { roomId, name });
}

// ready
export function sendReady(roomId) {
  sock.emit("ready", { roomId });
}

// ★ 수정된 부분: spotIdx -> spotId 로 변경
export function claimSpot(roomId, spotId) {
  // 서버가 받는 이름(spotId)과 똑같이 맞춰줍니다.
  sock.emit("claim", { roomId, spotId });
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
  // roster 정보가 있으면 처리
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
