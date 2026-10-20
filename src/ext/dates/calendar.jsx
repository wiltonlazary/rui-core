// Calendar and the inline pickers on it: Calendar (the headless base:
// views month, year and decade, columns, header controls, keys), DatePanel
// (one date, several, or a range), MonthPanel, YearPanel and DayStrip.
// Every control is a portable Action, so each renders and answers presses
// and keys the same on every renderer.
//
// Keys, while a control of the grid has focus: the arrows move by a day and
// a week (a month and three months in a year, a year and three years in a
// decade), Home and End go to the start and end of the week (year,
// decade), PageUp and PageDown to the previous and next month (with Shift,
// year; a year and a decade on the other views), Enter and Space press.
// Moving past what is shown turns the page; disabled controls are skipped.

import { View, Label, Action, Show, For, Times, $active, $after, $owner, $cleanup, $signal, $read, $write, $untrack, read } from 'ren-core';
import { styled, pressLook } from '../../theme/style.js';
import { $ui } from '../../theme/theme.jsx';
import { radiusOf, pageColors, fontBelow } from '../../theme/resolve.js';
import { BackIcon, ForwardIcon } from '../../core/buttons/index.js';
import {
  toDate, addDays, addMonths, addYears, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfDecade, startOfWeek, endOfWeek,
  compareDates, sameMonth, within, monthDays, yearMonths, decadeYears, formatDate, partsOf, monthInRange, yearInRange, weekNumber, dayOfWeek,
} from './arith.js';
import { $settings, $dateValue, daySize, fontOf, cellStyle, TodayDot } from './shared.jsx';
import { DECOR, flag, state as aria } from '../../theme/meaning.js';

/** @typedef {import('./arith.js').CalendarView} CalendarView */
/** @typedef {import('./shared.jsx').CellState} CellState */
/**
 * What `dayOf`, `monthOf` and `yearOf` return for a control: its
 * state, `onPress`, `onPointerEnter`, `style`.
 * @typedef {CellState & { onPress?: (e?: any) => void, onPointerEnter?: (e?: any) => void, style?: Record<string, any> }} ControlProps
 */

const VIEWS = /** @type {const} */ (['month', 'year', 'decade']);

/** The days of a week, across the month grid. */
const WEEK_DAYS = 7; // count: days in a week

/** A day's accessible name: its full date. */
const DAY_LABEL = 'EEEE, D MMMM YYYY';

/** @param {any} view */
const rank = view => Math.max(0, VIEWS.indexOf(view));

/**
 * The controls a calendar shows, to focus them by date.
 * @typedef {{ view: CalendarView, date: () => string, shown: () => boolean, node: any }} Cell
 */
function $cells() {
  /** @type {Cell[]} */
  const list = [];
  return {
    /** @param {Cell} cell */
    add(cell) {
      list.push(cell);
      const owner = $owner($active());
      if (owner != null)
        $cleanup(/** @type {any} */ (owner), () => {
          const at = list.indexOf(cell);
          if (at >= 0) list.splice(at, 1);
        });
    },
    /** The control showing `date` on `view`. @param {CalendarView} view @param {string} date */
    find: (view, date) => list.find(c => c.view === view && c.shown() && c.date() === date)?.node ?? null,
  };
}

/** Whether a key is Enter or Space. @param {string} key */
const pressKey = key => key === 'Enter' || key === ' ';

/**
 * A calendar: it shows and moves, and selects nothing
 * by itself; `dayOf(date)` (and `monthOf`, `yearOf`) give each control
 * its state and `onPress`.
 * - `view`/`defaultView`/`onViewChange` ('month', 'year', 'decade'),
 *   `minView` ('month'), `maxView` ('decade').
 * - `period`/`defaultPeriod`/`onPeriodChange`: the month (year, decade) shown
 *   first; today by default. `months` (1) side by side, `monthsPerMove`.
 * - `min`, `max`, `exclude(date)`, `weekStart` (1), `weekend`
 *   ([0, 6]), `sixWeeks`, `outside` (true: the days of the months around),
 *   `weekdays` (true: the header), `weekNumbers`, `markToday`, `today`.
 * - `onDayPress(date)`, `onMonthPress(date)`, `onYearPress(date)`,
 *   `renderDay(date)`, `inert` (no presses, no keys).
 * - Formats (formatDate's tokens): `monthFormat` ('MMM YYYY'),
 *   `yearFormat` ('YYYY'), `decadeFormat` ('YYYY', each end of 'YYYY…YYYY'), `monthCellFormat`
 *   ('MMM'), `yearCellFormat` ('YYYY'), `weekdayFormat` ('EEE', the
 *   abbreviated name); `labels` for the words (month and weekday names,
 *   the controls' labels, the week numbers' heading 'Wk').
 * - Each day is named by its full date ('EEEE, D MMMM YYYY': Tuesday,
 *   5 March 2024). The header's controls hold the pointer glyphs
 *   (BackIcon, ForwardIcon). A year's months and a decade's years are
 *   controls two days and an xs step wide, a step taller than a day,
 *   centered under the header. The look of the days and a range:
 *   `cellStyle` in shared.jsx (a range is one band with round ends,
 *   today a dot under its number).
 * - `size` (xs to xl: days of 28 to 48 px; md, 36 px, by default), `radius`, `color`.
 * @param {Record<string, any>} props
 */
