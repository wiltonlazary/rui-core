// Typography blocks: Quote, Code, Mark, Highlight, List and Prose,
// on View and Label. Marked text (Highlight, Mark) is one Label of styled
// runs, which wraps across them as inline spans.

import { View, Label, read } from 'ren-core';
import { styled } from '../../theme/style.js';
import { sized, pageColors, spacing, colorOf, radiusOf, shadesOf, variantColors, TINTS } from '../../theme/resolve.js';
import { alpha } from '../../theme/colors.js';
import { pass } from '../layout/layout.jsx';
import { $ui } from '../../theme/theme.jsx';
import { hasInline, runsOf, runStyle } from './inline.js';
import { textOf } from './text.jsx';
import { parts, isPart, flat, partOptions } from '../data/parts.jsx';
import { textual } from '../data/badge.jsx';
import { DECOR } from '../../theme/meaning.js';
import { tables } from '../../own.js';

/**
 * A quotation (role `blockquote`): its text at the body size set off by an
 * opening quotation mark at its start, in its tone over the tone's faint
 * wash, and its `source` (who or where it is from) under it, quiet (text, or any content of yours).
 * `color` (the tone: the accent by default), `icon` (the mark: `true`, the
 * quotation mark; `false`, none; a node of your own; or `{ size }`, the
 * mark's size, the first heading's by default), `source`, `radius` (the
 * theme's corner).
 * @param {Record<string, any>} props
 */
export function Quote(props) {
  const style = styled(props, (theme, scheme) => ({
    direction: 'row',
    gap: theme.spacing.sm,
    padding: [theme.spacing.md, theme.spacing.lg],
    background: alpha(colorOf(theme, scheme, read(props.color)), TINTS[scheme].wash),
    radius: radiusOf(theme, read(props.radius)),
  }));
  const body = styled({}, theme => ({ direction: 'column', grow: 1, minWidth: 0, gap: theme.spacing.xs, fontSize: theme.fontSizes.md, fontWeight: theme.weights.regular, lineHeight: theme.lineHeights.md }));
  const mark = () => {
    const icon = read(props.icon);
    if (icon === false) return null;
    const options = partOptions(icon) ? icon : null;
    if (icon != null && icon !== true && options === null) return <View {...DECOR} style={{ shrink: 0 }}>{icon}</View>;
    // The mark's glyph sits on its first line: one line high, no leading.
    return (
      <Label
        {...DECOR}
        text={'\u201C'}
        style={styled({}, (theme, scheme) => ({
          shrink: 0,
          fontSize: options?.size ?? theme.headings.levels[0].size,
          lineHeight: 1,
          fontWeight: theme.weights.bold,
          color: colorOf(theme, scheme, read(props.color)),
        }))}
      />
    );
  };
  return (
    <View role="blockquote" {...pass(props)} style={style}>
      {mark}
      <View style={body}>
        {textual(props.children) || hasInline(props.children) ? <Label {...textOf(props)} style={{ wrap: true }} /> : props.children}
        {() =>
          props.source == null ? null : textual(props.source) ? (
            <Label text={props.source} style={styled({}, (theme, scheme) => ({ fontSize: theme.fontSizes.sm, color: pageColors(theme, scheme).quiet, wrap: true }))} />
          ) : (
            props.source
          )
        }
      </View>
    </View>
  );
}

/** The monospace font stack (the canvases draw it in their monospace face). */
export const MONOSPACE = 'ui-monospace, Menlo, Consolas, Cascadia Mono, DejaVu Sans Mono, Liberation Mono, monospace';

/**
 * Code (role `code`): inline, or a `block` (its lines kept, selectable),
 * in the monospace font on the page's sunken ground; `color` tints it. It
 * is never wider than its container: its words wrap, and a token wider
 * than the container breaks where it overflows.
 * @param {Record<string, any>} props
 */
