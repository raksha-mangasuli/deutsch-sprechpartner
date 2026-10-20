import { ask, parseTurn, ApiError } from './api.js';
import { TOPICS, buildSystemPrompt, OPENER_REQUEST, SUMMARY_SYSTEM, summaryRequest } from './prompt.js';
import * as speech from './speech.js';
import * as store from './storage.js';
import * as ui from './ui.js';

const $ = (id) => document.getElementById(id);

const chatEl = $('chat');
const statusEl = $('status');
const form = $('composer');
const textEl = $('text');
const sendBtn = $('btn-send');
const micBtn = $('btn-mic');

let settings = store.loadSettings();
let history = store.loadChat();
let busy = false;
let listener = null;
let listening = false;

/* ---------- helpers ---------- */

function apiMessages() {
  return history.map((h) =>
    h.role === 'user' ? { role: 'user', content: h.text } : { role: 'assistant', content: h.raw }
  );
}

function persist() {
  store.saveChat(history.slice(-100));
}

function render() {
  ui.renderChat(chatEl, history, {
    hasKey: Boolean(settings.apiKey),
    onStart: () => takeTurn(OPENER_REQUEST, { hidden: true }),
    onSpeak: (text) => speech.speak(text, settings)
  });
}

function setBusy(value) {
  busy = value;
  sendBtn.disabled = value;
}

/* ---------- conversation ---------- */

async function takeTurn(text, { hidden = false } = {}) {
  if (busy || !text.trim()) return;
  if (!settings.apiKey) {
    openSettings();
    return;
  }

  speech.unlockSpeech();
  speech.stopSpeaking();

  const userItem = { role: 'user', text: text.trim(), hidden };
  history.push(userItem);
  render();
  ui.showTyping(chatEl);
  setBusy(true);

  try {
    const raw = await ask({
      apiKey: settings.apiKey,
      model: settings.model,
      system: buildSystemPrompt({
        level: settings.level,
        topic: settings.topic,
        mode: settings.mode,
        mistakes: store.loadMistakes()
      }),
      messages: apiMessages()
    });

    const turn = parseTurn(raw);
    history.push({
      role: 'assistant',
      raw,
      reply: turn.reply,
      translation: turn.translation,
      correction: turn.correction
    });
    store.addMistakes(turn.mistakes);
    persist();
    render();

    if (settings.autoSpeak) speech.speak(turn.reply, settings);
  } catch (err) {
    // Roll back the failed turn so the history stays valid, and give the text back.
    history.pop();
    render();
    ui.showError(chatEl, err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    if (!hidden) textEl.value = userItem.text;
    ui.autoGrow(textEl);
  } finally {
    setBusy(false);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = textEl.value;
  if (!text.trim()) return;
  textEl.value = '';
  ui.autoGrow(textEl);
  takeTurn(text);
});

textEl.addEventListener('input', () => ui.autoGrow(textEl));
textEl.addEventListener('keydown', (event) => {
  const desktop = window.matchMedia('(pointer: fine)').matches;
  if (event.key === 'Enter' && !event.shiftKey && desktop) {
    event.preventDefault();
    form.requestSubmit();
  }
});

/* ---------- session review ---------- */

async function endAndReview() {
  const userTurns = history.filter((h) => h.role === 'user' && !h.hidden).length;
  if (userTurns < 2) {
    ui.setStatus(statusEl, 'Have a short conversation first, then review it.');
    setTimeout(() => ui.setStatus(statusEl, ''), 3000);
    return;
  }
  if (busy) return;
  if (!settings.apiKey) {
    openSettings();
    return;
  }

  setBusy(true);
  ui.setStatus(statusEl, 'Writing your review...');
  try {
    const text = await ask({
      apiKey: settings.apiKey,
      model: settings.model,
      system: SUMMARY_SYSTEM,
      messages: [...apiMessages(), { role: 'user', content: summaryRequest(settings.level) }],
      maxTokens: 900
    });
    $('summary-body').textContent = text.trim();
    $('dlg-summary').showModal();
  } catch (err) {
    ui.setStatus(statusEl, err instanceof ApiError ? err.message : 'Could not write the review.');
    setTimeout(() => ui.setStatus(statusEl, ''), 4000);
    setBusy(false);
    return;
  }
  ui.setStatus(statusEl, '');
  setBusy(false);
}

function newConversation() {
  const hasContent = history.some((h) => !h.hidden);
  if (hasContent && !window.confirm('Start a new conversation? The current one will be cleared.')) return;
  speech.stopSpeaking();
  history = [];
  persist();
  render();
}

/* ---------- voice input ---------- */

function setListening(value) {
  listening = value;
  micBtn.classList.toggle('listening', value);
  micBtn.setAttribute('aria-pressed', String(value));
}

function setupMic() {
  if (!speech.canListen) {
    micBtn.hidden = true;
    return;
  }

  listener = speech.createListener({
    onInterim: (text) => {
      textEl.value = text;
      ui.autoGrow(textEl);
    },
    onFinal: (text) => {
      textEl.value = text;
      ui.autoGrow(textEl);
      if (settings.autoSend) form.requestSubmit();
    },
    onEnd: () => {
      setListening(false);
      ui.setStatus(statusEl, '');
    },
    onError: (code) => {
      setListening(false);
      const messages = {
        'not-allowed': 'Microphone access was blocked. Allow it in your browser settings.',
        'service-not-allowed': 'Speech recognition is not available here. Use the microphone key on your keyboard instead.',
        'no-speech': 'I did not hear anything. Try again.',
        'audio-capture': 'No microphone found.',
        network: 'Speech recognition needs an internet connection.'
      };
      if (code === 'aborted') return;
      ui.setStatus(statusEl, messages[code] || 'Speech recognition failed.');
      setTimeout(() => ui.setStatus(statusEl, ''), 4500);
    }
  });

  micBtn.addEventListener('click', () => {
    speech.unlockSpeech();
    speech.stopSpeaking();
    if (listening) {
      listener.stop();
      return;
    }
    try {
      listener.start();
      setListening(true);
      ui.setStatus(statusEl, 'Listening... speak German');
    } catch {
      setListening(false);
    }
  });
}

/* ---------- controls ---------- */

function setupControls() {
  const levelSel = $('sel-level');
  const topicSel = $('sel-topic');

  for (const [key, t] of Object.entries(TOPICS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = t.label;
    topicSel.append(opt);
  }

  levelSel.value = settings.level;
  topicSel.value = settings.topic;

  levelSel.addEventListener('change', () => updateSetting({ level: levelSel.value }));
  topicSel.addEventListener('change', () => updateSetting({ topic: topicSel.value }));

  for (const btn of document.querySelectorAll('.segmented button')) {
    btn.addEventListener('click', () => {
      updateSetting({ mode: btn.dataset.mode });
      paintMode();
    });
  }
  paintMode();

  $('btn-end').addEventListener('click', endAndReview);
  $('btn-new').addEventListener('click', newConversation);
  $('btn-settings').addEventListener('click', openSettings);
}

function paintMode() {
  for (const btn of document.querySelectorAll('.segmented button')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.mode === settings.mode));
  }
}

