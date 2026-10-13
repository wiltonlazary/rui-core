// Dot on the DOM and on Skia: the mark's center on the anchor point of its
// child's box, the offset toward the middle, the labeled pill, the ring,
// show, size and layer.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { View } from 'ren-core';
import { Rui, Dot, BASE_THEME, LAYERS, pageColors } from 'rui-core';
import { both } from './harness.jsx';
import { items, KIND } from './scene.js';

const W = 100;
const H = 40;

/** A Dot over a 100 × 40 box at the page's corner. @param {Record<string, any>} props @param {string} [scheme] */
const view = (props, scheme) => () => (
  <Rui scheme={scheme}>
    <Dot inline {...props}>
      <View data-child="" style={{ width: W, height: H }}>
        {null}
      </View>
    </Dot>
  </Rui>
);

/** The Skia items of the child, the point and the mark. @param {any} skia */
function skiaParts(skia) {
  const views = items(skia, KIND.View);
  const child = views.find(v => v.style.width === W);
  // The point: the item of no size the mark is centered on.
  const point = views.find(v => v.style.width === 0 && v.style.height === 0);
  const mark = views.find(v => v.parent === point && point !== undefined) ?? null;
  return { child, point, mark };
}

/** The DOM nodes of the point and the mark. @param {any} dom */
function domParts(dom) {
  const point = dom.nodes('View').find((/** @type {any} */ n) => n.style.position === 'absolute');
  return { point, mark: point?.firstElementChild ?? null };
}

/** The mark's center relative to the child's box on Skia. @param {any} skia */
function center(skia) {
  const { child, mark } = skiaParts(skia);
  const c = child.getBoundingClientRect();
  const m = mark.getBoundingClientRect();
  return [m.x + m.width / 2 - c.x, m.y + m.height / 2 - c.y];
}

/** Mounts a Dot on both renderers and gives the Skia center and the DOM parts. @param {Record<string, any>} props */
function place(props) {
  const { dom, skia, dispose } = both(view(props));
  const out = { center: center(skia), dom: domParts(dom), skia: skiaParts(skia) };
  dispose();
  return out;
}

