import { ask, parseTurn, ApiError } from './api.js';
import { buildSystemPrompt, OPENER_REQUEST, SUMMARY_SYSTEM, summaryRequest, SUGGESTIONS } from './prompt.js';
import { AVATARS, AVATAR_IDS, mountAvatar, setAvatarState } from './avatars.js';
import { PERSONAS } from './personas.js';
import { recordPractice, streakStatus, monthGrid, dayKey, weekStreaks } from './streak.js';
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
let history = store.loadChat(settings.avatar);
let streak = store.loadStreak();
let busy = false;
let listener = null;
let listening = false;

/* ---------- helpers ---------- */

function apiMessages(chat = history) {
  return chat.map((h) =>
    h.role === 'user' ? { role: 'user', content: h.text } : { role: 'assistant', content: h.raw }
  );
}

function persist() {
  store.saveChat(settings.avatar, history.slice(-100));
}

// The person on the other side of the conversation.
const partner = () => PERSONAS[settings.avatar];

// An explicit voice choice wins; otherwise the voice suits the partner.
function speakAs(text) {
  const p = partner();
  speech.speak(text, { voiceURI: settings.voice, rate: settings.rate, gender: p.gender, voicePick: p.voicePick });
}

function paintPartner() {
  $('partner-name').textContent = partner().name;
  $('partner-tagline').textContent = partner().tagline;
}

function render() {
  ui.renderChat(chatEl, history, {
    hasKey: Boolean(settings.apiKey),
    partner: partner(),
    suggestions: SUGGESTIONS,
    onStart: () => takeTurn(OPENER_REQUEST, { hidden: true }),
    onSuggest: (say) => takeTurn(say),
    onSpeak: speakAs
  });
}

function setBusy(value) {
  busy = value;
  sendBtn.disabled = value;
  syncAvatar();
}

/* ---------- avatar ---------- */

const avatarEl = $('avatar');
let talking = false;

// One place decides the state: speaking beats listening beats thinking.
function syncAvatar() {
  setAvatarState(avatarEl, talking ? 'speaking' : listening ? 'listening' : busy ? 'thinking' : 'idle');
}

// The browser is the source of truth. From the moment a reply is handed to the
// voice, check every 150 ms whether it is still speaking or has speech queued,
// and leave "speaking" only after two empty checks in a row. That way short gaps
// between chunks never close the mouth.
const CHECK_MS = 150;
const START_GRACE_MS = 1500;
let watch = null;

function stopWatching() {
  clearInterval(watch);
  watch = null;
}

function watchSpeech() {
  if (watch) return;
  const startedAt = Date.now();
  let quiet = 0;
  watch = setInterval(() => {
    if (speech.isSpeaking()) {
      quiet = 0;
      return;
    }
    // iOS Safari can be slow to start, so give it a moment before counting.
    if (Date.now() - startedAt < START_GRACE_MS) return;
    if (++quiet >= 2) {
      stopWatching();
      talking = false;
      syncAvatar();
    }
  }, CHECK_MS);
}

speech.setSpeechHooks({
  onStart: () => {
    talking = true;
    syncAvatar();
    watchSpeech();
  },
  onCancel: () => {
    stopWatching();
    talking = false;
    syncAvatar();
  }
});

/* ---------- daily streak ---------- */

function paintStreak() {
  const { count, doneToday } = streakStatus(streak);
  const badge = $('streak');
  $('streak-count').textContent = String(count);
  badge.classList.toggle('done', doneToday);
  badge.classList.toggle('alive', !doneToday && count > 0);
  const days = `${count} ${count === 1 ? 'day' : 'days'}`;
  const note = doneToday
    ? 'You practised today.'
    : count > 0
      ? 'Practise today to keep it going.'
      : 'Send a message to start your streak.';
  const label = count > 0 ? `${days} in a row. ${note}` : note;
  badge.setAttribute('aria-label', label);
  badge.title = label;
}

// Calendar popover: opens on the streak badge, one month at a time.
let calView = null;
const FLAME = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>';

