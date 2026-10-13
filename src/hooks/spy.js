// The heading a Scroll is at, on every renderer: headings register through
// refs, the Scroll takes `scroll`'s props, and `value` names the heading
// the reading line (the Scroll's top plus `offset`) has reached. Measuring
// is coalesced to the Clock's frames.

import { $signal, $read, $write, $untrack, $lookup } from 'ren-core';
import { rooted, ending, later } from './shared.js';
import { Clock, platformClock } from '../theme/motion.js';

/** @typedef {import('ren-core').Graph} Root */
/**
 * @template T
 * @typedef {import('ren-core').Readable<T>} Readable
 */
/** @typedef {{ label: string, level: number, id: string | undefined }} SpyHeading */

/**
 * @typedef {object} SpyHandle
 * @property {Readable<number>} value the active heading's index, 0 from the start
 * @property {Readable<boolean>} measured false until a measurement found boxes
 * @property {Readable<SpyHeading[]>} headings the headings, in registration order
 * @property {{ ref: (node: any) => void, onScroll: () => void }} scroll props for the Scroll the headings are in
 * @property {(label: any, level?: number, id?: string) => (node: any) => void} heading a ref for a heading's primitive (null removes it)
 * @property {(index: number) => void} scrollTo brings a heading to the reading line and makes it active
 * @property {() => void} refresh measures again at the next frame
 */

/** Where a registered heading's node is; `null` when it has no box. @param {any} node */
function boxOf(node) {
  if (node == null || typeof node.getBoundingClientRect !== 'function') return null;
  const box = node.getBoundingClientRect();
  // An empty box is a node not laid out (hidden, or not placed yet).
  return box.width === 0 && box.height === 0 ? null : box;
}

/**
 * The active heading among `tops` (each heading's top below the Scroll's
 * top, NaN without a box): the last one at or above the reading line (1 px
 * of tolerance), else the first; at the Scroll's end, the last one whose
 * top shows, when one does. -1 when no heading has a box.
 * @param {number[]} tops @param {number} line @param {number} height the visible height, NaN unknown @param {boolean} end
 */
function activeHeading(tops, line, height, end) {
  let reached = -1;
  let shown = -1;
  let boxed = false;
  for (let i = 0; i < tops.length; i++) {
    const top = tops[i];
    if (Number.isNaN(top)) continue;
    boxed = true;
    if (top <= line + 1) reached = i;
    if (top >= 0 && top < height) shown = i;
  }
  if (!boxed) return -1;
  if (end && shown > reached) return shown;
  return reached >= 0 ? reached : 0;
}

/**
 * A scroll spy: `value` is the index of the heading the reading line has
 * reached (`offset` px below the Scroll's top; 0 before any), measured at
 * the next frame of the nearest Clock after a scroll, a ref or `refresh()`.
 * In a worker, whose refs have no boxes, `value` stays 0.
 * @overload
 * @param {Root} root @param {{ offset?: number }} [options]
 * @returns {SpyHandle}
 */
/**
 * @overload
 * @param {{ offset?: number }} [options]
 * @returns {SpyHandle}
 */
/** @param {any[]} args @returns {any} */
export function $spy(...args) {
  const R = rooted(args);
  const offset = Number(args[0]?.offset ?? 0);
  /** @type {import('../theme/motion.js').ClockValue} */
  let clock = platformClock;
  try {
    clock = $lookup(Clock);
  } catch {
    // A root outside a view: the platform's frames.
  }
  const value = $signal(R, 0);
  const measured = $signal(R, false);
  const headings = $signal(R, /** @type {SpyHeading[]} */ ([]));
  /** @type {{ node: any, heading: SpyHeading }[]} */
  let marks = [];
  /** @type {any} */
  let scroller = null;
  let listed = false;
  let ended = false;
  /** @type {(() => void) | null} */
  let cancel = null;

  /** @param {any} node @param {any} v */
  const put = (node, v) => {
    if (!Object.is($untrack(R, () => $read(node)), v)) $write(node, v);
  };

  const measure = () => {
    if (listed) {
      listed = false;
      $write(headings, marks.map(m => m.heading));
    }
    const frame = boxOf(scroller);
    if (frame === null) return;
    const tops = marks.map(m => {
      const box = boxOf(m.node);
      return box === null ? NaN : box.top - frame.top;
    });
    const { scrollTop, clientHeight, scrollHeight } = scroller;
    const numbers = typeof scrollTop === 'number' && typeof clientHeight === 'number' && typeof scrollHeight === 'number';
    const end = numbers && scrollTop + clientHeight >= scrollHeight - 1;
    const active = activeHeading(tops, offset, numbers ? clientHeight : frame.height, end);
    if (active < 0) return;
    put(value, active);
    put(measured, true);
  };

  // One measurement per frame, however many asks came in it.
  const ask = () => {
    if (cancel !== null || ended) return;
    cancel = clock.frame(() => { // timer: feature, one measurement per frame, however many asks came in it
      cancel = null;
      if (!ended) later(R, measure);
    });
  };
  ending(R, () => {
    ended = true;
    cancel?.();
    cancel = null;
  });

  /** @param {any} label @param {number} [level] @param {string} [id] */
  const heading = (label, level = 1, id) => {
    /** @type {any} */
    let mine = null;
    const mark = { label: String(label), level, id };
    return (/** @type {any} */ node) => {
      if (node == null) {
        const had = marks.length;
        marks = marks.filter(m => m.node !== mine);
        mine = null;
        listed ||= marks.length !== had;
      } else {
        const at = marks.findIndex(m => m.node === node);
        if (at >= 0) marks[at] = { node, heading: mark };
        else marks.push({ node, heading: mark });
        mine = node;
        listed = true;
      }
      ask();
    };
  };

  /** @param {number} index */
  const scrollTo = index => {
    const i = Math.trunc(index);
    if (!(i >= 0 && i < marks.length)) return;
    const frame = boxOf(scroller);
    const box = boxOf(marks[i].node);
    if (frame === null || box === null) return;
    scroller.scrollTop = Math.max(0, (Number(scroller.scrollTop) || 0) + box.top - frame.top - offset);
    put(value, i);
    ask();
  };

  return {
    value,
    measured,
    headings,
    scroll: {
      ref: (/** @type {any} */ node) => {
        scroller = node;
        if (node != null) ask();
      },
      onScroll: ask,
    },
    heading,
    scrollTo,
    refresh: ask,
  };
}
