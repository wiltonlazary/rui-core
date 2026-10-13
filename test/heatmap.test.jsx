// Heatmap: the equal-width bins, the day walk (rows by week start, columns
// by week, month gaps), the names, the legend line, the levels, and the
// tooltip under the pointer, on the DOM and on Skia.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Rui, BASE_THEME, alpha } from 'rui-core';
import { DateSettings } from 'rui-core/dates';
import { Heatmap, heatColor } from 'rui-core/charts';
import { heatmapModel } from '../src/ext/charts/heatmap.jsx';
import { DATES_LABELS } from '../src/ext/dates/arith.js';
import { pageColors, colorOf } from '../src/theme/resolve.js';
import { both } from './harness.jsx';
import { primitives, same, hover, leave } from './chart-harness.jsx';

// Pages read a day in the first weeks of 2025.
const pages = { '2025-01-06': 4, '2025-01-07': 18, '2025-01-08': 12, '2025-01-09': 30, '2025-01-10': 0, '2025-01-11': 42, '2025-01-12': 9 };

const theme = BASE_THEME;
const settings = (/** @type {Record<string, any>} */ o = {}) => ({ weekStart: 1, today: '2025-06-15', labels: DATES_LABELS, ...o });
const model = (/** @type {Record<string, any>} */ props, /** @type {Record<string, any>} */ o = {}, scheme = /** @type {'light' | 'dark'} */ ('light')) => heatmapModel(props, theme, scheme, settings(o));
const texts = (/** @type {any} */ m) => m.labels.map((/** @type {any} */ l) => l.text);
const track = pageColors(theme, 'light').track;
const shapes = (/** @type {any} */ skia) => primitives(skia).filter(n => n.kind === 7)[0].shapes;

describe('heatColor', () => {
  it('bins values in equal widths, clamped, a flat range the last', () => {
    const c = ['a', 'b', 'c', 'd'];
    assert.deepEqual([1, 1.5, 1.75, 2.5, 3.9, 4, 0, 9].map(v => heatColor(v, 1, 4, c)), ['a', 'a', 'b', 'c', 'd', 'd', 'a', 'd']);
    assert.equal(heatColor(7, 7, 7, c), 'd');
  });
});

