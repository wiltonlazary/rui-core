// Platform hooks: storage, the clipboard, media queries, the network, the
// document's title and fullscreen. Each checks for its platform object on
// `globalThis` and keeps an inert default where there is none (a worker,
// node), so the same component runs everywhere. A platform listener is
// removed when the calling owner ends. Media queries and the viewport's
// size, called in a component, read the application root's viewport
// (ren-core's `$media` and `$viewport`), so they hold on every renderer
// and in a worker.

import { $signal, $memo, $read, $write, $untrack, $lookup, $watch, $active, $media, $viewport, Storage, $unowned, read } from 'ren-core';
import { rooted, ending, later, timer } from './shared.js';
import { MOTION, durationOf } from '../theme/motion.js';

/** @typedef {import('ren-core').Graph} Root */
/**
 * @template T
 * @typedef {import('ren-core').Readable<T>} Readable
 */

// ---------------------------------------------------------------------------
// $localStorage and $sessionStorage

/**
 * @template T
 * @typedef {object} StorageOptions
 * @property {string} key
 * @property {T=} fallback the value while the key holds none (or one that does not parse)
 * @property {((value: T) => string)=} print the text kept for a value: JSON by default
 * @property {((text: string) => T)=} parse the value read from the text: JSON by default
 */

/**
 * @template T
 * @typedef {object} StorageHandle
 * @property {Readable<T>} value
 * @property {(value: T | ((current: T) => T)) => void} set a value, or a function of the current one
 * @property {() => void} remove clears the key (the value falls back)
 */

/**
 * The storage a key lives in: `get`, `set` and `remove` of text, reads
 * tracked where the backing tracks them.
 * @typedef {{ get: (key: string) => string | null, set: (key: string, value: string) => void, remove: (key: string) => void, tracked: boolean }} Place
 */

/** @param {'localStorage' | 'sessionStorage'} name */
function platform(name) {
  try {
    const s = /** @type {any} */ (globalThis)[name];
    return s != null && typeof s.getItem === 'function' ? /** @type {import('ren-core').Shelf['backing']} */ (s) : null;
  } catch {
    // Storage access can throw (an opaque origin, blocked cookies).
    return null;
  }
}

/** Per root, per storage, per key: the version node hooks on that key share. @type {WeakMap<Root, Map<string, import('ren-core').Writable<number>>>} */
const versions = new WeakMap();

/** @param {Root} R @param {string} key */
function versionOf(R, key) {
  let keys = versions.get(R);
  if (keys === undefined) versions.set(R, (keys = new Map()));
  let v = keys.get(key);
  // Outside the asking scope: the node outlives it, for every hook on the key.
  if (v === undefined) keys.set(key, (v = $unowned(R, () => $signal(R, 0))));
  return v;
}

/**
 * Where `kind` storage is for this root: the application root's Storage
 * (keys `ren:<id>:<key>`, followed across tabs and threads) for local
 * storage, the platform's otherwise (session storage under the same
 * prefix inside an application root), or memory where there is none.
 * @param {Root} R @param {'localStorage' | 'sessionStorage'} kind
 * @returns {Place}
 */
function placeOf(R, kind) {
  const shelf = /** @type {import('ren-core').Shelf | null} */ ($lookup(R, Storage));
  if (kind === 'localStorage' && shelf != null)
    return { get: key => shelf.get(key), set: (key, value) => shelf.set(key, value), remove: key => shelf.remove(key), tracked: true };
  const prefix = shelf != null ? `ren:${R.id}:` : '';
  const backing = platform(kind);
  if (backing === null) {
    // No platform storage: this root's memory, so the hooks on a key still agree.
    const memory = memories.get(R) ?? new Map();
    memories.set(R, memory);
    return { get: key => memory.get(`${kind}:${key}`) ?? null, set: (key, value) => void memory.set(`${kind}:${key}`, value), remove: key => void memory.delete(`${kind}:${key}`), tracked: false };
  }
  return {
    get: key => {
      try {
        return backing.getItem(prefix + key);
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        backing.setItem(prefix + key, value);
      } catch {
        // A full or blocked storage keeps the value in the node only.
      }
    },
    remove: key => {
      try {
        backing.removeItem(prefix + key);
      } catch {
        // As above.
      }
    },
    tracked: false,
  };
}

/** @type {WeakMap<Root, Map<string, string>>} */
const memories = new WeakMap();

