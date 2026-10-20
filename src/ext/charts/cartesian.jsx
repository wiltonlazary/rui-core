// The cartesian charts: AreaChart, BarChart, LineChart and MixedChart,
// one engine. Everything is computed from
// the chart's size into one list of Shape records (grid, series, reference
// lines) and text at computed places (ticks, axis labels), so the chart is
// the same on every renderer. A View over the plot takes the pointer: the
// nearest category shows a cursor and the tooltip.

import { View, Shape, Show, $active, $signal, $read, $write, $memo, read } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { styled } from '../../theme/style.js';
import { alpha } from '../../theme/colors.js';
import { pageColors } from '../../theme/resolve.js';
import { bandScale, pointScale, linearScale, valueAxis, num } from './scale.js';
import { curvePoints, dashPattern, dashedLine, gradientFill, runs, stackSeries, splitAt } from './path.js';
import { chartColors, tint, formatterOf, $chartWidth, Placed, Legend, Tip, beside, labelGap, charsWide, QUARTER, pointIn, rootProps, ChartData, datasetOf, legendAt, LEGEND_AT, shiftTip, $chartPadding } from './shared.jsx';
import { partOf } from '../../core/overlays/shared.jsx';
import { tables } from '../../own.js';

/** @typedef {import('./path.js').Figure} Figure */
/** @typedef {import('./shared.jsx').Placed} PlacedText */
/** @typedef {'area' | 'bar' | 'line'} Kind */

/**
 * A series as the engine reads it.
 * @typedef {object} Serie
 * @property {string} name the series' `key`: its row field
 * @property {string} label
 * @property {string} color resolved
 * @property {Kind} kind
 * @property {number[]} dashes
 * @property {number} opacity its fill's
 * @property {boolean} right on the end y axis (`axis: 'end'`)
 * @property {string | null} stack its `stack`: series sharing one stack
 */

/**
 * A chart's model: what it draws and where its categories are.
 * @typedef {object} Model
 * @property {Figure[]} figures
 * @property {PlacedText[]} labels
 * @property {{ left: number, top: number, right: number, bottom: number }} plot
 * @property {number} width
 * @property {number} height
 * @property {boolean} horizontal categories along x
 * @property {boolean} banded bars: categories are bands
 * @property {import('./scale.js').Band} cats
 * @property {Serie[]} series
 * @property {(value: number) => number} scale the value axis
 * @property {(value: number) => number} scaleRight the right y axis (the left one's without series there)
 * @property {{ lo: Float64Array, hi: Float64Array }[]} spans per series, per row
 * @property {readonly Record<string, any>[]} data
 * @property {number} lineWidth the series lines' width
 */

/**
 * The series of a chart.
 * @param {Record<string, any>} props @param {Kind} kind @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {'light' | 'dark'} scheme @param {number | undefined} fillOpacity the chart's, when given
 * @returns {Serie[]}
 */
function seriesOf(props, kind, theme, scheme, fillOpacity) {
  return (read(props.series) ?? []).map((/** @type {any} */ s) => {
    /** @type {Kind} */
    const own = s.kind === 'area' || s.kind === 'bar' || s.kind === 'line' ? s.kind : kind;
    return {
      name: String(s.key),
      label: String(s.label ?? s.key),
      color: tint(theme, scheme, s.color),
      kind: own,
      dashes: dashPattern(s.dash),
      // Areas the theme's `opacity.faint` (a mixed chart's too), bars `opacity.dense`, lines 1.
      opacity: s.fillOpacity ?? s.opacity ?? fillOpacity ?? (own === 'area' ? theme.opacity.faint : own === 'bar' ? theme.opacity.dense : 1),
      right: s.axis === 'end',
      stack: s.stack == null ? null : String(s.stack),
    };
  });
}

/**
 * Builds a cartesian chart's model.
 * @param {Record<string, any>} props @param {Kind | 'mixed'} kind
 * @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {'light' | 'dark'} scheme
 * @param {number} width @param {number} height the chart's area (below the legend)
 * @param {string | null} highlighted
 * @returns {Model}
 */
