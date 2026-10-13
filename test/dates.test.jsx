// rui-core/dates: the date arithmetic (pure), and every component on the DOM
// and on Skia with the same text, presses, keys and state. Dates are fixed;
// "today" is always injected.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $write, $flush } from 'rrx-core';
import { $active, View, Label } from 'ren-core';
import { Rui, Clock, manualClock, pageColors, BASE_THEME, themeOf } from 'rui-core';
import {
  toDate, dayNumber, civil, fromDays, isLeapYear, daysInMonth, dayOfWeek, addDays, addMonths, addYears, startOfWeek, endOfWeek,
  startOfDecade, compareDates, sameDate, sameMonth, within, clampDay, weekNumber, monthDays, yearMonths, decadeYears, weekdayNames, formatDate, parseDate,
  toSeconds, fromSeconds, formatTime, timeRange, DateSettings,
  Calendar, DatePanel, MonthPanel, YearPanel, DayStrip, TimeInput, TimePicker, TimeSlots,
  DateSelect, MonthSelect, YearSelect, DateInput, DateTimeSelect,
} from 'rui-core/dates';
import { both, onSkia } from './harness.jsx';

// ---------------------------------------------------------------------------
// Helpers: controls by their accessible label on each renderer.

/** The DOM's Action with this label or text. @param {any} dom @param {string} name */
const domAction = (dom, name) => {
  const node = dom.nodes('Action').find((/** @type {any} */ n) => n.getAttribute('aria-label') === name || n.textContent.trim() === name);
  if (node === undefined) throw new Error(`no "${name}" on the DOM in: ${dom.text()}`);
  return node;
};

/** A press area on Skia: an item with handlers. @param {any} item */
const isAction = (item) => item.events != null;
/** The text an item holds. @param {any} item @returns {string} */
const textIn = (item) => {
  if (item.first === null) return String(item.text ?? '');
  /** @type {string[]} */
  const out = [];
  for (let n = item.first; n !== null; n = n.next) out.push(textIn(n));
  return out.join('').trim();
};
/** The Skia Action with this label or text. @param {any} skia @param {string} name */
const skiaAction = (skia, name) => {
  skia.text();
  /** @type {any[]} */
  const stack = [skia.skia.root];
  while (stack.length > 0) {
    const item = stack.shift();
    if (item.label === name || (isAction(item) && textIn(item) === name)) return item;
    for (let n = item.first; n !== null; n = n.next) stack.push(n);
  }
  throw new Error(`no "${name}" on Skia in: ${skia.text()}`);
};

/** Presses the Action named `name` on each side. @param {any} dom @param {any} skia @param {string} name */
function pressBoth(dom, skia, name) {
  domAction(dom, name).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  $flush(dom.root);
  const item = skiaAction(skia, name);
  skia.skia.present();
  const r = item.getBoundingClientRect();
  skia.skia.press(r.x + r.width / 2, r.y + r.height / 2);
  skia.skia.release(r.x + r.width / 2, r.y + r.height / 2);
  $flush(skia.root);
}

/** Focuses the Action named `name` on each side. @param {any} dom @param {any} skia @param {string} name */
function focusBoth(dom, skia, name) {
  domAction(dom, name).focus();
  skiaAction(skia, name).focus();
}

/** A key on the focused item of each side. @param {any} dom @param {any} skia @param {string} key @param {boolean} [shift] */
function keyBoth(dom, skia, key, shift = false) {
  dom.document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true, cancelable: true }));
  $flush(dom.root);
  skia.skia.key(key, shift);
  $flush(skia.root);
  $flush(dom.root);
}

/** The focused control's label on each side. @param {any} dom @param {any} skia */
const focused = (dom, skia) => [dom.document.activeElement.getAttribute('aria-label'), skia.skia.focused?.label ?? null];

/** Per-root values: each renderer's root keeps its own signal. */
function perRoot() {
  /** @type {any[]} */
  const list = [];
  return {
    list,
    /** @param {any} initial */
    make(initial) {
      const s = $signal($active(), initial);
      list.push(s);
      return s;
    },
    values: () => list.map(s => $read(s)),
  };
}

/** Both texts. @param {any} dom @param {any} skia */
const texts = (dom, skia) => [dom.text(), skia.text()];

/** Asserts both renderers show the same text, and returns it. @param {any} dom @param {any} skia */
function same(dom, skia) {
  const [a, b] = texts(dom, skia);
  assert.equal(a, b);
  return a;
}

// ---------------------------------------------------------------------------
// Arithmetic

