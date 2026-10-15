// BubbleChart: one bubble per category, standing in its own band at the
// height of its value on a value axis, its area telling its size. The
// category names sit under the bands; the tooltip finds the bubble under
// the pointer, or the nearest one close by.

import { $active, $memo, $read, read } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { alpha } from '../../theme/colors.js';
import { bandScale, linearScale, valueAxis, num } from './scale.js';
import { chartColors, tint, formatterOf, $chartWidth, beside, labelGap } from './shared.jsx';
import { partOf } from '../../core/overlays/shared.jsx';
import { Frame } from './frame.jsx';

/** @typedef {import('./path.js').Figure} Figure */
/** @typedef {import('./shared.jsx').Placed} PlacedText */
/** @typedef {import('./shared.jsx').TooltipModel} TooltipModel */
/** @typedef {import('../../theme/theme.jsx').RuiThemeValue} RuiThemeValue */

/**
 * A drawn bubble: its center, radius, row and color.
 * @typedef {object} Bubble
 * @property {number} x
 * @property {number} y
 * @property {number} r
 * @property {number} row the index of its row in `data`
 * @property {string} color
 * @property {number} value
 * @property {number} size
 */

/**
 * A bubble chart's model: the value axis, a band per row, and each row's
 * bubble at its value, its area its size mapped onto `range` (px²).
 * @param {Record<string, any>} props @param {RuiThemeValue} theme @param {'light' | 'dark'} scheme @param {number} width @param {number} height
 */
export function bubbleModel(props, theme, scheme, width, height) {
  const c = chartColors(theme, scheme);
  const data = /** @type {Record<string, any>[]} */ (read(props.data) ?? []);
  const category = String(read(props.category) ?? 'label');
  const valueKey = String(read(props.valueKey) ?? 'value');
  const sizeKey = String(read(props.sizeKey) ?? valueKey);
  const format = formatterOf(props);
  const label = read(props.label);
  const colors = data.map(d => tint(theme, scheme, d.color, read(props.color)));
  /** @type {Figure[]} */
  const figures = [];
  /** @type {PlacedText[]} */
  const labels = [];
  /** @type {Bubble[]} */
  const bubbles = [];
  const base = { figures, labels, width, height, bubbles, data, category, valueKey, sizeKey, format, label };
  if (!(width > 0)) return base;
  const yAxis = partOf(read(props.yAxis), true);
  const withX = read(props.xAxis) !== false;
  const grid = read(props.grid) ?? 'rows';
  const [least, most] = /** @type {[number, number]} */ (read(props.range) ?? [24, 400]);
  const gap = labelGap(theme);
  const line = theme.chart.line;
  const left = yAxis === null ? 0 : Number(yAxis.width ?? theme.chart.axisWidth);
  const plot = {
    left,
    top: theme.chart.frame.top,
    right: Math.max(left, width - theme.chart.frame.right),
    bottom: Math.max(theme.chart.frame.top, height - (withX ? theme.sizes.box.bubble.label : 0)),
  };
  // The rows that draw a bubble: a finite value and a finite size.
  const values = data.map(d => num(d[valueKey]));
  const sizes = data.map(d => num(d[sizeKey]));
  const drawn = data.map((_, i) => Number.isFinite(values[i]) && Number.isFinite(sizes[i]));
  let v0 = Infinity;
  let v1 = -Infinity;
  let s0 = Infinity;
  let s1 = -Infinity;
  data.forEach((_, i) => {
    if (!drawn[i]) return;
    v0 = Math.min(v0, values[i]);
    v1 = Math.max(v1, values[i]);
    s0 = Math.min(s0, sizes[i]);
    s1 = Math.max(s1, sizes[i]);
  });
  const areaOf = (/** @type {number} */ s) => (s1 === s0 ? most : least + ((s - s0) / (s1 - s0)) * (most - least));
  const radiusOf = (/** @type {number} */ s) => Math.sqrt(Math.max(0, areaOf(s)) / Math.PI);
  // The largest bubble's radius keeps every bubble inside the plot.
  const inset = drawn.some(Boolean) ? Math.max(radiusOf(s0), radiusOf(s1)) : 0;
  const axis = valueAxis(v0, v1, yAxis?.domain);
  const sy = linearScale(axis.min, axis.max, plot.bottom - inset, plot.top + inset);
  if (grid === 'rows') for (const t of axis.ticks) figures.push({ kind: 'line', x: plot.left, y: sy(t), right: plot.right, bottom: sy(t), color: c.grid, stroke: 1 });
  if (yAxis !== null) {
    for (const t of axis.ticks) labels.push({ text: format(t), x: 0, y: Math.round(sy(t) - line / 2), w: Math.max(0, left - gap), align: 'end' });
    if (label != null) labels.push({ text: String(label), x: 0, y: 0, w: left, align: 'start' });
  }
  const band = bandScale(data.length, plot.left, plot.right);
  data.forEach((d, i) => {
    if (withX) labels.push({ text: String(d[category] ?? ''), x: Math.round(band.start(i)), y: plot.bottom + gap, w: Math.round(band.step), align: 'center' });
    if (!drawn[i]) return;
    const x = band.center(i);
    const y = sy(values[i]);
    const r = radiusOf(sizes[i]);
    bubbles.push({ x, y, r, row: i, color: colors[i], value: values[i], size: sizes[i] });
    figures.push({ kind: 'oval', x: x - r, y: y - r, right: x + r, bottom: y + r, color: alpha(colors[i], theme.opacity.muted) });
    figures.push({ kind: 'oval', x: x - r, y: y - r, right: x + r, bottom: y + r, color: colors[i], stroke: 1 });
  });
  return base;
}