export function cartesianModel(props, kind, theme, scheme, width, height, highlighted) {
  const c = chartColors(theme, scheme);
  // Nothing to draw before the chart has a width.
  const data = /** @type {Record<string, any>[]} */ (width > 0 ? (read(props.data) ?? []) : []);
  const category = String(read(props.category) ?? 'label');
  // How the series share the plot: bars side by side ('group', a bar
  // chart's default) or areas and lines over each other ('overlap'),
  // 'stack', 'share' (stacked to 100 %), 'diverge' (an area above and below
  // zero in `signColors`) or 'cascade' (a running total; a row with `total`
  // starts at 0).
  const type = read(props.kind) ?? (kind === 'bar' ? 'group' : 'overlap');
  const n = data.length;
  const percent = type === 'share';
  const bars = kind === 'bar';
  const given = read(props.fillOpacity);
  const series = seriesOf(props, kind === 'mixed' ? 'line' : kind, theme, scheme, given == null ? undefined : Number(given));
  // `across`: bars (a bar or mixed chart's) run across, categories down.
  const horizontal = !((bars || kind === 'mixed') && read(props.across) === true);
  const banded = series.some(s => s.kind === 'bar');
  const xAxis = partOf(read(props.xAxis), true);
  const yAxis = partOf(read(props.yAxis), true);
  const withX = width > 0 && xAxis !== null;
  const withY = width > 0 && yAxis !== null;
  const xProps = xAxis ?? {};
  const yProps = yAxis ?? {};
  // A second value axis at the end (a category-along-x chart only), for
  // the series with `axis: 'end'`, `theme.chart.axisWidth` wide.
  const endAxis = partOf(read(props.endAxis), false);
  const withRight = withY && horizontal && endAxis !== null;
  const rProps = endAxis ?? {};
  const rLabel = horizontal ? rProps.title : undefined;
  const xLabel = xProps.title;
  const yLabel = yProps.title;
  // The grid's lines: 'rows' (across, at the vertical axis's ticks),
  // 'columns', 'both' or false.
  const grid = width > 0 ? (read(props.grid) ?? 'rows') : false;
  // Tick marks on the axes, named by axis: 'x', 'y', 'both' or false.
  const ticks = read(props.ticks) ?? false;
  const gridDashes = dashPattern(read(props.dash) ?? '4 2');
  // The grid's color and the tick marks' (`gridColor`, `textColor`: a color; the page's roles by default).
  const gridColor = props.gridColor == null ? c.grid : tint(theme, scheme, read(props.gridColor));
  const textColor = props.textColor == null || read(props.textColor) === 'quiet' ? c.text : tint(theme, scheme, read(props.textColor));
  const format = formatterOf(props);
  // The value labels (`values`): false, true, options, or a function of a
  // series giving one of those; null where a series shows none.
  const values = typeof props.values === 'function' ? props.values : read(props.values);
  const all = read(props.series) ?? [];
  const valuesOf = (/** @type {number} */ k) => partOf(typeof values === 'function' ? values(all[k]) : values, false);
  const lineWidth = Number(read(props.lineWidth) ?? 2);
  const curve = read(props.curve) ?? (kind === 'bar' ? 'linear' : 'monotone');
  // A gap in the data shows as a gap unless `bridge`.
  const connect = read(props.bridge) === true;
  // Points on the lines (an area's show on hover only, by default).
  const points = partOf(read(props.points), kind !== 'area');
  // A point's radius: a circle of `theme.chart.pointArea` px², as Scatter's.
  const dotRadius = Number(points?.radius ?? Math.sqrt(theme.chart.pointArea / Math.PI));

  // The x axis's tick labels turned by xAxis.angle (the text
  // ends at its tick when turned back, starts there when turned forward), which takes the room the turned text needs below the
  // plot (xAxis.height when given).
  const angle = Number(xProps.angle ?? 0) || 0;
  const turn = (angle * Math.PI) / 180;
  const catText = (/** @type {number} */ i) => {
    const f = xProps.format;
    const v = data[i][category];
    return typeof f === 'function' ? String(f(v)) : v == null ? '' : String(v);
  };
  const valueText = (/** @type {number} */ t) => (percent ? `${t}%` : typeof yProps.format === 'function' ? String(yProps.format(t)) : format(t));
  let longest = 0;
  for (let i = 0; i < n; i++) longest = Math.max(longest, catText(i).length);
  const textWidth = charsWide(theme, longest) + theme.spacing.xs;
  // A tick label's gap from its tick (and a title's from the tick labels).
  const tickGap = labelGap(theme);
  const xText = angle === 0 ? theme.chart.line : typeof xProps.height === 'number' ? xProps.height : Math.ceil(Math.abs(Math.sin(turn)) * textWidth + Math.abs(Math.cos(turn)) * theme.chart.line);

  // The plot: the y axis's width is yAxis.width (`theme.chart.axisWidth`) on the left.
  const axisWidth = withY ? Number(yProps.width ?? theme.chart.axisWidth) : 0;
  const plot = {
    left: axisWidth,
    top: theme.chart.frame.top,
    right: Math.max(axisWidth, width - (withRight ? Number(rProps.width ?? theme.chart.axisWidth) : theme.chart.frame.right)),
    bottom: Math.max(0, height - (withX ? theme.chart.tick + tickGap + xText + tickGap : theme.chart.frame.top) - (xLabel == null ? 0 : theme.chart.line + tickGap)),
  };
  if (plot.bottom < plot.top) plot.bottom = plot.top;
  const [catFrom, catTo] = horizontal ? [plot.left, plot.right] : [plot.top, plot.bottom];
  const cats = banded ? bandScale(n, catFrom, catTo) : pointScale(n, catFrom, catTo);

  // Values, stacked or not, per series and row.
  const stacked = type === 'stack' || percent;
  /** @type {{ lo: Float64Array, hi: Float64Array }[]} */
  let spans;
  /** The series stacked with others by a shared `stack`. */
  const grouped = new Set();
  if (stacked) spans = stackSeries(data, series.map(s => s.name), percent ? 'share' : 'stack');
  else if (type === 'cascade') {
    spans = series.map(s => {
      const lo = new Float64Array(n).fill(NaN);
      const hi = new Float64Array(n).fill(NaN);
      let total = 0;
      for (let i = 0; i < n; i++) {
        const v = num(data[i][s.name]);
        if (!Number.isFinite(v)) continue;
        if (data[i].total) {
          lo[i] = 0;
          hi[i] = v;
        } else {
          lo[i] = total;
          hi[i] = total += v;
        }
      }
      return { lo, hi };
    });
  } else {
    // Series sharing a `stack` (and an axis) stack together, the others stand alone.
    spans = series.map(s => {
      const lo = new Float64Array(n).fill(NaN);
      const hi = new Float64Array(n).fill(NaN);
      for (let i = 0; i < n; i++) {
        const v = num(data[i][s.name]);
        if (Number.isFinite(v)) {
          lo[i] = 0;
          hi[i] = v;
        }
      }
      return { lo, hi };
    });
    for (const [, members] of stacksOf(series)) {
      if (members.length < 2) continue;
      for (const k of members) grouped.add(k);
      const stacked = stackSeries(data, members.map(k => series[k].name), 'stack');
      members.forEach((k, j) => (spans[k] = stacked[j]));
    }
  }
  /** The value axis of the series on one side. @param {boolean} right @param {Record<string, any>} own */
  const axisOf = (right, own) => {
    let dataMin = Infinity;
    let dataMax = -Infinity;
    spans.forEach((s, k) => {
      if (series[k].right !== right) return;
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(s.hi[i])) continue;
        dataMin = Math.min(dataMin, s.lo[i], s.hi[i]);
        dataMax = Math.max(dataMax, s.lo[i], s.hi[i]);
      }
    });
    if (percent) {
      // Shares run 0 to 100; a negative value's share goes below 0, so the axis reaches down to it (in quarters), keeping the data honest.
      const min = dataMin < 0 ? Math.floor(dataMin / 25) * 25 : 0;
      const ticks = [];
      for (let t = min; t <= 100; t += 25) ticks.push(t);
      return { min, max: 100, ticks };
    }
    return valueAxis(dataMin, dataMax, own.domain, Number(own.tickCount ?? 5));
  };
  const axis = axisOf(false, yProps);
  const [valFrom, valTo] = horizontal ? [plot.bottom, plot.top] : [plot.left, plot.right];
  const scale = linearScale(axis.min, axis.max, valFrom, valTo);
  const onRight = series.some(s => s.right);
  const rAxis = onRight ? axisOf(true, rProps) : axis;
  const scaleRight = onRight ? linearScale(rAxis.min, rAxis.max, valFrom, valTo) : scale;
  const scaleOf = (/** @type {Serie} */ s) => (s.right ? scaleRight : scale);
  const base = scale(Math.max(axis.min, Math.min(axis.max, 0)));
  // A point on the chart from a category position and a value position.
  const at = (/** @type {number} */ cat, /** @type {number} */ val) => (horizontal ? [cat, val] : [val, cat]);

  /** @type {Figure[]} */
  const figures = [];
  /** @type {PlacedText[]} */
  const labels = [];

  // Grid: horizontal lines at the vertical axis's ticks, vertical ones at the horizontal axis's.
  const valueTicks = axis.ticks.map(t => scale(t));
  const catTicks = Array.from({ length: n }, (_, i) => cats.center(i));
  const yTicks = horizontal ? valueTicks : catTicks;
  const xTicks = horizontal ? catTicks : valueTicks;
  if (grid === 'rows' || grid === 'both') for (const y of yTicks) dashedLine(plot.left, y, plot.right, y, gridColor, 1, gridDashes, figures);
  if (grid === 'columns' || grid === 'both') for (const x of xTicks) dashedLine(x, plot.top, x, plot.bottom, gridColor, 1, gridDashes, figures);
  if (withY && (ticks === 'y' || ticks === 'both')) for (const y of yTicks) figures.push({ kind: 'line', x: plot.left - theme.chart.tick, y, right: plot.left, bottom: y, color: textColor, stroke: 1 });
  const rightTicks = rAxis.ticks.map(t => scaleRight(t));
  if (withRight && (ticks === 'y' || ticks === 'both')) for (const y of rightTicks) figures.push({ kind: 'line', x: plot.right, y, right: plot.right + theme.chart.tick, bottom: y, color: textColor, stroke: 1 });
  if (withX && (ticks === 'x' || ticks === 'both')) for (const x of xTicks) figures.push({ kind: 'line', x, y: plot.bottom, right: x, bottom: plot.bottom + theme.chart.tick, color: textColor, stroke: 1 });

  // Tick labels: values through the formatter; categories thinned to fit.
  // Turned labels need only a line's height across (over the turn's sine).
  const across = horizontal ? (angle === 0 ? textWidth : Math.min(textWidth, (theme.chart.line + 2) / Math.max(0.1, Math.abs(Math.sin(turn))))) : theme.chart.line;
  const every = typeof xProps.interval === 'number' ? xProps.interval + 1 : Math.max(1, Math.ceil((across / Math.max(1, Math.abs(cats.step))) - 1e-9));
  const yAt = (/** @type {number} */ y) => Math.round(y - theme.chart.line / 2);
  if (withY) {
    if (horizontal) axis.ticks.forEach((t, k) => labels.push({ text: valueText(t), x: 0, y: yAt(valueTicks[k]), w: plot.left - theme.chart.tick - tickGap, align: 'end' }));
    else for (let i = 0; i < n; i += every) labels.push({ text: catText(i), x: 0, y: yAt(catTicks[i]), w: plot.left - theme.chart.tick - tickGap, align: 'end' });
  }
  if (withRight) {
    const text = (/** @type {number} */ t) => (percent ? `${t}%` : typeof rProps.format === 'function' ? String(rProps.format(t)) : format(t));
    rAxis.ticks.forEach((t, k) => labels.push({ text: text(t), x: plot.right + theme.chart.tick + tickGap, y: yAt(rightTicks[k]), w: Math.max(0, width - plot.right - theme.chart.tick - tickGap), align: 'start' }));
  }
  if (withX) {
    const y = plot.bottom + theme.chart.tick + tickGap;
    // A turned label: its end (or start) at the tick, turned about that point.
    const turned = (/** @type {string} */ text, /** @type {number} */ x) =>
      angle < 0
        ? { text, x: Math.round(x - textWidth), y, w: textWidth, align: /** @type {const} */ ('end'), rotate: angle, origin: /** @type {[number, number]} */ ([textWidth, theme.chart.line / 2]) }
        : { text, x: Math.round(x), y, w: textWidth, align: /** @type {const} */ ('start'), rotate: angle, origin: /** @type {[number, number]} */ ([0, theme.chart.line / 2]) };
    if (angle !== 0) {
      if (horizontal) for (let i = 0; i < n; i += every) labels.push(turned(catText(i), catTicks[i]));
      else axis.ticks.forEach((t, k) => labels.push(turned(valueText(t), valueTicks[k])));
    } else if (horizontal) {
      // A label's slot is an axis label's width at least.
      const slot = Math.max(theme.chart.axisWidth, Math.abs(cats.step) * every);
      for (let i = 0; i < n; i += every) labels.push({ text: catText(i), x: Math.round(catTicks[i] - slot / 2), y, w: Math.round(slot), align: 'center' });
    } else {
      const slot = Math.max(theme.chart.axisWidth, Math.abs(valueTicks[1] - valueTicks[0]) || theme.chart.axisWidth);
      axis.ticks.forEach((t, k) => labels.push({ text: valueText(t), x: Math.round(valueTicks[k] - slot / 2), y, w: Math.round(slot), align: 'center' }));
    }
  }
  if (xLabel != null && width > 0) labels.push({ text: String(xLabel), x: plot.left, y: height - theme.chart.line, w: plot.right - plot.left, align: 'center' });
  // The y axis label: turned −90°, along the left edge, centered on the plot.
  if (yLabel != null && width > 0) {
    const h = Math.max(0, plot.bottom - plot.top);
    labels.push({ text: String(yLabel), x: Math.round(theme.chart.line / 2 - h / 2), y: Math.round((plot.top + plot.bottom) / 2 - theme.chart.line / 2), w: Math.round(h), align: 'center', rotate: -QUARTER });
  }
  // The right one's: turned 90°, along the right edge.
  if (rLabel != null && withRight) {
    const h = Math.max(0, plot.bottom - plot.top);
    labels.push({ text: String(rLabel), x: Math.round(width - theme.chart.line / 2 - h / 2), y: Math.round((plot.top + plot.bottom) / 2 - theme.chart.line / 2), w: Math.round(h), align: 'center', rotate: QUARTER });
  }

  // Series. The active series (the legend item under the pointer) keeps its
  // colors; the others drop to `theme.chart.dim` of their opacity.
  const dim = (/** @type {Serie} */ s, /** @type {number} */ o) => (highlighted !== null && highlighted !== s.name ? o * theme.chart.dim : o);
  const barSeries = series.filter(s => s.kind === 'bar');
  if (barSeries.length > 0 && n > 0) {
    const step = Math.abs(cats.step);
    // The bars take `theme.chart.band` of their band; bars side by side
    // part by the share the band leaves between groups, at most `bandGap`.
    const group = step * theme.chart.band;
    const maxWidth = Number(read(props.barWidth) ?? Infinity);
    const one = stacked || type === 'cascade';
    // One slot per stack: a series alone, or the series sharing a stack.
    const slots = [...stacksOf(barSeries).keys()];
    const count = one ? 1 : slots.length;
    const gap = count > 1 ? Math.min(theme.chart.bandGap, (group / count) * (1 - theme.chart.band)) : 0;
    const bar = Math.max(1, Math.min(maxWidth, (group - gap * (count - 1)) / count));
    const total = bar * count + gap * (count - 1);
    series.forEach((s, k) => {
      if (s.kind !== 'bar') return;
      const slot = one ? 0 : slots.indexOf(stackKey(s));
      const span = spans[k];
      const scaleS = scaleOf(s);
      const lp = valuesOf(k);
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(span.hi[i])) continue;
        const from = cats.center(i) - (Math.sign(cats.step) || 1) * (total / 2) + slot * (bar + gap) * (Math.sign(cats.step) || 1);
        const v0 = scaleS(span.lo[i]);
        const v1 = scaleS(span.hi[i]);
        const [x0, y0] = at(from, v0);
        const [x1, y1] = at(from + bar, v1);
        const color = alpha(data[i].color == null ? s.color : tint(theme, scheme, data[i].color), dim(s, s.opacity));
        const box = { x: Math.min(x0, x1), y: Math.min(y0, y1), right: Math.max(x0, x1), bottom: Math.max(y0, y1) };
        figures.push({ kind: 'rect', ...box, color });
        if (lp !== null) labels.push(barLabel(format(data[i][s.name]), box, horizontal, horizontal ? v1 <= v0 : v1 >= v0, lp, s.color, theme, scheme));
      }
    });
  }
  const split = kind === 'area' && type === 'diverge';
  // `fade`: the fill thins out toward the value axis's base, strongest
  // under the line; one Shape figure carries the whole ramp.
  const gradient = kind === 'area' && read(props.fade) === true;
  /** @type {{ up?: any, down?: any }} */
  const signs = read(props.signColors) ?? {};
  const signColors = split ? [signs.up ?? 'teal', signs.down ?? 'orange'].map(x => tint(theme, scheme, x)) : null;
  series.forEach((s, k) => {
    if (s.kind === 'bar') return;
    if (split && k > 0) return;
    const span = spans[k];
    const scaleS = scaleOf(s);
    for (const run of runs(span.hi, connect)) {
      const xs = run.map(i => cats.center(i));
      const top = curvePoints(xs, run.map(i => scaleS(span.hi[i])), curve);
      if (s.kind === 'area' && run.length > 1) {
        const bottom = stacked || grouped.has(k) ? curvePoints(xs, run.map(i => scaleS(span.lo[i])), curve) : [xs[0], base, xs[xs.length - 1], base];
        const fill = top.slice();
        for (let p = bottom.length - 2; p >= 0; p -= 2) fill.push(bottom[p], bottom[p + 1]);
        if (signColors !== null) {
          // Above zero in the first color, below in the second.
          const parts = splitAt(top, base);
          for (const [pieces, color] of /** @type {const} */ ([[parts.above, signColors[0]], [parts.below, signColors[1]]]))
            for (const piece of pieces) {
              figures.push({ kind: 'path', closed: true, color: alpha(color, dim(s, s.opacity)), points: [...piece, piece[piece.length - 2], base, piece[0], base] });
              figures.push({ kind: 'path', color: alpha(color, dim(s, 1)), stroke: lineWidth, points: piece });
            }
          continue;
        }
        if (gradient) gradientFill(horizontal ? fill : swap(fill), o => alpha(s.color, dim(s, o)), s.opacity, 0, figures);
        else figures.push({ kind: 'path', closed: true, color: alpha(s.color, dim(s, s.opacity)), points: horizontal ? fill : swap(fill) });
      }
      if (run.length > 1) {
        if (s.dashes.length > 0) for (let p = 0; p + 3 < top.length; p += 2) dashedLine(top[p], top[p + 1], top[p + 2], top[p + 3], alpha(s.color, dim(s, 1)), lineWidth, s.dashes, figures);
        else figures.push({ kind: 'path', color: alpha(s.color, dim(s, 1)), stroke: lineWidth, points: horizontal ? top : swap(top) });
      }
      if (points !== null || run.length === 1)
        for (const i of run) {
          const [x, y] = at(cats.center(i), scaleS(span.hi[i]));
          figures.push({ kind: 'oval', x: x - dotRadius, y: y - dotRadius, right: x + dotRadius, bottom: y + dotRadius, color: alpha(s.color, dim(s, 1)) });
        }
      // A point label: `theme.chart.pointLabel` text centered over its
      // point, `theme.chart.labelOffset` above the dot.
      if (kind !== 'bar' && valuesOf(k) !== null)
        for (const i of run) {
          const [x, y] = at(cats.center(i), scaleS(span.hi[i]));
          const text = format(data[i][s.name]);
          const w = charsWide(theme, text.length) + theme.spacing.xs;
          labels.push({ text, x: Math.round(x - w / 2), y: Math.round(y - dotRadius - theme.chart.labelOffset - theme.chart.line), w, align: 'center', size: theme.fontSizes[theme.chart.pointLabel] });
        }
    }
  });

  // Reference lines: `y` a value, `x` a category (or a value on a vertical chart).
  // An x line's label: the label gap right of it, in a box of 17 characters.
  const refBox = charsWide(theme, 17);
  for (const line of width > 0 ? (read(props.references) ?? []) : []) {
    const color = tint(theme, scheme, line.color, theme.chart.reference);
    const dashes = dashPattern(line.dash);
    if (line.y != null) {
      const v = horizontal ? scale(Number(line.y)) : catAt(data, category, line.y, cats);
      if (v == null) continue;
      dashedLine(plot.left, v, plot.right, v, color, 1, dashes, figures);
      // Its label above the line, at its `at`: 'end' (default) or 'start'.
      if (line.label != null) labels.push({ text: String(line.label), x: plot.left, y: Math.round(v - theme.chart.line - 2), w: plot.right - plot.left, align: line.at === 'start' ? 'start' : 'end', color });
    } else if (line.x != null) {
      const v = horizontal ? catAt(data, category, line.x, cats) : scale(Number(line.x));
      if (v == null) continue;
      dashedLine(v, plot.top, v, plot.bottom, color, 1, dashes, figures);
      // Its label beside the line, at its `at`: 'top' (default) or 'bottom'.
      if (line.label != null) labels.push({ text: String(line.label), x: Math.round(v + tickGap), y: line.at === 'bottom' ? plot.bottom - theme.chart.line : plot.top, w: refBox, align: 'start', color });
    }
  }
  return { figures, labels, plot, width, height, horizontal, banded, cats, series, scale, scaleRight, spans, data, lineWidth };
}

