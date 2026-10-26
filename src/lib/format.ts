export type Lang = 'en' | 'ur' | 'ps';

/** Pick a string for the active language, falling back to English. */
export function tl(lang: Lang, en: string, ur: string, ps: string): string {
  if (lang === 'ur') return ur;
  if (lang === 'ps') return ps;
  return en;
}

export function formatPKR(amount: number): string {
  if (isNaN(amount)) return '0';
  const abs = Math.abs(amount);
  // Pakistani lakh/crore format: 1,23,456
  const str = Math.floor(abs).toString();
  let formatted = '';
  if (str.length <= 3) {
    formatted = str;
  } else {
    const last3 = str.slice(-3);
    let rem = str.slice(0, -3);
    const parts: string[] = [];
    while (rem.length > 2) {
      parts.unshift(rem.slice(-2));
      rem = rem.slice(0, -2);
    }
    if (rem) parts.unshift(rem);
    formatted = parts.join(',') + ',' + last3;
  }
  // Only show decimals when the value actually has cents
  const cents = abs % 1;
  const decimals = cents >= 0.005 ? cents.toFixed(2).slice(1) : '';
  return `${formatted}${decimals}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Parse YYYY-MM-DD manually to avoid the JS spec's UTC-midnight interpretation.
export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts.map(p => parseInt(p, 10));
  if (isNaN(y) || isNaN(m) || isNaN(d)) return dateStr;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Local calendar date as YYYY-MM-DD (toISOString would shift it to UTC). */
export function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Local time as HH:MM, for <input type="time">. */
export function localHM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return localISO(new Date());
}

/** "3:05 PM" from a stored timestamp (ISO, or SQLite's "YYYY-MM-DD HH:MM:SS" UTC from mobile backups). */
export function formatTime(ts: string): string {
  const normalized = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return '';
  const h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${(h % 12) || 12}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
}

export function parseTimestamp(ts: string): Date | null {
  const d = new Date(ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? null : d;
}

export function shortDate(s: string): string {
  const d = parseLocalDate(s);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

/** Shrink a number's font so long amounts stay on one line (stand-in for RN's adjustsFontSizeToFit). */
export function fitFont(text: string, base: number, capChars: number, min = 9): string {
  const len = text.length;
  const size = len <= capChars ? base : Math.max(min, (base * capChars) / len);
  return `calc(${size.toFixed(1)}px * var(--ts))`;
}
