// rui-core/charts on the DOM and on Skia: the scales, ticks, curves,
// stacking and arcs as units, then every chart on both renderers with the
// same text, the same Shape records and the same tooltip under the pointer.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $flush, $signal, $read, $write } from 'rrx-core';
import { View, $active } from 'ren-core';
import { Rui, Clock, manualClock, BASE_THEME, colorOf, pageColors } from 'rui-core';
import * as charts from 'rui-core/charts';
import {
  linearScale, bandScale, pointScale, niceStep, niceTicks, valueAxis, curvePoints, dashPattern, stackSeries, wedge, polar,
  AreaChart, BarChart, LineChart, MixedChart, RadarChart, ScatterChart, RadialBarChart, Sparkline, Legend,
} from 'rui-core/charts';
import { dashedLine, runs, splitAt, arcPoints, angleOf, onSweep, gradientFill } from '../src/ext/charts/path.js';
import { trendOf } from '../src/ext/charts/misc.jsx';
import { scatterModel } from '../src/ext/charts/scatter.jsx';
import { both } from './harness.jsx';
import { primitives, same, mirror, hover, leave, visits } from './chart-harness.jsx';

// ---------------------------------------------------------------- data

// Cups sold a day at three kiosks: the most, 1830, on Thursday at the pier.
const cups = [
  { day: 'Mon', Pier: 1240, Park: 860, Gate: 1015 },
  { day: 'Tue', Pier: 1395, Park: 1120, Gate: 730 },
  { day: 'Wed', Pier: 1610, Park: 945, Gate: 1180 },
  { day: 'Thu', Pier: 1830, Park: 1275, Gate: 1460 },
];
const kiosks = [
  { key: 'Pier', color: 'cyan.6' },
  { key: 'Park', color: 'amber.6' },
  { key: 'Gate', color: 'magenta.6' },
];

// ---------------------------------------------------------------- units

describe('chart scales and ticks', () => {
  it('niceTicks widens to whole steps of 1, 2, 2.5 or 5', () => {
    assert.deepEqual(niceTicks(0, 1830), { min: 0, max: 2000, ticks: [0, 500, 1000, 1500, 2000] });
    assert.deepEqual(niceTicks(0, 9800).ticks, [0, 2500, 5000, 7500, 10000]);
    assert.deepEqual(niceTicks(-3, 7).ticks, [-5, -2.5, 0, 2.5, 5, 7.5]);
    assert.deepEqual(niceTicks(0, 0.3).ticks, [0, 0.1, 0.2, 0.3], 'no floating-point noise');
    assert.deepEqual(niceTicks(5, 5).ticks, [0, 2, 4, 6], 'a flat series still has an axis');
    assert.equal(niceStep(0.37), 0.5);
    assert.equal(niceStep(23), 25);
  });

  it('niceTicks and valueAxis keep their steps at any scale: tiny, huge and negative ranges', () => {
    for (const [lo, hi, ticks] of /** @type {[number, number, number[]][]} */ ([
      [0, 5e-17, [0, 2e-17, 4e-17, 6e-17]],
      [-5e-17, 0, [-6e-17, -4e-17, -2e-17, 0]],
      [-1e-20, 3e-20, [-2e-20, 0, 2e-20, 4e-20]],
      [0, 3e-7, [0, 1e-7, 2e-7, 3e-7]],
      [0, 5e25, [0, 2e25, 4e25, 6e25]],
      [-3e25, 7e25, [-5e25, -2.5e25, 0, 2.5e25, 5e25, 7.5e25]],
      [-0.7, -0.1, [-0.8, -0.6, -0.4, -0.2, 0]],
      [1e6, 1e6 + 0.5, [1e6, 1e6 + 0.2, 1e6 + 0.4, 1e6 + 0.6]],
    ])) {
      const got = niceTicks(lo, hi);
      assert.deepEqual(got.ticks, ticks, `${lo} to ${hi}`);
      assert.deepEqual([got.min, got.max], [ticks[0], ticks.at(-1)], `${lo} to ${hi}: the ends`);
    }
    assert.deepEqual(valueAxis(1e-17, 4e-17, undefined).ticks, [0, 1e-17, 2e-17, 3e-17, 4e-17], 'a tiny series on its axis');
    assert.deepEqual(valueAxis(0, 0, [0, 1e-17]).ticks, [0, 2.5e-18, 5e-18, 7.5e-18, 1e-17], 'a tiny fixed domain');
  });

  it('niceTicks and valueAxis stay finite and few at the ends of the number line', () => {
    for (const [lo, hi, ticks] of /** @type {[number, number, number[] | null][]} */ ([
      // A nice end past the largest number: the data's own ends, divided evenly.
      [0, 1.7e308, [0, 4.25e307, 8.5e307, 1.275e308, 1.7e308]],
      [-1.7e308, 1.7e308, [-1.7e308, -8.5e307, 0, 8.5e307, 1.7e308]],
      [-Number.MAX_VALUE, Number.MAX_VALUE, null],
      [0, Number.MAX_VALUE, null],
      // A step under the smallest normal number.
      [0, 2e-323, null],
      [0, Number.MIN_VALUE, null],
      [-Number.MIN_VALUE, Number.MIN_VALUE, null],
    ])) {
      for (const got of [niceTicks(lo, hi), valueAxis(lo, hi, undefined)]) {
        const at = `${lo} to ${hi}: ${JSON.stringify(got)}`;
        if (ticks !== null) assert.deepEqual(got.ticks, ticks, at);
        assert.ok([got.min, got.max, ...got.ticks].every(Number.isFinite), `finite, ${at}`);
        assert.ok(got.ticks.length >= 2 && got.ticks.length <= 8, `a few ticks, ${at}`);
        assert.ok(got.ticks.every((t, i) => i === 0 || t > got.ticks[i - 1]), `rising, ${at}`);
        assert.ok(got.min <= lo && got.max >= hi && got.ticks[0] === got.min && got.ticks.at(-1) === got.max, `covering the data, ${at}`);
      }
    }
    assert.deepEqual(valueAxis(0, 0, [-1.7e308, 1.7e308]).ticks, [-1.7e308, -8.5e307, 0, 8.5e307, 1.7e308], 'a fixed domain as wide');
  });

  it('valueAxis takes 0 in, and a domain fixes its ends', () => {
    assert.deepEqual(valueAxis(640, 1830, undefined).ticks, [0, 500, 1000, 1500, 2000]);
    assert.deepEqual(valueAxis(640, 1830, [0, 2400]).ticks, [0, 600, 1200, 1800, 2400], 'a fixed domain divides evenly');
    assert.deepEqual(valueAxis(-120, 80, undefined).ticks, [-150, -100, -50, 0, 50, 100]);
    assert.deepEqual(valueAxis(20, 60, ['dataMin', 'dataMax'], 5, false), { min: 20, max: 60, ticks: [20, 30, 40, 50, 60] });
  });

  it('linear, band and point scales', () => {
    const s = linearScale(0, 100, 200, 0);
    assert.equal(s(25), 150);
    assert.equal(linearScale(3, 3, 0, 10)(3), 5, 'an empty domain maps to the middle');
    const band = bandScale(4, 0, 400);
    assert.deepEqual([band.step, band.start(1), band.center(1), band.index(250), band.index(999)], [100, 100, 150, 2, 3]);
    const point = pointScale(3, 60, 380);
    assert.deepEqual([point.center(0), point.center(2), point.index(225), point.index(0)], [60, 380, 1, 0]);
    assert.equal(pointScale(1, 0, 100).center(0), 50);
  });
});

