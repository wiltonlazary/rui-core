// The gradient variant: a `gradient` ({ colors, angle }: two or more
// colors spread evenly along a line at `angle` degrees) as the portable
// style's linear gradient, theme colors resolved as a solid variant's (the
// accent shade). Without one, the theme's `gradient`, else the default:
// teal to indigo at 120 degrees (a third of the wheel).

import { colorOf } from '../../theme/resolve.js';

/** @typedef {{ colors?: readonly string[], angle?: number }} GradientProp */

/** The default gradient. */
export const DEFAULT_GRADIENT = Object.freeze({ colors: Object.freeze(['teal', 'indigo']), angle: 120 });

/**
 * A gradient prop as the portable style's `background`: its colors spread
 * evenly from 0 to 1 (one color stands alone), at its angle.
 * @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {import('../../theme/theme.jsx').Scheme} scheme @param {GradientProp | null | undefined} gradient
 * @returns {{ linear: number, stops: [number, string][] }}
 */
export function gradientOf(theme, scheme, gradient) {
  const base = /** @type {GradientProp} */ (/** @type {any} */ (theme).gradient ?? DEFAULT_GRADIENT);
  const colors = gradient?.colors ?? base.colors ?? DEFAULT_GRADIENT.colors;
  const angle = gradient?.angle ?? base.angle ?? DEFAULT_GRADIENT.angle;
  const last = Math.max(1, colors.length - 1);
  return { linear: angle, stops: colors.map((c, i) => /** @type {[number, string]} */ ([colors.length === 1 ? 0 : i / last, colorOf(theme, scheme, c)])) };
}

/**
 * The gradient variant's colors, in the shape of `variantColors`: the
 * gradient behind white text, the same on hover, no border.
 * @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {import('../../theme/theme.jsx').Scheme} scheme @param {GradientProp | null | undefined} gradient
 */
export function gradientColors(theme, scheme, gradient) {
  const background = gradientOf(theme, scheme, gradient);
  return { background, hover: background, color: theme.white, border: 'transparent' };
}
