// rui-core/hooks' $spy: the active heading of a recipe page's Scroll on
// Skia (wheel-scrolled) and on the DOM (happy-dom lays nothing out, so its
// elements get Skia's boxes), measured on a manual clock's frames; the
// frame rule on stand-in nodes; and Outline following it on both.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $read, $flush } from 'rrx-core';
import { View, Label, Scroll } from 'ren-core';
import { Rui, Clock, manualClock, Outline } from 'rui-core';
import { $spy } from 'rui-core/hooks';
import { both, onDom } from './harness.jsx';
import { KIND } from './scene.js';

/** The text a Skia item holds: its own, or its children's. @param {any} item @returns {string} */
const textIn = item => {
  if (item.first === null) return String(item.text ?? '').trim();
  /** @type {string[]} */
  const out = [];
  for (let n = item.first; n !== null; n = n.next) out.push(textIn(n));
  return out.join('').trim();
};

/** The recipe page: label, level, id, the section's body height. */
const RECIPE = /** @type {const} */ ([
  ['Ingredients', 1, 'ingredients', 300],
  ['Prep', 2, 'prep', 300],
  ['Oven', 2, 'oven', 300],
  ['Serving', 1, 'serving', 40],
]);

/**
 * The page on both renderers: an Outline beside the Scroll when `outline`.
 * Each render's spy, heading nodes and Scroll node, DOM first.
 * @param {{ offset?: number, outline?: boolean }} [options]
 */
function recipe(options = {}) {
  const clock = manualClock();
  /** @type {{ spy: any, heads: any[], scroll: any }[]} */
  const renders = [];
  const Page = () => {
    const spy = $spy(options.offset === undefined ? undefined : { offset: options.offset });
    /** @type {{ spy: any, heads: any[], scroll: any }} */
    const r = { spy, heads: [], scroll: null };
    renders.push(r);
    const sections = RECIPE.map(([label, level, id, body], i) => {
      const ref = spy.heading(label, level, id);
      return (
        <View style={{ direction: 'column' }}>
          <Label ref={(/** @type {any} */ n) => ((r.heads[i] = n), ref(n))}>{label}</Label>
          <View style={{ height: body }} />
        </View>
      );
    });
    return (
      <View style={{ direction: 'row' }}>
        {options.outline ? <Outline spy={spy} style={{ width: 160 }} /> : null}
        <Scroll
          onScroll={spy.scroll.onScroll}
          ref={(/** @type {any} */ n) => ((r.scroll = n), spy.scroll.ref(n))}
          style={{ height: 200, width: 280, direction: 'column' }}
        >
          {sections}
        </Scroll>
      </View>
    );
  };
  // The spy looks the Clock up where it is made: under the provider.
  const view = () => (
    <Clock value={clock}>
      <Rui>
        <Page />
      </Rui>
    </Clock>
  );
  const page = both(view);
  const [dom, skia] = renders;
  page.skia.text();
  mirror(dom, skia);
  return { ...page, clock, dom: page.dom, skia: page.skia, onDom: dom, onSkia: skia };
}

/**
 * Gives the DOM's Scroll and headings Skia's boxes (happy-dom lays out
 * nothing): each heading's top follows the DOM Scroll's own scrollTop.
 * Counts the Scroll's measurements in `measures`.
 * @param {{ heads: any[], scroll: any }} dom @param {{ heads: any[], scroll: any }} skia
 */
function mirror(dom, skia) {
  const frame = skia.scroll.getBoundingClientRect();
  const at = skia.heads.map(h => h.getBoundingClientRect().top - frame.top + skia.scroll.scrollTop);
  const box = (/** @type {number} */ top, /** @type {number} */ height) => ({ x: 0, y: top, left: 0, top, right: 100, bottom: top + height, width: 100, height });
  let scrollTop = 0;
  const el = dom.scroll;
  el.measures = 0;
  el.getBoundingClientRect = () => (el.measures++, box(0, skia.scroll.clientHeight));
  Object.defineProperty(el, 'scrollTop', {
    get: () => scrollTop,
    set: v => void (scrollTop = Math.max(0, Math.min(v, skia.scroll.scrollHeight - skia.scroll.clientHeight))),
    configurable: true,
  });
  Object.defineProperty(el, 'clientHeight', { get: () => skia.scroll.clientHeight, configurable: true });
  Object.defineProperty(el, 'scrollHeight', { get: () => skia.scroll.scrollHeight, configurable: true });
  dom.heads.forEach((h, i) => {
    h.getBoundingClientRect = () => box(at[i] - scrollTop, 20);
  });
}

/** Where heading `i` is below Skia's Scroll top now. @param {any} r @param {number} i */
const skiaTop = (r, i) => r.heads[i].getBoundingClientRect().top - r.scroll.getBoundingClientRect().top;

/**
 * Scrolls both sides by `dy`: the wheel over Skia's Scroll, the DOM's
 * scrollTop and its scroll event; then one frame.
 * @param {ReturnType<typeof recipe>} page @param {number} dy
 */