describe('chart geometry', () => {
  it('curves: linear, the steps, and monotone through every point without overshoot', () => {
    const xs = [0, 10, 20];
    const ys = [0, 10, 10];
    assert.deepEqual(curvePoints(xs, ys, 'linear'), [0, 0, 10, 10, 20, 10]);
    assert.deepEqual(curvePoints(xs, ys, 'step'), [0, 0, 5, 0, 5, 10, 10, 10, 15, 10, 15, 10, 20, 10]);
    assert.deepEqual(curvePoints(xs, ys, 'stepBefore'), [0, 0, 0, 10, 10, 10, 10, 10, 20, 10]);
    assert.deepEqual(curvePoints(xs, ys, 'stepAfter'), [0, 0, 10, 0, 10, 10, 20, 10, 20, 10]);
    for (const type of ['monotone', 'natural', 'bump']) {
      const p = curvePoints(xs, ys, type);
      assert.deepEqual([p[0], p[1], p[p.length - 2], p[p.length - 1]], [0, 0, 20, 10], `${type} ends on the ends`);
      assert.ok(p.some((v, i) => i % 2 === 0 && v === 10 && Math.abs(p[i + 1] - 10) < 1e-9), `${type} passes the middle point`);
    }
    const mono = curvePoints(xs, ys, 'monotone');
    for (let i = 1; i < mono.length; i += 2) assert.ok(mono[i] >= -1e-9 && mono[i] <= 10 + 1e-9, 'monotone stays within the data');
  });

  it('a vertical gradient: the polygon whole, filled from the top\'s opacity to the bottom\'s', () => {
    const peak = [0, 20, 5, 2, 10, 12, 15, 4, 20, 20];
    const fill = gradientFill(peak, o => `c${o}`, 1, 0);
    assert.deepEqual(fill, [{ kind: 'path', closed: true, color: 'c1', fill: { linear: 180, stops: [[0, 'c1'], [1, 'c0']] }, points: peak }]);
    assert.deepEqual(gradientFill([0, 0, 1, 1], () => 'c', 1, 0), [], 'no polygon');
  });

  it('dashes, runs and a split at zero', () => {
    assert.deepEqual(dashPattern('6 3'), [6, 3]);
    assert.deepEqual(dashPattern(3), [3, 3]);
    assert.deepEqual(dashPattern(undefined), []);
    const dashes = dashedLine(0, 0, 22, 0, '#000', 1, [6, 3]);
    assert.deepEqual(dashes.map(d => [d.x, d.right]), [[0, 6], [9, 15], [18, 22]]);
    assert.equal(dashedLine(0, 0, 22, 0, '#000', 1, []).length, 1, 'solid: one line');
    assert.deepEqual(runs([1, NaN, 2, 3], true), [[0, 2, 3]]);
    assert.deepEqual(runs([1, NaN, 2, 3], false), [[0], [2, 3]]);
    const { above, below } = splitAt([0, -10, 10, 10], 0);
    assert.deepEqual(above, [[0, -10, 5, 0]]);
    assert.deepEqual(below, [[5, 0, 10, 10]]);
  });

  it('a share chart with a negative value extends its axis below 0, and every bar stays in the plot', async () => {
    const { cartesianModel } = await import('../src/ext/charts/cartesian.jsx');
    const m = cartesianModel({ kind: 'share', data: [{ label: 'x', a: -5, b: 10 }, { label: 'y', a: 3, b: 1 }], series: [{ key: 'a' }, { key: 'b' }] }, 'bar', BASE_THEME, 'light', 400, 300, null);
    const [lo, hi] = [m.plot.top, m.plot.bottom];
    const bars = m.figures.filter((/** @type {any} */ f) => f.kind === 'rect' || f.kind === 'round');
    assert.ok(bars.length >= 4, `the bars: ${bars.length}`);
    for (const f of bars) assert.ok(f.y >= lo - 0.5 && f.bottom <= hi + 0.5, `a bar within the plot: ${f.y}..${f.bottom} in ${lo}..${hi}`);
    const ticks = m.labels.map((/** @type {any} */ l) => l.text).filter((/** @type {string} */ t) => t.endsWith('%'));
    assert.deepEqual(ticks, ['-50%', '-25%', '0%', '25%', '50%', '75%', '100%'], 'the axis reaches the lowest share, a -33% one');
  });

  it('stacking: signs apart, percents of each row', () => {
    const rows = [{ a: 2, b: 3 }, { a: -1, b: 4 }, { a: null, b: 1 }];
    const [a, b] = stackSeries(rows, ['a', 'b'], 'stack');
    assert.deepEqual([...a.lo, ...a.hi], [0, 0, NaN, 2, -1, NaN]);
    assert.deepEqual([...b.lo, ...b.hi], [2, 0, 0, 5, 4, 1]);
    const [pa, pb] = stackSeries([{ a: 1, b: 3 }], ['a', 'b'], 'share');
    assert.deepEqual([pa.hi[0], pb.lo[0], pb.hi[0]], [25, 25, 100]);
  });

  it('arcs and wedges on polar angles', () => {
    const [x, y] = polar(0, 0, 10, 90);
    assert.ok(Math.abs(x) < 1e-9 && Math.abs(y + 10) < 1e-9, '90° is up');
    const arc = arcPoints(0, 0, 10, 0, 90);
    assert.equal(arc.length, (Math.ceil(90 / 4) + 1) * 2);
    const pie = wedge(50, 50, 0, 40, 0, 90);
    assert.deepEqual(pie.slice(-2), [50, 50], 'a pie wedge returns to the center');
    assert.equal(wedge(50, 50, 20, 40, 0, 90).length, arc.length * 2, 'a ring sector runs back on the inner arc');
    assert.deepEqual(angleOf(0, 0, 0, -5), { deg: 90, r: 5 });
    assert.ok(onSweep(10, -20, 30) && onSweep(350, -20, 30) && !onSweep(40, -20, 30));
  });

  it('trends', () => {
    assert.deepEqual([trendOf([1, 3]), trendOf([3, null, 1]), trendOf([2, 2])], ['up', 'down', 'flat']);
  });
});

// ---------------------------------------------------------------- charts

