const socket = io("https://voicechat-3069ffcc60b2.herokuapp.com");
let localStream;
let peerConnections = {};

// HTML elements
const status = document.getElementById("status");
const joinButton = document.getElementById("joinButton");
const muteButton = document.getElementById("muteButton");

let isMuted = true;

// Get audio stream from the user's microphone
async function getLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Play the local audio stream to ensure the mic works
    const localAudio = document.createElement("audio");
    localAudio.srcObject = localStream;
    localAudio.autoplay = true;
    localAudio.muted = true; // Avoid feedback loop with your own mic
    document.body.appendChild(localAudio);

    muteMicrophone(true); // Start with mic muted
    console.log("Local stream obtained.");
  } catch (err) {
    console.error("Error accessing microphone:", err);
    status.textContent = "Microphone access denied.";
  }
}

// Mute/Unmute microphone
function toggleMicrophone() {
  isMuted = !isMuted;
  muteMicrophone(isMuted);
}

// Helper function to mute/unmute the microphone
function muteMicrophone(mute) {
  if (localStream) {
    localStream.getTracks().forEach((track) => (track.enabled = !mute));
    muteButton.textContent = mute ? "Unmute" : "Mute";
    status.textContent = mute ? "You are muted." : "You are live!";
  }
}

// Join chat and signal the server
function joinChat() {
  getLocalStream().then(() => {
    status.textContent = "Connecting to voice chat...";
    socket.emit("join");

    muteButton.disabled = false;
    joinButton.disabled = true;
  }).catch((err) => {
    console.error("Failed to join chat:", err);
  });
}

// Handle new WebSocket connection
socket.on("connect", () => {
  console.log("Connected to signaling server.");
  status.textContent = "Connected to server.";
});

// Handle incoming signaling messages
socket.on("signal", async ({ from, signal }) => {
  if (!peerConnections[from]) {
    await setupPeerConnection(from);
  }

  const peerConnection = peerConnections[from];

  if (signal.type === "offer") {
    console.log("Handling offer from", from);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit("signal", { to: from, signal: answer });
  } else if (signal.type === "answer") {
    console.log("Handling answer from", from);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
  } else if (signal.candidate) {
    console.log("Adding ICE candidate from", from);
    await peerConnection.addIceCandidate(new RTCIceCandidate(signal));
  }
});

// Setup a new RTCPeerConnection for a user
async function setupPeerConnection(id) {
  const peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  peerConnections[id] = peerConnection;

  // Send ICE candidates to peers
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal", { to: id, signal: event.candidate });
    }
  };

  // Play the remote stream when received
  peerConnection.ontrack = (event) => {
    const remoteAudio = document.createElement("audio");
    remoteAudio.srcObject = event.streams[0];
    remoteAudio.autoplay = true;
    document.body.appendChild(remoteAudio);
  };

  // Add local stream to the peer connection
  if (localStream) {
    localStream.getTracks().forEach((track) =>
      peerConnection.addTrack(track, localStream)
    );
  } else {
    console.error("Local stream not available.");
  }

  // Create an offer to connect with the peer
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit("signal", { to: id, signal: offer });
}

// Handle user disconnection
socket.on("user-disconnected", (id) => {
  if (peerConnections[id]) {
    peerConnections[id].close();
    delete peerConnections[id];
    console.log(`User ${id} disconnected.`);
  }
});