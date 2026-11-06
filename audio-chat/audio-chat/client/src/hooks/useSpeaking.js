import { useEffect, useState } from 'react';
import { getAudioContext } from '../lib/audioContext.js';

const THRESHOLD = 0.035; // RMS level that counts as speech
const HOLD_MS = 300; // keep "speaking" briefly after the level drops

/** Returns true while the given MediaStream carries audible speech. */
export function useSpeaking(stream, enabled = true) {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!stream || !enabled || stream.getAudioTracks().length === 0) {
      setSpeaking(false);
      return undefined;
    }
    let ctx;
    try {
      ctx = getAudioContext();
    } catch {
      return undefined;
    }
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const data = new Uint8Array(analyser.fftSize);
    let raf;
    let lastLoud = 0;
    let current = false;

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const now = performance.now();
      if (rms > THRESHOLD) lastLoud = now;
      const next = now - lastLoud < HOLD_MS;
      if (next !== current) {
        current = next;
        setSpeaking(next);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      setSpeaking(false);
    };
  }, [stream, enabled]);

  return speaking;
}