const DOW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const monthLabel = (y, m) => new Date(y, m, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

function calEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function paintCalendar() {
  const pop = $('streak-pop');
  const { year, month } = calView;
  const now = new Date();
  const todayKey = dayKey(now);
  const atCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  const nav = (label, delta, text, disabled) => {
    const b = calEl('button', 'cal-nav', text);
    b.type = 'button';
    b.disabled = disabled;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', () => {
      const d = new Date(year, month + delta, 1);
      calView = { year: d.getFullYear(), month: d.getMonth() };
      paintCalendar();
    });
    return b;
  };
  const head = calEl('div', 'cal-head');
  const navs = calEl('div', 'cal-navs');
  navs.append(nav('Previous month', -1, '\u2039', false), nav('Next month', 1, '\u203A', atCurrentMonth));
  head.append(calEl('strong', 'cal-title', monthLabel(year, month)), navs);

  const grid = calEl('div', 'cal-grid');
  for (const w of DOW) grid.append(calEl('span', 'cal-dow', w));
  monthGrid(year, month, streak.days).forEach((cell, i) => {
    const col = i % 7;
    const c = calEl('span', 'cal-day' + (cell.week ? ' week' : '') + (col === 0 ? ' start' : '') + (col === 6 ? ' end' : '') + (cell.outside ? ' outside' : ''));
    c.append(calEl('span', 'cal-num' + (cell.practised ? ' on' : '') + (cell.key === todayKey ? ' today' : ''), String(cell.day)));
    grid.append(c);
  });

  const legend = calEl('div', 'cal-legend');
  for (const [kind, text] of [['on', 'Practised'], ['today', 'Today'], ['week', 'Week counts']]) {
    const item = calEl('span', 'cal-key');
    item.append(calEl('i', `cal-swatch ${kind}`), text);
    legend.append(item);
  }

  const { current, best } = weekStreaks(streak.days);
  const stat = (value, label, flame) => {
    const t = calEl('div', 'wk-stat');
    const v = calEl('div', 'wk-val');
    if (flame) v.insertAdjacentHTML('beforeend', FLAME);
    v.append(String(value));
    t.append(v, calEl('div', 'wk-label', label));
    return t;
  };
  const stats = calEl('div', 'wk-stats');
  stats.append(stat(current, 'Week streak', true), stat(best, 'Best streak', false));

  pop.replaceChildren(head, grid, legend, calEl('hr', 'wk-rule'), stats);
}

function toggleCalendar(open = $('streak-pop').hidden) {
  const pop = $('streak-pop');
  if (open) {
    const now = new Date();
    calView = { year: now.getFullYear(), month: now.getMonth() };
    paintCalendar();
  }
  pop.hidden = !open;
  $('streak').setAttribute('aria-expanded', String(open));
}

$('streak').addEventListener('click', () => toggleCalendar());
document.addEventListener('click', (e) => {
  if (!$('streak-pop').hidden && !e.target.closest('#streak, #streak-pop')) toggleCalendar(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('streak-pop').hidden) toggleCalendar(false);
});

// A real exchange (a message and its reply) counts as practice for today.
function recordPracticeToday() {
  const wasDone = streakStatus(streak).doneToday;
  streak = recordPractice(streak);
  store.saveStreak(streak);
  paintStreak();
  if (!$('streak-pop').hidden) toggleCalendar(true);
  if (!wasDone) {
    const { count } = streakStatus(streak);
    ui.setStatus(statusEl, count > 1 ? `${count} days in a row. Keep it going!` : 'Streak started. Come back tomorrow!');
    setTimeout(() => ui.setStatus(statusEl, ''), 4000);
  }
}

// The date can change while the page stays open.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) paintStreak();
});

/* ---------- conversation ---------- */

// Bumped whenever a conversation is cleared, so a reply that was still on its
// way for the old conversation is thrown away instead of appearing in the new one.
let generation = 0;

