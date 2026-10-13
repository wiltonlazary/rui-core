// FunnelChart on the DOM and on Skia: trapezoid rows ending in a
// rectangle, the gap between rows, labels inside or in a fitted column,
// and the tooltip by row.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Rui, BASE_THEME, colorOf, isLight } from 'rui-core';
import { FunnelChart } from 'rui-core/charts';
import { funnelModel } from '../src/ext/charts/funnel.jsx';
import { both } from './harness.jsx';
import { primitives, same, hover, leave } from './chart-harness.jsx';

// A shop's visitors a week, from the door to the till.
const shop = [
  { label: 'Visited', value: 1000, color: 'blue' },
  { label: 'Browsed', value: 600, color: 'yellow.3' },
  { label: 'Bought', value: 250, color: 'grape' },
];

const t = BASE_THEME;
const line = t.chart.line;

/** Rounds away float noise. @param {number[]} list */
const tidy = list => list.map(v => Math.round(v * 1e9) / 1e9 + 0);

/** The chart on both renderers. @param {() => any} view */
const show = view => both(() => <Rui>{view()}</Rui>);

/**
 * Moves the pointer to a point in the chart's box.
 * @param {{ dom: any, skia: any }} c @param {number} x @param {number} y
 */
const at = (c, x, y) => {
  const box = primitives(c.skia).filter(n => n.kind === 7)[0].getBoundingClientRect();
  hover(c.dom, c.skia, Math.round(box.left + x), Math.round(box.top + y));
};

describe('FunnelChart', () => {
  it('trapezoids narrowing to the next row, the last a rectangle, 2 px apart', () => {
    const m = funnelModel({ data: shop, size: 240 }, t, 'light');
    const h = (240 - 2 * 2) / 3;
    const y1 = h + 2;
    const y2 = 2 * h + 4;
    assert.deepEqual(
      m.figures.map(f => tidy(f.points)),
      [
        tidy([0, 0, 240, 0, 192, h, 48, h]),
        tidy([48, y1, 192, y1, 150, y1 + h, 90, y1 + h]),
        tidy([90, y2, 150, y2, 150, 240, 90, 240]),
      ],
    );
    assert.ok(m.figures.every(f => f.kind === 'path' && f.closed && !f.stroke), 'fills only');
    assert.deepEqual(m.figures.map(f => f.color), shop.map(s => colorOf(t, 'light', s.color)));
  });

  it('is 260 square by default; `gap={0}` joins the rows', () => {
    const m = funnelModel({ data: shop }, t, 'light');
    assert.deepEqual([m.width, m.height], [260, 260]);
    const flush = funnelModel({ data: shop, gap: 0 }, t, 'light');
    assert.deepEqual(flush.rows.map(r => tidy([r.top, r.bottom])), [tidy([0, 260 / 3]), tidy([260 / 3, 520 / 3]), tidy([520 / 3, 260])]);
    const c = show(() => <FunnelChart data={shop} />);
    assert.equal(same(c.dom, c.skia), '');
    c.dispose();
  });

  it('labels inside, black or white by contrast', () => {
    const c = show(() => <FunnelChart data={shop} labels />);
    assert.equal(same(c.dom, c.skia), '1000 600 250');
    c.dispose();
    const m = funnelModel({ data: shop, labels: true }, t, 'light');
    const colors = m.labels.map(l => l.color);
    assert.deepEqual(colors, shop.map(s => (isLight(colorOf(t, 'light', s.color), t.contrastThreshold) ? t.black : t.white)));
    assert.ok(colors.includes(t.black) && colors.includes(t.white));
    const h = (260 - 4) / 3;
    assert.deepEqual(m.labels[1], { text: '600', x: 0, y: Math.round(h + 2 + h / 2 - line / 2), w: 260, align: 'center', color: colors[1] });
  });

  it("labels at 'start' and 'end' in a column fitted to the longest", () => {
    const format = (/** @type {number} */ v) => `${v} people`;
    const column = t.chart.charWidth * ('1000 people'.length + 1);
    const span = 260 - column - t.spacing.xs;
    const start = funnelModel({ data: shop, labels: true, labelsAt: 'start', format }, t, 'light');
    assert.deepEqual(start.labels.map(l => [l.x, l.w, l.align]), Array(3).fill([0, column, 'end']));
    assert.deepEqual(tidy(start.figures[0].points.slice(0, 4)), tidy([column + t.spacing.xs, 0, 260, 0]), 'the funnel past the column');
    const end = funnelModel({ data: shop, labels: true, labelsAt: 'end', format }, t, 'light');
    assert.deepEqual(end.labels.map(l => [l.x, l.w, l.align]), Array(3).fill([260 - column, column, 'start']));
    assert.deepEqual(tidy(end.figures[0].points.slice(0, 4)), tidy([0, 0, span, 0]));
    const c = show(() => <FunnelChart data={shop} labels labelsAt="end" format={format} />);
    assert.equal(same(c.dom, c.skia), '1000 people 600 people 250 people');
    c.dispose();
  });

  it('the tooltip by row; a gap holds none', () => {
    const c = show(() => <FunnelChart data={shop} size={240} gap={10} />);
    const h = (240 - 20) / 3;
    at(c, 120, h + 10 + h / 2);
    assert.equal(same(c.dom, c.skia), 'Browsed 600');
    at(c, 120, h + 5);
    assert.equal(same(c.dom, c.skia), '', 'between rows');
    at(c, 30, 5);
    assert.equal(same(c.dom, c.skia), 'Visited 1000', 'by y alone');
    leave(c.dom, c.skia);
    assert.equal(same(c.dom, c.skia), '');
    c.dispose();
  });
});
