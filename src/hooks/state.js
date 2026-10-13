// State hooks as rrx-core nodes. Each returns one handle: its state as
// nodes named by nouns (`value` first), which JSX binds as they are and code
// reads with `$read(menu.value)`, and its commands as verbs
// (`menu.toggle()`). Each has the two spellings: `$open(root, …)`, or
// `$open(…)` inside a component. Commands write plainly: an event
// handler's batch flushes them; code outside one flushes itself.

import { $signal, $memo, $read, $write, $untrack, $effect, read } from 'ren-core';
import { rooted, eventValue, clamp } from './shared.js';

/** @typedef {import('ren-core').Graph} Root */
/**
 * @template T
 * @typedef {import('ren-core').Readable<T>} Readable
 */

// ---------------------------------------------------------------------------
// $open

/**
 * @typedef {object} OpenHandle
 * @property {Readable<boolean>} value whether it is open
 * @property {() => void} open
 * @property {() => void} close
 * @property {() => void} toggle
 */
/** @typedef {{ onChange?: (open: boolean) => void }} OpenOptions */

/**
 * Whether something is open, with open, close and toggle; `onChange(open)`
 * runs only when the state changes.
 * @overload
 * @param {Root} root @param {boolean} [initial] @param {OpenOptions} [options]
 * @returns {OpenHandle}
 */
/**
 * @overload
 * @param {boolean} [initial] @param {OpenOptions} [options]
 * @returns {OpenHandle}
 */
/** @param {any[]} args @returns {any} */
export function $open(...args) {
  const R = rooted(args);
  const [initial = false, options = {}] = args;
  const value = $signal(R, initial === true);
  /** @param {boolean} next */
  const set = next => {
    if ($untrack(R, () => $read(value)) === next) return;
    $write(value, next);
    options.onChange?.(next);
  };
  return { value, open: () => set(true), close: () => set(false), toggle: () => set(!$untrack(R, () => $read(value))) };
}

// ---------------------------------------------------------------------------
// $toggle

/**
 * @template T
 * @typedef {object} ToggleHandle
 * @property {Readable<T>} value
 * @property {() => void} next moves to the next option, after the last back to the first
 * @property {(value: T) => void} set
 */

/**
 * Cycles through `options` (`[false, true]` by default).
 * @template [T=boolean]
 * @overload
 * @param {Root} root @param {readonly T[]} [options]
 * @returns {ToggleHandle<T>}
 */
/**
 * @template [T=boolean]
 * @overload
 * @param {readonly T[]} [options]
 * @returns {ToggleHandle<T>}
 */
/** @param {any[]} args @returns {any} */
export function $toggle(...args) {
  const R = rooted(args);
  const options = /** @type {any[]} */ (args[0] ?? [false, true]);
  const value = $signal(R, options[0]);
  const next = () => {
    const at = options.indexOf($untrack(R, () => $read(value)));
    $write(value, options[(at + 1) % options.length]);
  };
  return { value, next, set: (/** @type {any} */ v) => void $write(value, v) };
}

// ---------------------------------------------------------------------------
// $counter

/**
 * @typedef {object} CounterHandle
 * @property {Readable<number>} value
 * @property {(n?: number) => void} add adds `n` (1), or takes away with a negative one
 * @property {(n: number) => void} set
 * @property {() => void} reset back to the first value
 */

/**
 * A number kept within `min` and `max`.
 * @overload
 * @param {Root} root @param {number} [initial] @param {{ min?: number, max?: number }} [options]
 * @returns {CounterHandle}
 */
/**
 * @overload
 * @param {number} [initial] @param {{ min?: number, max?: number }} [options]
 * @returns {CounterHandle}
 */
/** @param {any[]} args @returns {any} */
export function $counter(...args) {
  const R = rooted(args);
  const [initial = 0, options = {}] = args;
  const { min, max } = options;
  const start = clamp(initial, min, max);
  const value = $signal(R, start);
  const now = () => $untrack(R, () => $read(value));
  return {
    value,
    add: (n = 1) => void $write(value, clamp(now() + n, min, max)),
    set: (/** @type {number} */ n) => void $write(value, clamp(n, min, max)),
    reset: () => void $write(value, start),
  };
}

