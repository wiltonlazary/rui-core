// Gantt: tasks as bars on a timeline of days, dragged to reschedule and
// resized by their ends (with pointer capture, snapped to whole days), with
// their dependencies drawn with Shape lines.

import { View, Label, Shape, Scroll, For, read, $active, $signal, $read, $write, $untrack, $watch } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { styled } from '../../theme/style.js';
import { alpha } from '../../theme/colors.js';
import { pageColors, colorOf, radiusOf } from '../../theme/resolve.js';
import { pass } from '../../core/layout/layout.jsx';
import { dragger, $barRoom } from './shared.js';
import { DECOR } from '../../theme/meaning.js';

const DAY = 86400000; // ms: one day

/**
 * @typedef {object} GanttTask
 * @property {string} id
 * @property {string} name
 * @property {Date | number | string} start the first day (a Date, ms or 'YYYY-MM-DD'; UTC days)
 * @property {Date | number | string} end the last day, included
 * @property {number=} progress percent
 * @property {string=} color
 * @property {string[]=} dependencies the ids of the tasks this one follows
 */

/** A day number (days since 1970-01-01 UTC) of a Date, ms or 'YYYY-MM-DD'. @param {Date | number | string} v */
export function dayNumber(v) {
  const ms = v instanceof Date ? v.getTime() : typeof v === 'string' ? Date.parse(v.length === 10 ? `${v}T00:00:00Z` : v) : Number(v);
  return Math.floor(ms / DAY);
}

/** A day number back in the kind `like` was given in. @param {number} day @param {Date | number | string} like */
export function dayValue(day, like) {
  const d = new Date(day * DAY);
  if (typeof like === 'string') return d.toISOString().slice(0, 10);
  if (typeof like === 'number') return day * DAY;
  return d;
}

/**
 * A task after a drag of `days`: moved, or one end resized (never past
 * the other).
 * @param {{ start: number, end: number }} from @param {number} days @param {'move' | 'start' | 'end'} mode
 */
export function rescheduled(from, days, mode) {
  if (mode === 'move') return { start: from.start + days, end: from.end + days };
  if (mode === 'start') return { start: Math.min(from.end, from.start + days), end: from.end };
  return { start: from.start, end: Math.max(from.start, from.end + days) };
}

