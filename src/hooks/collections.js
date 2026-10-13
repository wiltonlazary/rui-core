// Collection hooks: a list with array verbs ($list), a value with bounded
// undo and redo ($history), and a queue shown up to a limit ($queue). An
// array is never changed in place: a command that changes the collection
// writes a new one, and a command that changes nothing writes nothing, so
// no reader reruns. An index may count from the end (-1 is the last item).

import { $signal, $memo, $read, $write, $untrack, read } from 'ren-core';
import { rooted, clamp } from './shared.js';

/** @typedef {import('ren-core').Graph} Root */
/**
 * @template T
 * @typedef {import('ren-core').Readable<T>} Readable
 */

/**
 * An index into `length` items: truncated, a negative one counted from the
 * end; -1 when it falls outside.
 * @param {number} index @param {number} length
 */
function slot(index, length) {
  let i = Math.trunc(index);
  if (i < 0) i += length;
  return i >= 0 && i < length ? i : -1;
}

/**
 * A place between items, 0…length: truncated, a negative one counted from
 * the end, then clamped (NaN is 0).
 * @param {number} index @param {number} length
 */
function place(index, length) {
  let i = Math.trunc(index);
  if (i < 0) i += length;
  return i > 0 ? Math.min(i, length) : 0;
}

// ---------------------------------------------------------------------------
// $list

/**
 * @template T
 * @typedef {object} ListHandle
 *
 * A change is seen by identity: a verb (or `set`, `map`, `mapWhere`) that
 * hands back new items or a new array changes the list; an item mutated in
 * place is not seen, and a verb that changes nothing writes nothing. `set`
 * given the very array it holds (a list changed in place by `set(list =>
 * { list.push(x); return list; })`) always writes, so that change is seen.
 * @property {Readable<T[]>} value the items; a new array after each change
 * @property {(next: T[] | ((current: T[]) => T[])) => void} set replaces the list with a copy (no write when a different array holds the same items; the list's own array always writes)
 * @property {(...items: T[]) => void} push adds at the end
 * @property {(...items: T[]) => void} unshift adds at the start
 * @property {(index: number, ...items: T[]) => void} insert adds before `index` (clamped; past the end appends)
 * @property {() => void} pop drops the last item
 * @property {() => void} shift drops the first item
 * @property {(...indices: number[]) => void} removeAt drops the items at those indices
 * @property {(from: number, to: number) => void} move takes the item at `from` out so it ends at `to` (clamped)
 * @property {(a: number, b: number) => void} swap exchanges two items
 * @property {(index: number, item: T) => void} replace puts `item` at `index`
 * @property {<K extends keyof T>(index: number, key: K, value: T[K]) => void} setField sets one field of an item, on a shallow copy
 * @property {(keep: (item: T, index: number) => unknown) => void} filter keeps the items passing `keep`
 * @property {(fn: (item: T, index: number) => T) => void} map replaces every item by `fn`'s result (no write when none changed)
 * @property {(test: (item: T, index: number) => unknown, fn: (item: T, index: number) => T) => void} mapWhere replaces the items passing `test`
 */

/**
 * A list with the array's verbs. `initial` is an array (copied) or a
 * function giving one, called once; `[]` by default.
 * @template T
 * @overload
 * @param {Root} root @param {T[] | (() => T[])} [initial]
 * @returns {ListHandle<T>}
 */
/**
 * @template T
 * @overload
 * @param {T[] | (() => T[])} [initial]
 * @returns {ListHandle<T>}
 */
