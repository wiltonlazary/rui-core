// RangeSlider on the DOM and on Skia: which thumb a press moves, the one
// rule that settles drags and keys (push, no push, the spans), the change
// and commit calls, and each thumb's accessible name.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $signal, $read, $write, $flush } from 'rrx-core';
import { $active } from 'ren-core';
import { Rui, Stack, RangeSlider } from 'rui-core';
import { both } from './harness.jsx';

// ---------------------------------------------------------------------------
// Driving both renderers the same way (the DOM's boxes are Skia's, since
// happy-dom lays nothing out).

/** The primitives on Skia in tree order (no text runs, no markers). @param {any} skia */
function primitives(skia) {
  skia.skia.present();
  /** @type {any[]} */
  const out = [];
  const walk = (/** @type {any} */ n) => {
    for (let c = n.first; c !== null; c = c.next) {
      if (c.kind <= 7) out.push(c);
      walk(c);
    }
  };
  walk(skia.skia.root);
  return out;
}

/** Gives every DOM primitive the box of its Skia twin. @param {any} dom @param {any} skia */
function mirror(dom, skia) {
  $flush(dom.root);
  const nodes = [...dom.host.querySelectorAll('[data-ren]')];
  const twins = primitives(skia);
  assert.equal(nodes.length, twins.length, 'the same primitives on both');
  nodes.forEach((n, i) => {
    n.getBoundingClientRect = () => primitives(skia)[i].getBoundingClientRect();
  });
  return nodes;
}

/** The deepest DOM primitive whose box holds a point. @param {any} dom @param {any} skia @param {number} x @param {number} y */
function hit(dom, skia, x, y) {
  let found = null;
  for (const n of mirror(dom, skia)) {
    const r = n.getBoundingClientRect();
    if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) found = n;
  }
  if (found === null) throw new Error(`nothing at ${x}, ${y}`);
  return found;
}

/**
 * A drag through points on both: press at the first, move through the
 * rest, release at the last (the DOM's events stay on the pressed node, as
 * a capture keeps them).
 * @param {any} dom @param {any} skia @param {[number, number][]} points
 */
function drag(dom, skia, points) {
  const [x0, y0] = points[0];
  const node = hit(dom, skia, x0, y0);
  const send = (/** @type {string} */ type, /** @type {number} */ x, /** @type {number} */ y) => {
    node.dispatchEvent(new dom.window.PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, buttons: type === 'pointerup' ? 0 : 1 }));
    $flush(dom.root);
  };
  send('pointerdown', x0, y0);
  skia.skia.press(x0, y0);
  for (const [x, y] of points.slice(1)) {
    send('pointermove', x, y);
    skia.skia.move(x, y);
  }
  const [x1, y1] = points[points.length - 1];
  send('pointerup', x1, y1);
  skia.skia.release(x1, y1);
  skia.skia.leave();
  $flush(skia.root);
  $flush(dom.root);
}

/** The Action items on Skia (the thumbs), in tree order. @param {any} skia */
function actions(skia) {
  return primitives(skia).filter(n => n.kind === 5);
}

/**
 * A controlled RangeSlider on both renderers, from 0 to 100 unless `props`
 * says otherwise, with every change and commit heard on each root.
 * @param {[number, number]} start @param {Record<string, any>} [props]
 */
function range(start, props = {}) {
  /** @type {any[]} */
  const list = [];
  /** @type {[number, number][]} */
  const changes = [];
  /** @type {[number, number][]} */
  const commits = [];
  const view = () => {
    const v = $signal($active(), start);
    list.push(v);
    return (
      <Rui>
        <Stack p="xl">
          <RangeSlider
            value={v}
            onChange={(/** @type {[number, number]} */ x) => {
              changes.push(x);
              $write(v, x);
            }}
            onCommit={(/** @type {[number, number]} */ x) => commits.push(x)}
            {...props}
          />
        </Stack>
      </Rui>
    );
  };
  const { dom, skia, dispose } = both(view);
  const area = primitives(skia).find(n => n.pointers)?.getBoundingClientRect();
  if (area == null) throw new Error('no track');
  const lo = read(props.min, 0);
  const hi = read(props.max, 100);
  /** The point on the track of a value. @param {number} v @returns {[number, number]} */
  const at = v => [area.left + (area.width * Math.min(v - lo, (hi - lo) * 0.999)) / (hi - lo), area.top + area.height / 2];
  const thumbs = () => dom.nodes('Action').filter((/** @type {any} */ n) => n.getAttribute('role') === 'slider');
  /** Each root's pair; both must agree. */
  const get = () => {
    const pairs = list.map(s => $read(s));
    assert.deepEqual(pairs[0], pairs[1], 'the same pair on the DOM and on Skia');
    return pairs[0];
  };
  /** A drag from value to value. @param {number[]} values */
  const slide = (...values) => drag(dom, skia, values.map(at));
  /** A key on thumb `i` on both. @param {number} i @param {string} key */
  const key = (i, key) => {
    const node = thumbs()[i];
    node.focus();
    node.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    $flush(dom.root);
    actions(skia)[i].focus();
    skia.skia.key(key);
    $flush(skia.root);
  };
  return { dom, skia, dispose, get, slide, key, thumbs, changes, commits };
}

