// ColorPicker's saturation panel on the DOM and on Skia: places to
// saturation and brightness with their fractions kept, one commit per
// gesture, clamping at the edges, keys on whole steps, and the thumb
// following a value set from outside.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $write, $flush } from 'rrx-core';
import { Rui, Stack, ColorPicker, formatColor, BASE_THEME, HueSlider } from 'rui-core';
import { View } from 'ren-core';
import { both } from './harness.jsx';
import { items, states, primitives, drag } from './inputs-harness.jsx';

/** The rgb text of a red-hued color at a saturation and brightness. @param {number} s @param {number} v */
const red = (s, v) => formatColor({ h: 0, s, v, a: 1 }, 'rgb');

/**
 * A picker in rgb on both renderers, starting at `start`; each root's value
 * and the commits it heard.
 * @param {string} [start]
 */
function setup(start = '#ff0000') {
  const s = states();
  /** @type {string[]} */
  const commits = [];
  const view = () => {
    const v = s.make(start);
    return (
      <Rui>
        <Stack p="xl">
          <ColorPicker format="rgb" value={v} onChange={(/** @type {string} */ x) => $write(v, x)} onCommit={(/** @type {string} */ x) => commits.push(x)} />
        </Stack>
      </Rui>
    );
  };
  const { dom, skia, dispose } = both(view);
  // The panel: the first primitive that takes pointers.
  const box = primitives(skia).filter(n => n.pointers)[0].getBoundingClientRect();
  /** The page point at fractions of the panel. @param {number} x @param {number} y @returns {[number, number]} */
  const at = (x, y) => [box.left + box.width * x, box.top + box.height * y];
  const thumbDom = () => dom.nodes('Action').find((/** @type {any} */ n) => n.getAttribute('aria-label') === 'Saturation');
  const thumbSkia = () => items(skia, 5).find(n => n.label === 'Saturation');
  /** A key on the focused thumb of both, with Shift when asked. @param {string} key @param {boolean} [shift] */
  const key = (key, shift = false) => {
    const node = thumbDom();
    node.focus();
    thumbSkia().focus();
    node.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true, cancelable: true }));
    $flush(dom.root);
    skia.skia.key(key, shift);
    $flush(skia.root);
  };
  return { s, commits, dom, skia, dispose, box, at, thumbDom, thumbSkia, key };
}