describe('calendar keys at the range\'s edges', () => {
  it('Home and End reach the nearest day, month or year in range when min or max cuts the row', async () => {
    const { onDom } = await import('./harness.jsx');
    const cases = [
      [DatePanel, 'Thursday, 14 March 2024', 'Home', 'Wednesday, 13 March 2024'],
      [DatePanel, 'Wednesday, 20 March 2024', 'End', 'Friday, 22 March 2024'],
      [MonthPanel, 'June 2024', 'Home', 'March 2024'],
      [YearPanel, '2025', 'Home', '2024'],
      [YearPanel, '2025', 'End', '2027'],
    ];
    const bounds = /** @type {Record<string, [string, string, string]>} */ ({ DatePanel: ['2024-03-01', '2024-03-13', '2024-03-22'], MonthPanel: ['2024-01-01', '2024-03-15', '2024-12-31'], YearPanel: ['2024-01-01', '2024-03-15', '2027-10-10'] });
    for (const [Panel, from, k, want] of /** @type {[any, string, string, string][]} */ (cases)) {
      const [period, min, max] = bounds[Panel.name];
      const v = onDom(() => (
        <Rui>
          <Panel defaultPeriod={period} min={min} max={max} />
        </Rui>
      ));
      v.text();
      const cell = v.nodes('Action').find((/** @type {any} */ n) => n.getAttribute('aria-label') === from);
      cell.focus();
      v.document.activeElement.dispatchEvent(new v.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      v.text();
      assert.equal(v.document.activeElement.getAttribute('aria-label'), want, `${Panel.name}: ${k} from ${from}`);
      v.dispose();
    }
  });
});

describe('date arithmetic', () => {
  it('turns civil dates into day numbers and back, across eras and leap days', () => {
    assert.equal(dayNumber(1970, 1, 1), 0);
    assert.equal(dayNumber(2000, 3, 1), 11017);
    assert.deepEqual(civil(-1), [1969, 12, 31]);
    for (let n = -800000; n < 800000; n += 997) {
      const [y, m, d] = civil(n);
      assert.equal(dayNumber(y, m, d), n);
    }
    assert.equal(fromDays(dayNumber(2024, 2, 29)), '2024-02-29');
  });

  it('reads dates, rejecting impossible days', () => {
    assert.equal(toDate('2024-02-29'), '2024-02-29');
    assert.equal(toDate('2023-02-29'), null);
    assert.equal(toDate('2024-13-01'), null);
    assert.equal(toDate('2024-05-06 10:30:00'), '2024-05-06');
    assert.equal(toDate(new Date(2024, 4, 6, 23, 59)), '2024-05-06');
    assert.equal(toDate('nope'), null);
    assert.equal(toDate(null), null);
  });

  it('knows leap years and month lengths', () => {
    assert.deepEqual([1900, 2000, 2023, 2024, 2100].map(isLeapYear), [false, true, false, true, false]);
    assert.deepEqual([1, 2, 4, 12].map(m => daysInMonth(2024, m)), [31, 29, 30, 31]);
    assert.equal(daysInMonth(2023, 2), 28);
  });

  it('adds days, months and years, keeping the day within the month', () => {
    assert.equal(addDays('2023-12-31', 1), '2024-01-01');
    assert.equal(addDays('2024-03-01', -1), '2024-02-29');
    assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
    assert.equal(addMonths('2023-01-31', 1), '2023-02-28');
    assert.equal(addMonths('2024-01-15', -1), '2023-12-15');
    assert.equal(addMonths('2024-11-30', 14), '2026-01-30');
    assert.equal(addYears('2024-02-29', 1), '2025-02-28');
    assert.equal(addYears('2024-02-29', 4), '2028-02-29');
  });

  it('finds weekdays, weeks and ISO week numbers', () => {
    assert.equal(dayOfWeek('1970-01-01'), 4);
    assert.equal(dayOfWeek('2024-01-01'), 1);
    assert.equal(dayOfWeek('1969-12-28'), 0);
    assert.equal(startOfWeek('2024-01-03', 1), '2024-01-01');
    assert.equal(startOfWeek('2024-01-03', 0), '2023-12-31');
    assert.equal(endOfWeek('2024-01-03', 0), '2024-01-06');
    assert.equal(startOfWeek('2024-01-03', 6), '2023-12-30');
    assert.equal(weekNumber('2021-01-03'), 53);
    assert.equal(weekNumber('2021-01-04'), 1);
    assert.equal(weekNumber('2024-12-30'), 1);
    assert.equal(startOfDecade('2024-06-01'), '2020-01-01');
  });

  it('builds month grids for any first day of the week', () => {
    // February 2021: 28 days starting on a Monday, exactly four weeks.
    const feb = monthDays('2021-02-10', 1);
    assert.equal(feb.length, 4);
    assert.equal(feb[0][0], '2021-02-01');
    assert.equal(feb[3][6], '2021-02-28');
    // Starting on Sunday it spills into January and March.
    const sunday = monthDays('2021-02-10', 0);
    assert.equal(sunday.length, 5);
    assert.equal(sunday[0][0], '2021-01-31');
    assert.equal(sunday[4][6], '2021-03-06');
    // Six weeks always with sixWeeks.
    assert.equal(monthDays('2021-02-10', 1, true).length, 6);
    // Across a year: December 2024 from Monday.
    const dec = monthDays('2024-12-01', 1);
    assert.equal(dec[0][0], '2024-11-25');
    assert.equal(dec.at(-1)?.at(-1), '2025-01-05');
    // Leap February 2024 from Saturday.
    const leap = monthDays('2024-02-01', 6);
    assert.equal(leap[0][0], '2024-01-27');
    assert.ok(leap.flat().includes('2024-02-29'));
    for (const week of leap) for (let i = 1; i < 7; i++) assert.equal(compareDates(week[i], week[i - 1]), 1);
    assert.deepEqual(weekdayNames(1), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    assert.deepEqual(weekdayNames(0, ['S', 'M', 'T', 'W', 'T', 'F', 'S']), ['S', 'M', 'T', 'W', 'T', 'F', 'S']);
  });

  it('lists a year in months and a decade in years', () => {
    const months = yearMonths('2024-07-04');
    assert.deepEqual(months.map(r => r.length), [3, 3, 3, 3]);
    assert.equal(months[0][0], '2024-01-01');
    assert.equal(months[3][2], '2024-12-01');
    // Four rows of three: the year before the decade, its ten, the year after.
    const years = decadeYears('2024-07-04');
    assert.deepEqual(years.map(r => r.length), [3, 3, 3, 3]);
    assert.equal(years[0][0], '2019-01-01');
    assert.equal(years[0][1], '2020-01-01');
    assert.equal(years[3][1], '2029-01-01');
    assert.equal(years[3][2], '2030-01-01');
  });

  it('compares, ranges and clamps', () => {
    assert.ok(compareDates('2024-01-01', '2023-12-31') > 0);
    assert.ok(sameDate('2024-01-05', '2024-01-05') && !sameDate('2024-01-05', null));
    assert.ok(sameMonth('2024-01-05', '2024-01-31') && !sameMonth('2024-01-31', '2024-02-01'));
    assert.ok(within('2024-01-05', '2024-01-10', '2024-01-01'));
    assert.ok(!within('2024-01-11', '2024-01-01', '2024-01-10'));
    assert.equal(clampDay('2024-01-20', '2024-01-01', '2024-01-10'), '2024-01-10');
    assert.equal(clampDay('2023-01-20', '2024-01-01', null), '2024-01-01');
  });

  it('formats and parses with format tokens and labels', () => {
    assert.equal(formatDate('2024-03-05', 'D MMMM YYYY'), '5 March 2024');
    assert.equal(formatDate('2024-03-05', "EEE, MMM DD 'of' YY"), 'Tue, Mar 05 of 24');
    assert.equal(formatDate('2024-03-05', "EEEE EEEEE e 'o''clock' ''"), "Tuesday T 2 o'clock '");
    assert.equal(formatDate('2024-03-05 14:07:09', 'YYYY-MM-DD HH:mm:ss a h'), '2024-03-05 14:07:09 PM 2');
    assert.equal(formatDate('2024-03-05', 'EEE MMM', { weekdaysAbbr: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'], monthsAbbr: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] }), 'mar mar');
    assert.equal(formatDate('2024-03-05', 'MMMM', { months: ['Jan', 'Fév', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'] }), 'Mars');
    assert.equal(parseDate('5 March 2024', 'D MMMM YYYY'), '2024-03-05');
    assert.equal(parseDate('05/03/2024', 'DD/MM/YYYY'), '2024-03-05');
    assert.equal(parseDate('31/02/2024', 'DD/MM/YYYY'), null);
    assert.equal(parseDate('march 5, 2024', 'MMMM D, YYYY'), '2024-03-05');
    assert.equal(parseDate('2024-3', 'YYYY-MM-DD'), null);
    // Dotted labels read back: every named token round-trips.
    const dotted = {
      monthsAbbr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
      weekdaysAbbr: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
      am: 'a.m.',
      pm: 'p.m.',
    };
    for (const [date, format] of [['2024-01-05', 'EEE D MMM YYYY'], ['2024-09-30', 'D MMM YYYY h:mm a'], ['2024-02-29', 'MMM D, YYYY']]) {
      const text = formatDate(date, format, dotted);
      assert.equal(parseDate(text, format, dotted), date, `${text} reads back`);
    }
    assert.equal(parseDate('Jan. 5, 2024', 'MMM D, YYYY', { monthsAbbr: ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'] }), '2024-01-05');
    assert.equal(parseDate("Tue, Mar 05 of 24", "EEE, MMM DD 'of' YY"), '2024-03-05');
  });

  it('reads, writes and ranges times', () => {
    assert.equal(toSeconds('10:30'), 37800);
    assert.equal(toSeconds('23:59:59'), 86399);
    assert.equal(toSeconds('24:00'), null);
    assert.equal(fromSeconds(37800), '10:30:00');
    assert.equal(fromSeconds(37800, false), '10:30');
    assert.equal(formatTime('00:05', { format: '12h' }), '12:05 AM');
    assert.equal(formatTime('13:05:09', { format: '12h', seconds: true }), '1:05:09 PM');
    assert.deepEqual(timeRange('10:00', '11:00', 30), ['10:00:00', '10:30:00', '11:00:00']);
    assert.deepEqual(timeRange('09:00', '09:45', 15).length, 4, 'every 15 minutes');
    assert.deepEqual(timeRange('09:00', '10:00', 0), [], 'no step, no times');
  });
});

// ---------------------------------------------------------------------------
// Calendar and pickers

describe('Calendar', () => {
  it('shows a month from the first day of the week, with outside days, and changes views', () => {
    const view = () => (
      <Rui>
        <Calendar defaultPeriod="2024-02-10" weekStart={0} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 480 });
    const text = same(dom, skia);
    assert.ok(text.startsWith('Feb 2024 Sun Mon Tue Wed Thu Fri Sat 28 29 30 31 1 2 3'), text);
    assert.ok(text.endsWith('25 26 27 28 29 1 2'), text);
    pressBoth(dom, skia, 'Next month');
    assert.ok(same(dom, skia).startsWith('Mar 2024'));
    pressBoth(dom, skia, 'Mar 2024');
    assert.equal(same(dom, skia), '2024 Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec');
    pressBoth(dom, skia, '2024');
    assert.equal(same(dom, skia), '2020…2029 2019 2020 2021 2022 2023 2024 2025 2026 2027 2028 2029 2030');
    // The years around the decade are outside: quiet, at the muted opacity.
    const ink = (/** @type {string} */ y) => [domAction(dom, y).style.color, domAction(dom, y).style.opacity];
    const muted = String(BASE_THEME.opacity.muted);
    assert.deepEqual(ink('2019'), [pageColors(BASE_THEME, 'light').quiet, muted]);
    assert.deepEqual(ink('2030'), [pageColors(BASE_THEME, 'light').quiet, muted]);
    assert.deepEqual(ink('2020'), [pageColors(BASE_THEME, 'light').text, '']);
    pressBoth(dom, skia, 'Next decade');
    pressBoth(dom, skia, '2031');
    pressBoth(dom, skia, 'Jun');
    assert.ok(same(dom, skia).startsWith('Jun 2031 Sun Mon'));
    dispose();
  });

  it('reports presses on years and months, sizes its days at md, and is inert when asked', () => {
    /** @type {string[]} */
    const presses = [];
    const view = () => (
      <Rui>
        <Calendar defaultPeriod="2024-02-10" defaultView="decade" onYearPress={(/** @type {string} */ d) => presses.push(`year ${d}`)} onMonthPress={(/** @type {string} */ d) => presses.push(`month ${d}`)} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 480 });
    pressBoth(dom, skia, '2025');
    pressBoth(dom, skia, 'Mar');
    assert.deepEqual(presses, ['year 2025-01-01', 'year 2025-01-01', 'month 2025-03-01', 'month 2025-03-01']);
    assert.equal(skiaAction(skia, 'Monday, 10 March 2025').style.width, 36, 'days of 36 px (md) by default');
    dispose();
    const still = () => (
      <Rui>
        <Calendar defaultPeriod="2024-02-10" inert />
      </Rui>
    );
    const quiet = both(still, { width: 480, height: 480 });
    pressBoth(quiet.dom, quiet.skia, 'Next month');
    assert.ok(same(quiet.dom, quiet.skia).startsWith('Feb 2024'), 'an inert calendar does not turn');
    quiet.dispose();
  });
});

describe('Calendar parts of its own', () => {
  it('numbers each week row by its Thursday, whatever the week starts on', () => {
    // March 2024 from Sunday: the row Sun 3 – Sat 9 holds Thursday 7 March, ISO week 10 (its Sunday is still week 9);
    // from Monday the month fits five rows.
    for (const [start, want] of /** @type {[number, string[]][]} */ ([[0, ['9', '10', '11', '12', '13', '14']], [6, ['9', '10', '11', '12', '13', '14']], [1, ['9', '10', '11', '12', '13']]])) {
      const { dom, dispose } = both(
        () => (
          <Rui>
            <Calendar defaultPeriod="2024-03-10" weekNumbers weekStart={start} />
          </Rui>
        ),
        { width: 480, height: 480 },
      );
      const rows = [...dom.document.querySelectorAll('[role="row"]')].map((/** @type {any} */ r) => r.firstElementChild?.textContent ?? '').filter((/** @type {string} */ t) => /^\d+$/.test(t));
      assert.deepEqual(rows, want, `weekStart ${start}`);
      dispose();
    }
  });

  it('heads week numbers "Wk", points its header with the pointer glyphs, sizes list controls from the day', () => {
    const view = () => (
      <Rui>
        <Calendar defaultPeriod="2024-02-10" weekNumbers />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 480 });
    assert.ok(same(dom, skia).startsWith('Feb 2024 Wk Mon Tue'), 'the week numbers\' heading, then the abbreviated weekdays');
    // The arrows are drawn pointers (shaft, head, tail dot), not a turned chevron.
    const glyph = (/** @type {string} */ name) => [...domAction(dom, name).querySelector('[data-ren="Shape"]').children].map((/** @type {any} */ c) => c.tagName.toLowerCase()).join(',');
    assert.equal(glyph('Previous month'), 'path,path,ellipse');
    assert.equal(glyph('Next month'), 'path,path,ellipse');
    pressBoth(dom, skia, 'Feb 2024');
    // A month control: two days (36, md) and an xs step wide, a step taller than a day.
    const s = BASE_THEME.sizes.day.md;
    assert.equal(domAction(dom, 'Mar').style.width, `${2 * s + BASE_THEME.spacing.xs}px`);
    assert.equal(skiaAction(skia, 'Mar').getBoundingClientRect().height, s + BASE_THEME.spacing.xs);
    dispose();
  });

  it('draws DayStrip\'s side controls square, a day\'s side, and marks today with a dot', () => {
    const view = () => (
      <Rui>
        <DayStrip defaultPeriod="2024-05-06" days={3} markToday today="2024-05-07" />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 200 });
    const s = BASE_THEME.sizes.day.md; // DayStrip's days are md by default, as Calendar's
    const r = skiaAction(skia, 'Next days').getBoundingClientRect();
    assert.deepEqual([r.width, r.height], [s, s]);
    assert.equal(domAction(dom, 'Tuesday, 7 May 2024').querySelectorAll('[aria-hidden="true"]').length, 1);
    assert.equal(domAction(dom, 'Monday, 6 May 2024').querySelectorAll('[aria-hidden="true"]').length, 0);
    dispose();
  });
});

describe('Calendar sizes from the theme', () => {
  it('sizes its days by the theme\'s sizes.day, on both renderers', () => {
    const view = () => (
      <Rui theme={themeOf({ sizes: { day: { md: 44 } } })}>
        <Calendar defaultPeriod="2024-02-10" />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 480 });
    assert.equal(domAction(dom, 'Saturday, 10 February 2024').style.width, '44px');
    assert.equal(skiaAction(skia, 'Saturday, 10 February 2024').getBoundingClientRect().width, 44, 'on Skia too');
    dispose();
  });
});

describe('dates as data', () => {
  it('each day, month, year and time cell carries its ISO date or time as datetime', () => {
    const { dom, dispose } = both(
      () => (
        <Rui>
          <Calendar defaultPeriod="2024-02-10" />
          <MonthPanel defaultPeriod="2024-01-01" />
          <YearPanel defaultPeriod="2024-01-01" />
          <DayStrip defaultPeriod="2024-04-28" days={2} />
          <TimeSlots data={['10:00', '10:30']} />
        </Rui>
      ),
      { width: 480, height: 480 },
    );
    const at = (/** @type {string} */ name) => domAction(dom, name).getAttribute('datetime');
    assert.equal(at('Wednesday, 14 February 2024'), '2024-02-14');
    assert.equal(at('March 2024'), '2024-03');
    assert.equal(at('2027'), '2027');
    assert.equal(at('Monday, 29 April 2024'), '2024-04-29');
    assert.equal(at('10:30'), '10:30');
    dispose();
  });
});

describe('DatePanel', () => {
  it('selects one date, controlled through a signal, and deselects when allowed', () => {
    const values = perRoot();
    const view = () => (
      <Rui>
        <DatePanel value={values.make(null)} defaultPeriod="2024-05-01" deselectable />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 480 });
    pressBoth(dom, skia, 'Wednesday, 15 May 2024');
    assert.deepEqual(values.values(), ['2024-05-15', '2024-05-15']);
    pressBoth(dom, skia, 'Monday, 20 May 2024');
    assert.deepEqual(values.values(), ['2024-05-20', '2024-05-20']);
    pressBoth(dom, skia, 'Monday, 20 May 2024');
    assert.deepEqual(values.values(), [null, null]);
    dispose();
  });
});

describe('Calendar keys', () => {
  it('moves by day, week, month and year, turns pages, skips disabled days and presses with Enter', () => {
    const values = perRoot();
    const view = () => (
      <Rui>
        <DatePanel value={values.make(null)} defaultPeriod="2024-02-01" exclude={(/** @type {string} */ d) => d === '2024-03-02'} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 480 });
    focusBoth(dom, skia, 'Thursday, 29 February 2024');
    keyBoth(dom, skia, 'ArrowRight');
    assert.deepEqual(focused(dom, skia), ['Friday, 1 March 2024', 'Friday, 1 March 2024']);
    assert.ok(same(dom, skia).startsWith('Mar 2024'), 'the page turned');
    keyBoth(dom, skia, 'ArrowRight');
    assert.deepEqual(focused(dom, skia), ['Sunday, 3 March 2024', 'Sunday, 3 March 2024'], 'the excluded day is skipped');
    keyBoth(dom, skia, 'ArrowDown');
    assert.deepEqual(focused(dom, skia), ['Sunday, 10 March 2024', 'Sunday, 10 March 2024']);
    keyBoth(dom, skia, 'Home');
    assert.deepEqual(focused(dom, skia), ['Monday, 4 March 2024', 'Monday, 4 March 2024'], 'Monday starts the week');
    keyBoth(dom, skia, 'End');
    assert.deepEqual(focused(dom, skia), ['Sunday, 10 March 2024', 'Sunday, 10 March 2024']);
    keyBoth(dom, skia, 'PageDown');
    assert.deepEqual(focused(dom, skia), ['Wednesday, 10 April 2024', 'Wednesday, 10 April 2024']);
    keyBoth(dom, skia, 'PageUp', true);
    assert.deepEqual(focused(dom, skia), ['Monday, 10 April 2023', 'Monday, 10 April 2023']);
    assert.ok(same(dom, skia).startsWith('Apr 2023'));
    keyBoth(dom, skia, 'ArrowUp');
    keyBoth(dom, skia, 'Enter');
    assert.deepEqual(values.values(), ['2023-04-03', '2023-04-03']);
    dispose();
  });

  it('moves through months and years on the upper views', () => {
    const view = () => (
      <Rui>
        <Calendar defaultPeriod="2024-11-01" defaultView="year" />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 480 });
    focusBoth(dom, skia, 'November 2024');
    keyBoth(dom, skia, 'ArrowDown');
    assert.deepEqual(focused(dom, skia), ['February 2025', 'February 2025']);
    assert.ok(same(dom, skia).startsWith('2025 Jan'));
    keyBoth(dom, skia, 'Enter');
    assert.ok(same(dom, skia).startsWith('Feb 2025 Mon Tue'), 'Enter goes down a view');
    dispose();
  });
});

describe('DatePanel types', () => {
  it('picks several dates, toggling', () => {
    const values = perRoot();
    const view = () => (
      <Rui>
        <DatePanel mode="multiple" value={values.make([])} defaultPeriod="2024-05-01" />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 480 });
    pressBoth(dom, skia, 'Friday, 3 May 2024');
    pressBoth(dom, skia, 'Thursday, 9 May 2024');
    pressBoth(dom, skia, 'Friday, 3 May 2024');
    assert.deepEqual(values.values(), [['2024-05-09'], ['2024-05-09']]);
    dispose();
  });

  it('picks a range in either order, a single day only when allowed', () => {
    const values = perRoot();
    const view = () => (
      <Rui>
        <DatePanel mode="range" value={values.make([null, null])} defaultPeriod="2024-05-01" months={2} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 640, height: 480 });
    const text = same(dom, skia);
    assert.ok(text.startsWith('May 2024 Mon'), text);
    assert.ok(text.includes('Jun 2024 Mon'), text);
    pressBoth(dom, skia, 'Thursday, 20 June 2024');
    pressBoth(dom, skia, 'Friday, 10 May 2024');
    assert.deepEqual(values.values(), [['2024-05-10', '2024-06-20'], ['2024-05-10', '2024-06-20']]);
    // One band: its ends round to half a day's height (36 px, md) on their outer side, its middle square.
    const corners = (/** @type {string} */ name) => {
      const item = skiaAction(skia, name);
      return [domAction(dom, name).style.borderRadius, [item.style.radiusTopLeft, item.style.radiusTopRight, item.style.radiusBottomRight, item.style.radiusBottomLeft]];
    };
    assert.deepEqual(corners('Friday, 10 May 2024'), ['18px 0px 0px 18px', [18, 0, 0, 18]]);
    assert.deepEqual(corners('Thursday, 20 June 2024'), ['0px 18px 18px 0px', [0, 18, 18, 0]]);
    assert.deepEqual(corners('Wednesday, 15 May 2024'), ['0px', [0, 0, 0, 0]]);
    // The ends filled in the accent, the middle in its light tint, a day of the next month shown in May's grid outside the band.
    const ground = (/** @type {string} */ name) => domAction(dom, name).style.backgroundColor;
    const accent = BASE_THEME.colors[BASE_THEME.accent];
    assert.equal(ground('Friday, 10 May 2024'), accent[BASE_THEME.accentShade.light]);
    assert.equal(ground('Wednesday, 15 May 2024'), accent[0]);
    const outside = dom.nodes('Action').filter((/** @type {any} */ n) => n.getAttribute('aria-label') === 'Saturday, 1 June 2024');
    assert.equal(outside.length, 2, 'June 1st in both grids');
    assert.equal(outside[0].style.opacity, String(BASE_THEME.opacity.muted), 'outside: quiet at the muted opacity');
    assert.notEqual(outside[0].style.backgroundColor, outside[1].style.backgroundColor, 'outside: no band; in its own month: the band');
    pressBoth(dom, skia, 'Sunday, 12 May 2024');
    assert.deepEqual(values.values(), [['2024-05-12', null], ['2024-05-12', null]]);
    pressBoth(dom, skia, 'Sunday, 12 May 2024');
    assert.deepEqual(values.values(), [[null, null], [null, null]]);
    pressBoth(dom, skia, 'Next month');
    assert.ok(same(dom, skia).startsWith('Jul 2024'), 'two columns scroll by two');
    dispose();
  });

  it('keeps presses within min and max, disables the controls past them, and takes day props and labels', () => {
    const values = perRoot();
    const view = () => (
      <Rui>
        <DatePanel
          value={values.make(null)}
          defaultPeriod="2024-05-01"
          min="2024-05-10"
          max="2024-06-05"
          outside={false}
          dayOf={(/** @type {string} */ d) => (d === '2024-05-15' ? { disabled: true } : {})}
          weekdayFormat="EEEEE"
          labels={{ weekdaysNarrow: ['D', 'L', 'M', 'X', 'J', 'V', 'S'], weekdays: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'], months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'], monthsAbbr: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], nextMonth: 'Mes siguiente', previousMonth: 'Mes anterior' }}
        />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 480 });
    const text = same(dom, skia);
    assert.ok(text.startsWith('may 2024 L M X J V S D 1 2 3'), text);
    assert.ok(text.endsWith('30 31'), 'outside days hidden');
    pressBoth(dom, skia, 'domingo, 5 mayo 2024');
    pressBoth(dom, skia, 'miércoles, 15 mayo 2024');
    assert.deepEqual(values.values(), [null, null]);
    pressBoth(dom, skia, 'Mes anterior');
    assert.ok(same(dom, skia).startsWith('may 2024'), 'no page before the minimum');
    pressBoth(dom, skia, 'Mes siguiente');
    pressBoth(dom, skia, 'Mes siguiente');
    assert.ok(same(dom, skia).startsWith('jun 2024'), 'no page after the maximum');
    pressBoth(dom, skia, 'martes, 4 junio 2024');
    assert.deepEqual(values.values(), ['2024-06-04', '2024-06-04']);
    dispose();
  });

  it('applies presets beside the calendar and turns to them', () => {
    const values = perRoot();
    const view = () => (
      <Rui>
        <DatePanel mode="range" value={values.make([null, null])} defaultPeriod="2024-05-01" presets={[{ value: ['2024-08-01', '2024-08-07'], label: 'First week of August' }]} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 640, height: 480 });
    pressBoth(dom, skia, 'First week of August');
    assert.deepEqual(values.values(), [['2024-08-01', '2024-08-07'], ['2024-08-01', '2024-08-07']]);
    assert.ok(same(dom, skia).startsWith('First week of August Aug 2024'));
    dispose();
  });

  it('takes its settings from DateSettings and marks today when asked', () => {
    const view = () => (
      <Rui>
        <DateSettings weekStart={0} sixWeeks today="2024-05-08">
          <DatePanel markToday weekdays={false} />
        </DateSettings>
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 480 });
    const text = same(dom, skia);
    assert.ok(text.startsWith('May 2024 28 29 30 1'), text);
    assert.equal(text.split(' ').length, 2 + 42, 'six weeks');
    // Today: a dot under its number, in the accent; no other day has one.
    const dots = (/** @type {string} */ name) => domAction(dom, name).querySelectorAll('[data-ren="View"][aria-hidden="true"]');
    assert.equal(dots('Wednesday, 8 May 2024').length, 1);
    assert.equal(dots('Thursday, 9 May 2024').length, 0);
    const dot = dots('Wednesday, 8 May 2024')[0];
    assert.equal(dot.style.width, `${BASE_THEME.spacing.xs / 2}px`);
    assert.equal(domAction(dom, 'Wednesday, 8 May 2024').getAttribute('aria-current'), 'date');
    dispose();
  });

  it('follows DateSettings given as accessors', () => {
    const first = perRoot();
    const view = () => {
      const day = first.make(0);
      return (
        <Rui>
          <DateSettings weekStart={() => $read(day)} today="2024-05-08">
            <DatePanel defaultPeriod="2024-05-01" />
          </DateSettings>
        </Rui>
      );
    };
    const { dom, skia, dispose } = both(view, { width: 480, height: 480 });
    assert.ok(same(dom, skia).startsWith('May 2024 Sun Mon'));
    for (const s of first.list) $write(s, 1);
    $flush(dom.root);
    $flush(skia.root);
    assert.ok(same(dom, skia).startsWith('May 2024 Mon Tue'), 'the weekdays start on Monday now');
    dispose();
  });
});