function scrollBoth(page, dy) {
  page.skia.text();
  const r = page.onSkia.scroll.getBoundingClientRect();
  page.skia.skia.wheel(r.x + r.width / 2, r.y + r.height / 2, dy);
  const el = page.onDom.scroll;
  el.scrollTop += dy;
  el.dispatchEvent(new page.dom.window.Event('scroll'));
  frame(page);
}

/** Runs one frame and flushes both roots. @param {ReturnType<typeof recipe>} page */
function frame(page) {
  page.clock.advance(16);
  $flush(page.dom.root);
  $flush(page.skia.root);
}

/** Each side's active heading. @param {ReturnType<typeof recipe>} page */
const actives = page => [$read(page.onDom.spy.value), $read(page.onSkia.spy.value)];

describe('$spy', () => {
  it('starts at the first heading, unmeasured, and measures at the next frame', () => {
    const page = recipe();
    for (const r of [page.onDom, page.onSkia]) {
      assert.equal($read(r.spy.value), 0);
      assert.equal($read(r.spy.measured), false);
    }
    frame(page);
    for (const r of [page.onDom, page.onSkia]) {
      assert.equal($read(r.spy.measured), true);
      assert.deepEqual($read(r.spy.headings), [
        { label: 'Ingredients', level: 1, id: 'ingredients' },
        { label: 'Prep', level: 2, id: 'prep' },
        { label: 'Oven', level: 2, id: 'oven' },
        { label: 'Serving', level: 1, id: 'serving' },
      ]);
    }
    assert.deepEqual(actives(page), [0, 0]);
    page.dispose();
  });

  it('makes a heading active once it reaches the reading line, with 1 px of tolerance', () => {
    const page = recipe();
    frame(page);
    const prep = skiaTop(page.onSkia, 1);
    scrollBoth(page, prep - 20);
    assert.deepEqual(actives(page), [0, 0], 'well short keeps the first');
    scrollBoth(page, 19);
    assert.equal(skiaTop(page.onSkia, 1), 1);
    assert.deepEqual(actives(page), [1, 1], 'one pixel short counts');
    scrollBoth(page, 3);
    assert.deepEqual(actives(page), [1, 1], 'just above the line');
    page.dispose();
  });

  it('offset moves the reading line down', () => {
    const page = recipe({ offset: 50 });
    frame(page);
    const prep = skiaTop(page.onSkia, 1);
    scrollBoth(page, prep - 45);
    assert.deepEqual(actives(page), [1, 1], 'Prep is 45 px down, above a line 50 px down');
    page.dispose();
  });

  it('at the end, the last heading shown is active though it never reaches the line', () => {
    const page = recipe();
    frame(page);
    scrollBoth(page, 5000);
    const r = page.onSkia.scroll;
    assert.equal(r.scrollTop + r.clientHeight, r.scrollHeight, 'scrolled to the end');
    assert.ok(skiaTop(page.onSkia, 3) > 1, 'Serving sits below the line');
    assert.deepEqual(actives(page), [3, 3]);
    scrollBoth(page, -30);
    assert.deepEqual(actives(page), [2, 2], 'off the end, the line rule again');
    page.dispose();
  });

  it('scrollTo makes a heading active at once and brings it to the line at the frame', () => {
    const page = recipe();
    frame(page);
    for (const r of [page.onDom, page.onSkia]) r.spy.scrollTo(2);
    $flush(page.dom.root);
    $flush(page.skia.root);
    assert.deepEqual(actives(page), [2, 2]);
    frame(page);
    assert.deepEqual(actives(page), [2, 2]);
    assert.equal(Math.round(skiaTop(page.onSkia, 2)), 0, 'Oven on the line');
    assert.equal(page.onDom.heads[2].getBoundingClientRect().top, 0);
    for (const r of [page.onDom, page.onSkia]) r.spy.scrollTo(9);
    for (const r of [page.onDom, page.onSkia]) r.spy.scrollTo(-1);
    frame(page);
    assert.deepEqual(actives(page), [2, 2], 'out of range does nothing');
    page.dispose();
  });

  it('measures once for several asks in one frame', () => {
    const page = recipe();
    frame(page);
    const el = page.onDom.scroll;
    const before = el.measures;
    page.onDom.spy.scroll.onScroll();
    page.onDom.spy.scroll.onScroll();
    page.onDom.spy.refresh();
    el.dispatchEvent(new page.dom.window.Event('scroll'));
    assert.equal(el.measures, before, 'nothing before the frame');
    frame(page);
    assert.equal(el.measures, before + 1);
    page.dispose();
  });
});

