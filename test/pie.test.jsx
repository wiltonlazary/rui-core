// PieChart and DonutChart on the DOM and on Skia: the slices and their
// gaps, the default sweep from three o'clock clockwise, percent text,
// labels inside and around the rim, the donut's caption, and the tooltip.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Rui, BASE_THEME, colorOf, pageColors, isLight } from 'rui-core';
import { PieChart, DonutChart, polar } from 'rui-core/charts';
import { slices, percentText, pieModel } from '../src/ext/charts/pie.jsx';
import { both } from './harness.jsx';
import { primitives, same, hover, leave } from './chart-harness.jsx';

// A month's budget: savings under a tenth of it.
const budget = [
  { label: 'Rent', value: 1200, color: 'indigo' },
  { label: 'Food', value: 500, color: 'yellow.3' },
  { label: 'Travel', value: 300, color: 'teal' },
  { label: 'Savings', value: 100, color: 'grape' },
];

const t = BASE_THEME;
const line = t.chart.line;
const gap = t.spacing.xs / 2;
const chars = (/** @type {number} */ n) => n * t.chart.charWidth;

/** The chart on both renderers. @param {() => any} view */
const show = view => both(() => <Rui>{view()}</Rui>);

/** The top left of the first Shape on Skia (the chart's box). @param {any} skia */
const origin = skia => {
  const box = primitives(skia).filter(n => n.kind === 7)[0].getBoundingClientRect();
  return [box.left, box.top];
};

/**
 * Moves the pointer to a point given in the chart's box.
 * @param {{ dom: any, skia: any }} c @param {number} x @param {number} y
 */
const at = (c, x, y) => {
  const [left, top] = origin(c.skia);
  hover(c.dom, c.skia, Math.round(left + x), Math.round(top + y));
};

/** Each slice's [from, to], rounded to 1e-9. @param {{ from: number, to: number }[]} list */
const ends = list => list.map(s => [s.from, s.to].map(v => Math.round(v * 1e9) / 1e9 + 0));

describe('slices', () => {
  it('shares the sweep less a gap per slice, half a gap at each end', () => {
    assert.deepEqual(ends(slices([1, 1, 2, 0], 0, -360, 10)), [
      [-5, -87.5],
      [-97.5, -180],
      [-190, -355],
      [-360, -360],
    ]);
    assert.deepEqual(slices([1, 1, 2, 0], 0, -360, 10).map(s => s.share), [0.25, 0.25, 0.5, 0]);
  });

  it('a lone positive slice fills the sweep with no gap', () => {
    assert.deepEqual(ends(slices([0, 5, -2], 0, -360, 10)), [
      [0, 0],
      [0, -360],
      [-360, -360],
    ]);
  });

  it('a partial sweep counterclockwise, its ends inset half a gap', () => {
    assert.deepEqual(ends(slices([1, 3], 90, 180, 2)), [
      [91, 112.5],
      [114.5, 179],
    ]);
  });
});

describe('percentText', () => {
  it('whole percents, one decimal under 10 %', () => {
    assert.deepEqual([0.4, 0.05, 0.053, 0.0999, 1 / 3, 0.004].map(s => percentText(s)), ['40%', '5%', '5.3%', '10%', '33%', '0.4%']);
    assert.equal(percentText(0.053, 'de-DE'), '5,3 %', 'a locale of its own');
    assert.equal(percentText(0.25, 'en_US'), '25%', "a malformed locale: 'en-US'");
    assert.equal(percentText(0.25, ''), '25%', "an empty locale: 'en-US'");
    const m = pieModel({ data: [{ label: 'a', value: 1 }, { label: 'b', value: 3 }], labels: true, locale: 'en_US' }, false, BASE_THEME, 'light');
    assert.deepEqual(m.labels.map((/** @type {any} */ l) => l.text), ['25%', '75%'], 'a chart with a malformed locale still labels');
  });
});

