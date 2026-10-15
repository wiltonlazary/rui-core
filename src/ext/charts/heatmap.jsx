// Heatmap: a calendar of days as colored squares, one column a week, the
// week's first day on top. Dates are day numbers (dates/arith.js), never
// Date objects, so a day lands in the same cell in every time zone.

import { $active, $memo, $read, read } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { alpha } from '../../theme/colors.js';
import { pageColors, radiusOf } from '../../theme/resolve.js';
import { toDate, toDays, fromDays, dayOfWeek, partsOf, startOfWeek, endOfWeek } from '../dates/arith.js';
import { $settings } from '../dates/shared.jsx';
import { tint, formatterOf, beside, labelGap, charsWide } from './shared.jsx';
import { partOf } from '../../core/overlays/shared.jsx';
import { Frame } from './frame.jsx';

/** @typedef {import('./path.js').Figure} Figure */
/** @typedef {import('./shared.jsx').Placed} PlacedText */
/** @typedef {import('../../theme/theme.jsx').RuiThemeValue} RuiThemeValue */
/** @typedef {{ date: string, x: number, y: number, value: number | null }} HeatCell */
/** @typedef {{ weekStart: number, today: string, labels: import('../dates/arith.js').DatesLabels }} HeatSettings */

/**
 * A value's color among `colors`, in equal-width bins from `min` to `max`:
 * the share of the way `p` (clamped to 0..1) picks bin `floor(p * n)`, the
 * top value the last bin; a flat range (`max === min`) the last color.
 * @template T
 * @param {number} value @param {number} min @param {number} max @param {readonly T[]} colors
 * @returns {T}
 */
export function heatColor(value, min, max, colors) {
  const n = colors.length;
  if (max === min) return colors[n - 1];
  const p = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return colors[Math.min(n - 1, Math.floor(p * n))];
}

/**
 * The default levels: the accent at its scheme's shade, faint, disabled and
 * dense, then solid two shades toward the strong end (deeper in light,
 * lighter in dark).
 * @param {RuiThemeValue} theme @param {'light' | 'dark'} scheme
 */
function accentLevels(theme, scheme) {
  const shades = theme.colors[theme.accent];
  const shade = theme.accentShade[scheme];
  const base = shades[shade];
  const strong = shades[Math.max(0, Math.min(9, scheme === 'dark' ? shade - 2 : shade + 2))];
  return [alpha(base, theme.opacity.faint), alpha(base, theme.opacity.disabled), alpha(base, theme.opacity.dense), strong];
}

/**
 * A heatmap's model: every drawn day placed by one walk over the range, its
 * color from its value, the month and weekday names, the legend line, and
 * the size.
 * @param {Record<string, any>} props @param {RuiThemeValue} theme @param {'light' | 'dark'} scheme @param {HeatSettings} settings
 * @returns {{ figures: Figure[], labels: PlacedText[], width: number, height: number, cells: HeatCell[], fills: string[], size: number, format: (v: any) => string }}
 */
