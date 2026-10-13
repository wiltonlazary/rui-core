// IconButton, CloseButton and the joined groups (IconButton.Group,
// Button.Group and its Button.Addon), on the portable Action: a square press area holding an
// icon, with focus and keyboard activation on every renderer.

import { Action, Label, Show, View, read, $lookup } from 'ren-core';
import { styled } from '../../theme/style.js';
import { radiusOf, pageColors, sized } from '../../theme/resolve.js';
import { $ui } from '../../theme/theme.jsx';
import { Loader } from '../feedback/loader.jsx';
import { CloseIcon, inkOf } from './icons.jsx';
import { JoinedGroup, $joined, joinedStyle, unjoined } from './joined.jsx';
import { pressOf, colorsOf, buttonBox } from './button.jsx';
import { flag, marks, TriggerMeaning } from '../../theme/meaning.js';

/**
 * A square side: pixels, a step of the theme's `sizes.icon`, or with `field` the height of
 * a field (and a button) at that step, the theme's `sizes.control`.
 * @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {Record<string, any>} props @param {string} fallback
 * @returns {number}
 */
const square = (theme, props, fallback) => {
  const size = read(props.size);
  if (typeof size === 'number') return size;
  const steps = /** @type {Record<string, number>} */ (read(props.field) === true ? theme.sizes.control : theme.sizes.icon);
  return steps[size ?? fallback] ?? steps[fallback];
};

/**
 * A square button holding an icon: `variant` (solid by default, soft,
 * outline, ghost, neutral, plain, inverse, gradient with `gradient`
 * { colors, angle }), `color`, `size` (xs to xl, or px), `field` (as tall
 * as a field of that size), `radius`, `disabled`, `loading` (a Loader in place of the icon,
 * `theme.ratios.icon` of the side;
 * presses ignored), `label` (the accessible name), `onPress`. In an
 * IconButton.Group it draws no border and no radius (the group's frame
 * draws them).
 * @param {Record<string, any>} props
 */
export function IconButton(props) {
  const ui = $ui();
  const joined = $joined();
  const size = () => square(ui.theme(), props, 'md');
  const colors = () => colorsOf(ui.theme(), ui.scheme(), props, 'solid');
  const style = styled(props, (theme, scheme) => {
    const s = size();
    const page = pageColors(theme, scheme);
    const c = colors();
    const disabled = read(props.disabled) === true;
    const radius = radiusOf(theme, read(props.radius));
    return {
      direction: 'row',
      align: 'center',
      justify: 'center',
      width: s,
      height: s,
      minWidth: s,
      minHeight: s,
      padding: 0,
      shrink: 0,
      radius,
      border: 1,
      ...joinedStyle(joined),
      ...(disabled
        ? { background: page.disabled, color: page.disabledText, borderColor: 'transparent', cursor: 'not-allowed' }
        : { background: c.background, color: c.color, borderColor: c.border, cursor: read(props.loading) ? 'default' : 'pointer', hover: { background: c.hover, color: c.hoverColor ?? c.color } }),
    };
  });
  const press = pressOf(props);
  const onPress = (/** @type {any} */ e) => {
    if (read(props.disabled) || read(props.loading)) return;
    press?.(e);
  };
  return (
    <Action ref={props.ref} label={props.label} {...$lookup(TriggerMeaning)} {...marks(props)} aria-disabled={flag(() => read(props.disabled) || read(props.loading))} onPress={onPress} onKey={props.onKey} style={style}>
      <Show when={() => read(props.loading) === true} fallback={unjoined(props.children)}>
        <Loader size={() => Math.round(size() * ui.theme().ratios.icon)} color={() => colors().color} />
      </Show>
    </Action>
  );
}

/**
 * IconButtons joined in one frame: `orientation` ('horizontal' or
 * 'vertical'), `divider` (the frame's edge and the lines between its
 * children: a `sizes.divider` step or px, 'xs' by default), `radius` (the
 * frame's corners). The frame draws the edge, the lines and the corners
 * in the page's `border` color; its children draw neither. The lines
 * follow the children as rendered (Button.Group's note).
 * @param {Record<string, any>} props
 */
function IconButtonGroup(props) {
  return <JoinedGroup {...props} />;
}
IconButton.Group = IconButtonGroup;

