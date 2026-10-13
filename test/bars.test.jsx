// Bars: a label line over a thin bar per item, on the DOM and on Skia. The
// same text on both; fills as shares of the largest; the track, colors,
// sizes and head look; and what the list means.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $flush } from 'rrx-core';
import { Rui, BASE_THEME } from 'rui-core';
import { Bars } from 'rui-core/charts';
import { pageColors, colorOf } from '../src/theme/resolve.js';
import { both } from './harness.jsx';
import { primitives } from './chart-harness.jsx';

// Downloads last week, per platform.
const downloads = [
  { label: 'Linux', value: 800 },
  { label: 'macOS', value: 400, color: 'teal' },
  { label: 'Windows', value: 2 },
  { label: 'BSD', value: 0 },
];

const t = BASE_THEME;
const px = (/** @type {number} */ n) => `${n}px`;
const bg = (/** @type {any} */ n) => n.style.backgroundColor || n.style.background || '';

/**
 * Bars on both renderers, and their parts on the DOM: the list, its items,
 * each item's text line, track and fill (null when none), and a Skia twin's
 * box for any DOM node.
 * @param {Record<string, any>} props
 */
function render(props) {
  const r = both(() => (
    <Rui>
      <Bars data={downloads} w={400} {...props} />
    </Rui>
  ), { width: 480, height: 480 });
  $flush(r.dom.root);
  const nodes = [...r.dom.host.querySelectorAll('[data-ren]')];
  const list = nodes.find(n => n.getAttribute('role') === 'list');
  const items = nodes.filter(n => n.getAttribute('role') === 'listitem');
  const parts = items.map(item => {
    const [line, track] = [...item.children].filter(c => c.hasAttribute('data-ren'));
    return { item, line, track, fill: track.querySelector('[data-ren="View"]') };
  });
  r.skia.text();
  const twins = primitives(r.skia);
  assert.equal(twins.length, nodes.length, 'the same primitives on both');
  const box = (/** @type {any} */ n) => twins[nodes.indexOf(n)].getBoundingClientRect();
  return { ...r, list, parts, box };
}

