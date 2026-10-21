// rui-core/hooks: each hook's behavior on a root of its own (root-first
// spelling), its cleanup with its owner, timers under node:test's mock
// timers, and hooks driving primitives the same on the DOM and on Skia.

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { $root, $signal, $read, $write, $flush, $dispose, $scope, $enter, $stop, $memo } from 'rrx-core';
import { View, Label, Action, Edit, Storage, Shelf, $provide, $active } from 'ren-core';
import {
  $open, $toggle, $counter, $bound, $previous, $map, $set, $pages, $selection,
  $debounce, $interval, $timeout, $idle,
  $os, $shortcuts, $outside, $hover, $move, $trap, $eyedropper,
  $localStorage, $sessionStorage, $clipboard, $fits, $scheme, $reducedMotion, $viewportSize, $online, $title, $fullscreen,
} from 'rui-core/hooks';
import { pageItems } from '../src/hooks/state.js';
import { both } from './harness.jsx';
import { Clock, manualClock } from 'rui-core';

/** A fresh root per test. */
let R = $root('hooks');
beforeEach(() => {
  R = $root('hooks');
});
afterEach(() => $dispose(R));

/** Runs `fn` in a scope of R; returns the scope (stop it to end the hooks). @template T @param {() => T} fn @returns {[T, any]} */
function owned(fn) {
  const scope = $scope(R);
  /** @type {any} */
  let out;
  $enter(scope, () => void (out = fn()));
  return [out, scope];
}

/** Flushes, then reads. @param {any} node */
const now = node => ($flush(R), $read(node));

