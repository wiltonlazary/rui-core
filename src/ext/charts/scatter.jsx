// ScatterChart (points on two value axes). BubbleChart lives in bubble.jsx.

import { View, Shape, Show, $active, $signal, $read, $write, $memo, read } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { styled } from '../../theme/style.js';
import { linearScale, valueAxis, num } from './scale.js';
import { dashPattern, dashedLine } from './path.js';
import { chartColors, tint, $chartWidth, Placed, Legend, Tip, beside, labelGap, charsWide, QUARTER, pointIn, rootProps, ChartData, datasetOf, legendAt, LEGEND_AT, shiftTip, $chartPadding } from './shared.jsx';
import { partOf } from '../../core/overlays/shared.jsx';

/** @typedef {import('./path.js').Figure} Figure */
/** @typedef {import('./shared.jsx').Placed} PlacedText */
/** @typedef {import('./shared.jsx').TooltipModel} TooltipModel */
/** @typedef {import('../../theme/theme.jsx').RuiThemeValue} RuiThemeValue */

/**
 * An axis's formatter: its own `format` and `unit`, else the chart's.
 * @param {Record<string, any>} props @param {Record<string, any>} axis the axis's options
 * @returns {(v: any) => string}
 */
function axisFormat(props, axis) {
  const fn = typeof axis.format === 'function' ? axis.format : props.format;
  const unit = axis.unit ?? read(props.unit) ?? '';
  return v => (v == null ? '' : `${typeof fn === 'function' ? fn(v) : String(v)}${unit}`);
}

/**
 * A scatter chart's model.
 * @param {Record<string, any>} props @param {RuiThemeValue} theme @param {'light' | 'dark'} scheme @param {number} width @param {number} height
 */