export function Code(props) {
  const style = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    const color = read(props.color);
    const block = read(props.block) === true;
    return {
      background: color == null ? page.sunken : variantColors(theme, scheme, 'soft', color).background,
      color: page.text,
      fontFamily: MONOSPACE,
      fontSize: theme.fontSizes.xs,
      lineHeight: theme.lineHeights.xs,
      radius: theme.radius.xs,
      padding: block ? [theme.spacing.sm, theme.spacing.md] : [1, Math.round(theme.fontSizes.xs * theme.ratios.pad)],
      select: 'text',
      // Its words wrap, and a token wider than its container breaks where it overflows.
      wrap: true,
      minWidth: 0,
      maxWidth: '100%',
      ...(block ? null : { self: 'start' }),
    };
  });
  return <Label role="code" {...pass(props)} {...textOf(props)} style={style} />;
}

/** Nested in text, a run in the monospace font on Code's background (`color` tints it). @type {import('./inline.js').Inline} */
Code.inline = (props, theme, scheme) => {
  const color = read(props.color);
  const page = pageColors(theme, scheme);
  return {
    style: {
      background: color == null ? page.sunken : variantColors(theme, scheme, 'soft', color).background,
      color: page.text,
      fontFamily: MONOSPACE,
      fontSize: theme.fontSizes.xs,
    },
  };
};

/** The background of marked text (Mark): shade 1 of `color` (amber), or shade 6 at the theme's `opacity.soft` on the dark page. @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {'light' | 'dark'} scheme @param {string | undefined} color */
const markOf = (theme, scheme, color) => {
  const shades = shadesOf(theme, color ?? 'amber');
  return scheme === 'dark' ? alpha(shades[6], theme.opacity.soft) : shades[1];
};

/**
 * Marked text: `color` (amber by default), one run whose background
 * covers its text's height, an inline mark; nested in Text it is
 * a run of the Text's Label.
 * @param {Record<string, any>} props
 */
export function Mark(props) {
  const ui = $ui();
  const style = styled(props, () => ({ wrap: true }));
  const runs = () => runsOf(<Mark {...props} />, ui.theme(), ui.scheme());
  return <Label {...pass(props)} runs={runs} style={style} />;
}

/** Nested in text, a run on the mark's background. @type {import('./inline.js').Inline} */
Mark.inline = (props, theme, scheme) => ({ style: { background: markOf(theme, scheme, read(props.color)) } });

/**
 * Runs of `text` with each match of `terms` (case-insensitive) marked.
 * @param {string} text @param {string | readonly string[]} terms
 * @returns {{ text: string, marked: boolean }[]}
 */
export function matchRuns(text, terms) {
  const list = (Array.isArray(terms) ? terms : [terms]).map(t => String(t).trim()).filter(t => t.length > 0);
  if (list.length === 0) return text === '' ? [] : [{ text, marked: false }];
  const escaped = [...list].sort((a, b) => b.length - a.length).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
  /** @type {{ text: string, marked: boolean }[]} */
  const out = [];
  let at = 0;
  for (const m of text.matchAll(pattern)) {
    const i = /** @type {number} */ (m.index);
    if (i > at) out.push({ text: text.slice(at, i), marked: false });
    out.push({ text: m[0], marked: true });
    at = i + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), marked: false });
  return out;
}

/**
 * Text with the `match` substrings (a string or strings, any case)
 * marked in `color` (amber), `markStyle` (the text part of a style)
 * over the marks: one Label of runs, wrapping across them (a word may span a
 * mark). Takes Text's `size` and style props.
 * @param {Record<string, any>} props
 */
export function Highlight(props) {
  const ui = $ui();
  const style = styled(props, theme => {
    const size = read(props.size) ?? 'md';
    return {
      wrap: true,
      fontSize: sized(theme.fontSizes, size),
      lineHeight: typeof size === 'string' ? (theme.lineHeights[/** @type {'md'} */ (size)] ?? theme.lineHeights.md) : theme.lineHeights.md,
    };
  });
  const runs = () => {
    const theme = ui.theme();
    const mark = { background: markOf(theme, ui.scheme(), read(props.color)), ...runStyle(read(props.markStyle)) };
    return matchRuns(String(read(props.children) ?? ''), read(props.match) ?? []).map(run => (run.marked ? { text: run.text, style: mark } : { text: run.text }));
  };
  return <Label {...pass(props)} runs={runs} style={style} />;
}

