// What the charts share: their colors (theme colors), the
// width a chart draws at (`w`, or its box measured after layout), text
// placed at computed positions, the legend and the tooltip box. Positions
// are computed, never measured from text, so a chart lays out the same on
// every renderer.

import { View, Label, For, Show, $active, $signal, $read, $write, $untrack, read } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { colorOf, pageColors, shadowOf, radiusOf } from '../../theme/resolve.js';
import { alpha } from '../../theme/colors.js';
import { own } from '../../own.js';
import { boxOf, insetsOf, bordersOf } from '../../core/misc/tween.js';
import { styled } from '../../theme/style.js';
import { DECOR, UNSEEN } from '../../theme/meaning.js';
import { handOn } from '../../core/ref.js';

/** @typedef {import('../../theme/theme.jsx').RuiThemeValue} RuiThemeValue */
/** @typedef {'light' | 'dark'} Scheme */

/**
 * Text at a computed place: `x`, `y` (its box's top left), `w` (the box's
 * width; the text aligns in it), `align`.
 * @typedef {object} Placed
 * @property {string} text
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {'start' | 'center' | 'end'} align
 * @property {string=} color a color of its own
 * @property {number=} rotate degrees, about `origin`
 * @property {[number, number]=} origin the rotation's center in the box (px; its center by default)
 * @property {number=} size a font size of its own
 */

/**
 * The chart colors in a scheme, from the page's roles: the grid (the
 * page's `border` at the theme's `opacity.muted`), the text (`quiet`), the cursor band (`hover`),
 * the raised surface and its `rule`, and the page's text and ground.
 * @param {RuiThemeValue} theme @param {Scheme} scheme
 */
export function chartColors(theme, scheme) {
  const page = pageColors(theme, scheme);
  return {
    grid: alpha(page.border, theme.opacity.muted),
    cursor: page.hover,
    text: page.quiet,
    ink: page.text,
    body: page.body,
    raised: page.raised,
    border: page.rule,
  };
}

/**
 * A color prop (a theme name, 'name.shade' or hex) in the scheme, with a
 * fallback name.
 * @param {RuiThemeValue} theme @param {Scheme} scheme @param {any} color @param {string} [fallback]
 */
export const tint = (theme, scheme, color, fallback) => colorOf(theme, scheme, color ?? fallback ?? theme.accent);

/**
 * A value formatter: `format` (a function) or the value as it is,
 * with `unit` after it.
 * @param {Record<string, any>} props
 * @returns {(value: any) => string}
 */
export function formatterOf(props) {
  // A function prop is the formatter itself, never an accessor of one.
  const f = props.format;
  const unit = read(props.unit) ?? '';
  return value => (value == null || (typeof value === 'number' && Number.isNaN(value)) ? '' : `${typeof f === 'function' ? f(value) : String(value)}${unit}`);
}

/**
 * A chart's own insets: the padding and border its caller gave it (`p`,
 * `style`), which its drawing sits inside.
 * @param {Record<string, any>} props
 * @returns {() => { top: number, right: number, bottom: number, left: number }}
 */
export function $chartInsets(props) {
  const own = styled(props);
  return () => insetsOf(own());
}

/**
 * The width a chart draws at, inside its padding and border: its `w` when a
 * number, else its root's width as the root's `onResize` reports it, the
 * first size and each change (a ResizeObserver's on the DOM, after layout
 * on the canvases); `inner(h)` is a border-box height (its `h`, or
 * its default) less the insets above and below.
 * @param {Record<string, any>} props
 */
export function $chartWidth(props) {
  const R = $active();
  const inset = $chartInsets(props);
  const measured = $signal(R, 0);
  const fixed = () => {
    const w = read(props.w);
    return typeof w === 'number' ? w : null;
  };
  return {
    /** @param {any} n */
    ref(n) {
      handOn(props.ref, n);
    },
    width: () => Math.max(0, (fixed() ?? /** @type {number} */ ($read(measured))) - inset().left - inset().right),
    /** @param {number} h */
    inner: h => Math.max(0, h - inset().top - inset().bottom),
    /** The root's new border box. @param {{ width: number, height: number }} box */
    onResize(box) {
      const w = Math.round(box.width);
      if (fixed() === null && w > 0 && w !== $untrack(R, () => $read(measured))) $write(measured, w);
      props.onResize?.(box);
    },
  };
}

/**
 * Text placed at computed positions, at the theme's `xs` font size, in the
 * chart's text color unless a record has its own.
 * @param {{ items: () => readonly Placed[], color: () => string }} props
 */
