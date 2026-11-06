import { useState } from 'react';

function initialRoom() {
  const fromUrl = new URLSearchParams(window.location.search).get('room');
  return (fromUrl || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
}

export default function JoinForm({ onJoin, busy, error }) {
  const [name, setName] = useState(() => localStorage.getItem('openline:name') || '');
  const [roomId, setRoomId] = useState(initialRoom);

  const submit = (e) => {
    e.preventDefault();
    const cleanRoom = roomId.trim().replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40);
    const cleanName = name.trim();
    if (!cleanRoom || !cleanName) return;
    localStorage.setItem('openline:name', cleanName);
    window.history.replaceState(null, '', `?room=${encodeURIComponent(cleanRoom)}`);
    onJoin(cleanRoom, cleanName);
  };

  return (
    <main className="join">
      <section className="join-card">
        <h1 className="brand">Open Line</h1>
        <p className="lede">
          Talk with up to 12 people in a shared room. Audio goes straight between browsers, with
          no recording and no account.
        </p>

        <form onSubmit={submit} className="join-form">
          <label>
            Your name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              placeholder="Ada"
              autoComplete="nickname"
              required
            />
          </label>
          <label>
            Room name
            <input
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              maxLength={40}
              placeholder="friday-standup"
              autoCapitalize="off"
              spellCheck={false}
              required
            />
          </label>

          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}

          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Connecting…' : 'Join room'}
          </button>
          <p className="hint">Your browser will ask to use the microphone. Headphones prevent echo.</p>
        </form>
      </section>
    </main>
  );
}