/** A series' stack: its `stack` on its axis, or itself. @param {Serie} s */
const stackKey = s => (s.stack === null ? `=${s.name}` : `${s.right ? 'r' : 'l'}:${s.stack}`);

/**
 * The series by stack, in order of first appearance: key to series indexes.
 * @param {readonly Serie[]} series
 */
function stacksOf(series) {
  /** @type {Map<string, number[]>} */
  const out = new Map();
  series.forEach((s, k) => {
    const key = stackKey(s);
    const list = out.get(key);
    if (list === undefined) out.set(key, [k]);
    else list.push(k);
  });
  return out;
}

/**
 * A bar's value label (`values`): by default (`at: 'inside'`)
 * inside the bar at its tip, `offset` (`theme.chart.labelOffset`) in from
 * it, in the page's `body` color over the bar's dense fill; when the bar
 * is too short to hold the text it moves past the tip in the series'
 * color. `at: 'outside'` always sits past the tip, `at: 'center'` in the
 * middle of the bar. The theme's xs size; `color` and `fontSize` from the
 * `values` options.
 * @param {string} text @param {{ x: number, y: number, right: number, bottom: number }} box @param {boolean} horizontal
 * @param {boolean} rising the bar grows toward the value axis's far end (up, or right across)
 * @param {Record<string, any>} lp @param {string} tone the series' color
 * @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {'light' | 'dark'} scheme
 * @returns {PlacedText}
 */
