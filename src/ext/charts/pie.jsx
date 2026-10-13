// PieChart and DonutChart: slices clockwise from three o'clock, a gap
// angle between them instead of strokes, labels inside or around the
// rim, and a caption in the donut's hole. Hit testing is by angle and
// radius, so the tooltip works the same on every renderer.

import { View, Label, $active, $memo, $read, read } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { isLight } from '../../theme/colors.js';
import { pageColors } from '../../theme/resolve.js';
import { DECOR } from '../../theme/meaning.js';
import { num } from './scale.js';
import { wedge, polar, angleOf, onSweep } from './path.js';
import { tint, formatterOf, beside, labelGap, charsWide, $chartInsets } from './shared.jsx';
import { partOf } from '../../core/overlays/shared.jsx';
import { Frame } from './frame.jsx';

/** @typedef {import('./path.js').Figure} Figure */
/** @typedef {import('./shared.jsx').Placed} PlacedText */
/** @typedef {import('./shared.jsx').TooltipModel} TooltipModel */
/** @typedef {import('../../theme/theme.jsx').RuiThemeValue} RuiThemeValue */

/** Past this share of the radius sideways (the cosine), an outside label sits beside its leader; nearer the top or bottom, over or under it. */
const SIDEWAYS = 0.25;

/**
 * The slices of `values` on the sweep from `start` to `end` degrees (at
 * most one turn): each positive value its share of the sweep less one
 * `gap` per positive slice, inset half a gap at both ends; a lone
 * positive slice fills the sweep. A zero, negative or missing value takes
 * no arc, at the boundary after the slice before it.
 * @param {readonly any[]} values @param {number} start @param {number} end @param {number} gap
 * @returns {{ from: number, to: number, share: number }[]}
 */
