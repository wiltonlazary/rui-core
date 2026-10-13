// $debounced and $throttled: a value that follows its source at a pace,
// on a root of their own and in a component, driven by node:test's mock
// timers (Date among them: the hooks time changes with Date.now()).

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { $root, $signal, $read, $write, $flush, $dispose } from 'rrx-core';
import { $active } from 'ren-core';
import { $debounced, $throttled } from 'rui-core/hooks';
import { onDom } from './harness.jsx';

let R = $root('pace');
beforeEach(() => {
  R = $root('pace');
});
afterEach(() => $dispose(R));

describe('$debounced and $throttled (mock timers)', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] }));
  afterEach(() => mock.timers.reset());

  it('$debounced follows after the source keeps still', () => {
    const source = $signal(R, 'a');
    const { value, cancel } = $debounced(R, source, 100);
    $write(source, 'b');
    $flush(R);
    mock.timers.tick(50);
    $write(source, 'c');
    $flush(R);
    mock.timers.tick(99);
    assert.equal($read(value), 'a');
    mock.timers.tick(1);
    assert.equal($read(value), 'c', 'the timer flushed its write');
    $write(source, 'd');
    $flush(R);
    cancel();
    mock.timers.tick(500);
    assert.equal($read(value), 'c', 'canceled');
  });

  it('$debounced with leading shows the first change at once', () => {
    const source = $signal(R, 0);
    const { value } = $debounced(R, source, 100, { leading: true });
    $write(source, 1);
    $flush(R);
    assert.equal($read(value), 1);
    $write(source, 2);
    $flush(R);
    assert.equal($read(value), 1);
    mock.timers.tick(100);
    assert.equal($read(value), 2);
  });

  it('$throttled shows the first change at once and the latest per period', () => {
    const source = $signal(R, 0);
    const { value } = $throttled(R, source, 100);
    $write(source, 1);
    $flush(R);
    assert.equal($read(value), 1);
    $write(source, 2);
    $flush(R);
    $write(source, 3);
    $flush(R);
    assert.equal($read(value), 1);
    mock.timers.tick(100);
    assert.equal($read(value), 3);
    mock.timers.tick(100);
    $write(source, 4);
    $flush(R);
    assert.equal($read(value), 4, 'a quiet period ended: at once again');
  });

  it('a timer never fires into a disposed root', () => {
    const source = $signal(R, 0);
    $debounced(R, source, 10);
    $write(source, 1);
    $flush(R);
    $dispose(R);
    assert.doesNotThrow(() => mock.timers.tick(100), 'the timer was cleared with the root');
  });
});

describe('$debounced and a wall clock set back', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
  afterEach(() => mock.timers.reset());

  it('$debounced still follows `wait` after the wall clock is set back an hour', () => {
    let wall = 10_000_000;
    const now = Date.now;
    Date.now = () => wall;
    try {
      const source = $signal(R, 'a');
      const { value } = $debounced(R, source, 100);
      $write(source, 'b');
      $flush(R);
      wall -= 3_600_000;
      mock.timers.tick(100);
      wall += 100;
      mock.timers.tick(100);
      wall += 100;
      assert.equal($read(value), 'b', 'shown within two periods, not an hour');
    } finally {
      Date.now = now;
    }
  });
});

/** Writes `next` to `source` and flushes its root. @param {any} source @param {any} next */
const change = (source, next) => {
  $write(source, next);
  $flush(source.root);
};

/**
 * Counts the timers armed through the global `setTimeout` (the mocked one)
 * while `fn` runs.
 * @param {() => void} fn @returns {number}
 */
function armed(fn) {
  const g = /** @type {any} */ (globalThis);
  const set = g.setTimeout;
  let n = 0;
  g.setTimeout = (/** @type {any[]} */ ...call) => (n++, set(...call)); // timer: feature, counts the code's own timers (mocked)
  try {
    fn();
  } finally {
    g.setTimeout = set;
  }
  return n;
}

