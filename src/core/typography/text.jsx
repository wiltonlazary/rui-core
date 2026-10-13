// Typography: Text and Heading, on the portable Label.

import { Label, read } from 'ren-core';
import { styled } from '../../theme/style.js';
import { $ui } from '../../theme/theme.jsx';
import { sized } from '../../theme/resolve.js';
import { pass } from '../layout/layout.jsx';
import { hasInline, runsOf } from './inline.js';

/** The text a component shows: its `text`, or its children when they are text. @param {Record<string, any>} props */
const content = props => (props.text !== undefined ? props.text : props.children);

/**
 * A Label's text: its `text`, or its children; children holding inline
 * elements (Text, Link, Code, Mark) are its runs, one Label that wraps
 * across them, as inline spans.
 * @param {Record<string, any>} props
 * @returns {Record<string, any>}
 */
export function textOf(props) {
  if (props.text !== undefined || !hasInline(props.children)) return { text: content(props) };
  const ui = $ui();
  return { runs: () => runsOf(props.children, ui.theme(), ui.scheme()) };
}

/**
 * `lines` and `truncate` as the Label's `lines` and
 * `ellipsis`, only those the caller set.
 * @param {Record<string, any>} props @returns {Record<string, any>}
 */
const clipOf = props => ({
  ...(props.lines === undefined
    ? null
    : {
        lines: () => {
          const n = read(props.lines);
          return typeof n === 'number' && n >= 1 ? n : 0;
        },
      }),
  ...(props.truncate === undefined
    ? null
    : {
        ellipsis: () => {
          const t = read(props.truncate);
          return t === true || t === 'end';
        },
      }),
});

/** The portable style's `italic`, `underline` and `strike`, each set by its own prop. @param {Record<string, any>} props */
const faceOf = props => ({
  ...(read(props.italic) === true ? { italic: true } : null),
  ...(read(props.underline) === true ? { underline: true } : null),
  ...(read(props.strike) === true ? { strike: true } : null),
});

/**
 * Text in the theme's font sizes: `size` (a scale step or pixels), `fg`,
 * `fontWeight`, `textAlign`, `italic`, `underline`, `strike`
 * (the portable style's words, with `inherit` too), `inherit` (the parent's size and
 * color), `lines` (at most that many lines, the last ending with …) and
 * `truncate` (one line ending with …; `true` or `'end'`: the portable Label
 * cuts at the end only). Its words wrap, as a paragraph's, unless
 * truncated; `style={{ wrap: false }}` keeps it on one line. It means a
 * paragraph (role `paragraph`), unless `inline` or `inherit`.
 * @param {Record<string, any>} props
 */
export function Text(props) {
  const style = styled(props, theme => {
    // A paragraph: its words wrap, unless it is truncated to one line.
    const wrap = { wrap: !(props.truncate !== undefined && read(props.truncate) !== false) };
    if (read(props.inherit)) return { ...wrap, ...faceOf(props) };
    const size = read(props.size) ?? 'md';
    return {
      ...wrap,
      fontSize: sized(theme.fontSizes, size),
      lineHeight: typeof size === 'string' ? (theme.lineHeights[/** @type {'md'} */ (size)] ?? theme.lineHeights.md) : theme.lineHeights.md,
      ...faceOf(props),
    };
  });
  // A paragraph, as a `<p>`; `inline` or `inherit` text runs on in what holds it.
  const role = read(props.inline) || read(props.inherit) ? undefined : 'paragraph';
  return <Label role={role} {...pass(props)} {...clipOf(props)} {...textOf(props)} style={style} />;
}

/** Nested in text, a run: its `size`, `italic`, `underline` and `strike` (its style props apply too). @type {import('./inline.js').Inline} */
Text.inline = (props, theme) => {
  const size = read(props.size);
  return {
    style: {
      ...(size == null ? null : { fontSize: sized(theme.fontSizes, size) }),
      ...faceOf(props),
    },
  };
};

/**
 * A heading (role `heading`, `aria-level` its level): `level` 1 to 6 sets
 * its size and leading (the theme's `headings.levels`); `size` overrides
 * them with another level's (a number, 1 to 6, as `level`) or a font
 * scale step (xs to xl); `lines` clamps it; its words wrap.
 * @param {Record<string, any>} props
 */
export function Heading(props) {
  const style = styled(props, theme => {
    const levels = theme.headings.levels;
    /** A level's size and leading (the first for one out of range). @param {unknown} n */
    const at = n => levels[Math.max(1, Math.min(levels.length, Math.floor(Number(n) || 1))) - 1];
    const heading = at(read(props.level) ?? 1);
    const size = read(props.size);
    const other = typeof size === 'number' ? at(size) : null;
    return {
      wrap: true,
      fontSize: other?.size ?? (size == null ? heading.size : sized(theme.fontSizes, size)),
      lineHeight: other?.leading ?? heading.leading,
      fontWeight: theme.headings.weight,
    };
  });
  return <Label role="heading" aria-level={() => read(props.level) ?? 1} {...pass(props)} {...clipOf({ lines: props.lines })} {...textOf(props)} style={style} />;
}