/** A day number as 'YYYY-MM-DD'. @param {number} day */
const isoDay = day => new Date(day * DAY).toISOString().slice(0, 10);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A Gantt chart: `tasks` (GanttTask[]), `onTaskChange(task)` (the task
 * with its new `start` and `end`, in the kind they were given, after a
 * drag), `onTaskPress(task)`, `from` and `to` (the timeline; the tasks'
 * first day less one and last day plus one by default), `dayWidth` (32),
 * `rowHeight` (36), `labelWidth` (160), `headerHeight` (40) (`sizes.box.gantt`), `editable`
 * (true; false: no drags, a press still calls `onTaskPress`), `color` (the bars' default), `taskLabel` (the header of the
 * names column, 'Task'). A drag on a bar moves it, on its
 * ends resizes it, in whole days. Days are UTC. A timeline wider than the
 * chart scrolls across under the task names, which stay (sticky). It
 * means a `grid`: a `row` per task, its name the `rowheader` and its bar a
 * `gridcell` named by its days ('2026-09-01 to 2026-09-05, 40%, after
 * Design'); the header's days are one `columnheader` named by the range.
 * @param {Record<string, any>} props
 */
export function Gantt(props) {
  const R = $active();
  const ui = $ui();
  /** @typedef {{ task: GanttTask, start: number, end: number, row: number }} Bar */
  const bars = $signal(R, /** @type {Bar[]} */ ([]));
  $watch(R, () => /** @type {GanttTask[]} */ (read(props.tasks) ?? []), list =>
    $write(bars, list.map((task, row) => ({ task, start: dayNumber(task.start), end: dayNumber(task.end), row }))),
  );
  const list = () => /** @type {Bar[]} */ ($read(bars));
  // The range follows the tasks given, not a drag in progress (the timeline stays put under the pointer).
  const given = () => /** @type {GanttTask[]} */ (read(props.tasks) ?? []);
  const first = () => {
    const s = read(props.from);
    if (s != null) return dayNumber(s);
    const all = given();
    return all.length === 0 ? dayNumber(Date.now()) : Math.min(...all.map(t => dayNumber(t.start))) - 1;
  };
  const last = () => {
    const e = read(props.to);
    if (e != null) return dayNumber(e);
    const all = given();
    return all.length === 0 ? first() + 14 : Math.max(...all.map(t => dayNumber(t.end))) + 1;
  };
  const dayWidth = () => Number(read(props.dayWidth) ?? ui.theme().sizes.box.gantt.day);
  const rowHeight = () => Number(read(props.rowHeight) ?? ui.theme().sizes.box.gantt.row);
  const labelWidth = () => Number(read(props.labelWidth) ?? ui.theme().sizes.box.gantt.label);
  const headerHeight = () => Number(read(props.headerHeight) ?? ui.theme().sizes.box.gantt.header);
  const days = () => {
    /** @type {number[]} */
    const out = [];
    for (let d = first(); d <= last() && out.length < 3660; d++) out.push(d);
    return out;
  };
  const width = () => days().length * dayWidth();
  const editable = () => read(props.editable) !== false;
  const set = (/** @type {string} */ id, /** @type {{ start: number, end: number }} */ next) => {
    const now = $untrack(R, list);
    $write(bars, now.map(b => (b.task.id === id ? { ...b, ...next } : b)));
  };
  const drag = dragger({
    /** @param {{ id: string, from: { start: number, end: number }, mode: 'move' | 'start' | 'end' }} s */
    onMove: (dx, _dy, s) => {
      // Not editable: a drag moves nothing (a press is still a task press).
      if (!$untrack(R, editable)) return;
      const next = rescheduled(s.from, Math.round(dx / $untrack(R, dayWidth)), s.mode);
      const bar = $untrack(R, list).find(b => b.task.id === s.id);
      if (bar !== undefined && (bar.start !== next.start || bar.end !== next.end)) set(s.id, next);
    },
    onEnd: (s, moved) => {
      const bar = $untrack(R, list).find(b => b.task.id === s.id);
      if (bar === undefined) return;
      const changed = bar.start !== s.from.start || bar.end !== s.from.end;
      // Locked while dragged: back where it was, no change told.
      if (moved && changed && !$untrack(R, editable)) set(s.id, s.from);
      else if (moved && changed) props.onTaskChange?.({ ...bar.task, start: dayValue(bar.start, bar.task.start), end: dayValue(bar.end, bar.task.end) });
      else if (!moved) props.onTaskPress?.(bar.task);
    },
  });
  const line = () => {
    const theme = ui.theme();
    return pageColors(theme, ui.scheme()).rule;
  };

  // Dependencies: from the end of each dependency to the start of its dependent.
  const links = () => {
    const all = list();
    const byId = new Map(all.map(b => [b.task.id, b]));
    const w = dayWidth();
    const h = rowHeight();
    const color = pageColors(ui.theme(), ui.scheme()).quiet;
    /** @type {Record<string, any>[]} */
    const out = [];
    for (const b of all)
      for (const id of b.task.dependencies ?? []) {
        const from = byId.get(id);
        if (from === undefined) continue;
        const x0 = (from.end + 1 - first()) * w;
        const y0 = from.row * h + h / 2;
        const x1 = (b.start - first()) * w;
        const y1 = b.row * h + h / 2;
        const points = x1 - 6 >= x0 + 6 ? [x0, y0, x0 + 6, y0, x0 + 6, y1, x1 - 1, y1] : [x0, y0, x0 + 6, y0, x0 + 6, y0 + (y1 > y0 ? h / 2 : -h / 2), x1 - 6, y0 + (y1 > y0 ? h / 2 : -h / 2), x1 - 6, y1, x1 - 1, y1];
        out.push({ kind: 'path', points, stroke: 1.5, color });
        out.push({ kind: 'path', closed: true, points: [x1 - 6, y1 - 4, x1, y1, x1 - 6, y1 + 4], color });
      }
    return out;
  };

  const barStyle = (/** @type {() => Bar} */ bar) =>
    styled({}, (theme, scheme) => {
      const b = bar();
      const color = colorOf(theme, scheme, b.task.color ?? read(props.color));
      return {
        position: 'absolute',
        left: (b.start - first()) * dayWidth() + 1,
        top: theme.control.panelPad,
        width: (b.end - b.start + 1) * dayWidth() - 2,
        height: rowHeight() - 2 * theme.control.panelPad,
        radius: radiusOf(theme, 'sm'),
        background: alpha(color, theme.opacity.soft),
        overflow: 'hidden',
        direction: 'row',
        cursor: editable() ? 'grab' : 'default',
        ...(editable() ? { touchAction: 'none' } : null),
      };
    });
  const fill = (/** @type {() => Bar} */ bar) =>
    styled({}, (theme, scheme) => ({
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: `${Math.max(0, Math.min(100, Number(bar().task.progress ?? 0)))}%`,
      background: colorOf(theme, scheme, bar().task.color ?? read(props.color)),
    }));
  const handle = (/** @type {() => Bar} */ bar, /** @type {'start' | 'end'} */ mode) => (
    <View
      onPointerDown={(/** @type {any} */ e) => {
        // Not editable: the press goes on to the bar (a task press).
        if (!editable()) return;
        e?.stopPropagation?.();
        const b = $untrack(R, bar);
        drag.down(e, { id: b.task.id, from: { start: b.start, end: b.end }, mode });
      }}
      onPointerMove={drag.move}
      onPointerUp={drag.up}
      onPointerCancel={drag.cancel}
      style={() => ({ position: 'absolute', top: 0, bottom: 0, width: ui.theme().spacing.xs, ...(mode === 'start' ? { left: 0 } : { right: 0 }), cursor: editable() ? 'ew-resize' : 'default', zIndex: 1, ...(editable() ? { touchAction: 'none' } : null) })}
    />
  );
  // The names' column: held at the left of the Scroll across, over the bars, with its rule.
  const names = styled({}, (theme, scheme) => ({
    width: labelWidth() + 1,
    shrink: 0,
    justify: 'center',
    padding: [0, theme.spacing.xs],
    borderRight: 1,
    borderColor: line(),
    position: 'sticky',
    left: 0,
    zIndex: 1,
    background: pageColors(theme, scheme).body,
  }));
  /** A bar's days, progress and dependencies, as its name. @param {Bar} b */
  const barName = b => {
    const byId = new Map(list().map(x => [x.task.id, x.task.name]));
    const after = (b.task.dependencies ?? []).map(id => byId.get(id)).filter(n => n !== undefined);
    return `${isoDay(b.start)} to ${isoDay(b.end)}${b.task.progress != null ? `, ${b.task.progress}%` : ''}${after.length > 0 ? `, after ${after.join(', ')}` : ''}`;
  };
  const row = (/** @type {() => Bar} */ bar) => (
    <View role="row" style={() => ({ direction: 'row', height: rowHeight(), shrink: 0 })}>
      <View role="rowheader" style={names}>
        <Label text={() => bar().task.name} ellipsis />
      </View>
      <View role="gridcell" aria-label={() => barName(bar())} style={() => ({ position: 'relative', width: width(), shrink: 0 })}>
        <View
          onPointerDown={(/** @type {any} */ e) => {
            const b = $untrack(R, bar);
            drag.down(e, { id: b.task.id, from: { start: b.start, end: b.end }, mode: 'move' });
          }}
          onPointerMove={drag.move}
          onPointerUp={drag.up}
          onPointerCancel={drag.cancel}
          style={barStyle(bar)}
        >
          <View style={fill(bar)} />
          {handle(bar, 'start')}
          {handle(bar, 'end')}
        </View>
      </View>
    </View>
  );
  const dayLabel = (/** @type {() => number} */ day) => () => {
    const d = new Date(day() * DAY);
    return d.getUTCDate() === 1 || day() === first() ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` : String(d.getUTCDate());
  };
  const style = styled(props, (theme, scheme) => ({
    direction: 'column',
    position: 'relative',
    fontSize: theme.fontSizes.sm,
    color: pageColors(theme, scheme).text,
    background: pageColors(theme, scheme).body,
    border: 1,
    borderColor: line(),
    radius: radiusOf(theme, 'sm'),
    overflow: 'hidden',
    maxWidth: labelWidth() + 1 + width() + 2,
  }));
  // The Scroll across is as high as the header, the rows and its bar's room.
  const across = $barRoom();
  return (
    <View role="grid" {...pass(props)} style={style}>
      <Scroll axis="x" ref={across.ref} onResize={across.onResize} style={() => ({ height: headerHeight() + 1 + list().length * rowHeight() + across.room(), shrink: 0 })}>
        <View style={() => ({ direction: 'column', width: labelWidth() + 1 + width(), shrink: 0 })}>
          <View role="row" style={() => ({ direction: 'row', height: headerHeight(), shrink: 0, fontWeight: ui.theme().weights.strong })}>
            <View role="columnheader" style={names}>
              <Label text={() => read(props.taskLabel) ?? 'Task'} />
            </View>
            <View role="columnheader" aria-label={() => `${isoDay(first())} to ${isoDay(last())}`} style={() => ({ direction: 'row', width: width(), shrink: 0 })}>
              <For by="position" each={days}>
                {day => (
                  <View {...DECOR} style={() => ({ width: dayWidth(), shrink: 0, align: 'center', justify: 'center', fontSize: ui.theme().fontSizes.xs })}>
                    <Label text={dayLabel(day)} style={{ textAlign: 'center' }} />
                  </View>
                )}
              </For>
            </View>
          </View>
          <View style={() => ({ height: 1, shrink: 0, background: line() })} />
          <View style={{ position: 'relative', direction: 'column' }}>
            {/* Under the bars: the lines take no pointer from them. */}
            <Shape shapes={links} style={() => ({ position: 'absolute', left: labelWidth() + 1, top: 0, width: width(), height: list().length * rowHeight() })} />
            <For each={list} by={(/** @type {Bar} */ b) => b.task.id}>
              {bar => row(bar)}
            </For>
          </View>
        </View>
      </Scroll>
    </View>
  );
}
