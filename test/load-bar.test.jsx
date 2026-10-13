// rui-core/load-bar: the store (per root: run, hold, to, add, finish,
// clear, and the creep) and <LoadBar> on the DOM and on
// Skia: at the top of the root, its width and fade the same frame by frame
// on a manual clock.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $root, $flush } from 'rrx-core';
import { View } from 'ren-core';
import { Rui, Clock, manualClock, Text } from 'rui-core';
import { LoadBar, $loadBar, loadBarStore, creep } from 'rui-core/load-bar';
import { both } from './harness.jsx';

/**
 * The bar on each renderer (the DOM's element in the portal, Skia's item
 * in the overlay), its fill and the store per root.
 * @param {Record<string, any>} [props]
 */
function setup(props = {}) {
  const clock = manualClock();
  /** @type {import('rui-core/load-bar').LoadBarStore[]} */
  const stores = [];
  const Page = () => {
    stores.push($loadBar());
    return <Text>page</Text>;
  };
  const view = () => (
    <Clock value={clock}>
      <Rui>
        <LoadBar {...props}>
          <View style={{ padding: 20 }}>
            <Page />
          </View>
        </LoadBar>
      </Rui>
    </Clock>
  );
  const { dom, skia, dispose } = both(view);
  const flush = () => {
    $flush(dom.root);
    $flush(skia.root);
  };
  /** @param {number} ms */
  const advance = ms => {
    clock.advance(ms);
    flush();
  };
  const domBar = () => [...dom.document.body.children].find(n => n.tagName !== 'MAIN');
  const skiaBar = () => {
    skia.skia.present();
    return skia.skia.overlay.first;
  };
  /** [DOM, Skia] fill widths in px of a 480 px root, and opacities. */
  const state = () => {
    const d = domBar();
    const s = skiaBar();
    const fill = s.first.getBoundingClientRect();
    return {
      dom: { width: d.firstElementChild.style.width, opacity: d.style.opacity === '' ? 1 : Number(d.style.opacity) },
      skia: { width: Math.round(fill.width), opacity: s.r.opacity },
    };
  };
  return { dom, skia, stores, flush, advance, state, domBar, skiaBar, dispose };
}

/** A percent width as px of 480, rounded. @param {string} width */
const px = width => Math.round((parseFloat(width) / 100) * 480);

describe('load bar store', () => {
  it('runs, moves to a value, adds, holds, finishes and clears', () => {
    const R = $root('bar');
    const store = loadBarStore(R);
    const near = (/** @type {number} */ v) => Math.round(v * 100) / 100;
    assert.deepEqual([store.value(), store.shown(), store.phase()], [0, false, 'idle']);
    store.run();
    assert.deepEqual([store.shown(), store.phase()], [true, 'running']);
    store.add();
    assert.equal(near(store.value()), 8.82, 'the creep step from 0: 9 % of the 98 left');
    store.to(60);
    store.add();
    assert.equal(near(store.value()), 63.42);
    store.add(-10);
    assert.equal(near(store.value()), 53.42, 'a negative step moves it back');
    store.add(100);
    assert.equal(store.value(), 100, 'clamped');
    store.hold();
    assert.equal(store.phase(), 'held');
    store.finish();
    assert.equal(store.phase(), 'finishing');
    store.run();
    assert.equal(store.value(), 0, 'from 0 again after a finish');
    store.clear();
    assert.deepEqual([store.value(), store.shown(), store.phase()], [0, false, 'idle']);
    assert.deepEqual([creep(0), creep(90), creep(97.5), creep(98)].map(near), [8.82, 0.72, 0.25, 0], 'at least 0.4, but at most half of what is left: it never reaches 98');
    let v = 0;
    for (let i = 0; i < 60; i++) v += creep(v);
    assert.ok(v < 98 && v > 97, `approaches 98: ${v}`);
  });
});

describe('LoadBar', () => {
  it('sits at the top of the root, hidden until it runs, one store per root', () => {
    const t = setup({ size: 4 });
    assert.equal(t.stores.length, 2);
    assert.notEqual(t.stores[0], t.stores[1]);
    const d = t.domBar();
    assert.deepEqual([d.style.position, d.style.top, d.style.left, d.style.width, d.style.height], ['fixed', '0px', '0px', '100%', '4px'], 'fixed at the top');
    const box = t.skiaBar().getBoundingClientRect();
    assert.deepEqual([box.x, box.y, Math.round(box.width), box.height], [0, 0, 480, 4]);
    assert.deepEqual(t.state(), { dom: { width: '0%', opacity: 0 }, skia: { width: 0, opacity: 0 } });
    t.stores[0].to(50);
    t.advance(300);
    assert.deepEqual(t.state().dom, { width: '50%', opacity: 1 });
    assert.deepEqual(t.state().skia, { width: 0, opacity: 0 }, 'the Skia root has its own store');
    t.dispose();
  });

  it('creeps on while it runs, the same frame by frame, then finishes, fades out and clears', () => {
    const t = setup({ interval: 640, duration: 200 });
    for (const store of t.stores) store.run();
    t.flush();
    t.advance(96);
    const early = t.state();
    assert.ok(early.dom.opacity > 0 && early.dom.opacity < 1, `fading in: ${early.dom.opacity}`);
    assert.ok(Math.abs(early.skia.opacity - early.dom.opacity) < 0.01, 'the same opacity on Skia');
    t.advance(560);
    const first = creep(0);
    assert.deepEqual(t.stores.map(s => s.value()), [first, first], 'a creep step after 640 ms (at 656)');
    t.advance(96);
    const moving = t.state();
    assert.ok(px(moving.dom.width) > 0 && px(moving.dom.width) < 48, `growing: ${moving.dom.width}`);
    assert.ok(Math.abs(px(moving.dom.width) - moving.skia.width) <= 1, `the same width on Skia: ${moving.skia.width}`);
    // Steps at 640, 1280, 1920 and 2560; the fifth would come at 3200.
    t.advance(1900);
    let four = 0;
    for (let i = 0; i < 4; i++) four += creep(four);
    assert.deepEqual(t.stores.map(s => s.value()), [four, four], 'four creep steps');
    for (const store of t.stores) store.hold();
    t.advance(1000);
    assert.deepEqual(t.stores.map(s => s.value()), [four, four], 'still while held');
    for (const store of t.stores) store.finish();
    t.flush();
    t.advance(208);
    assert.deepEqual(t.state(), { dom: { width: '100%', opacity: 1 }, skia: { width: 480, opacity: 1 } }, 'full');
    t.advance(96);
    const fading = t.state();
    assert.ok(fading.dom.opacity > 0 && fading.dom.opacity < 1, `fading out: ${fading.dom.opacity}`);
    assert.ok(Math.abs(fading.skia.opacity - fading.dom.opacity) < 0.01);
    t.advance(400);
    assert.deepEqual(t.stores.map(s => [s.value(), s.shown(), s.phase()]), [[0, false, 'idle'], [0, false, 'idle']], 'cleared');
    assert.equal(t.state().dom.opacity, 0);
    assert.equal(t.state().skia.opacity, 0);
    t.dispose();
  });

  it('starts at defaultValue, in the theme color', () => {
    const t = setup({ defaultValue: 40, color: 'red', portal: false });
    t.advance(300);
    assert.deepEqual(t.stores.map(s => s.value()), [40, 40]);
    const bar = t.dom.host.querySelector('[data-ren="View"]');
    assert.equal(bar.style.position, 'absolute');
    assert.match(bar.firstElementChild.style.background, /#b63636|rgb\(182, 54, 54\)/, 'red.6');
    t.dispose();
  });
});
