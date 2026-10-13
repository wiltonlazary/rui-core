// Which fields a `validateOn` list names: `true` names them all; a list
// holds exact path strings and segment patterns, where EACH stands for any
// list index.

import { segmentsOf, isIndex } from './paths.js';

/** In a path pattern, a segment that matches any list index: `['items', EACH, 'name']`. */
export const EACH = Symbol('each');

/**
 * A path written as segments; `EACH` matches any index.
 * @typedef {(string | number | typeof EACH)[]} PathPattern
 */

/**
 * True when the path's segments fit the pattern: the same length, `EACH`
 * over an index, every other segment equal.
 * @param {readonly (string | number | typeof EACH)[]} pattern @param {readonly (string | number)[]} segments
 */
export function fits(pattern, segments) {
  if (pattern.length !== segments.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    const want = pattern[i];
    if (want === EACH) {
      if (!isIndex(segments[i])) return false;
    } else if (String(want) !== String(segments[i])) return false;
  }
  return true;
}

/**
 * True when `on` (a `validateOn` entry) names the field at `path`.
 * @param {boolean | (string | PathPattern)[] | undefined} on @param {string} path
 */
export function names(on, path) {
  if (on === true) return true;
  if (!Array.isArray(on)) return false;
  for (const entry of on) {
    if (typeof entry === 'string' ? entry === path : fits(entry, segmentsOf(path))) return true;
  }
  return false;
}