describe('state hooks', () => {
  it('$open opens, closes and toggles, calling onChange on changes only', () => {
    /** @type {boolean[]} */
    const calls = [];
    const menu = $open(R, false, { onChange: next => calls.push(next) });
    assert.equal(now(menu.value), false);
    menu.open();
    menu.open();
    assert.equal(now(menu.value), true);
    menu.toggle();
    assert.equal(now(menu.value), false);
    menu.close();
    assert.deepEqual(calls, [true, false]);
  });

  it('$toggle moves to the next option and sets a given one', () => {
    const side = $toggle(R, ['start', 'center', 'end']);
    assert.equal(now(side.value), 'start');
    side.next();
    assert.equal(now(side.value), 'center');
    side.next();
    side.next();
    assert.equal(now(side.value), 'start', 'wraps around');
    side.set('end');
    assert.equal(now(side.value), 'end');
    const on = $toggle(R);
    on.next();
    assert.equal(now(on.value), true, 'booleans by default');
  });

  it('$counter clamps to min and max and resets to its start', () => {
    const seats = $counter(R, 5, { min: 0, max: 6 });
    seats.add();
    seats.add();
    assert.equal(now(seats.value), 6);
    seats.set(-10);
    assert.equal(now(seats.value), 0);
    seats.add(-1);
    assert.equal(now(seats.value), 0);
    seats.add(3);
    assert.equal(now(seats.value), 3, 'add takes a step');
    seats.reset();
    assert.equal(now(seats.value), 5);
    assert.equal(now($counter(R, 100, { max: 10 }).value), 10, 'the start is clamped too');
  });

  it('$bound takes events or values', () => {
    const f = $bound(R, '');
    const v = f.value;
    const onChange = f.set;
    onChange({ value: 'ren-core change' });
    assert.equal(now(v), 'ren-core change');
    onChange({ target: { value: 'dom event' } });
    assert.equal(now(v), 'dom event');
    onChange('plain');
    assert.equal(now(v), 'plain');
    onChange({ value: 1, other: 2 });
    assert.deepEqual(now(v), { value: 1, other: 2 }, 'a plain object is a value');
  });

  it('$previous gives the value before the current one', () => {
    const source = $signal(R, 1);
    const prev = $previous(R, source).value;
    assert.equal(now(prev), undefined);
    $write(source, 2);
    $flush(R);
    $write(source, 3);
    assert.equal(now(prev), 2, 'eager: every change moves it');
    assert.equal(now($previous(R, () => $read(source) * 10).value), undefined);
  });

  it('$map and $set notify their readers', () => {
    const m = $map(R, [['a', 1]]);
    const sum = $memo(R, () => [...m.values()].reduce((x, y) => x + y, 0));
    const size = $memo(R, () => m.size);
    assert.equal(now(sum), 1);
    m.set('b', 2);
    assert.equal(now(sum), 3);
    assert.equal(now(size), 2);
    m.delete('a');
    assert.equal(now(sum), 2);
    m.clear();
    assert.equal(now(size), 0);
    assert.ok(m instanceof Map);
    const s = $set(R, [1, 2]);
    const has3 = $memo(R, () => s.has(3));
    assert.equal(now(has3), false);
    s.add(3);
    assert.equal(now(has3), true);
    s.delete(3);
    assert.equal(now(has3), false);
    assert.deepEqual([...s], [1, 2]);
  });

  it('$pages gives the items to show and clamps pages', () => {
    const total = $signal(R, 20);
    /** @type {number[]} */
    const changes = [];
    const p = $pages(R, { total, defaultPage: 1, onChange: p => changes.push(p) });
    assert.deepEqual(now(p.items), [1, 2, 3, 4, 5, 'gap', 20]);
    p.go(10);
    assert.deepEqual(now(p.items), [1, 'gap', 9, 10, 11, 'gap', 20]);
    p.go(20);
    assert.deepEqual(now(p.items), [1, 'gap', 16, 17, 18, 19, 20]);
    p.step(1);
    assert.equal(now(p.page), 20, 'clamped at the end');
    p.go(1);
    p.step(-1);
    assert.equal(now(p.page), 1);
    $write(total, 5);
    assert.deepEqual(now(p.items), [1, 2, 3, 4, 5]);
    p.go(4);
    $write(total, 2);
    assert.equal(now(p.page), 2, 'a smaller total clamps the page');
    assert.deepEqual(changes, [10, 20, 1, 4], 'each new page only: no call for a step past an end');
    /** @type {number[]} */
    const told = [];
    const last = $pages(R, { total: 3, page: 3, onChange: p => told.push(p) });
    last.step(1);
    last.go(3);
    last.go(9);
    assert.deepEqual(told, [], 'on page 3 of 3: stepping on, or going to it again, is no new page');
    last.go(2);
    assert.deepEqual(told, [2]);
    const controlled = $pages(R, { total: 20, page: () => 10, around: 2, ends: 2 });
    assert.deepEqual(now(controlled.items), [1, 2, 'gap', 8, 9, 10, 11, 12, 'gap', 19, 20]);
    assert.deepEqual(now($pages(R, { total: 10, page: 7, around: 2, ends: 2 }).items), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'few pages: all');
  });

  it('pageItems keeps a fixed row: the ends, the current page, and a gap only for two or more pages', () => {
    for (const around of [0, 1, 2]) {
      for (const ends of [0, 1, 2]) {
        const row = ends * 2 + around * 2 + 3;
        for (let total = 1; total <= 24; total++) {
          for (let page = 1; page <= total; page++) {
            const items = pageItems(total, page, around, ends);
            const at = `total ${total} page ${page} around ${around} ends ${ends}`;
            assert.equal(items.length, Math.min(total, row), `the row keeps its length: ${at}`);
            assert.ok(items.includes(page), `the current page shows: ${at}`);
            for (let p = 1; p <= Math.min(ends, total); p++) assert.ok(items.includes(p) && items.includes(total + 1 - p), `the ends show: ${at}`);
            for (let p = Math.max(1, page - around); p <= Math.min(total, page + around); p++) assert.ok(items.includes(p), `the pages around show: ${at}`);
            const shown = /** @type {number[]} */ (items.filter(i => i !== 'gap'));
            assert.ok(shown.every((p, i) => i === 0 || p > shown[i - 1]), `in order: ${at}`);
            items.forEach((item, i) => {
              if (item !== 'gap') return;
              const before = /** @type {number} */ (items[i - 1] ?? 0);
              const after = /** @type {number} */ (items[i + 1] ?? total + 1);
              assert.ok(after - before > 2, `a gap hides two pages or more: ${at}`);
            });
            if (shown.length === total) assert.ok(!items.includes('gap'), `no gap when every page shows: ${at}`);
          }
        }
      }
    }
    assert.deepEqual(pageItems(9, 5, 1, 1), [1, 'gap', 4, 5, 6, 'gap', 9]);
    assert.deepEqual(pageItems(9, 4, 1, 1), [1, 2, 3, 4, 5, 'gap', 9], 'a slot beside the window shows its single hidden page');
    assert.deepEqual(pageItems(3, 2, 0, 0), [1, 2, 3], 'few pages: all');
  });

  it('$selection selects among the items and resets on a change when asked', () => {
    const items = $signal(R, [1, 2, 3]);
    const h = $selection(R, { items, initial: [1] });
    const sel = h.value;
    h.add(2);
    h.toggle(1);
    assert.deepEqual(now(sel), [2]);
    const has2 = $memo(R, () => h.has(2));
    assert.equal(now(has2), true);
    assert.equal(now(h.some), true);
    h.set([1, 2, 3]);
    assert.equal(now(h.all), true);
    $write(items, [2, 3]);
    assert.deepEqual(now(sel), [2, 3], 'items outside the list drop out');
    h.delete(3);
    assert.deepEqual(now(sel), [2]);
    h.clear();
    assert.deepEqual(now(sel), []);
    assert.equal(now(has2), false);
    const h2 = $selection(R, { items, resetOnItems: true });
    h2.add(2);
    assert.deepEqual(now(h2.value), [2]);
    $write(items, [2, 3, 4]);
    assert.deepEqual(now(h2.value), [], 'new items reset it');
    h2.add(4);
    assert.deepEqual(now(h2.value), [4]);
    const pair = $signal(R, [1, 2]);
    const twice = $selection(R, { items: pair, initial: [2, 2] });
    assert.deepEqual([now(twice.value), now(twice.all), now(twice.some)], [[2], false, true], 'a doubled initial pick counts once');
    twice.set([1, 1]);
    assert.deepEqual([now(twice.value), now(twice.all), now(twice.some)], [[1], false, true], 'a doubled pick counts once: not all');
  });
});

