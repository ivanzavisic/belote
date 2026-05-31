import { io } from "socket.io-client";
import { appState } from "./state.svelte.js";
import { recordWin } from "./firebase.js";

const SERVER_URL = import.meta.env.DEV ? "http://localhost:3001" : "";
const socket = io(SERVER_URL, { autoConnect: false });

socket.on("connect", () => {
  appState.connected = true;
  console.log("Spojeno na server");
});

socket.on("disconnect", () => {
  appState.connected = false;
  console.log("Odspojeno sa servera");
  // If we were in room/game and lost connection, go back to login
  if (appState.screen !== "login") {
    appState.screen = "login";
    appState.currentRoom = null;
    appState.gameState = null;
  }
});

socket.on("welcome", (data) => {
  appState.user.id = data.playerId;
  appState.onlineCount = data.onlineCount;
  appState.screen = "lobby";
});

socket.on("onlineCount", (count) => {
  appState.onlineCount = count;
});

socket.on("roomList", (rooms) => {
  appState.rooms = rooms;
});

socket.on("roomUpdate", (room) => {
  appState.currentRoom = room;
});

socket.on("roomClosed", () => {
  appState.currentRoom = null;
  appState.gameState = null;
  appState.screen = "lobby";
});

socket.on("gameStart", (state) => {
  appState.gameState = state;
  appState.screen = "game";
});

socket.on("gameUpdate", (state) => {
  appState.gameState = state;
});

socket.on("playerAction", (data) => {
  appState.lastPlayerAction = data;
});

socket.on("belotPrompt", () => {
  appState.belotPrompt = true;
});

socket.on("newRoundDealing", () => {
  appState.isDealing = true;
});

socket.on("gameOver", (state) => {
  appState.gameState = state;
});

socket.on("backToRoom", (room) => {
  appState.currentRoom = room;
  appState.gameState = null;
  appState.rematchInfo = null;
  appState.screen = "room";
});

socket.on("gameAbandoned", (data) => {
  // Record win for opponents
  if (data.result === "win" && appState.firebaseUser && !appState.isGuest) {
    recordWin(appState.firebaseUser.uid).catch(() => {});
  }
  appState.abandonInfo = data;
  appState.gameState = null;
  appState.screen = "lobby";
  appState.currentRoom = null;
});

socket.on("error", (msg) => {
  appState.error = msg;
  setTimeout(() => (appState.error = ""), 4000);
});

socket.on("rematchUpdate", (data) => {
  appState.rematchInfo = data;
});

// --- Actions ---

export function login(nickname, avatarId, firebaseUid) {
  appState.user.nickname = nickname;
  appState.user.avatarId = avatarId;
  socket.connect();
  socket.emit("login", {
    nickname,
    avatarId,
    firebaseUid: firebaseUid || null,
  });
}

export function createRoom(name, settings) {
  socket.emit("createRoom", { name, settings });
}

export function joinRoom(roomId) {
  socket.emit("joinRoom", roomId);
}

export function leaveRoom() {
  socket.emit("leaveRoom");
}

export function addBot() {
  socket.emit("addBot");
}

export function removePlayer(index) {
  socket.emit("removePlayer", index);
}

export function swapPlayers(fromIndex, toIndex) {
  socket.emit("swapPlayers", { from: fromIndex, to: toIndex });
}

export function startGame() {
  socket.emit("startGame");
}

export function bid(suit) {
  socket.emit("bid", suit);
}

export function playCard(card) {
  socket.emit("playCard", card);
}

export function respondBelot(accept) {
  socket.emit("belotResponse", accept);
}

export function declareZvanja(declares) {
  socket.emit("declareZvanja", declares);
}

export function nextRound() {
  socket.emit("nextRound");
}

export function backToLobby() {
  socket.emit("backToLobby");
}

export function abandonGame() {
  socket.emit("abandonGame");
}

export function rematchReady() {
  socket.emit("rematchReady");
}

export function rematchStart() {
  socket.emit("rematchStart");
}

export default socket;
