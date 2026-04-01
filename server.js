const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// ─── Persistence ─────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function roomFilePath(code) {
  // Sanitize code for filesystem safety
  const safe = code.replace(/[^A-Z0-9_-]/gi, '');
  return path.join(DATA_DIR, safe + '.json');
}

function saveRoomToDisk(room) {
  const data = {
    code: room.code,
    config: room.config,
    games: room.games,
    log: room.log,
    round: room.round,
    currentGame: room.currentGame,
  };
  try {
    fs.writeFileSync(roomFilePath(room.code), JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save room', room.code, err.message);
  }
}

function loadRoomFromDisk(code) {
  const fp = roomFilePath(code);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch (err) {
    console.error('Failed to load room', code, err.message);
    return null;
  }
}

// ─── Default data ────────────────────────────────────────────
const DEFAULT_GAMES = [
  { id: 1, name: 'Half Sword',         player: 'Iago',     emoji: '⚔️',  image: '', played: false },
  { id: 2, name: 'Forsaken Frontiers', player: 'Derik',    emoji: '🌌',  image: '', played: false },
  { id: 3, name: 'TEKKEN 8',           player: 'Jordanny', emoji: '🥊',  image: '', played: false },
  { id: 4, name: 'The Forest',         player: 'Xandy',    emoji: '🌲',  image: '', played: false },
  { id: 5, name: 'CS:GO',              player: 'Julios',   emoji: '🔫',  image: '', played: false },
  { id: 6, name: 'Make Way',           player: 'Cauã',     emoji: '🏁',  image: '', played: false },
  { id: 7, name: 'Super Golf',         player: 'Diogo',    emoji: '⛳',  image: '', played: false },
];

const DEFAULT_CONFIG = {
  minTime: 40,
  maxTime: 160,
  voteInterval: 20,
  entryCode: 'MLKS2026',
  sessionName: 'Noite dos MLKs',
};

// ─── Rooms (in-memory + disk) ───────────────────────────────
const rooms = new Map();

function createRoom(code, saved) {
  return {
    code,
    config: saved ? { ...DEFAULT_CONFIG, ...saved.config, entryCode: code } : { ...DEFAULT_CONFIG, entryCode: code },
    games: saved ? saved.games : JSON.parse(JSON.stringify(DEFAULT_GAMES)),
    log: saved ? saved.log : [],
    round: saved ? saved.round : 1,
    currentGame: saved ? saved.currentGame : null,
    spinning: false,
    timer: {
      running: false,
      seconds: 0,
      phase: 'idle',
      intervalId: null,
      nextVoteAt: 0,
    },
    votes: new Map(),
    voteOpen: false,
    users: new Map(),
    adminId: null,
  };
}

function isRoomAdmin(room, socketId) {
  return room.adminId === socketId;
}

function transferAdmin(room) {
  if (room.users.size > 0) {
    const firstId = room.users.keys().next().value;
    room.adminId = firstId;
  } else {
    room.adminId = null;
  }
}

function getRoom(code) {
  if (rooms.has(code)) return rooms.get(code);
  const saved = loadRoomFromDisk(code);
  const room = createRoom(code, saved);
  rooms.set(code, room);
  return room;
}

function getAvailableGames(room) {
  const avail = room.games.filter(g => !g.played);
  return avail.length > 0 ? avail : room.games;
}

function getVoteTally(room) {
  let cont = 0, sw = 0;
  for (const v of room.votes.values()) {
    if (v === 'continue') cont++;
    else sw++;
  }
  return { continue: cont, switch: sw, total: cont + sw };
}

function broadcastState(room) {
  const tally = getVoteTally(room);
  const userList = [];
  for (const [sid, u] of room.users) {
    userList.push({ name: u.name, isAdmin: sid === room.adminId });
  }
  // Send per-socket state (with individual isAdmin)
  for (const [sid] of room.users) {
    const sock = io.sockets.sockets.get(sid);
    if (sock) {
      sock.emit('state', {
        games: room.games,
        config: room.config,
        log: room.log,
        round: room.round,
        currentGame: room.currentGame,
        spinning: room.spinning,
        timer: {
          running: room.timer.running,
          seconds: room.timer.seconds,
          phase: room.timer.phase,
        },
        votes: tally,
        voteOpen: room.voteOpen,
        users: userList,
        userCount: room.users.size,
        isAdmin: sid === room.adminId,
      });
    }
  }
}

function emitTimerTick(room) {
  const tally = getVoteTally(room);
  io.to(room.code).emit('timer:tick', {
    seconds: room.timer.seconds,
    phase: room.timer.phase,
    votes: tally,
    voteOpen: room.voteOpen,
  });
}

function startRoomTimer(room) {
  if (room.timer.running) return;
  room.timer.running = true;
  room.timer.phase = 'min';
  room.timer.nextVoteAt = room.config.minTime * 60;

  room.timer.intervalId = setInterval(() => {
    room.timer.seconds++;
    const minSec = room.config.minTime * 60;
    const maxSec = room.config.maxTime * 60;

    // Phase transitions
    if (room.timer.phase === 'min' && room.timer.seconds >= minSec) {
      room.timer.phase = 'overtime';
      room.timer.nextVoteAt = minSec;
      room.voteOpen = true;
      room.votes.clear();
      io.to(room.code).emit('timer:alert', 'minComplete');
    }

    if (room.timer.phase === 'overtime') {
      const interval = room.config.voteInterval * 60;
      if (room.timer.seconds >= room.timer.nextVoteAt + interval) {
        room.timer.nextVoteAt = room.timer.seconds;
        room.votes.clear();
        room.voteOpen = true;
        io.to(room.code).emit('timer:alert', 'newVoteRound');
      }
    }

    if (room.timer.seconds >= maxSec) {
      room.timer.phase = 'ended';
      room.timer.running = false;
      clearInterval(room.timer.intervalId);
      room.timer.intervalId = null;
      io.to(room.code).emit('timer:alert', 'maxReached');
    }

    emitTimerTick(room);
  }, 1000);
}

function pauseRoomTimer(room) {
  room.timer.running = false;
  if (room.timer.intervalId) {
    clearInterval(room.timer.intervalId);
    room.timer.intervalId = null;
  }
  emitTimerTick(room);
}

function resetRoomTimer(room) {
  pauseRoomTimer(room);
  room.timer.seconds = 0;
  room.timer.phase = 'idle';
  room.voteOpen = false;
  room.votes.clear();
  emitTimerTick(room);
}

// ─── Socket.IO ──────────────────────────────────────────────
io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('join', ({ code, name }) => {
    if (!code || typeof code !== 'string') return;
    const sanitizedCode = code.trim().toUpperCase().slice(0, 20);
    const sanitizedName = (name || 'Anônimo').trim().slice(0, 30);

    // Leave previous room
    if (currentRoom) {
      currentRoom.users.delete(socket.id);
      currentRoom.votes.delete(socket.id);
      socket.leave(currentRoom.code);
      broadcastState(currentRoom);
    }

    const room = getRoom(sanitizedCode);
    room.users.set(socket.id, { name: sanitizedName });
    socket.join(room.code);
    currentRoom = room;

    // First user becomes admin
    if (!room.adminId || !room.users.has(room.adminId)) {
      room.adminId = socket.id;
    }

    socket.emit('joined', { code: room.code, name: sanitizedName, isAdmin: socket.id === room.adminId });
    broadcastState(room);
  });

  // ── Spin ──
  socket.on('spin', () => {
    if (!currentRoom || currentRoom.spinning) return;
    if (!isRoomAdmin(currentRoom, socket.id)) return;
    const avail = getAvailableGames(currentRoom);
    if (avail.length === 0) return;

    currentRoom.spinning = true;

    // Server picks winner
    const winnerIdx = Math.floor(Math.random() * avail.length);
    const winner = avail[winnerIdx];

    // Broadcast spin start with target
    io.to(currentRoom.code).emit('spin:start', {
      winnerId: winner.id,
      games: avail,
    });

    // After animation completes (~10s), finalize
    setTimeout(() => {
      const game = currentRoom.games.find(g => g.id === winner.id);
      if (game) game.played = true;

      currentRoom.currentGame = winner;
      currentRoom.log.push({
        game: winner.name,
        player: winner.player,
        emoji: winner.emoji,
        round: currentRoom.round,
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      });
      currentRoom.round++;
      currentRoom.spinning = false;

      // Reset cycle if all played
      if (currentRoom.games.every(g => g.played)) {
        currentRoom.games.forEach(g => g.played = false);
      }

      // Reset timer for new game
      resetRoomTimer(currentRoom);
      saveRoomToDisk(currentRoom);

      io.to(currentRoom.code).emit('spin:result', { winner });
      broadcastState(currentRoom);
    }, 10500);
  });

  // ── Timer ──
  socket.on('timer:start', () => {
    if (!currentRoom) return;
    if (!isRoomAdmin(currentRoom, socket.id)) return;
    startRoomTimer(currentRoom);
    broadcastState(currentRoom);
  });

  socket.on('timer:pause', () => {
    if (!currentRoom) return;
    if (!isRoomAdmin(currentRoom, socket.id)) return;
    pauseRoomTimer(currentRoom);
    broadcastState(currentRoom);
  });

  socket.on('timer:reset', () => {
    if (!currentRoom) return;
    if (!isRoomAdmin(currentRoom, socket.id)) return;
    resetRoomTimer(currentRoom);
    broadcastState(currentRoom);
  });

  // ── Vote ──
  socket.on('vote', ({ choice }) => {
    if (!currentRoom || !currentRoom.voteOpen) return;
    if (choice !== 'continue' && choice !== 'switch') return;
    currentRoom.votes.set(socket.id, choice);
    const tally = getVoteTally(currentRoom);
    io.to(currentRoom.code).emit('vote:update', tally);
  });

  // ── Games ──
  socket.on('game:add', ({ name, player, emoji, image }) => {
    if (!currentRoom) return;
    if (!name || typeof name !== 'string') return;
    const id = currentRoom.games.length > 0
      ? Math.max(...currentRoom.games.map(g => g.id)) + 1
      : 1;
    // Validate image URL if provided
    let safeImage = '';
    if (image && typeof image === 'string') {
      const trimmed = image.trim().slice(0, 500);
      if (/^https?:\/\//i.test(trimmed)) safeImage = trimmed;
    }
    currentRoom.games.push({
      id,
      name: name.trim().slice(0, 50),
      player: (player || '?').trim().slice(0, 30),
      emoji: (emoji || '🎮').trim().slice(0, 4),
      image: safeImage,
      played: false,
    });
    saveRoomToDisk(currentRoom);
    broadcastState(currentRoom);
  });

  socket.on('game:remove', ({ id }) => {
    if (!currentRoom) return;
    currentRoom.games = currentRoom.games.filter(g => g.id !== id);
    saveRoomToDisk(currentRoom);
    broadcastState(currentRoom);
  });

  socket.on('game:resetPlayed', () => {
    if (!currentRoom) return;
    currentRoom.games.forEach(g => g.played = false);
    saveRoomToDisk(currentRoom);
    broadcastState(currentRoom);
  });

  socket.on('game:clearAll', () => {
    if (!currentRoom) return;
    currentRoom.games = [];
    saveRoomToDisk(currentRoom);
    broadcastState(currentRoom);
  });

  // ── Config ──
  socket.on('log:clear', () => {
    if (!currentRoom) return;
    if (!isRoomAdmin(currentRoom, socket.id)) return;
    currentRoom.log = [];
    currentRoom.round = 1;
    saveRoomToDisk(currentRoom);
    broadcastState(currentRoom);
  });

  socket.on('config:update', (cfg) => {
    if (!currentRoom) return;
    if (!isRoomAdmin(currentRoom, socket.id)) return;
    if (cfg.minTime != null) currentRoom.config.minTime = Math.max(1, Math.min(300, parseInt(cfg.minTime) || 40));
    if (cfg.maxTime != null) currentRoom.config.maxTime = Math.max(1, Math.min(600, parseInt(cfg.maxTime) || 160));
    if (cfg.voteInterval != null) currentRoom.config.voteInterval = Math.max(1, Math.min(120, parseInt(cfg.voteInterval) || 20));
    if (cfg.sessionName != null) currentRoom.config.sessionName = String(cfg.sessionName).trim().slice(0, 50);
    saveRoomToDisk(currentRoom);
    broadcastState(currentRoom);
  });

  // ── Export ──
  socket.on('export', () => {
    if (!currentRoom) return;
    socket.emit('export:data', {
      games: currentRoom.games,
      config: currentRoom.config,
    });
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    if (currentRoom) {
      const wasAdmin = currentRoom.adminId === socket.id;
      currentRoom.users.delete(socket.id);
      currentRoom.votes.delete(socket.id);
      if (wasAdmin) transferAdmin(currentRoom);
      broadcastState(currentRoom);

      // Cleanup empty rooms after 5 min
      if (currentRoom.users.size === 0) {
        const code = currentRoom.code;
        setTimeout(() => {
          const room = rooms.get(code);
          if (room && room.users.size === 0) {
            if (room.timer.intervalId) clearInterval(room.timer.intervalId);
            rooms.delete(code);
          }
        }, 5 * 60 * 1000);
      }
    }
  });
});

// ─── Start ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Spinout rodando em http://localhost:${PORT}`);
});