// ---------------------------------------------------------------------------
// $bound

/**
 * @template T
 * @typedef {object} BoundHandle
 * @property {Readable<T>} value
 * @property {(change: any) => void} set takes ren-core's `{ value }`, a DOM event or a plain value: an input's `onChange`
 */

/**
 * A value and the change handler an input takes (`onChange={name.set}`).
 * @template T
 * @overload
 * @param {Root} root @param {T} initial
 * @returns {BoundHandle<T>}
 */
/**
 * @template T
 * @overload
 * @param {T} initial
 * @returns {BoundHandle<T>}
 */
/** @param {any[]} args @returns {any} */
export function $bound(...args) {
  const R = rooted(args);
  const value = $signal(R, args[0]);
  return { value, set: (/** @type {any} */ change) => void $write(value, eventValue(change)) };
}

// ---------------------------------------------------------------------------
// $previous

/**
 * The value `source` held before its current one, undefined at first. Kept
 * eagerly: every change of `source` moves it.
 * @template T
 * @overload
 * @param {Root} root @param {Readable<T> | (() => T)} source
 * @returns {{ value: Readable<T | undefined> }}
 */
/**
 * @template T
 * @overload
 * @param {Readable<T> | (() => T)} source
 * @returns {{ value: Readable<T | undefined> }}
 */
/** @param {any[]} args @returns {any} */
export function $previous(...args) {
  const R = rooted(args);
  const source = args[0];
  let current = $untrack(R, () => read(source));
  /** @type {any} */
  let previous = undefined;
  const value = $memo(R, () => {
    const next = read(source);
    if (!Object.is(next, current)) {
      previous = current;
      current = next;
    }
    return previous;
  });
  // Eager: an effect reads it, so no change of the source is skipped.
  $effect(R, () => void $read(value));
  return { value };
}

// ---------------------------------------------------------------------------
// $map and $set

/**
 * A Map whose reads track one version node and whose writes move it, so a
 * view reading it follows it.
 * @template K, V
 * @extends {Map<K, V>}
 */
class Tracked extends Map {
  /** @param {Root} R @param {Iterable<readonly [K, V]> | undefined} entries */
  constructor(R, entries) {
    super();
    /** @type {import('ren-core').Writable<number> | null} */
    this.v = null;
    this.R = R;
    if (entries != null) for (const [k, v] of entries) super.set(k, v);
    this.v = $signal(R, 0);
  }
  touch() {
    const v = this.v;
    if (v !== null) $write(v, $untrack(this.R, () => $read(v)) + 1);
  }
  track() {
    if (this.v !== null) $read(this.v);
  }
  /** @param {K} key */
  get(key) {
    this.track();
    return super.get(key);
  }
  /** @param {K} key */
  has(key) {
    this.track();
    return super.has(key);
  }
  get size() {
    this.track();
    return super.size;
  }
  /** @param {K} key @param {V} value */
  set(key, value) {
    super.set(key, value);
    this.touch();
    return this;
  }
  /** @param {K} key */
  delete(key) {
    const had = super.delete(key);
    if (had) this.touch();
    return had;
  }
  clear() {
    const had = super.size > 0;
    super.clear();
    if (had) this.touch();
  }
  keys() {
    this.track();
    return super.keys();
  }
  values() {
    this.track();
    return super.values();
  }
  entries() {
    this.track();
    return super.entries();
  }
  /** @param {(value: V, key: K, map: Map<K, V>) => void} fn @param {any} [self] */
  forEach(fn, self) {
    this.track();
    super.forEach(fn, self);
  }
  [Symbol.iterator]() {
    return this.entries();
  }
}

/**
 * A Set whose reads track and whose writes notify.
 * @template T
 * @extends {Set<T>}
 */
