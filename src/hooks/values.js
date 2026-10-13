// Value hooks: an object changed by patches ($patch), a component's value
// held by its props or kept inside ($model), and a value with its validity
// and the last value that passed ($validated). Each has the two spellings
// and returns one handle; commands write plainly with untracked reads.

import { $signal, $memo, $read, $write, $untrack, $batch, read } from 'ren-core';
import { rooted } from './shared.js';
import { own as ownEntry } from '../own.js';

/** @typedef {import('ren-core').Graph} Root */
/**
 * @template T
 * @typedef {import('ren-core').Readable<T>} Readable
 */

const own = Object.prototype.hasOwnProperty;

// ---------------------------------------------------------------------------
// $patch

/**
 * @template T
 * @typedef {object} PatchHandle
 * @property {Readable<T>} value the object, a new one after each change
 * @property {(part: Partial<T> | null | undefined | ((current: T) => Partial<T> | null | undefined)) => void} set
 *   lays the part's own keys over the current ones; a key given as `undefined` is removed; a part that changes nothing writes nothing
 */

/**
 * The next object after a patch, or `null` when the patch changes nothing.
 * Copies the current object only once a key differs.
 * @param {Record<string, any>} current @param {Record<string, any>} part
 * @returns {Record<string, any> | null}
 */
function patched(current, part) {
  /** @type {Record<string, any> | null} */
  let next = null;
  for (const key of Object.keys(part)) {
    const v = part[key];
    const has = own.call(current, key);
    if (v === undefined ? !has : has && Object.is(current[key], v)) continue;
    next ??= { ...current };
    if (v === undefined) delete next[key];
    else ownEntry(next, key, v);
  }
  return next;
}

/**
 * An object updated by patches, one level deep: `set(part)` keeps the
 * current keys and lays the part's own keys over them (nested objects are
 * replaced); a key given as `undefined` is removed. `initial` is copied.
 * @template {object} T
 * @overload
 * @param {Root} root @param {T} initial
 * @returns {PatchHandle<T>}
 */
/**
 * @template {object} T
 * @overload
 * @param {T} initial
 * @returns {PatchHandle<T>}
 */
/** @param {any[]} args @returns {any} */
export function $patch(...args) {
  const R = rooted(args);
  const value = $signal(R, /** @type {Record<string, any>} */ ({ ...args[0] }));
  /** @param {any} part */
  const set = part => {
    const current = $untrack(R, () => $read(value));
    const patch = typeof part === 'function' ? part(current) : part;
    if (patch == null) return;
    const next = patched(current, patch);
    if (next !== null) $write(value, next);
  };
  return { value, set };
}

// ---------------------------------------------------------------------------
// $model

/**
 * @template T
 * @typedef {object} ModelHandle
 * @property {Readable<T>} value the value shown: the owner's when controlled, else the one kept here
 * @property {(value: T, ...payload: any[]) => void} set a new value: kept here when uncontrolled, then told to `onChange`; the value shown now does nothing
 * @property {boolean} controlled whether `value` was given, decided when the hook is made
 */
/**
 * @template T
 * @typedef {object} ModelOptions
 * @property {T | (() => T) | Readable<T>=} value the owner's value (a value, accessor or node); left out, the hook keeps its own
 * @property {T=} defaultValue the first value kept here
 * @property {T=} fallback the value when neither `value` nor `defaultValue` is given
 * @property {((value: T, ...payload: any[]) => void)=} onChange
 */

/**
 * A component's value, held by its owner through `value` (controlled) or
 * kept here from `defaultValue`, else `fallback` (uncontrolled). `set`
 * writes only when uncontrolled and calls `onChange(value, ...payload)`
 * in both modes; setting the value shown now does neither.
 * @template T
 * @overload
 * @param {Root} root @param {ModelOptions<T>} options
 * @returns {ModelHandle<T>}
 */
/**
 * @template T
 * @overload
 * @param {ModelOptions<T>} options
 * @returns {ModelHandle<T>}
 */
/** @param {any[]} args @returns {any} */
export function $model(...args) {
  const R = rooted(args);
  const { value: given, defaultValue, fallback, onChange } = /** @type {ModelOptions<any>} */ (args[0] ?? {});
  const controlled = given !== undefined;
  const kept = controlled ? null : $signal(R, defaultValue !== undefined ? defaultValue : fallback);
  const value = kept ?? $memo(R, () => read(given));
  /** @param {any} next @param {any[]} payload */
  const set = (next, ...payload) => {
    if (Object.is($untrack(R, () => $read(value)), next)) return;
    if (kept !== null) $write(kept, next);
    onChange?.(next, ...payload);
  };
  return { value, set, controlled };
}

// ---------------------------------------------------------------------------
// $validated

/**
 * @template T
 * @typedef {object} ValidatedHandle
 * @property {Readable<T>} value the last value set
 * @property {Readable<boolean>} valid whether it passed `check`
 * @property {Readable<T | undefined>} good the last value that passed, undefined before any
 * @property {Readable<string | null>} reason the last failure's reason (a string `check` returned), null otherwise
 * @property {(value: T) => void} set
 */
/**
 * @template T
 * @typedef {object} ValidatedOptions
 * @property {(value: T) => boolean | string | unknown} check passes on `true`; a string fails with that reason; anything else fails
 * @property {boolean=} valid the first value's validity, stated (then `check` is not called for it)
 */

/**
 * A value with its validity and the last value that passed. `check`
 * passes on `true`; a string it returns is a failure with that reason
 * (`reason`). Each `set` runs `check` again, even for the same value.
 * @template T
 * @overload
 * @param {Root} root @param {T} initial @param {ValidatedOptions<T>} options
 * @returns {ValidatedHandle<T>}
 */
/**
 * @template T
 * @overload
 * @param {T} initial @param {ValidatedOptions<T>} options
 * @returns {ValidatedHandle<T>}
 */
/** @param {any[]} args @returns {any} */
export function $validated(...args) {
  const R = rooted(args);
  const [initial, options] = args;
  const { check } = /** @type {ValidatedOptions<any>} */ (options);
  /** @type {string | null} */
  let why = null;
  /** Runs the check; leaves its failure's reason in `why`. @param {any} v */
  const judge = v => {
    const out = check(v);
    why = typeof out === 'string' ? out : null;
    return out === true;
  };
  const first = typeof options.valid === 'boolean' ? options.valid : judge(initial);
  const value = $signal(R, initial);
  const valid = $signal(R, first);
  const good = $signal(R, first ? initial : undefined);
  const reason = $signal(R, first ? null : why);
  /** Writes `node` only when it holds another value. @param {any} node @param {any} v */
  const put = (node, v) => {
    if (!Object.is($untrack(R, () => $read(node)), v)) $write(node, v);
  };
  /** @param {any} next */
  const set = next => {
    why = null;
    const ok = judge(next);
    const failure = ok ? null : why;
    $batch(R, () => {
      put(value, next);
      put(valid, ok);
      if (ok) put(good, next);
      put(reason, failure);
    });
  };
  return { value, valid, good, reason, set };
}
