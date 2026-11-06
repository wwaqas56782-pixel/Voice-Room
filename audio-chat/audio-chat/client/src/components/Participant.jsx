import { useEffect, useRef } from 'react';
import { useSpeaking } from '../hooks/useSpeaking.js';

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

const STATE_LABEL = {
  new: 'Connecting…',
  connecting: 'Connecting…',
  disconnected: 'Reconnecting…',
  failed: 'Connection failed',
};

export default function Participant({ name, stream, muted, isSelf, connState }) {
  const audioRef = useRef(null);
  // Our own stream is analysed but never played back (that would cause echo).
  const speaking = useSpeaking(stream, !muted);

  useEffect(() => {
    const el = audioRef.current;
    if (el && stream && el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => {});
    }
  }, [stream]);

  const label = isSelf ? 'Connected' : STATE_LABEL[connState] || (muted ? 'Muted' : 'Connected');
  const trouble = !isSelf && (connState === 'failed' || connState === 'disconnected');

  return (
    <li className={`tile${speaking ? ' speaking' : ''}${muted ? ' muted' : ''}`}>
      <div className="avatar" aria-hidden="true">
        {initials(name)}
        {muted && <span className="mute-badge" title="Muted">⌀</span>}
      </div>
      <div className="tile-text">
        <strong>
          {name}
          {isSelf && <span className="you"> (you)</span>}
        </strong>
        <span className={`status${trouble ? ' bad' : ''}`}>
          {muted ? 'Muted' : speaking ? 'Speaking' : label}
        </span>
      </div>
      {!isSelf && <audio ref={audioRef} autoPlay playsInline />}
    </li>
  );
}