class TrackedSet extends Set {
  /** @param {Root} R @param {Iterable<T> | undefined} values */
  constructor(R, values) {
    super();
    /** @type {import('ren-core').Writable<number> | null} */
    this.v = null;
    this.R = R;
    if (values != null) for (const v of values) super.add(v);
    this.v = $signal(R, 0);
  }
  touch() {
    const v = this.v;
    if (v !== null) $write(v, $untrack(this.R, () => $read(v)) + 1);
  }
  track() {
    if (this.v !== null) $read(this.v);
  }
  /** @param {T} value */
  has(value) {
    this.track();
    return super.has(value);
  }
  get size() {
    this.track();
    return super.size;
  }
  /** @param {T} value */
  add(value) {
    if (super.has(value)) return this;
    super.add(value);
    this.touch();
    return this;
  }
  /** @param {T} value */
  delete(value) {
    const had = super.delete(value);
    if (had) this.touch();
    return had;
  }
  clear() {
    const had = super.size > 0;
    super.clear();
    if (had) this.touch();
  }
  keys() {
    this.track();
    return super.keys();
  }
  values() {
    this.track();
    return super.values();
  }
  entries() {
    this.track();
    return super.entries();
  }
  /** @param {(value: T, key: T, set: Set<T>) => void} fn @param {any} [self] */
  forEach(fn, self) {
    this.track();
    super.forEach(fn, self);
  }
  [Symbol.iterator]() {
    return this.values();
  }
}

/**
 * A reactive Map.
 * @template K, V
 * @overload
 * @param {Root} root @param {Iterable<readonly [K, V]>} [entries]
 * @returns {Map<K, V>}
 */
/**
 * @template K, V
 * @overload
 * @param {Iterable<readonly [K, V]>} [entries]
 * @returns {Map<K, V>}
 */
/** @param {any[]} args @returns {any} */
export function $map(...args) {
  const R = rooted(args);
  return new Tracked(R, args[0]);
}

/**
 * A reactive Set.
 * @template T
 * @overload
 * @param {Root} root @param {Iterable<T>} [values]
 * @returns {Set<T>}
 */
/**
 * @template T
 * @overload
 * @param {Iterable<T>} [values]
 * @returns {Set<T>}
 */
/** @param {any[]} args @returns {any} */
export function $set(...args) {
  const R = rooted(args);
  return new TrackedSet(R, args[0]);
}

// ---------------------------------------------------------------------------
// $pages

/** @typedef {number | 'gap'} PageItem a page, or `'gap'` for the pages left out */
/**
 * @typedef {object} PagesOptions
 * @property {number | (() => number) | Readable<number>} total the page count (a value, accessor or node)
 * @property {number=} defaultPage 1 by default
 * @property {(number | (() => number) | Readable<number>)=} page a controlled page
 * @property {((page: number) => void)=} onChange each new page (none for the page shown, or a step past an end)
 * @property {number=} around pages shown on each side of the current one (1)
 * @property {number=} ends pages shown at each end (1)
 */
/**
 * @typedef {object} Pages
 * @property {Readable<PageItem[]>} items the items to show, with `'gap'` where pages are left out
 * @property {Readable<number>} page the current page
 * @property {(page: number) => void} go to a page (clamped to 1…total)
 * @property {(by: number) => void} step by pages from the current one: `step(1)` is the next, `step(-1)` the previous
 */

/**
 * The items to show, in a fixed row of slots so the row keeps its length while the page moves:
 * `ends` pages at each end, one slot after the start ones and one before the end ones, and a window
 * of `around * 2 + 1` pages around the current one, slid inward to sit between the two slots. A slot
 * shows its page when that page is the only one hidden there, and `'gap'` otherwise. When the pages
 * fit the row, all of them show.
 * @param {number} total @param {number} page @param {number} around @param {number} ends
 * @returns {PageItem[]}
 */
export function pageItems(total, page, around, ends) {
  /** @type {PageItem[]} */
  const items = [];
  /** @param {number} from @param {number} to */
  const run = (from, to) => { for (let p = from; p <= to; p++) items.push(p); };
  const size = around * 2 + 1;
  if (total <= ends * 2 + size + 2) {
    run(1, total);
    return items;
  }
  const first = ends + 2;
  const last = total - ends - 1;
  const start = Math.min(Math.max(page - around, first), last - size + 1);
  const end = start + size - 1;
  run(1, ends);
  items.push(start === first ? ends + 1 : 'gap');
  run(start, end);
  items.push(end === last ? total - ends : 'gap');
  run(total - ends + 1, total);
  return items;
}

/**
 * Pages: the current one, clamped to `total`, and the items to show.
 * @overload
 * @param {Root} root @param {PagesOptions} options
 * @returns {Pages}
 */
