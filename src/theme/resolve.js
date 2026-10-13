// Resolving theme values: a color name or shade to hex, a size to pixels, a
// variant to its colors, and the
// style props every component takes (m, p, w, h, bg, fg, …) to the portable
// style.

import { read } from 'ren-core';
import { alpha, isLight } from './colors.js';
import { ownValue, tables } from '../own.js';

/** @typedef {import('./theme.jsx').RuiThemeValue} RuiThemeValue */
/** @typedef {import('./theme.jsx').Scheme} Scheme */
/** @typedef {import('./theme.jsx').SizeValue} SizeValue */
/** @typedef {'solid' | 'soft' | 'outline' | 'ghost' | 'neutral' | 'plain' | 'inverse'} Variant */

/** The shade a theme's solid variants use in a scheme. @param {RuiThemeValue} theme @param {Scheme} scheme */
export const accentShade = (theme, scheme) => theme.accentShade[scheme];

/**
 * A color: a theme color name (its accent shade), `name.shade`
 * (`'blue.3'`), or any CSS hex, which passes through.
 * @param {RuiThemeValue} theme @param {Scheme} scheme @param {string | undefined | null} color
 * @returns {string}
 */
export function colorOf(theme, scheme, color) {
  const name = color ?? theme.accent;
  if (name[0] === '#' || name.startsWith('rgb') || name === 'transparent') return name;
  const dot = name.indexOf('.');
  const key = dot < 0 ? name : name.slice(0, dot);
  const shades = ownValue(theme.colors, key);
  if (shades === undefined) return name === 'white' ? theme.white : name === 'black' ? theme.black : name;
  const index = dot < 0 ? accentShade(theme, scheme) : Number(name.slice(dot + 1));
  return shades[Math.max(0, Math.min(9, index))];
}

/** The shades of a theme color name (the accent's for anything else). @param {RuiThemeValue} theme @param {string | undefined | null} color */
export const shadesOf = (theme, color) => theme.colors[(color ?? '').split('.')[0]] ?? theme.colors[theme.accent];

/**
 * A size on one of the theme's scales, or pixels.
 * @param {Record<string, number>} scale @param {SizeValue | undefined | null} size @param {string} [fallback]
 * @returns {number}
 */
export function sized(scale, size, fallback = 'md') {
  if (typeof size === 'number') return size;
  return ownValue(scale, size ?? fallback) ?? scale[fallback];
}

/** A radius: a scale step, pixels, or the theme's `corner`. @param {RuiThemeValue} theme @param {SizeValue | undefined | null} radius */
export const radiusOf = (theme, radius) => sized(theme.radius, radius, theme.corner);

/**
 * The page's own colors in a scheme, by role. Components read a role, never
 * a gray or night shade; this is the one place that maps roles to shades,
 * picked by contrast on the palette.
 * - `body` the page; `text` body text; `quiet` secondary text and inactive
 *   labels (7 : 1 or more); `placeholder` hints and outside days
 * - `border` field and control edges (3 : 1 or more); `rule` dividers,
 *   card edges and soft outlines; `edge` thick lips and grips (Key's
 *   bottom, Panes' grips)
 * - `neutral` and `hover` the neutral variant's ground and any hover ground
 *   on page-colored surfaces and rows; `field` an input's ground
 * - `sunken` wells below the page (code, tags, keys, soft inputs);
 *   `raised` surfaces above it (cards, notifications, panels: white on the
 *   light page, set off by shadow and rule; lighter than the body on the
 *   dark one)
 * - `track` the unfilled part of sliders, switches, progress, rings and
 *   stars, and skeletons; `stripe` alternate table rows
 * - `disabled` and `disabledText`
 * @param {RuiThemeValue} theme @param {Scheme} scheme
 */
export function pageColors(theme, scheme) {
  const gray = theme.colors.gray;
  const night = theme.colors.night;
  return scheme === 'dark'
    ? { body: night[8], text: gray[1], quiet: night[1], placeholder: night[2], border: night[3], rule: night[5], edge: night[4], neutral: night[6], hover: night[5], field: night[7], sunken: night[9], raised: night[7], track: night[5], stripe: night[7], disabled: night[7], disabledText: night[4] }
    : // Light: hover the faintest cool wash (gray.0), sunken a step deeper (gray.1), stripe the rule shade washed to opacity.soft over the rows' ground.
      { body: theme.white, text: gray[9], quiet: gray[7], placeholder: gray[6], border: gray[5], rule: gray[2], edge: gray[4], neutral: theme.white, hover: gray[0], field: theme.white, sunken: gray[1], raised: theme.white, track: gray[2], stripe: alpha(gray[2], theme.opacity.soft), disabled: gray[1], disabledText: gray[4] };
}

/**
 * Tooltip colors, from the other scheme's page roles so a tip stands out
 * on either: the dark page's body with the light page's sunken ground as
 * text; in the dark scheme the light page's hover ground with the dark
 * page's sunken ground as text. A `color` is solid. The Slider's value
 * label wears them too.
 * @param {any} theme @param {string} scheme @param {any} [color]
 */