/** @param {any[]} args @returns {any} */
export function $list(...args) {
  const R = rooted(args);
  const given = args[0] ?? [];
  const value = $signal(R, Array.from(typeof given === 'function' ? given() : given));
  const items = () => /** @type {any[]} */ ($untrack(R, () => $read(value)));
  /** Writes `next` unless it is null (nothing changed). @param {any[] | null} next */
  const commit = next => {
    if (next !== null) $write(value, next);
  };

  /** The list, or null when it holds the same items in the same order as now (nothing to write). @param {any[]} next */
  const changed = next => {
    const list = items();
    return next.length === list.length && next.every((item, i) => Object.is(item, list[i])) ? null : next;
  };

  /** @param {number} index @param {any[]} added */
  const insert = (index, added) => {
    if (added.length === 0) return;
    const list = items();
    const at = place(index, list.length);
    const next = new Array(list.length + added.length);
    let n = 0;
    for (let i = 0; i < at; i++) next[n++] = list[i];
    for (let i = 0; i < added.length; i++) next[n++] = added[i];
    for (let i = at; i < list.length; i++) next[n++] = list[i];
    $write(value, next);
  };

  /** A copy of the list without the item at `at`. @param {number} at */
  const without = at => {
    const list = items();
    if (at < 0) return null;
    const next = new Array(list.length - 1);
    for (let i = 0, n = 0; i < list.length; i++) if (i !== at) next[n++] = list[i];
    return next;
  };

  /** A copy of the list with `item` at `at`. @param {number} at @param {any} item */
  const withItem = (at, item) => {
    const next = items().slice();
    next[at] = item;
    return next;
  };

  return {
    value,
    set: (/** @type {any} */ next) => {
      const given = typeof next === 'function' ? next(items()) : next;
      // The list's own array handed back was changed in place: write it as a copy.
      if (given === items()) return void $write(value, Array.from(given));
      commit(changed(Array.from(given)));
    },
    push: (/** @type {any[]} */ ...added) => insert(items().length, added),
    unshift: (/** @type {any[]} */ ...added) => insert(0, added),
    insert: (/** @type {number} */ index, /** @type {any[]} */ ...added) => insert(index, added),
    pop: () => commit(without(items().length - 1)),
    shift: () => commit(without(items().length > 0 ? 0 : -1)),
    removeAt: (/** @type {number[]} */ ...indices) => {
      const list = items();
      /** @type {Set<number>} */
      const drop = new Set();
      for (const index of indices) {
        const at = slot(index, list.length);
        if (at >= 0) drop.add(at);
      }
      if (drop.size === 0) return;
      const next = new Array(list.length - drop.size);
      for (let i = 0, n = 0; i < list.length; i++) if (!drop.has(i)) next[n++] = list[i];
      $write(value, next);
    },
    move: (/** @type {number} */ from, /** @type {number} */ to) => {
      const list = items();
      const f = slot(from, list.length);
      if (f < 0) return;
      const t = Math.min(place(to, list.length), list.length - 1);
      if (t === f) return;
      const next = new Array(list.length);
      const moved = list[f];
      // Walk the result: `t` takes the moved item, the others keep their order.
      for (let i = 0, src = 0; i < list.length; i++) {
        if (i === t) {
          next[i] = moved;
          continue;
        }
        if (src === f) src++;
        next[i] = list[src++];
      }
      // Moved among the same item (one item listed twice), the list is as it was.
      commit(changed(next));
    },
    swap: (/** @type {number} */ a, /** @type {number} */ b) => {
      const list = items();
      const i = slot(a, list.length);
      const j = slot(b, list.length);
      if (i < 0 || j < 0 || i === j) return;
      const next = list.slice();
      next[i] = list[j];
      next[j] = list[i];
      commit(changed(next));
    },
    replace: (/** @type {number} */ index, /** @type {any} */ item) => {
      const list = items();
      const at = slot(index, list.length);
      if (at < 0 || Object.is(list[at], item)) return;
      $write(value, withItem(at, item));
    },
    setField: (/** @type {number} */ index, /** @type {any} */ key, /** @type {any} */ field) => {
      const list = items();
      const at = slot(index, list.length);
      if (at < 0 || (list[at] != null && Object.hasOwn(list[at], key) && Object.is(list[at][key], field))) return;
      $write(value, withItem(at, { ...list[at], [key]: field }));
    },
    filter: (/** @type {(item: any, index: number) => unknown} */ keep) => {
      const list = items();
      const next = [];
      for (let i = 0; i < list.length; i++) if (keep(list[i], i)) next.push(list[i]);
      if (next.length !== list.length) $write(value, next);
    },
    map: (/** @type {(item: any, index: number) => any} */ fn) => {
      const list = items();
      const next = new Array(list.length);
      for (let i = 0; i < list.length; i++) next[i] = fn(list[i], i);
      commit(changed(next));
    },
    mapWhere: (/** @type {(item: any, index: number) => unknown} */ test, /** @type {(item: any, index: number) => any} */ fn) => {
      const list = items();
      /** @type {any[] | null} */
      let next = null;
      for (let i = 0; i < list.length; i++) {
        if (!test(list[i], i)) continue;
        next ??= list.slice();
        next[i] = fn(list[i], i);
      }
      // Its function handing back the same items changes nothing: nothing written.
      commit(next === null ? null : changed(next));
    },
  };
}