describe('time hooks (mock timers)', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval'] }));
  afterEach(() => mock.timers.reset());

  it('$debounce calls once with the last arguments; flush, cancel, flushOnEnd', () => {
    /** @type {any[]} */
    const calls = [];
    const fn = $debounce(R, (/** @type {any} */ x) => calls.push(x), 100);
    fn(1);
    fn(2);
    assert.equal(fn.pending(), true);
    mock.timers.tick(100);
    assert.deepEqual(calls, [2]);
    fn(3);
    fn.flush();
    assert.deepEqual(calls, [2, 3]);
    fn(4);
    fn.cancel();
    mock.timers.tick(200);
    assert.deepEqual(calls, [2, 3]);
    const [f, scope] = owned(() => $debounce(R, (/** @type {any} */ x) => calls.push(x), { wait: 50, flushOnEnd: true }));
    f(5);
    $stop(scope);
    assert.deepEqual(calls, [2, 3, 5], 'flushed when its owner ended');
    const lead = $debounce(R, (/** @type {any} */ x) => calls.push(x), { wait: 50, leading: true });
    lead(6);
    lead(7);
    assert.deepEqual(calls.slice(3), [6]);
    mock.timers.tick(50);
    assert.deepEqual(calls.slice(3), [6, 7]);
  });

  it('$interval runs while started and stops with its owner', () => {
    let n = 0;
    const [iv, scope] = owned(() => $interval(R, () => n++, 10, { auto: true }));
    assert.equal(now(iv.value), true);
    mock.timers.tick(35);
    assert.equal(n, 3);
    iv.toggle();
    assert.equal(now(iv.value), false);
    mock.timers.tick(50);
    assert.equal(n, 3);
    iv.start();
    mock.timers.tick(10);
    assert.equal(n, 4);
    $stop(scope);
    mock.timers.tick(100);
    assert.equal(n, 4, 'cleared with its owner');
  });

  it('$timeout calls once after its delay with the start arguments', () => {
    /** @type {any[]} */
    const calls = [];
    const [t, scope] = owned(() => $timeout(R, (/** @type {any} */ x) => calls.push(x), 100));
    assert.equal(now(t.value), false);
    t.start('a');
    assert.equal(now(t.value), true);
    mock.timers.tick(50);
    t.start('b');
    mock.timers.tick(100);
    assert.deepEqual(calls, ['b']);
    assert.equal(now(t.value), false, 'no call waits after it ran');
    t.start('c');
    t.stop();
    assert.equal(now(t.value), false);
    t.start('d');
    $stop(scope);
    mock.timers.tick(200);
    assert.deepEqual(calls, ['b'], 'cleared with its owner');
  });

  it('$idle turns idle after the timeout and active on activity', () => {
    const idle = $idle(R, 1000);
    assert.equal($read(idle.value), false);
    mock.timers.tick(1000);
    assert.equal($read(idle.value), true);
    idle.props.onPointerMove({});
    assert.equal(now(idle.value), false);
    mock.timers.tick(999);
    idle.props.onKey({});
    mock.timers.tick(999);
    assert.equal($read(idle.value), false);
    mock.timers.tick(1);
    assert.equal($read(idle.value), true);
    assert.equal($read($idle(R, 10, { initial: true }).value), true, 'initial: true starts idle');
  });

});