/** A prop's value or a fallback. @param {any} v @param {number} fallback */
const read = (v, fallback) => (typeof v === 'number' ? v : fallback);

/** A drag of one thumb from `start` on a fresh slider, and the pair after it. @param {[number, number]} start @param {Record<string, any>} props @param {number[]} values */
function after(start, props, ...values) {
  const r = range(start, props);
  r.slide(...values);
  const pair = r.get();
  r.dispose();
  return pair;
}

describe('RangeSlider on the DOM and on Skia', () => {
  it('a press moves the nearer thumb, and a drag keeps it', () => {
    assert.deepEqual(after([20, 80], {}, 70), [20, 70]);
    assert.deepEqual(after([20, 80], {}, 30), [30, 80]);
    assert.deepEqual(after([20, 80], {}, 75, 90), [20, 90], 'a drag from near the upper value moves the upper');
    assert.deepEqual(after([20, 80], {}, 25, 10), [10, 80]);
  });

  it('the tie rules', () => {
    assert.deepEqual(after([20, 60], {}, 40), [20, 40], 'between, the upper has room: the upper');
    assert.deepEqual(after([20, 100], {}, 60), [60, 100], 'between, the upper at max: the lower');
    assert.deepEqual(after([50, 50], { minSpan: 0 }, 70), [50, 70], 'above both: the upper');
    assert.deepEqual(after([50, 50], { minSpan: 0 }, 30), [30, 50], 'below both: the lower');
    assert.deepEqual(after([100, 100], { minSpan: 0 }, 100, 60), [60, 100], 'together at max: the lower');
    assert.deepEqual(after([0, 0], { minSpan: 0 }, 0, 40), [0, 40], 'together at min: the upper');
  });

  it('push with minSpan: the other thumb moves the least, and stops at a bound', () => {
    assert.deepEqual(after([20, 80], { minSpan: 10 }, 20, 55), [55, 80]);
    assert.deepEqual(after([20, 80], { minSpan: 10 }, 20, 75), [75, 85]);
    assert.deepEqual(after([20, 60], { minSpan: 10 }, 20, 100), [90, 100]);
    assert.deepEqual(after([40, 80], { minSpan: 10 }, 80, 0), [0, 10], 'the upper pushes the lower down to min');
  });

  it('no push: the moved thumb stops minSpan from the other', () => {
    assert.deepEqual(after([20, 80], { minSpan: 10, push: false }, 20, 75), [70, 80]);
    assert.deepEqual(after([20, 60], { minSpan: 10, push: false }, 20, 100), [50, 60]);
    assert.deepEqual(after([20, 60], { minSpan: 10, push: false }, 60, 5), [20, 30]);
  });

  it('maxSpan: pulls the other along with push, stops the moved thumb without', () => {
    assert.deepEqual(after([40, 60], { minSpan: 10, maxSpan: 30 }, 60, 90), [60, 90]);
    assert.deepEqual(after([40, 60], { minSpan: 10, maxSpan: 30, push: false }, 60, 90), [40, 70]);
    assert.deepEqual(after([40, 60], { maxSpan: 30 }, 40, 10), [10, 40]);
    assert.deepEqual(after([40, 60], { maxSpan: 30, push: false }, 40, 10), [30, 60]);
  });

  it('minSpan: one step by default, 0 lets the thumbs meet, capped at max - min', () => {
    assert.deepEqual(after([20, 60], { step: 5 }, 20, 80), [80, 85], 'pushed a step above');
    assert.deepEqual(after([20, 60], { minSpan: 0 }, 20, 80), [80, 80], 'pushed along, together');
    assert.deepEqual(after([20, 60], { minSpan: 0, push: false }, 20, 80), [60, 60], 'stopped on the other');
    const r = range([0, 100], { minSpan: 500 });
    r.slide(0, 50);
    assert.deepEqual(r.get(), [0, 100], 'the span is the whole track');
    r.key(1, 'ArrowLeft');
    assert.deepEqual(r.get(), [0, 100]);
    assert.deepEqual(r.changes, []);
    r.dispose();
  });

  it('keys follow the rule', () => {
    const r = range([20, 30], { minSpan: 10 });
    r.key(0, 'ArrowRight');
    assert.deepEqual(r.get(), [21, 31], 'ArrowRight into the upper pushes it');
    r.key(0, 'End');
    assert.deepEqual(r.get(), [90, 100], 'End on the lower: max less minSpan');
    r.key(1, 'Home');
    assert.deepEqual(r.get(), [0, 10], 'Home on the upper pushes the lower to min');
    r.dispose();
    const still = range([20, 30], { minSpan: 10, push: false });
    still.key(0, 'ArrowRight');
    assert.deepEqual(still.get(), [20, 30], 'without push the lower cannot come closer');
    still.key(1, 'End');
    assert.deepEqual(still.get(), [20, 100]);
    still.dispose();
  });

  it('onChange only on a change; onCommit at release and after each key, with the pair', () => {
    const r = range([20, 80]);
    r.slide(20);
    assert.deepEqual(r.changes, [], 'a press on the thumb changes nothing');
    assert.deepEqual(r.commits, [[20, 80], [20, 80]], 'but commits on each root');
    r.commits.length = 0;
    r.slide(80, 70, 60);
    assert.deepEqual(r.changes, [[20, 70], [20, 70], [20, 60], [20, 60]]);
    assert.deepEqual(r.commits, [[20, 60], [20, 60]], 'once, at release');
    r.changes.length = 0;
    r.commits.length = 0;
    r.key(0, 'Home');
    r.key(0, 'Home');
    assert.deepEqual(r.changes, [[0, 60], [0, 60]], 'the second Home changes nothing');
    assert.deepEqual(r.commits, [[0, 60], [0, 60], [0, 60], [0, 60]], 'every key commits');
    r.dispose();
  });

  it('defaultValue, and the default [min, max]', () => {
    /** @type {any[]} */
    const heard = [];
    const view = () => (
      <Rui>
        <Stack p="xl">
          <RangeSlider defaultValue={[30, 40]} onChange={(/** @type {any} */ x) => heard.push(x)} />
          <RangeSlider min={10} max={50} />
        </Stack>
      </Rui>
    );
    const { dom, skia, dispose } = both(view);
    const nows = () => dom.nodes('Action').map((/** @type {any} */ n) => n.getAttribute('aria-valuenow'));
    assert.deepEqual(nows(), ['30', '40', '10', '50']);
    assert.deepEqual(
      dom.nodes('Action').map((/** @type {any} */ n) => [n.getAttribute('aria-valuemin'), n.getAttribute('aria-valuemax')]),
      [['0', '100'], ['0', '100'], ['10', '50'], ['10', '50']],
    );
    const node = dom.nodes('Action')[0];
    node.focus();
    node.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    $flush(dom.root);
    assert.deepEqual(nows(), ['31', '40', '10', '50'], 'uncontrolled: it keeps its own pair');
    actions(skia)[0].focus();
    skia.skia.key('End');
    $flush(skia.root);
    assert.deepEqual(heard, [[31, 40], [99, 100]], "End on Skia's lower pushes the upper to max");
    dispose();
  });

  it("the thumbs' accessible names", () => {
    /** @param {any} thumbLabel */
    const names = thumbLabel => {
      const r = range([20, 80], thumbLabel === undefined ? {} : { thumbLabel });
      const out = [r.thumbs().map((/** @type {any} */ n) => n.getAttribute('aria-label')), actions(r.skia).map(n => n.label)];
      r.dispose();
      assert.deepEqual(out[0], out[1], 'the same names on the DOM and on Skia');
      return out[0];
    };
    assert.deepEqual(names(undefined), ['Lower value', 'Upper value']);
    assert.deepEqual(names('Price'), ['Price', 'Price']);
    assert.deepEqual(names(['From', 'To']), ['From', 'To']);
  });
});
