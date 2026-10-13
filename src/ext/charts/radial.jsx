// The round charts on polar geometry: RadialBarChart (rings) and
// RadarChart (polygons on a polar grid). DonutChart and PieChart live in
// pie.jsx, FunnelChart in funnel.jsx. Hit testing is geometry on the
// pointer's place (angle and radius), so the tooltip works the same on
// every renderer.

import { $active, $memo, $read, read } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { alpha } from '../../theme/colors.js';
import { pageColors } from '../../theme/resolve.js';
import { niceTicks, linearScale, num } from './scale.js';
import { polar, arcPoints, angleOf } from './path.js';
import { chartColors, tint, formatterOf, $chartWidth, beside, labelGap, charsWide } from './shared.jsx';
import { partOf } from '../../core/overlays/shared.jsx';
import { Frame } from './frame.jsx';

/** @typedef {import('./path.js').Figure} Figure */
/** @typedef {import('./shared.jsx').Placed} PlacedText */
/** @typedef {import('../../theme/theme.jsx').RuiThemeValue} RuiThemeValue */

/**
 * A radial bar chart's model: a ring per row, the first innermost, each
 * swept by its share of the largest value.
 * @param {Record<string, any>} props @param {RuiThemeValue} theme @param {'light' | 'dark'} scheme @param {number} width @param {number} [boxHeight] the height it draws in (its `h`, or the theme's chart height, less its insets)
 */
export function radialModel(props, theme, scheme, width, boxHeight = typeof read(props.h) === 'number' ? Number(read(props.h)) : theme.sizes.box.chart) {
  const c = chartColors(theme, scheme);
  const data = /** @type {Record<string, any>[]} */ (width > 0 ? (read(props.data) ?? []) : []);
  const key = String(read(props.valueKey) ?? 'value');
  const height = boxHeight;
  const cx = width / 2;
  const cy = height / 2;
  // The rings fill `theme.chart.inner` to `theme.chart.outer` of half the box.
  const outer = (Math.min(width, height) / 2) * theme.chart.outer;
  const inner = (Math.min(width, height) / 2) * theme.chart.inner;
  const n = Math.max(1, data.length);
  const band = (outer - inner) / n;
  // A bar as thick as the thickest Progress track (`sizes.progress.xl`).
  const thick = Math.min(Number(read(props.thickness) ?? theme.sizes.progress.xl), band * theme.chart.band);
  // A 270° gauge: from the lower left, clockwise over the top, to the lower right.
  const start = Number(read(props.startAngle) ?? 225);
  const end = Number(read(props.endAngle) ?? -45);
  const values = data.map(d => num(d[key]));
  const max = Math.max(0, ...values.filter(Number.isFinite));
  const withTrack = read(props.track) !== false;
  const trackColor = pageColors(theme, scheme).track;
  const format = formatterOf(props);
  /** @type {Figure[]} */
  const figures = [];
  /** @type {PlacedText[]} */
  const labels = [];
  const colors = data.map(d => tint(theme, scheme, d.color));
  const rings = data.map((_, i) => inner + band * (i + 0.5));
  // A value label's box: 11 characters.
  const box = charsWide(theme, 11);
  data.forEach((d, i) => {
    const r = rings[i];
    if (withTrack) figures.push({ kind: 'path', color: trackColor, stroke: thick, points: arcPoints(cx, cy, r, start, end) });
    const v = values[i];
    if (Number.isFinite(v) && v > 0 && max > 0) figures.push({ kind: 'path', color: colors[i], stroke: thick, points: arcPoints(cx, cy, r, start, start + ((end - start) * v) / max) });
    if (read(props.labels) !== false) {
      // At the bar's end: where its value reaches on the ring, the chart's label offset beyond it.
      const reach = Number.isFinite(v) && v > 0 && max > 0 ? start + ((end - start) * v) / max : start;
      const [x, y] = polar(cx, cy, r, reach);
      labels.push({ text: format(d[key]), x: Math.round(x + theme.chart.labelOffset), y: Math.round(y - theme.chart.line / 2), w: box, align: 'start', color: c.ink });
    }
  });
  return { figures, labels, width, height, cx, cy, rings, thick, data, colors, format, key };
}