describe('ColorPicker saturation panel on the DOM and on Skia', () => {
  it('maps a place to saturation across and brightness down', () => {
    const t = setup();
    drag(t.dom, t.skia, [t.at(0.5, 0.5)]);
    assert.equal(red(50, 50), 'rgb(128, 64, 64)');
    assert.deepEqual(t.s.get(), ['rgb(128, 64, 64)', 'rgb(128, 64, 64)'], 'the center');
    drag(t.dom, t.skia, [t.at(0.25, 0.25)]);
    assert.equal(red(25, 75), 'rgb(191, 143, 143)');
    assert.deepEqual(t.s.get(), ['rgb(191, 143, 143)', 'rgb(191, 143, 143)'], 'a quarter in and a quarter down');
    t.dispose();
  });

  it('commits once, at the release of a drag', () => {
    const t = setup();
    drag(t.dom, t.skia, [t.at(0.1, 0.1), t.at(0.3, 0.4), t.at(0.6, 0.2), t.at(0.5, 0.5)]);
    assert.deepEqual(t.commits, ['rgb(128, 64, 64)', 'rgb(128, 64, 64)'], 'one commit on each renderer, the release\'s color');
    assert.deepEqual(t.s.get(), ['rgb(128, 64, 64)', 'rgb(128, 64, 64)']);
    t.dispose();
  });

  it('clamps a place past the edge', () => {
    const t = setup();
    const [x, y] = t.at(0.5, 0.5);
    drag(t.dom, t.skia, [[x, y], [t.box.left - 40, y]]);
    assert.deepEqual(t.s.get(), [red(0, 50), red(0, 50)], 'past the start: no saturation');
    drag(t.dom, t.skia, [[x, y], [t.box.right + 40, t.box.top - 40]]);
    assert.deepEqual(t.s.get(), [red(100, 100), red(100, 100)], 'past the end and the top: the pure hue');
    drag(t.dom, t.skia, [[x, y], [x, t.box.bottom + 40]]);
    assert.deepEqual(t.s.get(), [red(50, 0), red(50, 0)], 'past the bottom: black');
    t.dispose();
  });

  it('keeps fractions; only the shown numbers round', () => {
    const t = setup();
    drag(t.dom, t.skia, [t.at(1 / 3, 0)]);
    // At full brightness the green and blue are 255·(1 − s): 170 for s = 33.33…, 171 had it snapped to 33.
    assert.deepEqual([red(100 / 3, 100), red(33, 100)], ['rgb(255, 170, 170)', 'rgb(255, 171, 171)']);
    assert.deepEqual(t.s.get(), ['rgb(255, 170, 170)', 'rgb(255, 170, 170)']);
    assert.equal(t.thumbDom().getAttribute('aria-valuenow'), '33');
    assert.equal(t.thumbDom().getAttribute('aria-valuetext'), 'Saturation 33%, brightness 100%');
    // Brightness down a step leaves the fractional saturation as it was.
    t.key('ArrowDown');
    assert.deepEqual(t.s.get(), [red(100 / 3, 99), red(100 / 3, 99)]);
    // A saturation key lands on a whole step from the rounded value.
    t.key('ArrowRight');
    assert.deepEqual(t.s.get(), [red(34, 99), red(34, 99)]);
    t.dispose();
  });

  it('keys: arrows by 1 (10 with Shift), PageUp/PageDown, Home/End, clamped', () => {
    const t = setup();
    /** @type {[string, boolean, number, number][]} key, shift, then the saturation and brightness */
    const steps = [
      ['ArrowRight', false, 100, 100],
      ['ArrowUp', false, 100, 100],
      ['ArrowLeft', false, 99, 100],
      ['ArrowLeft', true, 89, 100],
      ['ArrowRight', true, 99, 100],
      ['ArrowDown', false, 99, 99],
      ['ArrowDown', true, 99, 89],
      ['ArrowUp', true, 99, 99],
      ['PageDown', false, 99, 89],
      ['PageUp', false, 99, 99],
      ['PageUp', false, 99, 100],
      ['Home', false, 0, 100],
      ['ArrowLeft', false, 0, 100],
      ['ArrowLeft', true, 0, 100],
      ['End', false, 100, 100],
      ['PageDown', false, 100, 90],
    ];
    for (const [k, shift, sat, val] of steps) {
      t.key(k, shift);
      assert.deepEqual(t.s.get(), [red(sat, val), red(sat, val)], `${shift ? 'Shift+' : ''}${k}`);
      assert.equal(t.thumbDom().getAttribute('aria-valuenow'), String(sat));
      assert.equal(t.thumbDom().getAttribute('aria-valuetext'), `Saturation ${sat}%, brightness ${val}%`);
    }
    for (let i = 0; i < 12; i++) t.key('PageDown');
    t.key('ArrowDown');
    assert.deepEqual(t.s.get(), [red(100, 0), red(100, 0)], 'brightness stops at 0');
    assert.equal(t.commits.length, (steps.length + 13) * 2, 'each key commits, on each renderer');
    t.dispose();
  });

  it('ignores keys it does not take, and lets their default be', () => {
    const t = setup();
    const node = t.thumbDom();
    node.focus();
    const e = new t.dom.window.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    node.dispatchEvent(e);
    $flush(t.dom.root);
    assert.equal(e.defaultPrevented, false);
    const arrow = new t.dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
    node.dispatchEvent(arrow);
    $flush(t.dom.root);
    assert.equal(arrow.defaultPrevented, true, 'a key it takes prevents the default');
    assert.deepEqual(t.commits, [red(99, 100)]);
    t.dispose();
  });

  it('moves its thumb and ground with a value set from outside', () => {
    const T = setup('#ffffff');
    const side = T.thumbSkia().getBoundingClientRect().width;
    /** The thumb's center on Skia, as fractions of the panel. */
    const where = () => {
      const r = T.thumbSkia().getBoundingClientRect();
      return [(r.left + r.width / 2 - T.box.left) / T.box.width, (r.top + r.height / 2 - T.box.top) / T.box.height];
    };
    const style = () => T.thumbDom().style;
    assert.deepEqual([style().left, style().top, style().marginLeft, style().marginTop], ['0%', '0%', `${-side / 2}px`, `${-side / 2}px`], 'white: the top start corner, centered on it');
    assert.deepEqual(where(), [0, 0]);
    for (const s of T.s.list) $write(s, '#000000');
    $flush(T.dom.root);
    $flush(T.skia.root);
    assert.deepEqual([style().left, style().top], ['0%', '100%'], 'black: the bottom');
    assert.deepEqual(where(), [0, 1]);
    for (const s of T.s.list) $write(s, 'rgb(0, 128, 0)');
    $flush(T.dom.root);
    $flush(T.skia.root);
    assert.equal(style().left, '100%');
    assert.ok(Math.abs(where()[1] - (1 - 128 / 255)) < 0.01, 'green at half brightness: about halfway down');
    const panel = T.thumbDom().parentElement;
    assert.equal(panel.style.background, 'linear-gradient(90deg, #ffffff 0%, #00ff00 100%)', 'the ground across runs to the pure hue');
    assert.equal(T.thumbDom().style.backgroundColor || T.thumbDom().style.background, '#008000', 'the thumb is the color it points at');
    T.dispose();
  });

  it('looks: the theme\'s height and corner, a crosshair, the shade over the ground', () => {
    const t = setup();
    const panel = t.thumbDom().parentElement;
    const shade = panel.firstElementChild;
    assert.equal(panel.style.cursor, 'crosshair');
    assert.equal(panel.style.touchAction, 'none');
    assert.equal(panel.style.borderTopLeftRadius, shade.style.borderTopLeftRadius, 'the shade shares the corners');
    assert.equal(shade.style.background, 'linear-gradient(180deg, #00000000 0%, #000000 100%)');
    assert.deepEqual([panel.style.height, panel.style.borderTopLeftRadius], [`${BASE_THEME.sizes.picker.md.h}px`, `${BASE_THEME.radius.sm}px`]);
    const picker = primitives(t.skia).filter(n => n.pointers)[0].parent.getBoundingClientRect();
    assert.equal(t.box.width, picker.width, 'as wide as the picker');
    t.dispose();
  });
});

describe('a bordered HueSlider maps the pointer onto its ramp', () => {
  it('a quarter across the ramp, inside the border, is a quarter turn (Skia)', () => {
    /** @type {number[]} */
    const got = [];
    const { skia, dispose } = both(() => (
      <Rui>
        <View style={{ width: 300 }}>
          <HueSlider style={{ border: 10 }} onChange={(/** @type {number} */ v) => got.push(v)} />
        </View>
      </Rui>
    ));
    skia.text();
    const r = primitives(skia).find((/** @type {any} */ i) => i.label === 'Hue').parent.getBoundingClientRect();
    const x = r.left + 10 + (r.width - 20) / 4;
    skia.skia.press(x, r.top + r.height / 2);
    skia.skia.release(x, r.top + r.height / 2);
    $flush(skia.root);
    assert.equal(got.at(-1), 90);
    dispose();
  });
});