function barLabel(text, box, horizontal, rising, lp, tone, theme, scheme) {
  const size = Number(lp.fontSize ?? theme.fontSizes.xs);
  const offset = Number(lp.offset ?? theme.chart.labelOffset);
  const line = theme.chart.line;
  const wide = charsWide(theme, text.length) + theme.spacing.xs;
  const cx = (box.x + box.right) / 2;
  const cy = (box.y + box.bottom) / 2;
  const at = lp.at ?? 'inside';
  // The room along the bar, and what the text needs of it.
  const length = horizontal ? box.bottom - box.y : box.right - box.x;
  const needs = (horizontal ? line : wide) + offset * 2;
  const inside = at === 'inside' && length >= needs;
  /** @type {PlacedText} */
  let out;
  if (at === 'center') out = { text, x: Math.round(cx - Math.max(wide, box.right - box.x) / 2), y: Math.round(cy - line / 2), w: Math.round(Math.max(wide, box.right - box.x)), align: 'center' };
  else if (horizontal) {
    // Up the bar: the tip is its top when it rises, its bottom when it falls.
    const w = Math.max(wide, box.right - box.x);
    const y = rising ? (inside ? box.y + offset : box.y - offset - line) : inside ? box.bottom - offset - line : box.bottom + offset;
    out = { text, x: Math.round(cx - w / 2), y: Math.round(y), w: Math.round(w), align: 'center' };
  } else {
    // Across: the tip is its end when it rises, its start when it falls.
    const x = rising ? (inside ? box.right - offset - wide : box.right + offset) : inside ? box.x + offset : box.x - offset - wide;
    out = { text, x: Math.round(x), y: Math.round(cy - line / 2), w: Math.round(wide), align: rising === inside ? 'end' : 'start' };
  }
  if (size !== theme.fontSizes.xs) out.size = size;
  out.color = lp.color != null ? tint(theme, scheme, lp.color) : inside || at === 'center' ? pageColors(theme, scheme).body : tone;
  return out;
}

