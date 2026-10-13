// The type-ahead helper: on a plain list under a manual clock, and in a
// Menu on the DOM and on Skia.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { View } from 'ren-core';
import { Clock, manualClock } from 'rui-core';
import { $typeAhead } from '../src/core/misc/type-ahead.js';
import { onDom } from './harness.jsx';
import { menuWalk } from './overlay-harness.jsx';

/**
 * A list of names with a current index, and a type-ahead over it.
 * @param {string[]} names @param {{ skip?: (i: number) => boolean, reset?: number | string, at?: number }} [extra]
 */
function list(names, extra = {}) {
  const clock = manualClock();
  let at = extra.at ?? 0;
  /** @type {import('../src/core/misc/type-ahead.js').TypeAhead} */
  let seek = /** @type {any} */ (null);
  const Probe = () => {
    seek = $typeAhead({ count: () => names.length, text: i => names[i], skip: extra.skip, at: () => at, go: i => (at = i), reset: extra.reset });
    return <View />;
  };
  const dom = onDom(() => (
    <Clock value={clock}>
      <Probe />
    </Clock>
  ));
  /** Types `key` (a key name or event fields) after `wait` ms; returns what the helper said and where it is. @param {string | Record<string, any>} key @param {number} [wait] */
  const type = (key, wait = 10) => {
    clock.advance(wait);
    const used = seek.key(typeof key === 'string' ? { key } : key);
    return [used, names[at] ?? null];
  };
  return { type, clear: () => seek.clear(), clock, dispose: dom.dispose, set: (/** @type {number} */ i) => (at = i) };
}

describe('$typeAhead', () => {
  it('one letter moves to the next match after the current one and wraps', () => {
    const l = list(['Delta', 'Copy', 'Dune', 'Bee']);
    assert.deepEqual(l.type('d', 1000), [true, 'Dune']);
    l.set(2);
    assert.deepEqual(l.type('d', 1000), [true, 'Delta'], 'wraps to the start');
    l.dispose();
  });

  it('the same letter repeated steps through the matches', () => {
    const l = list(['Copy', 'Cut', 'Delete', 'Duplicate', 'Dive']);
    assert.deepEqual(l.type('d'), [true, 'Delete']);
    assert.deepEqual(l.type('d'), [true, 'Duplicate']);
    assert.deepEqual(l.type('d'), [true, 'Dive']);
    assert.deepEqual(l.type('d'), [true, 'Delete'], 'around again');
    l.dispose();
  });

  it('several letters keep the current item while it matches, then move to the first later match', () => {
    const l = list(['Copy', 'Cut', 'Cup', 'Cupboard', 'Curl']);
    l.set(2);
    assert.deepEqual(l.type('c'), [true, 'Cupboard']);
    assert.deepEqual(l.type('u'), [true, 'Cupboard'], 'still matching: stays');
    assert.deepEqual(l.type('r'), [true, 'Curl']);
    l.dispose();
    const m = list(['Copy', 'Cut', 'Cup', 'Curl']);
    m.set(3);
    assert.deepEqual(m.type('c'), [true, 'Copy']);
    assert.deepEqual(m.type('u'), [true, 'Cut'], 'from the current on, wrapping');
    m.dispose();
  });

  it('the search starts over after the reset: 750 ms by default, a preset name or ms', () => {
    const l = list(['Alpha', 'Beta', 'Bravo', 'Brick']);
    assert.deepEqual(l.type('b'), [true, 'Beta']);
    assert.deepEqual(l.type('r', 740), [true, 'Bravo'], '740 ms: the same search ("br")');
    assert.deepEqual(l.type('a', 760), [true, 'Alpha'], '760 ms: a fresh "a"');
    l.dispose();
    const quick = list(['Alpha', 'Beta', 'Bravo'], { reset: 'quick' });
    quick.type('b');
    assert.deepEqual(quick.type('a', 120), [true, 'Alpha'], "'quick' (110 ms) passed: a fresh search");
    quick.dispose();
    const ms = list(['Alpha', 'Beta', 'Bravo'], { reset: 2000 });
    ms.type('b');
    assert.deepEqual(ms.type('r', 1900), [true, 'Bravo'], 'within 2000 ms: "br"');
    ms.dispose();
  });

  it('matches ignore case and accents', () => {
    const l = list(['Apple', 'école', 'Ñandú']);
    assert.deepEqual(l.type('É'), [true, 'école']);
    assert.deepEqual(l.type('n', 1000), [true, 'Ñandú']);
    assert.deepEqual(l.type('A', 1000), [true, 'Apple']);
    l.dispose();
  });

  it('skipped candidates never match', () => {
    const l = list(['Copy', 'Cut', 'Clear'], { skip: i => i === 1 });
    assert.deepEqual(l.type('c'), [true, 'Clear']);
    assert.deepEqual(l.type('c'), [true, 'Copy']);
    l.dispose();
  });

  it('keys with Ctrl, Meta or Alt, Space, ArrowDown and Enter are not a search’s', () => {
    const l = list(['Copy', 'Cut']);
    for (const e of [{ key: 'c', ctrlKey: true }, { key: 'c', metaKey: true }, { key: 'c', altKey: true }, { key: ' ' }, { key: 'ArrowDown' }, { key: 'Enter' }]) {
      assert.deepEqual(l.type(e), [false, 'Copy'], JSON.stringify(e));
    }
    l.dispose();
  });

  it('no match: false on a first letter, true in the middle of a search', () => {
    const l = list(['Copy', 'Cut']);
    assert.deepEqual(l.type('z'), [false, 'Copy']);
    assert.deepEqual(l.type('c'), [true, 'Cut'], 'the unmatched letter started nothing');
    assert.deepEqual(l.type('x'), [true, 'Cut'], 'mid-search: consumed, nothing moves');
    l.dispose();
    const empty = list([]);
    assert.deepEqual(empty.type('c'), [false, null], 'an empty list');
    empty.dispose();
  });

  it('clear() drops the search string', () => {
    const l = list(['Alpha', 'Beta', 'Bravo']);
    l.type('b');
    l.type('r');
    l.clear();
    assert.deepEqual(l.type('a'), [true, 'Alpha'], 'a fresh "a", not "bra"');
    l.dispose();
  });
});