describe('input hooks', () => {
  it('$os reads the user agent', () => {
    assert.equal($os('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)').value, 'macos');
    assert.equal($os('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)').value, 'ios');
    assert.equal($os('Mozilla/5.0 (Windows NT 10.0; Win64; x64)').value, 'windows');
    assert.equal($os('Mozilla/5.0 (Linux; Android 14)').value, 'android');
    assert.equal($os('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)').value, 'chromeos');
    assert.equal($os('Mozilla/5.0 (X11; Linux x86_64)').value, 'linux');
    assert.equal($os('').value, 'unknown');
    assert.equal(typeof $os().value, 'string');
  });

  it('$outside calls back for presses not marked inside', () => {
    /** @type {any[]} */
    const outside = [];
    const c = $outside(e => outside.push(e));
    const inner = { id: 'in' };
    c.inside.onPointerDown(inner);
    c.outside.onPointerDown(inner);
    const other = { id: 'out' };
    c.outside.onPointerDown(other);
    assert.deepEqual(outside, [other]);
  });

  it('$hover and $move follow pointer events', () => {
    const h = $hover(R);
    h.props.onPointerEnter();
    assert.equal(now(h.value), true);
    h.props.onPointerLeave();
    assert.equal(now(h.value), false);
    /** @type {any[]} */
    const positions = [];
    /** @type {string[]} */
    const phases = [];
    const m = $move(R, p => positions.push(p), { onMoveStart: () => phases.push('start'), onMoveEnd: () => phases.push('end') });
    let captured = -1;
    const el = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 50 }), setPointerCapture: (/** @type {number} */ id) => void (captured = id) };
    m.props.onPointerMove({ clientX: 0, clientY: 0 });
    assert.equal(positions.length, 0, 'nothing before a press');
    m.props.onPointerDown({ button: 0, pointerId: 7, currentTarget: el, clientX: 60, clientY: 45 });
    assert.equal(captured, 7);
    assert.equal(now(m.value), true);
    m.props.onPointerMove({ clientX: 500, clientY: -5 });
    m.props.onPointerUp({ clientX: 10, clientY: 70 });
    assert.equal(now(m.value), false);
    assert.deepEqual(positions, [{ x: 0.5, y: 0.5 }, { x: 1, y: 0 }, { x: 0, y: 1 }]);
    assert.deepEqual(phases, ['start', 'end']);
    const rtl = $move(R, p => positions.push(p), { dir: 'rtl' });
    rtl.props.onPointerDown({ button: 0, currentTarget: el, clientX: 35, clientY: 20 });
    assert.deepEqual(positions.at(-1), { x: 0.75, y: 0 });
    // A press the browser takes back ends where the last move left it: its point is not reported.
    const count = positions.length;
    rtl.props.onPointerCancel();
    assert.equal(now(rtl.value), false);
    assert.equal(positions.length, count);
    // The element keeps a touch for the drag, on every renderer.
    assert.deepEqual(m.props.style, { touchAction: 'none' });
  });
});