/** @param {any[]} args @param {'localStorage' | 'sessionStorage'} kind @returns {any} */
function stored(args, kind) {
  const R = rooted(args);
  const { key, fallback, print = JSON.stringify, parse = JSON.parse } = /** @type {StorageOptions<any>} */ (args[0]);
  const place = placeOf(R, kind);
  const version = versionOf(R, `${kind}:${key}`);
  /** The text last parsed and its value, so an unchanged text keeps its value's identity. */
  let text = /** @type {string | null | undefined} */ (undefined);
  /** @type {any} */
  let parsed = fallback;
  const value = $memo(R, () => {
    $read(version);
    const now = place.get(key);
    if (now === text) return parsed;
    text = now;
    if (now === null) return (parsed = fallback);
    try {
      return (parsed = parse(now));
    } catch {
      return (parsed = fallback);
    }
  });
  const bump = () => $write(version, $untrack(R, () => $read(version)) + 1);
  /** @param {any} next */
  const set = next => {
    const v = typeof next === 'function' ? next($untrack(R, () => $read(value))) : next;
    place.set(key, print(v));
    bump();
  };
  const remove = () => {
    place.remove(key);
    bump();
  };
  return { value, set, remove };
}

/**
 * A value kept in local storage under `key`:
 * the value, its setter (a value or a function of the current one) and its
 * removal. Inside an application root it is the root's Storage (keys
 * `ren:<id>:<key>`, so roots never share them; views follow writes from other
 * tabs and the worker); otherwise the platform's `localStorage`, else
 * memory. Hooks on the same key in one root agree.
 * @template T
 * @overload
 * @param {Root} root @param {StorageOptions<T>} options
 * @returns {StorageHandle<T>}
 */
/**
 * @template T
 * @overload
 * @param {StorageOptions<T>} options
 * @returns {StorageHandle<T>}
 */
/** @param {any[]} args @returns {any} */
export function $localStorage(...args) {
  return stored(args, 'localStorage');
}

/**
 * As `$localStorage`, in the platform's `sessionStorage` (keys prefixed
 * `ren:<id>:` inside an application root), else memory.
 * @template T
 * @overload
 * @param {Root} root @param {StorageOptions<T>} options
 * @returns {StorageHandle<T>}
 */
/**
 * @template T
 * @overload
 * @param {StorageOptions<T>} options
 * @returns {StorageHandle<T>}
 */
/** @param {any[]} args @returns {any} */
export function $sessionStorage(...args) {
  return stored(args, 'sessionStorage');
}

// ---------------------------------------------------------------------------
// $clipboard

/**
 * @typedef {object} ClipboardHandle
 * @property {Readable<boolean>} value copied: true for `hold` after a copy
 * @property {(text: string) => Promise<boolean>} copy writes the text; resolves to whether it did
 * @property {Readable<Error | null>} error why the last copy failed
 * @property {() => void} reset
 */

/**
 * Copies text with the platform's clipboard (`navigator.clipboard`).
 * Where there is none (node, a worker without it), a copy fails into
 * `error`. `hold` is how long `value` stays true after a copy: a MOTION
 * name or ms, read at each copy (MOTION.hold by default).
 * @overload
 * @param {Root} root @param {{ hold?: number | string | (() => number | string) }} [options]
 * @returns {ClipboardHandle}
 */
/**
 * @overload
 * @param {{ hold?: number | string | (() => number | string) }} [options]
 * @returns {ClipboardHandle}
 */
/** @param {any[]} args @returns {any} */
export function $clipboard(...args) {
  const R = rooted(args);
  const options = args[0] ?? {};
  const copied = $signal(R, false);
  const error = $signal(R, /** @type {Error | null} */ (null));
  const t = timer(R);
  const reset = () => {
    t.clear();
    $write(copied, false);
    $write(error, null);
  };
  /** @param {string} text */
  const copy = async text => {
    const clipboard = /** @type {any} */ (globalThis).navigator?.clipboard;
    try {
      if (clipboard == null || typeof clipboard.writeText !== 'function') throw new Error('RUI: no clipboard on this platform');
      await clipboard.writeText(text);
    } catch (failure) {
      later(R, () => {
        $write(copied, false);
        $write(error, failure instanceof Error ? failure : new Error(String(failure)));
      });
      return false;
    }
    later(R, () => {
      $write(error, null);
      $write(copied, true);
    });
    t.set(() => void $write(copied, false), durationOf(read(options.hold), MOTION.hold));
    return true;
  };
  return { value: copied, error, copy, reset };
}

// ---------------------------------------------------------------------------
// Media queries

