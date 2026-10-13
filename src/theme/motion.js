// Time for animated components (Loader, Skeleton, Transition, Collapse,
// Marquee, DigitRoll, …): `$motion(step)` calls `step(now)` once per
// frame while its owner lives and `step` returns true. The frames come from
// the `Clock` context: the platform's by default (requestAnimationFrame, or
// a 16 ms timer where there is none, as in a worker without it), or a
// manual clock in tests (`manualClock()`), so animations are deterministic.

import { $context, $lookup, $cleanup, $owner, $active, $batch } from 'ren-core';
import { tables } from '../own.js';

/**
 * @typedef {object} ClockValue
 * @property {() => number} now milliseconds
 * @property {(callback: (now: number) => void) => () => void} frame calls back at the next frame; returns a cancel
 */

/** The platform's clock. @type {ClockValue} */
export const platformClock = {
  now: () => (globalThis.performance?.now?.() ?? Date.now()),
  frame(callback) {
    const g = /** @type {any} */ (globalThis);
    if (typeof g.requestAnimationFrame === 'function') {
      const id = g.requestAnimationFrame(callback); // timer: feature, the clock's frame is an animation's step
      return () => g.cancelAnimationFrame(id);
    }
    // timer: fallback, a frame where the host has no requestAnimationFrame.
    const id = setTimeout(() => callback(platformClock.now()), 16);
    return () => clearTimeout(id);
  },
};

/**
 * The motion presets, in ms: `quick` (small panels, tooltips), `base`
 * (sheets, collapsing content), `calm` (large moves, progress), and
 * `hold`, how long a confirmation stays (a copy's 'Done'). A
 * component's `motion`, `duration` or `hold` takes a name or a number.
 */
export const MOTION = Object.freeze(tables({ quick: 110, base: 190, calm: 300, hold: 1500 }));

/** A duration: a MOTION preset's name, or ms. @param {unknown} value @param {number} fallback */
export const durationOf = (value, fallback) => (typeof value === 'number' ? value : typeof value === 'string' && value in MOTION ? MOTION[/** @type {'quick'} */ (value)] : fallback);

/** The clock animations run on. */
export const Clock = $context(/** @type {ClockValue} */ (platformClock));

/**
 * A clock that moves only when told: `advance(ms)` runs the frames due, one
 * per 16 ms step.
 */
export function manualClock() {
  let now = 0;
  /** @type {Set<(now: number) => void>} */
  let waiting = new Set();
  /** @type {ClockValue & { advance: (ms: number) => void, pending: () => number }} */
  const clock = {
    now: () => now,
    frame(callback) {
      waiting.add(callback);
      return () => void waiting.delete(callback);
    },
    advance(ms) {
      const end = now + ms;
      while (now < end) {
        now = Math.min(end, now + 16);
        const due = waiting;
        waiting = new Set();
        for (const callback of due) callback(now);
      }
    },
    pending: () => waiting.size,
  };
  return clock;
}

/**
 * Runs `step(now, elapsed)` once per frame, in a batch, from the next frame
 * on, while `step` returns true and the calling owner lives. Returns a stop.
 * @param {(now: number, elapsed: number) => boolean | void} step
 * @returns {() => void}
 */
export function $motion(step) {
  return motionOn($active(), /** @type {ClockValue} */ ($lookup(Clock)), step);
}

/**
 * `$motion` on the root `R` and the `clock` a component took as it was
 * built: for a motion started from a Watch, whose value may be written
 * outside any handler (a timer, a task), where no view is being built.
 * Internal: not exported from the package.
 * @param {import('ren-core').Graph} R @param {ClockValue} clock
 * @param {(now: number, elapsed: number) => boolean | void} step
 * @returns {() => void}
 */
export function motionOn(R, clock, step) {
  const start = clock.now();
  let stopped = false;
  /** @type {() => void} */
  let cancel = () => {};
  const tick = (/** @type {number} */ now) => {
    if (stopped) return;
    let more = false;
    $batch(R, () => {
      more = step(now, now - start) === true;
    });
    if (more && !stopped) cancel = clock.frame(tick); // timer: feature, a motion's frame loop
  };
  cancel = clock.frame(tick); // timer: feature, a motion's frame loop
  const stop = () => {
    stopped = true;
    cancel();
  };
  const owner = $owner(R);
  if (owner != null) $cleanup(/** @type {any} */ (owner), stop);
  return stop;
}
