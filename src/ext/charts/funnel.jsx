// FunnelChart: rows top to bottom, each a trapezoid as wide as its share of
// the largest value narrowing to the next row, the last one a rectangle;
// rows stand `gap` px apart, with their values inside or in a column
// beside the funnel.

import { $active, $memo, $read, read } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { isLight } from '../../theme/colors.js';
import { num } from './scale.js';
import { tint, formatterOf, beside, charsWide, $chartInsets } from './shared.jsx';
import { Frame } from './frame.jsx';

/** @typedef {import('./path.js').Figure} Figure */
/** @typedef {import('./shared.jsx').Placed} PlacedText */
/** @typedef {import('./shared.jsx').TooltipModel} TooltipModel */
/** @typedef {import('../../theme/theme.jsx').RuiThemeValue} RuiThemeValue */

/**
 * A funnel's model: a row per value, its top edge its share of the largest
 * value times the span, its bottom the next row's top (the last row keeps
 * its own), and the value labels.
 * @param {Record<string, any>} props @param {RuiThemeValue} theme @param {'light' | 'dark'} scheme @param {{ top: number, right: number, bottom: number, left: number }} [inset] its padding and border
 */
export function funnelModel(props, theme, scheme, inset = { top: 0, right: 0, bottom: 0, left: 0 }) {
  const data = /** @type {Record<string, any>[]} */ (read(props.data) ?? []);
  const format = formatterOf(props);
  const size = Number(read(props.size) ?? theme.sizes.box.funnel);
  const w = read(props.w);
  const h = read(props.h);
  // A given `w` or `h` is its border box: the drawing takes it less the insets.
  const width = typeof w === 'number' ? Math.max(0, w - inset.left - inset.right) : size;
  const height = typeof h === 'number' ? Math.max(0, h - inset.top - inset.bottom) : size;
  const gap = Math.max(0, Number(read(props.gap) ?? 2));
  const n = data.length;
  const rowH = n > 0 ? Math.max(0, (height - gap * (n - 1)) / n) : 0;
  const colors = data.map(d => tint(theme, scheme, d.color));
  const labelsShown = read(props.labels) === true;
  const at = read(props.labelsAt) === 'start' || read(props.labelsAt) === 'end' ? read(props.labelsAt) : 'inside';
  const texts = data.map(d => format(d.value));
  const aside = labelsShown && at !== 'inside';
  const column = aside ? charsWide(theme, Math.max(0, ...texts.map(s => s.length)) + 1) : 0;
  const clear = aside ? theme.spacing.xs : 0;
  const span = Math.max(0, width - column - clear);
  const left = at === 'start' && aside ? column + clear : 0;
  const mid = left + span / 2;
  const values = data.map(d => Math.max(0, num(d.value) || 0));
  const max = Math.max(0, ...values);
  const tops = values.map(v => (max > 0 ? (v / max) * span : 0));
  const line = theme.chart.line;
  /** @type {Figure[]} */
  const figures = [];
  /** @type {PlacedText[]} */
  const labels = [];
  /** @type {{ top: number, bottom: number }[]} */
  const rows = [];
  data.forEach((_, i) => {
    const top = i * (rowH + gap);
    const bottom = top + rowH;
    rows.push({ top, bottom });
    const a = tops[i] / 2;
    const b = (i < n - 1 ? tops[i + 1] : tops[i]) / 2;
    if (a > 0 || b > 0) figures.push({ kind: 'path', closed: true, color: colors[i], points: [mid - a, top, mid + a, top, mid + b, bottom, mid - b, bottom] });
    if (!labelsShown) return;
    const y = Math.round(top + rowH / 2 - line / 2);
    if (at === 'inside') labels.push({ text: texts[i], x: left, y, w: span, align: 'center', color: isLight(colors[i], theme.contrastThreshold) ? theme.black : theme.white });
    else if (at === 'start') labels.push({ text: texts[i], x: 0, y, w: column, align: 'end' });
    else labels.push({ text: texts[i], x: width - column, y, w: column, align: 'start' });
  });
  return { figures, labels, width, height, rows, data, colors, format };
}

/**
 * The tooltip of the row under (x, y), by y; a gap holds none.
 * @param {ReturnType<typeof funnelModel>} m @param {number} x @param {number} y @param {number} gap
 * @returns {TooltipModel | null}
 */
function funnelTip(m, x, y, gap) {
  const i = m.rows.findIndex(r => y >= r.top && y < r.bottom);
  if (i < 0) return null;
  const d = m.data[i];
  return { label: '', rows: [{ name: String(d.label ?? ''), color: m.colors[i], value: m.format(d.value) }], at: beside(x, y, m.width, gap) };
}

/**
 * A funnel: `data` ({ label, value, color }[]), `size` (`sizes.box.funnel`,
 * 260, for both `w` and `h`), `gap` (2 px between rows), `labels` (false),
 * `labelsAt` ('inside', 'start' or 'end'), `format`, `unit`, `tooltip`
 * (true), `w`, `h`.
 * @param {Record<string, any>} props
 */
export function FunnelChart(props) {
  const R = $active();
  const ui = $ui();
  const inset = $chartInsets(props);
  const model = $memo(R, () => funnelModel(props, ui.theme(), ui.scheme(), inset()));
  const hit = (/** @type {number} */ x, /** @type {number} */ y) => funnelTip($read(model), x, y, ui.theme().spacing.sm);
  return <Frame props={props} kind="funnelChart" model={() => $read(model)} hit={hit} tooltip={read(props.tooltip) !== false} />;
}