describe('PieChart', () => {
  it('starts at three o\'clock and goes clockwise; gaps hit nothing', () => {
    const c = show(() => <PieChart data={budget} />);
    assert.equal(same(c.dom, c.skia), '');
    // Just below the right-hand rim: the first slice; just above it: the last.
    at(c, 90 + 80, 90 + 5);
    assert.equal(same(c.dom, c.skia), 'Rent 1200');
    at(c, 90 + 80, 90 - 5);
    assert.equal(same(c.dom, c.skia), 'Savings 100');
    leave(c.dom, c.skia);
    assert.equal(same(c.dom, c.skia), '');
    c.dispose();

    const wide = show(() => <PieChart data={budget} gap={20} />);
    const m = pieModel({ data: budget, gap: 20 }, false, t, 'light');
    const between = (m.parts[0].to + m.parts[1].from) / 2;
    const [x, y] = polar(90, 90, 60, between);
    at(wide, x, y);
    assert.equal(same(wide.dom, wide.skia), '', 'a gap holds no slice');
    wide.dispose();
  });

  it('draws a closed wedge per positive slice in its color, 1° apart by default', () => {
    const m = pieModel({ data: [...budget, { label: 'Gifts', value: 0 }] }, false, t, 'light');
    assert.deepEqual([m.width, m.height, m.outer, m.inner], [180, 180, 90, 0]);
    assert.equal(m.figures.length, 4, 'no wedge for a zero slice');
    assert.ok(m.figures.every(f => f.kind === 'path' && f.closed && !f.stroke), 'fills only, no strokes');
    assert.deepEqual(m.figures.map(f => f.color), budget.map(b => colorOf(t, 'light', b.color)));
    assert.equal(m.parts[0].from, -0.5);
    assert.deepEqual(m.figures[0].points.slice(-2), [90, 90], 'a pie wedge closes at the center');
  });

  it('labels inside a line in from the rim, black or white by contrast', () => {
    const c = show(() => <PieChart data={budget} labels />);
    assert.equal(same(c.dom, c.skia), '57% 24% 14% 4.8%');
    c.dispose();
    const m = pieModel({ data: budget, labels: true }, false, t, 'light');
    const colors = m.labels.map(l => l.color);
    assert.deepEqual(colors, budget.map(b => (isLight(colorOf(t, 'light', b.color), t.contrastThreshold) ? t.black : t.white)));
    assert.ok(colors.includes(t.black) && colors.includes(t.white), 'both picks in the fixture');
    const mid = (m.parts[0].from + m.parts[0].to) / 2;
    const [x, y] = polar(90, 90, 90 - t.chart.labelOffset - line, mid);
    const box = chars('57%'.length + 1);
    assert.deepEqual(m.labels[0], { text: '57%', x: Math.round(x - box / 2), y: Math.round(y - line / 2), w: box, align: 'center', color: colors[0] });
  });

  it('labels outside by quadrant: right, bottom, left and top, with leaders', () => {
    const four = ['East', 'South', 'West', 'North'].map(label => ({ label, value: 1, color: 'blue' }));
    const m = pieModel({ data: four, labels: true, labelsAt: 'outside', leaders: true, gap: 0, startAngle: 45, endAngle: -315 }, false, t, 'light');
    const box = chars('25%'.length + 1);
    const side = t.spacing.xs + gap + box;
    assert.deepEqual([m.width, m.height], [180 + 2 * side, 180 + 2 * (t.spacing.xs + gap + line)]);
    const [cx, cy] = [m.width / 2, m.height / 2];
    const reach = 90 + t.spacing.xs;
    assert.deepEqual(
      m.labels.map(l => [l.x, l.y, l.align]),
      [
        [Math.round(cx + reach + gap), Math.round(cy - line / 2), 'start'],
        [Math.round(cx - box / 2), Math.round(cy + reach + gap), 'center'],
        [Math.round(cx - reach - gap - box), Math.round(cy - line / 2), 'end'],
        [Math.round(cx - box / 2), Math.round(cy - reach - gap - line), 'center'],
      ],
    );
    assert.ok(m.labels.every(l => l.color === undefined), 'outside labels in the chart text color');
    const leaders = m.figures.filter(f => f.kind === 'line');
    assert.equal(leaders.length, 4);
    const [x0, y0] = polar(cx, cy, 90, 0);
    const [x1, y1] = polar(cx, cy, reach, 0);
    assert.deepEqual(leaders[0], { kind: 'line', x: x0, y: y0, right: x1, bottom: y1, color: colorOf(t, 'light', 'blue'), stroke: 1 });
    const c = show(() => <PieChart data={four} labels labelsAt="outside" leaders gap={0} startAngle={45} endAngle={-315} />);
    assert.equal(same(c.dom, c.skia), '25% 25% 25% 25%');
    c.dispose();
  });

  it('labelsAs="value" through `format`', () => {
    const c = show(() => <PieChart data={budget} labels labelsAs="value" format={(/** @type {number} */ v) => `$${v}`} />);
    assert.equal(same(c.dom, c.skia), '$1200 $500 $300 $100');
    c.dispose();
  });

  it("the tooltip: the slice, or every slice with scope 'chart'", () => {
    const c = show(() => <PieChart data={budget} tooltip={{ scope: 'chart' }} unit=" USD" />);
    at(c, 90 + 80, 90 + 5);
    assert.equal(same(c.dom, c.skia), 'Rent Food Travel Savings 1200 USD 500 USD 300 USD 100 USD');
    c.dispose();
    const off = show(() => <PieChart data={budget} tooltip={false} />);
    at(off, 90 + 80, 90 + 5);
    assert.equal(off.dom.text(), '');
    off.dispose();
  });
});

describe('DonutChart', () => {
  it('a 24 px ring of a 180 box, 2° gaps, labels always outside', () => {
    const m = pieModel({ data: budget }, true, t, 'light');
    assert.deepEqual([m.outer, m.inner, m.parts[0].from], [90, 66, -1]);
    const labeled = pieModel({ data: budget, labels: true, labelsAt: 'inside' }, true, t, 'light');
    assert.ok(labeled.width > 180 && labeled.labels.every(l => l.color === undefined), 'outside even when asked inside');
    const own = pieModel({ data: budget, size: 120, thickness: 30 }, true, t, 'light');
    assert.deepEqual([own.width, own.outer, own.inner], [120, 60, 30]);
  });

  it('the caption in the hole, md and strong in the text color; the hole hits nothing', () => {
    const c = show(() => <DonutChart data={budget} caption="$2100" />);
    assert.equal(same(c.dom, c.skia), '$2100');
    const label = c.dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === '$2100');
    assert.equal(parseFloat(label.style.fontSize), t.fontSizes.md);
    assert.equal(Number(label.style.fontWeight), t.weights.strong);
    assert.equal(label.style.color.replace(/\s/g, ''), pageColors(t, 'light').text);
    at(c, 90 + 20, 90 + 3);
    assert.equal(same(c.dom, c.skia), '$2100', 'the hole');
    at(c, 90 + 80, 90 + 5);
    assert.equal(same(c.dom, c.skia), '$2100 Rent 1200');
    c.dispose();
  });

  it('a node caption shows as given', () => {
    const c = show(() => <DonutChart data={budget} caption={<PieChart data={budget.slice(0, 2)} size={40} tooltip={false} />} />);
    same(c.dom, c.skia);
    assert.equal(primitives(c.skia).filter(n => n.kind === 7).length, 2, 'the donut and the pie in its hole');
    c.dispose();
  });
});
