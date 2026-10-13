// Inline text: a component's children as one Label's styled runs (ren-core's
// `runs`), a paragraph's spans set inline. Text, Link, Code and
// Mark carry an `inline` function, their run's style (and press) from their
// props, so `<Text>see <Link>docs</Link> or <Code>npm test</Code></Text>`
// is one Label that wraps across its runs on every renderer.

import { Lazy, read } from 'ren-core';
import { styleProps } from '../../theme/resolve.js';

/** @typedef {import('../../theme/theme.jsx').RuiThemeValue} RuiThemeValue */
/** @typedef {import('../../theme/theme.jsx').Scheme} Scheme */

/**
 * A run of a Label's text (ren-core's `Run`).
 * @typedef {{ text: string, style?: Record<string, any> | null, onPress?: (event: any) => void }} Run
 */

/**
 * What an inline component gives its run: its style (the text part is kept)
 * and its press.
 * @typedef {(props: Record<string, any>, theme: RuiThemeValue, scheme: Scheme) => { style?: Record<string, any> | null, onPress?: ((event: any) => void) | null }} Inline
 */

/** The text part of the portable style: what a run's style holds. */
const RUN = /** @type {const} */ (['color', 'background', 'fontWeight', 'italic', 'underline', 'strike', 'fontFamily', 'fontSize']);

/**
 * The text part of a style, the fields a run holds (the rest is the box's).
 * @param {Record<string, any> | null | undefined} style
 * @returns {Record<string, any>}
 */
export function runStyle(style) {
  /** @type {Record<string, any>} */
  const out = {};
  if (style == null) return out;
  for (const key of RUN) if (style[key] !== undefined) out[key] = style[key];
  return out;
}

/** A child as an inline element: a Lazy of a component with `inline`, or null. @param {any} child */
const inlineOf = child => (child instanceof Lazy && typeof (/** @type {any} */ (child.component).inline) === 'function' ? child : null);

/** The children of a component, flat. @param {any} children @returns {any[]} */
const flat = children => (children == null ? [] : Array.isArray(children) ? children.flat(Infinity) : [children]);

/**
 * Whether children hold inline elements and nothing else but text: then
 * they are one Label's runs. Plain text alone is not (it stays `text`).
 * @param {any} children
 */
export function hasInline(children) {
  let found = false;
  for (const c of flat(children)) {
    if (c == null || typeof c === 'boolean' || typeof c === 'string' || typeof c === 'number' || typeof c === 'function') continue;
    const el = inlineOf(c);
    if (el === null) return false;
    const inner = el.props.text !== undefined ? el.props.text : el.props.children;
    for (const i of flat(inner)) if (i instanceof Lazy && inlineOf(i) === null) return false;
    found = true;
  }
  return found;
}

/**
 * Children as runs: text in the inherited style, inline elements in theirs
 * over it (their style props too: `fg`, `fontWeight`, `fontSize`, `bg`), nested ones over
 * their parent's; an accessor's value is read here, so call it where it is
 * tracked (a `runs` binding).
 * @param {any} children @param {RuiThemeValue} theme @param {Scheme} scheme
 * @param {Record<string, any> | null} [inherited] @param {((event: any) => void) | null} [press]
 * @param {Run[]} [out]
 * @returns {Run[]}
 */
export function runsOf(children, theme, scheme, inherited = null, press = null, out = []) {
  for (const child of flat(children)) {
    const value = child instanceof Lazy ? child : read(child);
    if (value == null || typeof value === 'boolean') continue;
    const el = inlineOf(value);
    if (el !== null) {
      const own = /** @type {Inline} */ (/** @type {any} */ (el.component).inline)(el.props, theme, scheme);
      const style = { ...inherited, ...runStyle({ ...own.style, ...styleProps(theme, scheme, el.props), ...read(el.props.style) }) };
      runsOf(el.props.text !== undefined ? el.props.text : el.props.children, theme, scheme, style, own.onPress ?? press, out);
      continue;
    }
    if (value instanceof Lazy) continue;
    /** @type {Run} */
    const run = { text: String(value), style: inherited };
    if (press !== null) run.onPress = press;
    out.push(run);
  }
  return out;
}