/** Whether a view of R is being built: its root's viewport is readable. @param {Root} R */
function viewing(R) {
  try {
    return $active() === R;
  } catch {
    return false;
  }
}

/**
 * Whether a media query matches, following its
 * changes. Called in a component, over the application root's viewport
 * (ren-core's `$media`: the window's on the DOM, the canvas's size on
 * Skia and three.js, the main thread's in a worker), `initial`
 * (false by default) while its host reports none (a server render);
 * elsewhere through the platform's `matchMedia`, `initial` without
 * one (node, a worker).
 * @overload
 * @param {Root} root @param {string} query @param {boolean} [initial]
 * @returns {{ value: Readable<boolean> }}
 */
/**
 * @overload
 * @param {string} query @param {boolean} [initial]
 * @returns {{ value: Readable<boolean> }}
 */
/** @param {any[]} args @returns {any} */
export function $fits(...args) {
  const R = rooted(args);
  const [query, initial = false] = args;
  return { value: matching(R, query, initial) };
}

/** The node of `$fits`. @param {Root} R @param {string} query @param {boolean} initial @returns {Readable<boolean>} */
function matching(R, query, initial) {
  if (viewing(R)) {
    const view = $viewport();
    const matches = $media(query);
    // 0 × 0: a host that reports no viewport.
    return $memo(R, () => ($read(view.width) === 0 && $read(view.height) === 0 ? initial : $read(matches)));
  }
  const match = /** @type {any} */ (globalThis).matchMedia;
  if (typeof match !== 'function') return $signal(R, initial);
  const list = match.call(globalThis, query);
  const matches = $signal(R, list.matches === true);
  const listener = (/** @type {any} */ e) => later(R, () => void $write(matches, e.matches === true));
  if (typeof list.addEventListener === 'function') {
    list.addEventListener('change', listener);
    ending(R, () => list.removeEventListener('change', listener));
  } else if (typeof list.addListener === 'function') {
    list.addListener(listener);
    ending(R, () => list.removeListener(listener));
  }
  return matches;
}

/**
 * The system's color scheme, `'dark'` or `'light'`, as `$fits` reads
 * it; `initial` (light) where nothing reports it.
 * @overload
 * @param {Root} root @param {'light' | 'dark'} [initial]
 * @returns {{ value: Readable<'light' | 'dark'> }}
 */
/**
 * @overload
 * @param {'light' | 'dark'} [initial]
 * @returns {{ value: Readable<'light' | 'dark'> }}
 */
/** @param {any[]} args @returns {any} */
export function $scheme(...args) {
  const R = rooted(args);
  const dark = matching(R, '(prefers-color-scheme: dark)', args[0] === 'dark');
  return { value: $memo(R, () => ($read(dark) ? 'dark' : 'light')) };
}

/**
 * Whether the user asks for reduced motion,
 * as `$fits` reads it; `initial` (false) where nothing reports
 * it.
 * @overload
 * @param {Root} root @param {boolean} [initial]
 * @returns {{ value: Readable<boolean> }}
 */
/**
 * @overload
 * @param {boolean} [initial]
 * @returns {{ value: Readable<boolean> }}
 */
/** @param {any[]} args @returns {any} */
export function $reducedMotion(...args) {
  const R = rooted(args);
  return { value: matching(R, '(prefers-reduced-motion: reduce)', args[0] === true) };
}

/**
 * The viewport's size in CSS pixels, following
 * resizes: in a component the application root's viewport (`$viewport`,
 * every renderer and a worker), elsewhere the window's inner size (0 × 0
 * without a window).
 * @overload
 * @param {Root} root
 * @returns {{ value: Readable<{ width: number, height: number }> }}
 */
/**
 * @overload
 * @returns {{ value: Readable<{ width: number, height: number }> }}
 */
/** @param {any[]} args @returns {any} */
export function $viewportSize(...args) {
  const R = rooted(args);
  if (viewing(R)) {
    const view = $viewport();
    return { value: $memo(R, () => ({ width: $read(view.width), height: $read(view.height) })) };
  }
  const g = /** @type {any} */ (globalThis);
  const size = () => ({ width: Number(g.innerWidth) || 0, height: Number(g.innerHeight) || 0 });
  const value = $signal(R, size());
  if (typeof g.addEventListener === 'function') {
    const resized = () =>
      later(R, () => void $write(value, size()));
    g.addEventListener('resize', resized);
    ending(R, () => g.removeEventListener('resize', resized));
  }
  return { value };
}

