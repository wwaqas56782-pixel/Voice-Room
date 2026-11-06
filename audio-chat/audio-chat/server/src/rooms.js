/**
 * In-memory room registry.
 * rooms: Map<roomId, Map<socketId, { name, muted }>>
 * Single-instance only. To scale horizontally, use the socket.io Redis adapter
 * and move this state to Redis.
 */
const rooms = new Map();

export function getPeers(roomId, exceptId) {
  const room = rooms.get(roomId);
  if (!room) return [];
  return [...room.entries()]
    .filter(([id]) => id !== exceptId)
    .map(([id, p]) => ({ id, name: p.name, muted: p.muted }));
}

export function roomSize(roomId) {
  return rooms.get(roomId)?.size ?? 0;
}

export function addPeer(roomId, id, name) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  rooms.get(roomId).set(id, { name, muted: false });
}

export function removePeer(roomId, id) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.delete(id);
  if (room.size === 0) rooms.delete(roomId);
}

export function hasPeer(roomId, id) {
  return rooms.get(roomId)?.has(id) ?? false;
}

export function setMuted(roomId, id, muted) {
  const p = rooms.get(roomId)?.get(id);
  if (p) p.muted = muted;
}

export function stats() {
  return {
    rooms: rooms.size,
    users: [...rooms.values()].reduce((n, r) => n + r.size, 0),
  };
}
