// Responsive values, in object form: `{ base: 1, sm: 2, lg: 4 }`
// takes, at a viewport width, the value of the widest breakpoint it reaches
// (min-width, mobile first), `base` below the first. The width is the
// application root's viewport (ren-core's `$viewport`, which `$media`
// reads), so a breakpoint holds on every renderer and in a worker; a host
// that reports none (a server render) takes `base`.

import { $viewport, $read } from 'ren-core';
import { ownValue } from '../own.js';

/** @typedef {import('./theme.jsx').RuiThemeValue} RuiThemeValue */
/** @typedef {import('./theme.jsx').Size} Size */

/** The theme's breakpoints, narrowest first. @type {readonly Size[]} */
export const BREAKPOINTS = Object.freeze(/** @type {Size[]} */ (['xs', 'sm', 'md', 'lg', 'xl']));

/**
 * A breakpoint in CSS pixels: a theme breakpoint name, or a length in em,
 * rem (16px each, as a media query reads them) or px, or a number of px.
 * @param {RuiThemeValue} theme @param {string | number} value
 * @returns {number}
 */
export function breakpointOf(theme, value) {
  if (typeof value === 'number') return value;
  const named = /** @type {string | undefined} */ (ownValue(theme.breakpoints, value));
  const text = String(named ?? value).trim();
  const m = /^(-?\d*\.?\d+)(px|em|rem)?$/.exec(text);
  if (m === null) return NaN;
  const n = Number(m[1]);
  return m[2] === 'em' || m[2] === 'rem' ? n * 16 : n;
}

/**
 * Whether a value is a responsive object form: a plain object
 * whose keys are `base` or breakpoint names.
 * @param {unknown} value
 */
export function isResponsive(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every(k => k === 'base' || /** @type {readonly string[]} */ (BREAKPOINTS).includes(k));
}

/**
 * A value at a viewport width: a responsive object's value at the widest
 * breakpoint the width reaches (its `base` below them), anything else as
 * it is.
 * @template T
 * @param {T | Partial<Record<'base' | Size, T>>} value @param {RuiThemeValue} theme @param {number} width
 * @returns {T | undefined}
 */
export function atWidth(value, theme, width) {
  if (!isResponsive(value)) return /** @type {T} */ (value);
  const v = /** @type {Partial<Record<'base' | Size, T>>} */ (value);
  let out = v.base;
  for (const name of BREAKPOINTS) if (v[name] !== undefined && width >= breakpointOf(theme, theme.breakpoints[name])) out = v[name];
  return out;
}

/**
 * The running root's viewport width for responsive values (call it in a
 * component): `at(value, theme)` gives a value at the current width, read
 * (and followed) only when the value is responsive; `width()` reads it.
 */
export function $breakpoints() {
  const view = $viewport();
  const width = () => $read(view.width);
  return {
    width,
    /**
     * @template T
     * @param {T | Partial<Record<'base' | Size, T>>} value @param {RuiThemeValue} theme
     * @returns {T | undefined}
     */
    at: (value, theme) => (isResponsive(value) ? atWidth(value, theme, width()) : /** @type {T} */ (value)),
  };
}
