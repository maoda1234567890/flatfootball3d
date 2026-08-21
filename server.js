const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// 静态文件服务
app.use(express.static(path.join(__dirname)));

// 房间管理

const rooms = {};

function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      players: {},
      hostId: null,
      gameStarted: false,
      scores: { team1: 0, team2: 0 }
    };
  }
  return rooms[roomId];
}

io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);

  // 创建房间
  socket.on('createRoom', ({ roomId, playerName }) => {
    const room = getRoom(roomId);
    if (room.hostId) {
      socket.emit('errorMsg', '房间已存在');
      return;
    }
    room.hostId = socket.id;
    socket.roomId = roomId;
    room.players[socket.id] = {
      id: socket.id,
      name: playerName || '玩家1',
      slot: 0, // P1
      ready: false
    };
    socket.join(roomId);
    socket.emit('joinedRoom', { roomId, slot: 0, isHost: true });
    io.to(roomId).emit('roomUpdate', room.players);
  });

  // 加入房间
  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = getRoom(roomId);
    const playerCount = Object.keys(room.players).length;
    if (playerCount >= 2) {
      socket.emit('errorMsg', '房间已满');
      return;
    }
    room.players[socket.id] = {
      id: socket.id,
      name: playerName || '玩家2',
      slot: 1, // P2
      ready: false
    };
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit('joinedRoom', { roomId, slot: 1, isHost: false });
    io.to(roomId).emit('roomUpdate', room.players);
  });

  // 玩家准备
  socket.on('ready', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || !room.players[socket.id]) return;
    room.players[socket.id].ready = true;
    io.to(roomId).emit('roomUpdate', room.players);
  });

  // 房主开始游戏
  socket.on('startGameByHost', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.hostId !== socket.id) return;
    room.gameStarted = true;
    io.to(roomId).emit('startGame');
  });

  // 游戏状态同步（主机 authoritative）
  socket.on('gameState', (data) => {
    const roomId = socket.roomId;
    if (!roomId) return;
    socket.to(roomId).emit('gameState', data);
  });

  // 玩家输入同步
  socket.on('playerInput', (data) => {
    const roomId = socket.roomId;
    if (!roomId) return;
    socket.to(roomId).emit('playerInput', { id: socket.id, ...data });
  });

  // 进球事件
  socket.on('goal', (data) => {
    const roomId = socket.roomId;
    if (!roomId) return;
    io.to(roomId).emit('goal', data);
  });

  // 断开连接
  socket.on('disconnect', () => {
    console.log('用户断开:', socket.id);
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      const room = rooms[roomId];
      delete room.players[socket.id];
      if (room.hostId === socket.id) {
        room.hostId = null;
        room.gameStarted = false;
      }
      io.to(roomId).emit('roomUpdate', room.players);
      io.to(roomId).emit('playerDisconnected', socket.id);
      if (Object.keys(room.players).length === 0) {
        delete rooms[roomId];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
