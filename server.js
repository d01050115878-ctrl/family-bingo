/* =========================================================
   숫자·테마 빙고 게임 - 서버 (Express + Socket.IO)
   ========================================================= */
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const Rules = require('./public/js/rules.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  // 모바일에서 화면이 꺼지거나 앱을 전환하면 브라우저가 타이머/네트워크를 강하게 제한해서
  // 기본값보다 오래 응답이 없을 수 있다. 넉넉하게 잡아서 실제로 끊긴 게 아닌데
  // 끊긴 걸로 오판하는 경우를 줄인다.
  pingInterval: 25000,
  pingTimeout: 60000,
});

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 6;
const ROOM_TTL_MS = 30 * 60 * 1000;
const RECONNECT_GRACE_MS = 10 * 60 * 1000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (req, res) => res.send('ok'));

/** @type {Map<string, Room>} */
const rooms = new Map();

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}
function genToken() { return crypto.randomBytes(12).toString('hex'); }

function makeRoom(code, hostToken) {
  return {
    code,
    category: 'number',
    level: 1,
    hostToken,
    players: {}, // token -> {token,name,avatar,host,board,ready,connected,socketId}
    status: 'waiting', // waiting | playing | ended
    drawnList: [],
    turnOrder: [],
    turnIndex: 0,
    winners: [],
    createdAt: Date.now(),
    lastActivity: Date.now(),
    disconnectTimers: {},
  };
}

function touch(room) { room.lastActivity = Date.now(); }
function playerByToken(room, token) { return room.players[token]; }
function connectedCount(room) { return Object.values(room.players).filter((p) => p.connected).length; }

function computeLines(room, token) {
  const p = room.players[token];
  if (!p || !p.board || room.status === 'waiting') return 0;
  const drawnSet = new Set(room.drawnList);
  const marked = Rules.markedFromDraws(p.board, drawnSet);
  return Rules.countCompletedLines(marked).count;
}

function roomPublicPlayers(room) {
  return Object.values(room.players).map((p) => ({
    token: p.token, name: p.name, avatar: p.avatar, host: p.token === room.hostToken,
    ready: !!p.board, connected: !!p.connected, lines: computeLines(room, p.token),
  }));
}

function roomSummary(room) {
  return {
    category: room.category, level: room.level, target: Rules.targetLines(room.level),
    status: room.status, drawnCount: room.drawnList.length, maxPlayers: MAX_PLAYERS,
    players: roomPublicPlayers(room), winners: room.winners.slice(),
    currentTurn: room.turnOrder[room.turnIndex] || null,
  };
}

function advanceTurn(room) {
  if (!room.turnOrder.length) return;
  for (let i = 1; i <= room.turnOrder.length; i++) {
    const idx = (room.turnIndex + i) % room.turnOrder.length;
    const tok = room.turnOrder[idx];
    const p = room.players[tok];
    if (p && p.connected) { room.turnIndex = idx; return; }
  }
}

function assignNextHost(room) {
  const next = Object.values(room.players).find((p) => p.connected);
  if (next) room.hostToken = next.token;
}

