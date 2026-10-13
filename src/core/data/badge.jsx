// Small marks: Badge, IconBox, Swatch and Key, on View and Label.

import { View, Label, Action, read } from 'ren-core';
import { styled } from '../../theme/style.js';
import { radiusOf, pageColors, colorOf, shadowOf, sized, fontBelow } from '../../theme/resolve.js';
import { marks } from '../../theme/meaning.js';
import { pass } from '../layout/layout.jsx';
import { pressOf, colorsOf } from '../buttons/button.jsx';

/** Whether children are plain text (a string, a number, or an accessor of one). @param {any} children */
export const textual = children => typeof children === 'string' || typeof children === 'number' || typeof children === 'function';

/**
 * A badge: `variant` (solid, soft, outline, dot, neutral, ghost,
 * plain, inverse, gradient with `gradient` { colors, angle }), `color`, `size` (xs to xl: its height the theme's `sizes.badge`, its text
 * two steps below the size on the type scale, inset from its sides by the
 * height times `ratios.inset`, its dot the height times `ratios.mark`), `radius` (sm by
 * default: a tag, not a pill), `start`, `end`, `round` (a circle as wide
 * as high), `stretch`; its text
 * shows in upper case (`textTransform`: the data keeps it as
 * written).
 * @param {Record<string, any>} props
 */
export function Badge(props) {
  /** The size step, and the height at it: the theme's `sizes.badge`. @param {import('../../theme/theme.jsx').RuiThemeValue} theme */
  const size = theme => /** @type {import('../../theme/theme.jsx').Size} */ (read(props.size) in theme.sizes.badge ? read(props.size) : 'md');
  const height = (/** @type {import('../../theme/theme.jsx').RuiThemeValue} */ theme) => theme.sizes.badge[size(theme)];
  const style = styled(props, (theme, scheme) => {
    const h = height(theme);
    const variant = read(props.variant) ?? 'solid';
    const page = pageColors(theme, scheme);
    const c = variant === 'dot' ? { background: page.body, color: page.text, border: page.border } : colorsOf(theme, scheme, props, 'solid');
    const round = read(props.round) === true;
    return {
      direction: 'row',
      align: 'center',
      justify: 'center',
      gap: theme.spacing.xs / 2,
      height: h,
      minWidth: round ? h : undefined,
      width: round ? h : read(props.stretch) ? '100%' : undefined,
      padding: [0, round ? 0 : Math.round(h * theme.ratios.inset)],
      radius: round ? theme.radius.round : radiusOf(theme, read(props.radius) ?? 'sm'),
      background: c.background,
      color: c.color,
      border: 1,
      borderColor: c.border,
      fontSize: fontBelow(theme, size(theme), 2),
      fontWeight: theme.weights.bold,
      lineHeight: 1,
      textTransform: 'uppercase',
      shrink: 0,
      ...(read(props.stretch) ? { self: 'stretch' } : { self: 'start' }),
    };
  });
  const dot = () => (
    <View
      style={styled({}, (theme, scheme) => {
        const d = Math.round(height(theme) * theme.ratios.mark);
        return { width: d, height: d, radius: theme.radius.round, background: colorOf(theme, scheme, read(props.color)), shrink: 0 };
      })}
    />
  );
  return (
    <View {...pass(props)} style={style}>
      {() => (read(props.variant) === 'dot' ? dot() : null)}
      {props.start}
      {textual(props.children) ? <Label text={() => String(read(props.children) ?? '')} /> : props.children}
      {props.end}
    </View>
  );
}

/**
 * An icon on a colored square: `variant` (solid by default, soft,
 * outline, neutral, ghost, plain, inverse, gradient with `gradient`
 * { colors, angle }), `color`, `size` (xs to xl, the theme's `sizes.iconBox`, or
 * pixels), `radius`.
 * @param {Record<string, any>} props
 */
export function IconBox(props) {
  const style = styled(props, (theme, scheme) => {
    const size = read(props.size);
    const s = sized(theme.sizes.iconBox, size, 'md');
    const c = colorsOf(theme, scheme, props, 'solid');
    return {
      align: 'center',
      justify: 'center',
      width: s,
      height: s,
      minWidth: s,
      shrink: 0,
      radius: radiusOf(theme, read(props.radius)),
      background: c.background,
      color: c.color,
      border: 1,
      borderColor: c.border,
    };
  });
  return (
    <View {...pass(props)} style={style}>
      {textual(props.children) ? <Label text={props.children} /> : props.children}
    </View>
  );
}

/**
 * A color sample: `color` (any theme color or hex), `size` (`theme.sizes.box.swatch`, 24, by default),
 * `radius` (sm by default), an inner edge in the page's rule color,
 * `shadowed` (a small shadow; false by default), children centered over it
 * (a check mark). With `onPress` it is a button: focusable, pressed by
 * pointer and by Enter or Space, named by `label` (its color by default).
 * @param {Record<string, any>} props
 */
export function Swatch(props) {
  const style = styled(props, (theme, scheme) => {
    const s = read(props.size) ?? theme.sizes.box.swatch;
    return {
      align: 'center',
      justify: 'center',
      width: s,
      height: s,
      minWidth: s,
      padding: 0,
      shrink: 0,
      radius: radiusOf(theme, read(props.radius) ?? 'sm'),
      background: colorOf(theme, scheme, read(props.color)),
      border: 1,
      borderColor: pageColors(theme, scheme).rule,
      ...(read(props.shadowed) === true ? { shadow: shadowOf(theme, 'xs') } : null),
      ...(pressOf(props) ? { cursor: 'pointer' } : null),
    };
  });
  const press = pressOf(props);
  if (press == null)
    return (
      <View {...pass(props)} style={style}>
        {props.children}
      </View>
    );
  return (
    <Action ref={props.ref} label={() => read(props.label) ?? String(read(props.color) ?? 'color')} {...marks(props)} onPress={press} style={style}>
      {props.children}
    </Action>
  );
}

/** A keyboard key: `size` (xs to xl, xs by default) sets its font; on the page's sunken ground with a rule border and a 2 px bottom lip in the edge color. @param {Record<string, any>} props */
export function Key(props) {
  const style = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    return {
      fontSize: sized(theme.fontSizes, read(props.size), 'xs'),
      fontWeight: theme.weights.strong,
      lineHeight: theme.lineHeights.md,
      padding: [1, theme.spacing.xs / 2],
      radius: theme.radius.sm,
      border: 1,
      borderBottom: 2,
      borderColor: page.rule,
      borderBottomColor: page.edge,
      background: page.sunken,
      color: page.text,
      self: 'start',
      shrink: 0,
    };
  });
  return <Label {...pass(props)} text={props.children} style={style} />;
}
