// Browsers limit how many AudioContexts a page can hold, so share a single one.
let ctx = null;

export function getAudioContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
  }
  return ctx;
}

export function resumeAudioContext() {
  const c = getAudioContext();
  if (c.state === 'suspended') c.resume().catch(() => {});
}
