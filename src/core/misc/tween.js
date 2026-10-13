// Tweening, the one owner, and measurement for the animated components: a
// value that moves to a goal over the `Clock`'s frames (`$tween`), one that
// follows a reactive goal (`$follow`), a callback at the next frame, and a
// box read from a primitive's ref, all portable (the DOM's and ren-canv's
// `getBoundingClientRect`).

import { $active, $lookup, $signal, $read, $write, $watch, $untrack, $batch, $owner, $cleanup, read } from 'ren-core';
import { Clock, MOTION } from '../../theme/motion.js';
import { tables } from '../../own.js';

/** @typedef {import('../../theme/motion.js').ClockValue} ClockValue */
/** @typedef {(t: number) => number} Ease */

/**
 * Easing curves by CSS name (`ease` as ease-in-out's cubic), and rui's
 * own `settle` (a quartic ease-out: most of the way early, a long gentle
 * landing; DigitRoll's digits).
 * @type {Record<string, Ease>}
 */
export const EASES = tables({
  linear: t => t,
  ease: t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  'ease-in': t => t * t * t,
  'ease-out': t => 1 - (1 - t) ** 3,
  'ease-in-out': t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  settle: t => 1 - (1 - t) ** 4,
});

/** A curve by name or function (`ease-out` by default: quick to start, gentle to settle). @param {string | Ease | undefined | null} ease @returns {Ease} */
export const easeOf = ease => (typeof ease === 'function' ? ease : (EASES[ease ?? 'ease-out'] ?? EASES['ease-out']));

/**
 * @typedef {object} Tween
 * @property {import('rrx-core/core').Readable<number> & object} value the current value, a signal
 * @property {() => number} now the current value, untracked
 * @property {() => boolean} running
 * @property {() => void} stop stops where it is
 * @property {(goal: number, duration: number, done?: () => void, ease?: string | Ease | null) => void} to moves to `goal` in `duration` ms (at once for 0) by `ease` (the tween's own curve by default), then calls `done`
 */

/**
 * A number that moves on the Clock's frames, in a component: `to(goal,
 * duration)` animates it; it stops when its owner goes. `ease` is the curve
 * a move takes unless it names its own (`ease-out` by default).
 * @param {number} initial @param {string | Ease} [ease]
 * @returns {Tween}
 */
export function $tween(initial, ease = 'ease-out') {
  const R = $active();
  const clock = /** @type {ClockValue} */ ($lookup(Clock));
  const value = $signal(R, initial);
  let current = initial;
  /** @type {(() => void) | null} */
  let cancel = null;
  const stop = () => {
    if (cancel !== null) cancel();
    cancel = null;
  };
  const owner = $owner(R);
  if (owner != null) $cleanup(/** @type {any} */ (owner), stop);
  return {
    value: /** @type {any} */ (value),
    now: () => current,
    running: () => cancel !== null,
    stop,
    to(goal, duration, done, curveOf) {
      stop();
      const from = current;
      if (!(duration > 0) || from === goal) {
        current = goal;
        $write(value, goal);
        done?.();
        return;
      }
      const curve = easeOf(curveOf ?? ease);
      const start = clock.now();
      const tick = (/** @type {number} */ now) => {
        cancel = null;
        const t = Math.min(1, Math.max(0, (now - start) / duration));
        current = t === 1 ? goal : from + (goal - from) * curve(t);
        $batch(R, () => {
          $write(value, current);
          if (t === 1) done?.();
        });
        if (t < 1 && cancel === null) cancel = clock.frame(tick); // timer: feature, a tween's frame loop
      };
      cancel = clock.frame(tick); // timer: feature, a tween's frame loop
    },
  };
}

/**
 * A number that follows `goal` (read in a tracked scope) from where it is
 * to each new value over `duration` ms (a value, an accessor or a signal;
 * 0: at once; `MOTION.base` by default), ease-out; `$tween` moves it.
 * @param {() => number} goal @param {any} [duration]
 * @returns {() => number}
 */
export function $follow(goal, duration = MOTION.base) {
  const R = $active();
  const t = $tween($untrack(R, goal));
  $watch(R, goal, to => t.to(to, Number(read(duration)) || 0));
  return () => /** @type {number} */ ($read(t.value));
}

/**
 * A measurement taken in the next frame, after the renderer lays the view
 * out: calls back at the Clock's next frame, in a batch, while the calling
 * component lives. Returns the scheduler; each call replaces a pending one.
 * @returns {(callback: () => void) => void}
 */
export function $nextFrame() {
  const R = $active();
  const clock = /** @type {ClockValue} */ ($lookup(Clock));
  /** @type {(() => void) | null} */
  let cancel = null;
  const owner = $owner(R);
  if (owner != null)
    $cleanup(/** @type {any} */ (owner), () => {
      if (cancel !== null) cancel();
      cancel = null;
    });
  return callback => {
    if (cancel !== null) cancel();
    // timer: feature, a measurement's frame.
    cancel = clock.frame(() => {
      cancel = null;
      $batch(R, callback);
    });
  };
}

/**
 * A primitive's border box where it was last laid out (zeros before, or
 * where the renderer cannot say).
 * @param {any} node
 * @returns {{ width: number, height: number, x: number, y: number }}
 */
export function boxOf(node) {
  const r = node != null && typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null;
  return r == null ? { width: 0, height: 0, x: 0, y: 0 } : { width: r.width || 0, height: r.height || 0, x: r.x ?? r.left ?? 0, y: r.y ?? r.top ?? 0 };
}

/**
 * A resolved style's insets on each side, its padding and its border, in
 * px: `padding` as the portable Sides (one value for all four, two for y
 * and x, four from the top), a side's own border
 * width over `border` (all four). What is not a number counts 0.
 * @param {Record<string, any>} s
 * @returns {{ top: number, right: number, bottom: number, left: number }}
 */
export function insetsOf(s) {
  const p = s.padding;
  const list = Array.isArray(p) ? p : typeof p === 'number' ? [p] : [];
  const px = (/** @type {any} */ v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const [t, r = t, b = t, l = r] = list;
  return {
    top: px(s.paddingTop ?? t) + px(s.borderTop ?? s.border),
    right: px(s.paddingRight ?? r) + px(s.borderRight ?? s.border),
    bottom: px(s.paddingBottom ?? b) + px(s.borderBottom ?? s.border),
    left: px(s.paddingLeft ?? l) + px(s.borderLeft ?? s.border),
  };
}

/** A resolved style's border widths on each side, in px (its insets without the padding). @param {Record<string, any>} s */
export const bordersOf = s => insetsOf({ border: s.border, borderTop: s.borderTop, borderRight: s.borderRight, borderBottom: s.borderBottom, borderLeft: s.borderLeft });

/**
 * Keeps a pointer's moves and release on the pressed primitive until the
 * release (the DOM's and ren-canv's `setPointerCapture`); a pointer the
 * platform no longer tracks is left alone.
 * @param {any} event a pointerdown
 */
export function capture(event) {
  try {
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  } catch {
    // No active pointer of that id (a synthetic event): nothing to hold.
  }
}