describe('MonthPanel and YearPanel', () => {
  it('picks a range of months, and goes to other years through the decade', () => {
    const values = perRoot();
    const view = () => (
      <Rui>
        <MonthPanel mode="range" value={values.make([null, null])} defaultPeriod="2024-01-01" />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 480 });
    assert.equal(same(dom, skia), '2024 Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec');
    pressBoth(dom, skia, 'Mar');
    pressBoth(dom, skia, '2024');
    pressBoth(dom, skia, '2025');
    pressBoth(dom, skia, 'Feb');
    assert.deepEqual(values.values(), [['2024-03-01', '2025-02-01'], ['2024-03-01', '2025-02-01']]);
    dispose();
  });

  it('picks several years, bounded by min and max', () => {
    const values = perRoot();
    const view = () => (
      <Rui>
        <YearPanel mode="multiple" value={values.make([])} defaultPeriod="2024-01-01" max="2026-06-01" />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 480 });
    assert.equal(same(dom, skia), '2020…2029 2019 2020 2021 2022 2023 2024 2025 2026 2027 2028 2029 2030');
    pressBoth(dom, skia, '2021');
    pressBoth(dom, skia, '2026');
    pressBoth(dom, skia, '2027');
    assert.deepEqual(values.values(), [['2021-01-01', '2026-01-01'], ['2021-01-01', '2026-01-01']]);
    pressBoth(dom, skia, '2020…2029');
    assert.equal(same(dom, skia).split(' ')[0], '2020…2029', 'the decade is the top view');
    dispose();
  });
});