export function tooltipColors(theme, scheme, color) {
  if (color != null) {
    const shades = ownValue(theme.colors, String(color).split('.')[0]);
    const bg = shades ? shades[theme.accentShade[scheme]] : color;
    return { background: bg, text: theme.white };
  }
  const light = pageColors(theme, 'light');
  const dark = pageColors(theme, 'dark');
  return scheme === 'dark' ? { background: light.hover, text: dark.sunken } : { background: dark.body, text: light.sunken };
}

/**
 * The tint scale the variants share, by scheme: `rest` (a soft ground),
 * `hover` (a soft ground under the pointer) and `wash` (the faintest, an
 * outline's hover).
 */
export const TINTS = Object.freeze(tables({ light: { rest: 0.14, hover: 0.22, wash: 0.08 }, dark: { rest: 0.22, hover: 0.3, wash: 0.12 } }));

/**
 * A variant's colors for a theme color: the background, its hover, the
 * text, the text under the pointer (`hoverColor`) and the border. The
 * tones: `tone` is the accent shade (6), `deep` the text on tinted
 * grounds (8 in the light scheme, 3 in the dark, 7 : 1 or more).
 * @param {RuiThemeValue} theme @param {Scheme} scheme @param {Variant | string | undefined} variant @param {string | undefined | null} color
 * @returns {{ background: string, hover: string, color: string, hoverColor: string, border: string }}
 */
export function variantColors(theme, scheme, variant, color) {
  const named = color == null || theme.colors[color.split('.')[0]] !== undefined;
  const shades = shadesOf(theme, color);
  const main = colorOf(theme, scheme, color);
  const dark = scheme === 'dark';
  const tint = TINTS[scheme];
  /** A shade of the color (the color itself when it is not a theme name). @param {number} i */
  const at = i => (named ? shades[i] : main);
  const tone = at(accentShade(theme, scheme));
  const deep = at(dark ? 3 : 8);
  const clear = 'transparent';
  switch (variant ?? 'solid') {
    case 'soft':
      return { background: alpha(at(5), tint.rest), hover: alpha(at(5), tint.hover), color: deep, hoverColor: deep, border: clear };
    case 'outline': {
      const text = dark ? at(3) : tone;
      return { background: clear, hover: alpha(tone, tint.wash), color: text, hoverColor: text, border: text };
    }
    case 'ghost': {
      const text = at(dark ? 3 : 7);
      return { background: clear, hover: alpha(at(5), tint.rest), color: text, hoverColor: text, border: clear };
    }
    case 'plain':
      return { background: clear, hover: clear, color: at(dark ? 3 : 7), hoverColor: deep, border: clear };
    case 'inverse':
      return { background: theme.white, hover: theme.colors.gray[1], color: at(7), hoverColor: at(7), border: clear };
    case 'neutral': {
      const page = pageColors(theme, scheme);
      return { background: page.neutral, hover: page.hover, color: page.text, hoverColor: page.text, border: page.border };
    }
    default: {
      // solid: its hover moves toward the page's opposite (darker on a light page).
      const dot = color?.indexOf('.') ?? -1;
      const index = dot < 0 ? accentShade(theme, scheme) : Number(String(color).slice(dot + 1));
      const hover = named ? shades[Math.max(0, Math.min(9, index + (dark ? -1 : 1)))] : main;
      // White text; `contrast` picks black on a fill past the threshold.
      const text = theme.contrast === true && isLight(main, theme.contrastThreshold) ? theme.black : theme.white;
      return { background: main, hover, color: text, hoverColor: text, border: clear };
    }
  }
}

/** A theme shadow as the portable style's `shadow`. @param {RuiThemeValue} theme @param {SizeValue | undefined | null} size */
export function shadowOf(theme, size) {
  if (size == null || size === 0) return undefined;
  const s = typeof size === 'number' ? { x: 0, y: size / 2, blur: size * 2, color: '#00000026' } : ownValue(theme.shadows, size);
  return s === undefined ? undefined : { x: s.x, y: s.y, blur: s.blur, color: s.color };
}

/**
 * The style props, read (they may be accessors) and resolved on the
 * theme into the portable style: margins (`m`, `mt`, `mb`, `ml`, `mr`,
 * `mx`, `my`), paddings (`p`, …), `w`, `h`, `minWidth`, `maxWidth`,
 * `minHeight`, `maxHeight`, `bg`, `fg` (the text color; `'quiet'` the
 * page's muted text), `opacity`, `fontSize`, `fontWeight`, `textAlign`,
 * `textTransform`, `lineHeight`, `flex`. Spacing values are scale steps or
 * pixels.
 * @param {RuiThemeValue} theme @param {Scheme} scheme @param {Record<string, any>} props
 * @returns {Record<string, any>}
 */
