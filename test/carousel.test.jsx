// rui-core/carousel: the stop geometry, and Carousel on the DOM and on Skia
// with the same text, the same presses, keys and drags, and the same state
// frame by frame on a manual clock.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $flush, $signal, $read, $write } from 'rrx-core';
import { View, $active } from 'ren-core';
import { Rui, Clock, manualClock, Text, BASE_THEME } from 'rui-core';
import { Carousel, $carousel, stopsOf, nearest, shiftOf, sizeOf } from 'rui-core/carousel';
import { both } from './harness.jsx';

/** @param {Partial<Parameters<typeof stopsOf>[0]>} o */
const geo = o => stopsOf({ count: 3, step: 1, frame: 1, align: 'center', loop: false, ends: 'open', group: 1, percent: true, ...o });

/** Rounded, for float comparisons. @param {number[]} list */
const round = list => list.map(v => Math.round(v * 1000) / 1000);

describe('carousel geometry', () => {
  it('reads slide sizes: percents, px, a breakpoint object by its base', () => {
    assert.deepEqual(sizeOf('50%'), { value: 50, percent: true });
    assert.deepEqual(sizeOf(300), { value: 300, percent: false });
    assert.deepEqual(sizeOf('240px'), { value: 240, percent: false });
    assert.deepEqual(sizeOf({ base: '100%', sm: '50%' }), { value: 100, percent: true });
    assert.deepEqual(sizeOf(undefined), { value: 100, percent: true });
  });

  it('aligns stops at the start, the center or the end of the frame', () => {
    assert.deepEqual(round(geo({ count: 4, step: 0.5 }).stops), [-0.25, 0.25, 0.75, 1.25]);
    assert.deepEqual(round(geo({ count: 4, step: 0.5, align: 'start' }).stops), [0, 0.5, 1, 1.5]);
    assert.deepEqual(round(geo({ count: 4, step: 0.5, align: 'end' }).stops), [-0.5, 0, 0.5, 1]);
    assert.deepEqual(round(geo({ count: 3, step: 200, frame: 500, align: 'center', percent: false }).stops), [-150, 50, 250]);
  });

  it('keeps the frame filled with fill (stops within the content, the ones landing together one), groups by slidesPerMove', () => {
    const filled = geo({ count: 4, step: 0.5, align: 'start', ends: 'fill' });
    assert.deepEqual(round(filled.stops), [0, 0.5, 1]);
    assert.deepEqual(filled.ofSlide, [0, 1, 2, 2]);
    const centered = geo({ count: 5, step: 0.25, align: 'center', ends: 'fill' });
    assert.deepEqual(round(centered.stops), [0, 0.125, 0.25], 'no space shown before the first slide or after the last');
    assert.deepEqual(centered.ofSlide, [0, 0, 1, 2, 2]);
    const grouped = geo({ count: 5, step: 0.25, align: 'start', group: 2 });
    assert.deepEqual(round(grouped.stops), [0, 0.5, 1]);
    assert.deepEqual(grouped.ofSlide, [0, 0, 1, 1, 2]);
  });

  it('loops only with slides enough to fill the frame and one more; the nearest stop wraps', () => {
    assert.equal(geo({ loop: true }).loop, true);
    assert.equal(geo({ count: 2, step: 0.5, loop: true }).loop, false);
    const g = geo({ loop: true });
    assert.equal(g.period, 3);
    assert.equal(nearest(g, 2.9), 0);
    assert.equal(nearest(g, -0.8), 2);
    assert.equal(nearest(geo({}), 2.9), 2);
  });

  it('moves looping slides by whole periods so none leaves a gap', () => {
    const g = geo({ loop: true });
    assert.deepEqual([0, 1, 2].map(i => shiftOf(g, i, 0)), [0, 0, -3], 'the last slide waits before the first');
    assert.deepEqual([0, 1, 2].map(i => shiftOf(g, i, 2)), [3, 0, 0], 'the first slide follows the last');
    assert.equal(shiftOf(geo({}), 2, 0), 0, 'no loop: no shift');
  });
});

// ---------------------------------------------------------------------------
// On the renderers

/** The primitives on Skia in tree order. @param {any} skia */
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