describe('heatmapModel', () => {
  it('draws today\'s calendar year by default, days after today as the track', () => {
    const m = model({ data: pages });
    assert.equal(m.cells.length, 365);
    assert.deepEqual([m.cells[0].date, m.cells[364].date], ['2025-01-01', '2025-12-31']);
    const after = m.cells.findIndex(c => c.date === '2025-06-16');
    assert.ok(m.fills.slice(after).every(f => f === track), 'the future is track');
    assert.ok(m.fills.slice(0, after).filter(f => f !== track).length === Object.keys(pages).length, 'only days with a value are colored');
    const late = model({ data: { '2025-07-01': 5, '2025-01-01': 1 } });
    assert.equal(late.fills[late.cells.findIndex(c => c.date === '2025-07-01')], track, 'a value after today still draws as track');
  });

  it('rows follow the week start, columns advance on its first row', () => {
    const monday = model({ from: '2025-01-05', to: '2025-01-06', months: false, weekdays: false });
    // Sunday 5 January is the last row of a Monday week; Monday opens the next column.
    assert.deepEqual(monday.cells.map(c => [c.x, c.y]), [[0, 6 * 14], [14, 0]]);
    const sunday = model({ from: '2025-01-05', to: '2025-01-06', months: false, weekdays: false }, { weekStart: 0 });
    assert.deepEqual(sunday.cells.map(c => [c.x, c.y]), [[0, 0], [0, 14]]);
  });

  it('sizes cells from `cell`: size, gap and radius (px or a step; 0 a plain rect)', () => {
    const base = { from: '2025-01-06', to: '2025-01-13', months: false, weekdays: false };
    const d = model(base);
    assert.deepEqual(d.figures[0], { kind: 'round', x: 0, y: 0, right: 12, bottom: 12, radius: theme.radius.xs, color: track });
    const own = model({ ...base, cell: { size: 10, gap: 4, radius: 5 } });
    assert.deepEqual([own.cells[1].y, own.cells[7].x, own.figures[0].right, own.figures[0].radius], [14, 14, 10, 5]);
    assert.equal(model({ ...base, cell: { radius: 'md' } }).figures[0].radius, theme.radius.md);
    const flat = model({ ...base, cell: { radius: 0 } }).figures[0];
    assert.equal(flat.kind, 'rect');
  });

  it('`outside` fills the first and last weeks', () => {
    const range = { from: '2025-01-08', to: '2025-01-10' };
    assert.deepEqual(model(range).cells.map(c => c.date), ['2025-01-08', '2025-01-09', '2025-01-10']);
    const out = model({ ...range, outside: true }).cells.map(c => c.date);
    assert.deepEqual([out.length, out[0], out[6]], [7, '2025-01-06', '2025-01-12']);
  });

  it('`monthGaps` starts each month in a fresh column and shifts later ones by spacing xs', () => {
    const range = { from: '2025-02-10', to: '2025-03-20' };
    const columns = (/** @type {any} */ m) => [...new Set(m.cells.map((/** @type {any} */ c) => c.x))];
    // Weekday names take spacing lg (24) at the start; 14 px a column.
    assert.deepEqual(columns(model(range)), [24, 38, 52, 66, 80, 94]);
    const gapped = model({ ...range, monthGaps: true });
    // Saturday 1 March leaves the week of 24 February: a column of its own, 8 px further.
    assert.deepEqual(columns(gapped), [24, 38, 52, 74, 88, 102, 116]);
    const at = (/** @type {string} */ date) => gapped.cells.find(c => c.date === date);
    assert.deepEqual([at('2025-02-28')?.x, at('2025-03-01')?.x, at('2025-03-01')?.y, at('2025-03-03')?.x], [52, 74, 16 + 5 * 14, 88]);
    assert.deepEqual([gapped.width, gapped.height], [116 + 12, 16 + 7 * 14 - 2]);
  });

  it('names a month of 7 drawn days or more at its first column, skipping one that would overlap', () => {
    const m = model({ from: '2025-01-27', to: '2025-03-31', weekdays: false });
    // January has 5 days drawn: unnamed. February starts Saturday in the first column; March in the fifth.
    assert.deepEqual(m.labels.map(l => [l.text, l.x, l.y, l.w]), [['Feb', 0, 0, 21], ['Mar', 4 * 14, 0, 21]]);
    const long = model({ from: '2025-02-01', to: '2025-03-31', weekdays: false, months: { names: DATES_LABELS.months } });
    // 'February' (8 × 7 px) reaches 56, where March begins: closer than the label gap, so skipped.
    assert.deepEqual(texts(long), ['February']);
    assert.deepEqual(texts(model({ from: '2025-02-01', to: '2025-03-31', weekdays: false })), ['Feb', 'Mar']);
    const tall = model({ from: '2025-02-01', to: '2025-02-28', weekdays: false, months: { height: 24 } });
    assert.deepEqual([tall.cells[0].y, tall.labels[0].y], [24 + 5 * 14, 4]);
  });

  it('names weekday rows 2, 4 and 6 at a small pitch, all at chart.line or more, or the given names', () => {
    const range = { from: '2025-01-06', to: '2025-01-12', months: false };
    const d = model(range);
    assert.deepEqual(d.labels.map(l => [l.text, l.x, l.y, l.w, l.align]), [['T', 0, 12, 20, 'start'], ['T', 0, 40, 20, 'start'], ['S', 0, 68, 20, 'start']]);
    assert.deepEqual(texts(model({ ...range, cell: { size: 16 } })), ['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    assert.deepEqual(texts(model(range, { weekStart: 0 })), ['M', 'W', 'F']);
    const given = model({ ...range, weekdays: { names: ['S', 'M', '', 'W', '', 'F', ''], width: 16 } });
    assert.deepEqual(given.labels.map(l => [l.text, l.w]), [['M', 12], ['W', 12], ['F', 12], ['S', 12]]);
    assert.equal(given.cells[0].x, 16);
  });

  it('the legend: low text, the levels, high text from the grid\'s start', () => {
    const range = { from: '2025-01-06', to: '2025-01-12', months: false, data: pages };
    const m = model({ ...range, legend: true });
    const y = 7 * 14 - 2 + 8;
    const low = m.labels.find(l => l.text === '0');
    const high = m.labels.find(l => l.text === '42');
    // '0' (7 px) at 24, the swatches 4 px on (35, 49, 63, 77), '42' 4 px past the last.
    assert.deepEqual([low?.x, low?.y, low?.w], [24, y, 7]);
    const swatches = m.figures.slice(7);
    assert.deepEqual(swatches.map(f => f.x), [35, 49, 63, 77]);
    assert.deepEqual([high?.x, high?.w], [77 + 12 + 4, 14]);
    assert.deepEqual([m.width, m.height], [93 + 14, 7 * 14 - 2 + 8 + 16]);
    const formatted = model({ ...range, legend: true, format: (/** @type {number} */ v) => `${v * 2}`, unit: ' p' });
    assert.deepEqual(texts(formatted).slice(-2), ['0 p', '84 p']);
    assert.deepEqual(texts(model({ ...range, legend: { labels: ['few', 'many'] } })).slice(-2), ['few', 'many']);
    assert.deepEqual(texts(model({ ...range, legend: true, domain: [0, 100] })).slice(-2), ['0', '100']);
  });

  it('colors: the accent\'s four levels in light and dark, or `colors`', () => {
    const indigo = theme.colors.indigo;
    const range = { from: '2025-01-06', to: '2025-01-12', months: false, weekdays: false, legend: true };
    const levels = (/** @type {any} */ m) => m.figures.slice(7).map((/** @type {any} */ f) => f.color);
    assert.deepEqual(levels(model(range)), [alpha(indigo[6], theme.opacity.faint), alpha(indigo[6], theme.opacity.disabled), alpha(indigo[6], theme.opacity.dense), indigo[8]]);
    assert.deepEqual(levels(model(range, {}, 'dark')), [alpha(indigo[6], theme.opacity.faint), alpha(indigo[6], theme.opacity.disabled), alpha(indigo[6], theme.opacity.dense), indigo[4]]);
    const own = model({ ...range, data: pages, colors: ['teal.2', 'teal.8', '#123456'] });
    assert.deepEqual(levels(own), [colorOf(theme, 'light', 'teal.2'), colorOf(theme, 'light', 'teal.8'), '#123456']);
    // 42 is the top, 0 the bottom, 18 the second third.
    assert.deepEqual([own.fills[5], own.fills[4], own.fills[1]], ['#123456', colorOf(theme, 'light', 'teal.2'), colorOf(theme, 'light', 'teal.8')]);
    const flat = model({ ...range, data: pages, domain: [0, 10] });
    assert.equal(flat.fills[3], indigo[8], 'past the domain: the top level');
  });
});

describe('Heatmap on the DOM and on Skia', () => {
  it('reads the week start from DateSettings, the prop first', () => {
    const first = (/** @type {() => any} */ view) => {
      const { dom, skia, dispose } = both(view);
      same(dom, skia);
      const y = shapes(skia)[0].y;
      dispose();
      return y;
    };
    const range = { from: '2025-01-05', to: '2025-01-06', months: false, weekdays: false, today: '2025-06-15' };
    assert.equal(first(() => <Rui><Heatmap {...range} /></Rui>), 6 * 14, 'Monday by default');
    assert.equal(first(() => <Rui><DateSettings weekStart={0}><Heatmap {...range} /></DateSettings></Rui>), 0);
    assert.equal(first(() => <Rui><DateSettings weekStart={0}><Heatmap {...range} weekStart={1} /></DateSettings></Rui>), 6 * 14);
  });

  it('shows no tooltip by default; with `tooltip`, the day under the pointer, nothing over a gap', () => {
    const view = (/** @type {Record<string, any>} */ extra) => () => (
      <Rui>
        <Heatmap data={pages} from="2025-01-06" to="2025-01-12" today="2025-06-15" label="Pages" {...extra} />
      </Rui>
    );
    const quiet = both(view({}));
    assert.equal(same(quiet.dom, quiet.skia), 'Jan T T S');
    hover(quiet.dom, quiet.skia, 30, 16 + 2 * 14 + 6);
    assert.equal(same(quiet.dom, quiet.skia), 'Jan T T S');
    quiet.dispose();

    const { dom, skia, dispose } = both(view({ tooltip: true }));
    // Wednesday 8 January: row 2, under the month row (16) and beside the weekday names (24).
    hover(dom, skia, 30, 16 + 2 * 14 + 6);
    assert.equal(same(dom, skia), 'Jan T T S 2025-01-08 Pages 12');
    hover(dom, skia, 30, 16 + 14 - 1);
    assert.equal(same(dom, skia), 'Jan T T S', 'the gap between rows hits nothing');
    hover(dom, skia, 30, 16 + 4 * 14 + 6);
    assert.equal(same(dom, skia), 'Jan T T S 2025-01-10 Pages 0');
    leave(dom, skia);
    assert.equal(same(dom, skia), 'Jan T T S');
    dispose();

    const own = both(view({ tooltip: true, tipOf: (/** @type {any} */ d) => `${d.value} pages on ${d.date}` }));
    hover(own.dom, own.skia, 30, 16 + 5 * 14 + 6);
    assert.equal(same(own.dom, own.skia), 'Jan T T S 42 pages on 2025-01-11');
    own.dispose();
  });
});
