// rui-core/hooks' collection hooks: $list's verbs and its no-change rule,
// $history's bounded undo and redo, $queue's split, on a root of their own
// (root first), inside a component, and rendered the same on DOM and Skia.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { $root, $signal, $read, $write, $flush, $dispose, $memo } from 'rrx-core';
import { View, Label, Action } from 'ren-core';
import { $list, $history, $queue } from 'rui-core/hooks';
import { both, onDom } from './harness.jsx';

let R = $root('collections');
beforeEach(() => {
  R = $root('collections');
});
afterEach(() => $dispose(R));

/** Flushes, then reads. @param {any} node */
const now = node => ($flush(R), $read(node));

/**
 * Runs `fn` in a component on the DOM (the short spelling): its result, and
 * a read that flushes that view's root first.
 * @template T @param {() => T} fn @returns {[T, (node: any) => any, () => void]}
 */
function inView(fn) {
  /** @type {any} */
  let out;
  const dom = onDom(() => void (out = fn()));
  return [out, node => ($flush(dom.root), $read(node)), dom.dispose];
}

describe('$list', () => {
  const packing = () => ['tent', 'stove', 'map', 'rope'];

  it('adds and drops at either end and inserts anywhere', () => {
    const bag = $list(R, packing());
    bag.push('lamp', 'knife');
    assert.deepEqual(now(bag.value), ['tent', 'stove', 'map', 'rope', 'lamp', 'knife']);
    bag.unshift('boots');
    bag.pop();
    bag.shift();
    assert.deepEqual(now(bag.value), ['tent', 'stove', 'map', 'rope', 'lamp']);
    bag.insert(1, 'tarp');
    assert.deepEqual(now(bag.value), ['tent', 'tarp', 'stove', 'map', 'rope', 'lamp']);
    bag.insert(-1, 'cup');
    assert.deepEqual(now(bag.value), ['tent', 'tarp', 'stove', 'map', 'rope', 'cup', 'lamp'], '-1 inserts before the last');
    bag.insert(99, 'hat');
    bag.insert(-99, 'sock');
    assert.deepEqual(now(bag.value), ['sock', 'tent', 'tarp', 'stove', 'map', 'rope', 'cup', 'lamp', 'hat'], 'clamped to the ends');
    bag.push(['pair', 'of', 'gloves']);
    assert.deepEqual(now(bag.value).at(-1), ['pair', 'of', 'gloves'], 'an array item stays one item');
  });

  it('removes, moves, swaps, replaces and sets fields, with negative and fractional indices', () => {
    const bag = $list(R, packing());
    bag.removeAt(-1, 0, 0, 42);
    assert.deepEqual(now(bag.value), ['stove', 'map']);
    bag.set(packing());
    bag.move(0, 2);
    assert.deepEqual(now(bag.value), ['stove', 'map', 'tent', 'rope'], 'the item ends at index 2');
    bag.move(3, 0);
    assert.deepEqual(now(bag.value), ['rope', 'stove', 'map', 'tent']);
    bag.move(0, 99);
    assert.deepEqual(now(bag.value), ['stove', 'map', 'tent', 'rope'], 'to is clamped to the last place');
    bag.move(-1, 1.9);
    assert.deepEqual(now(bag.value), ['stove', 'rope', 'map', 'tent'], 'negative from, fractional to');
    bag.swap(0, -1);
    assert.deepEqual(now(bag.value), ['tent', 'rope', 'map', 'stove']);
    bag.replace(-2, 'compass');
    assert.deepEqual(now(bag.value), ['tent', 'rope', 'compass', 'stove']);

    const gear = $list(R, [{ name: 'tent', packed: false }, { name: 'stove', packed: false }]);
    const first = now(gear.value)[0];
    gear.setField(-1, 'packed', true);
    assert.deepEqual(now(gear.value), [{ name: 'tent', packed: false }, { name: 'stove', packed: true }]);
    assert.equal(now(gear.value)[0], first, 'the other items are kept');
  });

  it('filters, maps and maps where a test passes', () => {
    const bag = $list(R, packing());
    bag.filter(item => item !== 'map');
    assert.deepEqual(now(bag.value), ['tent', 'stove', 'rope']);
    bag.map((item, i) => `${i}:${item}`);
    assert.deepEqual(now(bag.value), ['0:tent', '1:stove', '2:rope']);
    bag.mapWhere(item => item.endsWith('e'), item => item.toUpperCase());
    assert.deepEqual(now(bag.value), ['0:tent', '1:STOVE', '2:ROPE']);
    bag.set(current => current.slice(0, 1));
    assert.deepEqual(now(bag.value), ['0:tent']);
  });

  it('writes nothing for a command that changes nothing', () => {
    const bag = $list(R, packing());
    let runs = 0;
    const seen = $memo(R, () => (runs++, $read(bag.value)));
    const before = now(seen);
    bag.push();
    bag.unshift();
    bag.insert(2);
    bag.removeAt(9, -9);
    bag.removeAt();
    bag.move(9, 0);
    bag.move(1, 1);
    bag.move(-1, 3);
    bag.swap(1, 1);
    bag.swap(0, 9);
    bag.replace(9, 'x');
    bag.replace(0, 'tent');
    bag.setField(9, 'length', 1);
    bag.filter(() => true);
    bag.mapWhere(() => false, x => x);
    bag.mapWhere(() => true, x => x);
    bag.mapWhere((x, i) => i === 1, x => x);
    bag.map(x => x);
    bag.set(packing());
    bag.set(list => list.slice());
    assert.equal(now(seen), before, 'the same array');
    assert.equal(runs, 1, 'the memo did not rerun');
    // The same item twice: a swap or a move between its places leaves the list as it was.
    const twice = $list(R, ['tent', 'map', 'tent']);
    const same = now(twice.value);
    twice.swap(0, 2);
    assert.equal(now(twice.value), same, 'swapping an item with itself writes nothing');
    const pair = $list(R, ['tent', 'tent', 'map']);
    const unmoved = now(pair.value);
    pair.move(0, 1);
    assert.equal(now(pair.value), unmoved, 'moving an item past itself writes nothing');

    const empty = $list(R);
    const nothing = now(empty.value);
    empty.pop();
    empty.shift();
    assert.equal(now(empty.value), nothing);
    assert.deepEqual(nothing, []);
    const gear = $list(R, [{ packed: true }]);
    const kept = now(gear.value);
    gear.setField(0, 'packed', true);
    assert.equal(now(gear.value), kept);
  });

  it('map and set write once something differs', () => {
    const bag = $list(R, packing());
    const before = now(bag.value);
    bag.map((x, i) => (i === 1 ? 'kettle' : x));
    assert.notEqual(now(bag.value), before);
    assert.deepEqual(now(bag.value), ['tent', 'kettle', 'map', 'rope']);
    bag.set(['tent', 'kettle', 'map']);
    assert.deepEqual(now(bag.value), ['tent', 'kettle', 'map'], 'a shorter list differs');
  });

  it('sees a change by identity: set of its own array changed in place writes', () => {
    const bag = $list(R, packing());
    let runs = 0;
    const seen = $memo(R, () => (runs++, $read(bag.value)));
    now(seen);
    bag.set((/** @type {string[]} */ list) => {
      list.push('lamp');
      return list;
    });
    assert.deepEqual(now(seen), ['tent', 'stove', 'map', 'rope', 'lamp'], 'the change made in place is seen');
    assert.equal(runs, 2, 'one write');
    bag.set((/** @type {string[]} */ list) => list.slice());
    assert.equal(runs, 2, 'a new array of the same items writes nothing');
  });

  it('calls an initial function once and never holds the caller\'s array', () => {
    let calls = 0;
    const bag = $list(R, () => (calls++, packing()));
    bag.push('lamp');
    now(bag.value);
    assert.equal(calls, 1);
    const mine = packing();
    const other = $list(R, mine);
    assert.notEqual(now(other.value), mine);
    other.push('lamp');
    assert.equal(mine.length, 4);
    other.set(mine);
    assert.notEqual(now(other.value), mine, 'set copies too');
  });

  it('takes the short spelling inside a scope', () => {
    const [bag, read, dispose] = inView(() => $list(['tent']));
    bag.push('map');
    assert.deepEqual(read(bag.value), ['tent', 'map']);
    dispose();
  });
});

