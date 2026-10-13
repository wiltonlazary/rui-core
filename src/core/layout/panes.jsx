// Panes: panes side by side (or stacked) with a handle between each pair,
// dragged with pointer capture or moved by the keys, within each pane's
// least and greatest size, in pixels or in percents.

import { View, Action, read, $active, $untrack, $signal, $read, $write } from 'ren-core';
import { styled } from '../../theme/style.js';
import { pageColors } from '../../theme/resolve.js';
import { $ui } from '../../theme/theme.jsx';
import { pass } from './layout.jsx';
import { flat, isPart } from '../data/parts.jsx';
import { $controlled, keyOf } from '../overlays/shared.jsx';
import { boxOf, capture, insetsOf } from '../misc/tween.js';
import { handOn } from '../ref.js';

/** @typedef {{ min: number, max: number }} Bounds */

/** A number kept between two bounds. @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Whether a size is a percent: a string ending in '%'. @param {any} v */
const isPercent = v => typeof v === 'string' && v.trim().endsWith('%');

/** A size's number (px or percent), or null. @param {any} v */
const numberOf = v => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** A percent kept to three decimals (a drag's shares add up without float dust). @param {number} v */
const thousandths = v => Math.round(v * 1000) / 1000;

/**
 * Moves the handle between panes `i` and `i + 1` by `delta`: pane `i`
 * grows by it and pane `i + 1` shrinks by it, each within its bounds. When
 * pane `i + 1` is the last and unsized (the one taking the rest), `room`
 * (the space the sized panes may take; Infinity when unknown) keeps the
 * last pane's minimum. Returns the new sizes.
 * @param {readonly number[]} sizes the sized panes @param {readonly Bounds[]} bounds every pane's
 * @param {number} i @param {number} delta @param {number} room
 */
export function moveHandle(sizes, bounds, i, delta, room) {
  const next = [...sizes];
  let d = clamp(sizes[i] + delta, bounds[i].min, bounds[i].max) - sizes[i];
  if (i + 1 < sizes.length) {
    const other = clamp(sizes[i + 1] - d, bounds[i + 1].min, bounds[i + 1].max);
    d = clamp(sizes[i] + (sizes[i + 1] - other), bounds[i].min, bounds[i].max) - sizes[i];
    next[i + 1] = sizes[i + 1] - d;
  } else {
    const total = sizes.reduce((a, b) => a + b, 0);
    const lastMin = bounds[sizes.length]?.min ?? 0;
    // A list already past the room gives the pane nothing more, never takes from it.
    if (Number.isFinite(room)) d = Math.min(d, Math.max(0, room - lastMin - total));
    d = clamp(sizes[i] + d, bounds[i].min, bounds[i].max) - sizes[i];
  }
  next[i] = sizes[i] + d;
  return next;
}

/** A pane of Panes: `min` and `max` (the Panes' units rule), and style props. @param {Record<string, any>} props */
function PanesPane(props) {
  return <View style={styled(props)}>{props.children}</View>;
}

/**
 * Resizable panes: `Panes.Pane` children (direct), side by side
 * (`orientation` 'horizontal') or stacked ('vertical'), a handle between
 * each pair.
 *
 * Units: a number is pixels, a string '30%' a percent of the room the
 * panes share (the container less its handles). A sizes list takes one
 * unit, its percents deciding it (a number in a percent list is pixels of
 * the room, taken as its percent once the room is measured):
 * - pixels: a size for every pane but the last, which takes the rest; a
 *   missing size is `sizes.box.pane` (200);
 * - percents: a size for every pane, each a true percent of the room: a
 *   missing one shares what is left equally (at least its `min`), sizes
 *   under 100% in all leave the rest of the room empty, and sizes over
 *   100% share the room in proportion; with no sizes at all, pixels.
 * `sizes` with `onSizesChange(sizes)` (controlled) or `defaultSizes`, and
 * `onCommit(sizes)` when a drag or a key that changed them ends (one that
 * moved nothing commits nothing), report sizes in the list's unit ('60%'
 * strings for percents). Each pane's `min` (0) and `max` take either unit
 * (a percent of the room in pixels, or pixels as a percent of it, once it
 * is measured); a given size outside them (`defaultSizes` or `sizes`) is
 * laid out and told within them.
 *
 * Each handle is an Action labeled 'Resize pane N', a `separator`
 * (`aria-orientation` across the panes) with the pane's size and bounds
 * in the list's unit: the arrows move it by `step` (in the list's unit;
 * by default `spacing.xs` px, as a percent of the room in a percent list;
 * Shift five steps), Home and End take the pane to its minimum and
 * maximum. `handleSize` (`spacing.xs`) is the handle's thickness, apart
 * from `step`; `handle` (true) draws its line (`sizes.divider.xs`, the
 * page's `rule`) and its grip (`sizes.glyph.xl` by `sizes.track.sm`, the
 * page's `edge`).
 * @param {Record<string, any>} props
 */
export function Panes(props) {
  const R = $active();
  const ui = $ui();
  const panes = flat(props.children).filter(c => isPart(c, PanesPane));
  const count = panes.length;
  const vertical = () => read(props.orientation) === 'vertical';
  const bar = () => Number(read(props.handleSize) ?? ui.theme().spacing.xs);
  /** @type {any} */
  let root = null;
  /** How many times the container resized: what reads the room follows it. */
  const resized = $signal(R, 0);
  let resizes = 0;
  const style = styled(props, () => ({ direction: vertical() ? 'column' : 'row', overflow: 'hidden' }));
  /** The room the panes share, px (0 before layout): the container's box less its padding and border along the axis, and the handles. */
  const room = () => {
    $read(resized);
    const b = boxOf(root);
    const inset = insetsOf(style());
    const whole = vertical() ? b.height - inset.top - inset.bottom : b.width - inset.left - inset.right;
    return Math.max(0, whole - bar() * (count - 1));
  };
  /** A list's sizes as numbers, in its unit, every entry there. @param {any[] | null | undefined} list */
  const normal = list => {
    const given = list ?? [];
    if (given.some(isPercent)) {
      // A number among percents is pixels of the room: missing until it is measured.
      const space = room();
      const nums = panes.map((_, i) => {
        const n = numberOf(given[i]);
        if (n == null || isPercent(given[i])) return n;
        return space > 0 ? (n / space) * 100 : null;
      });
      const set = nums.reduce((/** @type {number} */ a, b) => a + Math.max(0, b ?? 0), 0);
      const free = nums.filter(n => n == null).length;
      return { percent: true, values: nums.map(n => n ?? Math.max(0, 100 - set) / Math.max(1, free)) };
    }
    const first = $untrack(R, ui.theme).sizes.box.pane;
    return { percent: false, values: panes.slice(0, Math.max(0, count - 1)).map((_, i) => numberOf(given[i]) ?? first) };
  };
  /** Sizes in the list's form: '60%' strings for percents. @param {number[]} values @param {boolean} percent */
  const form = (values, percent) => (percent ? values.map(v => `${thousandths(v)}%`) : values);
  // The list as given (its missing sizes resolved on each read), until a move sets it whole.
  const start = /** @type {any[]} */ ($untrack(R, () => read(props.defaultSizes)) ?? []);
  const state = $controlled(props, 'sizes', null, start, s => props.onSizesChange?.(s));
  const current = () => normal(/** @type {any[]} */ (state.get()));
  const percent = () => current().percent;
  /** The sizes laid out and told (the separators' values): each within its pane's bounds, a missing percent too. */
  const sizes = () => {
    const b = bounds();
    return current().values.map((v, i) => clamp(v, b[i].min, b[i].max));
  };
  /** A bound in the list's unit (a bound in the other unit converts once the room is measured). @param {any} v @param {number} fallback */
  const bound = (v, fallback) => {
    const n = numberOf(v);
    if (n == null) return fallback;
    const pct = percent();
    if (isPercent(v) === pct) return n;
    const space = room();
    if (space <= 0) return fallback;
    return pct ? (n / space) * 100 : (n / 100) * space;
  };
  /** @returns {Bounds[]} */
  const bounds = () => panes.map(p => ({ min: bound(read(p.props.min), 0), max: bound(read(p.props.max), percent() ? 100 : Infinity) }));
  /** Moves handle `i` from `from` by `delta` (the list's unit): the sizes set, or null when they stay. @param {number} i @param {number[]} from @param {number} delta */
  const move = (i, from, delta) => {
    const pct = $untrack(R, percent);
    // Before layout (a room of 0) nothing is known to bound the last pane: no limit then.
    const space = room();
    const moved = moveHandle(from, $untrack(R, bounds), i, delta, pct || space <= 0 ? Infinity : space);
    const next = pct ? moved.map(thousandths) : moved;
    const now = $untrack(R, sizes);
    if (next.every((v, k) => v === now[k])) return null;
    const out = form(next, pct);
    state.set(out);
    return out;
  };
  /** Tells `onCommit` the sizes a drag or a key set (a controlled list's proposal, even when its owner keeps its own); nothing when they stayed. @param {any[] | null} sizes */
  const commit = sizes => {
    if (sizes !== null) props.onCommit?.(sizes);
  };
  const coord = (/** @type {any} */ e) => Number(vertical() ? (e?.clientY ?? e?.y ?? 0) : (e?.clientX ?? e?.x ?? 0));
  /** The drag: its handle, the pointer's start, the sizes then, px per unit, the sizes it last set. */
  let drag = { at: -1, from: 0, start: /** @type {number[]} */ ([]), scale: 1, last: /** @type {any[] | null} */ (null) };
  const end = () => {
    if (drag.at !== -1 && drag.last !== null) commit(drag.last);
    drag.at = -1;
  };
  const handle = (/** @type {number} */ i) => {
    const style = styled({}, (theme, scheme) => ({
      ...(vertical() ? { height: bar(), minHeight: bar(), width: '100%', cursor: 'row-resize', direction: 'column' } : { width: bar(), minWidth: bar(), height: '100%', cursor: 'col-resize', direction: 'row' }),
      position: 'relative',
      shrink: 0,
      padding: 0,
      border: 0,
      touchAction: 'none',
      radius: 0,
      align: 'center',
      justify: 'center',
      background: 'transparent',
      hover: { background: pageColors(theme, scheme).hover },
      focus: { background: pageColors(theme, scheme).hover },
    }));
    const line = styled({}, (theme, scheme) => ({
      ...(vertical() ? { height: theme.sizes.divider.xs, self: 'stretch' } : { width: theme.sizes.divider.xs, self: 'stretch' }),
      background: pageColors(theme, scheme).rule,
    }));
    const grip = styled({}, (theme, scheme) => {
      const long = theme.sizes.glyph.xl;
      const thin = theme.sizes.track.sm;
      const inset = (bar() - thin) / 2;
      return {
        position: 'absolute',
        ...(vertical() ? { width: long, height: thin, left: '50%', top: inset, margin: [0, 0, 0, -long / 2] } : { width: thin, height: long, top: '50%', left: inset, margin: [-long / 2, 0, 0, 0] }),
        radius: thin / 2,
        background: pageColors(theme, scheme).edge,
      };
    });
    const onKey = (/** @type {any} */ e) => {
      const k = keyOf(e);
      const less = vertical() ? 'ArrowUp' : 'ArrowLeft';
      const more = vertical() ? 'ArrowDown' : 'ArrowRight';
      if (k !== less && k !== more && k !== 'Home' && k !== 'End') return;
      e?.preventDefault?.();
      const now = $untrack(R, sizes);
      const b = $untrack(R, bounds)[i];
      const pct = $untrack(R, percent);
      const given = numberOf(read(props.step));
      const space = room();
      const token = ui.theme().spacing.xs;
      // A step in the list's unit; percents without a measured room move by one.
      const one = given ?? (!pct ? token : space > 0 ? (token / space) * 100 : 1);
      const step = one * (e?.shiftKey ? 5 : 1);
      const delta = k === less ? -step : k === more ? step : k === 'Home' ? b.min - now[i] : Math.min(b.max, now[i] + (pct ? 100 : 1e6)) - now[i];
      commit(move(i, now, delta));
    };
    return (
      <Action
        label={`Resize pane ${i + 1}`}
        role="separator"
        aria-orientation={() => (vertical() ? 'horizontal' : 'vertical')}
        aria-valuenow={() => sizes()[i]}
        aria-valuemin={() => bounds()[i].min}
        aria-valuemax={() => {
          const max = bounds()[i].max;
          return Number.isFinite(max) ? max : undefined;
        }}
        onKey={onKey}
        onPointerDown={(/** @type {any} */ e) => {
          if ((e?.button ?? 0) !== 0) return;
          const from = [...$untrack(R, sizes)];
          const total = from.reduce((a, b) => a + b, 0);
          // Percents: a pixel is 100 over the room, or `total` when the list is past 100%.
          const scale = $untrack(R, percent) ? Math.max(total, 100) / Math.max(1, room()) : 1;
          drag = { at: i, from: coord(e), start: from, scale, last: null };
          capture(e);
          e?.preventDefault?.();
        }}
        onPointerMove={(/** @type {any} */ e) => {
          if (drag.at !== i) return;
          const set = move(i, drag.start, (coord(e) - drag.from) * drag.scale);
          if (set !== null) drag.last = set;
        }}
        onPointerUp={end}
        onPointerCancel={end}
        style={style}
      >
        {() => (read(props.handle) === false ? null : <View style={line} />)}
        {() => (read(props.handle) === false ? null : <View style={grip} />)}
      </Action>
    );
  };
  /** @type {any[]} */
  const children = [];
  panes.forEach((p, i) => {
    if (i > 0) children.push(handle(i - 1));
    const last = i === count - 1;
    const paneStyle = styled(p.props, () => {
      const s = sizes()[i];
      const across = vertical() ? { height: 0, minHeight: 0 } : { width: 0, minWidth: 0 };
      // A percent is a grow of its fraction: fractions under 1 in all take only
      // their share of the room (the rest stays spare), over 1 they share it.
      if (percent()) return { direction: 'column', overflow: 'hidden', grow: (s ?? 0) / 100, shrink: 1, ...across };
      if (last) {
        const min = bounds()[i].min;
        return { direction: 'column', overflow: 'hidden', grow: 1, shrink: 1, ...(vertical() ? { height: 0, minHeight: min } : { width: 0, minWidth: min }) };
      }
      return { direction: 'column', overflow: 'hidden', shrink: 0, ...(vertical() ? { height: s } : { width: s }) };
    });
    children.push(
      <View {...pass(p.props)} style={paneStyle}>
        {p.props.children}
      </View>,
    );
  });
  return (
    <View
      {...pass(props)}
      ref={(/** @type {any} */ n) => {
        root = n;
        handOn(props.ref, n);
      }}
      onResize={() => $write(resized, ++resizes)}
      style={style}
    >
      {children}
    </View>
  );
}

Panes.Pane = PanesPane;