export function styleProps(theme, scheme, props) {
  /** @type {Record<string, any>} */
  const s = {};
  const space = (/** @type {any} */ v) => (typeof v === 'string' && v in theme.spacing ? theme.spacing[/** @type {'md'} */ (v)] : v);
  /** @param {string} name @returns {any} */
  const at = name => read(props[name]);
  const edges = (/** @type {string} */ k, /** @type {string} */ into) => {
    const all = at(k);
    const x = at(`${k}x`);
    const y = at(`${k}y`);
    const t = at(`${k}t`) ?? y ?? all;
    const r = at(`${k}r`) ?? x ?? all;
    const b = at(`${k}b`) ?? y ?? all;
    const l = at(`${k}l`) ?? x ?? all;
    if (t === undefined && r === undefined && b === undefined && l === undefined) return;
    s[into] = [space(t ?? 0), space(r ?? 0), space(b ?? 0), space(l ?? 0)];
  };
  edges('m', 'margin');
  edges('p', 'padding');
  const map = /** @type {const} */ ([
    ['w', 'width'],
    ['h', 'height'],
    ['minWidth', 'minWidth'],
    ['maxWidth', 'maxWidth'],
    ['minHeight', 'minHeight'],
    ['maxHeight', 'maxHeight'],
    ['opacity', 'opacity'],
    ['fontWeight', 'fontWeight'],
    ['textAlign', 'textAlign'],
    ['textTransform', 'textTransform'],
    ['lineHeight', 'lineHeight'],
    ['flex', 'grow'],
  ]);
  for (const [from, to] of map) {
    const v = at(from);
    if (v !== undefined) s[to] = v;
  }
  const bg = at('bg');
  if (bg !== undefined) s.background = colorOf(theme, scheme, bg);
  const fg = at('fg');
  if (fg !== undefined) s.color = fg === 'quiet' ? pageColors(theme, scheme).quiet : colorOf(theme, scheme, fg);
  const fontSize = at('fontSize');
  if (fontSize !== undefined) s.fontSize = sized(theme.fontSizes, fontSize);
  return s;
}

/** A portable style's sides (a number, [vertical, horizontal] or [top, right, bottom, left]) as four, null for anything else. @param {any} v @returns {any[] | null} */
const fourSides = v => (typeof v === 'number' || typeof v === 'string' ? [v, v, v, v] : Array.isArray(v) && v.length === 2 ? [v[0], v[1], v[0], v[1]] : Array.isArray(v) && v.length === 4 ? [...v] : null);

/**
 * The style props' margin and padding over a component's own, side by
 * side: a side the props leave out (`py` gives no left or right) keeps the
 * component's, where `styleProps` alone writes it 0.
 * @param {Record<string, any> | null} own the component's style @param {Record<string, any>} given `styleProps`' result @param {Record<string, any>} props
 * @returns {Record<string, any>} `given`, its margin and padding merged
 */
export function keepOwnSides(own, given, props) {
  for (const [k, into] of /** @type {const} */ ([['m', 'margin'], ['p', 'padding']])) {
    const mine = own == null ? null : fourSides(own[into]);
    if (mine === null || given[into] === undefined) continue;
    // A null side is left out, as styleProps reads it.
    const at = (/** @type {string} */ name) => read(props[name]) != null;
    const all = at(k);
    const x = at(`${k}x`);
    const y = at(`${k}y`);
    const set = [at(`${k}t`) || y || all, at(`${k}r`) || x || all, at(`${k}b`) || y || all, at(`${k}l`) || x || all];
    given[into] = given[into].map((/** @type {any} */ v, /** @type {number} */ i) => (set[i] ? v : mine[i]));
  }
  return given;
}

/** rui's alignment words, the portable style's: align (start, center, end, stretch) and justify (start, center, end, between, around, evenly). */
const WORDS = new Set(['start', 'center', 'end', 'stretch', 'between', 'around', 'evenly']);

/** An alignment word when it is one of rui's (start, center, end, stretch, between, around, evenly); anything else (CSS's words too) is undefined, so the component's default holds. @param {string | undefined | null} word */
export const flexWord = word => (word != null && WORDS.has(word) ? word : undefined);

/** A spacing: a scale step or pixels. @param {import('./theme.jsx').RuiThemeValue} theme @param {SizeValue | undefined | null} value @param {string} [fallback] */
export const spacing = (theme, value, fallback = 'md') => sized(theme.spacing, value, fallback);

/**
 * The font size `steps` steps below `size` on the theme's type scale (the
 * smallest at the bottom): a control's notes sit `theme.control.textStep`
 * steps below its text, never a pixel offset.
 * @param {RuiThemeValue} theme @param {any} size a step name or px @param {number} [steps]
 */
export function fontBelow(theme, size, steps = theme.control.textStep) {
  const scale = /** @type {number[]} */ (Object.values(theme.fontSizes)).sort((a, b) => a - b);
  const px = typeof size === 'number' ? size : sized(theme.fontSizes, size);
  const at = scale.findIndex(f => f >= px);
  return scale[Math.max(0, (at < 0 ? scale.length - 1 : at) - steps)];
}
