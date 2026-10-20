// The style of a component, as one binding: the component's own style (from
// the theme and its props), then the style props, then the caller's
// `style` (an object or an accessor of one). Read inside the binding, so a new
// theme, scheme or prop value restyles in place.

import { read, $context, $lookup } from 'ren-core';
import { $ui } from './theme.jsx';
import { styleProps, keepOwnSides } from './resolve.js';

/**
 * Text that does not wrap under it, as CSS's inherited `white-space:
 * nowrap` (VisuallyHidden's): a style that says `wrap: true` keeps to one
 * line. The portable `wrap` is each item's own, so the components' styles
 * read it here.
 */
export const Nowrap = $context(false);

/**
 * @param {Record<string, any>} props the component's props
 * @param {(theme: import('./theme.jsx').RuiThemeValue, scheme: import('./theme.jsx').Scheme) => Record<string, any>} [own] the component's style
 * @returns {() => Record<string, any>}
 */
export function styled(props, own) {
  const ui = $ui();
  const nowrap = $lookup(Nowrap) === true;
  return () => {
    const theme = ui.theme();
    const scheme = ui.scheme();
    const mine = own === undefined ? null : own(theme, scheme);
    // Pressed (an `onPress`), it shows the theme's hand, unless its own style names a cursor (null: none).
    const hand = props.onPress != null && (mine === null || !('cursor' in mine)) ? pressLook(theme) : null;
    // A side the style props leave out keeps the component's own (py="xs" keeps its side padding).
    const style = { ...hand, ...mine, ...keepOwnSides(mine, styleProps(theme, scheme, props), props), ...read(props.style) };
    if (nowrap && style.wrap === true) style.wrap = false;
    return style;
  };
}

/**
 * The pointer's cursor over what presses, from the theme: `cursor.press` (a hand), or `cursor.disabled` while it
 * takes no press (`off`); nothing when the theme's is null, so the renderer's own shows.
 * @param {import('./theme.jsx').RuiThemeValue} theme @param {boolean} [off]
 * @returns {{ cursor?: string }}
 */
export function pressLook(theme, off = false) {
  const cursor = off ? theme.cursor.disabled : theme.cursor.press;
  return cursor == null ? {} : { cursor };
}
