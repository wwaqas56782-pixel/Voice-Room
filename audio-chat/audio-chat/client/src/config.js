export const SIGNALING_URL = (
  import.meta.env.VITE_SIGNALING_URL || 'http://localhost:3001'
).replace(/\/$/, '');

// Used only if the server's /api/ice-servers endpoint can't be reached.
export const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// Cap per-peer Opus bitrate (bits/s). Mesh = N-1 uplinks, so keep this modest.
export const MAX_AUDIO_BITRATE = 32000;