/** Gives every DOM primitive the box of its Skia twin (happy-dom lays nothing out). @param {any} dom @param {any} skia */
function mirror(dom, skia) {
  $flush(dom.root);
  const nodes = [...dom.host.querySelectorAll('[data-ren]')];
  const twins = primitives(skia);
  assert.equal(nodes.length, twins.length, 'the same primitives on both');
  nodes.forEach((n, i) => {
    n.getBoundingClientRect = () => twins[i].getBoundingClientRect();
  });
}

/** Presses the Action named `label` on both. @param {any} dom @param {any} skia @param {string} label */
function pressLabel(dom, skia, label) {
  const node = dom.nodes('Action').find((/** @type {any} */ n) => n.getAttribute('aria-label') === label);
  if (node === undefined) throw new Error(`no "${label}" on the DOM`);
  node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  $flush(dom.root);
  const item = primitives(skia).find(i => i.kind === 5 && i.label === label);
  if (item === undefined) throw new Error(`no "${label}" on Skia`);
  const r = item.getBoundingClientRect();
  skia.skia.press(r.left + r.width / 2, r.top + r.height / 2);
  skia.skia.release(r.left + r.width / 2, r.top + r.height / 2);
  $flush(skia.root);
}

/** A key on the Action named `label`, focused, on both. @param {any} dom @param {any} skia @param {string} label @param {string} key */
function keyOn(dom, skia, label, key) {
  const node = dom.nodes('Action').find((/** @type {any} */ n) => n.getAttribute('aria-label') === label);
  node.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  $flush(dom.root);
  const item = primitives(skia).find(i => i.kind === 5 && i.label === label);
  item.focus();
  skia.skia.key(key);
  $flush(skia.root);
}

/**
 * A drag on both, the DOM's pointer events on the root's node under the
 * first point (moves and release follow on it, as capture keeps them), the
 * clock advanced `ms` between points.
 * @param {any} dom @param {any} skia @param {any} clock @param {[number, number][]} points @param {number} [ms]
 */
function drag(dom, skia, clock, points, ms = 0) {
  mirror(dom, skia);
  const [x0, y0] = points[0];
  let hit = null;
  for (const n of dom.host.querySelectorAll('[data-ren]')) {
    const r = n.getBoundingClientRect();
    if (x0 >= r.left && x0 < r.right && y0 >= r.top && y0 < r.bottom) hit = n;
  }
  assert.ok(hit !== null, 'something under the pointer on the DOM');
  const send = (/** @type {string} */ type, /** @type {number} */ x, /** @type {number} */ y) =>
    hit.dispatchEvent(new dom.window.PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  // Both renderers see each point at the same clock time.
  send('pointerdown', x0, y0);
  skia.skia.press(x0, y0);
  for (const [x, y] of points.slice(1)) {
    if (ms > 0) clock.advance(ms);
    send('pointermove', x, y);
    skia.skia.move(x, y);
  }
  const [x1, y1] = points[points.length - 1];
  send('pointerup', x1, y1);
  skia.skia.release(x1, y1);
  $flush(dom.root);
  $flush(skia.root);
}

/** The DOM strip's inset (the View holding the slides). @param {any} dom @param {string} [side] */
const inset = (dom, side = 'left') => {
  $flush(dom.root);
  return dom.nodes('View').find((/** @type {any} */ n) => n.style.position === 'relative' && n.style[side] !== '' && n.querySelector('[data-ren="Label"]'))?.style[side];
};

/** The x where Skia painted the text `text`. @param {any} skia @param {string} text */
const xOf = (skia, text) => {
  skia.text();
  return skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === text)?.[2];
};

/** Per-root stores: each renderer's root makes its own. */
function stores() {
  /** @type {ReturnType<typeof $carousel>[]} */
  const list = [];
  return { list, make: () => (list.push($carousel()), list[list.length - 1]) };
}

