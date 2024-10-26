const socket = io("https://voicechat-3069ffcc60b2.herokuapp.com", {
  transports: ["websocket"] // Enforce WebSocket-only transport
});

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
    console.log("Microphone access granted. Local stream:", localStream);

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
  console.log(isMuted ? "Microphone muted" : "Microphone unmuted");
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
    console.log("Emitting join event to server");
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
  console.log(`Received signal from ${from}:`, signal);

  if (!peerConnections[from]) {
    console.log("Setting up new peer connection for user:", from);
    await setupPeerConnection(from);
  }

  const peerConnection = peerConnections[from];

  if (signal.type === "offer") {
    console.log("Received offer from", from);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    console.log("Sending answer to", from);
    socket.emit("signal", { to: from, signal: answer });
  } else if (signal.type === "answer") {
    console.log("Received answer from", from);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
  } else if (signal.candidate) {
    console.log("Received ICE candidate from", from);
    await peerConnection.addIceCandidate(new RTCIceCandidate(signal));
    console.log("Added ICE candidate for", from);
  }
});

// Setup a new RTCPeerConnection for a user
async function setupPeerConnection(id) {
  console.log("Creating RTCPeerConnection for", id);
  const peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  peerConnections[id] = peerConnection;

  // Send ICE candidates to peers
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("Sending ICE candidate to", id);
      socket.emit("signal", { to: id, signal: event.candidate });
    } else {
      console.log("All ICE candidates sent for", id);
    }
  };

  // Play the remote stream when received
  peerConnection.ontrack = (event) => {
    console.log("Received remote track from", id);
    const remoteAudio = document.createElement("audio");
    remoteAudio.srcObject = event.streams[0];
    remoteAudio.autoplay = true;
    document.body.appendChild(remoteAudio);
    console.log("Playing remote audio for", id);
  };

  // Add local stream to the peer connection
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
      console.log("Added local track to peer connection for", id);
    });
  } else {
    console.error("Local stream not available when setting up peer connection.");
  }

  // Create an offer to connect with the peer
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  console.log("Sending offer to", id);
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
