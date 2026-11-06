# Open Line: real-time audio rooms (WebRTC mesh)

React + Vite frontend, Node/Express + Socket.IO signaling server, pure WebRTC audio.
Audio flows browser-to-browser; the server only relays SDP offers/answers and ICE candidates.

```
audio-chat/
├── README.md
├── .gitignore
├── server/                      # signaling server (deploy to Render / Railway / Fly)
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── index.js             # Express + Socket.IO, join/signal/mute/leave
│       ├── config.js            # env parsing (CORS origins, ICE servers, room cap)
│       └── rooms.js             # in-memory room registry
└── client/                      # frontend (deploy to Vercel)
    ├── package.json
    ├── vite.config.js
    ├── vercel.json
    ├── index.html
    ├── .env.example
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── config.js
        ├── styles.css
        ├── hooks/
        │   ├── useRoom.js       # all WebRTC + signaling logic
        │   └── useSpeaking.js   # speaking indicator (Web Audio analyser)
        ├── lib/audioContext.js  # shared AudioContext
        └── components/
            ├── JoinForm.jsx
            ├── Room.jsx
            └── Participant.jsx
```

## Run locally

```bash
# terminal 1
cd server && cp .env.example .env && npm install && npm run dev

# terminal 2
cd client && npm install && npm run dev
```

Open http://localhost:5173 in two tabs (or two devices on the same network; the
microphone requires `localhost` or HTTPS), use the same room name, and talk.

## Environment variables

**Server (`server/.env`, or your host's dashboard)**

| Variable | Purpose |
|---|---|
| `PORT` | Set automatically by most hosts |
| `CLIENT_ORIGIN` | Comma-separated allowed frontend origins, e.g. `https://your-app.vercel.app` |
| `MAX_USERS_PER_ROOM` | Default `12` |
| `ICE_SERVERS` | JSON array of STUN/TURN servers (see `.env.example`) |

**Client (`client/.env.local`, or Vercel project settings)**

| Variable | Purpose |
|---|---|
| `VITE_SIGNALING_URL` | Public URL of the signaling server, no trailing slash |

## Deploy

1. **Signaling server** on a host that supports long-lived WebSockets (Render, Railway, Fly.io).
   Vercel serverless functions do **not** keep WebSocket connections open, so it can't host this part.
   - Root directory: `server`, build: `npm install`, start: `npm start`
   - Set `CLIENT_ORIGIN` (add your Vercel URL after step 2) and `ICE_SERVERS`
   - Check `https://<server>/health` returns `{ "ok": true }`
2. **Frontend** on Vercel: import the repo, set Root Directory to `client`, add
   `VITE_SIGNALING_URL=https://<your-server>`, deploy.
3. Go back to the server and set `CLIENT_ORIGIN` to the final Vercel URL; redeploy the server.

## Production notes

- **TURN is required for reliability.** STUN-only works for most users, but people behind
  symmetric NAT or strict firewalls will connect silently with no audio. Add a TURN service
  (Metered, Twilio, Cloudflare, or self-hosted coturn) via `ICE_SERVERS`.
- **Mesh limits.** Each user uploads one stream per other participant (11 at 12 users, capped at
  32 kbps each, about 350 kbps up). Fine for audio; it would not scale to video or 25+ users,
  where an SFU (LiveKit, mediasoup) is the right move.
- **Single instance.** Room state is in memory. To run multiple server instances, add the
  Socket.IO Redis adapter and move `rooms.js` to Redis.
- **HTTPS is mandatory** for microphone access outside `localhost` (Vercel provides it).
