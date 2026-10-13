// Layout: Box, Surface, Stack, Row, Flex, Center, Container, Tiles and
// Spacer, on the portable View (flexbox and grid on every renderer).

import { View, For, read, $parts } from 'ren-core';
import { styled } from '../../theme/style.js';
import { flexWord, spacing, radiusOf, shadowOf, pageColors, sized } from '../../theme/resolve.js';
import { $breakpoints } from '../../theme/breakpoints.js';

/**
 * The events and references a View takes, its place in the focus
 * (`tabIndex`), and what it means (ren-core's `Meaning`: an ARIA role, a
 * link, microdata), passed on as they are.
 */
const PASSED = ['ref', 'tabIndex', 'onPress', 'onKey', 'onPointerDown', 'onPointerMove', 'onPointerUp', 'onPointerCancel', 'onPointerEnter', 'onPointerLeave', 'onWheel', 'label', 'hidden', 'role', 'href', 'itemscope', 'itemtype', 'itemprop', 'itemref', 'id', 'content', 'datetime'];

/**
 * The props of `PASSED`, and the `aria-*` and `data-*` props a caller set
 * (as a Box passes them).
 * @param {Record<string, any>} props
 */
export const pass = props => {
  // Only what the caller set: an undefined `label` would still write an
  // empty aria-label, and an undefined `hidden` a display.
  /** @type {Record<string, any>} */
  const out = {};
  for (const name of PASSED) if (props[name] !== undefined) out[name] = props[name];
  for (const name in props) if ((name.startsWith('aria-') || name.startsWith('data-')) && props[name] !== undefined) out[name] = props[name];
  return out;
};

/**
 * `pass` without `label`, for a component whose `label` is text it shows
 * (a ring's middle), not its name.
 * @param {Record<string, any>} props
 */
export const unlabeled = props => {
  const out = pass(props);
  delete out.label;
  return out;
};

/** The base component: a View with style props. @param {Record<string, any>} props */
export function Box(props) {
  return (
    <View {...pass(props)} style={styled(props)}>
      {props.children}
    </View>
  );
}

/** A surface: the page's background, a radius, an optional border and shadow. @param {Record<string, any>} props */
export function Surface(props) {
  const style = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    return {
      background: page.body,
      color: page.text,
      radius: radiusOf(theme, read(props.radius)),
      shadow: shadowOf(theme, read(props.shadow)),
      ...(read(props.bordered) ? { border: 1, borderColor: page.border } : null),
    };
  });
  return (
    <View {...pass(props)} style={style}>
      {props.children}
    </View>
  );
}

/** Children in a column. @param {Record<string, any>} props */
export function Stack(props) {
  const style = styled(props, theme => ({
    direction: 'column',
    gap: spacing(theme, read(props.gap)),
    align: flexWord(read(props.align)) ?? 'stretch',
    justify: flexWord(read(props.justify)) ?? 'start',
  }));
  return (
    <View {...pass(props)} style={style}>
      {props.children}
    </View>
  );
}

/**
 * Children in a row: `wrap` (true by default: they wrap onto more rows;
 * false keeps one row), `gap`, `align` and `justify` (rui's words: start,
 * center, end, stretch; between, around, evenly), `fill` (each child as
 * rendered takes an equal share of the row: each of a `For`'s items or an
 * accessor's parts; a `Show` showing nothing takes none).
 * @param {Record<string, any>} props
 */
export function Row(props) {
  const style = styled(props, theme => ({
    direction: 'row',
    wrap: read(props.wrap) !== false,
    gap: spacing(theme, read(props.gap)),
    align: flexWord(read(props.align)) ?? 'center',
    justify: flexWord(read(props.justify)) ?? 'start',
  }));
  const fill = () => read(props.fill) === true;
  const children = props.children;
  return (
    <View {...pass(props)} style={style}>
      {() => (fill() ? <Shares>{children}</Shares> : children)}
    </View>
  );
}

/** Each child as rendered in an equal share of the row. @param {{ children?: any }} props */
function Shares(props) {
  return <For each={$parts(props.children)}>{part => <View style={{ grow: 1, width: 0, minWidth: 0 }}>{part}</View>}</For>;
}

/**
 * Flexbox with its every property as a prop: `direction` (row or column),
 * `wrap` (false by default; true wraps), `gap`, `rowGap`, `columnGap`,
 * `align` and `justify` (rui's words: start, center, end, stretch;
 * between, around, evenly).
 * @param {Record<string, any>} props
 */
export function Flex(props) {
  const style = styled(props, theme => {
    const gap = read(props.gap);
    return {
      direction: read(props.direction) === 'row' || read(props.direction) == null ? 'row' : 'column',
      wrap: read(props.wrap) === true,
      ...(gap == null ? null : { gap: spacing(theme, gap) }),
      ...(read(props.rowGap) == null ? null : { rowGap: spacing(theme, read(props.rowGap)) }),
      ...(read(props.columnGap) == null ? null : { columnGap: spacing(theme, read(props.columnGap)) }),
      align: flexWord(read(props.align)) ?? 'stretch',
      justify: flexWord(read(props.justify)) ?? 'start',
    };
  });
  return (
    <View {...pass(props)} style={style}>
      {props.children}
    </View>
  );
}

/** Centers its content both ways. @param {Record<string, any>} props */
export function Center(props) {
  return (
    <View {...pass(props)} style={styled(props, () => ({ direction: read(props.inline) ? 'row' : 'column', align: 'center', justify: 'center' }))}>
      {props.children}
    </View>
  );
}

/**
 * Centers content at a readable width: `size` (xs to xl, the theme's
 * `sizes.container`, or px); `fluid` takes the full width.
 * @param {Record<string, any>} props
 */
export function Container(props) {
  const style = styled(props, theme => {
    const size = read(props.size);
    return {
      width: '100%',
      self: 'center',
      padding: [0, theme.spacing.md],
      ...(read(props.fluid) ? null : { maxWidth: sized(theme.sizes.container, size, 'md') }),
    };
  });
  return (
    <View {...pass(props)} style={style}>
      {props.children}
    </View>
  );
}

/**
 * Equal columns: `columns` of them, `gap` between columns and
 * `rowGap` between rows; each may be responsive (`{ base: 1, md: 3,
 * xl: 4 }`, from the theme's breakpoint up).
 * @param {Record<string, any>} props
 */
export function Tiles(props) {
  const bp = $breakpoints();
  const style = styled(props, theme => {
    const gap = spacing(theme, bp.at(read(props.gap), theme));
    const vertical = bp.at(read(props.rowGap), theme);
    return {
      display: 'grid',
      columns: `repeat(${bp.at(read(props.columns), theme) ?? 1}, minmax(0, 1fr))`,
      columnGap: gap,
      rowGap: vertical == null ? gap : spacing(theme, vertical),
    };
  });
  return (
    <View {...pass(props)} style={style}>
      {props.children}
    </View>
  );
}

/** Empty space: `w` wide or `h` high (scale steps or pixels). @param {Record<string, any>} props */
export function Spacer(props) {
  const style = styled({}, theme => {
    const w = read(props.w);
    const h = read(props.h);
    return { width: w == null ? 0 : spacing(theme, w), height: h == null ? 0 : spacing(theme, h), shrink: 0 };
  });
  return <View style={style} />;
}
