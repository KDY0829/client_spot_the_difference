// client/src/lib/rtc.js
import { emitSignal, onSignal } from "./socket";

export let MY_ID = null;
export let PEER_ID = null;
export function setMyId(id) {
  MY_ID = id;
}
export function setPeerId(id) {
  PEER_ID = id;
}

let pc;
let dc; // reliable
let dcRT; // real-time

export function createPeer() {
  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  pc.onicecandidate = (e) => {
    if (e.candidate && PEER_ID) {
      emitSignal(PEER_ID, { type: "candidate", candidate: e.candidate });
    }
  };

  pc.ondatachannel = (e) => {
    if (e.channel.label === "game-rt") {
      dcRT = e.channel;
      wireRT(dcRT);
    } else {
      dc = e.channel;
      wireDC(dc);
    }
  };
}

export async function maybeStartCall() {
  if (!MY_ID || !PEER_ID) return;
  if (!pc) createPeer();
  if (MY_ID < PEER_ID) {
    await callPeer(PEER_ID);
  }
}

export async function callPeer(peerId) {
  if (!pc) createPeer();

  dcRT = pc.createDataChannel("game-rt", { ordered: false, maxRetransmits: 0 });
  wireRT(dcRT);

  dc = pc.createDataChannel("game-reliable");
  wireDC(dc);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  emitSignal(peerId, { type: "offer", sdp: offer.sdp });
}

// ✅ 중요: 모듈 로드시 바로 등록하지 말고, 초기화 함수로 내보낸다
export function initRTCSignal() {
  onSignal(async (from, data) => {
    if (!pc) createPeer();
    if (data.type === "offer") {
      await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      emitSignal(from, { type: "answer", sdp: answer.sdp });
    } else if (data.type === "answer") {
      await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
    } else if (data.type === "candidate" && data.candidate) {
      try {
        await pc.addIceCandidate(data.candidate);
      } catch (e) {
        console.warn(e);
      }
    }
  });
}

function wireDC(ch) {
  ch.onopen = () => console.log("[dc] open");
  ch.onclose = () => console.log("[dc] close");
  ch.onmessage = (e) => {
    if (typeof window.__onReliable === "function") window.__onReliable(e.data);
  };
}
function wireRT(ch) {
  ch.onopen = () => console.log("[rt] open");
  ch.onclose = () => console.log("[rt] close");
  ch.onmessage = (e) => {
    if (typeof window.__onRT === "function") window.__onRT(e.data);
  };
}

export function onReliable(fn) {
  window.__onReliable = (raw) => fn(JSON.parse(raw));
}
export function sendReliable(msg) {
  if (dc && dc.readyState === "open") dc.send(JSON.stringify(msg));
}
export function onRT(fn) {
  window.__onRT = (raw) => fn(JSON.parse(raw));
}
export function sendRT(msg) {
  if (dcRT && dcRT.readyState === "open") dcRT.send(JSON.stringify(msg));
}