describe('Carousel on the DOM and on Skia', () => {
  it('shows its slides and moves by the controls, frame by frame on the clock', () => {
    const clock = manualClock();
    /** @type {number[]} */
    const changes = [];
    const c = stores();
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <Carousel height={120} store={c.make()} onChange={(/** @type {number} */ i) => changes.push(i)}>
            <Carousel.Slide>
              <Text>one</Text>
            </Carousel.Slide>
            <Carousel.Slide>
              <Text>two</Text>
            </Carousel.Slide>
            <Carousel.Slide>
              <Text>three</Text>
            </Carousel.Slide>
          </Carousel>
        </Rui>
      </Clock>
    );
    const { dom, skia, dispose } = both(view);
    assert.equal(dom.text(), 'one two three');
    assert.equal(xOf(skia, 'one') < 480 && xOf(skia, 'one') >= 0, true, 'the first slide in view');
    assert.equal(inset(dom), '0%');
    pressLabel(dom, skia, 'Forward');
    assert.deepEqual(changes, [1, 1]);
    assert.deepEqual(c.list.map(x => x.selected()), [1, 1]);
    clock.advance(150);
    $flush(dom.root);
    const mid = parseFloat(inset(dom));
    assert.ok(mid < 0 && mid > -100, `half way on the DOM: ${mid}`);
    assert.ok(c.list[1].offset() > 0 && c.list[1].offset() < 1, 'half way on Skia');
    clock.advance(300);
    assert.equal(inset(dom), '-100%');
    assert.ok(xOf(skia, 'two') >= 0 && xOf(skia, 'two') < 40, `the second slide in view on Skia: ${xOf(skia, 'two')}`);
    assert.ok(xOf(skia, 'one') === undefined || xOf(skia, 'one') < 0, 'the first slide out of view on Skia');
    assert.equal(c.list[1].offset(), 1);
    pressLabel(dom, skia, 'Forward');
    clock.advance(400);
    assert.equal(inset(dom), '-200%');
    assert.deepEqual(c.list.map(x => x.hasNext()), [false, false], 'no loop: the end');
    const control = (/** @type {string} */ label) => dom.nodes('Action').find((/** @type {any} */ n) => n.getAttribute('aria-label') === label);
    assert.equal(control('Forward').getAttribute('aria-disabled'), 'true', 'a control with nowhere to go shows disabled');
    assert.equal(control('Back').getAttribute('aria-disabled'), null);
    pressLabel(dom, skia, 'Forward');
    assert.deepEqual(changes, [1, 1, 2, 2], 'a press past the end does nothing');
    pressLabel(dom, skia, 'Back');
    clock.advance(400);
    assert.deepEqual(c.list.map(x => x.selected()), [1, 1]);
    dispose();
  });

  it('takes its stop as value: a value set from outside moves it, a control reports through onChange', () => {
    const clock = manualClock();
    const c = stores();
    /** @type {any[]} */
    const values = [];
    /** @type {number[]} */
    const changes = [];
    const view = () => {
      const value = $signal($active(), 1);
      values.push(value);
      return (
        <Clock value={clock}>
          <Rui>
            <Carousel height={120} value={value} onChange={(/** @type {number} */ i) => changes.push(i)} store={c.make()}>
              <Carousel.Slide>
                <Text>one</Text>
              </Carousel.Slide>
              <Carousel.Slide>
                <Text>two</Text>
              </Carousel.Slide>
              <Carousel.Slide>
                <Text>three</Text>
              </Carousel.Slide>
            </Carousel>
          </Rui>
        </Clock>
      );
    };
    const { dom, skia, dispose } = both(view);
    assert.deepEqual(c.list.map(x => x.selected()), [1, 1], 'it starts on its value');
    assert.equal(inset(dom), '-100%');
    for (const v of values) $write(v, 2);
    $flush(dom.root);
    $flush(skia.root);
    assert.deepEqual(c.list.map(x => x.selected()), [2, 2]);
    assert.deepEqual(changes, [], 'a value from outside is not reported back');
    clock.advance(400);
    assert.equal(inset(dom), '-200%');
    pressLabel(dom, skia, 'Back');
    assert.deepEqual(changes, [1, 1]);
    // The controls hold the pointer glyphs (shaft, head, tail dot), not a turned chevron.
    const shapes = dom.nodes('Shape').map((/** @type {any} */ s) => [...s.children].map((/** @type {any} */ k) => k.tagName.toLowerCase()).join(','));
    assert.deepEqual(shapes, ['path,path,ellipse', 'path,path,ellipse']);
    assert.ok(dom.nodes('Shape').every((/** @type {any} */ s) => !/rotate/.test(s.style.transform ?? '')), 'drawn, not turned');
    dispose();
  });

  it('answers the arrow keys and the indicators', () => {
    const clock = manualClock();
    const c = stores();
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <Carousel height={120} dots store={c.make()}>
            <Carousel.Slide>
              <Text>one</Text>
            </Carousel.Slide>
            <Carousel.Slide>
              <Text>two</Text>
            </Carousel.Slide>
            <Carousel.Slide>
              <Text>three</Text>
            </Carousel.Slide>
          </Carousel>
        </Rui>
      </Clock>
    );
    const { dom, skia, dispose } = both(view);
    keyOn(dom, skia, 'Forward', 'ArrowRight');
    assert.deepEqual(c.list.map(x => x.selected()), [1, 1]);
    keyOn(dom, skia, 'Forward', 'ArrowLeft');
    assert.deepEqual(c.list.map(x => x.selected()), [0, 0]);
    pressLabel(dom, skia, '3 / 3');
    clock.advance(400);
    assert.deepEqual(c.list.map(x => x.selected()), [2, 2]);
    assert.equal(inset(dom), '-200%');
    const opacities = dom.nodes('Action').filter((/** @type {any} */ n) => /^\d+ \/ \d+$/.test(n.getAttribute('aria-label'))).map((/** @type {any} */ n) => n.style.opacity);
    assert.deepEqual(opacities, Array(2).fill(String(BASE_THEME.opacity.muted)).concat('1'), 'the rest muted');
    const widths = dom.nodes('Action').filter((/** @type {any} */ n) => /^\d+ \/ \d+$/.test(n.getAttribute('aria-label'))).map((/** @type {any} */ n) => n.style.width);
    assert.deepEqual(widths, [`${BASE_THEME.spacing.xs}px`, `${BASE_THEME.spacing.xs}px`, `${BASE_THEME.spacing.lg}px`], 'the selected one stretched');
    dispose();
  });

  it('loops: past the last slide it goes on forward to the first, the slides moving round', () => {
    const clock = manualClock();
    const c = stores();
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <Carousel height={120} loop defaultValue={2} store={c.make()}>
            <Carousel.Slide>
              <Text>one</Text>
            </Carousel.Slide>
            <Carousel.Slide>
              <Text>two</Text>
            </Carousel.Slide>
            <Carousel.Slide>
              <Text>three</Text>
            </Carousel.Slide>
          </Carousel>
        </Rui>
      </Clock>
    );
    const { dom, skia, dispose } = both(view);
    assert.deepEqual(c.list.map(x => x.selected()), [2, 2]);
    assert.equal(inset(dom), '-200%');
    const slides = () => dom.nodes('View').filter((/** @type {any} */ n) => n.style.width === '100%' && n.style.position === 'relative').map((/** @type {any} */ n) => n.style.left);
    assert.deepEqual(slides(), ['300%', '0%', '0%'], 'the first slide waits after the last');
    pressLabel(dom, skia, 'Forward');
    clock.advance(150);
    assert.ok(c.list[0].offset() > 2 && c.list[0].offset() < 3, `forward, not back: ${c.list[0].offset()}`);
    assert.ok(c.list[1].offset() > 2 && c.list[1].offset() < 3);
    clock.advance(400);
    assert.deepEqual(c.list.map(x => x.selected()), [0, 0]);
    assert.equal(inset(dom), '0%');
    assert.ok(xOf(skia, 'one') >= 0 && xOf(skia, 'one') < 480, 'the first slide in view on Skia');
    pressLabel(dom, skia, 'Back');
    clock.advance(400);
    assert.deepEqual(c.list.map(x => x.selected()), [2, 2]);
    dispose();
  });

  it('drags with pointer capture and settles on the nearest stop, or one on a flick', () => {
    const clock = manualClock();
    const c = stores();
    /** @type {number[]} */
    const changes = [];
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <Carousel height={120} controls={false} store={c.make()} onChange={(/** @type {number} */ i) => changes.push(i)}>
            <Carousel.Slide>
              <Text>one</Text>
            </Carousel.Slide>
            <Carousel.Slide>
              <Text>two</Text>
            </Carousel.Slide>
            <Carousel.Slide>
              <Text>three</Text>
            </Carousel.Slide>
          </Carousel>
        </Rui>
      </Clock>
    );
    const { dom, skia, dispose } = both(view);
    clock.advance(16); // measured
    // A slow drag of 300 px to the left (more than half a slide): the next stop.
    drag(dom, skia, clock, [[400, 60], [380, 60], [250, 60], [100, 60]], 200);
    assert.deepEqual(changes, [1, 1]);
    clock.advance(400);
    assert.equal(inset(dom), '-100%');
    assert.deepEqual(c.list.map(x => x.offset()), [1, 1]);
    // A short slow drag back (60 px): it stays.
    drag(dom, skia, clock, [[100, 60], [130, 60], [160, 60]], 200);
    clock.advance(400);
    assert.deepEqual(c.list.map(x => x.selected()), [1, 1]);
    assert.deepEqual(changes, [1, 1]);
    // A quick flick of 60 px to the left: one stop on.
    drag(dom, skia, clock, [[300, 60], [280, 60], [240, 60]], 16);
    assert.deepEqual(c.list.map(x => x.selected()), [2, 2]);
    clock.advance(400);
    assert.equal(inset(dom), '-200%');
    // Past the end the strip resists, then comes back.
    drag(dom, skia, clock, [[300, 60], [290, 60], [0, 60]], 200);
    clock.advance(400);
    assert.deepEqual(c.list.map(x => x.selected()), [2, 2]);
    assert.equal(inset(dom), '-200%');
    dispose();
  });

  it('with glide rests where the drag leaves it, selecting the nearest stop', () => {
    const clock = manualClock();
    const c = stores();
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <Carousel height={120} glide controls={false} store={c.make()}>
            <Carousel.Slide>
              <Text>one</Text>
            </Carousel.Slide>
            <Carousel.Slide>
              <Text>two</Text>
            </Carousel.Slide>
            <Carousel.Slide>
              <Text>three</Text>
            </Carousel.Slide>
          </Carousel>
        </Rui>
      </Clock>
    );
    const { dom, skia, dispose } = both(view);
    clock.advance(16);
    drag(dom, skia, clock, [[400, 60], [380, 60], [290, 60], [200, 60], [200, 60]], 200);
    clock.advance(400);
    for (const x of c.list) assert.ok(Math.abs(x.offset() - 200 / 480) < 0.01, `it rests between stops: ${x.offset()}`);
    assert.deepEqual(c.list.map(x => x.selected()), [0, 0]);
    assert.match(inset(dom), /^-41\.6/);
    dispose();
  });

  it('plays itself with autoplay, and stops on interaction', () => {
    const clock = manualClock();
    const c = stores();
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <Carousel height={120} autoplay={{ delay: 1000 }} store={c.make()}>
            <Carousel.Slide>
              <Text>one</Text>
            </Carousel.Slide>
            <Carousel.Slide>
              <Text>two</Text>
            </Carousel.Slide>
          </Carousel>
        </Rui>
      </Clock>
    );
    const { dom, skia, dispose } = both(view);
    assert.deepEqual(c.list.map(x => x.autoplay.playing()), [true, true]);
    clock.advance(1100);
    assert.deepEqual(c.list.map(x => x.selected()), [1, 1]);
    clock.advance(1400);
    assert.deepEqual(c.list.map(x => x.selected()), [0, 0], 'at the end it starts over');
    pressLabel(dom, skia, 'Forward');
    assert.deepEqual(c.list.map(x => x.autoplay.playing()), [false, false]);
    clock.advance(3000);
    assert.deepEqual(c.list.map(x => x.selected()), [1, 1]);
    dispose();
  });

  it('does not play itself when the user asks for reduced motion; its play still starts it', async t => {
    const { Window } = await import('happy-dom');
    const { render: renderDom } = await import('ren-dom');
    const { $root, $dispose } = await import('rrx-core');
    const { closeWindow, disposeAfter } = await import('./harness.jsx');
    const clock = manualClock();
    const c = stores();
    const window = new Window({ url: 'http://localhost/', width: 480, height: 360, settings: { device: { prefersReducedMotion: 'reduce' } } });
    const host = window.document.createElement('main');
    window.document.body.appendChild(host);
    const root = $root('dom');
    const stop = renderDom(() => (
      <Clock value={clock}>
        <Rui>
          <Carousel height={120} autoplay={{ delay: 1000 }} store={c.make()}>
            <Carousel.Slide>
              <Text>one</Text>
            </Carousel.Slide>
            <Carousel.Slide>
              <Text>two</Text>
            </Carousel.Slide>
          </Carousel>
        </Rui>
      </Clock>
    ), host, { root });
    disposeAfter(t, () => {
      stop();
      $dispose(root);
      closeWindow(window);
    });
    $flush(root);
    const [store] = c.list;
    assert.equal(store.autoplay.playing(), false, 'not started on its own');
    clock.advance(3000);
    $flush(root);
    assert.equal(store.selected(), 0, 'still on the first slide');
    store.autoplay.play();
    clock.advance(1100);
    $flush(root);
    assert.equal(store.selected(), 1, 'the user started it: it plays');
  });

  it('with startPaused waits for play; with stopOnUse false it plays on after a control', () => {
    const clock = manualClock();
    const c = stores();
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <Carousel height={120} loop={false} autoplay={{ delay: 1000, startPaused: true, stopOnUse: false }} store={c.make()}>
            <Carousel.Slide>
              <Text>one</Text>
            </Carousel.Slide>
            <Carousel.Slide>
              <Text>two</Text>
            </Carousel.Slide>
            <Carousel.Slide>
              <Text>three</Text>
            </Carousel.Slide>
          </Carousel>
        </Rui>
      </Clock>
    );
    const { dom, skia, dispose } = both(view);
    assert.deepEqual(c.list.map(x => x.autoplay.playing()), [false, false]);
    clock.advance(1100);
    assert.deepEqual(c.list.map(x => x.selected()), [0, 0], 'paused: it stays');
    for (const x of c.list) x.autoplay.play();
    pressLabel(dom, skia, 'Forward');
    assert.deepEqual(c.list.map(x => x.autoplay.playing()), [true, true], 'a control does not stop it');
    dispose();
  });

  it('is driven by its store: goTo, with or without the animation', () => {
    const clock = manualClock();
    const c = stores();
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <Carousel height={120} span="50%" gap="md" ends="fill" store={c.make()}>
            <Carousel.Slide>
              <Text>one</Text>
            </Carousel.Slide>
            <Carousel.Slide>
              <Text>two</Text>
            </Carousel.Slide>
            <Carousel.Slide>
              <Text>three</Text>
            </Carousel.Slide>
            <Carousel.Slide>
              <Text>four</Text>
            </Carousel.Slide>
          </Carousel>
        </Rui>
      </Clock>
    );
    const { dom, skia, dispose } = both(view);
    assert.deepEqual(c.list.map(x => x.count()), [3, 3], 'four half slides trim to three stops');
    for (const x of c.list) x.goTo(2, { instant: true });
    $flush(dom.root);
    $flush(skia.root);
    assert.deepEqual(c.list.map(x => x.selected()), [2, 2]);
    assert.equal(inset(dom), '-100%');
    // Skia: the frame is the viewport and one gap (16): slides of 248, the third at 0.
    assert.ok(Math.abs(xOf(skia, 'three') - xOf(skia, 'four') + 248) < 1, 'slides one step apart');
    assert.ok(xOf(skia, 'three') >= 0 && xOf(skia, 'three') < 30, `the third slide starts the view: ${xOf(skia, 'three')}`);
    // Without `instant`, the move takes the default 'calm' preset (300 ms).
    for (const x of c.list) x.goTo(0);
    clock.advance(150);
    const mid = parseFloat(inset(dom));
    assert.ok(mid < 0 && mid > -100, `on its way: ${mid}`);
    clock.advance(160);
    assert.equal(inset(dom), '0%');
    dispose();
  });

  it('runs vertically, and with slides sized in px', () => {
    const clock = manualClock();
    const c = stores();
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <Carousel height={100} orientation="vertical" store={c.make()}>
            <Carousel.Slide>
              <Text>up</Text>
            </Carousel.Slide>
            <Carousel.Slide>
              <Text>down</Text>
            </Carousel.Slide>
          </Carousel>
          <Carousel span={200} store={c.make()}>
            <Carousel.Slide>
              <Text>a</Text>
            </Carousel.Slide>
            <Carousel.Slide>
              <Text>b</Text>
            </Carousel.Slide>
            <Carousel.Slide>
              <Text>c</Text>
            </Carousel.Slide>
          </Carousel>
        </Rui>
      </Clock>
    );
    const { dom, skia, dispose } = both(view);
    const [vd, pd, vs, ps] = c.list;
    keyOn(dom, skia, 'Forward', 'ArrowDown');
    clock.advance(400);
    assert.deepEqual([vd.selected(), vs.selected()], [1, 1]);
    assert.equal(inset(dom, 'top'), '-100%');
    pd.next();
    ps.next();
    clock.advance(400);
    assert.deepEqual([pd.offset(), ps.offset()], [1, 1]);
    assert.equal(dom.nodes('View').find((/** @type {any} */ n) => n.style.left === '-200px') !== undefined, true, 'px slides move by px');
    assert.ok(Math.abs(xOf(skia, 'b')) < 20, `the second px slide starts the view on Skia: ${xOf(skia, 'b')}`);
    dispose();
  });

  it('takes span and gap per breakpoint, following the viewport', () => {
    const clock = manualClock();
    const view = () => (
      <Clock value={clock}>
        <Rui>
          <Carousel span={{ base: '100%', md: '50%', xl: '25%' }} gap={{ base: 'xs', md: 'lg' }} controls={false}>
            <Carousel.Slide>
              <Text>one</Text>
            </Carousel.Slide>
            <Carousel.Slide>
              <Text>two</Text>
            </Carousel.Slide>
            <Carousel.Slide>
              <Text>three</Text>
            </Carousel.Slide>
          </Carousel>
        </Rui>
      </Clock>
    );
    const { dom, skia, dispose } = both(view, { width: 480, height: 300 });
    const slides = () => dom.nodes('View').filter((/** @type {any} */ n) => n.querySelector('[data-ren="Label"]') && n.parentElement?.style.position === 'relative' && n.style.width !== '');
    const widths = () => slides().map((/** @type {any} */ n) => n.style.width);
    assert.deepEqual(widths(), ['100%', '100%', '100%'], 'below md: whole slides');
    assert.equal(Math.round(xOf(skia, 'two') - xOf(skia, 'one')), 488, 'Skia: the frame, the view and the xs gap (8)');
    dom.resize(1000, 300);
    skia.resize(1000, 300);
    clock.advance(16);
    assert.deepEqual(widths(), ['50%', '50%', '50%'], 'from md: halves');
    assert.equal(Math.round(xOf(skia, 'two') - xOf(skia, 'one')), 512, 'Skia: half the frame with the lg gap (24)');
    dom.resize(1500, 300);
    skia.resize(1500, 300);
    clock.advance(16);
    assert.deepEqual(widths(), ['25%', '25%', '25%'], 'from xl: quarters');
    assert.equal(Math.round(xOf(skia, 'two') - xOf(skia, 'one')), 381, 'Skia: a quarter of the frame with the lg gap');
    dispose();
  });

  it('measures px slides again when the frame resizes (onResize)', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const boxes = [];
    const view = () => {
      const box = $signal($active(), 480);
      boxes.push(box);
      return (
        <Clock value={clock}>
          <Rui>
            <View style={() => ({ width: $read(box) })}>
              <Carousel span={200} align="center" controls={false}>
                <Carousel.Slide>
                  <Text>a</Text>
                </Carousel.Slide>
                <Carousel.Slide>
                  <Text>b</Text>
                </Carousel.Slide>
              </Carousel>
            </View>
          </Rui>
        </Clock>
      );
    };
    const { dom, skia, dispose } = both(view);
    // Centered, measured by the frame's onResize with no frame of the clock: the first slide starts half the frame
    // less half a slide in.
    assert.equal(Math.round(xOf(skia, 'a')), 140);
    const lefts = () => dom.nodes('View').map((/** @type {any} */ n) => n.style.left).filter((/** @type {string} */ l) => /px$/.test(l));
    // The DOM's boxes are Skia's; a frame of the clock measures nothing: the frame is not reported yet.
    mirror(dom, skia);
    clock.advance(16);
    assert.deepEqual(lefts(), ['-100px'], 'the DOM before its first report: no frame to center in');
    dom.report();
    assert.deepEqual(lefts(), ['140px'], 'the DOM: centered once its frame is reported');
    for (const box of boxes) $write(box, 300);
    skia.text();
    $flush(skia.root);
    assert.equal(Math.round(xOf(skia, 'a')), 50, 'centered in the narrower frame');
    mirror(dom, skia);
    dom.report();
    assert.deepEqual(lefts(), ['50px'], 'the DOM: centered in the narrower frame');
    dispose();
  });
});