describe('cartesian charts on the DOM and on Skia', () => {
  it('AreaChart: the same ticks, legend and figures; the tooltip follows the pointer', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <AreaChart w={400} h={240} data={cups} category="day" series={kiosks} legend fade />
      </Rui>
    ));
    // The legend under the plot by default (bottom-start).
    assert.equal(same(dom, skia), '0 500 1000 1500 2000 Mon Tue Wed Thu Pier Park Gate');
    // The plot runs from x 56 (the theme's axis width) to 380 from the top; points 108 px apart.
    hover(dom, skia, 56 + 108 + 20, 100);
    // The tooltip's rows as a table: the names' column, then the values'.
    assert.equal(same(dom, skia), '0 500 1000 1500 2000 Mon Tue Wed Thu Pier Park Gate Tue Pier Park Gate 1395 1120 730');
    hover(dom, skia, 375, 100);
    assert.match(dom.text(), /Thu Pier Park Gate 1830 1275 1460$/);
    assert.equal(skia.text(), dom.text());
    leave(dom, skia);
    assert.equal(same(dom, skia), '0 500 1000 1500 2000 Mon Tue Wed Thu Pier Park Gate');
    const legend = primitives(skia).find(n => n.kind === 3 && n.text === 'Pier').getBoundingClientRect();
    assert.ok(legend.top > 200 && legend.left < 30, `the legend at the bottom's start: ${legend.left}, ${legend.top}`);

    // Over a legend item its series keeps its colors, the others drop to the theme's chart dim (0.16) of theirs.
    const at = skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === 'Park');
    skia.skia.move(at[2] + 2, at[3] - 3);
    $flush(skia.root);
    dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === 'Park').parentElement.dispatchEvent(new dom.window.PointerEvent('pointerenter'));
    $flush(dom.root);
    same(dom, skia);
    const fills = primitives(skia).filter(n => n.kind === 7)[0].shapes.filter((/** @type {any} */ r) => r.kind === 'path' && r.closed).map((/** @type {any} */ r) => r.color);
    // Each fill fades down (fade): one gradient figure a series, its top the strongest.
    const shaded = primitives(skia).filter(n => n.kind === 7)[0].shapes.filter((/** @type {any} */ r) => r.fill?.linear === 180);
    assert.equal(shaded.length, 3, 'one gradient fill a series, no bands');
    const top = (/** @type {string} */ c) => Math.max(...fills.filter((/** @type {string} */ x) => x.startsWith(c)).map((/** @type {string} */ x) => parseInt(x.slice(7), 16)));
    assert.deepEqual([top('#067885'), top('#915e04'), top('#aa377b')].map(a => Math.round((a / 255) * 100) / 100), [0.03, 0.16, 0.03], 'Park at opacity.faint (0.16), the others at 0.16 × 0.16');
    dispose();

    // By default: one solid fill per series at the theme's opacity.faint (0.16), no points at rest, the grid's rows only.
    const flat = both(() => (
      <Rui>
        <AreaChart w={400} h={240} data={cups} category="day" series={kiosks} />
      </Rui>
    ));
    same(flat.dom, flat.skia);
    const records = primitives(flat.skia).filter(n => n.kind === 7)[0].shapes;
    const solid = records.filter((/** @type {any} */ r) => r.kind === 'path' && r.closed).map((/** @type {any} */ r) => r.color);
    assert.deepEqual(solid, ['#06788529', '#915e0429', '#aa377b29']);
    assert.equal(records.filter((/** @type {any} */ r) => r.kind === 'oval').length, 0, 'points show on hover only');
    const across = records.filter((/** @type {any} */ r) => r.kind === 'line' && r.y === r.bottom);
    const down = records.filter((/** @type {any} */ r) => r.kind === 'line' && r.x === r.right);
    assert.ok(across.length > 0 && down.length === 0, 'grid rows, no tick marks');
    assert.deepEqual([across[0].x, across[0].right], [56, 60], 'dashed 4 2');
    flat.dispose();
  });

  it("the legend and the tooltip: tone dots, quiet names, strong values; the legend's active label in the text color", () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <AreaChart w={400} h={240} data={cups} category="day" series={kiosks} legend />
      </Rui>
    ));
    same(dom, skia);
    const page = pageColors(BASE_THEME, 'light');
    const { fontSizes, lineHeights, ratios, weights } = BASE_THEME;
    const label = (/** @type {string} */ text, /** @type {number} */ nth = 0) => dom.nodes('Label').filter((/** @type {any} */ n) => n.textContent === text)[nth];
    const colorOfNode = (/** @type {any} */ n) => n.style.color.replace(/\s/g, '');
    assert.deepEqual(['Pier', 'Park', 'Gate'].map(t => colorOfNode(label(t))), Array(3).fill(page.quiet), 'legend labels on the quiet role');
    // The tone dot: ratios.mark of an sm line, in the series' color.
    const side = fontSizes.sm * lineHeights.sm * ratios.mark;
    const dot = label('Park').previousElementSibling.firstElementChild;
    assert.deepEqual([parseFloat(dot.style.width), parseFloat(dot.style.height)].map(v => Math.round(v * 100) / 100), [side, side].map(v => Math.round(v * 100) / 100));
    assert.equal(dot.style.background.replace(/\s/g, ''), colorOf(BASE_THEME, 'light', 'amber.6'));
    label('Park').parentElement.dispatchEvent(new dom.window.PointerEvent('pointerenter'));
    $flush(dom.root);
    assert.equal(colorOfNode(label('Park')), page.text, 'the active item reads in the text color');
    assert.equal(colorOfNode(label('Pier')), page.quiet);
    label('Park').parentElement.dispatchEvent(new dom.window.PointerEvent('pointerleave'));
    $flush(dom.root);
    assert.equal(colorOfNode(label('Park')), page.quiet);
    hover(dom, skia, 56 + 108 + 20, 100);
    assert.match(dom.text(), /Tue Pier Park Gate 1395 1120 730$/);
    const heading = label('Tue', 1);
    // The box: no edge, on the page's sunken ground.
    const box = heading.parentElement;
    assert.equal(box.style.background.replace(/\s/g, ''), page.sunken, 'the sunken ground');
    assert.ok(!/(^|;\s*)border(-width|-style|-color)?:/.test(box.getAttribute('style') ?? ''), 'no edge');
    assert.equal(colorOfNode(heading), page.text);
    assert.equal(Number(heading.style.fontWeight), weights.strong, 'the heading strong');
    const name = label('Park', 1);
    const value = label('1120');
    assert.equal(colorOfNode(name), page.quiet, 'a series name on the quiet role');
    assert.equal(Number(name.style.fontWeight), weights.regular);
    assert.deepEqual([colorOfNode(value), Number(value.style.fontWeight)], [page.text, weights.strong], 'its value strong in the text color');
    assert.ok(name.previousElementSibling.firstElementChild.style.background.replace(/\s/g, '') === colorOf(BASE_THEME, 'light', 'amber.6'), "the row's tone dot");
    // Two columns: the names' and the values' (aligned to its end).
    assert.equal(name.parentElement.parentElement.nextElementSibling, value.parentElement, 'the values in the next column');
    dispose();
  });

  it('AreaChart kinds: stack, share and diverge; curve types; the formatter and unit', () => {
    for (const [props, text] of /** @type {const} */ ([
      [{ kind: 'stack' }, '0 2000 4000 6000 Mon Tue Wed Thu'],
      [{ kind: 'share' }, '0% 25% 50% 75% 100% Mon Tue Wed Thu'],
      [{ curve: 'step', format: (/** @type {number} */ v) => `${v / 1000}k`, unit: '$' }, '0k$ 0.5k$ 1k$ 1.5k$ 2k$ Mon Tue Wed Thu'],
      [{ curve: 'bump', grid: 'both', ticks: 'both', points: true }, '0 500 1000 1500 2000 Mon Tue Wed Thu'],
    ])) {
      const { dom, skia, dispose } = both(() => (
        <Rui>
          <AreaChart w={400} h={220} data={cups} category="day" series={kiosks} {...props} />
        </Rui>
      ));
      assert.equal(same(dom, skia), text, JSON.stringify(Object.keys(props)));
      dispose();
    }
    const split = [{ d: 'a', v: 3 }, { d: 'b', v: -2 }, { d: 'c', v: 1 }];
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <AreaChart w={300} h={200} data={split} category="d" series={[{ key: 'v', color: 'blue' }]} kind="diverge" curve="linear" />
      </Rui>
    ));
    same(dom, skia);
    const records = primitives(skia).filter(n => n.kind === 7)[0].shapes;
    const fills = records.filter((/** @type {any} */ r) => r.kind === 'path' && r.closed).map((/** @type {any} */ r) => r.color);
    assert.deepEqual(fills, ['#087c6a29', '#087c6a29', '#a94a0029'], 'teal above zero (two pieces), orange below (signColors); fill opacity opacity.faint');
    dispose();
  });

  it('reference labels sit at their `at`: a value line\'s at its end or start, a category line\'s at the top or bottom', () => {
    const view = (/** @type {any} */ at) => () => (
      <Rui>
        <BarChart w={400} h={220} data={cups} category="day" series={kiosks} references={[{ y: 1500, label: 'Goal', at }]} />
      </Rui>
    );
    const goalX = (/** @type {any} */ at) => {
      const { skia, dispose } = both(view(at));
      skia.text();
      const x = skia.skia.commands().find((/** @type {any[]} */ c) => c[0] === 'text' && c[1] === 'Goal')[2];
      dispose();
      return x;
    };
    const end = goalX(undefined);
    const start = goalX('start');
    assert.ok(start < end - 100, `start sits at the plot's start (${start}), end at its end (${end})`);
  });

  it('ScatterChart reference labels sit at their `at` too', () => {
    const data = [{ label: 'Runs', color: 'teal', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }];
    const label = (/** @type {any} */ line, /** @type {string} */ text) => {
      const m = scatterModel({ data, references: [line] }, BASE_THEME, 'light', 400, 220);
      return m.labels.find((/** @type {any} */ l) => l.text === text);
    };
    assert.equal(label({ y: 5, label: 'Par' }, 'Par').align, 'end', 'a value line: at its end by default');
    assert.equal(label({ y: 5, label: 'Par', at: 'start' }, 'Par').align, 'start', 'at its start');
    const top = label({ x: 5, label: 'Mid' }, 'Mid').y;
    const bottom = label({ x: 5, label: 'Mid', at: 'bottom' }, 'Mid').y;
    assert.ok(bottom > top + 100, `an x line: at the top by default (${top}), at the bottom when asked (${bottom})`);
  });

  it('BarChart: group, stack, share, cascade, vertical; the band cursor', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <BarChart w={400} h={220} data={cups} category="day" series={kiosks} references={[{ y: 1500, label: 'Goal' }]} />
      </Rui>
    ));
    assert.equal(same(dom, skia), '0 500 1000 1500 2000 Mon Tue Wed Thu Goal');
    const shapes = primitives(skia).filter(n => n.kind === 7)[0].shapes;
    const bars = shapes.filter((/** @type {any} */ r) => r.kind === 'rect');
    assert.equal(bars.length, 12, 'three bars per category');
    // Band 81 px wide (56 to 380); the group its 0.72 (theme.chart.band), 58.32 px;
    // three bars apart by the 0.28 the band leaves of a bar's slot (under bandGap 6).
    const { band, bandGap } = BASE_THEME.chart;
    const gap = Math.min(bandGap, ((81 * band) / 3) * (1 - band));
    const bar = (81 * band - 2 * gap) / 3;
    assert.deepEqual([bars[0].x, bars[0].right, bars[4].x].map(v => Math.round(v * 100) / 100), [67.34, 83.15, 88.59]);
    assert.equal(Math.round((bars[4].x - bars[0].right) * 100) / 100, Math.round(gap * 100) / 100);
    assert.equal(Math.round((bars[0].right - bars[0].x) * 100) / 100, Math.round(bar * 100) / 100);
    // A reference line without a color takes the theme's chart reference color.
    const goal = shapes.filter((/** @type {any} */ r) => r.kind === 'line' && r.y === r.bottom).at(-1);
    assert.equal(goal.color, colorOf(BASE_THEME, 'light', BASE_THEME.chart.reference));
    hover(dom, skia, 56 + 81 + 40, 60);
    assert.match(dom.text(), /Goal Tue Pier Park Gate 1395 1120 730$/);
    same(dom, skia);
    const cursor = primitives(skia).filter(n => n.kind === 7)[1].shapes;
    assert.deepEqual(cursor.map((/** @type {any} */ r) => [r.kind, r.x, r.right]), [['rect', 81, 162]], 'the cursor covers the band');
    dispose();

    for (const [props, text] of /** @type {const} */ ([
      [{ kind: 'stack' }, '0 2000 4000 6000 Mon Tue Wed Thu'],
      [{ kind: 'share' }, '0% 25% 50% 75% 100% Mon Tue Wed Thu'],
      [{ across: true, yAxis: { width: 70 } }, 'Mon Tue Wed Thu 0 500 1000 1500 2000'],
    ])) {
      const b = both(() => (
        <Rui>
          <BarChart w={400} h={220} data={cups} category="day" series={kiosks} {...props} />
        </Rui>
      ));
      assert.equal(same(b.dom, b.skia), text);
      b.dispose();
    }
    const flow = [
      { item: 'Start', v: 100, color: 'blue' },
      { item: 'Loss', v: -30, color: 'red' },
      { item: 'Total', v: 70, total: true, color: 'green' },
    ];
    const w = both(() => (
      <Rui>
        <BarChart w={300} h={200} data={flow} category="item" kind="cascade" series={[{ key: 'v', color: 'blue' }]} />
      </Rui>
    ));
    same(w.dom, w.skia);
    const rects = primitives(w.skia).filter(n => n.kind === 7)[0].shapes.filter((/** @type {any} */ r) => r.kind === 'rect');
    const scale = linearScale(0, 100, 170, 10);
    assert.deepEqual(rects.map((/** @type {any} */ r) => [Math.round(r.y), Math.round(r.bottom)]), [[10, 170], [10, Math.round(scale(70))], [Math.round(scale(70)), 170]], 'a running total, the total row from 0');
    assert.deepEqual(rects.map((/** @type {any} */ r) => r.color), ['#006bc1e0', '#b63636e0', '#05803ae0'], "a row's color, at opacity.dense (0.88)");
    w.dispose();
  });

  it('LineChart and MixedChart: dashes, nulls, mixed series; per-root tooltips', () => {
    const gaps = [
      { m: 'Jan', a: 10, b: 5 },
      { m: 'Feb', a: null, b: 8 },
      { m: 'Mar', a: 30, b: 12 },
    ];
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <LineChart w={360} h={200} data={gaps} category="m" bridge={false} series={[{ key: 'a', color: 'purple' }, { key: 'b', color: 'cyan', dash: '4 4', label: 'Bees' }]} legend={{ at: 'bottom' }} />
      </Rui>
    ));
    assert.equal(same(dom, skia), '0 10 20 30 Jan Feb Mar a Bees');
    // On the DOM only: the Skia root keeps no tooltip.
    const nodes = mirror(dom, skia);
    const overlay = nodes.filter(n => n.getAttribute('data-ren') === 'View').find(n => n.getBoundingClientRect().left === 56);
    overlay.dispatchEvent(new dom.window.PointerEvent('pointermove', { clientX: 56 + 140, clientY: 50, bubbles: true }));
    $flush(dom.root);
    assert.equal(dom.text(), '0 10 20 30 Jan Feb Mar a Bees Feb Bees 8');
    assert.equal(skia.text(), '0 10 20 30 Jan Feb Mar a Bees', 'roots are isolated');
    dispose();

    const c = both(() => (
      <Rui>
        <MixedChart w={400} h={220} data={cups} category="day" series={[{ key: 'Pier', color: 'cyan', kind: 'bar' }, { key: 'Park', color: 'amber', kind: 'area' }, { key: 'Gate', color: 'magenta', kind: 'line' }]} yAxis={{ title: 'Cups' }} xAxis={{ title: 'Day' }} />
      </Rui>
    ));
    assert.equal(same(c.dom, c.skia), '0 500 1000 1500 2000 Mon Tue Wed Thu Day Cups');
    const fillsOf = primitives(c.skia).filter(n => n.kind === 7).flatMap(n => n.shapes ?? []).filter(r => r.kind === 'path' && r.closed);
    assert.deepEqual(fillsOf.map(r => r.color), ['#915e0429'], 'the area at opacity.faint, as AreaChart\'s: the bars show through');
    hover(c.dom, c.skia, 56 + 243 + 30, 120);
    assert.match(c.dom.text(), /Thu Pier Park Gate 1830 1275 1460$/);
    same(c.dom, c.skia);
    c.dispose();

    // `across`: the bars run across, the categories down the start.
    const x = both(() => (
      <Rui>
        <MixedChart w={400} h={220} data={cups} category="day" across series={[{ key: 'Pier', color: 'cyan', kind: 'bar' }, { key: 'Gate', color: 'magenta', kind: 'line' }]} />
      </Rui>
    ));
    assert.equal(same(x.dom, x.skia), 'Mon Tue Wed Thu 0 500 1000 1500 2000');
    const bar = primitives(x.skia).filter(n => n.kind === 7)[0].shapes.find((/** @type {any} */ r) => r.kind === 'rect');
    assert.ok(bar.right - bar.x > bar.bottom - bar.y, 'a bar wider than tall');
    x.dispose();
  });

  it('turned axis labels: xAxis.angle, and the y axis label at −90°', () => {
    const days = [{ d: 'January 1', a: 1 }, { d: 'February 2', a: 3 }];
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <LineChart w={400} h={220} data={days} category="d" series={[{ key: 'a' }]} yAxis={{ title: 'Sold' }} xAxis={{ angle: -45 }} />
      </Rui>
    ));
    assert.equal(same(dom, skia), '0 1 2 3 January 1 February 2 Sold');
    const style = (/** @type {string} */ text) => dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === text).getAttribute('style');
    assert.match(style('Sold'), /rotate: -90deg/);
    // The tick's end at its tick: turned about its right middle.
    assert.match(style('January 1'), /rotate: -45deg; transform-origin: 78px 8px/);
    const turns = skia.skia.commands().filter((/** @type {any[]} */ c) => c[0] === 'transform');
    assert.equal(turns.length, 3, 'two ticks and the axis label turned on Skia');
    // The y label stands along the left edge: its box turned about its center, 16 px wide there.
    const sold = primitives(skia).find(i => i.kind === 3 && i.text === 'Sold').getBoundingClientRect();
    assert.ok(Math.abs(sold.left + sold.width / 2 - 8) <= 1, 'centered on x 8');
    dispose();
  });

  it('a chart without `w` takes its box’s width after layout and follows its resizes (Skia)', () => {
    const clock = manualClock();
    /** @type {any[]} */
    const boxes = [];
    const { dom, skia, dispose } = both(() => {
      const box = $signal($active(), 480);
      boxes.push(box);
      return (
      <Clock value={clock}>
        <Rui>
          <View style={() => ({ width: $read(box) })}>
            <LineChart h={200} data={cups} category="day" series={kiosks} />
          </View>
        </Rui>
      </Clock>
      );
    });
    const lastAt = () => {
      skia.text();
      const labels = primitives(skia).filter(n => n.kind === 3);
      const last = labels[labels.length - 1].getBoundingClientRect();
      return Math.round(last.left + last.width / 2);
    };
    // The first layout's onResize gives the width.
    skia.text();
    $flush(skia.root);
    assert.equal(skia.text(), '0 500 1000 1500 2000 Mon Tue Wed Thu');
    assert.ok(Math.abs(lastAt() - 460) <= 1, 'the last point at the plot’s right, 480 − 20');
    // A narrower box: onResize, and the chart draws at the new width.
    for (const box of boxes) $write(box, 300);
    skia.text();
    $flush(skia.root);
    assert.ok(Math.abs(lastAt() - 280) <= 1, '300 − 20 after the resize');
    assert.equal(dom.text(), '', 'happy-dom lays nothing out: no width');
    dispose();
  });
});

