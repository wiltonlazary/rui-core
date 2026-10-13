// Time hooks: debounce, intervals, timeouts and idleness. Each
// timer belongs to the calling owner and is cleared when it ends; a timer's
// callback runs as one batch of the root, so what it writes shows at once.
// They use the global `setTimeout`/`setInterval` at each call, so tests
// drive them with node:test's `mock.timers`.

import { $signal, $write } from 'ren-core';
import { rooted, timer, ending, later } from './shared.js';

/** @typedef {import('ren-core').Graph} Root */
/**
 * @template T
 * @typedef {import('ren-core').Readable<T>} Readable
 */
/**
 * @template T
 * @typedef {Readable<T> | (() => T)} Source a node or an accessor
 */


/**
 * @template {(...args: any[]) => any} F
 * @typedef {((...args: Parameters<F>) => void) & { cancel: () => void, flush: () => void, pending: () => boolean }} Debounced
 */

/**
 * `callback` called `wait` ms after the last call, with that call's
 * arguments; the second argument is `wait`, or the options `{ wait,
 * leading, flushOnEnd }`. `flush()` calls it now if one is pending;
 * `flushOnEnd` does that when the owner ends.
 * @template {(...args: any[]) => any} F
 * @overload
 * @param {Root} root @param {F} callback @param {number | { wait: number, flushOnEnd?: boolean, leading?: boolean }} wait
 * @returns {Debounced<F>}
 */
/**
 * @template {(...args: any[]) => any} F
 * @overload
 * @param {F} callback @param {number | { wait: number, flushOnEnd?: boolean, leading?: boolean }} wait
 * @returns {Debounced<F>}
 */
/** @param {any[]} args @returns {any} */
export function $debounce(...args) {
  const R = rooted(args);
  const [callback, options] = args;
  const { wait: delay, flushOnEnd = false, leading = false } = typeof options === 'number' ? { wait: options } : options;
  /** @type {any[] | null} */
  let pending = null;
  let quiet = true;
  const t = timer(R);
  const fire = () => {
    const call = pending;
    pending = null;
    if (call !== null) callback(...call);
  };
  /** @param {any[]} call */
  const debounced = (...call) => {
    if (leading && quiet) {
      quiet = false;
      callback(...call);
      t.set(() => void (quiet = true), delay);
      return;
    }
    quiet = false;
    pending = call;
    t.set(() => {
      quiet = true;
      fire();
    }, delay);
  };
  debounced.cancel = () => {
    t.clear();
    pending = null;
    quiet = true;
  };
  debounced.flush = () => {
    if (pending === null) return;
    t.clear();
    quiet = true;
    fire();
  };
  debounced.pending = () => pending !== null;
  if (flushOnEnd) ending(R, () => debounced.flush());
  return debounced;
}


/**
 * @typedef {object} IntervalHandle
 * @property {() => void} start
 * @property {() => void} stop
 * @property {() => void} toggle
 * @property {Readable<boolean>} value whether it is running
 */

/**
 * Calls `fn` every `ms` while started; stopped when
 * the owner ends. `auto` starts it at once.
 * @overload
 * @param {Root} root @param {() => void} fn @param {number} ms @param {{ auto?: boolean }} [options]
 * @returns {IntervalHandle}
 */
/**
 * @overload
 * @param {() => void} fn @param {number} ms @param {{ auto?: boolean }} [options]
 * @returns {IntervalHandle}
 */
/** @param {any[]} args @returns {any} */
export function $interval(...args) {
  const R = rooted(args);
  const [fn, ms, options = {}] = args;
  const auto = options.auto === true;
  // Started at once without a write, so a component body may call it.
  const running = $signal(R, auto);
  /** @type {any} */
  // timer: feature, the interval is the hook.
  let id = auto ? setInterval(() => later(R, fn), ms) : null;
  const stop = () => {
    if (id === null) return;
    clearInterval(id);
    id = null;
    $write(running, false);
  };
  const start = () => {
    if (id !== null) return;
    id = setInterval(() => later(R, fn), ms); // timer: feature, the interval is the hook.
    $write(running, true);
  };
  ending(R, () => {
    if (id !== null) clearInterval(id);
    id = null;
  });
  return { value: running, start, stop, toggle: () => (id === null ? start() : stop()) };
}

/**
 * @typedef {object} TimeoutHandle
 * @property {Readable<boolean>} value pending: whether a call waits
 * @property {(...args: any[]) => void} start
 * @property {() => void} stop
 */

/**
 * Calls `fn` once, `delay` ms after `start(...args)`; a new start replaces
 * the pending call, `stop()` drops it, and so does the owner's end.
 * `value` (pending) is true from a start until the call or a stop.
 * @overload
 * @param {Root} root @param {(...args: any[]) => void} fn @param {number} delay @param {{ auto?: boolean }} [options]
 * @returns {TimeoutHandle}
 */
/**
 * @overload
 * @param {(...args: any[]) => void} fn @param {number} delay @param {{ auto?: boolean }} [options]
 * @returns {TimeoutHandle}
 */
/** @param {any[]} args @returns {any} */
export function $timeout(...args) {
  const R = rooted(args);
  const [fn, delay, options = {}] = args;
  const t = timer(R);
  // Started at once without a write, so a component body may call it.
  const pending = $signal(R, options.auto === true);
  /** @param {any[]} call */
  const arm = call =>
    t.set(() => {
      $write(pending, false);
      fn(...call);
    }, delay);
  const start = (/** @type {any[]} */ ...call) => {
    $write(pending, true);
    arm(call);
  };
  const stop = () => {
    t.clear();
    $write(pending, false);
  };
  if (options.auto === true) arm([]);
  return { value: pending, start, stop };
}

/**
 * @typedef {object} IdleHandle
 * @property {Readable<boolean>} value whether it is idle
 * @property {() => void} reset marks activity now
 * @property {{ onPointerMove: (e: any) => void, onPointerDown: (e: any) => void, onKey: (e: any) => void, onWheel: (e: any) => void }} props
 *   spread on the region whose activity counts (a portable primitive, often the application's outer View)
 */

/**
 * Whether no activity happened for `timeout` ms.
 * Portable: activity is what reaches `props` (pointer, keys, wheel) on the
 * primitive they are spread on, not document listeners; `reset()` counts as
 * activity too. Active at first (a user who has just arrived is there), so
 * idle `timeout` ms later without activity; `initial: true` starts idle.
 * @overload
 * @param {Root} root @param {number} timeout @param {{ initial?: boolean }} [options]
 * @returns {IdleHandle}
 */
/**
 * @overload
 * @param {number} timeout @param {{ initial?: boolean }} [options]
 * @returns {IdleHandle}
 */
/** @param {any[]} args @returns {any} */
export function $idle(...args) {
  const R = rooted(args);
  const [timeout, options = {}] = args;
  const idle = $signal(R, options.initial === true);
  const t = timer(R);
  const reset = () => {
    $write(idle, false);
    t.set(() => void $write(idle, true), timeout);
  };
  if (options.initial !== true) t.set(() => void $write(idle, true), timeout);
  const on = () => reset();
  return { value: idle, reset, props: { onPointerMove: on, onPointerDown: on, onKey: on, onWheel: on } };
}

