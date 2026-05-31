import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import {
  createGameState,
  getPlayerView,
  processBid,
  processDeclaration,
  processPlay,
  finishRound,
  startPlaying,
  getTeam,
  checkBelot,
  SUIT_NAMES,
} from "./gameLogic.js";
import { getNextBotName, botBid, botPlay } from "./bot.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// Serve static frontend in production
const distPath = path.join(__dirname, "../dist");
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  next();
});
app.use(express.static(distPath));

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST"],
  },
});

// ---------- State ----------

const players = new Map(); // socketId -> { id, nickname, avatarId, roomId }
const rooms = new Map(); // roomId -> room object
let nextRoomId = 1;

// Prevent server crash on unhandled errors
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT ERROR:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});

// ---------- Helpers ----------

function generateRoomId() {
  return `room_${nextRoomId++}`;
}

function getOnlineCount() {
  return players.size;
}

function broadcastOnlineCount() {
  io.emit("onlineCount", getOnlineCount());
}

function getRoomList() {
  const list = [];
  for (const [id, room] of rooms) {
    list.push({
      id,
      name: room.name,
      hostName: room.players[0]?.nickname || "?",
      hostId: room.hostId,
      playerCount: room.players.length,
      settings: room.settings,
      inGame: !!room.game,
    });
  }
  return list.reverse();
}

function broadcastRoomList() {
  io.emit("roomList", getRoomList());
}

function sendRoomUpdate(room) {
  for (const p of room.players) {
    if (!p.isBot && p.socketId) {
      io.to(p.socketId).emit("roomUpdate", {
        id: room.id,
        name: room.name,
        hostId: room.hostId,
        settings: room.settings,
        players: room.players.map((pl) => ({
          id: pl.id,
          nickname: pl.nickname,
          avatarId: pl.avatarId,
          isBot: pl.isBot,
        })),
      });
    }
  }
}

function sendGameUpdate(room) {
  if (!room.game) return;
  for (let i = 0; i < room.players.length; i++) {
    const p = room.players[i];
    if (!p.isBot && p.socketId) {
      io.to(p.socketId).emit("gameUpdate", getPlayerView(room.game, i));
    }
  }
}

function emitPlayerAction(room, playerIndex, type, text, cards, extra) {
  for (const p of room.players) {
    if (!p.isBot && p.socketId) {
      io.to(p.socketId).emit("playerAction", {
        playerIndex,
        type,
        text,
        cards,
        ...extra,
      });
    }
  }
}

function scheduleBot(room, delay) {
  if (!room.game) return;
  const game = room.game;
  const currentIdx = game.currentPlayer;
  const currentPlayer = room.players[currentIdx];

  if (!currentPlayer || !currentPlayer.isBot) return;

  const actualDelay =
    delay ||
    (game.phase === "BIDDING"
      ? 1200
      : game.phase === "DECLARING_ZVANJA"
        ? 1200
        : 1200);

  setTimeout(() => {
    if (!room.game || room.game !== game) return;

    if (game.phase === "BIDDING") {
      const suit = botBid(game.hands[currentIdx]);
      handleBid(room, currentIdx, suit);
    } else if (game.phase === "DECLARING_ZVANJA") {
      const hasZvanja = game.playerZvanja[currentIdx].length > 0;
      handleDeclaration(room, currentIdx, hasZvanja);
    } else if (game.phase === "PLAYING") {
      const card = botPlay(
        game.hands[currentIdx],
        game.currentTrick,
        game.trump,
        currentIdx,
      );
      handlePlayCard(room, currentIdx, card);
    }
  }, actualDelay);
}

// ---------- Game Flow ----------