export function Placed(props) {
  const ui = $ui();
  return (
    <For by="position" each={props.items}>
      {item => (
        <Label
          {...DECOR}
          text={() => item().text}
          style={() => {
            const p = item();
            const theme = ui.theme();
            const line = theme.chart.line;
            const turn = p.rotate ? { rotate: p.rotate, transformOrigin: p.origin ?? [p.w / 2, line / 2] } : {};
            const fz = p.size ?? theme.fontSizes.xs;
            return { position: 'absolute', left: p.x, top: p.y, width: p.w, height: line, textAlign: p.align, fontSize: fz, lineHeight: line / fz, color: p.color ?? props.color(), select: 'none', ...turn };
          }}
        />
      )}
    </For>
  );
}

/**
 * @typedef {object} LegendItem
 * @property {string} name
 * @property {string} label
 * @property {string} color a resolved color
 */

/** Where every chart's legend goes by default: under the chart, at its start. */
export const LEGEND_AT = 'bottom-start';

/**
 * Where a legend goes, from its options' `at`: 'top' or 'bottom', and
 * '-start', '-center' or '-end' along it ('bottom-start'); the chart's
 * own place (`fallback`, as `at` is written) for what `at` leaves out.
 * @param {Record<string, any> | null} options @param {string} fallback ('bottom-start')
 * @returns {{ bottom: boolean, justify: 'start' | 'center' | 'end' }}
 */
export function legendAt(options, fallback) {
  const [side, along] = String(options?.at ?? fallback).split('-');
  const own = /** @type {'start' | 'center' | 'end'} */ (fallback.split('-')[1] ?? 'start');
  return { bottom: side === 'bottom', justify: along === 'start' || along === 'center' || along === 'end' ? along : own };
}

/**
 * A series' tone mark in the legend and the tooltip, as Notification's: a
 * round dot `theme.ratios.mark` of the line it sits beside (sm text at
 * `lineHeights.sm`), centered in a box that line's height.
 * @param {{ color: () => string }} props
 */
function ToneDot(props) {
  const ui = $ui();
  const line = () => ui.theme().fontSizes.sm * ui.theme().lineHeights.sm;
  const side = () => line() * ui.theme().ratios.mark;
  return (
    <View style={() => ({ width: side(), height: line(), align: 'center', justify: 'center', shrink: 0 })}>
      <View style={() => ({ width: side(), height: side(), radius: ui.theme().radius.round, background: props.color() })} />
    </View>
  );
}

/**
 * The legend (Legend), a row under the chart, at its start (`justify`,
 * a value or an accessor, moves it along): per series,
 * its tone dot (Notification's: `theme.ratios.mark` of the line) and its
 * label on the page's quiet role, sm, `theme.control.labelGap` apart,
 * the items spacing md apart. The item under the pointer is the active
 * series: its label takes the page's text color, and
 * `onActiveChange(key | null)` reports its key, null when the pointer
 * leaves (a chart then dims the other series to `theme.chart.dim`).
 * @param {{ items: () => readonly LegendItem[], onActiveChange?: (key: string | null) => void, justify?: 'start' | 'center' | 'end' | (() => 'start' | 'center' | 'end') }} props
 */
export function Legend(props) {
  const R = $active();
  const ui = $ui();
  const over = $signal(R, /** @type {string | null} */ (null));
  const hover = (/** @type {string | null} */ key) => {
    $write(over, key);
    props.onActiveChange?.(key);
  };
  return (
    <View {...DECOR} style={() => ({ direction: 'row', wrap: true, justify: read(props.justify) ?? legendAt(null, LEGEND_AT).justify, align: 'center', self: 'stretch', gap: ui.theme().spacing.md, height: ui.theme().chart.legend, overflow: 'hidden', shrink: 0 })}>
      <For by="position" each={props.items}>
        {item => (
          <View style={() => ({ direction: 'row', align: 'center', gap: ui.theme().control.labelGap })} onPointerEnter={() => hover(item().name)} onPointerLeave={() => hover(null)}>
            <ToneDot color={() => item().color} />
            <Label
              text={() => item().label}
              style={() => {
                const page = pageColors(ui.theme(), ui.scheme());
                return { fontSize: ui.theme().fontSizes.sm, lineHeight: ui.theme().lineHeights.sm, color: $read(over) === item().name ? page.text : page.quiet, select: 'none' };
              }}
            />
          </View>
        )}
      </For>
    </View>
  );
}

/**
 * @typedef {object} TooltipRow
 * @property {string} name
 * @property {string} color a resolved color
 * @property {string} value formatted
 */

/**
 * @typedef {object} TooltipModel
 * @property {string} label the heading ('' for none)
 * @property {readonly TooltipRow[]} rows
 * @property {Record<string, number | string>} at the box's place (absolute insets)
 */