/**
 * A radial bar chart: `data` ({ label, value,
 * color }[]), `valueKey` (the field holding each bar's value: 'value'),
 * `thickness` (`sizes.progress.xl`, 14), `track`
 * (true), `startAngle` (225), `endAngle` (-45: a 270° gauge), `labels` (true: each value at its bar's
 * end), `legend` (false, or as AreaChart's: under the chart at its start),
 * `tooltip` (true), `format`, `w`, `h` (300).
 * @param {Record<string, any>} props
 */
export function RadialBarChart(props) {
  const R = $active();
  const ui = $ui();
  const size = $chartWidth(props);
  const model = $memo(R, () => radialModel(props, ui.theme(), ui.scheme(), size.width(), size.inner(typeof read(props.h) === 'number' ? Number(read(props.h)) : ui.theme().sizes.box.chart)));
  const hit = (/** @type {number} */ x, /** @type {number} */ y) => {
    const m = $read(model);
    const { r } = angleOf(m.cx, m.cy, x, y);
    const i = m.rings.findIndex(ring => Math.abs(r - ring) <= m.thick / 2);
    if (i < 0) return null;
    return { label: '', rows: [{ name: String(m.data[i].label ?? ''), color: m.colors[i], value: m.format(m.data[i][m.key]) }], at: beside(x, y, m.width, ui.theme().spacing.sm) };
  };
  const legend = () => $read(model).data.map((d, i) => ({ name: String(d.label ?? ''), label: String(d.label ?? ''), color: $read(model).colors[i] }));
  return <Frame props={props} kind="Radial bar chart" model={() => $read(model)} hit={hit} tooltip={read(props.tooltip) !== false} legend={legend} ref={size.ref} onResize={size.onResize} rootWidth="100%" />;
}

/**
 * A radar chart's model: axes clockwise from the top, a polygon grid at the
 * value ticks, a polygon per series.
 * @param {Record<string, any>} props @param {RuiThemeValue} theme @param {'light' | 'dark'} scheme @param {number} width @param {number} [boxHeight] the height it draws in (its `h`, or the theme's chart height, less its insets)
 */
export function radarModel(props, theme, scheme, width, boxHeight = typeof read(props.h) === 'number' ? Number(read(props.h)) : theme.sizes.box.chart) {
  const c = chartColors(theme, scheme);
  const data = /** @type {Record<string, any>[]} */ (width > 0 ? (read(props.data) ?? []) : []);
  const key = String(read(props.category) ?? 'label');
  const height = boxHeight;
  /** @type {{ name: string, label: string, color: string, stroke: string, opacity: number }[]} */
  const series = (read(props.series) ?? []).map((/** @type {any} */ s) => ({ name: String(s.key), label: String(s.label ?? s.key), color: tint(theme, scheme, s.color), stroke: tint(theme, scheme, s.lineColor ?? s.color), opacity: Number(s.opacity ?? read(props.fillOpacity) ?? theme.opacity.faint) }));
  const gridColor = props.gridColor == null ? c.grid : tint(theme, scheme, read(props.gridColor));
  const format = formatterOf(props);
  const cx = width / 2;
  const cy = height / 2;
  // Room around the web for the angle labels: twice the plot's end margin.
  const radius = Math.max(0, Math.min(width, height) / 2 - 2 * theme.chart.frame.right);
  // A point is a circle of `theme.chart.pointArea` px², as every chart's.
  const dot = Math.sqrt(theme.chart.pointArea / Math.PI);
  const n = data.length;
  const angle = (/** @type {number} */ i) => 90 - (i * 360) / Math.max(1, n);
  let max = 0;
  for (const row of data) for (const s of series) max = Math.max(max, num(row[s.name]) || 0);
  const radiusAxis = partOf(read(props.radiusAxis), true);
  const domain = radiusAxis?.domain;
  const axis = Array.isArray(domain) && typeof domain[1] === 'number' ? niceTicks(0, domain[1]) : niceTicks(0, max);
  const r = linearScale(0, axis.max, 0, radius);
  /** @type {Figure[]} */
  const figures = [];
  /** @type {PlacedText[]} */
  const labels = [];
  if (read(props.grid) !== false && n > 2) {
    for (const t of axis.ticks) {
      if (t <= 0) continue;
      /** @type {number[]} */
      const points = [];
      for (let i = 0; i < n; i++) points.push(...polar(cx, cy, r(t), angle(i)));
      figures.push({ kind: 'path', closed: true, color: gridColor, stroke: theme.sizes.divider.xs, points });
    }
    for (let i = 0; i < n; i++) {
      const [x, y] = polar(cx, cy, radius, angle(i));
      figures.push({ kind: 'line', x: cx, y: cy, right: x, bottom: y, color: gridColor, stroke: theme.sizes.divider.xs });
    }
  }
  for (const s of series) {
    /** @type {number[]} */
    const points = [];
    for (let i = 0; i < n; i++) points.push(...polar(cx, cy, r(Math.max(0, num(data[i][s.name]) || 0)), angle(i)));
    if (n < 2) continue;
    figures.push({ kind: 'path', closed: true, color: alpha(s.color, s.opacity), points });
    figures.push({ kind: 'path', closed: true, color: s.stroke, stroke: theme.sizes.divider.md, points });
    if (partOf(read(props.points), true) !== null)
      for (let p = 0; p < points.length; p += 2) figures.push({ kind: 'oval', x: points[p] - dot, y: points[p + 1] - dot, right: points[p] + dot, bottom: points[p + 1] + dot, color: s.stroke });
  }
  if (read(props.angleAxis) !== false)
    for (let i = 0; i < n; i++) {
      // An axis name a leader (spacing xs) past the rim, in a box of 13 characters.
      const [x, y] = polar(cx, cy, radius + theme.spacing.xs, angle(i));
      const dx = x - cx;
      const align = Math.abs(dx) < 4 ? 'center' : dx > 0 ? 'start' : 'end';
      const w = charsWide(theme, 13);
      const left = align === 'center' ? x - w / 2 : align === 'start' ? x : x - w;
      const top = Math.abs(dx) < 4 ? (y < cy ? y - theme.chart.line : y) : y - theme.chart.line / 2;
      labels.push({ text: String(data[i][key] ?? ''), x: Math.round(left), y: Math.round(top), w, align });
    }
  // A tick's value the label gap right of the center, in a box of 8 characters.
  const tickBox = charsWide(theme, 8);
  if (radiusAxis !== null && n > 0)
    for (const t of axis.ticks) labels.push({ text: format(t), x: Math.round(cx + labelGap(theme)), y: Math.round(cy - r(t) - theme.chart.line / 2), w: tickBox, align: 'start' });
  return { figures, labels, width, height, cx, cy, radius, angle, data, key, series, format, n };
}