// ---------------------------------------------------------------------------
// $history

/**
 * @template T
 * @typedef {object} HistoryHandle
 * @property {Readable<T>} value the current entry
 * @property {Readable<T[]>} entries every entry kept, oldest first
 * @property {Readable<number>} index where `value` is in `entries`
 * @property {(value: T) => void} set drops the entries ahead, adds `value` and makes it current; the current value adds nothing
 * @property {(steps?: number) => void} back moves back `steps` (1), clamped
 * @property {(steps?: number) => void} forward moves forward `steps` (1), clamped
 * @property {() => void} reset back to the first value alone
 */

/**
 * A value with undo and redo, keeping at most `limit` entries (100;
 * `Infinity` keeps all): past it the oldest drop.
 * @template T
 * @overload
 * @param {Root} root @param {T} initial @param {{ limit?: number }} [options]
 * @returns {HistoryHandle<T>}
 */
/**
 * @template T
 * @overload
 * @param {T} initial @param {{ limit?: number }} [options]
 * @returns {HistoryHandle<T>}
 */
/** @param {any[]} args @returns {any} */
export function $history(...args) {
  const R = rooted(args);
  const [initial, options] = args;
  const asked = options?.limit ?? 100;
  const cap = asked >= 1 ? Math.trunc(asked) : 1;
  // A ring of up to `cap` slots, grown while under it: the entries are the
  // `count` slots from `start` on; `at` is the current one among them.
  /** @type {any[]} */
  let slots = [initial];
  let start = 0;
  let count = 1;
  let at = 0;
  const version = $signal(R, 0);
  const index = $signal(R, 0);
  /** The entry `i` places from the oldest. @param {number} i */
  const entry = i => slots[(start + i) % slots.length];
  const touched = () => $write(version, $untrack(R, () => $read(version)) + 1);

  const entries = $memo(R, () => {
    $read(version);
    const out = new Array(count);
    for (let i = 0; i < count; i++) out[i] = entry(i);
    return out;
  });
  const value = $memo(R, () => {
    $read(version);
    return entry($read(index));
  });

  /** Moves the current entry to `to`, clamped; writes only a move. @param {number} to */
  const go = to => {
    const next = clamp(to, 0, count - 1);
    if (next === at) return;
    at = next;
    $write(index, at);
  };
  /** A step count: truncated, 0 unless above 0. @param {unknown} s */
  const steps = s => {
    const n = Math.trunc(Number(s));
    return n > 0 ? n : 0;
  };

  return {
    value,
    entries,
    index,
    set: (/** @type {any} */ next) => {
      if (Object.is(entry(at), next)) return;
      // Drop the entries ahead of the current one, freeing their slots.
      for (let i = at + 1; i < count; i++) slots[(start + i) % slots.length] = undefined;
      count = at + 1;
      if (count < cap) {
        const pos = start + count;
        if (start === 0 && pos === slots.length) slots.push(next);
        else slots[pos % slots.length] = next;
        count++;
      } else {
        // Full: the new entry takes the oldest one's slot.
        slots[start] = next;
        start = (start + 1) % slots.length;
      }
      at = count - 1;
      touched();
      $write(index, at);
    },
    back: (s = 1) => {
      const n = steps(s);
      if (n > 0) go(at - n);
    },
    forward: (s = 1) => {
      const n = steps(s);
      if (n > 0) go(at + n);
    },
    reset: () => {
      if (count === 1 && Object.is(entry(0), initial)) return go(0);
      slots = [initial];
      start = 0;
      count = 1;
      at = 0;
      touched();
      $write(index, 0);
    },
  };
}