export function scatterModel(props, theme, scheme, width, height) {
  const c = chartColors(theme, scheme);
  const groups = /** @type {{ label: string, color?: string, points: Record<string, any>[] }[]} */ (read(props.data) ?? []);
  const key = read(props.category) ?? { x: 'x', y: 'y' };
  const xAxis = partOf(read(props.xAxis), true);
  const yAxis = partOf(read(props.yAxis), true);
  const xProps = xAxis ?? {};
  const yProps = yAxis ?? {};
  // A point's name on each axis (the tooltip's): its axis's title, else its field.
  const names = { x: String(xProps.title ?? key.x), y: String(yProps.title ?? key.y) };
  if (!(width > 0)) return { figures: [], labels: [], width: 0, height, points: [], groups, colors: groups.map(g => tint(theme, scheme, g.color)), key, names, fx: String, fy: String };
  const withX = xAxis !== null;
  const withY = yAxis !== null;
  const grid = read(props.grid) ?? 'rows';
  const ticks = read(props.ticks) ?? false;
  const dashes = dashPattern(read(props.dash) ?? '4 2');
  const gridColor = props.gridColor == null ? c.grid : tint(theme, scheme, read(props.gridColor));
  const fx = axisFormat(props, xProps);
  const fy = axisFormat(props, yProps);
  // A point's radius: a circle of `theme.chart.pointArea` px².
  const point = Math.sqrt(theme.chart.pointArea / Math.PI);
  // The axis titles: the x one under its ticks, the y one turned along the left edge.
  const xTitle = withX && xProps.title != null ? String(xProps.title) : null;
  const yTitle = withY && yProps.title != null ? String(yProps.title) : null;
  const left = withY ? Number(yProps.width ?? theme.chart.axisWidth) : 0;
  const { top, right } = theme.chart.frame;
  // A tick label's gap from its tick (and a title's from the tick labels);
  // the x axis takes a tick, the gap, a line of text and the gap.
  const tickGap = labelGap(theme);
  const xRow = theme.chart.tick + tickGap + theme.chart.line + tickGap;
  const plot = { left, top, right: Math.max(left, width - right), bottom: Math.max(top, height - (withX ? xRow : top) - (xTitle === null ? 0 : theme.chart.line + tickGap)) };
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const g of groups)
    for (const p of g.points ?? []) {
      const x = num(p[key.x]);
      const y = num(p[key.y]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  const xa = valueAxis(x0, x1, xProps.domain);
  const ya = valueAxis(y0, y1, yProps.domain);
  const sx = linearScale(xa.min, xa.max, plot.left, plot.right);
  const sy = linearScale(ya.min, ya.max, plot.bottom, plot.top);
  /** @type {Figure[]} */
  const figures = [];
  /** @type {PlacedText[]} */
  const labels = [];
  if (grid === 'rows' || grid === 'both') for (const t of ya.ticks) dashedLine(plot.left, sy(t), plot.right, sy(t), gridColor, 1, dashes, figures);
  if (grid === 'columns' || grid === 'both') for (const t of xa.ticks) dashedLine(sx(t), plot.top, sx(t), plot.bottom, gridColor, 1, dashes, figures);
  if (withY) {
    for (const t of ya.ticks) {
      if (ticks === 'y' || ticks === 'both') figures.push({ kind: 'line', x: plot.left - theme.chart.tick, y: sy(t), right: plot.left, bottom: sy(t), color: c.text, stroke: 1 });
      labels.push({ text: fy(t), x: 0, y: Math.round(sy(t) - theme.chart.line / 2), w: plot.left - theme.chart.tick - tickGap, align: 'end' });
    }
  }
  if (withX) {
    // A label's slot is an axis label's width at least.
    const slot = Math.max(theme.chart.axisWidth, sx(xa.ticks[1] ?? xa.max) - sx(xa.ticks[0] ?? xa.min));
    for (const t of xa.ticks) {
      if (ticks === 'x' || ticks === 'both') figures.push({ kind: 'line', x: sx(t), y: plot.bottom, right: sx(t), bottom: plot.bottom + theme.chart.tick, color: c.text, stroke: 1 });
      labels.push({ text: fx(t), x: Math.round(sx(t) - slot / 2), y: plot.bottom + theme.chart.tick + tickGap, w: Math.round(slot), align: 'center' });
    }
  }
  /** @type {{ x: number, y: number, group: number, point: Record<string, any> }[]} */
  const points = [];
  const colors = groups.map(g => tint(theme, scheme, g.color));
  groups.forEach((g, k) => {
    for (const p of g.points ?? []) {
      const x = num(p[key.x]);
      const y = num(p[key.y]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const px = sx(x);
      const py = sy(y);
      points.push({ x: px, y: py, group: k, point: p });
      figures.push({ kind: 'oval', x: px - point, y: py - point, right: px + point, bottom: py + point, color: colors[k] });
    }
  });
  // An x line's label: the label gap right of it, in a box of 17 characters.
  const refBox = charsWide(theme, 17);
  for (const line of read(props.references) ?? []) {
    const color = tint(theme, scheme, line.color, theme.chart.reference);
    const d = dashPattern(line.dash);
    if (line.y != null) {
      dashedLine(plot.left, sy(Number(line.y)), plot.right, sy(Number(line.y)), color, 1, d, figures);
      if (line.label != null) labels.push({ text: String(line.label), x: plot.left, y: Math.round(sy(Number(line.y)) - theme.chart.line - 2), w: plot.right - plot.left, align: line.at === 'start' ? 'start' : 'end', color });
    } else if (line.x != null) {
      dashedLine(sx(Number(line.x)), plot.top, sx(Number(line.x)), plot.bottom, color, 1, d, figures);
      if (line.label != null) labels.push({ text: String(line.label), x: Math.round(sx(Number(line.x)) + tickGap), y: line.at === 'bottom' ? plot.bottom - theme.chart.line : plot.top, w: refBox, align: 'start', color });
    }
  }
  if (xTitle !== null) labels.push({ text: xTitle, x: plot.left, y: height - theme.chart.line, w: plot.right - plot.left, align: 'center' });
  if (yTitle !== null) {
    const h = Math.max(0, plot.bottom - plot.top);
    labels.push({ text: yTitle, x: Math.round(theme.chart.line / 2 - h / 2), y: Math.round((plot.top + plot.bottom) / 2 - theme.chart.line / 2), w: Math.round(h), align: 'center', rotate: -QUARTER });
  }
  return { figures, labels, width, height, points, groups, colors, key, names, fx, fy };
}

/**
 * The tooltip of the point nearest (x, y), within `near` px (the theme's
 * `chart.near`), `gap` (spacing sm) clear of it.
 * @param {ReturnType<typeof scatterModel>} m @param {number} x @param {number} y @param {number} near @param {number} gap
 * @returns {TooltipModel | null}
 */
function nearestPoint(m, x, y, near, gap) {
  let best = -1;
  let dist = near;
  m.points.forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= dist) {
      dist = d;
      best = i;
    }
  });
  if (best < 0) return null;
  const p = m.points[best];
  const color = m.colors[p.group];
  return {
    label: String(m.groups[p.group].label ?? ''),
    rows: [
      { name: m.names.x, color, value: m.fx(p.point[m.key.x]) },
      { name: m.names.y, color, value: m.fy(p.point[m.key.y]) },
    ],
    at: beside(p.x, p.y, m.width, gap),
  };
}