describe('Dot', () => {
  it('puts an 8 px dot\'s center on the child\'s top end corner by default', () => {
    const { center: at, dom, skia } = place({});
    assert.deepEqual(at, [W, 0]);
    assert.deepEqual([skia.mark.getBoundingClientRect().width, skia.mark.getBoundingClientRect().height], [8, 8]);
    assert.equal(skia.mark.style.radiusTopLeft, BASE_THEME.radius.round, 'round');
    assert.deepEqual([dom.point.style.left, dom.point.style.top], ['100%', '0%']);
    assert.deepEqual([dom.point.style.width, dom.point.style.height], ['0px', '0px']);
    assert.equal(dom.mark.style.width, '8px');
    assert.equal(dom.point.style.justifyContent, 'center', 'the mark is centered on the point');
  });

  it('anchors by fractions: an edge midpoint, a partial anchor, clamping', () => {
    assert.deepEqual(place({ anchor: { x: 0.5, y: 1 } }).center, [W / 2, H]);
    assert.deepEqual(place({ anchor: { x: 0, y: 0.5 } }).center, [0, H / 2]);
    assert.deepEqual(place({ anchor: { y: 1 } }).center, [W, H], 'x keeps its default, 1');
    assert.deepEqual(place({ anchor: { x: 2, y: -1 } }).center, [W, 0], 'clamped to { x: 1, y: 0 }');
    const { dom } = place({ anchor: { x: 0.5, y: 1 } });
    assert.deepEqual([dom.point.style.left, dom.point.style.top], ['50%', '100%']);
  });

  it('offset moves a corner in on both axes, an edge midpoint across its edge, the center not at all', () => {
    assert.deepEqual(place({ offset: 3 }).center, [W - 3, 3], 'the top end corner, in by 3');
    assert.deepEqual(place({ anchor: { x: 0, y: 0.5 }, offset: 3 }).center, [3, H / 2], '3 px right of the start edge\'s midpoint');
    assert.deepEqual(place({ anchor: { x: 0.5, y: 1 }, offset: 3 }).center, [W / 2, H - 3], 'up from the bottom edge');
    assert.deepEqual(place({ anchor: { x: 0.5, y: 0.5 }, offset: 3 }).center, [W / 2, H / 2], 'the center stays');
    assert.deepEqual(place({ offset: -2 }).center, [W + 2, -2], 'negative moves out');
  });

  it('a labeled mark: its text on both renderers, a pill one xs line high, dark ink on a light fill', () => {
    const { dom, skia, dispose } = both(view({ label: 5, color: 'yellow.2' }));
    assert.equal(dom.text(), '5');
    assert.equal(skia.text(), '5');
    const { mark, child } = skiaParts(skia);
    const line = BASE_THEME.fontSizes.xs * BASE_THEME.lineHeights.sm;
    const box = mark.getBoundingClientRect();
    const near = (/** @type {number} */ v) => Math.round(v * 10) / 10;
    assert.equal(near(box.height), near(line));
    assert.equal(near(box.width), near(line), 'one figure: a circle');
    assert.deepEqual(center(skia).map(Math.round), [W, 0], 'centered on the anchor whatever its size');
    assert.equal(mark.style.fontSize, BASE_THEME.fontSizes.xs);
    assert.equal(mark.style.fontWeight, BASE_THEME.weights.strong);
    assert.equal(dom.nodes('Label')[0].parentElement.style.color, BASE_THEME.black, 'dark ink on yellow.2');
    // Skia paints the mark after the child: its layer.
    const commands = skia.skia.commands();
    assert.ok(commands.findIndex((/** @type {any[]} */ c) => c[0] === 'text') > 0);
    assert.ok(child !== undefined);
    dispose();
    const wide = both(view({ label: 128 }));
    const pill = skiaParts(wide.skia).mark.getBoundingClientRect();
    assert.ok(pill.width > pill.height, 'more figures widen the pill');
    assert.deepEqual(center(wide.skia).map(Math.round), [W, 0]);
    assert.equal(wide.dom.nodes('Label')[0].parentElement.style.color, BASE_THEME.white, 'light ink on the accent');
    wide.dispose();
  });

  it('bordered: a 1 px ring in raised in both schemes, the outer size unchanged', () => {
    for (const scheme of ['light', 'dark']) {
      const raised = pageColors(BASE_THEME, /** @type {any} */ (scheme)).raised;
      const { dom, skia, dispose } = both(view({ bordered: true }, scheme));
      const { mark } = skiaParts(skia);
      assert.equal(mark.style.borderTop, BASE_THEME.sizes.divider.xs);
      assert.equal(mark.style.borderLeft, 1);
      assert.equal(domParts(dom).mark.style.borderColor, raised, scheme);
      assert.deepEqual([mark.getBoundingClientRect().width, mark.getBoundingClientRect().height], [8, 8], 'the ring sits inside');
      assert.deepEqual(center(skia), [W, 0]);
      dispose();
    }
    const plain = place({}).skia.mark;
    assert.equal(plain.style.borderTop, 0);
  });

  it('shown={false} hides the mark and keeps the child; size by step and px; layer sets zIndex', () => {
    const hidden = both(view({ shown: false, label: 'x' }));
    assert.equal(hidden.dom.text(), '');
    assert.equal(hidden.skia.text(), '');
    assert.equal(skiaParts(hidden.skia).point, undefined);
    assert.ok(skiaParts(hidden.skia).child !== undefined, 'the child stays');
    assert.ok(hidden.dom.host.querySelector('[data-child]') !== null);
    hidden.dispose();
    assert.equal(place({ size: 'md' }).skia.mark.getBoundingClientRect().width, BASE_THEME.sizes.indicator.md);
    const px = place({ size: 11, anchor: { x: 0, y: 1 } });
    assert.equal(px.skia.mark.getBoundingClientRect().width, 11);
    assert.deepEqual(px.center, [0, H], 'placed by its center at any size');
    assert.equal(place({}).dom.point.style.zIndex, String(LAYERS.raised));
    assert.equal(place({ layer: 44 }).skia.point.style.zIndex, 44);
  });
});
