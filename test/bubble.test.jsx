// BubbleChart on the DOM and on Skia: the value axis, a band per harbor,
// bubbles at their values with areas from `range`, the grid, the axes
// switched off, and the tooltip under the pointer.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Rui, BASE_THEME, colorOf, alpha } from 'rui-core';
import { BubbleChart, valueAxis, linearScale, bandScale } from 'rui-core/charts';
import { bubbleModel } from '../src/ext/charts/bubble.jsx';
import { chartColors } from '../src/ext/charts/shared.jsx';
import { both } from './harness.jsx';
import { primitives, same, hover, leave } from './chart-harness.jsx';

// Ships in port a day at three harbors, and the berths each has.
const harbors = [
  { label: 'Harwick', ships: 12, berths: 4 },
  { label: 'Portsea', ships: 38, berths: 16 },
  { label: 'Kelby', ships: 21, berths: 9, color: 'teal' },
];

const t = BASE_THEME;
const W = 400;
/** The plot's box at w 400, h 300, with both axes. */
const plot = { left: t.chart.axisWidth, top: t.chart.frame.top, right: W - t.chart.frame.right, bottom: t.sizes.box.chart - t.sizes.box.bubble.label };
const radius = (/** @type {number} */ area) => Math.sqrt(area / Math.PI);

/** The chart on both renderers, in a window as wide as the chart. @param {() => any} view */
const show = view => both(() => <Rui>{view()}</Rui>, { width: W, height: 480 });

/** The drawn records of the first Shape on Skia. @param {any} skia */
const shapes = skia => primitives(skia).filter(n => n.kind === 7)[0].shapes;

/** Each bubble's fill record: its center and radius. @param {any[]} records */
const circles = records =>
  records
    .filter(r => r.kind === 'oval' && !(r.stroke > 0))
    .map(r => ({ x: (r.x + r.right) / 2, y: (r.y + r.bottom) / 2, r: (r.right - r.x) / 2 }));