/** Swaps x and y in a flat point list (a vertical chart's series). @param {number[]} points */
function swap(points) {
  const out = new Array(points.length);
  for (let i = 0; i < points.length; i += 2) {
    out[i] = points[i + 1];
    out[i + 1] = points[i];
  }
  return out;
}

/** The position of a category named `value`, or null. @param {readonly Record<string, any>[]} data @param {string} key @param {any} value @param {import('./scale.js').Band} cats */
function catAt(data, key, value, cats) {
  const i = data.findIndex(row => row[key] === value);
  return i < 0 ? null : cats.center(i);
}

/**
 * The cursor's figures at category `i`, in the plot's box: a band for bars,
 * a line and each series' active marker otherwise. The marker is
 * a ring in the series' color, the line's width thick, around a hole
 * the size of a chart point (a circle of `theme.chart.pointArea` px²) on
 * the page's ground.
 * @param {Model} m @param {number} i @param {ReturnType<typeof chartColors>} c @param {import('../../theme/theme.jsx').RuiThemeValue} theme
 */
export function cursorFigures(m, i, c, theme) {
  const { plot, cats } = m;
  const w = plot.right - plot.left;
  const h = plot.bottom - plot.top;
  /** @type {Figure[]} */
  const out = [];
  const center = cats.center(i) - (m.horizontal ? plot.left : plot.top);
  if (m.banded) {
    const step = Math.abs(cats.step);
    const from = center - step / 2;
    out.push(m.horizontal ? { kind: 'rect', x: from, y: 0, right: from + step, bottom: h, color: c.cursor } : { kind: 'rect', x: 0, y: from, right: w, bottom: from + step, color: c.cursor });
  } else out.push({ kind: 'line', x: center, y: 0, right: center, bottom: h, color: c.grid, stroke: 1 });
  const hole = Math.sqrt(theme.chart.pointArea / Math.PI);
  const ring = hole + m.lineWidth;
  if (!m.banded || m.series.some(s => s.kind !== 'bar'))
    m.series.forEach((s, k) => {
      if (s.kind === 'bar') return;
      const v = m.spans[k].hi[i];
      if (!Number.isFinite(v)) return;
      const along = (s.right ? m.scaleRight : m.scale)(v) - (m.horizontal ? plot.top : plot.left);
      const [x, y] = m.horizontal ? [center, along] : [along, center];
      out.push({ kind: 'oval', x: x - ring, y: y - ring, right: x + ring, bottom: y + ring, color: s.color });
      out.push({ kind: 'oval', x: x - hole, y: y - hole, right: x + hole, bottom: y + hole, color: c.body });
    });
  return out;
}