describe('Bars on the DOM and on Skia', () => {
  it('shows the head, then each label and value, the same on both', () => {
    const r = render({ head: { label: 'Platform', value: 'Downloads' } });
    assert.equal(r.dom.text(), 'Platform Downloads Linux 800 macOS 400 Windows 2 BSD 0');
    assert.equal(r.skia.text(), r.dom.text());
    r.dispose();
    const plain = render({});
    assert.equal(plain.dom.text(), 'Linux 800 macOS 400 Windows 2 BSD 0', 'no head by default');
    plain.dispose();
  });

  it('fills each bar by its share of the largest; minLength for a tiny value, no fill for 0', () => {
    const r = render({});
    assert.deepEqual(r.parts.map(p => p.fill?.style.width ?? null), ['100%', '50%', '0.25%', null]);
    assert.deepEqual(r.parts.slice(0, 3).map(p => p.fill.style.minWidth), [px(t.sizes.progress.sm), px(t.sizes.progress.sm), px(t.sizes.progress.sm)]);
    // On Skia: 400 px of track, the tiny value held at 4 px.
    assert.deepEqual(r.parts.slice(0, 3).map(p => r.box(p.fill).width), [400, 200, t.sizes.progress.sm]);
    assert.equal(r.box(r.parts[3].track).width, 400);
    r.dispose();
    const own = render({ minLength: 10, data: [{ label: 'a', value: 1000 }, { label: 'b', value: 1 }, { label: 'c', value: -5 }, { label: 'd' }] });
    assert.deepEqual(own.parts.map(p => (p.fill === null ? null : own.box(p.fill).width)), [400, 10, null, null]);
    own.dispose();
  });

  it('bars are sizes.progress.md thick by default, `barSize` when given, round, labelGap under the text', () => {
    const r = render({});
    const { track, fill, item, line } = r.parts[0];
    assert.deepEqual([track.style.height, r.box(track).height, r.box(fill).height], [px(t.sizes.progress.md), 6, 6]);
    assert.equal(r.box(track).y - r.box(line).bottom, t.control.labelGap);
    assert.ok(parseFloat(track.style.borderRadius) >= t.radius.round && parseFloat(fill.style.borderRadius) >= t.radius.round);
    assert.equal(item.style.rowGap || item.style.gap, px(t.control.labelGap));
    r.dispose();
    const thick = render({ barSize: 12 });
    assert.deepEqual([thick.parts[0].track.style.height, thick.box(thick.parts[1].fill).height], [px(12), 12]);
    thick.dispose();
  });

  it('draws the track in the page\'s track role, clear with track={false}', () => {
    const r = render({});
    assert.deepEqual(r.parts.map(p => bg(p.track)), Array(4).fill(pageColors(t, 'light').track));
    r.dispose();
    const clear = render({ track: false });
    assert.deepEqual(clear.parts.map(p => bg(p.track)), Array(4).fill('transparent'));
    assert.equal(clear.parts[0].fill.style.width, '100%', 'the fill still shows');
    clear.dispose();
  });

  it('colors a fill by its item, else the chart\'s color, else the accent', () => {
    const accent = render({});
    assert.deepEqual(accent.parts.slice(0, 3).map(p => bg(p.fill)), [colorOf(t, 'light', undefined), colorOf(t, 'light', 'teal'), colorOf(t, 'light', undefined)]);
    accent.dispose();
    const own = render({ color: 'violet.4' });
    assert.deepEqual(own.parts.slice(0, 3).map(p => bg(p.fill)), [colorOf(t, 'light', 'violet.4'), colorOf(t, 'light', 'teal'), colorOf(t, 'light', 'violet.4')]);
    own.dispose();
  });

  it('formats values with `format` and `unit`', () => {
    const r = render({ format: (/** @type {number} */ v) => (v / 1000).toFixed(1), unit: 'k' });
    assert.equal(r.dom.text(), 'Linux 0.8k macOS 0.4k Windows 0.0k BSD 0.0k');
    assert.equal(r.skia.text(), r.dom.text());
    r.dispose();
  });

  it('spaces items spacing sm apart by default, `rowGap` when given', () => {
    const r = render({});
    assert.equal(r.list.style.rowGap || r.list.style.gap, px(t.spacing.sm));
    assert.equal(r.box(r.parts[1].item).y - r.box(r.parts[0].item).bottom, t.spacing.sm);
    r.dispose();
    const wide = render({ rowGap: 20 });
    assert.equal(wide.box(wide.parts[1].item).y - wide.box(wide.parts[0].item).bottom, 20);
    wide.dispose();
  });

  it('text: labels regular and values strong at sm in the text role; the head xs strong quiet, hidden', () => {
    const r = render({ head: { label: 'Platform', value: 'Downloads' } });
    const page = pageColors(t, 'light');
    const look = (/** @type {any} */ n) => [n.style.fontSize, n.style.fontWeight, n.style.color];
    const [label, value] = [...r.parts[0].line.children];
    assert.deepEqual([look(label), look(value)], [[px(t.fontSizes.sm), String(t.weights.regular), page.text], [px(t.fontSizes.sm), String(t.weights.strong), page.text]]);
    const head = r.list.firstElementChild;
    assert.equal(head.getAttribute('aria-hidden'), 'true');
    assert.deepEqual([...head.children].map(look), Array(2).fill([px(t.fontSizes.xs), String(t.weights.strong), page.quiet]));
    r.dispose();
  });

  it('means a list of items, each a name and its raw value', () => {
    const r = render({ 'aria-label': 'Downloads', format: (/** @type {number} */ v) => `${v} dl` });
    assert.equal(r.list.getAttribute('aria-label'), 'Downloads');
    assert.equal(r.list.getAttribute('role'), 'list');
    const fields = r.parts.map(({ item }) => {
      const name = item.querySelector('[itemprop="name"]');
      const value = item.querySelector('[itemprop="value"]');
      return [item.hasAttribute('itemscope'), name.textContent, value.getAttribute('content'), value.textContent];
    });
    assert.deepEqual(fields, [
      [true, 'Linux', '800', '800 dl'],
      [true, 'macOS', '400', '400 dl'],
      [true, 'Windows', '2', '2 dl'],
      [true, 'BSD', '0', '0 dl'],
    ]);
    r.dispose();
  });
});