describe('round charts on the DOM and on Skia', () => {
  it('RadialBarChart draws each value at its bar\'s end', async () => {
    const { radialModel } = await import('../src/ext/charts/radial.jsx');
    const { polar } = await import('../src/ext/charts/path.js');
    const m = radialModel({ data: [{ label: 'a', value: 100 }, { label: 'b', value: 50 }], labels: true }, BASE_THEME, 'light', 200);
    // The gauge sweeps 225° to -45°: a full bar ends at -45°, a half one half way (90°).
    m.labels.forEach((/** @type {any} */ label, /** @type {number} */ i) => {
      const [x] = polar(m.cx, m.cy, m.rings[i], i === 0 ? -45 : 90);
      assert.equal(label.x, Math.round(x + BASE_THEME.chart.labelOffset), `label ${i} at its bar's end`);
    });
  });

  it('RadialBarChart and RadarChart', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <RadialBarChart w={200} h={200} data={visits.map(v => ({ label: v.label, hits: v.value, color: v.color }))} valueKey="hits" legend labels />
      </Rui>
    ));
    assert.equal(same(dom, skia), '520 390 390 Ads Email Links');
    // Rings from 16 to 84 px out (theme.chart inner and outer of the half box): Email's is the middle one (50 px); the legend is under the rings.
    hover(dom, skia, 100 + 50, 100);
    // The tip is a layer over the chart: the DOM reads it where it hangs, Skia after the legend.
    for (const r of [dom, skia]) assert.match(r.text(), /^520 390 390 .*Email 390/);
    assert.match(dom.text(), /Ads Email Links/);
    dispose();

    const radar = [
      { skill: 'Design', score: 118, last: 92 },
      { skill: 'Testing', score: 94, last: 108 },
      { skill: 'Planning', score: 88, last: 72 },
      { skill: 'Review', score: 102, last: 96 },
    ];
    const r = both(() => (
      <Rui>
        <RadarChart w={300} h={260} data={radar} category="skill" tooltip radiusAxis series={[{ key: 'score', color: 'indigo.5', opacity: 0.3 }, { key: 'last', color: 'amber.6', label: 'Last term' }]} />
      </Rui>
    ));
    assert.equal(same(r.dom, r.skia), 'Design Testing Planning Review 0 50 100 150 score Last term', 'a legend for two series');
    // Testing's axis points right (clockwise from the top).
    hover(r.dom, r.skia, 150 + 60, 130 + 2);
    // The tip is a layer: the DOM reads it where it hangs, Skia after the legend.
    for (const t of [r.dom.text(), r.skia.text()]) assert.match(t, /^Design Testing Planning Review 0 50 100 150 .*Testing score Last term 94 108/);
    r.dispose();
  });
});