function handleBid(room, playerIndex, suit) {
  const game = room.game;
  const result = processBid(game, playerIndex, suit);

  if (result.error) return result.error;

  if (result.action === "REDEAL") {
    // Re-deal with next dealer
    const newDealer = (game.dealer + 1) % 4;
    room.game = createGameState(
      { list: room.players, scores: game.scores },
      game.settings,
      newDealer,
    );
    sendGameUpdate(room);
    scheduleBot(room);
    return null;
  }

  if (result.action === "TRUMP_DECLARED") {
    emitPlayerAction(room, playerIndex, "bid", SUIT_NAMES[suit], null, {
      suit,
    });
    sendGameUpdate(room);
    // Start declaration phase - schedule bot if needed
    scheduleBot(room, 1500);
    return null;
  }

  // NEXT_BID
  emitPlayerAction(room, playerIndex, "pass", "Dalje!");
  sendGameUpdate(room);
  scheduleBot(room);
  return null;
}

function handlePlayCard(room, playerIndex, card) {
  const game = room.game;
  const player = room.players[playerIndex];

  // Pre-check: if bela would be available for a human, prompt BEFORE playing the card
  if (
    !player.isBot &&
    game.phase === "PLAYING" &&
    game.currentPlayer === playerIndex
  ) {
    if (checkBelot(game.hands[playerIndex], card, game.trump)) {
      game.pendingBelotPlay = { playerIndex, card };
      io.to(player.socketId).emit("belotPrompt");
      return null;
    }
  }

  return executePlayCard(room, playerIndex, card);
}

function executePlayCard(room, playerIndex, card) {
  const game = room.game;
  const result = processPlay(game, playerIndex, card);

  if (result.error) return result.error;

  // Handle belot for bots (auto-accept)
  if (result.belotAvailable) {
    const player = room.players[playerIndex];
    if (player && player.isBot) {
      game.belotPoints[getTeam(playerIndex)] += 20;
      emitPlayerAction(room, playerIndex, "belot", "Bela!");
    }
  }

  if (result.action === "NEXT_PLAY") {
    sendGameUpdate(room);
    scheduleBot(room);
    return null;
  }

  if (result.action === "TRICK_DONE") {
    // Check "na dosta" instant win - if a team passes target mid-round
    if (!game.settings.prolaz) {
      const target = game.settings.targetScore;
      for (let t = 0; t < 2; t++) {
        const runningTotal =
          game.scores[t] +
          game.cardPointsWon[t] +
          game.zvanjaPoints[t] +
          game.belotPoints[t];
        if (runningTotal >= target) {
          // Instant win
          game.winner = t;
          game.phase = "GAME_OVER";
          game.scores[0] +=
            game.cardPointsWon[0] + game.zvanjaPoints[0] + game.belotPoints[0];
          game.scores[1] +=
            game.cardPointsWon[1] + game.zvanjaPoints[1] + game.belotPoints[1];
          sendGameUpdate(room);
          return null;
        }
      }
    }
    // Show trick briefly, then clear
    sendGameUpdate(room);
    setTimeout(() => {
      if (room.game !== game) return;
      game.currentTrick = [];
      game.currentPlayer = result.winner;
      sendGameUpdate(room);
      scheduleBot(room);
    }, 800);
    return null;
  }

  if (result.action === "ROUND_OVER") {
    sendGameUpdate(room);
    setTimeout(() => {
      if (room.game !== game) return;
      game.currentTrick = [];
      finishRound(game);
      sendGameUpdate(room);

      // Auto-continue to next round after 3 seconds
      if (game.phase === "ROUND_END") {
        setTimeout(() => {
          if (room.game === game && game.phase === "ROUND_END") {
            startNewRound(room);
          }
        }, 3000);
      }
    }, 800);
    return null;
  }

  return null;
}

function getHumanIndex(room) {
  return room.players.findIndex((p) => !p.isBot);
}

function startNewRound(room) {
  const game = room.game;
  const newDealer = (game.dealer + 1) % 4;
  room.game = createGameState(
    {
      list: room.players,
      scores: game.scores,
      roundHistory: game.roundHistory,
      roundNumber: game.roundNumber + 1,
    },
    game.settings,
    newDealer,
  );
  // Emit dealing event for shuffle sound on client
  for (const p of room.players) {
    if (!p.isBot && p.socketId) {
      io.to(p.socketId).emit("newRoundDealing");
    }
  }
  sendGameUpdate(room);
  scheduleBot(room);
}

