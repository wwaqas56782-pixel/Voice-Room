import { useState } from 'react';
import Participant from './Participant.jsx';

export default function Room({ room }) {
  const { peers, localStream, muted, maxUsers, error, toggleMute, leave } = room;
  const [copied, setCopied] = useState(false);

  const roomId = new URLSearchParams(window.location.search).get('room') || '';
  const others = Object.values(peers);
  const name = localStorage.getItem('openline:name') || 'You';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this link', window.location.href);
    }
  };

  return (
    <main className="room">
      <header className="room-head">
        <div>
          <h1 className="room-title">{roomId}</h1>
          <p className="count">
            {others.length + 1} of {maxUsers} in the room
          </p>
        </div>
        <button className="btn ghost" onClick={copyLink}>
          {copied ? 'Link copied' : 'Copy invite link'}
        </button>
      </header>

      {error && (
        <p className="alert banner" role="status">
          {error}
        </p>
      )}

      <ul className="grid">
        <Participant name={name} stream={localStream} muted={muted} isSelf />
        {others.map((p) => (
          <Participant
            key={p.id}
            name={p.name}
            stream={p.stream}
            muted={p.muted}
            connState={p.connState}
          />
        ))}
      </ul>

      {others.length === 0 && (
        <p className="empty">You are the only one here. Copy the invite link and send it to someone.</p>
      )}

      <footer className="controls">
        <button
          className={`btn ${muted ? 'danger' : 'primary'}`}
          onClick={toggleMute}
          aria-pressed={muted}
        >
          {muted ? 'Unmute microphone' : 'Mute microphone'}
        </button>
        <button className="btn ghost" onClick={leave}>
          Leave room
        </button>
      </footer>
    </main>
  );
}