/** The markers of an unordered list by `marker`. */
const MARKERS = tables(/** @type {Record<string, number>} */ ({ disc: 0, circle: 1, square: 2 }));

/**
 * A list (role `list`, its items `listitem`): `ordered` (numbered, not
 * bulleted), `indented`, `size`, `gap` (between items), `icon` (every
 * item's marker), `center` (markers centered on their item), `marker`
 * (disc, circle, square, none; numbers when ordered): a drawn marker is a
 * dot `sizes.glyph.lg × ratios.mark` wide (6 px) centered in a
 * `sizes.glyph.lg` square. Children are List.Item; a List inside an item nests.
 * @param {Record<string, any>} props
 */
export function List(props) {
  const style = styled(props, theme => {
    const size = read(props.size) ?? 'md';
    return {
      direction: 'column',
      gap: spacing(theme, read(props.gap) ?? 0, 'md'),
      fontSize: sized(theme.fontSizes, size),
      lineHeight: theme.lineHeights[/** @type {'md'} */ (size)] ?? theme.lineHeights.md,
      ...(read(props.indented) ? { padding: [0, 0, 0, theme.spacing.md] } : null),
    };
  });
  return (
    <View role="list" {...pass(props)} style={style}>
      {parts(props.children, ListItem, index => ({ __index: index, __list: props }))}
    </View>
  );
}

/** One item: `icon` (its own marker). @param {Record<string, any>} props */
function ListItem(props) {
  const list = props.__list ?? {};
  const index = props.__index ?? 0;
  const ink = styled({}, (theme, scheme) => ({ color: pageColors(theme, scheme).text }));
  const marker = () => {
    const icon = props.icon ?? list.icon;
    if (icon != null) return icon;
    const kind = read(list.marker);
    if (kind === 'none') return null;
    if (read(list.ordered) === true) return <Label {...DECOR} text={`${index + 1}.`} />;
    const shape = MARKERS[kind ?? 'disc'] ?? 0;
    return (
      <View {...DECOR} style={styled({}, theme => ({ width: theme.sizes.glyph.lg, align: 'center', justify: 'center', minHeight: theme.sizes.glyph.lg }))}>
        <View
          style={styled({}, theme => {
            const d = Math.round(theme.sizes.glyph.lg * theme.ratios.mark);
            return { width: d, height: d, radius: shape === 2 ? 0 : d / 2, ...(shape === 1 ? { border: 1, borderColor: ink().color } : { background: ink().color }) };
          })}
        />
      </View>
    );
  };
  const center = () => read(list.center) === true;
  const content = flat(props.children);
  const nested = content.filter(c => isPart(c, List));
  const own = content.filter(c => !isPart(c, List));
  return (
    <View role="listitem" {...pass(props)} style={styled(props, () => ({ direction: 'column' }))}>
      <View style={styled({}, theme => ({ direction: 'row', gap: theme.spacing.xs, align: center() ? 'center' : 'start' }))}>
        {marker}
        <View style={{ grow: 1, minWidth: 0 }}>{own.length === 1 && textual(own[0]) ? <Label text={own[0]} style={{ wrap: true }} /> : hasInline(own) ? <Label {...textOf({ children: own })} style={{ wrap: true }} /> : own}</View>
      </View>
      {nested.length > 0 ? <View style={styled({}, theme => ({ padding: [0, 0, 0, theme.spacing.md] }))}>{nested}</View> : null}
    </View>
  );
}
List.Item = ListItem;

/**
 * A block of content in the theme's text styles: its children in a column,
 * `md` apart, at the body size and line height.
 * @param {Record<string, any>} props
 */
export function Prose(props) {
  const style = styled(props, (theme, scheme) => ({
    direction: 'column',
    gap: theme.spacing.md,
    fontSize: theme.fontSizes.md,
    lineHeight: theme.lineHeights.md,
    color: pageColors(theme, scheme).text,
  }));
  return (
    <View {...pass(props)} style={style}>
      {props.children}
    </View>
  );
}