describe('BubbleChart', () => {
  it('draws the same ticks, names and figures on both renderers', () => {
    const { dom, skia, dispose } = show(() => <BubbleChart w={W} data={harbors} valueKey="ships" label="Ships" />);
    assert.equal(same(dom, skia), '0 10 20 30 40 Ships Harwick Portsea Kelby');
    dispose();
  });

  it('centers each bubble in its band at its value on the inset axis', () => {
    const m = bubbleModel({ data: harbors, valueKey: 'ships' }, t, 'light', W, t.sizes.box.chart);
    const axis = valueAxis(12, 38, undefined);
    const inset = radius(400);
    const sy = linearScale(axis.min, axis.max, plot.bottom - inset, plot.top + inset);
    const band = bandScale(3, plot.left, plot.right);
    assert.deepEqual(
      circles(m.figures).map(c => [c.x, c.y]),
      harbors.map((h, i) => [band.center(i), sy(h.ships)]),
    );
    // The top tick's label is centered on its line.
    const top = m.labels.find(l => l.text === '40');
    assert.equal(top?.y, Math.round(sy(40) - t.chart.line / 2));
    assert.equal(top?.align, 'end');
  });

  it('maps sizes onto `range` areas: default, given, one row, equal sizes', () => {
    const areas = (/** @type {Record<string, any>} */ props) => circles(bubbleModel({ valueKey: 'ships', ...props }, t, 'light', W, 300).figures).map(c => Math.PI * c.r * c.r);
    const near = (/** @type {number[]} */ got, /** @type {number[]} */ want) => got.forEach((a, i) => assert.ok(Math.abs(a - want[i]) < 1e-9, `${a} is ${want[i]}`));
    near(areas({ data: harbors }), [24, 400, 24 + ((21 - 12) / (38 - 12)) * 376]);
    near(areas({ data: harbors, range: [100, 900] }), [100, 900, 100 + ((21 - 12) / (38 - 12)) * 800]);
    near(areas({ data: harbors.slice(0, 1) }), [400]);
    near(areas({ data: harbors.map(h => ({ ...h, ships: 20 })) }), [400, 400, 400]);
  });

  it('`sizeKey` sets the area apart from the value', () => {
    const m = bubbleModel({ data: harbors, valueKey: 'ships', sizeKey: 'berths' }, t, 'light', W, 300);
    const c = circles(m.figures);
    assert.ok(Math.abs(c[0].r - radius(24)) < 1e-9 && Math.abs(c[1].r - radius(400)) < 1e-9);
    assert.ok(Math.abs(Math.PI * c[2].r * c[2].r - (24 + ((9 - 4) / 12) * 376)) < 1e-9, 'Kelby by its 9 berths');
    const axis = valueAxis(12, 38, undefined);
    const sy = linearScale(axis.min, axis.max, plot.bottom - radius(400), plot.top + radius(400));
    assert.equal(c[2].y, sy(21), 'still at its ships');
  });

  it('a row without a value draws no bubble but keeps its name', () => {
    const rows = [...harbors, { label: 'Dunmore', berths: 3 }];
    const { dom, skia, dispose } = show(() => <BubbleChart w={W} data={rows} valueKey="ships" />);
    assert.equal(same(dom, skia), '0 10 20 30 40 Harwick Portsea Kelby Dunmore');
    assert.equal(circles(shapes(skia)).length, 3);
    dispose();
  });

  it('fills at the muted opacity with a 1 px ring in the color; a row\'s own color wins', () => {
    const { dom, skia, dispose } = show(() => <BubbleChart w={W} data={harbors} valueKey="ships" color="orange" />);
    same(dom, skia);
    const ovals = shapes(skia).filter((/** @type {any} */ r) => r.kind === 'oval');
    const orange = colorOf(t, 'light', 'orange');
    const teal = colorOf(t, 'light', 'teal');
    assert.deepEqual(
      ovals.map((/** @type {any} */ r) => [r.color, r.stroke ?? 0]),
      [[alpha(orange, t.opacity.muted), 0], [orange, 1], [alpha(orange, t.opacity.muted), 0], [orange, 1], [alpha(teal, t.opacity.muted), 0], [teal, 1]],
    );
    dispose();
  });

  it('grid: a line per tick by default, none when false', () => {
    const lines = (/** @type {any} */ grid) => bubbleModel({ data: harbors, valueKey: 'ships', grid }, t, 'light', W, 300).figures.filter(f => f.kind === 'line');
    const rows = lines(undefined);
    assert.equal(rows.length, 5);
    assert.ok(rows.every(l => l.x === plot.left && l.right === plot.right && l.stroke === 1 && l.color === chartColors(t, 'light').grid));
    assert.equal(lines(false).length, 0);
  });

  it('xAxis and yAxis off give their room to the plot', () => {
    const m = bubbleModel({ data: harbors, valueKey: 'ships', xAxis: false, yAxis: false, label: 'Ships' }, t, 'light', W, 300);
    assert.deepEqual(m.labels, [], 'no ticks, names or label');
    const lines = m.figures.filter(f => f.kind === 'line');
    assert.equal(lines[0].x, 0, 'the plot starts at 0');
    assert.equal(lines[0].y, 300 - radius(400), 'the 0 tick an inset over the bottom edge');
    const wide = bubbleModel({ data: harbors, valueKey: 'ships', yAxis: { width: 80, domain: [0, 50] } }, t, 'light', W, 300);
    assert.deepEqual(wide.labels.slice(0, 5).map(l => [l.text, l.w]), ['0', '12.5', '25', '37.5', '50'].map(s => [s, 80 - t.spacing.xs / 2]));
  });

  it('is 300 tall by default, `h` tall when given', () => {
    const { dom, skia, dispose } = show(() => (
      <>
        <BubbleChart w={W} data={harbors} valueKey="ships" />
        <BubbleChart w={W} h={180} data={harbors} valueKey="ships" />
      </>
    ));
    same(dom, skia);
    const boxes = primitives(skia).filter(n => n.kind === 7).map(n => Math.round(n.getBoundingClientRect().height));
    assert.deepEqual(boxes, [300, 180]);
    dispose();
  });

  it('the tooltip: inside a bubble, near a small one, nothing far away', () => {
    const { dom, skia, dispose } = show(() => <BubbleChart w={W} data={harbors} valueKey="ships" label="Ships" />);
    const base = '0 10 20 30 40 Ships Harwick Portsea Kelby';
    const [small, big] = circles(shapes(skia));
    hover(dom, skia, Math.round(big.x + big.r / 2), Math.round(big.y));
    assert.equal(same(dom, skia), `${base} Portsea Ships 38`);
    // Outside Harwick's small circle, within the chart's near distance of its center.
    hover(dom, skia, Math.round(small.x + small.r + t.chart.near / 2), Math.round(small.y));
    assert.equal(same(dom, skia), `${base} Harwick Ships 12`);
    hover(dom, skia, Math.round(small.x + small.r + t.chart.near * 2), Math.round(plot.top + 2));
    assert.equal(same(dom, skia), base);
    hover(dom, skia, Math.round(big.x), Math.round(big.y));
    leave(dom, skia);
    assert.equal(same(dom, skia), base, 'hidden on leave');
    dispose();
  });

  it('the tooltip names the size too when `sizeKey` differs; `tooltip={false}` shows none', () => {
    const a = show(() => <BubbleChart w={W} data={harbors} valueKey="ships" sizeKey="berths" unit=" a day" />);
    const base = '0 a day 10 a day 20 a day 30 a day 40 a day Harwick Portsea Kelby';
    assert.equal(same(a.dom, a.skia), base);
    const kelby = circles(shapes(a.skia))[2];
    hover(a.dom, a.skia, Math.round(kelby.x), Math.round(kelby.y));
    assert.equal(same(a.dom, a.skia), `${base} Kelby ships berths 21 a day 9`);
    a.dispose();
    const b = show(() => <BubbleChart w={W} data={harbors} valueKey="ships" tooltip={false} />);
    const quiet = same(b.dom, b.skia);
    hover(b.dom, b.skia, Math.round(kelby.x), Math.round(kelby.y));
    assert.equal(same(b.dom, b.skia), quiet);
    b.dispose();
  });
});