describe('$spy on stand-in nodes', () => {
  /** A node with a box at `top` (a Scroll when given its numbers). @param {number} top @param {Record<string, number>} [more] */
  const node = (top, more = {}) => ({ top, getBoundingClientRect() { return { top: this.top, left: 0, width: 50, height: 10 }; }, ...more });

  /** A spy made in a component under a manual clock. @param {{ offset?: number }} [options] */
  function made(options) {
    const clock = manualClock();
    /** @type {any} */
    let spy;
    const Probe = () => void (spy = $spy(options));
    const dom = onDom(() => (
      <Clock value={clock}>
        <Probe />
      </Clock>
    ));
    return { spy, clock, dom, step: () => (clock.advance(16), $flush(dom.root)) };
  }

  it('keeps a re-registered node in its place; a null ref removes its heading', () => {
    const { spy, dom, step } = made();
    const [a, b, c] = [node(0), node(100), node(200)];
    spy.scroll.ref(node(0, { scrollTop: 0, clientHeight: 150, scrollHeight: 1000 }));
    const refA = spy.heading('Dough', 1, 'dough');
    const refB = spy.heading('Filling', 2);
    spy.heading('Glaze')(c);
    refA(a);
    refB(b);
    step();
    assert.deepEqual($read(spy.headings).map((/** @type {any} */ h) => h.label), ['Glaze', 'Dough', 'Filling']);
    spy.heading('Icing', 3, 'icing')(c);
    step();
    assert.deepEqual($read(spy.headings)[0], { label: 'Icing', level: 3, id: 'icing' }, 'same place, new label');
    assert.equal($read(spy.headings)[2].level, 2);
    refA(null);
    step();
    assert.deepEqual($read(spy.headings).map((/** @type {any} */ h) => h.label), ['Icing', 'Filling']);
    dom.dispose();
  });

  it('leaves value and measured alone when nothing has a box, as in a worker', () => {
    const { spy, dom, step } = made();
    spy.scroll.ref({});
    spy.heading('One')({});
    spy.heading('Two')({});
    step();
    assert.equal($read(spy.value), 0);
    assert.equal($read(spy.measured), false);
    assert.equal($read(spy.headings).length, 2);
    spy.scrollTo(1);
    $flush(dom.root);
    assert.equal($read(spy.value), 0, 'no boxes: scrollTo does nothing');
    dom.dispose();
  });

  it('cancels a pending frame when its owner ends', () => {
    const { spy, clock, dom } = made();
    let reads = 0;
    const scroller = node(0, { scrollTop: 400, clientHeight: 150, scrollHeight: 1000 });
    const measure = scroller.getBoundingClientRect;
    scroller.getBoundingClientRect = function () {
      reads++;
      return measure.call(this);
    };
    spy.scroll.ref(scroller);
    spy.heading('A')(node(-300));
    spy.heading('B')(node(-10));
    assert.equal(clock.pending(), 1);
    dom.dispose();
    assert.equal(clock.pending(), 0, 'the frame is canceled');
    spy.refresh();
    clock.advance(32);
    assert.equal(reads, 0, 'no measurement after the end');
  });
});

describe('Outline with $spy', () => {
  /** The Outline links' state on each side: [DOM aria-current, Skia selected], by label. @param {ReturnType<typeof recipe>} page */
  function marks(page) {
    page.skia.text();
    const dom = page.dom.nodes('Action').map((/** @type {any} */ n) => [n.textContent.trim(), n.getAttribute('aria-current')]);
    /** @type {any[]} */
    const skia = [];
    const walk = (/** @type {any} */ n) => {
      for (let c = n.first; c !== null; c = c.next) {
        if (c.kind === KIND.Action) skia.push([textIn(c), c.selected]);
        walk(c);
      }
    };
    walk(page.skia.skia.root);
    return { dom, skia };
  }

  it('lists the headings as links, follows the Scroll and scrolls on a press, on both', () => {
    const page = recipe({ outline: true });
    frame(page);
    const first = marks(page);
    assert.deepEqual(first.dom.map(([label]) => label), ['Ingredients', 'Prep', 'Oven', 'Serving']);
    assert.deepEqual(first.skia.map(([label]) => label), ['Ingredients', 'Prep', 'Oven', 'Serving']);
    assert.deepEqual(page.dom.nodes('Action').map((/** @type {any} */ n) => n.getAttribute('href')), ['#ingredients', '#prep', '#oven', '#serving']);
    assert.deepEqual(first.dom.map(([, on]) => on), ['location', null, null, null]);
    assert.deepEqual(first.skia.map(([, on]) => on), [true, false, false, false]);

    scrollBoth(page, skiaTop(page.onSkia, 1) + 2);
    const moved = marks(page);
    assert.deepEqual(moved.dom.map(([, on]) => on), [null, 'location', null, null], 'the mark follows the Scroll');
    assert.deepEqual(moved.skia.map(([, on]) => on), [false, true, false, false]);

    // A press on Oven's link scrolls there, on each side.
    const link = page.dom.nodes('Action').find((/** @type {any} */ n) => n.textContent.trim() === 'Oven');
    link.dispatchEvent(new page.dom.window.MouseEvent('click', { bubbles: true }));
    $flush(page.dom.root);
    page.skia.press('Oven');
    frame(page);
    assert.deepEqual(actives(page), [2, 2]);
    assert.equal(Math.round(skiaTop(page.onSkia, 2)), 0);
    assert.equal(page.onDom.heads[2].getBoundingClientRect().top, 0);
    const pressed = marks(page);
    assert.deepEqual(pressed.dom.map(([, on]) => on), [null, null, 'location', null]);
    assert.deepEqual(pressed.skia.map(([, on]) => on), [false, false, true, false]);
    page.dispose();
  });
});