// ---------------------------------------------------------------------------
// $queue

/**
 * @template T
 * @typedef {object} QueueHandle
 * @property {Readable<T[]>} shown the first `limit` items
 * @property {Readable<T[]>} waiting the rest, in order
 * @property {(...items: T[]) => void} push adds at the end
 * @property {(fn: (all: T[]) => T[]) => void} update `fn` gets a copy of every item (shown, then waiting) and gives the new queue
 * @property {() => void} clearWaiting drops the waiting items
 */
/**
 * @template T
 * @typedef {object} QueueOptions
 * @property {T[]=} initial the first items
 * @property {number | (() => number) | Readable<number>} limit how many are shown (a value, accessor or node; truncated, at least 0)
 */

/**
 * Items shown up to `limit`, the rest waiting in order; a change of the
 * limit moves items between the two.
 * @template T
 * @overload
 * @param {Root} root @param {QueueOptions<T>} options
 * @returns {QueueHandle<T>}
 */
/**
 * @template T
 * @overload
 * @param {QueueOptions<T>} options
 * @returns {QueueHandle<T>}
 */
/** @param {any[]} args @returns {any} */
export function $queue(...args) {
  const R = rooted(args);
  const { initial = [], limit } = /** @type {QueueOptions<any>} */ (args[0] ?? {});
  if (limit === undefined) throw new Error('RUI: $queue needs a limit');
  const all = $signal(R, Array.from(initial));
  const cap = $memo(R, () => {
    const n = Math.trunc(Number(read(limit)));
    return n > 0 ? n : 0;
  });
  // One walk splits the queue; a part whose items did not change keeps its
  // array, so its readers do not rerun.
  /** @type {any[]} */
  let lastShown = [];
  /** @type {any[]} */
  let lastWaiting = [];
  /** `part` again when it holds `items[from…to)` already. @param {any[]} part @param {any[]} items @param {number} from @param {number} to */
  const same = (part, items, from, to) => {
    if (part.length !== to - from) return false;
    for (let i = from; i < to; i++) if (!Object.is(part[i - from], items[i])) return false;
    return true;
  };
  const split = $memo(R, () => {
    const items = $read(all);
    const cut = Math.min($read(cap), items.length);
    if (!same(lastShown, items, 0, cut)) {
      lastShown = new Array(cut);
      for (let i = 0; i < cut; i++) lastShown[i] = items[i];
    }
    if (!same(lastWaiting, items, cut, items.length)) {
      lastWaiting = new Array(items.length - cut);
      for (let i = cut; i < items.length; i++) lastWaiting[i - cut] = items[i];
    }
    return { shown: lastShown, waiting: lastWaiting };
  });
  const items = () => /** @type {any[]} */ ($untrack(R, () => $read(all)));
  return {
    shown: $memo(R, () => $read(split).shown),
    waiting: $memo(R, () => $read(split).waiting),
    push: (/** @type {any[]} */ ...added) => {
      if (added.length > 0) $write(all, [...items(), ...added]);
    },
    update: (/** @type {(all: any[]) => any[]} */ fn) => void $write(all, Array.from(fn(items().slice()))),
    clearWaiting: () => {
      const list = items();
      const n = $untrack(R, () => $read(cap));
      if (list.length > n) $write(all, list.slice(0, n));
    },
  };
}