function updateSetting(patch) {
  settings = { ...settings, ...patch };
  store.saveSettings(settings);
}

/* ---------- settings dialog ---------- */

const dlg = $('dlg-settings');

function fillVoices() {
  const select = $('set-voice');
  const voices = speech.getGermanVoices();
  select.replaceChildren();

  if (voices.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Default voice';
    select.append(opt);
    return;
  }
  for (const v of voices) {
    const opt = document.createElement('option');
    opt.value = v.voiceURI;
    opt.textContent = `${v.name} (${v.lang})`;
    select.append(opt);
  }
  select.value = voices.some((v) => v.voiceURI === settings.voiceURI) ? settings.voiceURI : voices[0].voiceURI;
}

function openSettings() {
  $('set-key').value = settings.apiKey;
  $('set-model').value = settings.model;
  $('set-rate').value = settings.rate;
  $('out-rate').textContent = Number(settings.rate).toFixed(2) + 'x';
  $('set-autospeak').checked = settings.autoSpeak;
  $('set-autosend').checked = settings.autoSend;
  $('mistake-count').textContent = `${store.loadMistakes().length} recurring mistakes remembered.`;
  fillVoices();
  dlg.showModal();
}

function setupSettings() {
  $('set-rate').addEventListener('input', (e) => {
    $('out-rate').textContent = Number(e.target.value).toFixed(2) + 'x';
  });

  $('btn-testvoice').addEventListener('click', () => {
    speech.unlockSpeech();
    speech.speak('Hallo! Ich bin dein Sprechpartner. Wollen wir anfangen?', {
      voiceURI: $('set-voice').value,
      rate: Number($('set-rate').value)
    });
  });

  $('btn-clearmistakes').addEventListener('click', () => {
    store.clearMistakes();
    $('mistake-count').textContent = '0 recurring mistakes remembered.';
  });

  $('btn-cancel').addEventListener('click', () => dlg.close('cancel'));

  dlg.addEventListener('close', () => {
    if (dlg.returnValue !== 'save') return;
    updateSetting({
      apiKey: $('set-key').value.trim(),
      model: $('set-model').value.trim() || store.DEFAULT_SETTINGS.model,
      voiceURI: $('set-voice').value,
      rate: Number($('set-rate').value),
      autoSpeak: $('set-autospeak').checked,
      autoSend: $('set-autosend').checked
    });
    render();
  });
}

/* ---------- start ---------- */

setupControls();
setupSettings();
setupMic();
render();

if (!speech.canSpeak) settings.autoSpeak = false;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