export function heatmapModel(props, theme, scheme, settings) {
  const weekStart = settings.weekStart;
  const year = partsOf(settings.today)[0];
  const from = toDate(read(props.from)) ?? `${year}-01-01`;
  const to = toDate(read(props.to)) ?? `${year}-12-31`;
  const outside = read(props.outside) === true;
  const gaps = read(props.monthGaps) === true;
  const today = toDays(settings.today);

  const own = /** @type {Record<string, any>} */ (read(props.cell) ?? {});
  const size = Number(own.size ?? theme.sizes.glyph.xs);
  const gap = Number(own.gap ?? 2);
  const radius = own.radius === 0 ? 0 : radiusOf(theme, own.radius ?? 'xs');
  const pitch = size + gap;
  const line = theme.chart.line;

  const months = partOf(read(props.months), true);
  const weekdays = partOf(read(props.weekdays), true);
  const legend = partOf(read(props.legend), false);
  const top = months === null ? 0 : Number(months.height ?? line);
  const left = weekdays === null ? 0 : Number(weekdays.width ?? theme.spacing.lg);

  /** @type {Map<string, number>} */
  const values = new Map();
  for (const [key, v] of Object.entries(/** @type {Record<string, any>} */ (read(props.data) ?? {}))) {
    const date = toDate(key);
    const n = typeof v === 'number' ? v : Number(v);
    if (date !== null && v != null && v !== '' && Number.isFinite(n)) values.set(date, n);
  }

  // The walk: one day at a time, a new column at each week's first row and,
  // with month gaps, at a month's first day mid-week, plus a gutter each month.
  const first = toDays(outside ? startOfWeek(from, weekStart) : from);
  const last = toDays(outside ? endOfWeek(to, weekStart) : to);
  /** @type {HeatCell[]} */
  const cells = [];
  /** @type {{ month: number, x: number, days: number }[]} */
  const starts = [];
  let column = 0;
  let gutters = 0;
  let filled = false;
  let month = NaN;
  for (let n = first; n <= last; n++) {
    const date = fromDays(n);
    const row = (dayOfWeek(date) - weekStart + 7) % 7;
    const [y, m] = partsOf(date);
    const key = y * 12 + m - 1;
    if (n > first && row === 0) {
      column++;
      filled = false;
    }
    if (key !== month && n > first && gaps) {
      if (filled) column++;
      filled = false;
      gutters++;
    }
    const x = left + column * pitch + gutters * theme.spacing.xs;
    if (key !== month) starts.push({ month: m - 1, x, days: 0 });
    month = key;
    starts[starts.length - 1].days++;
    filled = true;
    cells.push({ date, x, y: top + row * pitch, value: values.get(date) ?? null });
  }

  let min = Infinity;
  let max = -Infinity;
  for (const c of cells) {
    if (c.value === null) continue;
    min = Math.min(min, c.value);
    max = Math.max(max, c.value);
  }
  const domain = read(props.domain);
  if (Array.isArray(domain) && domain.length === 2) [min, max] = [Number(domain[0]), Number(domain[1])];
  else if (min > max) min = max = 0;
  const picked = read(props.colors);
  const levels = Array.isArray(picked) && picked.length > 0 ? picked.map(c => tint(theme, scheme, c)) : accentLevels(theme, scheme);
  const track = pageColors(theme, scheme).track;
  const kind = radius > 0 ? 'round' : 'rect';

  /** @type {Figure[]} */
  const figures = [];
  /** @type {string[]} */
  const fills = [];
  for (const c of cells) {
    const color = c.value === null || toDays(c.date) > today ? track : heatColor(c.value, min, max, levels);
    fills.push(color);
    figures.push({ kind, x: c.x, y: c.y, right: c.x + size, bottom: c.y + size, radius, color });
  }

  /** @type {PlacedText[]} */
  const labels = [];
  const gridRight = cells.reduce((r, c) => Math.max(r, c.x + size), left);
  const gridBottom = top + 7 * pitch - gap;

  if (months !== null) {
    const names = /** @type {readonly string[]} */ (months.names ?? settings.labels.monthsAbbr);
    const y = Math.round((top - line) / 2);
    let end = -Infinity;
    for (const s of starts) {
      const text = String(names[s.month] ?? '');
      if (s.days < 7 || text === '' || s.x < end + labelGap(theme)) continue;
      const w = charsWide(theme, text.length);
      labels.push({ text, x: s.x, y, w, align: 'start' });
      end = s.x + w;
    }
  }

  if (weekdays !== null) {
    const given = Array.isArray(weekdays.names);
    const names = /** @type {readonly string[]} */ (given ? weekdays.names : settings.labels.weekdaysNarrow);
    const every = given || pitch >= line;
    const w = left - labelGap(theme);
    for (let row = 0; row < 7; row++) {
      if (!every && row % 2 === 0) continue;
      const text = String(names[(weekStart + row) % 7] ?? '');
      if (text === '') continue;
      labels.push({ text, x: 0, y: Math.round(top + row * pitch + (size - line) / 2), w, align: 'start' });
    }
  }

  let width = gridRight;
  let height = gridBottom;
  const format = formatterOf(props);
  if (legend !== null) {
    const ends = Array.isArray(legend.labels) ? legend.labels : [format(min), format(max)];
    const low = String(ends[0] ?? '');
    const high = String(ends[1] ?? '');
    const y = gridBottom + theme.spacing.xs;
    const lowW = charsWide(theme, low.length);
    const swatches = left + lowW + labelGap(theme);
    const swatchY = y + (line - size) / 2;
    levels.forEach((color, i) => {
      const x = swatches + i * pitch;
      figures.push({ kind, x, y: swatchY, right: x + size, bottom: swatchY + size, radius, color });
    });
    const highX = swatches + (levels.length - 1) * pitch + size + labelGap(theme);
    const highW = charsWide(theme, high.length);
    labels.push({ text: low, x: left, y, w: lowW, align: 'end' }, { text: high, x: highX, y, w: highW, align: 'start' });
    width = Math.max(width, highX + highW);
    height += theme.spacing.xs + line;
  }

  return { figures, labels, width, height, cells, fills, size, format };
}

/**
 * A calendar heatmap: `data` ({ 'YYYY-MM-DD': number }), `from` and `to`
 * (today's calendar year by default), `weekStart` and `today` (else
 * DateSettings'), `outside` (fill the first and last weeks: false),
 * `monthGaps` (each month in fresh columns, a gutter of spacing xs apart:
 * false), `cell` ({ size: `sizes.glyph.xs`, gap: 2, radius: 'xs' }),
 * `colors` (the levels, low to high: the accent's four by default),
 * `domain` ([min, max]: the values' own by default), `months` (true or
 * { names, height }), `weekdays` (true or { names, width }), `legend`
 * (false; true or { labels: [low, high] }), `format`, `unit`, `label` (the
 * value's name in the tooltip), `tooltip` (false), `tipOf({ date, value })`
 * (the tooltip's one line).
 * @param {Record<string, any>} props
 */
export function Heatmap(props) {
  const R = $active();
  const ui = $ui();
  const s = $settings(props);
  const model = $memo(R, () => heatmapModel(props, ui.theme(), ui.scheme(), { weekStart: s.weekStart(), today: s.today(), labels: s.labels() }));
  const hit = (/** @type {number} */ x, /** @type {number} */ y) => {
    const m = $read(model);
    const i = m.cells.findIndex(c => x >= c.x && x < c.x + m.size && y >= c.y && y < c.y + m.size);
    if (i < 0) return null;
    const c = m.cells[i];
    const at = beside(c.x + m.size / 2, c.y + m.size, m.width, ui.theme().spacing.sm);
    const tipOf = props.tipOf;
    if (typeof tipOf === 'function') return { label: String(tipOf({ date: c.date, value: c.value })), rows: [], at };
    return { label: c.date, rows: [{ name: String(read(props.label) ?? ''), color: m.fills[i], value: m.format(c.value) }], at };
  };
  return <Frame props={props} kind="heatmap" model={() => $read(model)} hit={hit} tooltip={partOf(read(props.tooltip), false) !== null} />;
}