/**
 * A radar chart: `data`, `category` (the axis
 * field, 'label' by default), `series` ({ key, color, opacity (the chart's `fillOpacity`,
 * the theme's `opacity.faint`), lineColor, label }[]: `key`
 * is the row field), `grid` (true), `angleAxis` (true), `radiusAxis`
 * (true, false or { domain }), `gridColor` (the grid's color), `points` (true), `legend` (on with two series or more; as
 * AreaChart's: under the chart at its start), `tooltip` (true),
 * `format`, `w`, `h` (300).
 * @param {Record<string, any>} props
 */
export function RadarChart(props) {
  const R = $active();
  const ui = $ui();
  const size = $chartWidth(props);
  const model = $memo(R, () => radarModel(props, ui.theme(), ui.scheme(), size.width(), size.inner(typeof read(props.h) === 'number' ? Number(read(props.h)) : ui.theme().sizes.box.chart)));
  const hit = (/** @type {number} */ x, /** @type {number} */ y) => {
    const m = $read(model);
    if (m.n === 0) return null;
    const { deg, r } = angleOf(m.cx, m.cy, x, y);
    if (r > m.radius + 10) return null;
    // The nearest axis: axes run clockwise from 90°.
    const step = 360 / m.n;
    const i = ((Math.round((((90 - deg) % 360) + 360) % 360 / step) % m.n) + m.n) % m.n;
    const row = m.data[i];
    return { label: String(row[m.key] ?? ''), rows: m.series.map(s => ({ name: s.label, color: s.color, value: m.format(row[s.name]) })), at: beside(x, y, m.width, ui.theme().spacing.sm) };
  };
  const legend = () => $read(model).series.map(s => ({ name: s.name, label: s.label, color: s.color }));
  return <Frame props={props} kind="Radar chart" model={() => $read(model)} hit={hit} tooltip={partOf(read(props.tooltip), true) !== null} legend={legend} legendOn={() => $read(model).series.length >= 2} ref={size.ref} onResize={size.onResize} rootWidth="100%" />;
}
