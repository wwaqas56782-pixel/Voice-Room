import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SIGNALING_URL, FALLBACK_ICE_SERVERS, MAX_AUDIO_BITRATE } from '../config.js';
import { resumeAudioContext } from '../lib/audioContext.js';

/**
 * Mesh WebRTC audio room.
 *
 * Topology: every participant holds one RTCPeerConnection to every other one.
 * Glare avoidance: the NEWCOMER always creates the offers; existing members only
 * create a connection when told "peer-joined" and then wait for the offer.
 * Mute is done with track.enabled, so no renegotiation is ever needed.
 */
export function useRoom() {
  const [status, setStatus] = useState('idle'); // idle | joining | joined
  const [error, setError] = useState('');
  const [peers, setPeers] = useState({}); // id -> { id, name, muted, stream, connState }
  const [localStream, setLocalStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const [selfId, setSelfId] = useState(null);
  const [maxUsers, setMaxUsers] = useState(12);

  const socketRef = useRef(null);
  const connsRef = useRef(new Map()); // id -> { pc, initiator, pending: [] }
  const streamRef = useRef(null);
  const iceRef = useRef(FALLBACK_ICE_SERVERS);
  const joinInfoRef = useRef(null);
  const leavingRef = useRef(false);

  /* ---------- helpers ---------- */
  const patchPeer = useCallback((id, patch) => {
    setPeers((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev));
  }, []);

  const send = useCallback((to, data) => {
    socketRef.current?.emit('signal', { to, data });
  }, []);

  const closeConn = useCallback((id) => {
    const c = connsRef.current.get(id);
    if (!c) return;
    c.pc.onicecandidate = null;
    c.pc.ontrack = null;
    c.pc.onconnectionstatechange = null;
    c.pc.close();
    connsRef.current.delete(id);
  }, []);

  const closeAllConns = useCallback(() => {
    [...connsRef.current.keys()].forEach(closeConn);
    setPeers({});
  }, [closeConn]);

  const capBitrate = useCallback(async (pc) => {
    try {
      for (const sender of pc.getSenders()) {
        if (sender.track?.kind !== 'audio') continue;
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
        params.encodings[0].maxBitrate = MAX_AUDIO_BITRATE;
        await sender.setParameters(params);
      }
    } catch {
      /* not supported everywhere; safe to ignore */
    }
  }, []);

  const sendOffer = useCallback(
    async (id, iceRestart = false) => {
      const c = connsRef.current.get(id);
      if (!c) return;
      try {
        const offer = await c.pc.createOffer({ iceRestart });
        await c.pc.setLocalDescription(offer);
        send(id, { type: 'offer', sdp: c.pc.localDescription });
        capBitrate(c.pc);
      } catch (e) {
        console.error('createOffer failed', e);
      }
    },
    [send, capBitrate]
  );

  const createConn = useCallback(
    (id, initiator) => {
      closeConn(id);
      const pc = new RTCPeerConnection({ iceServers: iceRef.current });
      const conn = { pc, initiator, pending: [] };
      connsRef.current.set(id, conn);

      streamRef.current?.getTracks().forEach((t) => pc.addTrack(t, streamRef.current));

      pc.onicecandidate = (e) => {
        if (e.candidate) send(id, { type: 'candidate', candidate: e.candidate });
      };
      pc.ontrack = (e) => {
        patchPeer(id, { stream: e.streams[0] });
      };
      pc.onconnectionstatechange = () => {
        patchPeer(id, { connState: pc.connectionState });
        // Only the initiator may re-offer, which keeps negotiation glare-free.
        if (pc.connectionState === 'failed' && conn.initiator) sendOffer(id, true);
      };
      return conn;
    },
    [closeConn, patchPeer, send, sendOffer]
  );

  const flushCandidates = async (conn) => {
    while (conn.pending.length) {
      try {
        await conn.pc.addIceCandidate(conn.pending.shift());
      } catch (e) {
        console.warn('addIceCandidate failed', e);
      }
    }
  };

  const handleSignal = useCallback(
    async (from, data) => {
      let conn = connsRef.current.get(from);
      try {
        if (data.type === 'offer') {
          if (!conn) {
            setPeers((p) => (p[from] ? p : { ...p, [from]: { id: from, name: 'Guest', muted: false, stream: null, connState: 'new' } }));
            conn = createConn(from, false);
          }
          await conn.pc.setRemoteDescription(data.sdp);
          await flushCandidates(conn);
          const answer = await conn.pc.createAnswer();
          await conn.pc.setLocalDescription(answer);
          send(from, { type: 'answer', sdp: conn.pc.localDescription });
          capBitrate(conn.pc);
        } else if (data.type === 'answer') {
          if (!conn) return;
          await conn.pc.setRemoteDescription(data.sdp);
          await flushCandidates(conn);
        } else if (data.type === 'candidate') {
          if (!conn) return;
          if (conn.pc.remoteDescription) await conn.pc.addIceCandidate(data.candidate);
          else conn.pending.push(data.candidate);
        }
      } catch (e) {
        console.error('signal handling failed', data?.type, e);
      }
    },
    [createConn, send, capBitrate]
  );

  /* ---------- join / leave ---------- */
  const performJoin = useCallback(() => {
    const socket = socketRef.current;
    const info = joinInfoRef.current;
    if (!socket || !info) return;

    // After a reconnect the socket id changed, so old peer connections are dead.
    closeAllConns();

    socket.emit('join', info, (res) => {
      if (!res?.ok) {
        setError(res?.error || 'Could not join the room.');
        teardown(); // eslint-disable-line no-use-before-define
        return;
      }
      setSelfId(res.selfId);
      setMaxUsers(res.maxUsers);
      const existing = {};
      res.peers.forEach((p) => {
        existing[p.id] = { ...p, stream: null, connState: 'new' };
      });
      setPeers(existing);
      setStatus('joined');
      // We are the newcomer: open a connection to everyone and send the offers.
      res.peers.forEach((p) => {
        createConn(p.id, true);
        sendOffer(p.id);
      });
    });
  }, [closeAllConns, createConn, sendOffer]);

  const teardown = useCallback(() => {
    leavingRef.current = true;
    const socket = socketRef.current;
    if (socket) {
      socket.emit('leave');
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    }
    closeAllConns();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    joinInfoRef.current = null;
    setLocalStream(null);
    setSelfId(null);
    setMuted(false);
    setStatus('idle');
  }, [closeAllConns]);

  const join = useCallback(
    async (roomId, name) => {
      if (status !== 'idle') return;
      setError('');
      setStatus('joining');
      leavingRef.current = false;
      resumeAudioContext(); // inside a click handler, so autoplay policy is satisfied

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('This browser cannot access the microphone. Use HTTPS and a current browser.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        streamRef.current = stream;
        setLocalStream(stream);
      } catch (e) {
        setError(
          e?.name === 'NotAllowedError'
            ? 'Microphone access was blocked. Allow it in your browser settings and try again.'
            : e?.name === 'NotFoundError'
            ? 'No microphone found. Connect one and try again.'
            : e?.message || 'Could not access the microphone.'
        );
        setStatus('idle');
        return;
      }

      try {
        const res = await fetch(`${SIGNALING_URL}/api/ice-servers`);
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.iceServers) && json.iceServers.length) iceRef.current = json.iceServers;
        }
      } catch {
        /* keep fallback STUN servers */
      }

      joinInfoRef.current = { roomId, name };
      const socket = io(SIGNALING_URL, { transports: ['websocket', 'polling'], reconnectionDelayMax: 5000 });
      socketRef.current = socket;

      socket.on('connect', performJoin);
      socket.on('connect_error', () => {
        if (!leavingRef.current) setError('Cannot reach the server. Retrying…');
      });
      socket.on('disconnect', () => {
        if (!leavingRef.current) setError('Connection lost. Reconnecting…');
      });
      socket.on('peer-joined', (p) => {
        setPeers((prev) => ({ ...prev, [p.id]: { ...p, stream: null, connState: 'new' } }));
        createConn(p.id, false); // wait for their offer
      });
      socket.on('peer-left', ({ id }) => {
        closeConn(id);
        setPeers((prev) => {
          const { [id]: _gone, ...rest } = prev;
          return rest;
        });
      });
      socket.on('peer-muted', ({ id, muted: m }) => patchPeer(id, { muted: m }));
      socket.on('signal', ({ from, data }) => handleSignal(from, data));
      socket.io.on('reconnect', () => setError(''));
      socket.on('connect', () => setError(''));
    },
    [status, performJoin, createConn, closeConn, patchPeer, handleSignal]
  );

  const toggleMute = useCallback(() => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const nowMuted = !track.enabled;
    setMuted(nowMuted);
    socketRef.current?.emit('mute', nowMuted);
  }, []);

  // Clean up if the component tree unmounts mid-call.
  useEffect(() => {
    const onUnload = () => socketRef.current?.emit('leave');
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      if (socketRef.current || streamRef.current) teardown();
    };
  }, [teardown]);

  return {
    status, error, peers, localStream, muted, selfId, maxUsers,
    join, leave: teardown, toggleMute,
  };
}
