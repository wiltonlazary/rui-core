// What the inputs share: controlled and uncontrolled values
// (`value` + `onChange` or `defaultValue`), the input sizes, the field
// colors of each variant, and the small icons (check, dash, chevrons, eye)
// drawn as portable shapes.

import { $active, $signal, $read, $write, read } from 'ren-core';
import { colorOf, fontBelow, pageColors, sized } from '../../theme/resolve.js';
import { isLight } from '../../theme/colors.js';
import { BASE_THEME } from '../../theme/theme.jsx';

/** A size name the theme's scales know, `sm` by default. @param {any} size */
export const sizeOf = size => /** @type {import('../../theme/theme.jsx').Size} */ (typeof size === 'string' && size in BASE_THEME.sizes.control ? size : 'sm');

/**
 * A control's height at `size` (a name, `sm` by default): the theme's
 * `sizes.control`, shared by inputs, fields, pickers and buttons.
 * @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {any} size
 * @returns {number}
 */
export const heightOf = (theme, size) => theme.sizes.control[sizeOf(size)];

/**
 * A component's value, controlled or not: when `props[key]` is
 * given the component shows it and only calls `onChange`; otherwise it keeps
 * its own, starting at `props[initial]` (or `fallback`).
 * @template T
 * @param {Record<string, any>} props @param {T} fallback @param {string} [key] @param {string} [initial] @param {string} [change]
 * @returns {{ get: () => T, set: (value: T) => void, controlled: boolean }}
 */
export function $value(props, fallback, key = 'value', initial = 'defaultValue', change = 'onChange') {
  const controlled = props[key] !== undefined;
  const start = read(props[initial]);
  const own = $signal($active(), /** @type {T} */ (start === undefined ? fallback : start));
  return {
    controlled,
    get: () => {
      if (!controlled) return $read(own);
      const v = read(props[key]);
      return v === undefined || v === null ? fallback : v;
    },
    set: value => {
      if (!controlled) $write(own, value);
      props[change]?.(value);
    },
  };
}

/**
 * The colors of a field in a variant (`outline`, `soft`, `bare`), with
 * the error and focus borders.
 * @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {import('../../theme/theme.jsx').Scheme} scheme
 * @param {string | undefined} variant @param {{ error?: boolean, focused?: boolean, disabled?: boolean }} state
 */
export function fieldColors(theme, scheme, variant, state) {
  const page = pageColors(theme, scheme);
  const error = errorColor(theme, scheme);
  const accent = colorOf(theme, scheme, theme.accent);
  const v = variant ?? 'outline';
  let background = v === 'soft' ? page.sunken : v === 'bare' ? 'transparent' : page.field;
  let border = v === 'outline' ? page.border : 'transparent';
  let color = page.text;
  if (state.focused && v !== 'bare') border = accent;
  if (state.error && v !== 'bare') {
    border = error;
    color = error;
  }
  if (state.disabled) {
    background = v === 'bare' ? 'transparent' : page.disabled;
    color = page.disabledText;
  }
  return { background, border, color, placeholder: state.error ? error : page.placeholder };
}

// ---------------------------------------------------------------------------
// The field geometry every field shares (Field, the combobox fields,
// FileInput, the choice controls), from the theme's tokens.

/** A field's label: its text size in the strong weight. @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {number} font the field's text size (px) */
export const labelLook = (theme, font) => ({ fontSize: font, fontWeight: theme.weights.strong });

/** A field's note (description, error): `control.textStep` type steps below its text, at the tight leading. @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {number} font the field's text size (px) */
export const noteLook = (theme, font) => ({ fontSize: fontBelow(theme, font), lineHeight: theme.lineHeights.xs });

/** How far a field's text sits in from its sides: `ratios.inset` of its height. @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {number} height */
export const insetOf = (theme, height) => Math.round(theme.ratios.inset * height);

/** A disabled control: `opacity.disabled`, and the pointer says it takes no press. @param {import('../../theme/theme.jsx').RuiThemeValue} theme */
export const disabledLook = theme => ({ opacity: theme.opacity.disabled, cursor: 'not-allowed' });

/**
 * An option's padding (y, x) at a size (a combobox option, a tree row, a
 * segment): `control.optionPad` at md, scaled with the size's text.
 * @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {any} size @returns {[number, number]}
 */
export function optionPadOf(theme, size) {
  const k = sized(theme.fontSizes, size, 'sm') / theme.fontSizes.md;
  const [y, x] = theme.control.optionPad;
  return [Math.round(y * k), Math.round(x * k)];
}

/**
 * Each locale's number marks, cached by tag: the latest `MARKS_KEPT` tags,
 * the oldest dropped past them (a tag can come from user input).
 * @type {Map<string | undefined, { group: string, decimal: string }>}
 */
const MARKS = new Map();
export const MARKS_KEPT = 64; // count: locales kept, not a size

/** How many locales' marks are cached (for the tests). */
export const marksCached = () => MARKS.size;

/**
 * A locale's number marks, from the platform's number formatting: the
 * group mark between thousands and the decimal mark. `locale` is a BCP 47
 * tag, the platform's when not given; a malformed one gives ',' and '.'.
 * @param {string | undefined} locale @returns {{ group: string, decimal: string }}
 */
