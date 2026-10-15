// RangeSlider: a lower and an upper value on Slider's track, two thumbs
// with the bar between them. One rule settles every move, from a drag or a
// key: the moved thumb asks for a value, and the pair keeps its spans.

import { read } from 'ren-core';
import { $value, clamp } from './shared.js';
import { scale, track } from './slider.jsx';
import { labelsIn } from '../../theme/labels.js';

/** `x` kept between two bounds given in either order. @param {number} x @param {number} a @param {number} b */
const between = (x, a, b) => clamp(x, Math.min(a, b), Math.max(a, b));

/**
 * The pair after thumb `i` asks for `v`. `toward` is +1 when the other
 * thumb lies above the moved one and -1 when below, so one formula serves
 * both thumbs: the moved thumb's bounds come from the other thumb and the
 * spans (or, with `push`, from the far end less `minSpan`), and the other
 * thumb then moves the least that keeps both spans.
 * @param {[number, number]} pair @param {number} i @param {number} v
 * @param {{ min: number, max: number, minSpan: number, maxSpan: number, push: boolean }} o
 * @returns {[number, number]}
 */
function settle(pair, i, v, o) {
  const toward = i === 0 ? 1 : -1;
  const other = pair[1 - i];
  const ahead = toward > 0 ? o.max : o.min;
  const behind = toward > 0 ? o.min : o.max;
  let moved;
  let rest = other;
  if (o.push) {
    moved = between(v, behind, ahead - toward * o.minSpan);
    rest = clamp(between(other, moved + toward * o.minSpan, moved + toward * o.maxSpan), o.min, o.max);
  } else {
    moved = clamp(between(v, other - toward * o.minSpan, other - toward * o.maxSpan), o.min, o.max);
  }
  return i === 0 ? [moved, rest] : [rest, moved];
}

/**
 * Which thumb a press at `v` moves: the nearer one; on a tie, the upper
 * above both, the lower below both, else the one with room (the lower when
 * the upper sits at `max`).
 * @param {[number, number]} pair @param {number} v @param {number} max
 */
function pickThumb(pair, v, max) {
  const [lo, hi] = pair;
  const dLo = Math.abs(v - lo);
  const dHi = Math.abs(v - hi);
  if (dLo !== dHi) return dLo < dHi ? 0 : 1;
  if (v > hi) return 1;
  if (v < lo) return 0;
  return hi >= max ? 0 : 1;
}

/**
 * Two values on a track: `value` + `onChange([lo, hi])` or `defaultValue`
 * (`[min, max]`), `onCommit([lo, hi])` (at a drag's release and after each
 * key), `minSpan` (the least distance, one `step` by default, 0 lets the
 * thumbs meet, at most `max - min`), `maxSpan` (the most, none by default),
 * `push` (true: the moved thumb pushes or pulls the other; false: it stops
 * at the other's spans), `thumbLabel` (a string for both thumbs or a pair,
 * `['Lower value', 'Upper value']`), and every Slider prop, except that
 * `fillEnd` is ignored (the bar always runs between the thumbs) and a
 * `readout` left unset shows while a thumb is dragged or focused, not on
 * hover. Each thumb means a `slider` with its value, `min` and `max`.
 * @param {Record<string, any>} props
 */
export function RangeSlider(props) {
  const s = scale(props);
  const model = $value(props, /** @type {[number, number]} */ ([read(props.min) ?? 0, read(props.max) ?? 100]));
  const rule = () => {
    const room = Math.max(0, s.max() - s.min());
    const minSpan = clamp(read(props.minSpan) ?? s.step(), 0, room);
    return { min: s.min(), max: s.max(), minSpan, maxSpan: Math.max(minSpan, read(props.maxSpan) ?? Infinity), push: read(props.push) !== false };
  };
  return track(props, {
    values: () => model.get(),
    set: (i, v, end) => {
      const now = model.get();
      const next = settle(now, i, v, rule());
      if (next[0] !== now[0] || next[1] !== now[1]) model.set(next);
      if (end) props.onCommit?.(next);
    },
    bar: () => {
      const [lo, hi] = model.get();
      return [s.place(lo), s.place(hi)];
    },
    pick: v => pickThumb(model.get(), v, s.max()),
    label: i => {
      const given = read(props.thumbLabel);
      if (typeof given === 'string') return given;
      return (Array.isArray(given) ? given[i] : undefined) ?? (i === 0 ? labelsIn().lowerValue : labelsIn().upperValue);
    },
  });
}