describe('chart defaults on the DOM and on Skia', () => {
  it('radar axes on and its legend at `at`', () => {
    const skills = [
      { skill: 'Craft', now: 80, before: 60 },
      { skill: 'Speed', now: 55, before: 70 },
      { skill: 'Care', now: 90, before: 85 },
    ];
    const r = both(() => (
      <Rui>
        <RadarChart w={300} h={260} data={skills} category="skill" series={[{ key: 'now', color: 'indigo' }, { key: 'before', color: 'amber' }]} />
      </Rui>
    ));
    assert.equal(same(r.dom, r.skia), 'Craft Speed Care 0 25 50 75 100 now before', 'the angle and radius axes, then the legend (two series) under the chart by default');
    r.dispose();

    // The legend where `at` puts it: over the chart, at its end.
    const l = both(() => (
      <Rui>
        <RadarChart w={300} h={260} data={skills} category="skill" legend={{ at: 'top-end' }} series={[{ key: 'now', label: 'Now', color: 'indigo' }, { key: 'before', label: 'Before', color: 'amber' }]} />
      </Rui>
    ));
    assert.equal(same(l.dom, l.skia), 'Now Before Craft Speed Care 0 25 50 75 100', 'the legend before the chart');
    const now = primitives(l.skia).find(n => n.kind === 3 && n.text === 'Now').getBoundingClientRect();
    assert.ok(now.top < 30 && now.left > 150, `at the top's end: ${now.left}, ${now.top}`);
    l.dispose();
  });

  it('a legend follows its `at` as it changes, and a Legend alone sits at the start', () => {
    const skills = [
      { skill: 'Craft', now: 80, before: 60 },
      { skill: 'Speed', now: 55, before: 70 },
    ];
    /** @type {any[]} */
    const places = [];
    const r = both(() => {
      const at = $signal($active(), 'bottom-start');
      places.push(at);
      return (
        <Rui>
          <RadarChart w={300} h={260} data={skills} category="skill" legend={() => ({ at: $read(at) })} series={[{ key: 'now', label: 'Now', color: 'indigo' }, { key: 'before', label: 'Before', color: 'amber' }]} />
        </Rui>
      );
    });
    const nowLeft = () => primitives(r.skia).find(n => n.kind === 3 && n.text === 'Now').getBoundingClientRect().left;
    const start = nowLeft();
    assert.ok(start < 30, `at the start: ${start}`);
    for (const p of places) $write(p, 'bottom-end');
    $flush(r.skia.root);
    $flush(r.dom.root);
    assert.ok(nowLeft() > 150, `at the end once \`at\` says so: ${nowLeft()}`);
    r.dispose();
    // A Legend of its own, without `justify`: at the start of its row.
    const alone = both(() => (
      <Rui>
        <View style={{ width: 300, direction: 'column' }}>
          <Legend items={() => [{ name: 'a', label: 'Solo', color: '#336699' }]} />
        </View>
      </Rui>
    ));
    const solo = primitives(alone.skia).find(n => n.kind === 3 && n.text === 'Solo').getBoundingClientRect();
    assert.ok(solo.left < 40, `at the start: ${solo.left}`);
    alone.dispose();
  });
});