io.on('connection', (socket) => {
  socket.data.roomCode = null;
  socket.data.token = null;

  socket.on('room:create', (payload = {}, cb) => {
    try {
      const code = genCode();
      const token = genToken();
      const room = makeRoom(code, token);
      room.category = Rules.normalizeCategory(payload.category);
      room.level = Rules.normalizeLevel(payload.level);
      room.players[token] = {
        token, name: String(payload.name || '플레이어').slice(0, 12), avatar: payload.avatar || '🙂',
        board: null, connected: true, socketId: socket.id,
      };
      rooms.set(code, room);
      socket.join(code);
      socket.data.roomCode = code;
      socket.data.token = token;
      cb && cb({ ok: true, code, token, ...roomSummary(room) });
    } catch (err) {
      cb && cb({ ok: false, message: '방을 만들지 못했어요. 다시 시도해주세요.' });
    }
  });

  socket.on('room:join', (payload = {}, cb) => {
    const code = String(payload.code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return cb && cb({ ok: false, message: '방을 찾을 수 없어요. 코드를 확인해주세요.' });
    if (room.status !== 'waiting') return cb && cb({ ok: false, message: '이미 게임이 시작된 방이에요.' });
    if (Object.keys(room.players).length >= MAX_PLAYERS) {
      return cb && cb({ ok: false, message: `이 방은 최대 ${MAX_PLAYERS}명까지만 입장할 수 있어요.` });
    }
    const token = genToken();
    room.players[token] = {
      token, name: String(payload.name || '플레이어').slice(0, 12), avatar: payload.avatar || '🙂',
      board: null, connected: true, socketId: socket.id,
    };
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.token = token;
    touch(room);

    cb && cb({ ok: true, code, token, ...roomSummary(room) });
    socket.to(code).emit('room:update', roomSummary(room));
  });

  socket.on('room:rejoin', (payload = {}, cb) => {
    const code = String(payload.code || '').toUpperCase().trim();
    const room = rooms.get(code);
    const p = room && room.players[payload.token];
    if (!room || !p) return cb && cb({ ok: false, message: '방에 다시 들어갈 수 없어요.' });

    p.socketId = socket.id;
    p.connected = true;
    if (room.disconnectTimers[payload.token]) {
      clearTimeout(room.disconnectTimers[payload.token]);
      delete room.disconnectTimers[payload.token];
    }
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.token = payload.token;
    touch(room);

    cb && cb({
      ok: true, code, token: p.token, myBoard: p.board,
      drawnList: room.drawnList.slice(), ...roomSummary(room),
    });
    socket.to(code).emit('room:opponent-reconnected', roomSummary(room));
  });

  socket.on('room:settings', (payload = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'waiting' || socket.data.token !== room.hostToken) return;
    room.category = Rules.normalizeCategory(payload.category);
    room.level = Rules.normalizeLevel(payload.level);
    Object.values(room.players).forEach((p) => { p.board = null; });
    touch(room);
    io.to(room.code).emit('room:update', roomSummary(room));
  });

  socket.on('room:board-ready', (payload = {}, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'waiting') return cb && cb({ ok: false, message: '지금은 보드를 정할 수 없어요.' });
    const me = playerByToken(room, socket.data.token);
    if (!me) return cb && cb({ ok: false, message: '플레이어 정보를 찾을 수 없어요.' });
    if (!Rules.isValidBoard(payload.board, room.category)) {
      return cb && cb({ ok: false, message: '보드가 올바르지 않아요. 새로고침 후 다시 시도해주세요.' });
    }
    me.board = payload.board;
    touch(room);
    cb && cb({ ok: true });
    io.to(room.code).emit('room:update', roomSummary(room));
  });

  socket.on('room:start', (cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'waiting') return cb && cb({ ok: false, message: '지금은 시작할 수 없어요.' });
    if (socket.data.token !== room.hostToken) return cb && cb({ ok: false, message: '방장만 시작할 수 있어요.' });
    const connected = Object.values(room.players).filter((p) => p.connected);
    if (connected.length < 2) return cb && cb({ ok: false, message: '최소 2명이 모여야 시작할 수 있어요.' });
    if (!connected.every((p) => p.board)) return cb && cb({ ok: false, message: '아직 보드를 준비하지 않은 참가자가 있어요.' });

    const connectedTokens = connected.map((p) => p.token);
    room.turnOrder = connectedTokens;
    room.turnIndex = 0;
    room.drawnList = [];
    room.winners = [];
    room.status = 'playing';
    touch(room);
    cb && cb({ ok: true });
    io.to(room.code).emit('game:start', roomSummary(room));
  });

  socket.on('room:call-number', (payload = {}, cb) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing') return cb && cb({ ok: false, message: '지금은 번호를 부를 수 없어요.' });
    const currentTurnToken = room.turnOrder[room.turnIndex];
    if (socket.data.token !== currentTurnToken) return cb && cb({ ok: false, message: '내 차례가 아니에요.' });
    const item = payload.item;
    const cat = Rules.CATEGORIES[room.category];
    if (!cat || !cat.items.includes(item)) return cb && cb({ ok: false, message: '올바르지 않은 번호예요.' });
    if (room.drawnList.includes(item)) return cb && cb({ ok: false, message: '이미 불린 번호예요.' });

    room.drawnList.push(item);
    touch(room);

    const target = Rules.targetLines(room.level);
    const newWinners = Object.values(room.players)
      .filter((p) => p.board && !room.winners.includes(p.token) && computeLines(room, p.token) >= target)
      .map((p) => p.token);

    let ended = false;
    if (newWinners.length) {
      room.winners.push(...newWinners);
      room.status = 'ended';
      ended = true;
    } else {
      advanceTurn(room);
    }

    const outPayload = {
      item, drawnCount: room.drawnList.length, target, ended,
      winners: room.winners.slice(), players: roomPublicPlayers(room),
      currentTurn: room.turnOrder[room.turnIndex] || null,
    };
    io.to(room.code).emit('game:draw', outPayload);
    cb && cb({ ok: true });
  });

  socket.on('room:rematch', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || socket.data.token !== room.hostToken) return;
    Object.values(room.players).forEach((p) => { p.board = null; });
    room.turnOrder = [];
    room.turnIndex = 0;
    room.drawnList = [];
    room.winners = [];
    room.status = 'waiting';
    touch(room);
    io.to(room.code).emit('game:rematch-start', roomSummary(room));
  });

  socket.on('chat:message', (payload = {}) => {
    const room = rooms.get(socket.data.roomCode);
    const me = room && playerByToken(room, socket.data.token);
    if (!me) return;
    const text = String(payload.text || '').slice(0, 200);
    if (!text.trim()) return;
    io.to(room.code).emit('chat:message', { name: me.name, token: me.token, text, ts: Date.now() });
  });

  socket.on('chat:emote', (payload = {}) => {
    const room = rooms.get(socket.data.roomCode);
    const me = room && playerByToken(room, socket.data.token);
    if (!me) return;
    const emoji = String(payload.emoji || '').slice(0, 8);
    if (!emoji) return;
    io.to(room.code).emit('chat:emote', { name: me.name, token: me.token, emoji });
  });

  socket.on('room:leave', () => cleanupSocket(socket, true));
  socket.on('disconnect', () => cleanupSocket(socket, false));

  function cleanupSocket(socket, explicit) {
    const code = socket.data.roomCode;
    const token = socket.data.token;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    const me = playerByToken(room, token);
    if (!me) return;

    me.connected = false;
    socket.leave(code);

    if (room.status === 'playing' && room.turnOrder[room.turnIndex] === token) {
      advanceTurn(room);
    }

    const finalize = () => {
      if (connectedCount(room) === 0) {
        rooms.delete(code);
        return;
      }
      if (room.hostToken === token) assignNextHost(room);
      io.to(code).emit('room:update', roomSummary(room));
    };

    if (explicit) {
      delete room.players[token];
      finalize();
    } else {
      io.to(code).emit('room:update', roomSummary(room));
      room.disconnectTimers[token] = setTimeout(() => {
        if (room.players[token] && !room.players[token].connected) delete room.players[token];
        finalize();
      }, RECONNECT_GRACE_MS);
    }
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > ROOM_TTL_MS) rooms.delete(code);
  }
}, 60 * 1000);

server.listen(PORT, () => {
  console.log(`빙고 게임 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