export function marksOf(locale) {
  // Keyed by the locale itself: '' (malformed) and none (the platform's) apart.
  let m = MARKS.get(locale);
  if (m === undefined) {
    try {
      const parts = new Intl.NumberFormat(locale, { useGrouping: true }).formatToParts(12345.6);
      m = { group: parts.find(p => p.type === 'group')?.value ?? ',', decimal: parts.find(p => p.type === 'decimal')?.value ?? '.' };
    } catch {
      m = { group: ',', decimal: '.' };
    }
    MARKS.set(locale, m);
    if (MARKS.size > MARKS_KEPT) MARKS.delete(MARKS.keys().next().value);
  }
  return m;
}

/**
 * The mark drawn on a filled control (a check, a radio's dot): `given` when
 * set, else black or white by the theme's contrast rule on the fill.
 * @param {any} theme @param {any} scheme @param {any} given @param {any} fill the control's color
 */
export function markOn(theme, scheme, given, fill) {
  if (given != null) return colorOf(theme, scheme, given);
  return isLight(colorOf(theme, scheme, fill), theme.contrastThreshold) ? theme.black : theme.white;
}

/** The error color: red at the scheme's accent shade (6 light, 8 dark). @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {import('../../theme/theme.jsx').Scheme} scheme */
export const errorColor = (theme, scheme) => colorOf(theme, scheme, 'red');

/** A number kept within bounds. @param {number} v @param {number} min @param {number} max */
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** How many decimals a number is written with, its exponent counted (1e-7 has 7, 1.5e-3 has 4). @param {number} n */
export const decimalsOf = n => {
  const [mantissa, exponent] = String(n).toLowerCase().split('e');
  const digits = (mantissa.split('.')[1] ?? '').length;
  return Math.max(0, digits - Number(exponent ?? 0));
};

/** A step as a browser reads it: a finite number above 0, else the default. @param {unknown} step @param {number} [fallback] */
export const stepOf = (step, fallback = 1) => (typeof step === 'number' && Number.isFinite(step) && step > 0 ? step : fallback);

/**
 * A `decimals` held to 0..100, the places toFixed takes (it throws past
 * them); null and undefined as they are.
 * @template {number | null | undefined} T @param {T} d @returns {T}
 */
export const placesOf = d => /** @type {T} */ (d == null ? d : Math.min(100, Math.max(0, d)));

/**
 * One step from `v` on the grid of `step` from `origin`, in the direction of
 * travel (`dir` +1 or -1), as a browser steps a number field: a value off the
 * grid goes to the next grid value that way, one on it a whole step; without
 * float noise (the step's, the origin's and `digits` decimals kept).
 * @param {number} v @param {number} step @param {number} origin @param {number} dir @param {number} [digits]
 */
export function stepOn(v, step, origin, dir, digits = 0) {
  const k = (v - origin) / step;
  const j = dir > 0 ? Math.floor(k + 1e-9) + 1 : Math.ceil(k - 1e-9) - 1;
  return Number((origin + j * step).toFixed(placesOf(Math.max(decimalsOf(step), decimalsOf(origin), digits))));
}

/** A value rounded to a step from `min`, without float noise (the step's and min's decimals kept). @param {number} v @param {number} step @param {number} min */
export function stepped(v, step, min) {
  const n = Math.round((v - min) / step) * step + min;
  return Number(n.toFixed(Math.max(decimalsOf(step), decimalsOf(min))));
}

// ---------------------------------------------------------------------------
// Icons, as portable shapes in a box of `w` by `h`.

/** A check mark (CheckIcon's stroke). @param {number} w @param {number} h @param {string} color */
export const checkShape = (w, h, color) => [
  { kind: 'path', points: [w * 0.08, h * 0.52, w * 0.38, h * 0.86, w * 0.92, h * 0.14], stroke: Math.max(1.5, w / 6), color },
];

/** A dash (the indeterminate icon). @param {number} w @param {number} h @param {string} color */
export const dashShape = (w, h, color) => [{ kind: 'round', x: w * 0.1, y: h / 2 - Math.max(1, h / 8), right: w * 0.9, bottom: h / 2 + Math.max(1, h / 8), radius: Math.max(1, h / 8), color }];

/** A chevron up or down. @param {number} w @param {number} h @param {string} color @param {boolean} up */
export const chevronShape = (w, h, color, up) => [
  { kind: 'path', points: up ? [w * 0.2, h * 0.7, w * 0.5, h * 0.3, w * 0.8, h * 0.7] : [w * 0.2, h * 0.3, w * 0.5, h * 0.7, w * 0.8, h * 0.3], stroke: 1.5, color },
];

/** An eye, crossed when `crossed` (the password visibility toggle). @param {number} s @param {string} color @param {boolean} crossed */
export function eyeShape(s, color, crossed) {
  /** @type {Record<string, any>[]} */
  const out = [
    { kind: 'oval', x: s * 0.08, y: s * 0.25, right: s * 0.92, bottom: s * 0.75, stroke: 1.5, color },
    { kind: 'oval', x: s * 0.38, y: s * 0.38, right: s * 0.62, bottom: s * 0.62, color },
  ];
  if (crossed) out.push({ kind: 'line', x: s * 0.12, y: s * 0.12, right: s * 0.88, bottom: s * 0.88, stroke: 1.5, color });
  return out;
}

/** A five-pointed star filling a box of `s`, as a closed path. @param {number} s @param {string} color @param {number} [stroke] */
export function starShape(s, color, stroke = 0) {
  const points = [];
  const c = s / 2;
  const outer = s / 2 - (stroke > 0 ? stroke : 0.5);
  const inner = outer / 2;
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    // A sixteenth lower, so the star sits optically centered.
    points.push(c + r * Math.cos(a), c + s / 16 + r * Math.sin(a));
  }
  return [{ kind: 'path', points, closed: true, stroke, color }];
}