describe('DayStrip', () => {
  it('shows days in a row, turns by the number of days, picks and moves by keys', () => {
    const values = perRoot();
    const view = () => (
      <Rui>
        <DayStrip value={values.make(null)} defaultPeriod="2024-04-28" days={5} max="2024-05-08" />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 200 });
    assert.equal(same(dom, skia), 'S 28 M 29 T 30 May 1 T 2', 'the weekday\'s initial over each number; the month on its 1st');
    pressBoth(dom, skia, 'Tuesday, 30 April 2024');
    assert.deepEqual(values.values(), ['2024-04-30', '2024-04-30']);
    pressBoth(dom, skia, 'Next days');
    assert.equal(same(dom, skia), 'F 3 S 4 S 5 M 6 T 7');
    pressBoth(dom, skia, 'Next days');
    assert.equal(same(dom, skia), 'S 4 S 5 M 6 T 7 W 8', 'stops at the maximum');
    focusBoth(dom, skia, 'Saturday, 4 May 2024');
    keyBoth(dom, skia, 'ArrowLeft');
    assert.deepEqual(focused(dom, skia), ['Friday, 3 May 2024', 'Friday, 3 May 2024']);
    assert.equal(same(dom, skia), 'F 3 S 4 S 5 M 6 T 7');
    keyBoth(dom, skia, 'Enter');
    assert.deepEqual(values.values(), ['2024-05-03', '2024-05-03']);
    dispose();
  });
});