function handleDeclaration(room, playerIndex, declares) {
  const game = room.game;
  const result = processDeclaration(game, playerIndex, declares);

  if (result.error) return result.error;

  if (result.action === "SHOW_ZVANJA") {
    if (declares) {
      const total = game.playerZvanja[playerIndex].reduce(
        (s, z) => s + z.points,
        0,
      );
      emitPlayerAction(room, playerIndex, "declare", `Imam ${total}!`);
    } else {
      emitPlayerAction(room, playerIndex, "pass", "Dalje!");
    }
    // Now emit resolved zvanja per-player (only winning zvanja after resolution)
    for (let i = 0; i < 4; i++) {
      if (!game.playerDeclarations[i]) continue;
      const team = i % 2 === 0 ? 0 : 1;
      const playerZvanjaResolved = game.zvanjaDetails[team].filter((z) => {
        // Check if any of this zvanja's cards belong to player i
        return game.playerZvanja[i].some((pz) =>
          pz.cards.some((pc) =>
            z.cards.some((zc) => zc.suit === pc.suit && zc.value === pc.value),
          ),
        );
      });
      if (playerZvanjaResolved.length > 0) {
        emitPlayerAction(
          room,
          i,
          "zvanja-show",
          "Zvanje!",
          playerZvanjaResolved,
        );
      }
    }
    sendGameUpdate(room);
    // Show zvanja for 3 seconds then start playing
    setTimeout(() => {
      if (room.game === game) {
        startPlaying(game);
        sendGameUpdate(room);
        scheduleBot(room);
      }
    }, 3000);
    return null;
  }

  if (result.action === "START_PLAYING") {
    if (declares) {
      const total = game.playerZvanja[playerIndex].reduce(
        (s, z) => s + z.points,
        0,
      );
      emitPlayerAction(room, playerIndex, "declare", `Imam ${total}!`);
    } else {
      emitPlayerAction(room, playerIndex, "pass", "Dalje!");
    }
    sendGameUpdate(room);
    scheduleBot(room);
    return null;
  }

  // NEXT_DECLARE
  if (declares) {
    const total = game.playerZvanja[playerIndex].reduce(
      (s, z) => s + z.points,
      0,
    );
    emitPlayerAction(room, playerIndex, "declare", `Imam ${total}!`);
  } else {
    emitPlayerAction(room, playerIndex, "pass", "Dalje!");
  }
  sendGameUpdate(room);
  scheduleBot(room);
  return null;
}

// ---------- Socket Handlers ----------