describe('$debounced and $throttled: pacing', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] }));
  afterEach(() => mock.timers.reset());

  it('$debounced waits while changes come just under wait apart, and shows each just over', () => {
    const source = $signal(R, 0);
    const { value } = $debounced(R, source, 100);
    for (let i = 1; i <= 5; i++) {
      change(source, i);
      mock.timers.tick(99);
      assert.equal($read(value), 0, `change ${i} came before the quiet period ended`);
    }
    mock.timers.tick(1);
    assert.equal($read(value), 5, 'the source kept still for 100 ms');
    for (let i = 6; i <= 8; i++) {
      change(source, i);
      mock.timers.tick(101);
      assert.equal($read(value), i, `change ${i} kept still past wait`);
    }
  });

  it('$debounced arms one timer for many changes, and re-arms it once', () => {
    const source = $signal(R, 0);
    const { value } = $debounced(R, source, 100);
    let fired = 0;
    const burst = armed(() => {
      for (let i = 1; i <= 50; i++) {
        change(source, i);
        mock.timers.tick(1);
      }
    });
    assert.equal(burst, 1, 'fifty changes, one timer');
    const rest = armed(() => {
      mock.timers.tick(50);
      fired = $read(value);
      mock.timers.tick(48);
    });
    assert.equal(fired, 0, 'the first firing found a recent change');
    assert.equal(rest, 1, 'it re-armed itself once for the rest of the period');
    assert.equal($read(value), 0, 'the last change was at 49 ms: 1 ms still to wait');
    mock.timers.tick(1);
    assert.equal($read(value), 50);
    assert.equal(armed(() => mock.timers.tick(1000)), 0, 'nothing is left armed once it showed');
  });

  it('$debounced with leading shows the first change of each quiet period at once', () => {
    const source = $signal(R, 'a');
    const { value } = $debounced(R, source, 100, { leading: true });
    change(source, 'b');
    assert.equal($read(value), 'b', 'the first change of the first period');
    change(source, 'c');
    mock.timers.tick(60);
    change(source, 'd');
    assert.equal($read(value), 'b', 'later changes wait for the end');
    mock.timers.tick(99);
    assert.equal($read(value), 'b');
    mock.timers.tick(1);
    assert.equal($read(value), 'd', 'the latest shows at the end');
    change(source, 'e');
    assert.equal($read(value), 'e', 'the first change of the second period');
    mock.timers.tick(100);
    assert.equal($read(value), 'e', 'nothing else was held');
    change(source, 'f');
    assert.equal($read(value), 'f', 'a third period opens at once too');
  });

  it('$debounced cancel drops the pending update, and a new change starts over', () => {
    const source = $signal(R, 0);
    const { value, cancel } = $debounced(R, source, 100);
    change(source, 1);
    mock.timers.tick(50);
    cancel();
    mock.timers.tick(500);
    assert.equal($read(value), 0, 'canceled');
    change(source, 2);
    mock.timers.tick(99);
    assert.equal($read(value), 0, 'a full period from the new change');
    mock.timers.tick(1);
    assert.equal($read(value), 2);

    const lead = $debounced(R, source, 100, { leading: true });
    change(source, 3);
    change(source, 4);
    lead.cancel();
    mock.timers.tick(200);
    assert.equal($read(lead.value), 3, 'the held 4 was dropped');
    change(source, 5);
    assert.equal($read(lead.value), 5, 'after cancel the next change leads a new period');
  });

  it('$debounced takes an accessor as its source', () => {
    const count = $signal(R, 1);
    const { value } = $debounced(R, () => $read(count) * 10, 100);
    assert.equal($read(value), 10, 'starts at the source value');
    change(count, 2);
    mock.timers.tick(100);
    assert.equal($read(value), 20);
  });

  it('$throttled across three periods: burst, quiet, burst', () => {
    const source = $signal(R, 0);
    const { value } = $throttled(R, source, 100);
    change(source, 1);
    assert.equal($read(value), 1, 'first period: at once');
    mock.timers.tick(30);
    change(source, 2);
    mock.timers.tick(30);
    change(source, 3);
    assert.equal($read(value), 1, 'held within the period');
    mock.timers.tick(40);
    assert.equal($read(value), 3, 'the first period ends with the latest held');
    mock.timers.tick(50);
    change(source, 4);
    assert.equal($read(value), 3, 'the second period, opened by that write, holds it');
    mock.timers.tick(50);
    assert.equal($read(value), 4, 'the second period ends with it');
    mock.timers.tick(100);
    assert.equal($read(value), 4, 'the third period ends with nothing held and closes');
    mock.timers.tick(300);
    change(source, 5);
    assert.equal($read(value), 5, 'after a quiet time: at once');
    change(source, 6);
    change(source, 7);
    mock.timers.tick(99);
    assert.equal($read(value), 5);
    mock.timers.tick(1);
    assert.equal($read(value), 7);
  });

  it('the short spelling runs on the component root and ends with it', () => {
    /** @type {any} */
    let source;
    /** @type {any} */
    let slow;
    /** @type {any} */
    let even;
    const dom = onDom(() => {
      source = $signal($active(), 'a');
      slow = $debounced(() => $read(source), 100);
      even = $throttled(source, 100);
    });
    try {
      assert.equal($read(slow.value), 'a');
      $write(source, 'b');
      $flush(dom.root);
      assert.equal($read(even.value), 'b', 'throttled at once');
      mock.timers.tick(99);
      assert.equal($read(slow.value), 'a');
      mock.timers.tick(1);
      assert.equal($read(slow.value), 'b', 'debounced on the view root');
      $write(source, 'c');
      $flush(dom.root);
      assert.equal($read(slow.value), 'b', 'c waits for its quiet period');
    } finally {
      const g = /** @type {any} */ (globalThis);
      const clear = g.clearTimeout;
      let cleared = 0;
      g.clearTimeout = (/** @type {any} */ id) => (cleared++, clear(id));
      try {
        dom.dispose();
      } finally {
        g.clearTimeout = clear;
      }
      assert.ok(cleared >= 2, 'both pending timers were cleared with the view');
    }
    assert.doesNotThrow(() => mock.timers.tick(500), 'nothing fires into the disposed view');
  });
});