describe('$history', () => {
  it('sets, goes back and forward, and resets', () => {
    const stroke = $history(R, 'black');
    stroke.set('red');
    stroke.set('teal');
    assert.equal(now(stroke.value), 'teal');
    assert.deepEqual(now(stroke.entries), ['black', 'red', 'teal']);
    assert.equal(now(stroke.index), 2);
    stroke.back();
    assert.equal(now(stroke.value), 'red');
    stroke.back(5);
    assert.equal(now(stroke.index), 0, 'steps clamp');
    stroke.forward(1.8);
    assert.equal(now(stroke.value), 'red', 'a fractional step is truncated');
    stroke.forward(9);
    assert.equal(now(stroke.value), 'teal');
    stroke.reset();
    assert.deepEqual(now(stroke.entries), ['black']);
    assert.equal(now(stroke.index), 0);
    assert.equal(now(stroke.value), 'black');
  });

  it('set drops the future; the current value adds nothing', () => {
    const stroke = $history(R, 'black');
    stroke.set('red');
    stroke.set('teal');
    stroke.back(2);
    stroke.set('black');
    assert.deepEqual(now(stroke.entries), ['black', 'red', 'teal'], 'the same value drops nothing');
    stroke.set('amber');
    assert.deepEqual(now(stroke.entries), ['black', 'amber']);
    assert.equal(now(stroke.index), 1);
  });

  it('keeps at most limit entries, the index on the newest', () => {
    const stroke = $history(R, 'c0', { limit: 3 });
    for (let i = 1; i <= 5; i++) stroke.set(`c${i}`);
    assert.deepEqual(now(stroke.entries), ['c3', 'c4', 'c5']);
    assert.equal(now(stroke.index), 2);
    assert.equal(now(stroke.value), 'c5');
    stroke.back();
    stroke.set('x');
    assert.deepEqual(now(stroke.entries), ['c3', 'c4', 'x'], 'drops the future inside the ring');
    stroke.set('y');
    assert.deepEqual(now(stroke.entries), ['c4', 'x', 'y']);
    stroke.back(2);
    stroke.set('z');
    assert.deepEqual(now(stroke.entries), ['c4', 'z']);
    stroke.set('w');
    stroke.set('v');
    assert.deepEqual(now(stroke.entries), ['z', 'w', 'v']);

    const one = $history(R, 'a', { limit: 0 });
    one.set('b');
    assert.deepEqual(now(one.entries), ['b'], 'a limit below 1 keeps one');
    const all = $history(R, 0, { limit: Infinity });
    for (let i = 1; i <= 150; i++) all.set(i);
    assert.equal(now(all.entries).length, 151);
    const deflt = $history(R, 0);
    for (let i = 1; i <= 150; i++) deflt.set(i);
    assert.equal(now(deflt.entries).length, 100, '100 by default');
    assert.equal(now(deflt.entries)[0], 51);
  });

  it('writes nothing for a move with no room or no steps', () => {
    const stroke = $history(R, 'black');
    stroke.set('red');
    let runs = 0;
    const seen = $memo(R, () => (runs++, $read(stroke.index)));
    now(seen);
    const entries = now(stroke.entries);
    stroke.back(0);
    stroke.back(-2);
    stroke.forward();
    stroke.set('red');
    now(seen);
    assert.equal(runs, 1);
    assert.equal(now(stroke.entries), entries);
  });

  it('takes the short spelling inside a scope', () => {
    const [stroke, read, dispose] = inView(() => $history('black'));
    stroke.set('red');
    assert.equal(read(stroke.value), 'red');
    dispose();
  });
});