/**
 * The tooltip of the bubble under (x, y), else of the nearest center within
 * `near` px; null when none.
 * @param {ReturnType<typeof bubbleModel>} m @param {number} x @param {number} y @param {number} near @param {number} gap
 * @returns {TooltipModel | null}
 */
function bubbleTip(m, x, y, near, gap) {
  /** @type {Bubble | null} */
  let inside = null;
  /** @type {Bubble | null} */
  let nearest = null;
  let best = near;
  for (const b of m.bubbles) {
    const d = Math.hypot(b.x - x, b.y - y);
    if (d <= b.r && (inside === null || d < Math.hypot(inside.x - x, inside.y - y))) inside = b;
    if (d <= best) {
      best = d;
      nearest = b;
    }
  }
  const b = inside ?? nearest;
  if (b === null) return null;
  const row = m.data[b.row];
  const rows = [{ name: String(m.label ?? m.valueKey), color: b.color, value: m.format(row[m.valueKey]) }];
  if (m.sizeKey !== m.valueKey) rows.push({ name: m.sizeKey, color: b.color, value: String(row[m.sizeKey]) });
  return { label: String(row[m.category] ?? ''), rows, at: beside(b.x, b.y - b.r, m.width, gap) };
}

/**
 * A bubble chart: `data` (one row per category), `category` (the name field:
 * 'label'), `valueKey` (the bubble's height on the value axis: 'value'),
 * `sizeKey` (its area: `valueKey`), `range` (the areas in px² the smallest
 * and largest sizes take: [24, 400]), `label` (the value's name, over the
 * axis and in the tooltip), `color` (the accent; a row's own wins),
 * `format`, `unit`, `grid` ('rows' or false), `xAxis` (true), `yAxis`
 * (true, false or { width, domain }), `tooltip` (true), `w`, `h` (300).
 * @param {Record<string, any>} props
 */
export function BubbleChart(props) {
  const R = $active();
  const ui = $ui();
  const size = $chartWidth(props);
  const height = () => size.inner(typeof read(props.h) === 'number' ? Number(read(props.h)) : ui.theme().sizes.box.chart);
  const model = $memo(R, () => bubbleModel(props, ui.theme(), ui.scheme(), size.width(), height()));
  const hit = (/** @type {number} */ x, /** @type {number} */ y) => bubbleTip($read(model), x, y, ui.theme().chart.near, ui.theme().spacing.sm);
  return <Frame props={props} kind="bubbleChart" model={() => $read(model)} hit={hit} tooltip={read(props.tooltip) !== false} ref={size.ref} onResize={size.onResize} rootWidth="100%" />;
}
