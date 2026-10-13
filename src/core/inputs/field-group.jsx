// FieldGroup: a bordered group of fields with a legend on its top border,
// placed there with the portable absolute positioning and painted over the
// border with the group's own background.

import { View, Label, Show, read } from 'ren-core';
import { styled } from '../../theme/style.js';
import { radiusOf, sized, pageColors } from '../../theme/resolve.js';
import { $ui } from '../../theme/theme.jsx';
import { DECOR } from '../../theme/meaning.js';

/** The group's background and border in a variant. @param {any} theme @param {'light' | 'dark'} scheme @param {string} variant */
function colors(theme, scheme, variant) {
  if (variant === 'bare') return { background: 'transparent', border: 'transparent' };
  const page = pageColors(theme, scheme);
  return { background: variant === 'soft' ? page.sunken : page.field, border: page.rule };
}

/**
 * A group of fields: `legend`, `variant` (outline, soft, bare), `radius`,
 * `disabled` (dims it; the fields inside take their own `disabled`). It
 * means a `group` named by its legend.
 * @param {Record<string, any>} props
 */
export function FieldGroup(props) {
  const ui = $ui();
  const variant = () => read(props.variant) ?? 'outline';
  const legend = () => read(props.legend);
  const style = styled(props, (theme, scheme) => {
    const c = colors(theme, scheme, variant());
    const bare = variant() === 'bare';
    const pad = theme.spacing.lg;
    return {
      direction: 'column',
      padding: bare ? [legend() != null ? sized(theme.fontSizes, 'sm') * theme.lineHeights.md : 0, 0, 0, 0] : [pad, pad, pad, pad],
      // Room for the legend's upper half: it straddles the top border.
      margin: [legend() != null && !bare ? (sized(theme.fontSizes, 'sm') * theme.lineHeights.md) / 2 : 0, 0, 0, 0],
      radius: radiusOf(theme, read(props.radius)),
      border: bare ? 0 : 1,
      borderColor: c.border,
      background: c.background,
      color: pageColors(theme, scheme).text,
      ...(read(props.disabled) === true ? { opacity: theme.opacity.disabled } : null),
    };
  });
  /** @returns {Record<string, any>} */
  const legendStyle = () => {
    const theme = ui.theme();
    const scheme = ui.scheme();
    const fz = sized(theme.fontSizes, 'sm');
    const bare = variant() === 'bare';
    return {
      position: 'absolute',
      top: bare ? 0 : -Math.round((fz * theme.lineHeights.md) / 2) - 1,
      left: bare ? 0 : theme.spacing.sm,
      padding: bare ? 0 : [0, theme.spacing.xs / 2],
      fontSize: fz,
      fontWeight: theme.weights.strong,
      lineHeight: theme.lineHeights.md,
      background: colors(theme, scheme, variant()).background,
    };
  };
  return (
    <View ref={props.ref} role="group" aria-label={() => (legend() == null ? undefined : String(legend()))} style={style}>
      <Show when={() => legend() != null}>
        <View {...DECOR} style={legendStyle}>
          <Label text={() => String(legend())} />
        </View>
      </Show>
      {props.children}
    </View>
  );
}
