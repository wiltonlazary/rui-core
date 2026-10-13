// Data display: DataList, NumberText, DigitRoll, Excerpt and Timeline,
// on View, Label and Action (OverflowList lives in overflow-list.jsx).

import { View, Label, Action, read, $active, $signal, $read, $write, $memo, $watch, $untrack, $context, $lookup } from 'ren-core';
import { styled } from '../../theme/style.js';
import { $ui } from '../../theme/theme.jsx';
import { sized, pageColors, spacing, colorOf, radiusOf } from '../../theme/resolve.js';
import { pass } from '../layout/layout.jsx';
import { $tween } from '../misc/tween.js';
import { parts } from './parts.jsx';
import { textual } from './badge.jsx';
import { DECOR, state } from '../../theme/meaning.js';
import { $controlled } from '../overlays/shared.jsx';
import { marksOf, placesOf } from '../inputs/shared.js';
import { MOTION, durationOf } from '../../theme/motion.js';

// ---------------------------------------------------------------- DataList

const ListContext = $context(/** @type {Record<string, any>} */ ({}));

/**
 * Label and value pairs: `orientation` (horizontal: side by side;
 * vertical: the label above), `divided`, `size` (xs to xl, sm by
 * default). The rows stand a spacing step of the size apart (sm by
 * default); `divided` sets a hairline (a Divider's xs thickness, the
 * page's edge role) between rows only, half that step from each, and
 * insets the rows' sides by `theme.control.panelPad` so the hairline runs
 * past their text. Children are DataList.Item, with DataList.Term and
 * DataList.Detail. It means a `list` of items, each a `term` and its
 * `definition`.
 * @param {Record<string, any>} props
 */
export function DataList(props) {
  const style = styled(props, theme => {
    const step = spacing(theme, read(props.size), 'sm');
    return { direction: 'column', gap: read(props.divided) === true ? step / 2 : step, fontSize: sized(theme.fontSizes, read(props.size), 'sm') };
  });
  return (
    <ListContext value={props}>
      <View role="list" {...pass(props)} style={style}>
        {parts(props.children, DataListItem, index => ({ __index: index }))}
      </View>
    </ListContext>
  );
}

/** One pair. @param {Record<string, any>} props */
function DataListItem(props) {
  const list = /** @type {Record<string, any>} */ ($lookup(ListContext));
  const style = styled(props, theme => {
    const divided = read(list.divided) === true;
    const vertical = read(list.orientation) === 'vertical';
    return {
      ...(vertical ? { direction: 'column', gap: theme.spacing.xs / 2 } : { display: 'grid', columns: 'minmax(0, 1fr) minmax(0, 2fr)', columnGap: theme.spacing.md }),
      ...(divided ? { padding: [0, theme.control.panelPad] } : null),
    };
  });
  const line = () =>
    read(list.divided) === true && props.__index > 0 ? <View {...DECOR} style={styled({}, (theme, scheme) => ({ height: theme.sizes.divider.xs, shrink: 0, background: pageColors(theme, scheme).edge }))} /> : null;
  return [
    line,
    <View role="listitem" {...pass(props)} style={style}>
      {props.children}
    </View>,
  ];
}

/** The term of a pair (what the detail describes). @param {Record<string, any>} props */
function DataListTerm(props) {
  const style = styled(props, (theme, scheme) => ({ color: pageColors(theme, scheme).quiet, fontWeight: theme.weights.strong, wrap: true }));
  return textual(props.children) ? <Label role="term" {...pass(props)} text={props.children} style={style} /> : <View role="term" {...pass(props)} style={style}>{props.children}</View>;
}

/** The detail of a pair (the term's value). @param {Record<string, any>} props */
function DataListDetail(props) {
  const style = styled(props, () => ({ wrap: true }));
  return textual(props.children) ? <Label role="definition" {...pass(props)} text={props.children} style={style} /> : <View role="definition" {...pass(props)} style={style}>{props.children}</View>;
}

DataList.Item = DataListItem;
DataList.Term = DataListTerm;
DataList.Detail = DataListDetail;

// -------------------------------------------------------------- NumberText