describe('platform hooks', () => {
  /** A Web Storage in memory. */
  const memory = () => {
    const map = new Map();
    return {
      getItem: (/** @type {string} */ k) => (map.has(k) ? map.get(k) : null),
      setItem: (/** @type {string} */ k, /** @type {string} */ v) => void map.set(k, String(v)),
      removeItem: (/** @type {string} */ k) => void map.delete(k),
      key: (/** @type {number} */ i) => [...map.keys()][i] ?? null,
      get length() {
        return map.size;
      },
      map,
    };
  };

  it('$localStorage uses the platform storage outside an application root; hooks on a key agree', () => {
    const g = /** @type {any} */ (globalThis);
    const saved = Object.getOwnPropertyDescriptor(g, 'localStorage');
    const store = memory();
    Object.defineProperty(g, 'localStorage', { value: store, configurable: true, writable: true });
    try {
      store.setItem('broken', '{nope');
      const broken = $localStorage(R, { key: 'broken', fallback: 'none' });
      assert.equal(now(broken.value), 'none', 'unparsable text gives the fallback');
      const a = $localStorage(R, { key: 'sidebar', fallback: 'docked' });
      const b = $localStorage(R, { key: 'sidebar', fallback: 'docked' }).value;
      assert.equal(now(a.value), 'docked');
      a.set('floating');
      assert.equal(store.getItem('sidebar'), '"floating"');
      assert.equal(now(b), 'floating', 'another hook on the key follows');
      a.set((/** @type {string} */ c) => `${c}-wide`);
      assert.equal(now(a.value), 'floating-wide');
      a.remove();
      assert.equal(now(b), 'docked');
      const obj = $localStorage(R, { key: 'o', fallback: { n: 0 } });
      obj.set({ n: 2 });
      const first = now(obj.value);
      assert.deepEqual(first, { n: 2 });
      assert.equal(now(obj.value), first, 'the same text keeps its value');
      // `print` and `parse` replace JSON: a count kept as plain digits.
      const count = $localStorage(R, { key: 'count', fallback: 0, print: (/** @type {number} */ n) => String(n), parse: (/** @type {string} */ t) => Number.parseInt(t, 10) });
      count.set(41);
      assert.equal(store.getItem('count'), '41');
      store.setItem('count', '42');
      assert.equal(now($localStorage(R, { key: 'count', fallback: 0, parse: (/** @type {string} */ t) => Number.parseInt(t, 10) }).value), 42);
    } finally {
      if (saved) Object.defineProperty(g, 'localStorage', saved);
      else delete g.localStorage;
    }
  });

  it('$localStorage and $sessionStorage fall back to memory without a platform storage', () => {
    const v = $localStorage(R, { key: 'k', fallback: 1 });
    v.set(2);
    assert.equal(now(v.value), 2);
    assert.equal(now($localStorage(R, { key: 'k', fallback: 1 }).value), 2);
    const s = $sessionStorage(R, { key: 'k', fallback: 'x' });
    assert.equal(now(s.value), 'x', 'session and local keys are apart');
    s.set('y');
    assert.equal(now(s.value), 'y');
    const other = $root('other');
    assert.equal($read($localStorage(other, { key: 'k', fallback: 1 }).value), 1, 'roots are isolated');
    $dispose(other);
  });

  it('$localStorage uses the Storage an application root provides (keys ren:<id>:*)', () => {
    const backing = memory();
    const shelf = new Shelf(R, backing);
    const [theme, tab] = $provide(R, Storage, shelf, () => [
      $localStorage(R, { key: 'theme', fallback: 'light' }),
      $sessionStorage(R, { key: 'tab', fallback: 0 }),
    ]);
    theme.set('dark');
    assert.equal(now(theme.value), 'dark');
    assert.equal(backing.getItem('ren:hooks:theme'), '"dark"');
    shelf.set('theme', '"blue"');
    assert.equal(now(theme.value), 'blue', 'a write through the Storage (another tab, the worker) shows');
    tab.set(3);
    assert.equal(now(tab.value), 3, 'session storage in memory here (node has none)');
  });

  it('$clipboard copies through navigator.clipboard, or fails into error', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const c = $clipboard(R, { hold: 'calm' });
      const g = /** @type {any} */ (globalThis);
      const had = Object.getOwnPropertyDescriptor(g, 'navigator');
      /** @type {string[]} */
      const written = [];
      Object.defineProperty(g, 'navigator', { value: { clipboard: { writeText: async (/** @type {string} */ t) => void written.push(t) } }, configurable: true });
      try {
        assert.equal(await c.copy('hello'), true, 'it copied');
        assert.deepEqual(written, ['hello']);
        assert.equal($read(c.value), true);
        mock.timers.tick(299);
        assert.equal($read(c.value), true, 'held for a calm motion (300 ms)');
        mock.timers.tick(1);
        assert.equal($read(c.value), false);
        Object.defineProperty(g, 'navigator', { value: {}, configurable: true });
        assert.equal(await c.copy('x'), false, 'it could not');
        assert.match(String($read(c.error)), /no clipboard/);
        c.reset();
        assert.equal(now(c.error), null);
      } finally {
        if (had) Object.defineProperty(g, 'navigator', had);
      }
    } finally {
      mock.timers.reset();
    }
  });

  it("$clipboard copies through the browser's copy command where the Clipboard API is missing or refuses, the focus given back", async () => {
    const c = $clipboard(R);
    const g = /** @type {any} */ (globalThis);
    const had = { navigator: Object.getOwnPropertyDescriptor(g, 'navigator'), document: Object.getOwnPropertyDescriptor(g, 'document') };
    /** @type {string[]} */
    const log = [];
    /** A document with a focused field (its selection 2..4), whose copy command copies the focused field's selection. */
    const fake = (/** @type {boolean} */ works) => {
      /** @type {any[]} */
      const body = [];
      const field = { selectionStart: 2, selectionEnd: 4, selectionDirection: 'forward', focus: () => void (doc.activeElement = field), setSelectionRange: (/** @type {number} */ a, /** @type {number} */ b) => void log.push(`field ${a}-${b}`) };
      /** @type {any} */
      const doc = {
        activeElement: field,
        body: { appendChild: (/** @type {any} */ n) => void body.push(n) },
        getSelection: () => null,
        createElement: () => {
          /** @type {any} */
          const area = { value: '', style: {}, setAttribute: () => {}, focus: () => void (doc.activeElement = area), select: () => {}, setSelectionRange: () => {}, remove: () => void body.splice(body.indexOf(area), 1) };
          return area;
        },
        execCommand: (/** @type {string} */ command) => {
          log.push(`${command} ${doc.activeElement.value}`);
          return works;
        },
      };
      return { doc, field, body };
    };
    try {
      // No Clipboard API (a page outside a secure context).
      Object.defineProperty(g, 'navigator', { value: {}, configurable: true });
      let f = fake(true);
      Object.defineProperty(g, 'document', { value: f.doc, configurable: true });
      assert.equal(await c.copy('x'), true, 'copied by the command');
      assert.deepEqual(log.splice(0), ['copy x', 'field 2-4'], "the command copied the hidden field's text; the field took its selection back");
      assert.equal(f.body.length, 0, 'the hidden field is gone');
      assert.equal(f.doc.activeElement, f.field, 'the focus is back');
      assert.equal(now(c.error), null);
      // The Clipboard API refuses: the command still copies.
      Object.defineProperty(g, 'navigator', { value: { clipboard: { writeText: async () => Promise.reject(new Error('NotAllowedError')) } }, configurable: true });
      assert.equal(await c.copy('y'), true);
      assert.deepEqual(log.splice(0), ['copy y', 'field 2-4']);
      // Both fail: the error is the API's.
      f = fake(false);
      Object.defineProperty(g, 'document', { value: f.doc, configurable: true });
      assert.equal(await c.copy('z'), false);
      assert.match(String(now(c.error)), /NotAllowedError/);
    } finally {
      for (const [name, d] of Object.entries(had)) {
        if (d) Object.defineProperty(g, name, d);
        else delete g[name];
      }
    }
  });

  it('$clipboard pastes through navigator.clipboard.readText, or gives null and the error', async () => {
    const c = $clipboard(R);
    const g = /** @type {any} */ (globalThis);
    const had = Object.getOwnPropertyDescriptor(g, 'navigator');
    try {
      Object.defineProperty(g, 'navigator', { value: { clipboard: { readText: async () => 'pasted' } }, configurable: true });
      assert.equal(await c.paste(), 'pasted');
      assert.equal(now(c.error), null);
      Object.defineProperty(g, 'navigator', { value: { clipboard: { readText: async () => Promise.reject(new Error('NotAllowedError')) } }, configurable: true });
      assert.equal(await c.paste(), null, 'refused');
      assert.match(String(now(c.error)), /NotAllowedError/);
      Object.defineProperty(g, 'navigator', { value: {}, configurable: true });
      assert.equal(await c.paste(), null, 'no clipboard (a worker, node)');
      assert.match(String(now(c.error)), /no clipboard/);
    } finally {
      if (had) Object.defineProperty(g, 'navigator', had);
    }
  });

  it('media queries follow matchMedia, with inert defaults where there is none', () => {
    assert.equal($read($fits(R, '(min-width: 1px)').value), false);
    assert.equal($read($fits(R, '(min-width: 1px)', true).value), true);
    assert.equal($read($scheme(R).value), 'light');
    assert.equal($read($scheme(R, 'dark').value), 'dark');
    assert.equal($read($reducedMotion(R).value), false);
    const g = /** @type {any} */ (globalThis);
    /** @type {Set<any>} */
    const listeners = new Set();
    const list = { matches: true, addEventListener: (/** @type {string} */ _, /** @type {any} */ f) => listeners.add(f), removeEventListener: (/** @type {string} */ _, /** @type {any} */ f) => listeners.delete(f) };
    g.matchMedia = () => list;
    try {
      const [dark, scope] = owned(() => $scheme(R).value);
      assert.equal(now(dark), 'dark');
      for (const f of listeners) f({ matches: false });
      assert.equal($read(dark), 'light', 'a change flushes itself');
      $stop(scope);
      assert.equal(listeners.size, 0, 'the listener goes with its owner');
    } finally {
      delete g.matchMedia;
    }
  });

  it('in a component, media queries and the viewport size read the root\'s viewport on every renderer', () => {
    const view = () => {
      const wide = $fits('(min-width: 48em)').value;
      const scheme = $scheme().value;
      const still = $reducedMotion().value;
      const size = $viewportSize().value;
      return <Label text={() => `${$read(wide) ? 'wide' : 'narrow'} ${$read(scheme)} ${$read(still) ? 'still' : 'moving'} ${$read(size).width}x${$read(size).height}`} />;
    };
    // No matchMedia on node's globalThis: the answers come from each root's host.
    assert.equal(typeof (/** @type {any} */ (globalThis).matchMedia), 'undefined');
    const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
    assert.equal(dom.text(), 'narrow light moving 480x300');
    assert.equal(skia.text(), 'narrow light moving 480x300');
    dom.resize(800, 600);
    skia.resize(800, 600);
    assert.equal(dom.text(), 'wide light moving 800x600');
    assert.equal(skia.text(), 'wide light moving 800x600');
    dispose();
    const [size, scope] = owned(() => $viewportSize(R).value);
    assert.deepEqual($read(size), { width: 0, height: 0 }, 'outside a view, no window in node: 0 × 0');
    $stop(scope);
  });

  it('$online, $title and $fullscreen keep inert defaults in node', async () => {
    assert.equal($read($online(R).value).online, true);
    assert.doesNotThrow(() => $title(R, 'x'));
    const f = $fullscreen(R);
    await f.toggle();
    assert.equal($read(f.value), false);
  });

  it('$title follows its title where there is a document', () => {
    const g = /** @type {any} */ (globalThis);
    g.document = { title: '' };
    try {
      const title = $signal(R, 'One');
      $title(R, title);
      $flush(R);
      assert.equal(g.document.title, 'One');
      $write(title, 'Two');
      $flush(R);
      assert.equal(g.document.title, 'Two');
      $write(title, '  ');
      $flush(R);
      assert.equal(g.document.title, 'Two', 'an empty title is left alone');
    } finally {
      delete g.document;
    }
  });
});