/**
 * The tooltip at category `i`: the category, and each series' value; it
 * follows the pointer (`x`, `y` in the chart's box), `gap` (spacing sm)
 * clear of it, on the side of it with more room.
 * @param {Model} m @param {number} i @param {(v: any) => string} format @param {string} category @param {number} gap
 * @param {number} x @param {number} y
 * @returns {import('./shared.jsx').TooltipModel}
 */
export function tooltipAt(m, i, format, category, gap, x, y) {
  const row = m.data[i] ?? {};
  /** @type {import('./shared.jsx').TooltipRow[]} */
  const rows = [];
  for (const s of m.series) {
    const v = row[s.name];
    if (v == null) continue;
    rows.push({ name: s.label, color: s.color, value: format(v) });
  }
  return { label: row[category] == null ? '' : String(row[category]), rows, at: beside(x, y, m.width, gap) };
}

/** What each cartesian chart is, for its name (a key of the labels). @type {Record<string, import('./shared.jsx').ChartKind>} */
const KINDS = tables({ area: 'areaChart', bar: 'barChart', line: 'lineChart', mixed: 'mixedChart' });

/**
 * A cartesian chart component.
 * @param {Record<string, any>} props @param {Kind | 'mixed'} kind
 */
function cartesian(props, kind) {
  const R = $active();
  const ui = $ui();
  const size = $chartWidth(props);
  const pad = $chartPadding(props);
  const highlighted = $signal(R, /** @type {string | null} */ (null));
  const active = $signal(R, -1);
  // The pointer in the chart's box: the tooltip follows it.
  const pointer = $signal(R, /** @type {[number, number]} */ ([0, 0]));
  const legendOf = () => partOf(read(props.legend), false);
  const legendShown = () => legendOf() !== null;
  const legendBottom = () => legendAt(legendOf(), LEGEND_AT).bottom;
  const total = () => {
    const h = read(props.h);
    return size.inner(typeof h === 'number' ? h : ui.theme().sizes.box.chart);
  };
  const area = () => Math.max(0, total() - (legendShown() ? ui.theme().chart.legend : 0));
  const model = $memo(R, () => cartesianModel(props, kind, ui.theme(), ui.scheme(), size.width(), area(), $read(highlighted)));
  const colors = () => chartColors(ui.theme(), ui.scheme());
  const format = () => formatterOf(props);
  const items = () => $read(model).series.map(s => ({ name: s.name, label: s.label, color: s.color }));
  const plotBox = () => {
    const p = $read(model).plot;
    return { position: /** @type {const} */ ('absolute'), left: p.left, top: p.top, width: Math.max(0, p.right - p.left), height: Math.max(0, p.bottom - p.top) };
  };
  const move = (/** @type {any} */ event) => {
    const m = $read(model);
    const [x, y] = pointIn(event);
    const along = m.horizontal ? x + m.plot.left : y + m.plot.top;
    const n = m.data.length;
    $write(pointer, [x + m.plot.left, y + m.plot.top]);
    $write(active, n === 0 ? -1 : m.cats.index(along));
  };
  /** The category under a pointer event. @param {any} event */
  const indexAt = event => {
    const m = $read(model);
    const [x, y] = pointIn(event);
    return m.data.length === 0 ? -1 : m.cats.index(m.horizontal ? x + m.plot.left : y + m.plot.top);
  };
  const selecting = props.onSelect != null;
  /** Category `i` chosen: `onSelect(i, row)`. @param {number} i */
  const select = i => {
    const m = $read(model);
    if (i >= 0 && i < m.data.length) props.onSelect?.(i, m.data[i]);
  };
  /** Category `i` active from the keys: its tooltip at its middle. @param {number} i */
  const reach = i => {
    const m = $read(model);
    const c = m.cats.center(i);
    $write(pointer, m.horizontal ? [c, (m.plot.top + m.plot.bottom) / 2] : [(m.plot.left + m.plot.right) / 2, c]);
    $write(active, i);
  };
  const onKey = (/** @type {{ key: string, preventDefault?: () => void }} */ e) => {
    const n = $read(model).data.length;
    const at = $read(active);
    const forth = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    if (n === 0) return;
    if (forth || back || e.key === 'Home' || e.key === 'End') {
      e.preventDefault?.();
      reach(e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : at < 0 ? (forth ? 0 : n - 1) : Math.max(0, Math.min(n - 1, at + (forth ? 1 : -1))));
    } else if ((e.key === 'Enter' || e.key === ' ') && at >= 0) {
      e.preventDefault?.();
      select(at);
    }
  };
  const style = styled(props, theme => ({ position: 'relative', width: '100%', height: theme.sizes.box.chart, direction: 'column' }));
  const legend = <Legend items={items} justify={() => legendAt(read(props.legend) ?? null, LEGEND_AT).justify} onActiveChange={key => $write(highlighted, key)} />;
  return (
    <View {...rootProps(props, KINDS[kind])} {...(selecting ? { tabIndex: 0, onKey } : null)} ref={size.ref} onResize={size.onResize} style={style}>
      <Show when={() => legendShown() && !legendBottom()}>{legend}</Show>
      <View style={() => ({ position: 'relative', width: '100%', height: area(), shrink: 0 })}>
        <Shape shapes={() => $read(model).figures} style={() => ({ position: 'absolute', left: 0, top: 0, width: $read(model).width, height: $read(model).height })} />
        <Placed items={() => $read(model).labels} color={() => colors().text} />
        <Show when={() => read(props.tooltip) !== false || selecting}>
          <View
            style={() => ({ ...plotBox(), ...(selecting ? { cursor: 'pointer' } : null) })}
            onPointerMove={move}
            onPointerLeave={() => $write(active, -1)}
            // a press chooses the category under it (the one the pointer made active, without a place)
            {...(selecting ? { onPress: (/** @type {any} */ e) => select(e?.currentTarget != null && (e.clientX ?? e.x) != null ? indexAt(e) : $read(active)) } : null)}
          >
            <Show when={() => $read(active) >= 0 && $read(active) < $read(model).data.length}>
              <Shape shapes={() => cursorFigures($read(model), $read(active), colors(), ui.theme())} style={() => ({ ...plotBox(), left: 0, top: 0 })} />
            </Show>
          </View>
        </Show>
      </View>
      <Show when={() => legendShown() && legendBottom()}>{legend}</Show>
      <Show when={() => read(props.tooltip) !== false && $read(active) >= 0 && $read(active) < $read(model).data.length}>
        <Tip tip={() => shiftTip(tooltipAt($read(model), $read(active), format(), String(read(props.category) ?? 'label'), ui.theme().spacing.sm, ...$read(pointer)), legendShown() && !legendBottom() ? ui.theme().chart.legend : 0, pad())} />
      </Show>
      <ChartData of={() => datasetOf(props)} />
    </View>
  );
}