async function takeTurn(text, { hidden = false } = {}) {
  if (busy || !text.trim()) return;
  if (!settings.apiKey) {
    openSettings();
    return;
  }

  speech.unlockSpeech();
  speech.stopSpeaking();

  // The reply belongs to this partner's conversation, even if the learner
  // switches partner while it is loading.
  const owner = settings.avatar;
  const chat = history;
  const turn = generation;

  const userItem = { role: 'user', text: text.trim(), hidden };
  chat.push(userItem);
  render();
  ui.showTyping(chatEl);
  setBusy(true);

  try {
    const raw = await ask({
      apiKey: settings.apiKey,
      model: settings.model,
      system: buildSystemPrompt({
        level: settings.level,
        persona: PERSONAS[owner],
        mode: settings.mode,
        mistakes: store.loadMistakes()
      }),
      messages: apiMessages(chat)
    });
    if (turn !== generation) return;

    const reply = parseTurn(raw);
    // A hidden turn is an instruction, not something the learner wrote, so nothing in it is a mistake.
    chat.push({ role: 'assistant', raw, reply: reply.reply, correction: hidden ? '' : reply.correction });
    if (!hidden) store.addMistakes(reply.mistakes);
    store.saveChat(owner, chat.slice(-100));
    if (!hidden) recordPracticeToday();

    // Only show and speak it if the learner is still in that conversation.
    if (chat === history) {
      render();
      if (settings.autoSpeak) speakAs(reply.reply);
    }
  } catch (err) {
    if (turn !== generation) return;
    // Roll back the failed turn so the history stays valid, and give the text back.
    chat.pop();
    if (chat === history) {
      render();
      ui.showError(chatEl, err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
      if (!hidden) textEl.value = userItem.text;
      ui.autoGrow(textEl);
    }
  } finally {
    setBusy(false);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  // A reply is still loading: keep the text in the box instead of losing it.
  if (busy) {
    ui.setStatus(statusEl, 'Wait for the reply first, then send.');
    setTimeout(() => ui.setStatus(statusEl, ''), 2500);
    return;
  }
  const text = textEl.value;
  if (!text.trim()) return;
  cancelReview();
  stopListeningForGood();
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
  if (hasContent && !window.confirm(`Start a new conversation with ${partner().name}? The current one will be cleared.`)) return;
  cancelReview();
  stopListeningForGood();
  speech.stopSpeaking();
  generation++;
  history = [];
  persist();
  render();
}

/* ---------- review before auto-send ---------- */

// After speaking, the text waits a few seconds so it can be checked and edited.
// Touching or typing in the box cancels the automatic send; the user sends it.
const REVIEW_SECONDS = 3;
let reviewTimer = null;

function cancelReview(message) {
  if (!reviewTimer) return;
  clearInterval(reviewTimer);
  reviewTimer = null;
  ui.setStatus(statusEl, message || '');
  if (message) setTimeout(() => { if (!reviewTimer) ui.setStatus(statusEl, ''); }, 3500);
}

function startReview() {
  cancelReview();
  let left = REVIEW_SECONDS;
  const label = () => `Sending in ${left}s. Tap the text to edit it first.`;
  ui.setStatus(statusEl, label());
  reviewTimer = setInterval(() => {
    left -= 1;
    if (left > 0) {
      ui.setStatus(statusEl, label());
      return;
    }
    clearInterval(reviewTimer);
    reviewTimer = null;
    ui.setStatus(statusEl, '');
    form.requestSubmit();
  }, 1000);
}

// Touching or typing in the box means the user is taking over: stop the
// microphone for good so it cannot write over the edit, and cancel auto-send.
for (const type of ['pointerdown', 'keydown', 'input']) {
  textEl.addEventListener(type, () => {
    stopListeningForGood();
    cancelReview('Edit your message, then press Senden.');
  });
}

/* ---------- voice input ---------- */

// Stops the microphone and throws away anything it has not delivered yet. It
// must happen whenever the box is sent or the conversation changes: a recogniser
// that keeps running would put the old sentence back into the box and send it again.
function stopListeningForGood() {
  if (!listening) return;
  listener.discard();
  setListening(false);
  ui.setStatus(statusEl, '');
}

function setListening(value) {
  listening = value;
  micBtn.classList.toggle('listening', value);
  micBtn.setAttribute('aria-pressed', String(value));
  syncAvatar();
}

// Dictation adds to whatever is already in the box instead of replacing it.
let dictationBase = '';
let speechError = false;
const withDictation = (text) => {
  if (!dictationBase) return text;
  // Some engines repeat everything said before; do not add it a second time.
  if (text.toLowerCase().startsWith(dictationBase.toLowerCase())) return text;
  return `${dictationBase} ${text}`;
};

function setupMic() {
  if (!speech.canListen) {
    micBtn.hidden = true;
    return;
  }

  listener = speech.createListener({
    onInterim: (text) => {
      textEl.value = withDictation(text);
      ui.autoGrow(textEl);
    },
    onFinal: (text) => {
      textEl.value = withDictation(text);
      ui.autoGrow(textEl);
      if (settings.autoSend) startReview();
    },
    onEnd: () => {
      setListening(false);
      // The browser reports an error and then ends the session: keep the error visible.
      if (!speechError) ui.setStatus(statusEl, '');
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
      speechError = true;
      ui.setStatus(statusEl, messages[code] || 'Speech recognition failed.');
      setTimeout(() => ui.setStatus(statusEl, ''), 4500);
    }
  });

  micBtn.addEventListener('click', () => {
    cancelReview();
    speech.unlockSpeech();
    speech.stopSpeaking();
    if (listening) {
      listener.stop();
      return;
    }
    dictationBase = textEl.value.trim();
    speechError = false;
    try {
      listener.start();
      setListening(true);
      ui.setStatus(statusEl, dictationBase ? 'Listening... adding to your message' : 'Listening... speak German');
    } catch {
      setListening(false);
    }
  });
}

/* ---------- controls ---------- */

function setupControls() {
  const levelSel = $('sel-level');

  levelSel.value = settings.level;
  if (!levelSel.value) levelSel.value = 'B1';
  levelSel.addEventListener('change', () => updateSetting({ level: levelSel.value }));

  for (const btn of document.querySelectorAll('#mode-group button')) {
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
  for (const btn of document.querySelectorAll('#mode-group button')) {
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

  const auto = document.createElement('option');
  auto.value = '';
  auto.textContent = 'Automatic (suits the partner)';
  select.append(auto);

  for (const v of voices) {
    const opt = document.createElement('option');
    opt.value = v.voiceURI;
    opt.textContent = `${v.name} (${v.lang})`;
    select.append(opt);
  }
  select.value = voices.some((v) => v.voiceURI === settings.voice) ? settings.voice : '';
}

function fillAvatars() {
  const box = $('set-avatar');
  box.replaceChildren();
  for (const id of AVATAR_IDS) {
    const label = document.createElement('label');
    label.className = 'avatar-option';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'avatar';
    radio.value = id;
    radio.checked = id === settings.avatar;

    const card = document.createElement('span');
    card.className = 'avatar-card';
    const img = document.createElement('img');
    img.src = AVATARS[id].image;
    img.alt = '';
    const name = document.createElement('span');
    name.textContent = AVATARS[id].name;
    const detail = document.createElement('small');
    detail.textContent = PERSONAS[id].tagline;
    card.append(img, name, detail);

    label.append(radio, card);
    box.append(label);
  }
}

function openSettings() {
  // The dialog keeps its last result, so Escape would otherwise count as Save.
  dlg.returnValue = '';
  $('set-key').value = settings.apiKey;
  $('set-model').value = settings.model;
  $('set-rate').value = settings.rate;
  $('out-rate').textContent = Number(settings.rate).toFixed(2) + 'x';
  $('set-autospeak').checked = settings.autoSpeak;
  $('set-autosend').checked = settings.autoSend;
  $('mistake-count').textContent = `${store.loadMistakes().length} recurring mistakes remembered.`;
  fillVoices();
  fillAvatars();
  dlg.showModal();
}

function setupSettings() {
  $('set-rate').addEventListener('input', (e) => {
    $('out-rate').textContent = Number(e.target.value).toFixed(2) + 'x';
  });

  $('btn-testvoice').addEventListener('click', () => {
    speech.unlockSpeech();
    const picked = document.querySelector('#set-avatar input:checked');
    const p = PERSONAS[picked ? picked.value : settings.avatar];
    speech.speak(`Hallo! Ich bin ${p.name}. Wollen wir anfangen?`, {
      voiceURI: $('set-voice').value,
      rate: Number($('set-rate').value),
      gender: p.gender,
      voicePick: p.voicePick
    });
  });

  $('btn-clearmistakes').addEventListener('click', () => {
    store.clearMistakes();
    $('mistake-count').textContent = '0 recurring mistakes remembered.';
  });

  $('btn-cancel').addEventListener('click', () => dlg.close('cancel'));

  dlg.addEventListener('close', () => {
    if (dlg.returnValue !== 'save') return;
    const pickedAvatar = document.querySelector('#set-avatar input:checked');
    const before = settings.avatar;
    updateSetting({
      avatar: pickedAvatar ? pickedAvatar.value : settings.avatar,
      apiKey: $('set-key').value.trim(),
      model: $('set-model').value.trim() || store.DEFAULT_SETTINGS.model,
      voice: $('set-voice').value,
      rate: Number($('set-rate').value),
      autoSpeak: $('set-autospeak').checked,
      autoSend: $('set-autosend').checked
    });
    // A new partner brings their own conversation. Rebuilding the SVG restarts
    // its animation, so only do it for a new choice.
    if (settings.avatar !== before) {
      cancelReview();
      stopListeningForGood();
      speech.stopSpeaking();
      history = store.loadChat(settings.avatar);
      mountAvatar(avatarEl, settings.avatar);
      paintPartner();
    }
    // Turning "Read replies aloud" off also silences a reply that is playing.
    if (!settings.autoSpeak) speech.stopSpeaking();
    render();
  });
}

/* ---------- start ---------- */

mountAvatar(avatarEl, settings.avatar);
paintPartner();
paintStreak();
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
