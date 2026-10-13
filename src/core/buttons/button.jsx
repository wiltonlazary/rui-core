// Buttons: Button and Pressable, on the portable Action (a press
// area with focus, keyboard activation and hover and press states on
// every renderer).

import { Action, Label, read, $lookup } from 'ren-core';
import { styled } from '../../theme/style.js';
import { variantColors, radiusOf, sized, pageColors, flexWord } from '../../theme/resolve.js';
import { gradientColors } from './gradient.js';
import { $joined, joinedStyle, unjoined } from './joined.jsx';
import { flag, marks, TriggerMeaning } from '../../theme/meaning.js';

/**
 * A button's box at its `size` (xs to xl, sm by default), `dense` or not:
 * its height is the theme's `sizes.control` (or `sizes.dense`) and its side
 * padding its `control.pad` (or `control.densePad`).
 * @param {import('../../theme/theme.jsx').RuiThemeValue} theme
 * @param {Record<string, any>} props
 * @returns {{ size: string, height: number, padding: number }}
 */
export function buttonBox(theme, props) {
  const size = String(read(props.size) ?? 'sm');
  const dense = read(props.dense) === true;
  const heights = /** @type {Record<string, number>} */ (dense ? theme.sizes.dense : theme.sizes.control);
  const paddings = /** @type {Record<string, number>} */ (dense ? theme.control.densePad : theme.control.pad);
  return { size, height: heights[size] ?? heights.sm, padding: paddings[size] ?? paddings.sm };
}

/** The press handler: `onPress`. @param {Record<string, any>} props */
export const pressOf = props => props.onPress;

/** Whether children are plain text (a string, a number, or an accessor of one). @param {any} children */
const textual = children => typeof children === 'string' || typeof children === 'number' || typeof children === 'function';

/**
 * A variant's colors, the gradient one too (`gradient`: { colors, angle }).
 * @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {import('../../theme/theme.jsx').Scheme} scheme @param {Record<string, any>} props @param {string} [fallback]
 * @returns {{ background: any, hover: any, color: string, hoverColor?: string, border: string }}
 */
export function colorsOf(theme, scheme, props, fallback) {
  const variant = read(props.variant) ?? fallback;
  return variant === 'gradient' ? gradientColors(theme, scheme, read(props.gradient)) : variantColors(theme, scheme, variant, read(props.color));
}

/**
 * A button: `variant` (solid, soft, outline, ghost, neutral, plain,
 * inverse, gradient with `gradient` { colors, angle }), `color`,
 * `size` (xs to xl), `dense` (lower and tighter at that size), `radius`,
 * `stretch`, `disabled`, `loading`, `start` and `end`, `justify`
 * (where its label, start and end sit: 'center' by default, 'start',
 * 'end', 'between', 'around' or 'evenly'), `onPress`. In a
 * Button.Group it draws no border and no radius (the group's frame draws
 * its edge, the lines between its children and its corners).
 * @param {Record<string, any>} props
 */
export function Button(props) {
  const joined = $joined();
  // Inside a Menu.Trigger (or Tooltip's): what it says of the layer it opens.
  const trigger = $lookup(TriggerMeaning);
  const style = styled(props, (theme, scheme) => {
    const box = buttonBox(theme, props);
    const off = read(props.disabled) === true || read(props.loading) === true;
    const c = colorsOf(theme, scheme, props);
    const radius = radiusOf(theme, read(props.radius));
    const page = pageColors(theme, scheme);
    return {
      direction: 'row',
      align: 'center',
      justify: /** @type {any} */ (flexWord(read(props.justify)) ?? 'center'),
      gap: theme.control.iconGap,
      height: box.height,
      minHeight: box.height,
      padding: [0, box.padding],
      radius,
      fontSize: sized(theme.fontSizes, /** @type {any} */ (box.size), 'sm'),
      fontWeight: theme.weights.strong,
      border: 1,
      ...joinedStyle(joined),
      ...(off
        ? { background: page.disabled, color: page.disabledText, borderColor: 'transparent', cursor: 'not-allowed' }
        : { background: c.background, color: c.color, borderColor: c.border, cursor: 'pointer', hover: { background: c.hover, color: c.hoverColor ?? c.color } }),
      ...(read(props.stretch) ? { width: '100%', self: 'stretch' } : null),
      ...(read(props.loading) ? { opacity: theme.opacity.muted } : null),
    };
  });
  const press = pressOf(props);
  const onPress = (/** @type {any} */ e) => {
    if (read(props.disabled) || read(props.loading)) return;
    press?.(e);
  };
  const sections = props.start !== undefined || props.end !== undefined;
  if (!sections && textual(props.children))
    return <Action ref={props.ref} text={props.children} label={props.label} {...trigger} {...marks(props)} aria-disabled={flag(() => read(props.disabled) || read(props.loading))} onPress={onPress} style={style} />;
  return (
    <Action ref={props.ref} label={props.label} {...trigger} {...marks(props)} aria-disabled={flag(() => read(props.disabled) || read(props.loading))} onPress={onPress} style={style}>
      {unjoined([props.start, textual(props.children) ? <Label text={props.children} /> : props.children, props.end])}
    </Action>
  );
}

/** A press area with no style of its own: `onPress`. @param {Record<string, any>} props */
export function Pressable(props) {
  const trigger = $lookup(TriggerMeaning);
  // The page's text color: a DOM button does not inherit one.
  const style = styled(props, (theme, scheme) => ({ background: 'transparent', color: pageColors(theme, scheme).text, border: 0, padding: 0, cursor: 'pointer' }));
  const onPress = pressOf(props);
  if (textual(props.children)) return <Action ref={props.ref} text={props.children} label={props.label} {...trigger} {...marks(props)} onPress={onPress} style={style} />;
  return (
    <Action ref={props.ref} label={props.label} {...trigger} {...marks(props)} onPress={onPress} style={style}>
      {props.children}
    </Action>
  );
}