/**
 * @overload
 * @param {PagesOptions} options
 * @returns {Pages}
 */
/** @param {any[]} args @returns {any} */
export function $pages(...args) {
  const R = rooted(args);
  const { total, defaultPage = 1, page, onChange, around = 1, ends = 1 } = /** @type {PagesOptions} */ (args[0]);
  const count = $memo(R, () => Math.max(Math.trunc(read(total)), 0));
  const own = $signal(R, defaultPage);
  const current = $memo(R, () => {
    const n = $read(count);
    const p = page !== undefined ? read(page) : $read(own);
    return clamp(p, 1, Math.max(n, 1));
  });
  const items = $memo(R, () => pageItems($read(count), $read(current), around, ends));
  /** @param {number} next */
  const go = next => {
    const n = $untrack(R, () => $read(count));
    const p = clamp(next, 1, Math.max(n, 1));
    const was = $untrack(R, () => $read(current));
    if (page === undefined) $write(own, p);
    // Only a new page is told: a step past the ends, or the page shown again, is none.
    if (p !== was) onChange?.(p);
  };
  return {
    items,
    page: current,
    go,
    step: (/** @type {number} */ by) => go($untrack(R, () => $read(current)) + by),
  };
}

// ---------------------------------------------------------------------------
// $selection

/**
 * @template T
 * @typedef {object} SelectionHandle
 * @property {Readable<T[]>} value the selected items, in the order picked
 * @property {(item: T) => boolean} has tracked
 * @property {(item: T) => void} add
 * @property {(item: T) => void} delete
 * @property {(item: T) => void} toggle
 * @property {Readable<boolean>} all whether every item is selected
 * @property {Readable<boolean>} some whether some but not every item is selected
 * @property {(items: T[]) => void} set
 * @property {() => void} clear
 */
/**
 * @template T
 * @typedef {object} SelectionOptions
 * @property {T[] | (() => T[]) | Readable<T[]>} items what can be selected
 * @property {T[]=} initial the first selection
 * @property {boolean=} resetOnItems a change of `items` empties the selection
 */

/**
 * A selection among `items`, with a Set's verbs. Items outside `items` are
 * never selected.
 * @template T
 * @overload
 * @param {Root} root @param {SelectionOptions<T>} options
 * @returns {SelectionHandle<T>}
 */
/**
 * @template T
 * @overload
 * @param {SelectionOptions<T>} options
 * @returns {SelectionHandle<T>}
 */
/** @param {any[]} args @returns {any} */
export function $selection(...args) {
  const R = rooted(args);
  const { items: source, initial = [], resetOnItems = false } = args[0];
  const items = $memo(R, () => /** @type {any[]} */ (read(source)));
  // The picks remember the items they were made on: a change of items
  // empties them when asked, and items outside the list are never selected.
  const chosen = $signal(R, { items: $untrack(R, () => $read(items)), picked: /** @type {any[]} */ ([...new Set(initial)]) });
  const value = $memo(R, () => {
    const list = $read(items);
    const c = $read(chosen);
    if (resetOnItems && c.items !== list) return [];
    return c.picked.filter(item => list.includes(item));
  });
  /** @param {any[]} picked */
  const pick = picked => void $write(chosen, { items: $untrack(R, () => $read(items)), picked });
  const now = () => $untrack(R, () => $read(value));
  return {
    value,
    has: (/** @type {any} */ item) => $read(value).includes(item),
    add: (/** @type {any} */ item) => {
      const current = now();
      if (!current.includes(item)) pick([...current, item]);
    },
    delete: (/** @type {any} */ item) => pick(now().filter(x => x !== item)),
    toggle: (/** @type {any} */ item) => {
      const current = now();
      pick(current.includes(item) ? current.filter(x => x !== item) : [...current, item]);
    },
    all: $memo(R, () => {
      const list = $read(items);
      return list.length > 0 && $read(value).length === list.length;
    }),
    some: $memo(R, () => {
      const n = $read(value).length;
      return n > 0 && n < $read(items).length;
    }),
    // Picks enter once each: a doubled one would count toward `all`.
    set: (/** @type {any[]} */ next) => pick([...new Set(next)]),
    clear: () => pick([]),
  };
}
