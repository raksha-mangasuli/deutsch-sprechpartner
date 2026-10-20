// Browser speech: recognition (voice in) and synthesis (voice out).
// Both are free and need no server. Quality depends on the device.

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const canListen = Boolean(Recognition);
export const canSpeak = 'speechSynthesis' in window;

// How long to wait after the last spoken words before treating the turn as done.
const SILENCE_MS = 5000;

export function createListener({ onInterim, onFinal, onEnd, onError }) {
  if (!Recognition) return null;

  const rec = new Recognition();
  rec.lang = 'de-DE';
  rec.interimResults = true;
  // Keep listening through short pauses; stop only after a longer silence
  // (or when the user taps the mic again).
  rec.continuous = true;
  rec.maxAlternatives = 1;

  let transcript = '';
  let silenceTimer = null;

  const clearSilence = () => {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  };

  const stop = () => {
    clearSilence();
    try { rec.stop(); } catch { /* not running */ }
  };

  rec.onresult = (event) => {
    // Rebuild from every result so repeated events never duplicate text.
    transcript = Array.from(event.results).map((r) => r[0].transcript).join(' ');
    onInterim?.(transcript.trim());
    clearSilence();
    silenceTimer = setTimeout(stop, SILENCE_MS);
  };

  rec.onerror = (event) => {
    clearSilence();
    onError?.(event.error);
  };

  rec.onend = () => {
    clearSilence();
    const text = transcript.trim();
    transcript = '';
    onEnd?.();
    if (text) onFinal?.(text);
  };

  return {
    start() {
      transcript = '';
      rec.start();
    },
    stop
  };
}

export function getGermanVoices() {
  if (!canSpeak) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith('de'));
}

// Voices load asynchronously on most browsers.
export function onVoicesReady(callback) {
  if (!canSpeak) return;
  callback();
  speechSynthesis.addEventListener('voiceschanged', callback);
}

// iOS only allows speech after a user gesture. Call this inside a click or
// submit handler once, so later automatic replies can be spoken.
let unlocked = false;
export function unlockSpeech() {
  if (!canSpeak || unlocked) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  speechSynthesis.speak(u);
  unlocked = true;
}

export function speak(text, { voiceURI, rate } = {}) {
  if (!canSpeak || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  u.rate = rate || 0.95;
  const voices = getGermanVoices();
  const chosen = voices.find((v) => v.voiceURI === voiceURI) || voices[0];
  if (chosen) u.voice = chosen;
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (canSpeak) speechSynthesis.cancel();
}