// ---------------------------------------------------------------------------
// $online

/**
 * @typedef {object} Network
 * @property {boolean} online
 * @property {number=} downlink
 * @property {number=} downlinkMax
 * @property {string=} effectiveType
 * @property {number=} rtt
 * @property {boolean=} saveData
 * @property {string=} type
 */

/** @returns {Network} */
function network() {
  const nav = /** @type {any} */ (globalThis).navigator;
  const c = nav?.connection;
  /** @type {Network} */
  const out = { online: typeof nav?.onLine === 'boolean' ? nav.onLine : true };
  if (c != null) {
    out.downlink = c.downlink;
    out.downlinkMax = c.downlinkMax;
    out.effectiveType = c.effectiveType;
    out.rtt = c.rtt;
    out.saveData = c.saveData;
    out.type = c.type;
  }
  return out;
}

/**
 * The network's state, following the platform's
 * `online`/`offline` events and connection changes where it has them; online
 * where there is no navigator to ask.
 * @overload
 * @param {Root} root
 * @returns {{ value: Readable<Network> }}
 */
/**
 * @overload
 * @returns {{ value: Readable<Network> }}
 */
/** @param {any[]} args @returns {any} */
export function $online(...args) {
  const R = rooted(args);
  const status = $signal(R, network());
  const g = /** @type {any} */ (globalThis);
  const update = () => later(R, () => void $write(status, network()));
  if (typeof g.addEventListener === 'function') {
    g.addEventListener('online', update);
    g.addEventListener('offline', update);
    ending(R, () => {
      g.removeEventListener('online', update);
      g.removeEventListener('offline', update);
    });
  }
  const c = g.navigator?.connection;
  if (c != null && typeof c.addEventListener === 'function') {
    c.addEventListener('change', update);
    ending(R, () => c.removeEventListener('change', update));
  }
  return { value: status };
}

// ---------------------------------------------------------------------------
// $title

/**
 * Sets the document's title to `title` (a value, accessor or node) and
 * follows it; an empty title is left alone, and
 * so is a platform without a document (a worker, a canvas-only page in node).
 * @overload
 * @param {Root} root @param {string | (() => string) | Readable<string>} title
 * @returns {void}
 */
/**
 * @overload
 * @param {string | (() => string) | Readable<string>} title
 * @returns {void}
 */
/** @param {any[]} args @returns {any} */
export function $title(...args) {
  const R = rooted(args);
  const title = args[0];
  $watch(
    R,
    () => String(read(title) ?? '').trim(),
    text => {
      const doc = /** @type {any} */ (globalThis).document;
      if (text.length > 0 && doc != null) doc.title = text;
    },
  );
}

// ---------------------------------------------------------------------------
// $fullscreen

/**
 * @typedef {object} FullscreenHandle
 * @property {(node: any) => void} ref pass as a primitive's `ref` to make that element the one shown fullscreen (the whole document otherwise)
 * @property {Readable<boolean>} value whether it is shown fullscreen
 * @property {() => Promise<void>} toggle
 */

/**
 * Fullscreen for an element or the document,
 * where the platform has a document with the Fullscreen API; elsewhere
 * `toggle` does nothing and `value` stays false. A canvas item has no
 * fullscreen of its own: its document's element goes fullscreen instead.
 * @overload
 * @param {Root} root
 * @returns {FullscreenHandle}
 */
/**
 * @overload
 * @returns {FullscreenHandle}
 */
/** @param {any[]} args @returns {any} */
export function $fullscreen(...args) {
  const R = rooted(args);
  const doc = /** @type {any} */ (globalThis).document;
  const active = $signal(R, doc?.fullscreenElement != null);
  /** @type {any} */
  let element = null;
  const ref = (/** @type {any} */ node) => void (element = node);
  if (doc == null || typeof doc.addEventListener !== 'function') return { value: active, ref, toggle: async () => {} };
  const changed = () => later(R, () => void $write(active, doc.fullscreenElement != null));
  doc.addEventListener('fullscreenchange', changed);
  ending(R, () => doc.removeEventListener('fullscreenchange', changed));
  const toggle = async () => {
    if (doc.fullscreenElement != null) {
      if (typeof doc.exitFullscreen === 'function') await doc.exitFullscreen();
      return;
    }
    const shown = element != null && typeof element.requestFullscreen === 'function' ? element : doc.documentElement;
    if (shown != null && typeof shown.requestFullscreen === 'function') await shown.requestFullscreen();
  };
  return { value: active, ref, toggle };
}