export function slices(values, start, end, gap) {
  const dir = end >= start ? 1 : -1;
  const span = Math.min(360, Math.abs(end - start));
  const own = values.map(v => {
    const n = num(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  });
  const total = own.reduce((a, b) => a + b, 0);
  const count = own.filter(v => v > 0).length;
  const g = count >= 2 ? Math.max(0, gap) : 0;
  const room = Math.max(0, span - count * g);
  let at = start;
  return own.map(v => {
    const share = total > 0 ? v / total : 0;
    if (v === 0) return { from: at, to: at, share };
    const from = at + (dir * g) / 2;
    const to = from + dir * share * room;
    at = to + (dir * g) / 2;
    return { from, to, share };
  });
}

/**
 * A share as a percent: whole percents, one decimal under 10 %; a
 * malformed or empty `locale` formats as 'en-US'.
 * @param {number} share @param {string} [locale]
 */
export const percentText = (share, locale = 'en-US') => {
  const options = { style: /** @type {const} */ ('percent'), maximumFractionDigits: share < 0.1 ? 1 : 0 };
  try {
    return new Intl.NumberFormat(locale, options).format(share);
  } catch {
    return new Intl.NumberFormat('en-US', options).format(share);
  }
};

/**
 * A pie's or donut's model: its slices, their wedges and labels, and the
 * box (grown for outside labels).
 * @param {Record<string, any>} props @param {boolean} donut @param {RuiThemeValue} theme @param {'light' | 'dark'} scheme @param {{ top: number, right: number, bottom: number, left: number }} [inset] its padding and border
 */
export function pieModel(props, donut, theme, scheme, inset = { top: 0, right: 0, bottom: 0, left: 0 }) {
  const data = /** @type {Record<string, any>[]} */ (read(props.data) ?? []);
  const format = formatterOf(props);
  const locale = String(read(props.locale) ?? 'en-US');
  const size = Number(read(props.size) ?? theme.sizes.box.pie);
  const outer = size / 2;
  const inner = donut ? Math.max(0, outer - Number(read(props.thickness) ?? theme.sizes.box.donut)) : 0;
  const gap = Number(read(props.gap) ?? (donut ? 2 : 1));
  const start = Number(read(props.startAngle) ?? 0);
  const end = Number(read(props.endAngle) ?? -360);
  const colors = data.map(d => tint(theme, scheme, d.color));
  const parts = slices(data.map(d => d.value), start, end, gap);
  const labelsShown = read(props.labels) === true;
  const outside = donut || read(props.labelsAt) === 'outside';
  const asValue = read(props.labelsAs) === 'value';
  const line = theme.chart.line;
  const lead = theme.spacing.xs;
  const gapText = labelGap(theme);
  const texts = data.map((d, i) => (parts[i].share > 0 ? (asValue ? format(d.value) : percentText(parts[i].share, locale)) : ''));
  const widest = Math.max(0, ...texts.filter(s => s !== '').map(s => charsWide(theme, s.length + 1)));
  const grow = labelsShown && outside ? { x: lead + gapText + widest, y: lead + gapText + line } : { x: 0, y: 0 };
  const w = read(props.w);
  const h = read(props.h);
  // A given `w` or `h` is its border box: the drawing takes it less the insets.
  const width = typeof w === 'number' ? Math.max(0, w - inset.left - inset.right) : size + 2 * grow.x;
  const height = typeof h === 'number' ? Math.max(0, h - inset.top - inset.bottom) : size + 2 * grow.y;
  const cx = width / 2;
  const cy = height / 2;
  /** @type {Figure[]} */
  const figures = [];
  /** @type {PlacedText[]} */
  const labels = [];
  parts.forEach((p, i) => {
    if (p.share > 0) figures.push({ kind: 'path', closed: true, color: colors[i], points: wedge(cx, cy, inner, outer, p.from, p.to) });
  });
  if (labelsShown)
    parts.forEach((p, i) => {
      if (!(p.share > 0)) return;
      const text = texts[i];
      const box = charsWide(theme, text.length + 1);
      const mid = (p.from + p.to) / 2;
      if (!outside) {
        const [x, y] = polar(cx, cy, donut ? (inner + outer) / 2 : outer - theme.chart.labelOffset - line, mid);
        labels.push({ text, x: Math.round(x - box / 2), y: Math.round(y - line / 2), w: box, align: 'center', color: isLight(colors[i], theme.contrastThreshold) ? theme.black : theme.white });
        return;
      }
      const [px, py] = polar(cx, cy, outer + lead, mid);
      if (read(props.leaders) === true) {
        const [rx, ry] = polar(cx, cy, outer, mid);
        figures.push({ kind: 'line', x: rx, y: ry, right: px, bottom: py, color: colors[i], stroke: 1 });
      }
      const rad = (mid * Math.PI) / 180;
      const cos = Math.cos(rad);
      if (Math.abs(cos) >= SIDEWAYS) {
        const right = cos > 0;
        labels.push({ text, x: Math.round(right ? px + gapText : px - gapText - box), y: Math.round(py - line / 2), w: box, align: right ? 'start' : 'end' });
      } else {
        const above = Math.sin(rad) > 0;
        labels.push({ text, x: Math.round(px - box / 2), y: Math.round(above ? py - gapText - line : py + gapText), w: box, align: 'center' });
      }
    });
  return { figures, labels, width, height, cx, cy, inner, outer, parts, data, colors, format };
}

/**
 * The tooltip at (x, y): the slice whose arc, between the inner and outer
 * radius, holds the point (or every slice, scope 'chart'); a gap or the
 * hole holds none.
 * @param {ReturnType<typeof pieModel>} m @param {number} x @param {number} y @param {'slice' | 'chart'} scope @param {number} gap
 * @returns {TooltipModel | null}
 */
function pieTip(m, x, y, scope, gap) {
  const { deg, r } = angleOf(m.cx, m.cy, x, y);
  if (r < m.inner || r > m.outer) return null;
  const i = m.parts.findIndex(p => p.share > 0 && onSweep(deg, p.from, p.to));
  if (i < 0) return null;
  const row = (/** @type {number} */ k) => ({ name: String(m.data[k].label ?? ''), color: m.colors[k], value: m.format(m.data[k].value) });
  return { label: '', rows: scope === 'chart' ? m.data.map((_, k) => row(k)) : [row(i)], at: beside(x, y, m.width, gap) };
}

/**
 * A pie or a donut on the round charts' Frame.
 * @param {Record<string, any>} props @param {boolean} donut
 */
function Round(props, donut) {
  const R = $active();
  const ui = $ui();
  const inset = $chartInsets(props);
  const model = $memo(R, () => pieModel(props, donut, ui.theme(), ui.scheme(), inset()));
  const tip = partOf(read(props.tooltip), true);
  const scope = tip?.scope === 'chart' ? 'chart' : 'slice';
  const hit = (/** @type {number} */ x, /** @type {number} */ y) => pieTip($read(model), x, y, scope, ui.theme().spacing.sm);
  const caption = donut ? read(props.caption) : null;
  const center =
    caption == null ? null : (
      <View
        {...(typeof caption === 'string' || typeof caption === 'number' ? DECOR : {})}
        style={() => {
          const m = $read(model);
          return { position: 'absolute', left: m.cx - m.inner, top: m.cy - m.inner, width: 2 * m.inner, height: 2 * m.inner, align: 'center', justify: 'center' };
        }}
      >
        {typeof caption === 'string' || typeof caption === 'number' ? (
          <Label
            text={String(caption)}
            style={() => {
              const theme = ui.theme();
              return { fontSize: theme.fontSizes.md, fontWeight: theme.weights.strong, color: pageColors(theme, ui.scheme()).text, textAlign: 'center', select: 'none' };
            }}
          />
        ) : (
          caption
        )}
      </View>
    );
  return <Frame props={props} kind={donut ? 'Donut chart' : 'Pie chart'} model={() => $read(model)} hit={hit} tooltip={tip !== null} center={center} />;
}

/**
 * A donut: `data` ({ label, value, color }[]), `size` (`sizes.box.pie`,
 * 180), `thickness` (`sizes.box.donut`, 24), `gap` (2°), `startAngle` (0:
 * three o'clock) and `endAngle` (-360: one turn clockwise), `labels`
 * (false; always outside), `labelsAs` ('percent' or 'value'), `leaders`
 * (false), `locale` ('en-US'), `caption` (text or a node in the hole),
 * `format`, `unit`, `tooltip` (true or { scope: 'slice' | 'chart' }), `w`,
 * `h`.
 * @param {Record<string, any>} props
 */
export function DonutChart(props) {
  return Round(props, true);
}

/**
 * A pie: as DonutChart without `thickness` and `caption`, `gap` 1°, and
 * `labelsAt` ('inside' or 'outside').
 * @param {Record<string, any>} props
 */
export function PieChart(props) {
  return Round(props, false);
}