export function Calendar(props) {
  const R = $active();
  const ui = $ui();
  const settings = $settings(props);
  const cells = $cells();
  const minView = () => /** @type {CalendarView} */ (read(props.minView) ?? 'month');
  const maxView = () => /** @type {CalendarView} */ (read(props.maxView) ?? 'decade');
  const clampView = (/** @type {any} */ l) => VIEWS[Math.min(rank(maxView()), Math.max(rank(minView()), rank(l ?? minView())))];
  const viewModel = $dateValue(props, 'view', 'defaultView', /** @type {CalendarView} */ ('month'), 'onViewChange');
  const view = () => clampView(viewModel.get());
  const dateModel = $dateValue(props, 'period', 'defaultPeriod', /** @type {string | null} */ (null), 'onPeriodChange');
  const open = $untrack(R, () => settings.today());
  const anchor = () => toDate(dateModel.get()) ?? open;
  const columns = () => Math.max(1, Number(read(props.months) ?? 1));
  const scroll = () => Math.max(1, Number(read(props.monthsPerMove) ?? columns()));
  const min = () => toDate(read(props.min));
  const max = () => toDate(read(props.max));
  // Days of 36 px (md) unless `size` says otherwise.
  const sizeName = () => read(props.size) ?? 'md';
  const size = () => daySize(ui.theme(), sizeName());
  const still = () => read(props.inert) === true;
  /** The first date a column shows on a view. @param {CalendarView} l @param {number} i */
  const columnDate = (l, i) => (l === 'month' ? addMonths(startOfMonth(anchor()), i) : l === 'year' ? addYears(startOfYear(anchor()), i) : addYears(startOfDecade(anchor()), 10 * i));
  const setAnchor = (/** @type {string} */ d) => {
    if (d !== anchor()) dateModel.set(d);
  };
  const setView = (/** @type {CalendarView} */ l) => {
    if (l !== view()) viewModel.set(l);
  };

  // ------------------------------------------------------------ header
  const step = (/** @type {number} */ dir) => {
    const l = view();
    const n = scroll() * dir;
    setAnchor(l === 'month' ? addMonths(startOfMonth(anchor()), n) : l === 'year' ? addYears(startOfYear(anchor()), n) : addYears(startOfDecade(anchor()), 10 * n));
  };
  const previousOff = () => {
    const lo = min();
    if (lo === null) return false;
    const l = view();
    const first = columnDate(l, 0);
    const before = l === 'month' ? endOfMonth(addMonths(first, -1)) : endOfYear(addYears(first, -1));
    return compareDates(before, lo) < 0;
  };
  const nextOff = () => {
    const hi = max();
    if (hi === null) return false;
    const l = view();
    return compareDates(columnDate(l, columns()), hi) > 0;
  };
  const headerLabel = (/** @type {number} */ i) => {
    const l = view();
    const d = columnDate(l, i);
    const L = settings.labels();
    if (l === 'month') return formatDate(d, read(props.monthFormat) ?? 'MMM YYYY', L);
    if (l === 'year') return formatDate(d, read(props.yearFormat) ?? 'YYYY', L);
    return `${formatDate(d, read(props.decadeFormat) ?? 'YYYY', L)}…${formatDate(addYears(d, 9), read(props.decadeFormat) ?? 'YYYY', L)}`;
  };
  const controlLabel = (/** @type {number} */ dir) => {
    const L = settings.labels();
    const l = view();
    return l === 'month' ? (dir < 0 ? L.previousMonth : L.nextMonth) : l === 'year' ? (dir < 0 ? L.previousYear : L.nextYear) : dir < 0 ? L.previousDecade : L.nextDecade;
  };
  const controlStyle = (/** @type {() => boolean} */ off) =>
    styled({}, (theme, scheme) => {
      const s = size();
      return {
        width: s,
        height: s,
        minWidth: s,
        minHeight: s,
        padding: 0,
        border: 0,
        shrink: 0,
        align: 'center',
        justify: 'center',
        radius: radiusOf(theme, read(props.radius)),
        background: 'transparent',
        color: pageColors(theme, scheme).text,
        ...pressLook(theme, off()),
        ...(off() ? { opacity: theme.opacity.disabled } : { hover: { background: pageColors(theme, scheme).hover } }),
      };
    });
  const ink = () => pageColors(ui.theme(), ui.scheme()).text;
  const arrow = (/** @type {number} */ dir) => {
    const off = () => still() || (dir < 0 ? previousOff() : nextOff());
    return (
      <Action label={() => controlLabel(dir)} onPress={() => !off() && step(dir)} style={controlStyle(off)}>
        {dir < 0 ? <BackIcon size={() => Math.round(size() * ui.theme().ratios.glyph)} color={ink} /> : <ForwardIcon size={() => Math.round(size() * ui.theme().ratios.glyph)} color={ink} />}
      </Action>
    );
  };
  const spacer = () => <View style={() => ({ width: size(), height: size(), shrink: 0 })} />;
  const header = (/** @type {number} */ i) => {
    const up = () => !still() && rank(view()) < rank(maxView());
    const labelStyle = styled({}, (theme, scheme) => ({
      grow: 1,
      height: size(),
      minHeight: size(),
      padding: [0, theme.spacing.xs],
      border: 0,
      align: 'center',
      justify: 'center',
      textAlign: 'center',
      fontSize: fontOf(theme, sizeName()),
      fontWeight: theme.weights.strong,
      radius: radiusOf(theme, read(props.radius)),
      background: 'transparent',
      color: pageColors(theme, scheme).text,
      ...(up() ? pressLook(theme) : { cursor: 'default' }),
      ...(up() ? { hover: { background: pageColors(theme, scheme).hover } } : null),
    }));
    const bar = styled({}, theme => ({ direction: 'row', align: 'center', margin: [0, 0, theme.spacing.xs, 0] }));
    return (
      <View style={bar}>
        {i === 0 ? arrow(-1) : spacer()}
        <Action text={() => headerLabel(i)} onPress={() => up() && setView(VIEWS[rank(view()) + 1])} style={labelStyle} />
        {() => (i === columns() - 1 ? arrow(1) : spacer())}
      </View>
    );
  };

  // ------------------------------------------------------------ keys
  const disabledOn = (/** @type {CalendarView} */ l, /** @type {string} */ d) => {
    const lo = min();
    const hi = max();
    if (l === 'month') {
      if ((lo !== null && compareDates(d, lo) < 0) || (hi !== null && compareDates(d, hi) > 0)) return true;
      return props.exclude?.(d) === true || read(props.dayOf?.(d))?.disabled === true;
    }
    if (l === 'year') return !monthInRange(d, lo, hi) || props.monthOf?.(d)?.disabled === true;
    return !yearInRange(d, lo, hi) || props.yearOf?.(d)?.disabled === true;
  };
  /** Moves focus to `goal` on view `l`, turning the page to show it; a disabled goal steps on by `delta` days (months, years). */
  const moveTo = (/** @type {CalendarView} */ l, /** @type {string} */ goal, /** @type {number} */ delta) => {
    const lo = min();
    const hi = max();
    const shift = (/** @type {string} */ d, /** @type {number} */ n) => (l === 'month' ? addDays(d, n) : l === 'year' ? addMonths(d, n) : addYears(d, n));
    let t = goal;
    for (let i = 0; i < 400 && delta !== 0 && disabledOn(l, t); i++) {
      t = shift(t, delta);
      // Past the range while moving away from it: nothing to reach. Toward it (Home or End from a cut row), keep going.
      if ((delta < 0 && lo !== null && compareDates(l === 'month' ? t : l === 'year' ? endOfMonth(t) : endOfYear(t), lo) < 0) || (delta > 0 && hi !== null && compareDates(t, hi) > 0)) return;
    }
    if (disabledOn(l, t)) return;
    const n = columns();
    const first = columnDate(l, 0);
    const at =
      l === 'month'
        ? (partsOf(t)[0] - partsOf(first)[0]) * 12 + partsOf(t)[1] - partsOf(first)[1]
        : l === 'year'
          ? partsOf(t)[0] - partsOf(first)[0]
          : Math.floor((partsOf(t)[0] - partsOf(first)[0]) / 10);
    const unit = l === 'month' ? startOfMonth(t) : l === 'year' ? startOfYear(t) : startOfDecade(t);
    const back = (/** @type {number} */ k) => (l === 'month' ? addMonths(unit, -k) : l === 'year' ? addYears(unit, -k) : addYears(unit, -10 * k));
    if (at < 0) setAnchor(unit);
    else if (at >= n) setAnchor(back(n - 1));
    const node = at >= 0 && at < n ? cells.find(l, t) : null;
    if (node !== null) node.focus?.();
    else $after(R, () => cells.find(l, t)?.focus?.());
  };
  /** The date a key moves to from `d` on view `l`, with the step to skip disabled ones. @returns {[string, number] | null} */
  const keyGoal = (/** @type {CalendarView} */ l, /** @type {string} */ d, /** @type {any} */ e) => {
    const k = e.key;
    const fdow = settings.weekStart();
    if (l === 'month') {
      if (k === 'ArrowLeft') return [addDays(d, -1), -1];
      if (k === 'ArrowRight') return [addDays(d, 1), 1];
      if (k === 'ArrowUp') return [addDays(d, -7), -7];
      if (k === 'ArrowDown') return [addDays(d, 7), 7];
      if (k === 'Home') return [startOfWeek(d, fdow), 1];
      if (k === 'End') return [endOfWeek(d, fdow), -1];
      if (k === 'PageUp') return [e.shiftKey ? addYears(d, -1) : addMonths(d, -1), -1];
      if (k === 'PageDown') return [e.shiftKey ? addYears(d, 1) : addMonths(d, 1), 1];
      return null;
    }
    const move = (/** @type {number} */ n) => (l === 'year' ? addMonths(d, n) : addYears(d, n));
    if (k === 'ArrowLeft') return [move(-1), -1];
    if (k === 'ArrowRight') return [move(1), 1];
    if (k === 'ArrowUp') return [move(-3), -1];
    if (k === 'ArrowDown') return [move(3), 1];
    if (k === 'Home') return [l === 'year' ? startOfYear(d) : startOfDecade(d), 1];
    if (k === 'End') return [l === 'year' ? addMonths(startOfYear(d), 11) : addYears(startOfDecade(d), 9), -1];
    if (k === 'PageUp') return [l === 'year' ? addYears(d, -1) : addYears(d, -10), -1];
    if (k === 'PageDown') return [l === 'year' ? addYears(d, 1) : addYears(d, 10), 1];
    return null;
  };
  /** A control's key handler. @param {CalendarView} l @param {() => string} date @param {() => void} press */
  const keysOf = (l, date, press) => (/** @type {any} */ e) => {
    if (still()) return;
    if (pressKey(e.key)) {
      e.preventDefault?.();
      press();
      return;
    }
    const to = keyGoal(l, date(), e);
    if (to === null) return;
    e.preventDefault?.();
    moveTo(l, to[0], to[1]);
  };

  // ------------------------------------------------------------ controls
  const cellFont = () => fontOf(ui.theme(), sizeName());
  /** A control's style from its state. @param {() => CellState} state @param {() => number | string} width @param {() => number} height @param {() => any} extra */
  const controlOf = (state, width, height, extra) =>
    styled({}, (theme, scheme) => ({
      ...cellStyle(theme, scheme, state(), { width: width(), height: height(), fontSize: cellFont(), radius: radiusOf(theme, read(props.radius)), color: read(props.color) }),
      ...(still() ? { cursor: 'default', hover: null } : null),
      ...read(extra()?.style),
    }));

  /** A day of the month grid. @param {() => string} date @param {() => string} month */
  const Day = (date, month) => {
    const extra = () => /** @type {ControlProps} */ (props.dayOf?.(date()) ?? {});
    const outside = () => !sameMonth(date(), month());
    const hidden = () => outside() && read(props.outside) === false;
    const state = () => {
      const d = date();
      const x = extra();
      return /** @type {CellState} */ ({
        selected: x.selected === true,
        span: x.span ?? false,
        disabled: disabledOn('month', d),
        outside: outside(),
        weekend: settings.weekend().includes(dayOfWeek(d)),
        today: read(props.markToday) === true && d === settings.today(),
      });
    };
    const press = () => {
      if (still() || state().disabled) return;
      extra().onPress?.();
      props.onDayPress?.(date());
    };
    /** @type {Cell} */
    const cell = { view: 'month', date, shown: () => !hidden() && !outside(), node: null };
    cells.add(cell);
    const size_ = () => size();
    const text = () => String(partsOf(date())[2]);
    return (
      <Show when={hidden} fallback={
        <Action
          ref={(/** @type {any} */ n) => (cell.node = n)}
          label={() => formatDate(date(), DAY_LABEL, settings.labels())}
          datetime={date}
          role="gridcell"
          aria-selected={aria(() => state().selected === true)}
          aria-disabled={flag(() => state().disabled === true)}
          aria-current={() => (date() === settings.today() ? 'date' : undefined)}
          selected={() => state().selected === true}
          onPress={press}
          onKey={keysOf('month', date, press)}
          onPointerEnter={() => extra().onPointerEnter?.()}
          style={controlOf(state, size_, size_, extra)}
        >
          {props.renderDay === undefined ? <Label text={text} /> : () => props.renderDay(date())}
          <TodayDot state={state} color={() => read(props.color)} />
        </Action>
      }>
        <View style={() => ({ width: size(), height: size(), shrink: 0 })} />
      </Show>
    );
  };

  /** A month's grid. @param {number} i the column */
  const MonthGrid = (i) => {
    const month = () => columnDate('month', i);
    const weeks = () => monthDays(month(), settings.weekStart(), settings.sixWeeks());
    const names = () => {
      const week = weeks()[0];
      const L = settings.labels();
      const format = read(props.weekdayFormat) ?? 'EEE';
      return week.map(d => formatDate(d, format, L));
    };
    const weekdayStyle = styled({}, (theme, scheme) => ({
      width: size(),
      shrink: 0,
      textAlign: 'center',
      fontSize: fontBelow(theme, fontOf(theme, sizeName())),
      color: pageColors(theme, scheme).quiet,
      padding: [0, 0, theme.spacing.xs, 0],
    }));
    const numbers = () => read(props.weekNumbers) === true;
    return (
      <View role="grid" aria-label={() => formatDate(month(), 'MMMM YYYY', settings.labels())} style={{ direction: 'column' }}>
        <Show when={() => read(props.weekdays) !== false}>
          <View role="row" style={{ direction: 'row' }}>
            <Show when={numbers}>
              <Label {...DECOR} text={() => settings.labels().week} style={weekdayStyle} />
            </Show>
            <For by="position" each={names}>{name => <Label role="columnheader" text={name} style={weekdayStyle} />}</For>
          </View>
        </Show>
        <For by="position" each={weeks}>
          {week => (
            <View role="row" style={{ direction: 'row' }}>
              {/* A row's ISO week is its Thursday's, whatever day the row starts on. */}
              <Show when={numbers}>
                <Label {...DECOR} text={() => String(weekNumber(week().find(d => dayOfWeek(d) === 4) ?? week()[0]))} style={() => ({ ...weekdayStyle(), height: size(), padding: 0, align: 'center', lineHeight: size() / Math.max(1, cellFont()) })} />
              </Show>
              <For by="position" each={week}>{date => Day(date, month)}</For>
            </View>
          )}
        </For>
      </View>
    );
  };

  // A year's months and a decade's years: each two days and a spacing step
  // (xs) wide, a step taller than a day; their grid is centered in the
  // column, which keeps a week's width when the calendar can show days.
  const listWidth = () => 2 * size() + ui.theme().spacing.xs;
  const listHeight = () => size() + ui.theme().spacing.xs;
  const columnStyle = styled({}, () => ({ direction: 'column', ...(minView() === 'month' ? { minWidth: size() * (WEEK_DAYS + (read(props.weekNumbers) === true ? 1 : 0)) } : null) }));

  /** A month or year control of the year and decade lists. @param {'year' | 'decade'} l @param {() => string} date @param {number} i the column */
  const ListControl = (l, date, i) => {
    const on = l === 'year' ? 'month' : 'year';
    const extra = () => /** @type {ControlProps} */ ((l === 'year' ? props.monthOf : props.yearOf)?.(date()) ?? {});
    const state = () => {
      const x = extra();
      return /** @type {CellState} */ ({
        selected: x.selected === true,
        span: x.span ?? false,
        disabled: disabledOn(l === 'year' ? 'year' : 'decade', date()),
        // The year before and after the decade fill the grid, quiet.
        outside: l === 'decade' && Math.floor(partsOf(date())[0] / 10) !== Math.floor(partsOf(columnDate('decade', i))[0] / 10),
        today: read(props.markToday) === true && (l === 'year' ? sameMonth(date(), settings.today()) : partsOf(date())[0] === partsOf(settings.today())[0]),
      });
    };
    const press = () => {
      if (still() || state().disabled) return;
      extra().onPress?.();
      const d = date();
      if (l === 'year') props.onMonthPress?.(d);
      else props.onYearPress?.(d);
      if (rank(view()) > rank(minView())) {
        setAnchor(d);
        setView(/** @type {CalendarView} */ (on));
      }
    };
    /** @type {Cell} */
    const cell = { view: l === 'year' ? 'year' : 'decade', date, shown: () => true, node: null };
    cells.add(cell);
    const text = () => formatDate(date(), l === 'year' ? (read(props.monthCellFormat) ?? 'MMM') : (read(props.yearCellFormat) ?? 'YYYY'), settings.labels());
    return (
      <Action
        ref={(/** @type {any} */ n) => (cell.node = n)}
        label={() => formatDate(date(), l === 'year' ? 'MMMM YYYY' : 'YYYY', settings.labels())}
        datetime={() => date().slice(0, l === 'year' ? 7 : 4)}
        role="gridcell"
        aria-selected={aria(() => state().selected === true)}
        aria-disabled={flag(() => state().disabled === true)}
        selected={() => state().selected === true}
        onPress={press}
        onKey={keysOf(cell.view, date, press)}
        onPointerEnter={() => extra().onPointerEnter?.()}
        style={controlOf(state, listWidth, listHeight, extra)}
      >
        <Label text={text} />
        <TodayDot state={state} color={() => read(props.color)} />
      </Action>
    );
  };

  /** A year's months or a decade's years. @param {'year' | 'decade'} l @param {number} i */
  const List = (l, i) => {
    const rows = () => (l === 'year' ? yearMonths(columnDate('year', i)) : decadeYears(columnDate('decade', i)));
    return (
      <View role="grid" aria-label={() => headerLabel(i)} style={{ direction: 'column', self: 'center' }}>
        <For by="position" each={rows}>{row => <View role="row" style={{ direction: 'row' }}><For by="position" each={row}>{date => ListControl(l, date, i)}</For></View>}</For>
      </View>
    );
  };

  const style = styled(props, theme => ({ direction: 'row', gap: theme.spacing.lg, align: 'start' }));
  return (
    <View ref={props.ref} style={style}>
      <Times count={columns}>
        {i => (
          <View style={columnStyle}>
            {header(i)}
            <Show when={() => view() === 'month'}>{MonthGrid(i)}</Show>
            <Show when={() => view() === 'year'}>{List('year', i)}</Show>
            <Show when={() => view() === 'decade'}>{List('decade', i)}</Show>
          </View>
        )}
      </Times>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Selection

/**
 * A picker's selection: `mode` 'single' (one
 * value or null), 'multiple' (an array) or 'range' ([start, end], null
 * while unset), controlled (`value` + `onChange`) or not (`defaultValue`),
 * at a grain: days, months (the 1st) or years (January 1st).
 * @param {Record<string, any>} props @param {'day' | 'month' | 'year'} grain
 */
export function $selection(props, grain) {
  const R = $active();
  const mode = /** @type {'single' | 'multiple' | 'range'} */ ($untrack(R, () => read(props.mode)) ?? 'single');
  const fallback = mode === 'multiple' ? [] : mode === 'range' ? [null, null] : null;
  const model = $dateValue(props, 'value', 'defaultValue', /** @type {any} */ (fallback), 'onChange');
  const hovered = $signal(R, /** @type {string | null} */ (null));
  /** @param {any} v @returns {string | null} */
  const norm = v => {
    const d = toDate(v);
    if (d === null) return null;
    return grain === 'day' ? d : grain === 'month' ? startOfMonth(d) : startOfYear(d);
  };
  const list = () => {
    const v = model.get();
    if (mode === 'multiple') return /** @type {any[]} */ (v ?? []).map(norm).filter(d => d !== null);
    if (mode === 'range') {
      const r = /** @type {any[]} */ (v ?? [null, null]);
      return [norm(r[0]), norm(r[1])];
    }
    return [norm(v)];
  };
  const same = (/** @type {string | null} */ a, /** @type {string | null} */ b) => a !== null && a === b;
  return {
    mode,
    /** The first date selected, for the page a picker opens on. */
    first: () => list().find(d => d != null) ?? null,
    /** @param {string} date */
    pick(date) {
      const d = /** @type {string} */ (norm(date));
      if (mode === 'multiple') {
        const now = /** @type {string[]} */ (list());
        model.set(now.includes(d) ? now.filter(x => x !== d) : [...now, d]);
        return;
      }
      if (mode === 'range') {
        const [s, e] = list();
        if (s !== null && e === null) {
          $write(hovered, null);
          if (same(s, d)) model.set(read(props.singleDay) === true ? [d, d] : [null, null]);
          else model.set(compareDates(d, s) < 0 ? [d, s] : [s, d]);
        } else model.set([d, null]);
        return;
      }
      const now = list()[0];
      if (same(now, d)) {
        if (read(props.deselectable) === true) model.set(null);
      } else model.set(d);
    },
    /** @param {string} date */
    enter(date) {
      if (mode !== 'range') return;
      const [s, e] = list();
      if (s !== null && e === null) $write(hovered, norm(date));
    },
    /** A control's state. @param {string} date @returns {CellState} */
    state(date) {
      const d = norm(date);
      if (mode === 'multiple') return { selected: list().includes(d) };
      if (mode === 'range') {
        const [s, e] = list();
        const end = e ?? $read(hovered);
        if (s === null) return {};
        if (end === null) return { selected: same(s, d), span: same(s, d) ? 'solo' : false };
        const lo = compareDates(s, end) <= 0 ? s : end;
        const hi = lo === s ? end : s;
        const inside = d !== null && within(d, lo, hi);
        const span = !inside ? false : lo === hi ? 'solo' : same(lo, d) ? 'start' : same(hi, d) ? 'end' : 'middle';
        return { selected: same(lo, d) || same(hi, d), span };
      }
      return { selected: same(list()[0], d) };
    },
    model,
  };
}

/** Merges a picker's state into the caller's control props. @param {ReturnType<typeof $selection>} sel @param {((date: string) => any) | undefined} own @param {string} date */
const merged = (sel, own, date) => {
  const theirs = own?.(date) ?? {};
  return {
    ...sel.state(date),
    ...theirs,
    onPress: () => {
      sel.pick(date);
      theirs.onPress?.();
    },
    onPointerEnter: () => {
      sel.enter(date);
      theirs.onPointerEnter?.();
    },
  };
};

/** The props a picker passes on to its Calendar (all but its value's). @param {Record<string, any>} props */
const calendarProps = props => {
  const out = { ...props };
  for (const k of ['value', 'defaultValue', 'onChange', 'mode', 'deselectable', 'singleDay', 'presets']) delete out[k];
  return out;
};

/**
 * A date panel (a Calendar that picks): Calendar's props, and `mode`
 * ('single', 'multiple', 'range'), `value`/`defaultValue`/`onChange`
 * ('YYYY-MM-DD', an array of them, or [start, end]), `deselectable`,
 * `singleDay` (a range may start and end on one day), `presets` ([{ value, label }], beside the
 * calendar: `value` has the shape of the picker's own value in its mode, a day, a list or a range).
 * @param {Record<string, any>} props
 */
export function DatePanel(props) {
  const sel = $selection(props, 'day');
  const R = $active();
  const date = $dateValue(props, 'period', 'defaultPeriod', /** @type {string | null} */ ($untrack(R, () => read(props.defaultPeriod) ?? sel.first())), 'onPeriodChange');
  const calendar = (
    <Calendar
      {...calendarProps(props)}
      period={date.get}
      onPeriodChange={date.set}
      defaultPeriod={undefined}
      minView="month"
      dayOf={(/** @type {string} */ d) => merged(sel, props.dayOf, d)}
    />
  );
  if (props.presets === undefined) return calendar;
  const preset = (/** @type {{ value: any, label: string }} */ p) => {
    const choose = () => {
      sel.model.set(p.value);
      const first = Array.isArray(p.value) ? p.value[0] : p.value;
      if (toDate(first) !== null) date.set(startOfMonth(/** @type {string} */ (toDate(first))));
    };
    return (
      <Action
        text={p.label}
        onPress={choose}
        style={styled({}, (theme, scheme) => ({
          padding: theme.control.optionPad,
          border: 0,
          radius: radiusOf(theme, read(props.radius)),
          background: 'transparent',
          color: pageColors(theme, scheme).text,
          fontSize: fontOf(theme, read(props.size) ?? 'md'),
          textAlign: 'start',
          justify: 'start',
          ...pressLook(theme),
          hover: { background: pageColors(theme, scheme).hover },
        }))}
      />
    );
  };
  return (
    <View style={styled({}, theme => ({ direction: 'row', gap: theme.spacing.sm, align: 'start' }))}>
      <View style={{ direction: 'column', gap: 2 }}>{() => read(props.presets).map(preset)}</View>
      {calendar}
    </View>
  );
}

/**
 * A month panel: the year and decade views;
 * values are the months' 1st days. `mode`, `value`, `defaultValue`,
 * `onChange`, `deselectable`, `singleDay`, and Calendar's.
 * @param {Record<string, any>} props
 */
export function MonthPanel(props) {
  const sel = $selection(props, 'month');
  const R = $active();
  const date = $dateValue(props, 'period', 'defaultPeriod', /** @type {string | null} */ ($untrack(R, () => read(props.defaultPeriod) ?? sel.first())), 'onPeriodChange');
  return (
    <Calendar
      {...calendarProps(props)}
      period={date.get}
      onPeriodChange={date.set}
      defaultPeriod={undefined}
      minView="year"
      defaultView={props.defaultView ?? 'year'}
      monthOf={(/** @type {string} */ d) => merged(sel, props.monthOf, d)}
    />
  );
}

/**
 * A year panel: the decade view; values are the
 * years' January 1st. `mode`, `value`, `defaultValue`, `onChange`,
 * `deselectable`, `singleDay`, and Calendar's.
 * @param {Record<string, any>} props
 */
export function YearPanel(props) {
  const sel = $selection(props, 'year');
  const R = $active();
  const date = $dateValue(props, 'period', 'defaultPeriod', /** @type {string | null} */ ($untrack(R, () => read(props.defaultPeriod) ?? sel.first())), 'onPeriodChange');
  return (
    <Calendar
      {...calendarProps(props)}
      period={date.get}
      onPeriodChange={date.set}
      defaultPeriod={undefined}
      minView="decade"
      maxView="decade"
      yearOf={(/** @type {string} */ d) => merged(sel, props.yearOf, d)}
    />
  );
}

// ---------------------------------------------------------------------------
// DayStrip

/**
 * Days in a row: `days` (7, a week) from `period`
 * (`defaultPeriod`, `onPeriodChange`; the value's or today by default);
 * `value`/`defaultValue`/`onChange` (one date), `min`, `max`, `dayOf`,
 * `weekdayFormat` ('EEEEE', one letter), `monthFormat` ('MMM'), `size`
 * (md, as Calendar's: days of `sizes.day.md`),
 * `labels`, `markToday`. Each day is two lines: its weekday's initial,
 * small and quiet, over its number; on a month's 1st the small line names
 * the month instead, so the strip says where a month begins. The side
 * controls are square, a day's side, holding the pointer glyphs; they
 * turn by `days`; the arrows move by a day, Home and End to the first and
 * last shown.
 * @param {Record<string, any>} props
 */
export function DayStrip(props) {
  const R = $active();
  const ui = $ui();
  const settings = $settings(props);
  const value = $dateValue(props, 'value', 'defaultValue', /** @type {string | null} */ (null), 'onChange');
  const start = $dateValue(props, 'period', 'defaultPeriod', /** @type {string | null} */ ($untrack(R, () => toDate(value.get()))), 'onPeriodChange');
  const open = $untrack(R, () => settings.today());
  const first = () => toDate(start.get()) ?? open;
  const count = () => Math.max(1, Number(read(props.days) ?? 7));
  const min = () => toDate(read(props.min));
  const max = () => toDate(read(props.max));
  // md by default, as Calendar's days.
  const step = () => read(props.size) ?? 'md';
  const size = () => daySize(ui.theme(), step());
  // A day of two lines, the small one over the number: a spacing step (md) taller than a day.
  const dayHeight = (/** @type {import('../../theme/theme.jsx').RuiThemeValue} */ theme) => size() + theme.spacing.md;
  const cells = $cells();
  const days = () => Array.from({ length: count() }, (_, i) => addDays(first(), i));
  const outOf = (/** @type {string} */ d) => {
    const lo = min();
    const hi = max();
    return (lo !== null && compareDates(d, lo) < 0) || (hi !== null && compareDates(d, hi) > 0);
  };
  const turn = (/** @type {number} */ dir) => {
    let next = addDays(first(), dir * count());
    const lo = min();
    const hi = max();
    if (lo !== null && compareDates(next, lo) < 0) next = lo;
    if (hi !== null && compareDates(addDays(next, count() - 1), hi) > 0) next = compareDates(addDays(hi, 1 - count()), first()) > 0 ? addDays(hi, 1 - count()) : first();
    if (next !== first()) start.set(next);
  };
  const off = (/** @type {number} */ dir) => () => {
    if (dir < 0) return min() !== null && compareDates(addDays(first(), -1), /** @type {string} */ (min())) < 0;
    return max() !== null && compareDates(addDays(first(), count()), /** @type {string} */ (max())) > 0;
  };
  const ink = () => pageColors(ui.theme(), ui.scheme()).text;
  const arrow = (/** @type {number} */ dir) => {
    const disabled = off(dir);
    const L = () => settings.labels();
    return (
      <Action
        label={() => (dir < 0 ? L().previousDays : L().nextDays)}
        onPress={() => !disabled() && turn(dir)}
        style={styled({}, (theme, scheme) => ({
          // Square, a day's side, in the middle of the row.
          width: size(),
          height: size(),
          minWidth: size(),
          minHeight: size(),
          padding: 0,
          border: 0,
          shrink: 0,
          align: 'center',
          justify: 'center',
          radius: radiusOf(theme, read(props.radius)),
          background: 'transparent',
          ...pressLook(theme, disabled()),
          ...(disabled() ? { opacity: theme.opacity.disabled } : { hover: { background: pageColors(theme, scheme).hover } }),
        }))}
      >
        {dir < 0 ? <BackIcon size={() => Math.round(size() * ui.theme().ratios.glyph)} color={ink} /> : <ForwardIcon size={() => Math.round(size() * ui.theme().ratios.glyph)} color={ink} />}
      </Action>
    );
  };
  const moveTo = (/** @type {string} */ d) => {
    if (outOf(d)) return;
    const at = compareDates(d, first());
    if (at < 0) start.set(d);
    else if (at >= count()) start.set(addDays(d, 1 - count()));
    const node = at >= 0 && at < count() ? cells.find('month', d) : null;
    if (node !== null) node.focus?.();
    else $after(R, () => cells.find('month', d)?.focus?.());
  };
  const Day = (/** @type {() => string} */ date) => {
    const extra = () => /** @type {ControlProps} */ (props.dayOf?.(date()) ?? {});
    const state = () =>
      /** @type {CellState} */ ({
        ...extra(),
        selected: extra().selected ?? toDate(value.get()) === date(),
        disabled: extra().disabled === true || outOf(date()),
        today: read(props.markToday) === true && date() === settings.today(),
      });
    const press = () => {
      if (state().disabled) return;
      extra().onPress?.();
      value.set(date());
    };
    /** @type {Cell} */
    const cell = { view: 'month', date, shown: () => true, node: null };
    cells.add(cell);
    const keys = (/** @type {any} */ e) => {
      const k = e.key;
      if (pressKey(k)) {
        e.preventDefault?.();
        press();
        return;
      }
      const to = k === 'ArrowLeft' ? addDays(date(), -1) : k === 'ArrowRight' ? addDays(date(), 1) : k === 'Home' ? first() : k === 'End' ? addDays(first(), count() - 1) : null;
      if (to === null) return;
      e.preventDefault?.();
      moveTo(to);
    };
    const style = styled({}, (theme, scheme) => ({
      ...cellStyle(theme, scheme, state(), { width: size(), height: dayHeight(theme), fontSize: fontOf(theme, step()), radius: radiusOf(theme, read(props.radius)), color: read(props.color) }),
      direction: 'column',
      gap: 0,
      ...read(extra().style),
    }));
    const small = styled({}, theme => ({ fontSize: fontBelow(theme, fontOf(theme, step()), 2), opacity: theme.opacity.muted }));
    /** The small line: the weekday's initial, or the month on its 1st. */
    const over = () => formatDate(date(), partsOf(date())[2] === 1 ? (read(props.monthFormat) ?? 'MMM') : (read(props.weekdayFormat) ?? 'EEEEE'), settings.labels());
    return (
      <Action
        ref={(/** @type {any} */ n) => (cell.node = n)}
        label={() => formatDate(date(), DAY_LABEL, settings.labels())}
        datetime={date}
        selected={() => state().selected === true}
        onPress={press}
        onKey={keys}
        style={style}
      >
        <Label text={over} style={small} />
        <Label text={() => String(partsOf(date())[2])} />
        <TodayDot state={state} color={() => read(props.color)} />
      </Action>
    );
  };
  return (
    <View ref={props.ref} style={styled(props, () => ({ direction: 'row', align: 'center', gap: 2 }))}>
      {arrow(-1)}
      <For by="position" each={days}>{date => Day(date)}</For>
      {arrow(1)}
    </View>
  );
}
