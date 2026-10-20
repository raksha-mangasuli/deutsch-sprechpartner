// Daily practice streak. A day counts once the learner has had a real exchange
// (sent a message and got a reply). Days are the learner's local calendar days.

const DAY_MS = 86400000;

export const EMPTY_STREAK = { last: '', count: 0, best: 0 };

// Local date as YYYY-MM-DD.
export function dayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Whole days since 1970 for a YYYY-MM-DD key. Built from UTC parts, so a daylight
// saving change can never make a day 23 or 25 hours long.
function dayNumber(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

// Call when the learner has had a real exchange. Returns the new state.
export function recordPractice(state, today = dayKey()) {
  if (state.last && dayNumber(today) <= dayNumber(state.last)) return state;
  const gap = state.last ? dayNumber(today) - dayNumber(state.last) : Infinity;
  const count = gap === 1 ? state.count + 1 : 1;
  return { last: today, count, best: Math.max(state.best, count) };
}

// What to show today:
//   doneToday: practised today, the streak is safe
//   count > 0 and not doneToday: still alive, practise today to keep it
//   count 0: no streak (never started, or a day was missed)
export function streakStatus(state, today = dayKey()) {
  if (!state.last) return { count: 0, doneToday: false };
  const gap = dayNumber(today) - dayNumber(state.last);
  // A clock set back counts as today, so a streak is never lost to a wrong clock.
  if (gap <= 0) return { count: state.count, doneToday: true };
  if (gap === 1) return { count: state.count, doneToday: false };
  return { count: 0, doneToday: false };
}

// Accepts anything read from storage and returns a safe state.
export function sanitizeStreak(raw) {
  const isCount = (n) => Number.isInteger(n) && n >= 0 && n < 100000;
  if (!raw || typeof raw !== 'object') return { ...EMPTY_STREAK };
  const validDay = typeof raw.last === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.last);
  if (!validDay || !isCount(raw.count)) return { ...EMPTY_STREAK };
  return { last: raw.last, count: raw.count, best: isCount(raw.best) ? Math.max(raw.best, raw.count) : raw.count };
}
