import 'dotenv/config';

const DEFAULT_ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

function parseIceServers(raw) {
  if (!raw) return DEFAULT_ICE;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_ICE;
  } catch {
    console.warn('ICE_SERVERS is not valid JSON, falling back to default STUN servers');
    return DEFAULT_ICE;
  }
}

const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

export const config = {
  port: Number(process.env.PORT) || 3001,
  corsOrigin: origins.includes('*') ? '*' : origins,
  maxUsers: Math.max(2, Number(process.env.MAX_USERS_PER_ROOM) || 12),
  iceServers: parseIceServers(process.env.ICE_SERVERS),
};
