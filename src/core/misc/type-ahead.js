// Finding an item by typing: printable keys typed close together build a
// search string, and the list moves to the item whose text starts with it.
// Any list of focusable items can use it (a menu's items, a menubar's
// triggers); the time between keys comes from the `Clock` context.

import { $lookup, read } from 'ren-core';
import { Clock, MOTION, durationOf } from '../../theme/motion.js';

/**
 * @typedef {object} TypeAheadOptions
 * @property {() => number} count how many candidates there are now
 * @property {(index: number) => string} text a candidate's search text
 * @property {(index: number) => boolean} [skip] a candidate that cannot be reached (disabled)
 * @property {() => number} at the current candidate's index, or -1
 * @property {(index: number) => void} go moves to a candidate
 * @property {number | string | (() => number | string)} [reset] ms, or a MOTION preset's name
 *
 * @typedef {object} TypeAhead
 * @property {(e: any) => boolean} key takes a key event; true when it used the key
 * @property {() => void} clear drops the search string
 */

/** A text as the search compares it: no accents, no case, no outer spaces. @param {string} text */
const plain = text => String(text).normalize('NFD').replace(/\p{M}/gu, '').trim().toLocaleLowerCase();

/** True for a key that may join a search: one printable character, not a space, no Ctrl, Meta or Alt. @param {any} e */
const printable = e => {
  if (e == null || e.ctrlKey === true || e.metaKey === true || e.altKey === true) return false;
  const k = String(e.key ?? '');
  return [...k].length === 1 && k.trim() !== '';
};

/**
 * A type-ahead over a list of candidates, built inside a component (it reads
 * the `Clock` from context). `reset` is how long after the last key the
 * search starts over: by default half of `MOTION.hold` (750 ms), time for a
 * typed word yet short against a long-press hold. One letter, or the same
 * letter repeated, steps through the candidates starting with it from the
 * one after the current; several letters look from the current one on, so
 * typing further keeps it while it still matches. `key(e)` returns true when
 * it used the key (a match, or any key while a search is under way) and
 * false for a key that is not a search's or a first letter that finds
 * nothing.
 * @param {TypeAheadOptions} options
 * @returns {TypeAhead}
 */
export function $typeAhead(options) {
  const clock = /** @type {import('../../theme/motion.js').ClockValue} */ ($lookup(Clock));
  let typed = '';
  let last = -Infinity;
  const clear = () => {
    typed = '';
    last = -Infinity;
  };
  /** The first reachable candidate from `start` on, wrapping, whose text starts with `needle`. @param {string} needle @param {number} start @param {number} n */
  const find = (needle, start, n) => {
    for (let step = 0; step < n; step++) {
      const i = (start + step) % n;
      if (options.skip?.(i) === true) continue;
      if (plain(options.text(i)).startsWith(needle)) return i;
    }
    return -1;
  };
  /** @param {any} e */
  const key = e => {
    if (!printable(e)) return false;
    const n = options.count();
    if (n === 0) return false;
    const now = clock.now();
    if (now - last > durationOf(read(options.reset), MOTION.hold / 2)) typed = '';
    last = now;
    typed += String(e.key);
    const search = plain(typed);
    const chars = [...search];
    if (chars.length === 0) return typed.length > 1;
    const same = chars.every(c => c === chars[0]);
    const at = options.at();
    const found = same ? find(chars[0], at + 1, n) : find(search, Math.max(at, 0), n);
    if (found >= 0) {
      options.go(found);
      return true;
    }
    if ([...typed].length > 1) return true;
    // A first letter that finds nothing starts no search: the key may do something else.
    clear();
    return false;
  };
  return { key, clear };
}