/**
 * An area chart: `data`, `category` (the category field, 'label' by
 * default), `series` ({ key, color, label }[]: `key` is the row field),
 * `kind` ('overlap', 'stack', 'share' (a negative value's share below 0,
 * the axis reaching down to it) or 'diverge' with `signColors`
 * { up: 'teal', down: 'orange' }), `curve`, `fillOpacity` (the theme's `opacity.faint`), `fade`
 * (false; true: the fill thins out from `fillOpacity` under the line to
 * nothing at the base), `lineWidth`, `points` (false: shown on hover; true, or
 * { radius }), `bridge` (a line across missing values; false: a gap shows), `legend` (false,
 * true or { at }: 'top' or 'bottom', and '-start', '-center' or '-end'
 * along it; under the plot at its start, 'bottom-start', by default),
 * `tooltip` (true: it follows the pointer), `xAxis` and `yAxis` (true,
 * false or { title, domain, width, tickCount, format, angle, height,
 * interval }), `grid` ('rows', 'columns', 'both' or false), `ticks` ('x',
 * 'y', 'both' or false), `dash` (the grid's: '4 2'), `gridColor` (the grid's
 * color; the page's border, muted), `textColor` (the tick marks' color; the
 * quiet role), `references` ({ y or
 * x, label, color, dash, at: a y line's label at 'end' or 'start', an x
 * line's at 'top' or 'bottom' }),
 * `format`, `unit`, `w`, `h` (300); `endAxis` (true or { title, width, … }:
 * the series with `axis: 'end'` on it), `values` (each point's value over
 * it), a series' `stack` (series sharing one stack). `onSelect(index, row)`
 * makes its categories chosen: a press on one, or, the chart focused, ←
 * and → (↑ ↓, Home, End) walk them, their tooltip showing, and Enter or
 * Space chooses the one shown.
 * @param {Record<string, any>} props
 */
export function AreaChart(props) {
  return cartesian(props, 'area');
}

/**
 * A bar chart: AreaChart's props, with `kind`
 * ('group', 'stack', 'share', 'cascade': a running total, rows with
 * `total` start at 0), `fillOpacity` (the theme's `opacity.dense`), `across` (false; true: bars
 * run across, the categories down), `barWidth` (the most a bar is wide), a row's
 * `color` for its bar, a series' `stack` (the series sharing one stack in
 * one slot), `values` (each bar's value: true, or { at: 'inside' (inside
 * the tip, past it when the bar is short) | 'outside' (past the tip) |
 * 'center', color, fontSize, offset (`theme.chart.labelOffset`) }, or a
 * function of the series giving one of those).
 * @param {Record<string, any>} props
 */
export function BarChart(props) {
  return cartesian(props, 'bar');
}

/** A line chart: AreaChart's props (`values`, the end axis; `points` true), a series' `dash`. @param {Record<string, any>} props */
export function LineChart(props) {
  return cartesian(props, 'line');
}

/** Areas, bars and lines on one plot: each series' `kind` ('bar', 'line' or 'area'); `across` as BarChart's. @param {Record<string, any>} props */
export function MixedChart(props) {
  return cartesian(props, 'mixed');
}