describe('hooks on the DOM and on Skia', () => {
  it('$open and $counter drive the same views', () => {
    const view = () => {
      const open = $open();
      const count = $counter(0, { max: 2 });
      return (
        <View>
          <Action onPress={open.toggle}>Toggle</Action>
          <Action onPress={() => count.add()}>More</Action>
          <Label>{() => (($read(open.value) ? 'open' : 'closed') + ` ${$read(count.value)}`)}</Label>
        </View>
      );
    };
    const { dom, skia, dispose } = both(view);
    for (const side of [dom, skia]) {
      assert.equal(side.text(), 'Toggle More closed 0');
      side.press('Toggle');
      side.press('More');
      side.press('More');
      side.press('More');
      assert.equal(side.text(), 'Toggle More open 2');
    }
    dispose();
  });

  it('$shortcuts reads the key first: on QWERTZ Ctrl+Z is undo only; the key position serves a layout without the letter', () => {
    /** @type {string[]} */
    const ran = [];
    const on = $shortcuts(R, { 'ctrl+z': () => ran.push('undo'), 'ctrl+y': () => ran.push('redo') });
    const press = (/** @type {string} */ key, /** @type {string} */ code) => {
      ran.length = 0;
      on({ key, code, ctrlKey: true, preventDefault() {} });
      return [...ran];
    };
    assert.deepEqual(press('z', 'KeyY'), ['undo'], 'QWERTZ Ctrl+Z: its key, not its position');
    assert.deepEqual(press('y', 'KeyZ'), ['redo'], 'QWERTZ Ctrl+Y');
    assert.deepEqual(press('я', 'KeyZ'), ['undo'], 'a Cyrillic layout: the position, as no key chord matches');
  });

  it('$hover, $shortcuts and $bound work on both renderers', () => {
    /** @type {any[]} */
    const refs = [];
    const view = () => {
      const { value: hovered, props } = $hover();
      const { value: text, set: onChange } = $bound('');
      const hits = $counter(0);
      const onKey = $shortcuts({ 'primary+Enter': () => hits.add() });
      return (
        <View style={{ padding: 8 }}>
          <View {...props} style={{ width: 100, height: 40 }} ref={(/** @type {any} */ n) => refs.push({ box: n })}>
            <Label>{() => ($read(hovered) ? 'in' : 'out')}</Label>
          </View>
          <Edit value={text} onChange={onChange} onKey={onKey} ref={(/** @type {any} */ n) => refs.push({ edit: n })} />
          <Label>{() => `typed ${$read(text)} hits ${$read(hits.value)}`}</Label>
        </View>
      );
    };
    const { dom, skia, dispose } = both(view);
    const [domBox, domEdit, skiaBox, skiaEdit] = [refs[0].box, refs[1].edit, refs[2].box, refs[3].edit];
    assert.equal(dom.text(), 'out typed hits 0');
    assert.equal(skia.text(), 'out typed hits 0');

    // The DOM: pointer events on the element, input and keydown on the field.
    domBox.dispatchEvent(new dom.window.PointerEvent('pointerenter'));
    domEdit.value = 'hey';
    domEdit.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    domEdit.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    assert.equal(dom.text(), 'in hey typed hey hits 1');
    domBox.dispatchEvent(new dom.window.PointerEvent('pointerleave'));
    assert.equal(dom.text(), 'out hey typed hey hits 1');

    // Skia: the pointer moves over the box, the field takes typing and keys.
    skia.text();
    const b = skiaBox.getBoundingClientRect();
    skia.skia.move(b.x + 5, b.y + 5);
    skiaEdit.focus();
    skia.skia.type('hey');
    skia.skia.key('Enter', false, { ctrlKey: true });
    $flush(skia.root);
    assert.equal(skia.text(), 'in hey typed hey hits 1');
    skia.skia.move(b.x + 300, b.y + 200);
    $flush(skia.root);
    assert.equal(skia.text(), 'out hey typed hey hits 1');
    dispose();
  });

  it('$outside tells presses inside from outside on both renderers', () => {
    const view = () => {
      const n = $counter(0);
      const { inside, outside } = $outside(() => n.add());
      return (
        <View {...outside} style={{ width: 300, height: 200, padding: 10, gap: 10 }}>
          <Action {...inside}>Inside</Action>
          <Action>Elsewhere</Action>
          <Label>{() => `outside ${$read(n.value)}`}</Label>
        </View>
      );
    };
    const { dom, skia, dispose } = both(view);
    // happy-dom's click carries no pointerdown: dispatch it where the press lands.
    const domDown = (/** @type {string} */ text) => {
      const node = dom.nodes('Action').find(n => n.textContent.trim() === text);
      node.dispatchEvent(new dom.window.PointerEvent('pointerdown', { bubbles: true }));
      $flush(dom.root);
    };
    domDown('Inside');
    domDown('Elsewhere');
    domDown('Elsewhere');
    skia.press('Inside');
    skia.press('Elsewhere');
    skia.press('Elsewhere');
    assert.equal(dom.text(), 'Inside Elsewhere outside 2');
    assert.equal(skia.text(), 'Inside Elsewhere outside 2');
    dispose();
  });
});