// ---------------------------------------------------------------------------
// Times

/** The Edits on Skia, in tree order. @param {any} skia */
function edits(skia) {
  skia.skia.present();
  /** @type {any[]} */
  const out = [];
  const walk = (/** @type {any} */ n) => {
    for (let c = n.first; c !== null; c = c.next) {
      if (c.kind === 4) out.push(c);
      walk(c);
    }
  };
  walk(skia.skia.root);
  return out;
}

/** Types into the first Edit on both, a character at a time, the caret at the end. @param {any} dom @param {any} skia @param {string} text */
function typeBoth(dom, skia, text) {
  for (const ch of text) {
    const node = dom.nodes('Edit')[0];
    if (dom.document.activeElement !== node) node.focus();
    node.value = node.value + ch;
    node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    $flush(dom.root);
    const edit = edits(skia)[0];
    if (skia.skia.focused !== edit) edit.focus();
    skia.skia.key('End');
    skia.skia.key(ch);
    $flush(skia.root);
  }
}

/** Focus leaves the first Edit on both. @param {any} dom @param {any} skia */
function blurBoth(dom, skia) {
  const node = dom.nodes('Edit')[0];
  node.focus();
  node.blur();
  $flush(dom.root);
  const edit = edits(skia)[0];
  if (skia.skia.focused !== edit) edit.focus();
  edit.blur();
  $flush(skia.root);
}

/** The first Edit's text on both. @param {any} dom @param {any} skia */
const shownBoth = (dom, skia) => {
  $flush(dom.root);
  $flush(skia.root);
  return [dom.nodes('Edit')[0].value, edits(skia)[0].draft];
};

