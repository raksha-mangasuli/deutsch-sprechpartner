// Thin wrapper around localStorage. Every access is guarded because storage
// can be unavailable (private windows, blocked site data).

const KEYS = {
  settings: 'sp.settings',
  chat: 'sp.chat',
  mistakes: 'sp.mistakes'
};

export const DEFAULT_SETTINGS = {
  apiKey: '',
  model: 'claude-haiku-4-5',
  level: 'B1',
  topic: 'free',
  mode: 'each',
  voiceURI: '',
  rate: 0.95,
  autoSpeak: true,
  autoSend: true
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) };
}

export function saveSettings(settings) {
  write(KEYS.settings, settings);
}

export function loadChat() {
  const chat = read(KEYS.chat, []);
  return Array.isArray(chat) ? chat : [];
}

export function saveChat(chat) {
  write(KEYS.chat, chat);
}

export function loadMistakes() {
  const list = read(KEYS.mistakes, []);
  return Array.isArray(list) ? list : [];
}

// Merge new mistakes into the stored list. Entries with the same corrected
// form are counted together so recurring errors rise to the top.
export function addMistakes(newOnes) {
  if (!Array.isArray(newOnes) || newOnes.length === 0) return;
  const list = loadMistakes();
  const now = Date.now();

  for (const m of newOnes) {
    if (!m || !m.right) continue;
    const key = String(m.right).trim().toLowerCase();
    const hit = list.find((x) => x.key === key);
    if (hit) {
      hit.count += 1;
      hit.last = now;
      if (m.rule) hit.rule = m.rule;
      if (m.wrong) hit.wrong = m.wrong;
    } else {
      list.push({
        key,
        wrong: String(m.wrong || ''),
        right: String(m.right),
        rule: String(m.rule || ''),
        count: 1,
        last: now
      });
    }
  }

  list.sort((a, b) => b.count - a.count || b.last - a.last);
  write(KEYS.mistakes, list.slice(0, 40));
}

export function clearMistakes() {
  write(KEYS.mistakes, []);
}
