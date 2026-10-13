// Where a panel goes against its trigger inside the viewport: the side it
// takes (flip) and how far it moves along that side (slide). Pure numbers,
// no reactivity and no nodes: Placed measures the boxes and applies the
// answer.

import { tables } from '../../own.js';

/** @typedef {import('./shared.jsx').Side} Side */
/** @typedef {import('./shared.jsx').Align} Align */
/** @typedef {{ x: number, y: number, width: number, height: number }} Box */

/**
 * The answer: the `side` the panel goes on; `shift`, whole px it moves
 * along the cross axis from its aligned place (positive toward the right
 * or down); `length`, its cross-axis length rounded; `center`, whole px
 * from its cross start to where an arrow should aim (always inside it).
 * @typedef {{ side: Side, shift: number, center: number, length: number }} Fit
 */

/**
 * The options: the `side` and `align` asked for, `offset` px between the
 * trigger and the panel, `clear` px kept from the viewport's edges while
 * sliding, and whether it may `flip` to the other side or `slide` along
 * its own.
 * @typedef {{ side: Side, align: Align, offset: number, clear: number, flip?: boolean, slide?: boolean }} CollideOptions
 */

/** @type {Record<Side, Side>} */
const OPPOSITE = tables({ top: 'bottom', bottom: 'top', left: 'right', right: 'left' });

/**
 * The room on `side`: from the trigger (and the offset) to the viewport's
 * edge there.
 * @param {Side} side @param {Box} t @param {Box} v @param {number} offset
 */
function roomOn(side, t, v, offset) {
  if (side === 'top') return t.y - offset - v.y;
  if (side === 'bottom') return v.y + v.height - (t.y + t.height) - offset;
  if (side === 'left') return t.x - offset - v.x;
  return v.x + v.width - (t.x + t.width) - offset;
}

/**
 * The side the panel takes: the asked one when it may not flip or has the
 * room; else the opposite when that has it; else the roomier one, the
 * asked side on a tie.
 * @param {Box} t @param {{ width: number, height: number }} panel @param {Box} v @param {CollideOptions} o
 * @returns {Side}
 */
function sideFor(t, panel, v, o) {
  if (o.flip === false) return o.side;
  const other = OPPOSITE[o.side];
  const need = o.side === 'top' || o.side === 'bottom' ? panel.height : panel.width;
  const asked = roomOn(o.side, t, v, o.offset);
  if (asked >= need) return o.side;
  const there = roomOn(other, t, v, o.offset);
  if (there >= need) return other;
  return there > asked ? other : o.side;
}

/** @param {number} n @param {number} lo @param {number} hi */
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

/**
 * Decides where the panel goes: which side, how far it slides along it and
 * where its arrow aims. Sliding keeps it `clear` px inside the viewport
 * (its start wins when it is longer than that band), ignores less than a
 * pixel, and never pulls it so far that less than half of the smaller of
 * it and its trigger faces the other.
 * @param {Box} trigger @param {{ width: number, height: number }} panel @param {Box} viewport @param {CollideOptions} o
 * @returns {Fit}
 */
export function collide(trigger, panel, viewport, o) {
  const side = sideFor(trigger, panel, viewport, o);
  const across = side === 'top' || side === 'bottom';
  const ts = across ? trigger.x : trigger.y;
  const te = ts + (across ? trigger.width : trigger.height);
  const L = across ? panel.width : panel.height;
  const vs = across ? viewport.x : viewport.y;
  const ve = vs + (across ? viewport.width : viewport.height);
  const p0 = o.align === 'start' ? ts : o.align === 'end' ? te - L : (ts + te) / 2 - L / 2;
  let p = p0;
  if (o.slide !== false) {
    const lo = vs + o.clear;
    const hi = ve - o.clear - L;
    p = hi < lo ? lo : clamp(p0, lo, hi);
    if (Math.abs(p - p0) < 1) p = p0;
    // At least half of the smaller of the two keeps facing the other.
    const half = Math.min(te - ts, L) / 2;
    p = clamp(p, ts + half - L, te - half);
  }
  const shift = Math.round(p - p0) || 0; // never -0
  const start = p0 + shift;
  const length = Math.round(L);
  const aim = clamp((ts + te) / 2, Math.max(start, ts), Math.min(start + L, te));
  const center = clamp(Math.round(aim - start), 0, length);
  return { side, shift, center, length };
}
