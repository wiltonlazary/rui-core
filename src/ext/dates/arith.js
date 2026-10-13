// Date arithmetic. A date is a 'YYYY-MM-DD' string: no time zone, no
// clock, compared as text.
// Inside, a date is its day number (days since 1970-01-01, proleptic
// Gregorian), so adding days, weeks and months is integer arithmetic. A
// time is 'HH:mm' or 'HH:mm:ss', inside a number of seconds since midnight. A Date given anywhere is read by its local fields.

/** @typedef {string} DateString 'YYYY-MM-DD' */
/** @typedef {DateString | Date} DateValue */
/** @typedef {'month' | 'year' | 'decade'} CalendarView */

/** English month names, January first. */
export const MONTHS = Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);
/** English weekday names, Sunday first (a day's weekday is its index). */
export const WEEKDAYS = Object.freeze(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);

/**
 * The words the date components show; any of them overridden by a
 * `labels` prop (or DateSettings'), for another language.
 * @typedef {object} DatesLabels
 * @property {readonly string[]} months 12 names, January first ('MMMM')
 * @property {readonly string[]} monthsAbbr 12 abbreviated names ('MMM')
 * @property {readonly string[]} weekdays 7 names, Sunday first ('EEEE')
 * @property {readonly string[]} weekdaysAbbr 7 abbreviated names ('EEE', the grid's header)
 * @property {readonly string[]} weekdaysNarrow 7 narrow names, one letter each ('EEEEE', DayStrip's)
 * @property {string} am
 * @property {string} pm
 * @property {string} previousMonth
 * @property {string} nextMonth
 * @property {string} previousYear
 * @property {string} nextYear
 * @property {string} previousDecade
 * @property {string} nextDecade
 * @property {string} previousDays DayStrip's
 * @property {string} nextDays DayStrip's
 * @property {string} week the week numbers' column heading
 */

/** @type {DatesLabels} */
export const DATES_LABELS = Object.freeze({
  months: MONTHS,
  monthsAbbr: Object.freeze(MONTHS.map(m => m.slice(0, 3))),
  weekdays: WEEKDAYS,
  weekdaysAbbr: Object.freeze(WEEKDAYS.map(d => d.slice(0, 3))),
  weekdaysNarrow: Object.freeze(WEEKDAYS.map(d => d[0])),
  am: 'AM',
  pm: 'PM',
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  previousYear: 'Previous year',
  nextYear: 'Next year',
  previousDecade: 'Previous decade',
  nextDecade: 'Next decade',
  previousDays: 'Previous days',
  nextDays: 'Next days',
  week: 'Wk',
});

/** Labels over the English ones. @param {Partial<DatesLabels> | null | undefined} labels @returns {DatesLabels} */
export const labelsOf = labels => (labels == null ? DATES_LABELS : { ...DATES_LABELS, ...labels });

// ---------------------------------------------------------------------------
// Day numbers

/** Floor division. @param {number} a @param {number} b */
const div = (a, b) => Math.floor(a / b);

/**
 * The day number of a civil date (month 1 to 12).
 * @param {number} y @param {number} m @param {number} d
 */
