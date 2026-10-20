// Browser speech: recognition (voice in) and synthesis (voice out).
// Both are free and need no server. Quality depends on the device.

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const canListen = Boolean(Recognition);
export const canSpeak = 'speechSynthesis' in window;

export function createListener({ onInterim, onFinal, onEnd, onError }) {
  if (!Recognition) return null;

  const rec = new Recognition();
  rec.lang = 'de-DE';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  let finalText = '';

  rec.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const piece = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += piece;
      else interim += piece;
    }
    if (interim) onInterim?.((finalText + interim).trim());
  };

  rec.onerror = (event) => onError?.(event.error);

  rec.onend = () => {
    const text = finalText.trim();
    finalText = '';
    onEnd?.();
    if (text) onFinal?.(text);
  };

  return {
    start() {
      finalText = '';
      rec.start();
    },
    stop() {
      try { rec.stop(); } catch { /* not running */ }
    }
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