/**
 * The tooltip box (Tip): no edge, the page's `sunken` ground
 * lifted by shadow sm, the theme's corner, padding spacing xs by sm; its
 * heading (the category) in the page's text color at `weights.strong`,
 * then the rows as a two-column table: the first column each series'
 * tone dot (`theme.ratios.mark` of the line) and name on the quiet role,
 * the second its value at `weights.strong` in the text color, aligned to
 * the column's end, spacing md clear of the names. All at sm, lines
 * `theme.control.labelGap` apart; placed by `tip().at`.
 * @param {{ tip: () => TooltipModel }} props
 */
export function Tip(props) {
  const ui = $ui();
  /** @param {'text' | 'quiet'} role @param {boolean} strong */
  const text = (role, strong) => () => {
    const theme = ui.theme();
    return { fontSize: theme.fontSizes.sm, lineHeight: theme.lineHeights.sm, fontWeight: strong ? theme.weights.strong : theme.weights.regular, color: pageColors(theme, ui.scheme())[role], select: /** @type {const} */ ('none') };
  };
  const column = (/** @type {'start' | 'end'} */ align) => () => ({ direction: /** @type {const} */ ('column'), align, gap: ui.theme().control.labelGap });
  return (
    <View
      {...DECOR}
      style={() => {
        const theme = ui.theme();
        return {
          position: 'absolute',
          ...props.tip().at,
          zIndex: 2,
          background: pageColors(theme, ui.scheme()).sunken,
          radius: radiusOf(theme, undefined),
          shadow: shadowOf(theme, 'sm'),
          padding: [theme.spacing.xs, theme.spacing.sm],
          gap: theme.control.labelGap,
        };
      }}
    >
      <Show when={() => props.tip().label !== ''}>
        <Label text={() => props.tip().label} style={text('text', true)} />
      </Show>
      <View style={() => ({ direction: 'row', gap: ui.theme().spacing.md })}>
        <View style={column('start')}>
          <For by="position" each={() => props.tip().rows}>
            {row => (
              <View style={() => ({ direction: 'row', align: 'center', gap: ui.theme().control.labelGap })}>
                <ToneDot color={() => row().color} />
                <Label text={() => row().name} style={text('quiet', false)} />
              </View>
            )}
          </For>
        </View>
        <View style={column('end')}>
          <For by="position" each={() => props.tip().rows}>{row => <Label text={() => row().value} style={text('text', true)} />}</For>
        </View>
      </View>
    </View>
  );
}

/**
 * A tooltip moved down by `dy` (a chart's legend over its plot) and in by
 * the chart's padding `pad`: the charts place their Tip last in their root,
 * over the legend too, so it reads after everything else on every renderer.
 * @param {TooltipModel} tip @param {number} dy @param {{ top: number, right: number, bottom: number, left: number }} [pad]
 * @returns {TooltipModel}
 */
export function shiftTip(tip, dy, pad = { top: 0, right: 0, bottom: 0, left: 0 }) {
  // Placed in the content box, it sits as an absolute child of the root, from its padding's edge: its padding moves it in.
  const at = { ...tip.at };
  if (typeof at.top === 'number') at.top += dy + pad.top;
  if (typeof at.left === 'number') at.left += pad.left;
  if (typeof at.right === 'number') at.right += pad.right;
  return { ...tip, at };
}

/**
 * A chart's own padding (its insets less its border): where its content
 * box starts from the padding's edge, the place an absolute child of its
 * root (the tooltip) is placed from.
 * @param {Record<string, any>} props
 * @returns {() => { top: number, right: number, bottom: number, left: number }}
 */
export function $chartPadding(props) {
  const own = styled(props);
  return () => {
    const i = insetsOf(own());
    const b = bordersOf(own());
    return { top: i.top - b.top, right: i.right - b.right, bottom: i.bottom - b.bottom, left: i.left - b.left };
  };
}

/** A quarter turn in degrees: an axis title turned along its edge. */
export const QUARTER = 90; // geometry: degrees, not px

/**
 * A chart label's gap from its tick, line or mark: half of spacing xs (4).
 * @param {RuiThemeValue} theme
 */
export const labelGap = theme => theme.spacing.xs / 2;

/**
 * A chart label box `n` characters of chart text wide (`chart.charWidth` each).
 * @param {RuiThemeValue} theme @param {number} n
 */
export const charsWide = (theme, n) => n * theme.chart.charWidth;

/**
 * Where a tooltip goes beside a point (in the chart's box): on the right of
 * it in the left half, on the left in the right half, `gap` clear of it
 * (spacing sm by the charts), never measured.
 * @param {number} x @param {number} y @param {number} width the chart's
 * @param {number} gap
 * @returns {Record<string, number>}
 */
export function beside(x, y, width, gap) {
  return x <= width / 2 ? { left: Math.round(x + gap), top: Math.round(y) } : { right: Math.round(width - x + gap), top: Math.round(y) };
}