describe('TimeInput', () => {
  it('masks the typing, reports complete times, clamps on blur and restores an invalid one', () => {
    const values = perRoot();
    const view = () => (
      <Rui>
        <TimeInput label="Start" value={values.make('')} max="18:00" />
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(same(dom, skia), 'Start ··:··');
    typeBoth(dom, skia, '093');
    assert.deepEqual(shownBoth(dom, skia), ['09:3', '09:3']);
    assert.deepEqual(values.values(), ['', '']);
    typeBoth(dom, skia, '0');
    assert.deepEqual(values.values(), ['09:30', '09:30']);
    // An impossible time stays a draft, and blur shows the value again.
    const node = dom.nodes('Edit')[0];
    node.value = '';
    node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    const edit = edits(skia)[0];
    edit.focus();
    skia.skia.input('', 0, 0);
    $flush(skia.root);
    assert.deepEqual(values.values(), ['', '']);
    typeBoth(dom, skia, '2515');
    assert.deepEqual(shownBoth(dom, skia), ['25:15', '25:15']);
    blurBoth(dom, skia);
    assert.deepEqual(shownBoth(dom, skia), ['', '']);
    typeBoth(dom, skia, '2015');
    assert.deepEqual(values.values(), ['20:15', '20:15']);
    blurBoth(dom, skia);
    assert.deepEqual(values.values(), ['18:00', '18:00'], 'clamped to max');
    dispose();
  });
});

describe('TimePicker', () => {
  it('edits segments by keys and digits, in 12 hours with seconds', () => {
    const values = perRoot();
    const view = () => (
      <Rui>
        <TimePicker label="Alarm" value={values.make('')} format="12h" seconds minuteStep={15} clearable />
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(same(dom, skia), 'Alarm ·· : ·· : ·· ··');
    focusBoth(dom, skia, 'hours');
    keyBoth(dom, skia, '0');
    keyBoth(dom, skia, '9');
    assert.deepEqual(focused(dom, skia), ['minutes', 'minutes'], 'a full segment moves on');
    keyBoth(dom, skia, 'ArrowUp');
    keyBoth(dom, skia, 'ArrowUp');
    assert.equal(same(dom, skia), 'Alarm 09 : 15 : ·· ··');
    assert.deepEqual(values.values(), ['', ''], 'incomplete');
    keyBoth(dom, skia, 'ArrowRight');
    keyBoth(dom, skia, '7');
    assert.deepEqual(focused(dom, skia), ['am/pm', 'am/pm'], '7 cannot start a second of two digits');
    keyBoth(dom, skia, 'p');
    assert.deepEqual(values.values(), ['21:15:07', '21:15:07']);
    assert.equal(same(dom, skia), 'Alarm 09 : 15 : 07 PM');
    keyBoth(dom, skia, 'ArrowDown');
    assert.deepEqual(values.values(), ['09:15:07', '09:15:07']);
    focusBoth(dom, skia, 'hours');
    keyBoth(dom, skia, 'End');
    assert.deepEqual(values.values(), ['00:15:07', '00:15:07'], '12 AM is midnight');
    keyBoth(dom, skia, 'Backspace');
    assert.deepEqual(values.values(), ['', '']);
    assert.equal(same(dom, skia), 'Alarm ·· : 15 : 07 AM');
    pressBoth(dom, skia, 'Clear time');
    assert.equal(same(dom, skia), 'Alarm ·· : ·· : ·· ··');
    dispose();
  });

  it('opens a panel of columns and presets, bounded by min and max', () => {
    const values = perRoot();
    const view = () => (
      <Rui>
        <TimePicker value={values.make('10:00')} panel presets={['08:30', '12:00', '23:00']} max="20:00" sticky={false} popover={inline} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 480 });
    assert.equal(same(dom, skia), '10 : 00');
    pressBoth(dom, skia, 'minutes');
    pressBoth(dom, skia, 'minutes 03');
    assert.deepEqual(values.values(), ['10:03', '10:03']);
    pressBoth(dom, skia, 'hours 02');
    assert.deepEqual(values.values(), ['02:03', '02:03']);
    pressBoth(dom, skia, '23:00');
    assert.deepEqual(values.values(), ['20:00', '20:00'], 'a preset past max is clamped');
    assert.equal(same(dom, skia), '20 : 00', 'the panel closed');
    dispose();
  });

  it('groups presets under labels, and keeps the panel open after one by default', () => {
    const values = perRoot();
    const view = () => (
      <Rui>
        <TimePicker value={values.make('')} panel presets={[{ label: 'Opening', times: ['09:15'] }, { label: 'Closing', times: ['17:45'] }]} popover={inline} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 480 });
    pressBoth(dom, skia, 'hours');
    for (const text of [dom.text(), skia.text()]) assert.ok(text.includes('Opening 09:15 Closing 17:45'), text);
    pressBoth(dom, skia, '17:45');
    assert.deepEqual(values.values(), ['17:45', '17:45']);
    for (const text of [dom.text(), skia.text()]) assert.ok(text.includes('Opening'), 'sticky: still open');
    dispose();
  });
});

describe('TimePicker sizes from the theme', () => {
  it('sizes its cells, columns and presets row by the theme\'s sizes.time, on both renderers', () => {
    const values = perRoot();
    const time = { cell: [60, 34], column: [64, 200], presets: 300 };
    const view = () => (
      <Rui theme={themeOf({ sizes: { time } })}>
        <TimePicker value={values.make('10:00')} panel presets={['08:30']} popover={inline} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 480 });
    pressBoth(dom, skia, 'hours');
    const cell = domAction(dom, 'hours 02');
    assert.deepEqual([cell.style.width, cell.style.height], ['60px', '34px']);
    assert.equal(domAction(dom, '08:30').style.height, '34px', 'a preset as tall as a cell');
    const column = dom.nodes('Scroll').find((/** @type {any} */ n) => n.getAttribute('aria-label') === 'hours');
    assert.deepEqual([column.style.width, column.style.height], ['64px', '200px']);
    assert.ok(dom.nodes('View').some((/** @type {any} */ n) => n.style.maxWidth === '300px'), 'the presets row');
    const r = skiaAction(skia, 'hours 02').getBoundingClientRect();
    assert.deepEqual([r.width, r.height], [60, 34], 'on Skia too');
    dispose();
  });
});

