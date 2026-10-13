// What every hook shares: the two spellings (root first, or the running
// root), the owner whose end cleans a hook up, timers that end with it, and
// the value an input's change carries.

import { Graph, $active, $owner, $cleanup, $batch, $closed } from 'ren-core';

/** @typedef {import('ren-core').Graph} Root */
/** @typedef {import('rrx-core/core').Owner} Owner */

/**
 * The root a hook runs on: its first argument when that is a root (which it
 * takes off `args`), else the root of the view being built.
 * @param {any[]} args
 * @returns {Root}
 */
export function rooted(args) {
  return args[0] instanceof Graph ? args.shift() : $active();
}

/** The owner a hook made now belongs to: the running scope, or the root itself. @param {Root} R @returns {Owner} */
export const ownerOf = R => $owner(R) ?? /** @type {Owner} */ (R.home);

/** Runs `callback` when the calling owner ends. @param {Root} R @param {() => void} callback */
export function ending(R, callback) {
  $cleanup(ownerOf(R), callback);
}

/**
 * Runs `callback` from outside the view (a timer, a platform event, a
 * promise) as one batch of the root, so what it writes shows at once; a
 * disposed root is left alone.
 * @param {Root} R @param {() => void} callback
 */
export function later(R, callback) {
  if (!$closed(R)) $batch(R, callback);
}

/**
 * One timer at a time, cleared when the owner ends: `set(fn, ms)` replaces
 * the pending one, `clear()` drops it. Reads the global `setTimeout` at each
 * call, so node:test's mock timers drive it.
 * @param {Root} R
 */
export function timer(R) {
  /** @type {any} */
  let id = null;
  const clear = () => {
    if (id !== null) clearTimeout(id);
    id = null;
  };
  ending(R, clear);
  return {
    /** @param {() => void} fn @param {number} ms */
    set(fn, ms) {
      clear();
      // timer: feature, the delay of a debounce, throttle, timeout or idle hook.
      id = setTimeout(() => {
        id = null;
        later(R, fn);
      }, ms);
    },
    clear,
    pending: () => id !== null,
  };
}

/** The keys an event object made of plain data carries (ren-core's DOM change is `{ value, event }`). */
const EVENT_KEYS = new Set(['value', 'checked', 'event', 'target', 'currentTarget', 'type']);

/** A plain object that is an event: only event keys, and at least one. @param {any} value */
const plainEvent = value => {
  let n = 0;
  for (const key in value) {
    if (!EVENT_KEYS.has(key)) return false;
    n++;
  }
  return n > 0;
};

/**
 * The value a change carries: ren-core's `onChange` event (`{ value }`, with
 * `event` on the DOM), a renderer's event object, a DOM event (its target's
 * value), or the plain value itself. `checkbox` reads `checked` instead. A
 * plain object with keys other than an event's (`value`, `checked`,
 * `event`, `target`, `currentTarget`, `type`) is a value, not an event.
 * @param {any} input @param {boolean} [checkbox]
 * @returns {any}
 */
export function eventValue(input, checkbox = false) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return input;
  const proto = Object.getPrototypeOf(input);
  if ((proto === Object.prototype || proto === null) && !plainEvent(input)) return input;
  if (checkbox) {
    if (typeof input.checked === 'boolean') return input.checked;
    const t = input.currentTarget ?? input.target ?? input.event?.target;
    if (t != null && typeof t.checked === 'boolean') return t.checked;
    if ('value' in input) return Boolean(input.value);
    return input;
  }
  if ('value' in input) return input.value;
  const t = input.currentTarget ?? input.target;
  if (t != null && 'value' in t) return t.value;
  return input;
}

/** Clamps `value` into `[min, max]` (either bound may be absent). @param {number} value @param {number | undefined} min @param {number | undefined} max */
export const clamp = (value, min, max) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));