describe('wave-4 chart defaults on the DOM and on Skia', () => {
  it('a gap stays a gap', () => {
    const gap = both(() => (
      <Rui>
        <LineChart w={300} h={200} data={[{ m: 'Mon', v: 4 }, { m: 'Tue', v: null }, { m: 'Wed', v: 6 }, { m: 'Thu', v: 5 }]} category="m" series={[{ key: 'v', color: 'teal' }]} />
      </Rui>
    ));
    same(gap.dom, gap.skia);
    const lines = primitives(gap.skia).filter(n => n.kind === 7)[0].shapes.filter((/** @type {any} */ r) => r.kind === 'path' && !r.closed);
    assert.equal(lines.length, 1, 'one line, Wed to Thu');
    assert.ok(lines[0].points[0] > 150, 'it starts after the gap');
    gap.dispose();
  });
});

describe('point, trend, calendar and list charts on the DOM and on Skia', () => {
  it('ScatterChart', () => {
    const groups = [
      { label: 'Morning', color: 'teal.6', points: [{ hours: 12, score: 18 }, { hours: 40, score: 28 }] },
      { label: 'Evening', color: 'magenta.6', points: [{ hours: 60, score: 24 }] },
    ];
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <ScatterChart
          w={400}
          h={220}
          data={groups}
          category={{ x: 'hours', y: 'score' }}
          xAxis={{ title: 'Hours', format: (/** @type {number} */ v) => `${v}h` }}
          yAxis={{ title: 'Score', unit: ' marks' }}
          legend
        />
      </Rui>
    ));
    const axes = '0 marks 10 marks 20 marks 30 marks 0h 20h 40h 60h Hours Score';
    assert.equal(same(dom, skia), `${axes} Morning Evening`, 'each axis its own format and unit; the titles along the axes; the legend under the plot');
    // hours 40 of 0–60 across 56–380; score 28 of 0–30 down 138–10 (the x title's line under the ticks).
    const x = 56 + (40 / 60) * 324;
    const y = 138 - (28 / 30) * 128;
    hover(dom, skia, x + 3, y - 2);
    assert.equal(same(dom, skia), `${axes} Morning Evening Morning Hours Score 40h 28 marks`, 'the axis titles name the values');
    // A point's area is the theme's chart pointArea.
    const dot = primitives(skia).filter(n => n.kind === 7)[0].shapes.find((/** @type {any} */ r) => r.kind === 'oval');
    assert.equal(Math.round(((dot.right - dot.x) / 2) ** 2 * Math.PI), BASE_THEME.chart.pointArea);
    dispose();
  });

  it('Sparkline: trend colors, the fill', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <Sparkline w={200} h={60} data={[12, 18, 15, 27, 22, 31, 38]} trend={{ up: 'teal.7', down: 'orange.7', flat: 'night.3' }} fade fillOpacity={0.4} />
        <Sparkline w={200} h={60} data={[50, 20, null, 10]} curve="monotone" color="blue" fillOpacity={0} />
      </Rui>
    ));
    same(dom, skia);
    const [up, plain] = primitives(skia).filter(n => n.kind === 7).map(n => n.shapes);
    assert.equal(up.length, 2, 'one fill and the line');
    assert.equal(up[1].color, '#066557', 'an upward trend in its `up` color');
    assert.equal(up[1].stroke, 1.5, 'a 1.5 px line');
    const { fill } = up[0];
    assert.equal(fill.linear, 180, 'the fill: one gradient down its box');
    const alphas = fill.stops.map((/** @type {any[]} */ s) => parseInt(s[1].slice(7), 16) / 255);
    assert.ok(fill.stops.every((/** @type {any[]} */ s) => s[1].startsWith('#066557')));
    assert.ok(Math.abs(alphas[0] - 0.4) <= 1 / 255 && alphas[1] === 0, 'from 0.4 at the line to clear at the base');
    // The DOM draws it as an SVG gradient.
    assert.ok(dom.host.querySelector('linearGradient') !== null, 'an SVG linearGradient on the DOM');
    assert.deepEqual(plain.map((/** @type {any} */ r) => [r.kind, r.closed ?? false]), [['path', false]], 'no fill at opacity 0; a gap breaks the line, a lone point draws none');
    dispose();

    // By default: a solid fill at 0.3 under a monotone line.
    const d = both(() => (
      <Rui>
        <Sparkline w={200} h={60} data={[4, 9, 7]} color="teal" />
      </Rui>
    ));
    same(d.dom, d.skia);
    const [area, line] = primitives(d.skia).filter(n => n.kind === 7)[0].shapes;
    assert.deepEqual([area.fill, area.color, line.stroke], [undefined, '#087c6a4d', 1.5]);
    assert.ok(line.points.length > 6, 'a monotone curve, not three points');
    dispose();
  });
  it('chart label geometry from theme tokens: the label gap, character boxes, slots', () => {
    const t = BASE_THEME;
    const gap = t.spacing.xs / 2;
    const chars = (/** @type {number} */ n) => n * t.chart.charWidth;
    // Scatter: x tick labels a tick and the gap under the plot, in slots an axis label wide at least;
    // an x reference line's label the gap right of it, 17 characters wide.
    const sc = scatterModel({ data: [{ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }], references: [{ x: 0.5, label: 'Mid' }] }, t, 'light', 400, 220);
    const ticks = sc.labels.filter((/** @type {any} */ l) => l.align === 'center' && !l.rotate);
    assert.ok(ticks.every((/** @type {any} */ l) => l.w >= t.chart.axisWidth), 'slots at least chart.axisWidth');
    const mid = sc.labels.find((/** @type {any} */ l) => l.text === 'Mid');
    assert.equal(mid.w, chars(17));
    const [p0, p1] = sc.points;
    assert.equal(mid.x, Math.round((p0.x + p1.x) / 2 + gap), 'x 0.5 lies halfway between the points at 0 and 1');
  });
});