describe('Menu type-ahead (DOM and Skia)', () => {
  it('a letter, the same letter again, and several letters after the reset', () => {
    const m = menuWalk({});
    assert.deepEqual(m.at(), ['Copy', 'Copy']);
    m.key('d');
    assert.deepEqual(m.at(), ['Delete', 'Delete']);
    m.key('d');
    assert.deepEqual(m.at(), ['Duplicate', 'Duplicate']);
    m.clock.advance(800);
    m.key('c');
    m.key('u');
    assert.deepEqual(m.at(), ['Cut', 'Cut']);
    m.dispose();
  });

  it('a disabled item is passed over', () => {
    const m = menuWalk({}, ['Copy', 'Cut', { text: 'Delete', disabled: true }, 'Duplicate']);
    m.key('d');
    assert.deepEqual(m.at(), ['Duplicate', 'Duplicate']);
    m.dispose();
  });

  it('reopening the menu starts a fresh search', () => {
    const m = menuWalk({});
    m.key('c');
    m.key('u');
    assert.deepEqual(m.at(), ['Cut', 'Cut']);
    m.key('Escape');
    assert.deepEqual([m.d.focused().textContent, m.s.focused()?.first?.text ?? m.s.focused()?.text], ['Open', 'Open'], 'back on the trigger');
    m.key('ArrowDown');
    assert.deepEqual(m.at(), ['Copy', 'Copy']);
    m.key('t');
    assert.deepEqual(m.at(), ['Copy', 'Copy'], 'a fresh "t" finds nothing (a kept "cut" would find Cut)');
    m.dispose();
  });
});