export function dayNumber(y, m, d) {
  const yy = m <= 2 ? y - 1 : y;
  const era = div(yy, 400);
  const yoe = yy - era * 400;
  const doy = div(153 * (m + (m > 2 ? -3 : 9)) + 2, 5) + d - 1;
  const doe = yoe * 365 + div(yoe, 4) - div(yoe, 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The civil date of a day number: [year, month 1 to 12, day]. @param {number} n @returns {[number, number, number]} */
export function civil(n) {
  const z = n + 719468;
  const era = div(z, 146097);
  const doe = z - era * 146097;
  const yoe = div(doe - div(doe, 1460) + div(doe, 36524) - div(doe, 146096), 365);
  const doy = doe - (365 * yoe + div(yoe, 4) - div(yoe, 100));
  const mp = div(5 * doy + 2, 153);
  const d = doy - div(153 * mp + 2, 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d];
}

/** Two digits. @param {number} n */
const two = n => (n < 10 ? `0${n}` : String(n));
/** Four digits (years 0 to 9999). @param {number} n */
const four = n => (n < 0 ? `-${String(-n).padStart(4, '0')}` : String(n).padStart(4, '0'));

/** A civil date as 'YYYY-MM-DD'. @param {number} y @param {number} m @param {number} d @returns {DateString} */
export const dateString = (y, m, d) => `${four(y)}-${two(m)}-${two(d)}`;

/** A day number as 'YYYY-MM-DD'. @param {number} n @returns {DateString} */
export function fromDays(n) {
  const [y, m, d] = civil(n);
  return dateString(y, m, d);
}

const DATE = /^(-?\d{4,})-(\d{2})-(\d{2})/;

/**
 * A date as 'YYYY-MM-DD': a string starting with one (a time after it is
 * dropped), or a Date's local day; null for anything else or an impossible
 * day ('2023-02-29').
 * @param {DateValue | null | undefined} value
 * @returns {DateString | null}
 */
export function toDate(value) {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : dateString(value.getFullYear(), value.getMonth() + 1, value.getDate());
  const m = DATE.exec(String(value));
  if (m === null) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return dateString(y, mo, d);
}

/** The day number of a date (NaN when it is none). @param {DateValue} value */
export function toDays(value) {
  const s = toDate(value);
  if (s === null) return NaN;
  const m = /** @type {RegExpExecArray} */ (DATE.exec(s));
  return dayNumber(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** A date's parts: [year, month 1 to 12, day]. @param {DateValue} value @returns {[number, number, number]} */
export const partsOf = value => civil(toDays(value));

/** Whether a year is a leap year. @param {number} year */
export const isLeapYear = year => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** The days in a month (1 to 12). @param {number} year @param {number} month */
export const daysInMonth = (year, month) => (month === 2 ? (isLeapYear(year) ? 29 : 28) : month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31);

/** The weekday of a date, 0 Sunday to 6 Saturday. @param {DateValue} value */
export const dayOfWeek = value => (((toDays(value) + 4) % 7) + 7) % 7;

/** A date `n` days later (earlier when negative). @param {DateValue} value @param {number} n */
export const addDays = (value, n) => fromDays(toDays(value) + n);

/**
 * A date `n` months later, its day kept within the new month (Jan 31 plus
 * one month is the last of February).
 * @param {DateValue} value @param {number} n
 */
export function addMonths(value, n) {
  const [y, m, d] = partsOf(value);
  const index = y * 12 + (m - 1) + n;
  const ny = div(index, 12);
  const nm = index - ny * 12 + 1;
  return dateString(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

/** A date `n` years later (Feb 29 goes to Feb 28 off a leap year). @param {DateValue} value @param {number} n */
export const addYears = (value, n) => addMonths(value, n * 12);

/** The first day of a date's month. @param {DateValue} value */
export function startOfMonth(value) {
  const [y, m] = partsOf(value);
  return dateString(y, m, 1);
}

/** The last day of a date's month. @param {DateValue} value */
export function endOfMonth(value) {
  const [y, m] = partsOf(value);
  return dateString(y, m, daysInMonth(y, m));
}

/** January 1st of a date's year. @param {DateValue} value */
export const startOfYear = value => dateString(partsOf(value)[0], 1, 1);

/** December 31st of a date's year. @param {DateValue} value */
export const endOfYear = value => dateString(partsOf(value)[0], 12, 31);

/** January 1st of the first year of a date's decade (2020 for 2024). @param {DateValue} value */
export const startOfDecade = value => dateString(div(partsOf(value)[0], 10) * 10, 1, 1);

/** The first day of a date's week, the week starting on `weekStart` (0 Sunday, 1 Monday…). @param {DateValue} value @param {number} [weekStart] */
export const startOfWeek = (value, weekStart = 1) => addDays(value, -((dayOfWeek(value) - weekStart + 7) % 7));

/** The last day of a date's week. @param {DateValue} value @param {number} [weekStart] */
export const endOfWeek = (value, weekStart = 1) => addDays(startOfWeek(value, weekStart), 6);

/** Negative, zero or positive as `a` is before, on or after `b`. @param {DateValue} a @param {DateValue} b */
export const compareDates = (a, b) => toDays(a) - toDays(b);

/** Whether two dates are the same day. @param {DateValue | null | undefined} a @param {DateValue | null | undefined} b */
export const sameDate = (a, b) => a != null && b != null && toDate(a) === toDate(b);

/** Whether two dates are in the same month. @param {DateValue} a @param {DateValue} b */
export const sameMonth = (a, b) => startOfMonth(a) === startOfMonth(b);

/** Whether a date is within [from, to] (either order, inclusive). @param {DateValue} value @param {DateValue} from @param {DateValue} to */
export function within(value, from, to) {
  const n = toDays(value);
  const a = toDays(from);
  const b = toDays(to);
  return n >= Math.min(a, b) && n <= Math.max(a, b);
}

/**
 * A date kept within bounds (either bound may be missing).
 * @param {DateValue} value @param {DateValue | null | undefined} min @param {DateValue | null | undefined} max
 * @returns {DateString}
 */
export function clampDay(value, min, max) {
  let n = toDays(value);
  if (min != null) n = Math.max(n, toDays(min));
  if (max != null) n = Math.min(n, toDays(max));
  return fromDays(n);
}

/** The ISO 8601 week number of a date (weeks start on Monday; week 1 holds the first Thursday). @param {DateValue} value */
export function weekNumber(value) {
  const n = toDays(value);
  const thursday = n - ((dayOfWeek(value) + 6) % 7) + 3;
  const year = civil(thursday)[0];
  return Math.floor((thursday - dayNumber(year, 1, 1)) / 7) + 1;
}

// ---------------------------------------------------------------------------
// Grids

/**
 * The weeks shown for a month: whole weeks from
 * the week holding the 1st to the week holding the last day, starting on
 * `weekStart`; days of the months around it fill the edges. With
 * `sixWeeks`, always six weeks.
 * @param {DateValue} month any day of the month
 * @param {number} [weekStart] 0 Sunday to 6 Saturday (1 by default)
 * @param {boolean} [sixWeeks]
 * @returns {DateString[][]}
 */
export function monthDays(month, weekStart = 1, sixWeeks = false) {
  const first = toDays(startOfMonth(month));
  const last = toDays(endOfMonth(month));
  const start = toDays(startOfWeek(fromDays(first), weekStart));
  const end = toDays(endOfWeek(fromDays(last), weekStart));
  const count = sixWeeks ? 6 : (end - start + 1) / 7;
  /** @type {DateString[][]} */
  const weeks = [];
  for (let w = 0; w < count; w++) {
    /** @type {DateString[]} */
    const week = [];
    for (let d = 0; d < 7; d++) week.push(fromDays(start + w * 7 + d));
    weeks.push(week);
  }
  return weeks;
}

/** A year's months as a grid of four rows of three, each the 1st of the month. @param {DateValue} year any day of the year @returns {DateString[][]} */
export function yearMonths(year) {
  const y = partsOf(year)[0];
  /** @type {DateString[][]} */
  const rows = [];
  for (let r = 0; r < 4; r++) rows.push([1, 2, 3].map(c => dateString(y, r * 3 + c, 1)));
  return rows;
}

/**
 * A decade's years in four rows of three, each January 1st: the year
 * before it, its ten years, and the year after it (a full grid; the two
 * outside years are the neighbors' ends).
 * @param {DateValue} decade any day of the decade @returns {DateString[][]}
 */
export function decadeYears(decade) {
  const y = partsOf(startOfDecade(decade))[0] - 1;
  /** @type {DateString[][]} */
  const rows = [];
  for (let r = 0; r < 4; r++) rows.push([0, 1, 2].map(c => dateString(y + r * 3 + c, 1, 1)));
  return rows;
}

/** The weekday names of a grid's header (abbreviated), starting on `weekStart`. @param {number} [weekStart] @param {readonly string[]} [names] 7 names, Sunday first */
export const weekdayNames = (weekStart = 1, names = DATES_LABELS.weekdaysAbbr) => Array.from({ length: 7 }, (_, i) => names[(weekStart + i) % 7]);

/** Whether a month has a day within [min, max]. @param {DateValue} month @param {DateValue | null | undefined} min @param {DateValue | null | undefined} max */
export const monthInRange = (month, min, max) => !((min != null && compareDates(endOfMonth(month), min) < 0) || (max != null && compareDates(startOfMonth(month), max) > 0));

/** Whether a year has a day within [min, max]. @param {DateValue} year @param {DateValue | null | undefined} min @param {DateValue | null | undefined} max */
export const yearInRange = (year, min, max) => !((min != null && compareDates(endOfYear(year), min) < 0) || (max != null && compareDates(startOfYear(year), max) > 0));

// ---------------------------------------------------------------------------
// Formats

const TOKENS = /YYYY|YY|MMMM|MMM|MM|M|DD|D|EEEEE|EEEE|EEE|e|HH|H|hh|h|mm|m|ss|s|a|'(?:[^']|'')*'/g;

/**
 * A date (and time) as text. The format tokens:
 * - YYYY the year (2024), YY its last two digits (24);
 * - MMMM the month's name (March), MMM abbreviated (Mar), MM its number
 *   in two digits (03), M its number (3);
 * - DD the day of the month in two digits (05), D the day (5);
 * - EEEE the weekday's name (Tuesday), EEE abbreviated (Tue), EEEEE narrow
 *   (T, one letter), e its number (0 Sunday to 6 Saturday);
 * - HH the hour 0 to 23 in two digits, H without padding; hh the hour 1 to
 *   12 in two digits, h without padding; mm and m the minutes; ss and s the
 *   seconds; a the AM or PM label;
 * - 'text' in single quotes is literal, '' is a single quote.
 * Any other character stands for itself. Names come from `labels`.
 * @param {DateValue | null | undefined} value 'YYYY-MM-DD', 'YYYY-MM-DD HH:mm:ss' or a Date
 * @param {string} format
 * @param {Partial<DatesLabels> | null} [labels]
 */
export function formatDate(value, format, labels = null) {
  if (value == null) return '';
  const day = toDate(value);
  if (day === null) return '';
  const L = labelsOf(labels);
  const [y, m, d] = partsOf(day);
  const wd = dayOfWeek(day);
  const secs = value instanceof Date ? value.getHours() * 3600 + value.getMinutes() * 60 + value.getSeconds() : (toSeconds(String(value).slice(11)) ?? 0);
  const H = Math.floor(secs / 3600);
  const mi = Math.floor(secs / 60) % 60;
  const s = secs % 60;
  const h12 = H % 12 === 0 ? 12 : H % 12;
  return format.replace(TOKENS, t => {
    switch (t) {
      case 'YYYY': return four(y);
      case 'YY': return two(((y % 100) + 100) % 100);
      case 'MMMM': return L.months[m - 1];
      case 'MMM': return L.monthsAbbr[m - 1];
      case 'MM': return two(m);
      case 'M': return String(m);
      case 'DD': return two(d);
      case 'D': return String(d);
      case 'EEEE': return L.weekdays[wd];
      case 'EEE': return L.weekdaysAbbr[wd];
      case 'EEEEE': return L.weekdaysNarrow[wd];
      case 'e': return String(wd);
      case 'HH': return two(H);
      case 'H': return String(H);
      case 'hh': return two(h12);
      case 'h': return String(h12);
      case 'mm': return two(mi);
      case 'm': return String(mi);
      case 'ss': return two(s);
      case 's': return String(s);
      case 'a': return H < 12 ? L.am : L.pm;
      default: return literal(t);
    }
  });
}

/** A quoted literal's text ('' is a single quote). @param {string} t */
const literal = t => (t === "''" ? "'" : t.slice(1, -1).replace(/''/g, "'"));

/** @param {string} s */
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Each named token's labels. @type {Record<string, (L: DatesLabels) => readonly string[]>} */
const NAMED = {
  MMMM: L => L.months,
  MMM: L => L.monthsAbbr,
  EEEE: L => L.weekdays,
  EEE: L => L.weekdaysAbbr,
  EEEEE: L => L.weekdaysNarrow,
  a: L => [L.am, L.pm],
};

/**
 * Text read back through a format (the inverse of `formatDate` for its
 * date tokens; names matched without case): the date, or null when the text
 * does not match or names an impossible day.
 * @param {string} text @param {string} format @param {Partial<DatesLabels> | null} [labels]
 * @returns {DateString | null}
 */
export function parseDate(text, format, labels = null) {
  const L = labelsOf(labels);
  /** @type {string[]} */
  const order = [];
  let source = '^';
  let last = 0;
  for (const match of format.matchAll(TOKENS)) {
    source += escape(format.slice(last, match.index));
    last = /** @type {number} */ (match.index) + match[0].length;
    const t = match[0];
    if (t[0] === "'") {
      source += escape(literal(t));
      continue;
    }
    order.push(t);
    const names = NAMED[t]?.(L);
    // A named token matches one of its labels, longest first, so a dotted one ('janv.', 'a.m.') reads back whole.
    if (names !== undefined) source += `(${[...names].sort((x, y) => y.length - x.length).map(escape).join('|')})`;
    else if (t === 'YYYY') source += '(\\d{4})';
    else source += '(\\d{1,2})';
  }
  source += `${escape(format.slice(last))}$`;
  const m = new RegExp(source, 'i').exec(text.trim());
  if (m === null) return null;
  let y = NaN;
  let mo = NaN;
  let d = NaN;
  const named = (/** @type {readonly string[]} */ names, /** @type {string} */ v) => names.findIndex(n => n.toLowerCase() === v.toLowerCase());
  for (let i = 0; i < order.length; i++) {
    const v = m[i + 1];
    switch (order[i]) {
      case 'YYYY': y = Number(v); break;
      case 'YY': y = 2000 + Number(v); break;
      case 'MMMM': mo = named(L.months, v) + 1; break;
      case 'MMM': mo = named(L.monthsAbbr, v) + 1; break;
      case 'MM': case 'M': mo = Number(v); break;
      case 'DD': case 'D': d = Number(v); break;
      default: break;
    }
  }
  if (!(mo >= 1 && mo <= 12) || !(d >= 1) || Number.isNaN(y)) return null;
  return d > daysInMonth(y, mo) ? null : dateString(y, mo, d);
}

// ---------------------------------------------------------------------------
// Times

const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/** A time 'HH:mm' or 'HH:mm:ss' as seconds since midnight, or null. @param {string | null | undefined} time */
export function toSeconds(time) {
  if (time == null) return null;
  const m = TIME.exec(String(time).trim());
  if (m === null) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const s = m[3] === undefined ? 0 : Number(m[3]);
  if (h > 23 || mi > 59 || s > 59) return null;
  return h * 3600 + mi * 60 + s;
}

/** Seconds since midnight as 'HH:mm:ss' (or 'HH:mm' without seconds). @param {number} total @param {boolean} [seconds] */
export function fromSeconds(total, seconds = true) {
  const t = ((Math.round(total) % 86400) + 86400) % 86400;
  const text = `${two(Math.floor(t / 3600))}:${two(Math.floor(t / 60) % 60)}`;
  return seconds ? `${text}:${two(t % 60)}` : text;
}

/**
 * A time as shown: 24-hour 'HH:mm[:ss]', or 12-hour 'h:mm[:ss] AM'.
 * @param {string} time @param {{ format?: '12h' | '24h', seconds?: boolean, periods?: { am: string, pm: string } }} [o]
 */
export function formatTime(time, o = {}) {
  const t = toSeconds(time);
  if (t === null) return '';
  if (o.format !== '12h') return fromSeconds(t, o.seconds === true);
  const h = Math.floor(t / 3600);
  const rest = fromSeconds(t, o.seconds === true).slice(2);
  const labels = o.periods ?? { am: 'AM', pm: 'PM' };
  return `${h % 12 === 0 ? 12 : h % 12}${rest} ${h < 12 ? labels.am : labels.pm}`;
}

/**
 * The times from `from` to `to` (inclusive) every `minutes`, as
 * 'HH:mm:ss': `timeRange('09:00', '12:00', 30)`.
 * @param {string} from @param {string} to @param {number} minutes
 */
export function timeRange(from, to, minutes) {
  const start = toSeconds(from);
  const end = toSeconds(to);
  const every = Math.round(Number(minutes) * 60);
  if (start === null || end === null || !(every > 0)) return [];
  /** @type {string[]} */
  const out = [];
  for (let t = start; t <= end; t += every) out.push(fromSeconds(t));
  return out;
}

/** A 'YYYY-MM-DD HH:mm:ss' date and time from its parts. @param {DateString} date @param {string} time */
export const dateTime = (date, time) => `${date} ${fromSeconds(toSeconds(time) ?? 0)}`;
