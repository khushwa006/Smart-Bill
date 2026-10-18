// Pure date helpers. ISO strings (YYYY-MM-DD) are used everywhere; no Date parsing of those strings
// (avoids the off-by-one-day bugs that timezone conversion causes).
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n) => String(n).padStart(2, "0");

export function parseIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? { y, m: mo, d } : null;
}
export const toIso = ({ y, m, d }) => `${String(y).padStart(4, "0")}-${pad(m)}-${pad(d)}`;
const toUtc = (iso) => { const p = parseIso(iso); return Date.UTC(p.y, p.m - 1, p.d); };
const fromUtc = (ms) => { const d = new Date(ms); return toIso({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }); };

export const addDays = (iso, n) => fromUtc(toUtc(iso) + n * 86400000);
export const diffDays = (a, b) => Math.round((toUtc(a) - toUtc(b)) / 86400000);            // a - b
export const dayOfWeek = (iso) => new Date(toUtc(iso)).getUTCDay();                         // 0 = Sunday
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const monthStart = (iso) => iso.slice(0, 8) + "01";
export const monthEnd = (iso) => { const p = parseIso(iso); return toIso({ y: p.y, m: p.m, d: daysInMonth(p.y, p.m) }); };
export function addMonths(iso, n) {
  const p = parseIso(iso); const t = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(t / 12), m = (t % 12 + 12) % 12 + 1;
  return toIso({ y, m, d: Math.min(p.d, daysInMonth(y, m)) });
}
export const startOfWeek = (iso) => addDays(iso, -dayOfWeek(iso));                          // week starts Sunday

export function fmtDate(iso, withYear = true) {
  const p = parseIso(iso); if (!p) return "";
  return `${p.d} ${MONTHS[p.m - 1]}${withYear ? " " + p.y : ""}`;
}
export function fmtMonth(isoOrYm) { const [y, m] = isoOrYm.slice(0, 7).split("-").map(Number); return `${MONTHS_LONG[m - 1]} ${y}`; }
export const fmtMonthShort = (ym) => { const [y, m] = ym.split("-").map(Number); return `${MONTHS[m - 1]} ${String(y).slice(2)}`; };
export const weekdayShort = (i) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i];

/** "today" in the user's timezone as ISO date. */
export function todayIso(timeZone = "Asia/Kolkata", now = new Date()) {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
  catch { return fromUtc(now.getTime()); }
}

/** 6 rows x 7 days (Sunday first) covering the month of `iso`. */
export function monthGrid(iso) {
  const first = monthStart(iso), start = startOfWeek(first), month = iso.slice(0, 7);
  return Array.from({ length: 42 }, (_, i) => { const d = addDays(start, i); return { date: d, inMonth: d.startsWith(month) }; });
}

export function relativeDays(iso, today) {
  const n = diffDays(iso, today);
  if (n === 0) return "today"; if (n === 1) return "tomorrow"; if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
