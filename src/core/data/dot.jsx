// Dot: a small mark (a dot, or a labeled pill) over a point of its child's
// box. The point is a pair of fractions of that box; the mark is centered on
// it, then drawn in toward the middle by `offset`.

import { View, Label, read } from 'ren-core';
import { styled } from '../../theme/style.js';
import { colorOf, pageColors, radiusOf, sized } from '../../theme/resolve.js';
import { LAYERS } from '../../theme/layers.js';
import { pass } from '../layout/layout.jsx';
import { markOn } from '../inputs/shared.js';

/** A fraction held within 0..1; anything not a number takes `fallback`. @param {any} v @param {number} fallback */
const fraction = (v, fallback) => (typeof v === 'number' && !Number.isNaN(v) ? Math.min(1, Math.max(0, v)) : fallback);

/**
 * The point a mark sits on: `anchor` `{ x, y }` as fractions of the box
 * (x from the start edge, y from the top), `{ x: 1, y: 0 }` by default, a
 * missing key taking the default's value and each clamped to 0..1.
 * @param {any} anchor @returns {{ x: number, y: number }}
 */
export function anchorOf(anchor) {
  return { x: fraction(anchor?.x, 1), y: fraction(anchor?.y, 0) };
}

/**
 * A mark over a point of its child's box: `anchor` `{ x, y }` (fractions of
 * the box from 0 to 1: x from the start edge, y from the top; the top end
 * corner, `{ x: 1, y: 0 }`, by default), `offset` (px, 0: moves the mark's
 * center toward the box's middle by `offset × (1 − 2x)` and
 * `offset × (1 − 2y)`, so a corner mark moves in on both axes and an edge's
 * midpoint only across it; negative moves out), `size` (a
 * `theme.sizes.indicator` step or px; xs, 8 px), `label` (text or a number:
 * a pill one line of xs text high, a circle for one figure, wider for
 * more, its ink by the theme's contrast rule on the fill), `color` (the
 * accent by default), `bordered` (a `sizes.divider.xs` ring in the page's
 * `raised` color, inside the mark's side), `shown` (true; false hides the
 * mark, the child stays), `inline` (sizes to the child instead of
 * stretching), `radius` (round), `layer` (`LAYERS.raised`).
 * @param {Record<string, any>} props
 */
export function Dot(props) {
  const labeled = () => {
    const label = read(props.label);
    return label != null && label !== false && label !== '';
  };
  const wrapper = styled(props, () => ({ position: 'relative', ...(read(props.inline) ? { self: 'start' } : null) }));
  // The point: a box of no size at the anchor, shifted by the offset. The
  // mark is centered on it, so its center is the point whatever its size.
  const point = styled({}, () => {
    const { x, y } = anchorOf(read(props.anchor));
    const offset = Number(read(props.offset) ?? 0);
    return {
      position: 'absolute',
      left: `${x * 100}%`,
      top: `${y * 100}%`,
      width: 0,
      height: 0,
      margin: [offset * (1 - 2 * y), 0, 0, offset * (1 - 2 * x)],
      align: 'center',
      justify: 'center',
      overflow: 'visible',
      zIndex: read(props.layer) ?? LAYERS.raised,
    };
  });
  const mark = styled({}, (theme, scheme) => {
    const side = sized(theme.sizes.indicator, read(props.size), 'xs');
    const fill = colorOf(theme, scheme, read(props.color));
    const ring = read(props.bordered) === true ? { border: theme.sizes.divider.xs, borderColor: pageColors(theme, scheme).raised } : { border: 0 };
    const shape = { radius: radiusOf(theme, read(props.radius) ?? 'round'), background: fill, shrink: 0, ...ring };
    if (!labeled()) return { width: side, height: side, ...shape };
    const line = Math.max(side, theme.fontSizes.xs * theme.lineHeights.sm);
    return {
      ...shape,
      height: line,
      minWidth: line,
      direction: 'row',
      align: 'center',
      justify: 'center',
      padding: [0, theme.spacing.xs / 2],
      color: markOn(theme, scheme, undefined, fill),
      fontSize: theme.fontSizes.xs,
      fontWeight: theme.weights.strong,
      lineHeight: 1,
      wrap: false,
    };
  });
  return (
    <View {...pass(props)} style={wrapper}>
      {props.children}
      {() =>
        read(props.shown) === false ? null : (
          <View style={point}>
            <View style={mark}>{() => (labeled() ? <Label text={() => String(read(props.label))} /> : null)}</View>
          </View>
        )
      }
    </View>
  );
}
