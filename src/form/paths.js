// Paths into form values: a dot string ('crew.1.role') split into segments,
// where a segment of digits only is a list index. Values are immutable: a
// write copies the containers from the top down to the field and shares
// everything beside that line.

import { own } from '../own.js';

/** @typedef {string | number} Segment */

/** A segment made of digits only. */
const DIGITS = /^\d+$/;

/**
 * The segments of a dot path: digits become numbers (list indexes), the
 * rest stay keys; `''` is the whole value (no segments).
 * @param {string} path
 * @returns {Segment[]}
 */
export const segmentsOf = path => (path === '' ? [] : path.split('.').map(part => (DIGITS.test(part) ? Number(part) : part)));

/** True for a list index: a non-negative integer. @param {unknown} segment */
export const isIndex = segment => typeof segment === 'number' && Number.isInteger(segment) && segment >= 0;

/**
 * The value at `segments` in `root`; a step through a missing or non-object
 * value gives `undefined`.
 * @param {any} root @param {readonly Segment[]} segments
 * @returns {any}
 */
export function readAt(root, segments) {
  let at = root;
  for (const segment of segments) {
    // Own keys only: an inherited member (toString, constructor) is no value.
    if (at === null || typeof at !== 'object' || !Object.hasOwn(at, segment)) return undefined;
    at = at[segment];
  }
  return at;
}

/**
 * `root` with `value` at `segments`, sharing every container off the path.
 * A missing container is made: a list when its key is an index, else an
 * object. A list written past its end grows (filled with `undefined`). When
 * the field already holds `value`, `root` itself comes back.
 * @param {any} root @param {readonly Segment[]} segments @param {any} value
 * @returns {any}
 */
export function writeAt(root, segments, value) {
  return step(root, segments, 0, value);
}

/** @param {any} at @param {readonly Segment[]} segments @param {number} i @param {any} value @returns {any} */
function step(at, segments, i, value) {
  if (i === segments.length) return value;
  const key = segments[i];
  // Own keys only: an inherited member (__proto__, toString) is not form data.
  const held = at !== null && typeof at === 'object' && Object.hasOwn(at, key) ? at[key] : undefined;
  const next = step(held, segments, i + 1, value);
  if (Object.is(next, held) && at !== null && typeof at === 'object') return at;
  /** @type {any} */
  let copy;
  if (Array.isArray(at)) copy = at.slice();
  else if (at !== null && typeof at === 'object') copy = { ...at };
  else copy = isIndex(key) ? [] : {};
  if (Array.isArray(copy) && isIndex(key)) while (copy.length < /** @type {number} */ (key)) copy.push(undefined);
  // Defined as an own key, so a '__proto__' segment is stored as data, never as the prototype.
  own(copy, /** @type {any} */ (key), next);
  return copy;
}

/**
 * Structural equality for form values: plain objects by their own keys,
 * lists item by item, Dates by their time, everything else by `Object.is`.
 * @param {any} a @param {any} b
 * @returns {boolean}
 */
export function sameValue(a, b) {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && Object.is(a.getTime(), b.getTime());
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameValue(a[i], b[i])) return false;
    return true;
  }
  if (!plain(a) || !plain(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) if (!Object.hasOwn(b, key) || !sameValue(a[key], b[key])) return false;
  return true;
}

/** An object literal (or one with no prototype). @param {object} value */
const plain = value => {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};