describe('$queue', () => {
  it('shows up to the limit and keeps the rest waiting', () => {
    const spool = $queue(R, { initial: ['memo', 'invoice', 'map'], limit: 2 });
    assert.deepEqual(now(spool.shown), ['memo', 'invoice']);
    assert.deepEqual(now(spool.waiting), ['map']);
    spool.push('poster', 'label');
    assert.deepEqual(now(spool.shown), ['memo', 'invoice']);
    assert.deepEqual(now(spool.waiting), ['map', 'poster', 'label']);
    spool.update(all => all.filter(job => job !== 'memo'));
    assert.deepEqual(now(spool.shown), ['invoice', 'map'], 'a removal promotes the first waiting');
    assert.deepEqual(now(spool.waiting), ['poster', 'label']);
    spool.clearWaiting();
    assert.deepEqual(now(spool.waiting), []);
    assert.deepEqual(now(spool.shown), ['invoice', 'map']);
  });

  it('gives update a copy and writes nothing when none wait', () => {
    const spool = $queue(R, { limit: 3, initial: ['memo'] });
    /** @type {any[]} */
    let given = [];
    spool.update(all => ((given = all), all.concat('map')));
    given.push('stray');
    assert.deepEqual(now(spool.shown), ['memo', 'map']);
    let runs = 0;
    const seen = $memo(R, () => (runs++, $read(spool.shown)));
    now(seen);
    spool.clearWaiting();
    spool.push();
    now(seen);
    assert.equal(runs, 1);
  });

  it('follows a limit node raised and lowered', () => {
    const limit = $signal(R, 1);
    const spool = $queue(R, { initial: ['a', 'b', 'c', 'd'], limit });
    assert.deepEqual([now(spool.shown), now(spool.waiting)], [['a'], ['b', 'c', 'd']]);
    $write(limit, 3);
    assert.deepEqual([now(spool.shown), now(spool.waiting)], [['a', 'b', 'c'], ['d']]);
    $write(limit, 2.7);
    assert.deepEqual([now(spool.shown), now(spool.waiting)], [['a', 'b'], ['c', 'd']], 'truncated');
    $write(limit, -4);
    assert.deepEqual([now(spool.shown), now(spool.waiting)], [[], ['a', 'b', 'c', 'd']], 'floored at 0');
    const byAccessor = $queue(R, { initial: [1, 2], limit: () => 5 });
    assert.deepEqual(now(byAccessor.shown), [1, 2]);
  });

  it('throws without a limit', () => {
    assert.throws(() => $queue(R, /** @type {any} */ ({ initial: [] })), /RUI: \$queue needs a limit/);
  });

  it('takes the short spelling inside a scope', () => {
    const [spool, read, dispose] = inView(() => $queue({ limit: 1, initial: ['a', 'b'] }));
    assert.deepEqual(read(spool.waiting), ['b']);
    dispose();
  });
});

describe('collection hooks on both renderers', () => {
  it('render a $list and a $queue the same on the DOM and on Skia', () => {
    const view = () => {
      const bag = $list(['tent', 'map']);
      const line = $queue({ limit: 1, initial: ['ticket 1'] });
      return (
        <View>
          <Label>{() => `pack ${$read(bag.value).join(' ')}`}</Label>
          <Label>{() => `serving ${$read(line.shown).join(' ')} waiting ${$read(line.waiting).length}`}</Label>
          <Action onPress={() => (bag.insert(-1, 'rope'), line.push('ticket 2'))}>Add</Action>
          <Action onPress={() => line.update(all => all.slice(1))}>Next</Action>
        </View>
      );
    };
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), 'pack tent map serving ticket 1 waiting 0 Add Next');
    assert.equal(skia.text(), dom.text());
    dom.press('Add');
    skia.press('Add');
    assert.equal(dom.text(), 'pack tent rope map serving ticket 1 waiting 1 Add Next');
    assert.equal(skia.text(), dom.text());
    dom.press('Next');
    skia.press('Next');
    assert.equal(dom.text(), 'pack tent rope map serving ticket 2 waiting 0 Add Next');
    assert.equal(skia.text(), dom.text());
    dispose();
  });
});