describe('$trap and $eyedropper', () => {
  it('$trap: its props trap Tab inside, its initial focus takes the focus when it activates', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const actives = [];
    const Trapped = () => {
      const on = $signal($active(), false);
      actives.push(on);
      const trap = $trap(on);
      return (
        <View>
          <Action>before</Action>
          <View {...trap.props}>
            <Action>A</Action>
            <Action ref={trap.start}>B</Action>
          </View>
          <Action>after</Action>
        </View>
      );
    };
    const { dom, skia, dispose } = both(() => (
      <Clock value={clock}>
        <Trapped />
      </Clock>
    ));
    const flush = () => ($flush(dom.root), $flush(skia.root));
    for (const a of actives) $write(a, true);
    flush();
    clock.advance(16);
    assert.deepEqual([dom.document.activeElement?.textContent, skia.skia.focused?.text], ['B', 'B'], 'the initial focus');
    skia.skia.key('Tab');
    $flush(skia.root);
    assert.equal(skia.skia.focused?.text, 'A', 'Skia: from the last back to the first');
    const b = dom.nodes('Action').find((/** @type {any} */ n) => n.textContent === 'B');
    b.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    assert.equal(dom.document.activeElement.textContent, 'A', 'DOM: the same');
    for (const a of actives) $write(a, false);
    flush();
    skia.skia.key('Tab');
    skia.skia.key('Tab');
    $flush(skia.root);
    assert.equal(skia.skia.focused?.text, 'after', 'inactive: Tab goes on');
    dispose();
  });

  it('$trap without an initial focus: its first focusable takes the focus', () => {
    const clock = manualClock();
    const Trapped = () => {
      const trap = $trap(true);
      return (
        <View>
          <Action>before</Action>
          <View {...trap.props}>
            <Label>title</Label>
            <Action>A</Action>
            <Action>B</Action>
          </View>
        </View>
      );
    };
    const { dom, skia, dispose } = both(() => (
      <Clock value={clock}>
        <Trapped />
      </Clock>
    ));
    clock.advance(16);
    assert.deepEqual([dom.document.activeElement?.textContent, skia.skia.focused?.text], ['A', 'A']);
    dispose();
  });

  it('$eyedropper: the platform’s EyeDropper where present, inert elsewhere', async () => {
    const g = /** @type {any} */ (globalThis);
    const [inert] = owned(() => $eyedropper(R));
    assert.equal(inert.available, false);
    assert.equal(await inert.pick(), null);
    /** @type {any[]} */
    const signals = [];
    g.EyeDropper = class {
      /** @param {{ signal: AbortSignal }} o */
      open(o) {
        signals.push(o.signal);
        return signals.length === 1 ? Promise.resolve({ sRGBHex: '#2d83db' }) : Promise.reject(new DOMException('canceled', 'AbortError'));
      }
    };
    try {
      const [dropper, scope] = owned(() => $eyedropper(R));
      assert.equal(dropper.available, true);
      assert.equal(await dropper.pick(), '#2d83db');
      assert.equal(now(dropper.value), '#2d83db');
      assert.equal(await dropper.pick(), null, 'a cancel gives no color');
      assert.equal(now(dropper.value), '#2d83db');
      assert.ok(signals[0] instanceof AbortSignal);
      assert.equal(await dropper.pick({ signal: AbortSignal.abort() }), null, 'an aborted signal: no pick');
      assert.equal(signals.length, 2, 'the platform picker is not opened');
      // A signal that outlives its pick keeps no listener from it.
      const outer = new AbortController();
      let added = 0;
      let removed = 0;
      const add = outer.signal.addEventListener.bind(outer.signal);
      const remove = outer.signal.removeEventListener.bind(outer.signal);
      outer.signal.addEventListener = (/** @type {any[]} */ ...a) => (added++, add(...a));
      outer.signal.removeEventListener = (/** @type {any[]} */ ...a) => (removed++, remove(...a));
      assert.equal(await dropper.pick({ signal: outer.signal }), null);
      assert.deepEqual([added, removed], [1, 1], 'its listener removed once the pick settles');
      $stop(scope);
    } finally {
      delete g.EyeDropper;
    }
  });
});
