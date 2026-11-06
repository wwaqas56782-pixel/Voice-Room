import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { config } from './config.js';
import {
  addPeer, removePeer, getPeers, roomSize, hasPeer, setMuted, stats,
} from './rooms.js';

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.corsOrigin }));

app.get('/', (_req, res) => res.send('Audio chat signaling server is running.'));
app.get('/health', (_req, res) => res.json({ ok: true, ...stats() }));
app.get('/api/ice-servers', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ iceServers: config.iceServers, maxUsers: config.maxUsers });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.corsOrigin, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e5, // signaling messages are tiny; reject anything large
  pingInterval: 10000,
  pingTimeout: 10000,
});

const ROOM_RE = /^[a-zA-Z0-9_-]{1,40}$/;
const cleanName = (s) =>
  String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);

function leaveRoom(socket) {
  const { roomId } = socket.data;
  if (!roomId) return;
  removePeer(roomId, socket.id);
  socket.leave(roomId);
  socket.to(roomId).emit('peer-left', { id: socket.id });
  socket.data.roomId = null;
}

io.on('connection', (socket) => {
  socket.on('join', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const roomId = String(payload?.roomId ?? '');
    const name = cleanName(payload?.name);

    if (!ROOM_RE.test(roomId)) {
      return ack({ ok: false, error: 'Room names use letters, numbers, - and _ (max 40).' });
    }
    if (!name) return ack({ ok: false, error: 'Enter a display name.' });
    if (socket.data.roomId) leaveRoom(socket);
    if (roomSize(roomId) >= config.maxUsers) {
      return ack({ ok: false, error: `This room is full (${config.maxUsers} people).` });
    }

    const peers = getPeers(roomId, socket.id);
    addPeer(roomId, socket.id, name);
    socket.data.roomId = roomId;
    socket.join(roomId);

    ack({ ok: true, selfId: socket.id, peers, maxUsers: config.maxUsers });
    socket.to(roomId).emit('peer-joined', { id: socket.id, name, muted: false });
  });

  // Relay SDP offers/answers and ICE candidates to one specific peer in the same room.
  socket.on('signal', (payload) => {
    const { roomId } = socket.data;
    const to = payload?.to;
    if (!roomId || typeof to !== 'string' || !hasPeer(roomId, to)) return;
    io.to(to).emit('signal', { from: socket.id, data: payload.data });
  });

  socket.on('mute', (muted) => {
    const { roomId } = socket.data;
    if (!roomId) return;
    setMuted(roomId, socket.id, !!muted);
    socket.to(roomId).emit('peer-muted', { id: socket.id, muted: !!muted });
  });

  socket.on('leave', () => leaveRoom(socket));
  socket.on('disconnect', () => leaveRoom(socket));
});

server.listen(config.port, () => {
  console.log(`Signaling server listening on :${config.port}`);
  console.log('Allowed origins:', config.corsOrigin);
});

const shutdown = () => {
  io.close(() => server.close(() => process.exit(0)));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