describe('chart axes, stacks and labels on the DOM and on Skia', () => {
  it('endAxis: series with axis end on their own scale, ticks and title at the end', () => {
    const rows = [{ n: 'A', rate: 4, load: 2300 }, { n: 'B', rate: 3, load: 1500 }, { n: 'C', rate: 2, load: 9800 }];
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <LineChart w={400} h={220} data={rows} category="n" endAxis={{ title: 'load' }} yAxis={{ title: 'rate' }} series={[{ key: 'rate', color: 'magenta.6' }, { key: 'load', color: 'cyan.6', axis: 'end' }]} />
      </Rui>
    ));
    assert.equal(same(dom, skia), '0 1 2 3 4 0 2500 5000 7500 10000 A B C rate load');
    const labels = primitives(skia).filter(n => n.kind === 3);
    const at = (/** @type {string} */ t) => labels.find(n => n.text === t).getBoundingClientRect();
    // The plot ends the theme's axis width (56) from the right; the right ticks start 10 px past it.
    assert.equal(Math.round(at('10000').left), 400 - BASE_THEME.chart.axisWidth + 10);
    assert.ok(Math.abs(at('load').left + at('load').width / 2 - 392) <= 1, 'the right label along the right edge');
    const dots = primitives(skia).filter(n => n.kind === 7)[0].shapes.filter((/** @type {any} */ r) => r.kind === 'oval');
    // load's 9800 near the top of its own 0 to 10000 axis; rate's 2 halfway up 0 to 4.
    const cy = (/** @type {any} */ r) => Math.round((r.y + r.bottom) / 2);
    const plot = linearScale(0, 1, 190, 10);
    assert.deepEqual([cy(dots[2]), cy(dots[5])], [Math.round(plot(0.5)), Math.round(plot(0.98))]);
    const turns = [...dom.nodes('Label')].filter((/** @type {any} */ n) => /rotate: 90deg/.test(n.getAttribute('style')));
    assert.deepEqual(turns.map((/** @type {any} */ n) => n.textContent), ['load']);
    dispose();
  });

  it('BarChart values: inside the tip on the body color, past it when short or asked, centered when asked', () => {
    const rows = cups.slice(0, 2);
    const page = pageColors(BASE_THEME, 'light');
    const off = BASE_THEME.chart.labelOffset;
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <BarChart w={400} h={220} data={rows} category="day" series={kiosks.slice(0, 2)} values />
      </Rui>
    ));
    assert.equal(same(dom, skia), '0 500 1000 1500 Mon Tue 1240 1395 860 1120');
    const bars = primitives(skia).filter(n => n.kind === 7)[0].shapes.filter((/** @type {any} */ r) => r.kind === 'rect');
    const label = primitives(skia).find(n => n.kind === 3 && n.text === '1240').getBoundingClientRect();
    assert.equal(Math.round(label.top), Math.round(bars[0].y + off), 'the theme’s label offset inside its tip');
    assert.ok(Math.abs(label.left + label.width / 2 - (bars[0].x + bars[0].right) / 2) <= 1, 'centered on it');
    const colorOfText = (/** @type {any} */ root, /** @type {string} */ text) => root.dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === text).style.color.replace(/\s/g, '');
    assert.equal(colorOfText({ dom }, '1240'), page.body, 'on the page’s body color over the dense fill');
    dispose();

    const center = both(() => (
      <Rui>
        <BarChart w={400} h={220} data={rows} category="day" series={kiosks.slice(0, 1)} values={{ at: 'center', color: 'white', fontSize: 8 }} format={(/** @type {number} */ v) => `${v / 1000}k`} />
      </Rui>
    ));
    same(center.dom, center.skia);
    const bar = primitives(center.skia).filter(n => n.kind === 7)[0].shapes.find((/** @type {any} */ r) => r.kind === 'rect');
    const node = primitives(center.skia).find(n => n.kind === 3 && n.text === '1.24k').getBoundingClientRect();
    assert.ok(Math.abs(node.top + node.height / 2 - (bar.y + bar.bottom) / 2) <= 1, 'in the middle of its bar');
    const style = center.dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === '1.24k').getAttribute('style');
    assert.match(style, /font-size: 8px/);
    assert.match(style, /color: #ffffff/);
    center.dispose();

    // A bar too short for its text: the label moves past the tip, in the series' color; `outside` always sits there.
    const short = [{ day: 'Mon', Pier: 1450 }, { day: 'Tue', Pier: 20 }];
    for (const values of [true, { at: 'outside' }]) {
      const s = both(() => (
        <Rui>
          <BarChart w={400} h={220} data={short} category="day" series={kiosks.slice(0, 1)} values={values} />
        </Rui>
      ));
      same(s.dom, s.skia);
      const [tall, low] = primitives(s.skia).filter(n => n.kind === 7)[0].shapes.filter((/** @type {any} */ r) => r.kind === 'rect');
      const at = (/** @type {string} */ t) => primitives(s.skia).find(n => n.kind === 3 && n.text === t).getBoundingClientRect();
      assert.equal(Math.round(at('20').bottom), Math.round(low.y - off), 'past the short bar’s tip');
      assert.equal(colorOfText(s, '20'), colorOf(BASE_THEME, 'light', 'cyan.6'), 'in the series’ color');
      if (values === true) assert.equal(Math.round(at('1450').top), Math.round(tall.y + off), 'the tall one inside');
      else assert.equal(Math.round(at('1450').bottom), Math.round(tall.y - off), 'outside: past every tip');
      s.dispose();
    }

    const across = both(() => (
      <Rui>
        <BarChart w={400} h={220} data={rows} category="day" series={kiosks.slice(0, 1)} across values />
      </Rui>
    ));
    same(across.dom, across.skia);
    const r = primitives(across.skia).filter(n => n.kind === 7)[0].shapes.find((/** @type {any} */ x) => x.kind === 'rect');
    assert.equal(Math.round(primitives(across.skia).find(n => n.kind === 3 && n.text === '1240').getBoundingClientRect().right), Math.round(r.right - off), 'inside its end');
    across.dispose();
  });

  it('the active marker: a ring in the series color around a point-sized hole on the page ground', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <LineChart w={400} h={220} data={cups} category="day" series={kiosks.slice(0, 1)} />
      </Rui>
    ));
    same(dom, skia);
    hover(dom, skia, 56 + 108 + 20, 100);
    same(dom, skia);
    const cursor = primitives(skia).filter(n => n.kind === 7)[1].shapes;
    const [ring, hole] = cursor.filter((/** @type {any} */ r) => r.kind === 'oval');
    const hr = (hole.right - hole.x) / 2;
    assert.equal(Math.round(hr ** 2 * Math.PI), BASE_THEME.chart.pointArea, 'the hole a chart point’s area');
    assert.equal((ring.right - ring.x) / 2 - hr, 2, 'the ring the line’s width');
    assert.deepEqual([ring.color, hole.color], [colorOf(BASE_THEME, 'light', 'cyan.6'), pageColors(BASE_THEME, 'light').body]);
    dispose();
  });

  it('the tooltip follows the pointer, on its side with more room', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <BarChart w={400} h={220} data={cups} category="day" series={kiosks.slice(0, 1)} />
      </Rui>
    ));
    same(dom, skia);
    const gap = BASE_THEME.spacing.sm;
    const tipAt = () => {
      const heading = dom.nodes('Label').filter((/** @type {any} */ n) => n.textContent === 'Tue')[1];
      return heading.parentElement.style;
    };
    hover(dom, skia, 56 + 81 + 20, 60);
    assert.deepEqual([parseFloat(tipAt().left), parseFloat(tipAt().top)], [56 + 81 + 20 + gap, 60]);
    hover(dom, skia, 56 + 81 + 40, 120);
    assert.deepEqual([parseFloat(tipAt().left), parseFloat(tipAt().top)], [56 + 81 + 40 + gap, 120], 'it moves with the pointer inside a category');
    hover(dom, skia, 300, 90);
    const heading = dom.nodes('Label').filter((/** @type {any} */ n) => n.textContent === 'Thu')[1];
    assert.deepEqual([parseFloat(heading.parentElement.style.right), parseFloat(heading.parentElement.style.top)], [400 - 300 + gap, 90], 'on the left in the right half');
    dispose();
  });

  it("a cartesian chart reads its categories from 'label' by default", () => {
    const rows = [
      { label: 'Dawn', sold: 3 },
      { label: 'Noon', sold: 7 },
    ];
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <BarChart w={300} h={200} data={rows} series={[{ key: 'sold', color: 'teal' }]} />
      </Rui>
    ));
    assert.match(same(dom, skia), /Dawn Noon/, 'the category axis names from `label`');
    dispose();
  });

  it("RadarChart reads 'label' by default and draws its points of chart.pointArea", () => {
    const rows = [
      { label: 'Reach', now: 60 },
      { label: 'Grip', now: 80 },
      { label: 'Pace', now: 40 },
    ];
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <RadarChart w={300} h={260} data={rows} series={[{ key: 'now', color: 'teal' }]} />
      </Rui>
    ));
    assert.match(same(dom, skia), /Reach Grip Pace/, 'the axis names from `label`');
    const dots = primitives(skia).filter(n => n.kind === 7)[0].shapes.filter((/** @type {any} */ r) => r.kind === 'oval');
    const r = Math.sqrt(BASE_THEME.chart.pointArea / Math.PI);
    assert.equal(dots.length, 3);
    for (const d of dots) assert.ok(Math.abs((d.right - d.x) / 2 - r) < 1e-6, `a point of radius ${r}: ${(d.right - d.x) / 2}`);
    dispose();
  });

  it('gridColor and textColor color the grid and the tick marks', () => {
    for (const Chart of [LineChart, ScatterChart, RadarChart]) {
      const data = Chart === ScatterChart ? [{ label: 'a', points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }] : cups;
      const { dom, skia, dispose } = both(() => (
        <Rui>
          <Chart w={400} h={220} data={data} category={Chart === ScatterChart ? undefined : 'day'} series={kiosks.slice(0, 1)} gridColor="red.6" textColor="blue.6" ticks="both" grid={Chart === RadarChart ? true : 'both'} />
        </Rui>
      ));
      same(dom, skia);
      const shapes = primitives(skia).filter(n => n.kind === 7)[0].shapes;
      const colors = new Set(shapes.filter((/** @type {any} */ r) => r.kind === 'line' || (r.kind === 'path' && r.stroke === 1)).map((/** @type {any} */ r) => r.color));
      assert.ok(colors.has(colorOf(BASE_THEME, 'light', 'red.6')), `${Chart.name}: the grid in gridColor`);
      if (Chart === LineChart) assert.ok(colors.has(colorOf(BASE_THEME, 'light', 'blue.6')), 'the tick marks in textColor');
      dispose();
    }
  });

  it('series stack: one stack per id beside the series alone (BarChart and AreaChart)', () => {
    const { dom, skia, dispose } = both(() => (
      <Rui>
        <BarChart w={400} h={220} data={cups} category="day" series={[{ key: 'Pier', color: 'green.6', stack: 'a' }, { key: 'Park', color: 'orange.6', stack: 'b' }, { key: 'Gate', color: 'purple.6', stack: 'b' }]} />
      </Rui>
    ));
    assert.equal(same(dom, skia), '0 1000 2000 3000 Mon Tue Wed Thu', 'Park and Gate together reach 2735');
    const bars = primitives(skia).filter(n => n.kind === 7)[0].shapes.filter((/** @type {any} */ r) => r.kind === 'rect');
    // Per series, four rows: Pier 0-3, Park 4-7, Gate 8-11.
    assert.notEqual(bars[0].x, bars[4].x, 'two slots');
    assert.equal(bars[4].x, bars[8].x, 'Park and Gate in one slot');
    assert.equal(bars[8].bottom, bars[4].y, 'Gate on top of Park');
    dispose();

    const area = both(() => (
      <Rui>
        <AreaChart w={400} h={220} data={cups} category="day" fade={false} series={[{ key: 'Pier', stack: 's' }, { key: 'Park', stack: 's' }, { key: 'Gate' }]} />
      </Rui>
    ));
    assert.equal(same(area.dom, area.skia), '0 1000 2000 3000 4000 Mon Tue Wed Thu', 'Pier and Park together reach 3105');
    area.dispose();
  });

  it('values: each point’s value in the theme’s point label size over it (LineChart, AreaChart)', () => {
    for (const Chart of [LineChart, AreaChart]) {
      const { dom, skia, dispose } = both(() => (
        <Rui>
          <Chart w={400} h={220} data={cups.slice(0, 2)} category="day" series={kiosks.slice(0, 1)} values points unit="$" />
        </Rui>
      ));
      assert.equal(same(dom, skia), '0$ 500$ 1000$ 1500$ Mon Tue 1240$ 1395$');
      const dot = primitives(skia).filter(n => n.kind === 7)[0].shapes.find((/** @type {any} */ r) => r.kind === 'oval');
      const box = primitives(skia).find(n => n.kind === 3 && n.text === '1240$').getBoundingClientRect();
      assert.ok(Math.abs(box.left + box.width / 2 - (dot.x + dot.right) / 2) <= 1, 'centered on the point');
      assert.equal(Math.round(box.bottom), Math.round(dot.y - BASE_THEME.chart.labelOffset), 'the theme’s label offset over the dot');
      const size = BASE_THEME.fontSizes[BASE_THEME.chart.pointLabel];
      assert.match(dom.nodes('Label').find((/** @type {any} */ n) => n.textContent === '1240$').getAttribute('style'), new RegExp(`font-size: ${size}px`));
      dispose();
    }
  });
});

