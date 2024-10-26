// client.js
const socket = io("https://voicechat-3069ffcc60b2.herokuapp.com");
let localStream;
let peerConnections = {};
let isMuted = true;

// Display elements
const status = document.getElementById("status");
const joinButton = document.getElementById("joinButton");
const muteButton = document.getElementById("muteButton");

// Function to get audio from the user's microphone
async function getLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    muteMicrophone(true); // Start with mic muted
  } catch (err) {
    console.error("Error accessing microphone:", err);
  }
}

// Mute/Unmute microphone
function toggleMicrophone() {
  isMuted = !isMuted;
  muteMicrophone(isMuted);
}

// Helper to mute/unmute
function muteMicrophone(mute) {
  if (localStream) {
    localStream.getTracks().forEach((track) => (track.enabled = !mute));
    muteButton.textContent = mute ? "Unmute" : "Mute";
    status.textContent = mute ? "You are muted" : "You are live!";
  }
}

// Join the chat
function joinChat() {
  getLocalStream().then(() => {
    status.textContent = "Connecting...";
    socket.emit("join", "Joining the voice chat");

    // Enable the mute button
    muteButton.disabled = false;
    joinButton.disabled = true;
    status.textContent = "Connected!";
  });
}

// Handle WebRTC signaling through Socket.io
socket.on("signal", async ({ from, signal }) => {
  if (!peerConnections[from]) {
    const peerConnection = new RTCPeerConnection();
    peerConnections[from] = peerConnection;

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("signal", { to: from, signal: event.candidate });
      }
    };

    peerConnection.ontrack = (event) => {
      const audio = document.createElement("audio");
      audio.srcObject = event.streams[0];
      audio.play();
    };

    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("signal", { to: from, signal: offer });
  }

  if (signal.type === "offer") {
    const peerConnection = peerConnections[from];
    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit("signal", { to: from, signal: answer });
  } else if (signal.type === "answer") {
    await peerConnections[from].setRemoteDescription(new RTCSessionDescription(signal));
  } else if (signal.candidate) {
    await peerConnections[from].addIceCandidate(new RTCIceCandidate(signal));
  }
});

// Handle disconnects
socket.on("user-disconnected", (id) => {
  if (peerConnections[id]) {
    peerConnections[id].close();
    delete peerConnections[id];
    status.textContent = "A user has disconnected";
  }
});