/**
 * A button with a drawn X: `size` (xs to xl, or px), `field` (as tall as
 * a field of that size), `iconSize` (the theme's `sizes.closeIcon` by the size step, or `theme.ratios.icon`
 * of a px or field side), `radius`, `disabled`, `variant`
 * ('ghost' by default, or 'plain'), `color` (the X's; the page's quiet text
 * by default), `label` ('Close' by default), `onPress`; `children` go after
 * the icon.
 * @param {Record<string, any>} props
 */
export function CloseButton(props) {
  const ui = $ui();
  const size = () => square(ui.theme(), props, 'md');
  const ink = () => {
    const theme = ui.theme();
    if (read(props.color) != null) return inkOf(ui, props.color);
    return pageColors(theme, ui.scheme()).quiet;
  };
  const style = styled(props, (theme, scheme) => {
    const s = size();
    const disabled = read(props.disabled) === true;
    const plain = read(props.variant) === 'plain';
    return {
      direction: 'row',
      align: 'center',
      justify: 'center',
      width: s,
      height: s,
      minWidth: s,
      minHeight: s,
      padding: 0,
      shrink: 0,
      border: 0,
      radius: radiusOf(theme, read(props.radius)),
      background: 'transparent',
      color: ink(),
      cursor: disabled ? 'not-allowed' : 'pointer',
      ...(disabled ? { opacity: theme.opacity.disabled } : plain ? null : { hover: { background: pageColors(theme, scheme).hover } }),
    };
  });
  const press = pressOf(props);
  const onPress = (/** @type {any} */ e) => {
    if (read(props.disabled)) return;
    press?.(e);
  };
  const icon = () => {
    const i = read(props.iconSize);
    const s = read(props.size);
    return i ?? (typeof s === 'number' || read(props.field) === true ? Math.round(size() * ui.theme().ratios.icon) : sized(ui.theme().sizes.closeIcon, s, 'md'));
  };
  return (
    <Action ref={props.ref} label={props.label ?? 'Close'} {...$lookup(TriggerMeaning)} {...marks(props)} aria-disabled={flag(props.disabled)} onPress={onPress} style={style}>
      {props.children === undefined ? (
        <CloseIcon size={icon} color={ink} />
      ) : (
        <View style={styled({}, theme => ({ direction: 'row', align: 'center', gap: theme.spacing.xs / 2 }))}>
          <CloseIcon size={icon} color={ink} />
          {props.children}
        </View>
      )}
    </Action>
  );
}

/**
 * Buttons joined in one frame: `orientation` ('horizontal' or
 * 'vertical'), `divider` (the frame's edge and the lines between its
 * children: a `sizes.divider` step or px, 'xs' by default), `radius` (the
 * frame's corners; a child's own radius is ignored). The frame draws the
 * edge, the lines and the corners in the page's `border` color and clips
 * its children to its corners; they draw no border and no radius. The
 * lines follow the children as rendered: a line between two of a `For`'s
 * items or an accessor's parts, none for a `Show` showing nothing.
 * @param {Record<string, any>} props
 */
export function ButtonGroup(props) {
  return <JoinedGroup {...props} />;
}

/**
 * A non-pressable part of a Button.Group:
 * text or content in a button's box, `variant` ('neutral' by default),
 * `color`, `size`, `dense`, `radius` (outside a group).
 * @param {Record<string, any>} props
 */
export function ButtonAddon(props) {
  const joined = $joined();
  const style = styled(props, (theme, scheme) => {
    const box = buttonBox(theme, props);
    const c = colorsOf(theme, scheme, props, 'neutral');
    const radius = radiusOf(theme, read(props.radius));
    return {
      direction: 'row',
      align: 'center',
      justify: 'center',
      height: box.height,
      padding: [0, box.padding],
      radius,
      fontSize: theme.fontSizes[/** @type {'sm'} */ (box.size)] ?? theme.fontSizes.sm,
      fontWeight: theme.weights.strong,
      border: 1,
      background: c.background,
      color: c.color,
      borderColor: c.border,
      ...joinedStyle(joined),
    };
  });
  return <View style={style}>{typeof props.children === 'string' || typeof props.children === 'function' ? <Label text={props.children} /> : unjoined(props.children)}</View>;
}