describe('TimeSlots', () => {
  it('shows slots, selects, deselects, skips disabled ones by keys', () => {
    const values = perRoot();
    const data = timeRange('10:00', '12:00', 30);
    const view = () => (
      <Rui>
        <TimeSlots data={data} value={values.make(null)} format="12h" min="10:30" exclude={['11:30:00']} deselectable />
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(same(dom, skia), '10:00 AM 10:30 AM 11:00 AM 11:30 AM 12:00 PM');
    pressBoth(dom, skia, '10:00 AM');
    assert.deepEqual(values.values(), [null, null], 'before min');
    pressBoth(dom, skia, '11:00 AM');
    assert.deepEqual(values.values(), ['11:00:00', '11:00:00']);
    focusBoth(dom, skia, '11:00 AM');
    keyBoth(dom, skia, 'ArrowRight');
    assert.deepEqual([dom.document.activeElement.textContent, skia.skia.focused.text], ['12:00 PM', '12:00 PM'], 'the disabled slot is skipped');
    keyBoth(dom, skia, 'Enter');
    assert.deepEqual(values.values(), ['12:00:00', '12:00:00']);
    pressBoth(dom, skia, '12:00 PM');
    assert.deepEqual(values.values(), [null, null]);
    dispose();
  });

  it('lays slots out in four columns by default', () => {
    const view = () => (
      <Rui>
        <TimeSlots data={timeRange('08:00', '10:00', 30)} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    focusBoth(dom, skia, '08:00');
    keyBoth(dom, skia, 'ArrowDown');
    assert.deepEqual([dom.document.activeElement.textContent, skia.skia.focused.text], ['10:00', '10:00'], 'a row down is four slots on');
    dispose();
  });

  it('moves a row by the columns laid out, a responsive value too', () => {
    const view = () => (
      <Rui>
        <TimeSlots data={timeRange('08:00', '10:00', 30)} grid={{ columns: { base: 3 } }} />
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    focusBoth(dom, skia, '08:00');
    keyBoth(dom, skia, 'ArrowDown');
    assert.deepEqual([dom.document.activeElement.textContent, skia.skia.focused.text], ['09:30', '09:30'], 'a row down is three slots on');
    keyBoth(dom, skia, 'ArrowUp');
    assert.deepEqual([dom.document.activeElement.textContent, skia.skia.focused.text], ['08:00', '08:00'], 'and back up');
    dispose();
  });
});

// ---------------------------------------------------------------------------
// Pickers in a field, on Popover (inline, no transition, a manual clock)

const inline = { portal: false, motion: { duration: 0 } };

/** Presses as a browser does (pointer down, up, click) on the DOM, and on Skia. @param {any} dom @param {any} skia @param {string} name */
function tapBoth(dom, skia, name) {
  const node = domAction(dom, name);
  const w = dom.window;
  const at = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1 };
  node.dispatchEvent(new w.PointerEvent('pointerdown', at));
  node.dispatchEvent(new w.PointerEvent('pointerup', { ...at, buttons: 0 }));
  node.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  $flush(dom.root);
  const item = skiaAction(skia, name);
  skia.skia.present();
  const r = item.getBoundingClientRect();
  skia.skia.press(r.x + r.width / 2, r.y + r.height / 2);
  skia.skia.release(r.x + r.width / 2, r.y + r.height / 2);
  $flush(skia.root);
}

/** A view with a manual clock around it. @param {() => any} content */
const clocked = content => () => (
  <Clock value={manualClock()}>
    <Rui>{content()}</Rui>
  </Clock>
);

describe('DateSelect, MonthSelect and YearSelect', () => {
  it('open a picker from the field, close on a pick and show the value formatted', () => {
    const values = perRoot();
    const view = clocked(() => <DateSelect label="Due" placeholder="Choose day" value={values.make(null)} defaultPeriod="2024-05-01" clearable popover={inline} />);
    const { dom, skia, dispose } = both(view, { width: 480, height: 520 });
    assert.equal(same(dom, skia), 'Due Choose day');
    tapBoth(dom, skia, 'Due');
    assert.ok(same(dom, skia).startsWith('Due Choose day May 2024 Mon'), 'the calendar is open');
    pressBoth(dom, skia, 'Wednesday, 15 May 2024');
    assert.deepEqual(values.values(), ['2024-05-15', '2024-05-15']);
    assert.equal(same(dom, skia), 'Due 15 May 2024', 'closed on the pick');
    pressBoth(dom, skia, 'Clear');
    assert.deepEqual(values.values(), [null, null]);
    dispose();
  });

  it('set the field\'s text at its start, in the middle of its height', () => {
    // A reference line: the field's font (13) at the theme's leading, whose baseline sits `base` below its top.
    const lineHeight = 13 * BASE_THEME.lineHeights.md;
    const skia = onSkia(() => (
      <View>
        <DateSelect label="Due" placeholder="Choose day" />
        <Label text="Ref" style={{ fontSize: 13, lineHeight: BASE_THEME.lineHeights.md }} />
      </View>
    ), { width: 480, height: 200 });
    skia.text();
    const text = skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === 'Choose day');
    const ref = skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === 'Ref');
    const refItem = (/** @type {any} */ n) => { for (let c = n.first; c !== null; c = c.next) { if (c.text === 'Ref') return c; const f = refItem(c); if (f) return f; } return null; };
    const base = ref[3] - refItem(skia.skia.root).getBoundingClientRect().top;
    // The field's Action, where it was drawn: 28 high inside the border, its text inset by the theme's inset ratio of the field's 30.
    const hits = skia.skia.painter.hits;
    let i = 0;
    while (i < hits.n && hits.items[i].kind !== 5) i++;
    const [left] = hits.box.slice(i * 6, i * 6 + 4);
    assert.ok(Math.abs(text[2] - (left + Math.round(30 * BASE_THEME.ratios.inset))) < 0.5, `at the start after the padding: ${text[2]}`);
    // Centered in the field's layout box (the drawn hit box is whole pixels): its line (13 at the theme's
    // leading) in the middle, the baseline where the reference line has it.
    const find = (/** @type {any} */ n, /** @type {(n: any) => boolean} */ f) => { for (let c = n.first; c !== null; c = c.next) { if (f(c)) return c; const r = find(c, f); if (r) return r; } return null; };
    const box = find(skia.skia.root, (/** @type {any} */ c) => c.kind === 5).getBoundingClientRect();
    assert.ok(Math.abs(text[3] - (box.top + (box.height - lineHeight) / 2 + base)) < 0.5, `in the middle: ${text[3]} (base ${base})`);
    skia.dispose();
  });

  it('keep a range open until both ends are picked', () => {
    const values = perRoot();
    const view = clocked(() => <DateSelect mode="range" label="Stay" value={values.make([null, null])} defaultPeriod="2024-05-01" format="D MMM" popover={inline} />);
    const { dom, skia, dispose } = both(view, { width: 480, height: 520 });
    tapBoth(dom, skia, 'Stay');
    pressBoth(dom, skia, 'Friday, 3 May 2024');
    assert.ok(same(dom, skia).startsWith('Stay 3 May → May 2024'), 'still open');
    pressBoth(dom, skia, 'Monday, 6 May 2024');
    assert.deepEqual(values.values(), [['2024-05-03', '2024-05-06'], ['2024-05-03', '2024-05-06']]);
    assert.equal(same(dom, skia), 'Stay 3 May → 6 May');
    dispose();
  });

  it('pick months and years', () => {
    const months = perRoot();
    const years = perRoot();
    const view = clocked(() => (
      <>
        <MonthSelect label="Month" value={months.make(null)} defaultPeriod="2024-01-01" popover={inline} />
        <YearSelect label="Year" value={years.make(null)} defaultPeriod="2024-01-01" popover={inline} />
      </>
    ));
    const { dom, skia, dispose } = both(view, { width: 480, height: 520 });
    tapBoth(dom, skia, 'Month');
    pressBoth(dom, skia, 'Sep');
    assert.deepEqual(months.values(), ['2024-09-01', '2024-09-01']);
    tapBoth(dom, skia, 'Year');
    pressBoth(dom, skia, '2027');
    assert.deepEqual(years.values(), ['2027-01-01', '2027-01-01']);
    assert.equal(same(dom, skia), 'Month Sep 2024 Year 2027');
    dispose();
  });
});

describe('DateInput', () => {
  it('reads typed dates, opens the calendar on focus, and fixes the text on blur', () => {
    const values = perRoot();
    const view = clocked(() => <DateInput label="Born" placeholder="Date" value={values.make(null)} max="2024-12-31" popover={inline} today="2024-05-01" />);
    const { dom, skia, dispose } = both(view, { width: 480, height: 520 });
    assert.equal(same(dom, skia), 'Born Date');
    typeBoth(dom, skia, '3 May 2024');
    assert.deepEqual(values.values(), ['2024-05-03', '2024-05-03']);
    assert.ok(same(dom, skia).startsWith('Born 3 May 2024 May 2024 Mon'), 'the calendar shows the typed month');
    pressBoth(dom, skia, 'Thursday, 9 May 2024');
    assert.deepEqual(values.values(), ['2024-05-09', '2024-05-09']);
    assert.equal(same(dom, skia), 'Born 9 May 2024', 'closed, and the focus given back to the field opens nothing');
    assert.deepEqual([dom.document.activeElement?.getAttribute('data-ren'), skia.skia.focused?.kind], ['Edit', 4], 'the focus back on the field');
    typeBoth(dom, skia, '9');
    assert.deepEqual(values.values(), ['2024-05-09', '2024-05-09'], '9 May 20249 is no date');
    blurBoth(dom, skia);
    assert.deepEqual(shownBoth(dom, skia), ['9 May 2024', '9 May 2024']);
    dispose();
  });
});

