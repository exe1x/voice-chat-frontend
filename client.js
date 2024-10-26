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
    console.log("Local stream obtained.");
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

// Join the chat and initiate the local stream
function joinChat() {
  getLocalStream().then(() => {
    status.textContent = "Connected";
    socket.emit("join", "Joining the voice chat");

    // Enable the mute button
    muteButton.disabled = false;
    joinButton.disabled = true;
    console.log("Joining the chat and signaling server.");
  });
}

// Handle WebSocket connection event (for signaling)
socket.on("connect", () => {
  console.log("Connected to signaling server.");
});

// Handle WebRTC signaling through Socket.io
socket.on("signal", async ({ from, signal }) => {
  console.log("Received signal from", from);

  if (!peerConnections[from]) {
    console.log("Creating new RTCPeerConnection for", from);
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }] // STUN server for NAT traversal
    });
    peerConnections[from] = peerConnection;

    // Set up ICE candidate handling
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("Sending ICE candidate to", from);
        socket.emit("signal", { to: from, signal: event.candidate });
      }
    };

    // Set up track handling to play remote audio
    peerConnection.ontrack = (event) => {
      console.log("Received remote track from", from);
      const audio = document.createElement("audio");
      audio.srcObject = event.streams[0];
      audio.autoplay = true;
      document.body.appendChild(audio);
    };

    // Add local tracks to the peer connection
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

    // Create an offer for new peer connection
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    console.log("Sending offer to", from);
    socket.emit("signal", { to: from, signal: offer });

    // Update status to "Connected!" after WebRTC setup
    status.textContent = "Connected!";
  }

  // Handle received offer and respond with an answer
  if (signal.type === "offer") {
    const peerConnection = peerConnections[from];
    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    console.log("Sending answer to", from);
    socket.emit("signal", { to: from, signal: answer });

    // Update status to "Connected!" after WebRTC setup
    status.textContent = "Connected!";
  }

  // Handle received answer and finalize connection
  else if (signal.type === "answer") {
    const peerConnection = peerConnections[from];
    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
    console.log("Received answer from", from);

    // Update status to "Connected!" after WebRTC setup
    status.textContent = "Connected!";
  }

  // Handle ICE candidate
  else if (signal.candidate) {
    const peerConnection = peerConnections[from];
    await peerConnection.addIceCandidate(new RTCIceCandidate(signal));
    console.log("Added ICE candidate from", from);
  }
});

// Handle user disconnection
socket.on("user-disconnected", (id) => {
  if (peerConnections[id]) {
    peerConnections[id].close();
    delete peerConnections[id];
    status.textContent = "A user has disconnected";
    console.log("Disconnected from", id);
  }
});