/**
 * @typedef {object} NumberFormat
 * @property {string=} prefix
 * @property {string=} suffix
 * @property {string=} locale a BCP 47 tag whose marks `true` and the default decimal mark take (the platform's by default)
 * @property {boolean | string=} groupMark between groups of three digits: true for the locale's mark, or a mark as given
 * @property {string=} decimalMark the locale's by default
 * @property {number=} decimals digits after the mark, at most; held to 0..100 (toFixed's range)
 * @property {boolean=} fixedDecimals always `decimals` digits
 * @property {boolean=} negative false drops the sign
 */

/**
 * Digits written in exponent notation ('1e-7', '1.5e+21'), as plain digits
 * ('0.0000001', '1500000000000000000000'); others as they are.
 * @param {string} text a non-negative number as String or toFixed writes it
 */
const plain = text => {
  const m = /^(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(text);
  if (m === null) return text;
  const digits = m[1] + (m[2] ?? '');
  const point = m[1].length + Number(m[3]);
  if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return digits + '0'.repeat(point - digits.length);
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
};

/**
 * A number as text, as NumberText writes it: the marks are the locale's
 * unless given; plain digits, never an exponent.
 * @param {number | string | null | undefined} value @param {NumberFormat} [o]
 * @returns {string}
 */
export function formatNumber(value, o = {}) {
  if (value == null || value === '') return '';
  let n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (o.negative === false) n = Math.abs(n);
  // toFixed takes 0 to 100 places and throws past them: a decimals outside is held there.
  const scale = placesOf(o.decimals);
  const a = Math.abs(n);
  // toFixed writes an exponent from 1e21 up: its digits, then the places asked for.
  const fixed = (/** @type {number} */ k) => (a >= 1e21 ? plain(String(a)) + (k > 0 ? `.${'0'.repeat(k)}` : '') : a.toFixed(k));
  const digits = scale == null ? plain(String(a)) : o.fixedDecimals ? fixed(scale) : plain(String(Number(a.toFixed(scale))));
  const [whole, part] = digits.split('.');
  const sep = o.groupMark === true ? marksOf(o.locale).group : typeof o.groupMark === 'string' ? o.groupMark : '';
  const grouped = sep === '' ? whole : whole.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  const sign = n < 0 && Number(digits) !== 0 ? '-' : '';
  return `${sign}${o.prefix ?? ''}${grouped}${part === undefined ? '' : (o.decimalMark ?? marksOf(o.locale).decimal) + part}${o.suffix ?? ''}`;
}

/** The format props of a component, read. @param {Record<string, any>} props @returns {NumberFormat} */
const formatOf = props => ({
  locale: read(props.locale),
  prefix: read(props.prefix),
  suffix: read(props.suffix),
  groupMark: read(props.groupMark),
  decimalMark: read(props.decimalMark),
  decimals: read(props.decimals),
  fixedDecimals: read(props.fixedDecimals),
  negative: read(props.negative),
});

/** A formatted number: `value`, `locale` (whose marks it takes), `prefix`, `suffix`, `groupMark` (true: the locale's), `decimalMark` (the locale's by default), `decimals`, `fixedDecimals`, `negative`. @param {Record<string, any>} props */
export function NumberText(props) {
  return <Label {...pass(props)} text={() => formatNumber(read(props.value), formatOf(props))} style={styled(props)} />;
}

// ---------------------------------------------------------------- DigitRoll

/**
 * A number whose digits roll to each new value: NumberText's props,
 * `duration` (a MOTION preset's name or ms; `calm` by default), `easing`
 * (a curve's name or function; rui's `settle` by default: most of the way
 * early, a long gentle landing), `fontSize`. Its name
 * (`aria-label`) is the formatted value; the rolling digits are decoration.
 * @param {Record<string, any>} props
 */
export function DigitRoll(props) {
  const R = $active();
  // The value at the places it shows (`decimals`): the digits land on what is written, not a hair past it.
  const scale = () => placesOf(read(props.decimals) ?? 0);
  const goal = () => {
    const k = 10 ** scale();
    return Math.round((Number(read(props.value) ?? 0) || 0) * k) / k;
  };
  const shown = $tween($untrack(R, goal));
  const from = $signal(R, $untrack(R, goal));
  $watch(R, goal, v => {
    $write(from, shown.now());
    shown.to(v, durationOf(read(props.duration), MOTION.calm), undefined, read(props.easing) ?? 'settle');
  });
  /** Whether the goal is written with a sign: not with `negative={false}`, nor when it rounds to zero. */
  const signed = () => formatNumber(goal(), { ...formatOf(props), decimals: scale(), fixedDecimals: true }).startsWith('-');
  /** The number's shape: the formatted value (no prefix or suffix) with more digits, digits as 'd' (the layout while it rolls). */
  const shape = $memo(R, () => {
    const o = { ...formatOf(props), prefix: '', suffix: '' };
    const now = $read(shown.value);
    const moving = now !== goal();
    // Unsigned, compared by their digits (a sign is no digit column), then signed by where it goes.
    const unsigned = (/** @type {number} */ n) => formatNumber(Math.abs(n), { ...o, decimals: scale(), fixedDecimals: true }).replace(/\d/g, 'd');
    const a = unsigned(goal());
    const b = moving ? unsigned($read(from)) : a;
    const count = (/** @type {string} */ s) => (s.match(/d/g) ?? []).length;
    return `${signed() ? '-' : ''}${count(b) > count(a) ? b : a}`;
  });
  const style = styled(props, theme => ({ direction: 'row', self: 'start', fontSize: sized(theme.fontSizes, read(props.fontSize)), lineHeight: theme.lineHeights.xs }));
  const height = styled({}, theme => ({ height: Math.ceil(sized(theme.fontSizes, read(props.fontSize)) * theme.lineHeights.xs) }));
  /** A digit column: `k` places from the last digit (decimals included). @param {number} k */
  const Digit = k => {
    // An odometer: a column turns only while the columns below it roll over.
    const v = () => Math.round(Math.abs($read(shown.value)) * 10 ** scale() * 1e6) / 1e6;
    const unit = 10 ** k;
    const low = () => Math.floor(v() / unit) % 10;
    const frac = () => {
      const rest = v() % unit;
      return k === 0 ? rest : Math.max(0, Math.min(1, rest - (unit - 1)));
    };
    const column = () => ({ position: /** @type {const} */ ('relative'), top: -frac() * Number(height().height) });
    return (
      <View {...DECOR} style={() => ({ ...height(), overflow: 'hidden' })}>
        <View style={column}>
          <Label text={() => String(low())} style={height} />
          <Label hidden={() => frac() === 0} text={() => String((low() + 1) % 10)} style={height} />
        </View>
      </View>
    );
  };
  return (
    <View aria-label={() => formatNumber(goal(), { ...formatOf(props), decimals: scale(), fixedDecimals: true })} {...pass(props)} style={style}>
      {() => {
        const s = $read(shape);
        const digits = (s.match(/d/g) ?? []).length;
        let k = digits;
        // The sign leads, then the prefix; the number's own marks and digits; then the suffix. The prefix and
        // suffix are whole Labels (their spaces and digits are theirs, not the number's).
        const lead = s.startsWith('-');
        const mark = (/** @type {string} */ c) => <Label {...DECOR} text={c === '-' ? () => (signed() ? '-' : '') : c} style={height} />;
        const affix = (/** @type {'prefix' | 'suffix'} */ key) => <Label {...DECOR} text={() => String(read(props[key]) ?? '')} hidden={() => (read(props[key]) ?? '') === ''} style={height} />;
        return [lead ? mark('-') : null, affix('prefix'), ...[...(lead ? s.slice(1) : s)].map(c => (c === 'd' ? Digit(--k) : mark(c))), affix('suffix')];
      }}
    </View>
  );
}

// ------------------------------------------------------------------ Excerpt

/**
 * Content cut at `height` (`theme.sizes.box.reveal`, 120: five lines of md text) with a trigger to
 * show it whole: `moreLabel` ('More'), `lessLabel` ('Less'), `open` and
 * `onOpenChange` (controlled) or `defaultOpen`, `duration` (ms or a MOTION
 * preset; base, 190 ms), `getHandle(handle)` (its `open`, `close` and
 * `toggle`). The trigger shows
 * only when the content is higher than `height` (its `onResize`: once
 * laid out and whenever the content is resized).
 * @param {Record<string, any>} props
 */
export function Excerpt(props) {
  const R = $active();
  const ui = $ui();
  const own = $signal(R, $untrack(R, () => read(props.defaultOpen) === true));
  const expanded = () => (props.open !== undefined ? read(props.open) === true : $read(own));
  const max = () => read(props.height) ?? ui.theme().sizes.box.reveal;
  const full = $signal(R, 0);
  const height = $tween(0);
  const moving = $signal(R, false);
  /** The content's height as last reported (its onResize), moving or not. */
  let latest = 0;
  /** The content's height is `h` (laid out, or resized: new text, a new width): the clip follows it at once. @param {number} h */
  const follow = h => {
    if (h === $untrack(R, () => $read(full))) return;
    $write(full, h);
    height.to($untrack(R, expanded) ? h : Math.min($untrack(R, max), h), 0);
  };
  // Once laid out and on each resize, unless it moves (the move ends at the height last reported).
  const onResize = (/** @type {{ height: number }} */ box) => {
    latest = box.height;
    if (!$untrack(R, () => $read(moving))) follow(latest);
  };
  $watch(R, expanded, open => {
    if ($untrack(R, () => $read(full)) === 0) return;
    $write(moving, true);
    height.to(open ? latest : max(), durationOf(read(props.duration), MOTION.base), () => {
      $write(moving, false);
      follow(latest);
    });
  });
  // A new `height` while closed, measured and still: the clip moves there at once.
  $watch(R, max, cut => {
    if ($untrack(R, expanded) || $untrack(R, () => $read(moving)) || $untrack(R, () => $read(full)) === 0) return;
    height.to(Math.min(cut, $untrack(R, () => $read(full))), 0);
  });
  const overflows = () => $read(full) > max();
  /** Opens or closes it, if it is not so already. @param {boolean} next */
  const set = next => {
    if ($untrack(R, expanded) === next) return;
    if (props.open === undefined) $write(own, next);
    props.onOpenChange?.(next);
  };
  const toggle = () => set(!$untrack(R, expanded));
  props.getHandle?.({ open: () => set(true), close: () => set(false), toggle });
  /** @returns {Record<string, any>} */
  const clip = () => {
    if ($read(full) === 0) return { maxHeight: max(), overflow: 'hidden' };
    if (!overflows() || (expanded() && !$read(moving))) return {};
    return { height: $read(height.value), overflow: 'hidden' };
  };
  const control = styled({}, (theme, scheme) => ({
    self: 'start',
    background: 'transparent',
    border: 0,
    padding: 0,
    minHeight: 0,
    radius: 0,
    color: colorOf(theme, scheme, undefined),
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.weights.regular,
    cursor: 'pointer',
    hover: { underline: true },
  }));
  return (
    <View {...pass(props)} style={styled(props, theme => ({ direction: 'column', gap: theme.spacing.xs / 2 }))}>
      <View style={clip}>
        <View onResize={onResize} style={{ shrink: 0 }}>
          {props.children}
        </View>
      </View>
      {() => (overflows() ? <Action aria-expanded={state(expanded)} text={() => String(expanded() ? (read(props.lessLabel) ?? 'Less') : (read(props.moreLabel) ?? 'More'))} onPress={toggle} style={control} /> : null)}
    </View>
  );
}

// ----------------------------------------------------------------- Timeline

const TimelineContext = $context(/** @type {{ props: Record<string, any>, value: () => number | null }} */ ({ props: {}, value: () => null }));

/**
 * Events on a line, reached up to one: `value` (the index of the item
 * reached last, in the children's order; or `defaultValue`, none by
 * default), `from` (where
 * progress starts: `start`, the first item, by default, or `end`, the
 * last), `color`, `marker` (every
 * item's marker content), `markerSize` (`sizes.glyph.md`, 16), `lineWidth` (2), `radius`
 * (round), `align` (start or end). An item is reached from `from` up to
 * `value`; a line between two items shows reached when both are. Children are Timeline.Item. It means
 * a `list` of `listitem`s; the markers and lines are decoration.
 * @param {Record<string, any>} props
 */
export function Timeline(props) {
  const style = styled(props, () => ({ direction: 'column' }));
  const value = $controlled(props, 'value', 'defaultValue', /** @type {number | null} */ (null));
  return (
    <TimelineContext value={{ props, value: value.get }}>
      <View role="list" {...pass(props)} style={style}>
        {parts(props.children, TimelineItem, (index, count) => ({ __index: index, __count: count }))}
      </View>
    </TimelineContext>
  );
}

/** One event: `title`, `marker` (content in its marker), `color`, `line` (solid, dashed or dotted: the line below its marker). @param {Record<string, any>} props */
function TimelineItem(props) {
  const timeline = /** @type {{ props: Record<string, any>, value: () => number | null }} */ ($lookup(TimelineContext));
  const t = timeline.props;
  const index = props.__index ?? 0;
  const count = props.__count ?? 1;
  const last = index === count - 1;
  /** Whether the item at `i` is reached. @param {number} i */
  const reached = i => {
    const a = timeline.value();
    if (a == null || a < 0) return false;
    return read(t.from) === 'end' ? i >= a : i <= a;
  };
  const active = () => reached(index);
  // The line below this item joins it to the next one.
  const lineActive = () => reached(index) && reached(index + 1);
  const ui = $ui();
  const size = () => read(t.markerSize) ?? ui.theme().sizes.glyph.md;
  const width = () => read(t.lineWidth) ?? 2;
  const right = () => read(t.align) === 'end';
  const paint = styled({}, (theme, scheme) => ({
    color: colorOf(theme, scheme, read(props.color) ?? read(t.color)),
    line: pageColors(theme, scheme).rule,
    body: pageColors(theme, scheme).body,
  }));
  const marker = styled({}, theme => {
    const p = paint();
    const on = active();
    return {
      width: size(),
      height: size(),
      shrink: 0,
      align: 'center',
      justify: 'center',
      radius: read(t.radius) == null ? theme.radius.round : radiusOf(theme, read(t.radius)),
      border: width(),
      borderColor: on ? p.color : p.line,
      background: on ? p.color : p.body,
      color: on ? theme.white : p.color,
      fontSize: theme.fontSizes.xs,
    };
  });
  // The line is a border, so it can be dashed or dotted.
  const line = () => {
    const p = paint();
    return { width: 0, grow: 1, minHeight: 0, borderLeft: width(), borderStyle: read(props.line) ?? 'solid', borderColor: lineActive() ? p.color : p.line };
  };
  const style = styled(props, () => ({ direction: 'row', align: 'stretch' }));
  const rail = (
    <View {...DECOR} style={() => ({ direction: 'column', align: 'center', width: size(), shrink: 0 })}>
      <View style={marker}>{(mark => (textual(mark) ? <Label text={mark} /> : mark))(props.marker !== undefined ? props.marker : t.marker)}</View>
      {last ? null : <View style={line} />}
    </View>
  );
  const content = (
    <View
      style={styled({}, theme => ({
        direction: 'column',
        grow: 1,
        minWidth: 0,
        padding: [0, right() ? theme.spacing.md : 0, last ? 0 : theme.spacing.xl, right() ? 0 : theme.spacing.md],
        align: right() ? 'end' : 'start',
        textAlign: right() ? 'end' : 'start',
      }))}
    >
      {props.title == null ? null : textual(props.title) ? <Label text={props.title} style={styled({}, theme => ({ fontWeight: theme.weights.strong, lineHeight: theme.lineHeights.xs, margin: [0, 0, theme.control.labelGap, 0] }))} /> : props.title}
      {textual(props.children) ? <Label text={props.children} style={{ wrap: true }} /> : props.children}
    </View>
  );
  return (
    <View role="listitem" {...pass(props)} style={style}>
      {() => (right() ? [content, rail] : [rail, content])}
    </View>
  );
}

Timeline.Item = TimelineItem;