describe('DateTimeSelect', () => {
  it('picks a day keeping the time, types the time in the row under the calendar, and closes on Done', () => {
    const values = perRoot();
    const view = clocked(() => <DateTimeSelect label="When" value={values.make(null)} defaultPeriod="2024-05-01" popover={inline} />);
    const { dom, skia, dispose } = both(view, { width: 480, height: 600 });
    tapBoth(dom, skia, 'When');
    pressBoth(dom, skia, 'Wednesday, 15 May 2024');
    assert.deepEqual(values.values(), ['2024-05-15 00:00:00', '2024-05-15 00:00:00']);
    const edit = dom.nodes('Edit')[0];
    edit.value = '';
    edit.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    edits(skia)[0].focus();
    skia.skia.input('', 0, 0);
    $flush(skia.root);
    typeBoth(dom, skia, '1030');
    assert.deepEqual(values.values(), ['2024-05-15 10:30:00', '2024-05-15 10:30:00']);
    assert.ok(same(dom, skia).endsWith('10:30 Done'), 'the time row under the calendar ends in its Done text button');
    const done = skiaAction(skia, 'Done').getBoundingClientRect();
    const day = skiaAction(skia, 'Wednesday, 15 May 2024').getBoundingClientRect();
    assert.ok(done.top > day.top + day.height, `the time row sits under the calendar: ${done.top} > ${day.top + day.height}`);
    pressBoth(dom, skia, 'Done');
    assert.equal(same(dom, skia), 'When 2024-05-15 10:30');
    dispose();
  });

  it('takes its time field props under timeInput and its Done button props under done', () => {
    const values = perRoot();
    /** @type {string[]} */
    const pressed = [];
    const view = clocked(() => (
      <DateTimeSelect label="When" value={values.make('2024-05-15 10:30:00')} popover={inline} timeInput={{ label: 'At' }} done={{ children: 'Set', onPress: () => pressed.push('set') }} />
    ));
    const { dom, skia, dispose } = both(view, { width: 480, height: 600 });
    tapBoth(dom, skia, 'When');
    assert.ok(same(dom, skia).includes('At 10:30 Set'), same(dom, skia));
    pressBoth(dom, skia, 'Set');
    assert.deepEqual(pressed, ['set', 'set'], 'its onPress runs, then the panel closes');
    assert.equal(same(dom, skia), 'When 2024-05-15 10:30');
    dispose();
  });
});

describe('TimePicker kind="duration" and its Popover', () => {
  it('takes hours past 23, digits adding up in the hours, no panel', () => {
    const values = perRoot();
    const view = () => (
      <Rui>
        <TimePicker label="Length" kind="duration" value={values.make('')} seconds panel hourDigits={3} format="12h" />
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(same(dom, skia), 'Length ··· : ·· : ··', 'no AM/PM: 24 hours; the hours placeholder hourDigits long');
    focusBoth(dom, skia, 'hours');
    keyBoth(dom, skia, 'ArrowDown');
    assert.equal(same(dom, skia), 'Length 000 : ·· : ··', 'down from empty: 0, the least');
    keyBoth(dom, skia, 'ArrowDown');
    assert.equal(same(dom, skia), 'Length 000 : ·· : ··', 'no wrap to a greatest');
    keyBoth(dom, skia, '1');
    keyBoth(dom, skia, '2');
    keyBoth(dom, skia, '5');
    assert.deepEqual(focused(dom, skia), ['hours', 'hours'], 'the hours do not move on');
    assert.equal(same(dom, skia), 'Length 125 : ·· : ··');
    keyBoth(dom, skia, 'ArrowRight');
    keyBoth(dom, skia, '3');
    keyBoth(dom, skia, '0');
    keyBoth(dom, skia, '0');
    keyBoth(dom, skia, '9');
    assert.deepEqual(values.values(), ['125:30:09', '125:30:09']);
    focusBoth(dom, skia, 'hours');
    keyBoth(dom, skia, 'ArrowUp');
    assert.deepEqual(values.values(), ['126:30:09', '126:30:09']);
    pressBoth(dom, skia, 'hours');
    assert.equal(same(dom, skia), 'Length 126 : 30 : 09', 'a press opens no panel');
    dispose();

    // A value in, and min and max as durations.
    const shown = both(() => (
      <Rui>
        <TimePicker kind="duration" defaultValue="48:05" max="40:00" />
      </Rui>
    ));
    assert.equal(same(shown.dom, shown.skia), '48 : 05');
    focusBoth(shown.dom, shown.skia, 'minutes');
    keyBoth(shown.dom, shown.skia, 'ArrowUp');
    assert.equal(same(shown.dom, shown.skia), '40 : 00', 'clamped to max');
    shown.dispose();
  });

  it('the panel is a Popover: in the portal layer by default, closed by Escape', () => {
    const values = perRoot();
    const view = () => (
      <Rui>
        <TimePicker value={values.make('10:00')} panel />
      </Rui>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 480 });
    try {
    pressBoth(dom, skia, 'minutes');
    // The portal layer: outside the view's host on the DOM, over the page on Skia.
    assert.equal(dom.text(), '10 : 00');
    assert.match(dom.document.body.textContent, /10:00000102/);
    /** @type {any} */
    let item = null;
    for (const stack = [skia.skia.overlay]; stack.length > 0 && item === null; ) {
      const n = stack.shift();
      if (n.label === 'hours 03') item = n;
      for (let c = n.first; c !== null; c = c.next) stack.push(c);
    }
    assert.ok(item !== null, 'in the overlay on Skia');
    const hours = item.getBoundingClientRect();
    const field = skiaAction(skia, 'hours').getBoundingClientRect();
    assert.ok(hours.top > field.bottom, 'below the field');
    skia.skia.press(hours.x + hours.width / 2, hours.y + hours.height / 2);
    skia.skia.release(hours.x + hours.width / 2, hours.y + hours.height / 2);
    $flush(skia.root);
    assert.equal(values.list.map(s => $read(s))[1], '03:00');
    item.focus();
    skia.skia.key('Escape', false);
    $flush(skia.root);
    assert.equal(skia.text(), '03 : 00', 'Escape closed it');
    } finally {
      dispose();
    }
  });
});

describe('pickers in a Modal (popup="modal")', () => {
  const modal = { portal: false, motion: { duration: 0 } };

  it('DateSelect opens its picker in a Modal titled by its label, as wide as the picker, closes on a pick', () => {
    const values = perRoot();
    const view = clocked(() => <DateSelect label="Due" placeholder="Choose day" value={values.make(null)} defaultPeriod="2024-05-01" popup="modal" modal={modal} />);
    const { dom, skia, dispose } = both(view, { width: 600, height: 600 });
    assert.equal(same(dom, skia), 'Due Choose day');
    tapBoth(dom, skia, 'Due');
    assert.ok(same(dom, skia).startsWith('Due Choose day Due May 2024 Mon'), 'the calendar is open under the title');
    assert.equal(dom.nodes('Action').filter((/** @type {any} */ n) => n.getAttribute('aria-label') === 'Close').length, 1, 'its close button');
    // The Modal's box hugs the calendar, centered across.
    const day = skiaAction(skia, 'Wednesday, 15 May 2024').getBoundingClientRect();
    assert.ok(day.left > 100, `not at the left edge: ${day.left}`);
    pressBoth(dom, skia, 'Wednesday, 15 May 2024');
    assert.deepEqual(values.values(), ['2024-05-15', '2024-05-15']);
    assert.equal(same(dom, skia), 'Due 15 May 2024', 'closed on the pick');
    dispose();
  });

  it('DateTimeSelect in a Modal, closed by its Done button or its close button', () => {
    const values = perRoot();
    const view = clocked(() => <DateTimeSelect label="When" value={values.make('2024-05-15 10:30:00')} popup="modal" modal={modal} />);
    const { dom, skia, dispose } = both(view, { width: 600, height: 700 });
    tapBoth(dom, skia, 'When');
    assert.ok(same(dom, skia).startsWith('When 2024-05-15 10:30 When May 2024'));
    pressBoth(dom, skia, 'Thursday, 16 May 2024');
    assert.deepEqual(values.values(), ['2024-05-16 10:30:00', '2024-05-16 10:30:00']);
    pressBoth(dom, skia, 'Done');
    assert.equal(same(dom, skia), 'When 2024-05-16 10:30');
    tapBoth(dom, skia, 'When');
    pressBoth(dom, skia, 'Close');
    assert.equal(same(dom, skia), 'When 2024-05-16 10:30', 'the close button closes it too');
    dispose();
  });
});
