// A value that follows its source at a pace: `$debounced` shows the source
// once it has kept still, `$throttled` at most once per period. Each hook
// keeps a single timer, owned by the caller and cleared when it ends; the
// timer's write runs as one batch of the root, so it shows at once.

import { $signal, $write, $untrack, $watch, read } from 'ren-core';
import { rooted, timer } from './shared.js';

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
 * Calls `change` with each new value of `source` after the hook is made (a
 * value equal to the last one seen is no change). Returns the value now.
 * @template T
 * @param {Root} R @param {Source<T>} source @param {(value: T) => void} change
 * @returns {T}
 */
function follow(R, source, change) {
  let seen = /** @type {T} */ ($untrack(R, () => read(source)));
  $watch(
    R,
    () => /** @type {T} */ (read(source)),
    next => {
      if (Object.is(next, seen)) return;
      seen = next;
      change(next);
    },
  );
  return seen;
}

/**
 * `value` follows `source` once the source has kept still for `wait` ms:
 * every change restarts the quiet period, and its end shows the latest
 * value. `leading` shows the first change of a quiet period at once (later
 * ones in that period still show at its end). `cancel()` drops the pending
 * update; the next change starts a new period.
 *
 * One timer serves every change: a change only notes its time, and when the
 * timer fires it either writes (the source kept still long enough) or
 * re-arms itself for the rest of the quiet period.
 * @template T
 * @overload
 * @param {Root} root @param {Source<T>} source @param {number} wait @param {{ leading?: boolean }} [options]
 * @returns {{ value: Readable<T>, cancel: () => void }}
 */
/**
 * @template T
 * @overload
 * @param {Source<T>} source @param {number} wait @param {{ leading?: boolean }} [options]
 * @returns {{ value: Readable<T>, cancel: () => void }}
 */
/** @param {any[]} args @returns {any} */
export function $debounced(...args) {
  const R = rooted(args);
  const [source, wait, options = {}] = args;
  const leading = options.leading === true;
  const t = timer(R);
  /** @type {any} */
  let latest;
  /** The time of the last change, from `Date.now()`. */
  let changed = 0;
  /** Whether a change waits to show at the period's end. */
  let held = false;
  const settle = () => {
    // A clock set back reads as a fresh change: never wait past one period.
    const now = Date.now();
    if (now < changed) changed = now;
    const rest = wait - (now - changed);
    if (rest > 0) return t.set(settle, rest);
    if (!held) return;
    held = false;
    $write(value, latest);
  };
  const value = $signal(R, follow(R, source, next => {
    latest = next;
    changed = Date.now();
    if (t.pending()) {
      held = true;
      return;
    }
    // A quiet period starts: show it now with `leading`, else hold it.
    held = !leading;
    if (leading) $write(value, next);
    t.set(settle, wait);
  }));
  const cancel = () => {
    t.clear();
    held = false;
  };
  return { value, cancel };
}

/**
 * `value` follows `source` at most once per `wait` ms: the first change
 * after a quiet time shows at once and opens a period; changes within it
 * are held, and its end shows the latest of them, which opens the next
 * period. A period that ends with nothing held closes, so the next change
 * shows at once again.
 *
 * A period starts with a write and lasts exactly `wait` ms, so its one
 * timer is armed at that write and needs no timestamps.
 * @template T
 * @overload
 * @param {Root} root @param {Source<T>} source @param {number} wait
 * @returns {{ value: Readable<T> }}
 */
/**
 * @template T
 * @overload
 * @param {Source<T>} source @param {number} wait
 * @returns {{ value: Readable<T> }}
 */
/** @param {any[]} args @returns {any} */
export function $throttled(...args) {
  const R = rooted(args);
  const [source, wait] = args;
  const t = timer(R);
  /** @type {any} */
  let latest;
  let held = false;
  /** @param {any} next */
  const show = next => {
    $write(value, next);
    t.set(end, wait);
  };
  const end = () => {
    if (!held) return;
    held = false;
    show(latest);
  };
  const value = $signal(R, follow(R, source, next => {
    if (t.pending()) {
      latest = next;
      held = true;
    } else show(next);
  }));
  return { value };
}
