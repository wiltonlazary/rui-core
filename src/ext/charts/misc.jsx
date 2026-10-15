// Sparkline (a bare trend line). Heatmap lives in heatmap.jsx and Bars in
// bars.jsx.

import { View, Shape, read } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { styled } from '../../theme/style.js';
import { alpha } from '../../theme/colors.js';
import { linearScale, num } from './scale.js';
import { curvePoints, gradientFill, runs } from './path.js';
import { tint, $chartWidth, rootProps, ChartData, datasetOf } from './shared.jsx';

/** @typedef {import('./path.js').Figure} Figure */
/** @typedef {import('../../theme/theme.jsx').RuiThemeValue} RuiThemeValue */

/**
 * The trend of a series: its last value against its first.
 * @param {readonly (number | null | undefined)[]} data
 * @returns {'up' | 'down' | 'flat'}
 */
export function trendOf(data) {
  const values = data.map(num).filter(Number.isFinite);
  if (values.length < 2) return 'flat';
  const d = values[values.length - 1] - values[0];
  return d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
}

/**
 * A sparkline's figures: the area under the line (solid at `fillOpacity`,
 * or with `fade` thinning out from `fillOpacity` under the line to nothing
 * at the base) and the line.
 * @param {Record<string, any>} props @param {RuiThemeValue} theme @param {'light' | 'dark'} scheme @param {number} width @param {number} height
 * @returns {Figure[]}
 */
export function sparkFigures(props, theme, scheme, width, height) {
  const data = /** @type {any[]} */ (read(props.data) ?? []);
  const values = data.map(num);
  const trends = read(props.trend);
  const color = tint(theme, scheme, trends == null ? read(props.color) : (trends[trendOf(data)] ?? read(props.color)));
  const stroke = Number(read(props.lineWidth) ?? 1.5);
  const opacity = Number(read(props.fillOpacity) ?? theme.opacity.soft);
  const gradient = read(props.fade) === true;
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0 || width <= 0) return [];
  const sx = linearScale(0, Math.max(1, values.length - 1), 0, width);
  const sy = linearScale(Math.min(...finite), Math.max(...finite), height - stroke / 2, stroke / 2);
  /** @type {Figure[]} */
  const out = [];
  for (const run of runs(values, read(props.bridge) === true)) {
    const xs = run.map(i => sx(i));
    const line = curvePoints(xs, run.map(i => sy(values[i])), read(props.curve) ?? 'monotone');
    if (run.length < 2) continue;
    const area = [...line, xs[xs.length - 1], height, xs[0], height];
    if (opacity > 0 && gradient) gradientFill(area, o => alpha(color, o), opacity, 0, out);
    else if (opacity > 0) out.push({ kind: 'path', closed: true, color: alpha(color, opacity), points: area });
    out.push({ kind: 'path', color, stroke, points: line });
  }
  return out;
}

/**
 * A sparkline: `data` (numbers), `color`,
 * `trend` ({ up, down, flat }: the color of each trend, its last value
 * against its first), `curve` ('monotone'), `lineWidth` (1.5),
 * `fillOpacity` (the theme's `opacity.soft`), `fade` (false), `bridge` (across missing values;
 * false: a gap breaks the line), `w` (else its
 * box's width), `h` (60).
 * @param {Record<string, any>} props
 */
export function Sparkline(props) {
  const ui = $ui();
  const size = $chartWidth(props);
  const height = () => size.inner(typeof read(props.h) === 'number' ? Number(read(props.h)) : ui.theme().sizes.box.spark);
  const figures = () => sparkFigures(props, ui.theme(), ui.scheme(), size.width(), height());
  const style = styled(props, theme => ({ width: '100%', height: theme.sizes.box.spark }));
  return (
    <View {...rootProps(props, 'sparkline')} ref={size.ref} onResize={size.onResize} style={style}>
      {/* In the flow, so its padding and border hold it in (an absolute one would sit on the padding's edge). */}
      <Shape shapes={figures} style={() => ({ width: size.width(), height: height(), shrink: 0 })} />
      <ChartData of={() => datasetOf(props)} />
    </View>
  );
}
