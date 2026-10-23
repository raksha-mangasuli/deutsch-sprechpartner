// Daily practice streak. A day counts once the learner has had a real exchange
// (sent a message and got a reply). Days are the learner's local calendar days.

const DAY_MS = 86400000;

const MAX_DAYS = 800;

export const EMPTY_STREAK = { last: '', count: 0, best: 0, days: [] };

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
  const days = [...(state.days || []), today].slice(-MAX_DAYS);
  return { last: today, count, best: Math.max(state.best, count), days };
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
  const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const days = Array.isArray(raw.days) ? raw.days.filter(isDay).slice(-MAX_DAYS) : [];
  // Streaks saved before the calendar existed: rebuild the current run from the count.
  if (!days.length) {
    const [y, m, d] = raw.last.split('-').map(Number);
    for (let i = raw.count - 1; i >= 0; i--) days.push(dayKey(new Date(y, m - 1, d - i)));
  }
  return { last: raw.last, count: raw.count, best: isCount(raw.best) ? Math.max(raw.best, raw.count) : raw.count, days };
}

// Whole Monday-to-Sunday rows covering one month. Days spilling in from the
// neighbouring months are flagged `outside`. A week counts as kept if any day in
// it was practised, and every cell in that row carries `week`.
export function monthGrid(year, month, practised) {
  const set = new Set(practised);
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const total = new Date(year, month + 1, 0).getDate();
  const rows = Math.ceil((lead + total) / 7);
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const row = Array.from({ length: 7 }, (_, c) => {
      const date = new Date(year, month, r * 7 + c - lead + 1);
      const key = dayKey(date);
      return { day: date.getDate(), key, practised: set.has(key), outside: date.getMonth() !== month };
    });
    const week = row.some((cell) => cell.practised);
    cells.push(...row.map((cell) => ({ ...cell, week })));
  }
  return cells;
}

// Monday-based week number (1 Jan 1970 was a Thursday).
const weekNumber = (key) => Math.floor((dayNumber(key) + 3) / 7);

// Consecutive weeks with any practice, and the best such run ever. The current
// week keeps a run alive even before the learner has practised in it.
export function weekStreaks(days, today = dayKey()) {
  const weeks = [...new Set(days.map(weekNumber))].sort((a, b) => a - b);
  const set = new Set(weeks);
  let best = 0;
  let run = 0;
  weeks.forEach((w, i) => {
    run = i > 0 && w === weeks[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  const now = weekNumber(today);
  let w = set.has(now) ? now : now - 1;
  let current = 0;
  while (set.has(w)) { current++; w--; }
  return { current, best };
}
