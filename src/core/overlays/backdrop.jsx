// Backdrop and Busy: a color or a gradient over the parent (or, fixed,
// over the viewport), on the portable placement (position absolute or
// fixed, inset 0, a layer).

import { View, Show, read } from 'ren-core';
import { styled } from '../../theme/style.js';
import { colorOf, pageColors, radiusOf } from '../../theme/resolve.js';
import { alpha } from '../../theme/colors.js';
import { Loader } from '../feedback/loader.jsx';
import { gradientOf } from '../buttons/gradient.js';
import { LAYERS } from '../../theme/layers.js';
import { $presence, timingOf, partOf, shadeColor, shadeOpacity } from './shared.jsx';
import { DECOR } from '../../theme/meaning.js';

/**
 * The Backdrop's `gradient` as the portable style's: a portable gradient
 * ({ linear, stops } or { radial, stops }) as it is, or { colors,
 * angle }.
 * @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {'light' | 'dark'} scheme @param {any} g
 */
const backdropOf = (theme, scheme, g) => (Array.isArray(g?.stops) ? g : gradientOf(theme, scheme, g));

/**
 * A gradient with its stops' alpha multiplied by `k` (a Backdrop's
 * `opacity`, meaning the same over a gradient as over a color).
 * @param {{ stops: [number, string][] } & Record<string, any>} g @param {number} k
 */
const fadedOf = (g, k) => ({ ...g, stops: g.stops.map(([at, color]) => /** @type {[number, string]} */ ([at, alpha(color, k)])) });

/**
 * A color over its parent (`position: 'absolute'`, `inset: 0`): `color`
 * (the dark page's sunken ground), `opacity` (the theme's `opacity.disabled`; `opacity.muted` in the dark scheme), `gradient` (in
 * place of the color: a portable gradient, { linear: 160, stops: [[0,
 * '#101218e6'], [1, '#10121800']] }, or { colors, angle }), `layer`
 * (`LAYERS.sheet`: under the sheet it shades), `radius`, `center`
 * (centers its children), `fixed` (over the whole viewport: `position:
 * fixed`), `onPress`. `opacity` fades the color or the gradient's stops,
 * never the children.
 * @param {Record<string, any>} props
 */
export function Backdrop(props) {
  // `opacity` is the shade's, not the style prop that would fade the whole View again.
  const { opacity: _shade, ...own } = props;
  const style = styled(own, (theme, scheme) => ({
    position: read(props.fixed) ? 'fixed' : 'absolute',
    inset: 0,
    zIndex: read(props.layer) ?? LAYERS.sheet,
    background:
      read(props.gradient) != null
        ? read(props.opacity) != null
          ? fadedOf(backdropOf(theme, scheme, read(props.gradient)), Number(read(props.opacity)))
          : backdropOf(theme, scheme, read(props.gradient))
        : alpha(colorOf(theme, scheme, read(props.color) ?? shadeColor(theme)), read(props.opacity) ?? shadeOpacity(theme, scheme)),
    ...(read(props.radius) != null ? { radius: radiusOf(theme, read(props.radius)) } : null),
    ...(read(props.center) ? { align: 'center', justify: 'center' } : null),
  }));
  return (
    <View ref={props.ref} {...(props.children === undefined ? DECOR : null)} onPress={props.onPress} onPointerDown={props.onPointerDown} style={style}>
      {props.children}
    </View>
  );
}

/**
 * A loader over its parent while `shown`: `layer` (`LAYERS.raised`,
 * over its own container), `backdrop` (its options: `color`, `opacity`,
 * `radius`; the body color at the theme's `opacity.muted` by default;
 * `false` for none), `loader` (the
 * Loader's props), `motion` ('quick'; a preset's name or `{ duration,
 * exit, easing }`). It means a `status` named 'Loading'; its backdrop is
 * decoration.
 * @param {Record<string, any>} props
 */
export function Busy(props) {
  const presence = $presence(
    () => read(props.shown) === true,
    () => timingOf(read(props.motion), 'quick'),
  );
  const style = styled(props, () => ({
    position: 'absolute',
    inset: 0,
    zIndex: read(props.layer) ?? LAYERS.raised,
    align: 'center',
    justify: 'center',
    opacity: presence.t(),
  }));
  const backdrop = () => partOf(read(props.backdrop));
  return (
    <Show when={presence.mounted}>
      <View role="status" aria-label="Loading" style={style}>
        {() => {
          const b = backdrop();
          return b === null ? null : b.node !== undefined ? b.node : <BusyBackdrop {...b} />;
        }}
        <View style={{ zIndex: 1 }}>
          <Loader aria-hidden="true" {...(read(props.loader) ?? {})} />
        </View>
      </View>
    </Show>
  );
}

/** Busy's backdrop: the body color, translucent. @param {Record<string, any>} props */
function BusyBackdrop(props) {
  // `opacity` is the shade's, as Backdrop's: never the style prop that would fade the View again.
  const { opacity: _shade, ...own } = props;
  const style = styled(own, (theme, scheme) => ({
    position: 'absolute',
    inset: 0,
    background: alpha(read(props.color) != null ? colorOf(theme, scheme, read(props.color)) : pageColors(theme, scheme).body, read(props.opacity) ?? theme.opacity.muted),
    ...(read(props.radius) != null ? { radius: radiusOf(theme, read(props.radius)) } : null),
  }));
  return <View {...DECOR} style={style} />;
}