describe('every chart draws inside its padding and border', () => {
  const cups = [{ day: 'Mon', a: 1 }, { day: 'Tue', a: 3 }, { day: 'Wed', a: 2 }];
  const slices = [{ name: 'A', value: 1 }, { name: 'B', value: 2 }];
  /** @type {[string, (extra: Record<string, any>) => any][]} */
  const CHARTS = [
    ['LineChart', x => <charts.LineChart h={200} data={cups} category="day" series={[{ key: 'a' }]} {...x} />],
    ['AreaChart', x => <charts.AreaChart h={200} data={cups} category="day" series={[{ key: 'a' }]} {...x} />],
    ['BarChart', x => <charts.BarChart h={200} data={cups} category="day" series={[{ key: 'a' }]} {...x} />],
    ['MixedChart', x => <charts.MixedChart h={200} data={cups} category="day" series={[{ key: 'a', kind: 'bar' }]} {...x} />],
    ['ScatterChart', x => <charts.ScatterChart h={200} data={[{ label: 'G', points: [{ hours: 2, score: 60 }, { hours: 3, score: 70 }] }]} category={{ x: 'hours', y: 'score' }} {...x} />],
    ['BubbleChart', x => <charts.BubbleChart h={200} data={[{ label: 'P', ships: 12 }, { label: 'Q', ships: 30 }]} valueKey="ships" label="Ships" {...x} />],
    ['RadialBarChart', x => <charts.RadialBarChart h={200} data={slices} valueKey="value" {...x} />],
    ['RadarChart', x => <charts.RadarChart h={200} data={[{ s: 'A', v: 1 }, { s: 'B', v: 2 }, { s: 'C', v: 3 }]} category="s" series={[{ key: 'v' }]} {...x} />],
    ['PieChart', x => <charts.PieChart data={slices} {...x} />],
    ['PieChart w h', x => <charts.PieChart w={200} h={200} data={slices} {...x} />],
    ['DonutChart', x => <charts.DonutChart data={slices} {...x} />],
    ['FunnelChart', x => <charts.FunnelChart data={slices} {...x} />],
    ['Heatmap', x => <charts.Heatmap data={{ '2026-01-01': 2, '2026-01-02': 5 }} from="2026-01-01" to="2026-01-21" {...x} />],
    ['Sparkline', x => <charts.Sparkline data={[1, 3, 2]} {...x} />],
  ];
  for (const [name, make] of CHARTS) {
    it(`${name}: padded (p) and bordered, its drawing sits in its content box (Skia)`, () => {
      for (const extra of [{ p: 20 }, { style: { border: 12 } }]) {
        const clock = manualClock();
        const { skia, dispose } = both(() => (
          <Clock value={clock}>
            <Rui>
              <View style={{ width: 400 }}>{make({ ...extra, 'aria-label': 'Chart' })}</View>
            </Rui>
          </Clock>
        ));
        for (let i = 0; i < 3; i++) {
          clock.advance(16);
          $flush(skia.root);
          skia.text();
        }
        const all = primitives(skia);
        const root = all.find((/** @type {any} */ n) => n.other?.get?.('aria-label') === 'Chart');
        assert.ok(root, `${name}: its root`);
        const r = root.getBoundingClientRect();
        const inset = 'p' in extra ? 20 : 12;
        const within = (/** @type {any} */ n) => {
          for (let m = n; m != null; m = m.parent) if (m === root) return true;
          return false;
        };
        const shapes = all.filter((/** @type {any} */ n) => n.kind === 7 && within(n));
        assert.ok(shapes.length > 0, `${name}: a drawing`);
        for (const n of shapes) {
          const b = n.getBoundingClientRect();
          const where = `${name} ${JSON.stringify(extra)}: shape ${JSON.stringify([b.x, b.y, b.width, b.height])} in ${JSON.stringify([r.x, r.y, r.width, r.height])}`;
          assert.ok(b.x >= r.x + inset - 0.5 && b.y >= r.y + inset - 0.5, `${where}: past its start insets`);
          assert.ok(b.x + b.width <= r.x + r.width - inset + 0.5 && b.y + b.height <= r.y + r.height - inset + 0.5, `${where}: before its end insets`);
        }
        dispose();
      }
    });
  }
});
