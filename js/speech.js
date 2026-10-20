// Browser speech: recognition (voice in) and synthesis (voice out).
// Both are free and need no server. Quality depends on the device.

import { plainText } from './text.js';
import { punctuate } from './punctuate.js';

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const canListen = Boolean(Recognition);
export const canSpeak = 'speechSynthesis' in window;

// How long to wait after the last spoken words before treating the turn as done.
const SILENCE_MS = 4000;

// Some engines (Android Chrome in particular) send every result as the full
// text so far instead of only the new words. When a result starts with the one
// before it, it replaces that one instead of being added after it.
function mergeResults(items) {
  const out = [];
  for (const { text: raw, final } of items) {
    const text = raw.trim();
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && text.toLowerCase().startsWith(last.text.toLowerCase())) out[out.length - 1] = { text, final };
    else out.push({ text, final });
  }
  return out;
}

// Every pause ends a sentence. The phrase still being spoken only gets its full
// stop once it is final, or when the recording has ended (finishing = true).
function compose(parts, finishing) {
  return parts
    .map((p, i) => punctuate(p.text, { final: finishing || p.final || i < parts.length - 1 }))
    .join(' ');
}

export function createListener({ onInterim, onFinal, onEnd, onError }) {
  if (!Recognition) return null;

  const rec = new Recognition();
  rec.lang = 'de-DE';
  rec.interimResults = true;
  // Keep listening through short pauses; stop only after a longer silence
  // (or when the user taps the mic again).
  rec.continuous = true;
  rec.maxAlternatives = 1;

  let parts = [];
  let silenceTimer = null;
  // Set when the user takes over the text box: nothing more may be written to it.
  let discarded = false;

  const clearSilence = () => {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  };

  const stop = () => {
    clearSilence();
    try { rec.stop(); } catch { /* not running */ }
  };

  rec.onresult = (event) => {
    if (discarded) return;
    // Rebuild from every result so repeated events never duplicate text.
    parts = mergeResults(Array.from(event.results).map((r) => ({ text: r[0].transcript, final: r.isFinal })));
    onInterim?.(compose(parts, false));
    clearSilence();
    silenceTimer = setTimeout(stop, SILENCE_MS);
  };

  rec.onerror = (event) => {
    clearSilence();
    onError?.(event.error);
  };

  rec.onend = () => {
    clearSilence();
    const text = compose(parts, true).trim();
    parts = [];
    onEnd?.();
    if (text && !discarded) onFinal?.(text);
  };

  return {
    start() {
      parts = [];
      discarded = false;
      rec.start();
    },
    stop,
    // Stops listening and throws away anything still to come, so it cannot
    // overwrite text the user has started to edit.
    discard() {
      discarded = true;
      clearSilence();
      try { rec.abort(); } catch { /* not running */ }
    }
  };
}

// Best first: standard German (de-DE) over Austrian or Swiss, natural-sounding
// voices over the old robotic ones, and single-language over multilingual ones.
function voiceScore(v) {
  let score = 0;
  if (v.lang.toLowerCase().replace('_', '-') === 'de-de') score += 4;
  if (/natural/i.test(v.name)) score += 2;
  if (/mehrsprachig|multilingual/i.test(v.name)) score -= 1;
  return score;
}

// Windows, Edge and Chrome voices carry a first name but no gender field.
const FEMALE = /katja|amala|seraphina|ingrid|hedda|leni|vicki|marlene|hanna|petra|anna|birgit|claudia|maja|\bfemale\b|\bfrau\b/i;
const MALE = /conrad|killian|florian|stefan|\bjan\b|jonas|markus|klaus|hans|bernd|christoph|michael|daniel|\bmale\b|\bmann\b/i;

function voiceGender(v) {
  if (FEMALE.test(v.name)) return 'f';
  if (MALE.test(v.name)) return 'm';
  return '';
}

export function getGermanVoices() {
  if (!canSpeak) return [];
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang && v.lang.toLowerCase().startsWith('de'))
    .map((v, i) => ({ v, i, score: voiceScore(v) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.v);
}

// Browsers load their voice list lazily: the first getVoices() call returns an
// empty list and fills it a moment later. Ask for it as soon as the page loads.
if (canSpeak) speechSynthesis.getVoices();

// Resolves once German voices are available, or after a short wait.
function whenVoicesReady(timeoutMs = 1500) {
  return new Promise((resolve) => {
    if (getGermanVoices().length) return resolve();
    const done = () => {
      speechSynthesis.removeEventListener('voiceschanged', check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => { if (getGermanVoices().length) done(); };
    const timer = setTimeout(done, timeoutMs);
    speechSynthesis.addEventListener('voiceschanged', check);
    speechSynthesis.getVoices();
  });
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

// An explicit choice wins. Otherwise take the best voice that suits the person
// (voicePick tells two people of the same gender apart), then the best voice.
function chooseVoice({ voiceURI, gender, voicePick }) {
  const voices = getGermanVoices();
  const chosen = voices.find((v) => v.voiceURI === voiceURI);
  if (chosen) return chosen;
  const matching = gender ? voices.filter((v) => voiceGender(v) === gender) : [];
  const pool = matching.length ? matching : voices;
  return pool[Math.min(voicePick, pool.length - 1)] || null;
}

// Some browsers drop or repeat text when speak() follows cancel() in the same
// instant, so the new utterance is queued a moment later.
const FLUSH_MS = 80;
let queued = null;

export function speak(text, { voiceURI, rate, gender, voicePick = 0 } = {}) {
  const spoken = plainText(text);
  if (!canSpeak || !spoken) return;
  clearTimeout(queued);
  speechSynthesis.cancel();
  // After a long idle, some browsers leave the engine paused and nothing is spoken.
  if (speechSynthesis.paused) speechSynthesis.resume();
  const u = new SpeechSynthesisUtterance(spoken);
  u.lang = 'de-DE';
  u.rate = rate || 0.95;

  // Cancelling fires events for the old utterance after the new one is queued,
  // so only the current utterance may report.
  current = u;
  u.onstart = () => { if (current === u) hooks.onStart?.(); };
  u.onend = u.onerror = () => { if (current === u) current = null; };
  // iOS Safari can fire onstart late or never, so report speaking right away.
  hooks.onStart?.();

  whenVoicesReady().then(() => {
    if (current !== u) return;
    u.voice = chooseVoice({ voiceURI, gender, voicePick });
    queued = setTimeout(() => {
      if (current === u) speechSynthesis.speak(u);
    }, FLUSH_MS);
  });
}

// Stops the voice. This is a cancel, so the UI goes straight to idle.
export function stopSpeaking() {
  if (!canSpeak) return;
  clearTimeout(queued);
  const wasSpeaking = current !== null;
  current = null;
  speechSynthesis.cancel();
  if (wasSpeaking) hooks.onCancel?.();
}

// True while the browser is speaking or has speech queued.
export function isSpeaking() {
  return canSpeak && (speechSynthesis.speaking || speechSynthesis.pending);
}

// Lets the UI follow speech: { onStart, onCancel }.
let hooks = {};
let current = null;
export function setSpeechHooks(next) {
  hooks = next || {};
}