io.on("connection", (socket) => {
  console.log(`Konekcija: ${socket.id}`);

  socket.on("login", ({ nickname, avatarId, firebaseUid }) => {
    // Prevent duplicate login
    if (players.has(socket.id)) return;
    // Sanitize inputs
    const cleanNick = String(nickname || "")
      .trim()
      .slice(0, 16);
    if (cleanNick.length < 2) {
      socket.emit("error", "Nadimak mora imati barem 2 znaka");
      return;
    }
    const cleanAvatar = Math.max(0, Math.min(7, parseInt(avatarId) || 0));

    players.set(socket.id, {
      id: socket.id,
      nickname: cleanNick,
      avatarId: cleanAvatar,
      roomId: null,
      firebaseUid: firebaseUid || null,
    });

    socket.emit("welcome", {
      playerId: socket.id,
      onlineCount: getOnlineCount(),
    });
    broadcastOnlineCount();
    socket.emit("roomList", getRoomList());
  });

  socket.on("createRoom", ({ name, settings }) => {
    const player = players.get(socket.id);
    if (!player) return;
    if (player.roomId) {
      socket.emit("error", "Već si u sobi");
      return;
    }

    const cleanName =
      String(name || "")
        .trim()
        .slice(0, 30) || `Soba ${nextRoomId}`;
    const roomId = generateRoomId();

    const room = {
      id: roomId,
      name: cleanName,
      hostId: socket.id,
      settings: {
        targetScore: [501, 701, 1001].includes(settings?.targetScore)
          ? settings.targetScore
          : 1001,
        prolaz: settings?.prolaz !== false,
      },
      players: [
        {
          id: socket.id,
          socketId: socket.id,
          nickname: player.nickname,
          avatarId: player.avatarId,
          isBot: false,
        },
      ],
      game: null,
    };

    rooms.set(roomId, room);
    player.roomId = roomId;
    socket.join(roomId);

    sendRoomUpdate(room);
    broadcastRoomList();
  });

  socket.on("joinRoom", (roomId) => {
    const player = players.get(socket.id);
    if (!player) return;
    if (player.roomId) {
      socket.emit("error", "Već si u sobi");
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      socket.emit("error", "Soba ne postoji");
      return;
    }
    if (room.players.length >= 4) {
      socket.emit("error", "Soba je puna");
      return;
    }
    if (room.game) {
      socket.emit("error", "Igra je već u tijeku");
      return;
    }

    room.players.push({
      id: socket.id,
      socketId: socket.id,
      nickname: player.nickname,
      avatarId: player.avatarId,
      isBot: false,
    });

    player.roomId = roomId;
    socket.join(roomId);

    sendRoomUpdate(room);
    broadcastRoomList();
  });

  socket.on("leaveRoom", () => {
    handleLeaveRoom(socket);
  });

  socket.on("addBot", () => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    const room = rooms.get(player.roomId);
    if (!room) return;
    if (room.hostId !== socket.id) {
      socket.emit("error", "Samo domaćin može dodati botove");
      return;
    }
    if (room.players.length >= 4) {
      socket.emit("error", "Soba je puna");
      return;
    }

    const botName = getNextBotName();
    room.players.push({
      id: `bot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      socketId: null,
      nickname: botName,
      avatarId: Math.floor(Math.random() * 8),
      isBot: true,
    });

    sendRoomUpdate(room);
    broadcastRoomList();
  });

  socket.on("removePlayer", (index) => {
    if (typeof index !== "number" || !Number.isInteger(index)) return;
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    const room = rooms.get(player.roomId);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    if (index < 0 || index >= room.players.length) return;
    if (room.players[index].id === socket.id) return; // Can't remove yourself

    const removed = room.players[index];
    room.players.splice(index, 1);

    if (!removed.isBot && removed.socketId) {
      const removedPlayer = players.get(removed.socketId);
      if (removedPlayer) removedPlayer.roomId = null;
      io.to(removed.socketId).emit("roomClosed");
    }

    sendRoomUpdate(room);
    broadcastRoomList();
  });

  socket.on("swapPlayers", (data) => {
    if (!data || typeof data.from !== "number" || typeof data.to !== "number")
      return;
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    const room = rooms.get(player.roomId);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    if (room.game) return; // Can't swap during game

    const { from, to } = data;
    if (
      from < 0 ||
      from >= room.players.length ||
      to < 0 ||
      to >= room.players.length
    )
      return;
    if (from === to) return;

    // Swap the two players in the array
    const temp = room.players[from];
    room.players[from] = room.players[to];
    room.players[to] = temp;

    // If host was swapped, hostId stays the same (it's the socket id, not the index)
    sendRoomUpdate(room);
    broadcastRoomList();
  });

  socket.on("startGame", () => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    const room = rooms.get(player.roomId);
    if (!room) return;
    if (room.hostId !== socket.id) {
      socket.emit("error", "Samo domaćin može pokrenuti igru");
      return;
    }
    if (room.players.length !== 4) {
      socket.emit("error", "Treba 4 igrača");
      return;
    }

    const dealer = Math.floor(Math.random() * 4);
    room.game = createGameState(
      { list: room.players, scores: [0, 0] },
      room.settings,
      dealer,
    );

    // Send game start to each player
    for (let i = 0; i < room.players.length; i++) {
      const p = room.players[i];
      if (!p.isBot && p.socketId) {
        io.to(p.socketId).emit("gameStart", getPlayerView(room.game, i));
      }
    }

    broadcastRoomList();
    scheduleBot(room, 1500);
  });

  socket.on("bid", (suit) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    const room = rooms.get(player.roomId);
    if (!room || !room.game) return;

    const playerIndex = room.players.findIndex((p) => p.id === socket.id);
    if (playerIndex === -1) return;

    const error = handleBid(room, playerIndex, suit || null);
    if (error) socket.emit("error", error);
  });

  socket.on("declareZvanja", (declares) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    const room = rooms.get(player.roomId);
    if (!room || !room.game) return;

    const playerIndex = room.players.findIndex((p) => p.id === socket.id);
    if (playerIndex === -1) return;

    const error = handleDeclaration(room, playerIndex, !!declares);
    if (error) socket.emit("error", error);
  });

  socket.on("playCard", (card) => {
    if (
      !card ||
      typeof card.suit !== "string" ||
      typeof card.value !== "string"
    )
      return;
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    const room = rooms.get(player.roomId);
    if (!room || !room.game) return;

    const playerIndex = room.players.findIndex((p) => p.id === socket.id);
    if (playerIndex === -1) return;

    const error = handlePlayCard(room, playerIndex, card);
    if (error) socket.emit("error", error);
  });

  socket.on("belotResponse", (accept) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    const room = rooms.get(player.roomId);
    if (!room || !room.game) return;

    const game = room.game;
    if (!game.pendingBelotPlay) return;

    const playerIndex = room.players.findIndex((p) => p.id === socket.id);
    if (playerIndex === -1 || game.pendingBelotPlay.playerIndex !== playerIndex)
      return;

    const pendingCard = game.pendingBelotPlay.card;
    game.pendingBelotPlay = null;

    // Apply bela points if accepted
    if (accept) {
      game.belotPoints[getTeam(playerIndex)] += 20;
    }

    // Now actually play the card
    executePlayCard(room, playerIndex, pendingCard);

    // Emit bela bubble after the card is on the table
    if (accept) {
      emitPlayerAction(room, playerIndex, "belot", "Bela!");
    }
  });

  socket.on("nextRound", () => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    const room = rooms.get(player.roomId);
    if (!room || !room.game) return;

    if (room.game.phase !== "ROUND_END") return;

    startNewRound(room);
  });

  socket.on("abandonGame", () => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    const room = rooms.get(player.roomId);
    if (!room || !room.game) return;

    const playerIndex = room.players.findIndex((p) => p.id === socket.id);
    if (playerIndex === -1) return;

    const abandonerName = room.players[playerIndex]?.nickname || "Igrač";

    // Determine teams: abandoner's team gets nothing, opponents get win
    // Team 0 = players 0,2 | Team 1 = players 1,3
    const abandonerTeam = playerIndex % 2; // 0 or 1

    // Send abandon info to all players with their respective results
    for (let i = 0; i < room.players.length; i++) {
      const p = room.players[i];
      if (p.isBot || !p.socketId) continue;
      const pTeam = i % 2;
      let result;
      if (i === playerIndex) {
        result = "abandoned";
      } else if (pTeam === abandonerTeam) {
        result = "teammate"; // no win, no loss
      } else {
        result = "win";
      }
      io.to(p.socketId).emit("gameAbandoned", {
        abandonedBy: abandonerName,
        result,
      });
    }

    // End game, disband room entirely
    room.game = null;
    // Remove all players from the room
    for (const p of room.players) {
      if (!p.isBot && p.socketId) {
        const pl = players.get(p.socketId);
        if (pl) pl.roomId = null;
      }
    }
    rooms.delete(room.id);
    broadcastRoomList();
  });

  socket.on("backToLobby", () => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    const room = rooms.get(player.roomId);
    if (!room) return;

    // End game, return everyone to room
    room.game = null;
    room.rematchReady = null;

    // Remove bots
    room.players = room.players.filter((p) => !p.isBot);

    sendRoomUpdate(room);
    for (const p of room.players) {
      if (!p.isBot && p.socketId) {
        io.to(p.socketId).emit("backToRoom", {
          id: room.id,
          name: room.name,
          hostId: room.hostId,
          settings: room.settings,
          players: room.players.map((pl) => ({
            id: pl.id,
            nickname: pl.nickname,
            avatarId: pl.avatarId,
            isBot: pl.isBot,
          })),
        });
      }
    }
    broadcastRoomList();
  });

  socket.on("rematchReady", () => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    const room = rooms.get(player.roomId);
    if (!room || !room.game || room.game.phase !== "GAME_OVER") return;

    if (!room.rematchReady) room.rematchReady = new Set();
    room.rematchReady.add(socket.id);

    // Broadcast who is ready
    const readyList = [...room.rematchReady];
    for (const p of room.players) {
      if (!p.isBot && p.socketId) {
        io.to(p.socketId).emit("rematchUpdate", {
          ready: readyList,
          total: room.players.filter((pl) => !pl.isBot).length,
        });
      }
    }
  });

  socket.on("rematchStart", () => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    const room = rooms.get(player.roomId);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    if (!room.game || room.game.phase !== "GAME_OVER") return;

    // Check all non-host humans are ready
    const nonHostHumans = room.players.filter(
      (p) => !p.isBot && p.id !== socket.id,
    );
    const allReady = nonHostHumans.every(
      (p) => room.rematchReady && room.rematchReady.has(p.socketId),
    );
    if (!allReady) return;

    // End game, go back to room
    room.game = null;
    room.rematchReady = null;

    // Remove bots
    room.players = room.players.filter((p) => !p.isBot);

    sendRoomUpdate(room);
    for (const p of room.players) {
      if (!p.isBot && p.socketId) {
        io.to(p.socketId).emit("backToRoom", {
          id: room.id,
          name: room.name,
          hostId: room.hostId,
          settings: room.settings,
          players: room.players.map((pl) => ({
            id: pl.id,
            nickname: pl.nickname,
            avatarId: pl.avatarId,
            isBot: pl.isBot,
          })),
        });
      }
    }
    broadcastRoomList();
  });

  socket.on("disconnect", () => {
    console.log(`Odspojeno: ${socket.id}`);
    handleLeaveRoom(socket);
    players.delete(socket.id);
    broadcastOnlineCount();
  });
});

function handleLeaveRoom(socket) {
  const player = players.get(socket.id);
  if (!player || !player.roomId) return;

  const room = rooms.get(player.roomId);
  if (!room) {
    player.roomId = null;
    return;
  }

  const idx = room.players.findIndex((p) => p.id === socket.id);
  if (idx !== -1) {
    room.players.splice(idx, 1);
  }

  player.roomId = null;
  socket.leave(room.id);

  if (room.players.filter((p) => !p.isBot).length === 0) {
    // No humans left, delete room
    rooms.delete(room.id);
  } else {
    // If host left, reassign
    if (room.hostId === socket.id) {
      const newHost = room.players.find((p) => !p.isBot);
      if (newHost) {
        room.hostId = newHost.id;
      }
    }
    // If game in progress with not enough players, end game
    if (room.game) {
      room.game = null;
      room.players = room.players.filter((p) => !p.isBot);
      for (const p of room.players) {
        if (!p.isBot && p.socketId) {
          io.to(p.socketId).emit("backToRoom", {
            id: room.id,
            name: room.name,
            hostId: room.hostId,
            settings: room.settings,
            players: room.players.map((pl) => ({
              id: pl.id,
              nickname: pl.nickname,
              avatarId: pl.avatarId,
              isBot: pl.isBot,
            })),
          });
        }
      }
    } else {
      sendRoomUpdate(room);
    }
  }

  broadcastRoomList();
}

// ---------- SPA fallback ----------

app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// ---------- Start ----------

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🃏 Belot server pokrenut na portu ${PORT}`);

  // Keep-alive ping every 14 minutes to prevent Render free tier from sleeping
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
  if (RENDER_URL) {
    setInterval(
      () => {
        fetch(RENDER_URL).catch(() => {});
      },
      14 * 60 * 1000,
    );
  }
});