/**
 * A scatter chart: `data` ({ label, color, points }[]), `category`
 * ({ x, y }: the point fields), `xAxis` and `yAxis` (true, false or
 * { title, unit, format, domain, width }: the title is drawn along the
 * axis and names its values in the tooltip; `unit` and `format` are the
 * axis's own, else the chart's `unit` and `format`), `grid` ('rows', 'columns', 'both' or
 * false), `ticks` (tick marks on the axes, named by axis: 'x', 'y',
 * 'both' or false), `dash` ('4 2'), `gridColor` (the grid's color),
 * `references` (as AreaChart's: a y line's label at 'end' or 'start', an x
 * line's at 'top' or 'bottom'), `legend` (as AreaChart's), `tooltip` (true),
 * `w`, `h` (300).
 * @param {Record<string, any>} props
 */
export function ScatterChart(props) {
  const R = $active();
  const ui = $ui();
  const size = $chartWidth(props);
  const pad = $chartPadding(props);
  const tip = $signal(R, /** @type {TooltipModel | null} */ (null));
  const legendOf = () => partOf(read(props.legend), false);
  const legendShown = () => legendOf() !== null;
  const place = () => legendAt(legendOf(), LEGEND_AT);
  const area = () => Math.max(0, size.inner(typeof read(props.h) === 'number' ? Number(read(props.h)) : ui.theme().sizes.box.chart) - (legendShown() ? ui.theme().chart.legend : 0));
  const model = $memo(R, () => scatterModel(props, ui.theme(), ui.scheme(), size.width(), area()));
  const items = () => $read(model).groups.map((g, i) => ({ name: String(g.label), label: String(g.label), color: $read(model).colors[i] }));
  const style = styled(props, theme => ({ position: 'relative', width: '100%', height: theme.sizes.box.chart, direction: 'column' }));
  const legend = <Legend items={items} justify={() => legendAt(read(props.legend) ?? null, LEGEND_AT).justify} />;
  return (
    <View {...rootProps(props, 'Scatter chart')} ref={size.ref} onResize={size.onResize} style={style}>
      <Show when={() => legendShown() && !place().bottom}>{legend}</Show>
      <View
        style={() => ({ position: 'relative', width: '100%', height: area(), shrink: 0 })}
        onPointerMove={(/** @type {any} */ e) => {
          if (read(props.tooltip) !== false) $write(tip, nearestPoint($read(model), ...pointIn(e), ui.theme().chart.near, ui.theme().spacing.sm));
        }}
        onPointerLeave={() => $write(tip, null)}
      >
        <Shape shapes={() => $read(model).figures} style={() => ({ position: 'absolute', left: 0, top: 0, width: $read(model).width, height: $read(model).height })} />
        <Placed items={() => $read(model).labels} color={() => chartColors(ui.theme(), ui.scheme()).text} />
      </View>
      <Show when={() => legendShown() && place().bottom}>{legend}</Show>
      <Show when={() => $read(tip) !== null}>
        <Tip tip={() => shiftTip(/** @type {TooltipModel} */ ($read(tip) ?? { label: '', rows: [], at: {} }), legendShown() && !place().bottom ? ui.theme().chart.legend : 0, pad())} />
      </Show>
      <ChartData of={() => datasetOf(props)} />
    </View>
  );
}
