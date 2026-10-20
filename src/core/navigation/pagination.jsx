// Pagination: page controls with gaps, the pages around the current one
// and the ends (`$pages`' `pageItems`), previous and next controls, optional first and
// last, and the arrow keys, Home and End while a control has focus.

import { Action, View, For, Show, read } from 'ren-core';
import { styled, pressLook } from '../../theme/style.js';
import { $ui } from '../../theme/theme.jsx';
import { variantColors, radiusOf, pageColors, sized, spacing } from '../../theme/resolve.js';
import { pass } from '../layout/layout.jsx';
import { ChevronIcon, DotsIcon } from '../buttons/icons.jsx';
import { $navValue } from './state.js';
import { pageItems } from '../../hooks/state.js';
import { DECOR, flag } from '../../theme/meaning.js';
import { labelsIn } from '../../theme/labels.js';

/**
 * Page controls: `total` pages, `value` (a value, an accessor or a signal)
 * or `defaultValue` (1), `onChange(page)`, `around` (1: the pages shown
 * on each side of the current one), `ends` (1), `controls` (true:
 * previous and next), `edges` (first and last), `size` (xs to xl: a control's side the
 * theme's `sizes.pagination`, or px),
 * `radius`, `color` (the current page's wash and underline), `gap` (half of spacing xs; px or a spacing step), `disabled`,
 * `single` (true: shown with a single page too; false hides it then).
 * The controls are ghosts: no ground or edge until the pointer is over
 * one; the current page wears a soft wash of the color with a tone
 * underline. It means a navigation of buttons, the current page
 * `aria-current` 'page'.
 * @param {Record<string, any>} props
 */
export function Pagination(props) {
  const ui = $ui();
  const page = $navValue(props, 1);
  const total = () => Math.max(0, Math.floor(Number(read(props.total) ?? 0)));
  const current = () => Math.min(Math.max(1, page.get()), Math.max(1, total()));
  const disabled = () => read(props.disabled) === true;
  const go = (/** @type {number} */ to) => {
    const next = Math.min(Math.max(1, to), Math.max(1, total()));
    if (!disabled() && next !== current()) page.set(next);
  };
  const items = () => pageItems(total(), current(), Number(read(props.around) ?? 1), Number(read(props.ends) ?? 1));
  const side = () => {
    const s = read(props.size);
    return sized(ui.theme().sizes.pagination, s, 'md');
  };
  /**
   * A control's style: ghost (no ground, no edge; the page's hover under
   * the pointer); the current page a soft wash of `color` with its text in
   * the deep shade, strong, and a tone underline (`sizes.divider` md), its
   * corner rounding the top only.
   * @param {() => boolean} on @param {() => boolean} off
   */
  const control = (on, off) => () => {
    const theme = ui.theme();
    const scheme = ui.scheme();
    const own = pageColors(theme, scheme);
    const s = side();
    const base = {
      height: s,
      minWidth: s,
      padding: [0, Math.round(s * theme.ratios.inset)],
      radius: radiusOf(theme, read(props.radius)),
      fontSize: sized(theme.fontSizes, typeof read(props.size) === 'string' ? read(props.size) : 'md'),
      border: 0,
      background: 'transparent',
      align: 'center',
      justify: 'center',
      textAlign: 'center',
    };
    if (on()) {
      const wash = variantColors(theme, scheme, 'soft', read(props.color));
      const tone = variantColors(theme, scheme, 'solid', read(props.color)).background;
      const r = base.radius;
      // Square under the underline: the corner rounds the top only.
      return { ...base, radius: [r, r, 0, 0], background: wash.background, color: wash.color, borderBottom: theme.sizes.divider.md, borderColor: tone, fontWeight: theme.weights.strong, ...pressLook(theme) };
    }
    const muted = off() || disabled();
    return {
      ...base,
      color: own.text,
      ...pressLook(theme, muted),
      ...(muted ? { opacity: theme.opacity.disabled } : { hover: { background: own.hover } }),
    };
  };
  const keys = (/** @type {{ key: string, preventDefault?: () => void }} */ e) => {
    const k = e.key;
    const to = k === 'ArrowRight' ? current() + 1 : k === 'ArrowLeft' ? current() - 1 : k === 'Home' ? 1 : k === 'End' ? total() : 0;
    if (to === 0) return;
    e.preventDefault?.();
    go(to);
  };
  const style = styled(props, theme => ({ direction: 'row', wrap: true, align: 'center', gap: spacing(theme, read(props.gap) ?? theme.spacing.xs / 2) }));
  const ink = () => pageColors(ui.theme(), ui.scheme()).text;
  const icon = () => Math.round(side() / 2);
  /** An arrow control. @param {() => string} label @param {number} rotate @param {boolean} edge @param {() => number} to @param {() => boolean} off */
  const arrow = (label, rotate, edge, to, off) => (
    <Action label={label} aria-disabled={flag(() => off() || disabled())} onPress={() => go(to())} style={/** @type {any} */ (control(() => false, off))}>
      <ChevronIcon size={icon} rotate={rotate} edge={edge} color={ink} />
    </Action>
  );
  const first = () => current() <= 1;
  const last = () => current() >= total();
  return (
    <Show when={() => !(read(props.single) === false && total() <= 1)}>
      <View role="navigation" aria-label={() => labelsIn().pagination} {...pass(props)} onKey={keys} style={style}>
        {read(props.edges) ? arrow(() => labelsIn().firstPage, 90, true, () => 1, first) : null}
        {read(props.controls) === false ? null : arrow(() => labelsIn().previousPage, 90, false, () => current() - 1, first)}
        <For by="position" each={items}>
          {item => (
            <Show
              when={() => item() === 'gap'}
              fallback={
                <Action
                  text={() => String(item())}
                  aria-current={() => (item() === current() ? 'page' : undefined)}
                  aria-disabled={flag(disabled)}
                  onPress={() => go(/** @type {number} */ (item()))}
                  style={/** @type {any} */ (control(() => item() === current(), () => false))}
                />
              }
            >
              <View {...DECOR} style={() => ({ width: side(), height: side(), align: 'center', justify: 'center' })}>
                <DotsIcon size={icon} color={ink} />
              </View>
            </Show>
          )}
        </For>
        {read(props.controls) === false ? null : arrow(() => labelsIn().nextPage, -90, false, () => current() + 1, last)}
        {read(props.edges) ? arrow(() => labelsIn().lastPage, -90, true, () => total(), last) : null}
      </View>
    </Show>
  );
}