/**
 * The pointer's place in a primitive's box, from a portable pointer event.
 * @param {any} event
 * @returns {[number, number]}
 */
export function pointIn(event) {
  const box = boxOf(event.currentTarget);
  return [(event.clientX ?? event.x ?? 0) - box.x, (event.clientY ?? event.y ?? 0) - box.y];
}

/**
 * A chart's name: its `aria-label`, else what it is and what it shows (its
 * series, or its data's names, and how many points).
 * @param {Record<string, any>} props @param {string} kind ('Area chart')
 * @returns {() => string}
 */
export const summaryOf = (props, kind) => () => {
  const own = read(props['aria-label']);
  if (own != null && own !== '') return String(own);
  const data = read(props.data);
  const series = /** @type {any[]} */ (read(props.series) ?? []);
  const names = series.length > 0 ? series.map(s => String(s.label ?? s.key ?? '')) : Array.isArray(data) ? data.map(d => (d != null && typeof d === 'object' ? String(d.label ?? d.name ?? '') : '')) : [];
  const shown = names.filter(n => n !== '');
  const count = Array.isArray(data) && series.length > 0 ? `, ${data.length} ${data.length === 1 ? 'point' : 'points'}` : '';
  return `${kind}${shown.length > 0 ? ` of ${shown.join(', ')}` : ''}${count}`;
};

/** Fields a data row carries only for its look. */
const LOOKS = new Set(['color', 'lineColor', 'fill']);

/** A row's plain fields: its strings, finite numbers and booleans, its look left out. @param {unknown} row */
export const fieldsOf = row => {
  /** @type {Record<string, string | number | boolean>} */
  const out = {};
  if (row === null || typeof row !== 'object') return out;
  for (const [key, v] of Object.entries(row)) {
    if (LOOKS.has(key)) continue;
    if (typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) own(out, key, v);
  }
  return out;
};

/**
 * A chart's data as a Dataset's fields, from its `data` and `series`:
 * numbers are `value`s (Sparkline), a record of days `row`s of `date` and
 * `value` (Heatmap), groups of points `series` with their `point`s
 * (ScatterChart's { label, color, points }), else rows as given (`row`)
 * with the `series` named by their keys and labels.
 * @param {Record<string, any>} props
 * @returns {Record<string, unknown>}
 */
export function datasetOf(props) {
  const data = read(props.data);
  const series = /** @type {any[]} */ (read(props.series) ?? []);
  if (data == null || typeof data !== 'object') return {};
  if (!Array.isArray(data)) return { row: Object.entries(data).map(([date, value]) => fieldsOf({ date, value })) };
  if (data.every(d => typeof d === 'number' || d == null)) return { value: data.filter(d => typeof d === 'number' && Number.isFinite(d)) };
  // A scatter group's label is its series' name, as a cartesian series' key is.
  if (data.some(d => d != null && Array.isArray(d.points))) return { series: data.map(g => ({ name: String(g?.label ?? ''), point: (Array.isArray(g?.points) ? g.points : []).map(fieldsOf) })) };
  return {
    series: series.map(s => (s.label != null && s.label !== s.key ? { name: String(s.key), label: String(s.label) } : { name: String(s.key) })),
    row: data.map(fieldsOf),
  };
}

/** The value a microdata name holds, as elements: a scalar its `content`, an object an item, an array each value. @param {string} name @param {unknown} value @returns {any} */
function itemprop(name, value) {
  if (Array.isArray(value)) return value.map(v => itemprop(name, v));
  if (value !== null && typeof value === 'object') {
    return (
      <View itemprop={name} itemscope>
        {Object.entries(value).map(([k, v]) => itemprop(k, v))}
      </View>
    );
  }
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? <View itemprop={name} content={value} /> : null;
}

/**
 * A chart's data as microdata (the fields of the Dataset its root starts),
 * out of sight: empty boxes holding values, nothing drawn, so ren-json's
 * `$json` gives the series and points under the chart's `img`.
 * @param {{ of: () => Record<string, unknown> }} props
 */
export function ChartData(props) {
  return <View style={UNSEEN}>{() => Object.entries(props.of()).map(([k, v]) => itemprop(k, v))}</View>;
}

/**
 * The props a chart's root passes on to its View, and what it means: an
 * image (`role="img"`) named by its summary, starting a Dataset (its data
 * in a ChartData inside); its drawn text, legend and tooltip are
 * decoration.
 * @param {Record<string, any>} props @param {string} kind
 */
export const rootProps = (props, kind) => ({ hidden: props.hidden, onPress: props.onPress, role: 'img', 'aria-label': summaryOf(props, kind), itemscope: true, itemtype: 'https://schema.org/Dataset' });
