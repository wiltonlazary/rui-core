// Grid (and Grid.Col) and AspectRatio, on the portable View: a
// 12-column grid as a wrapping flex row of percent widths with gutters;
// `gap`, `span`, `offset` and `order` take the responsive object
// form (`{ base: 12, sm: 6, lg: 3 }`) against the root's viewport.

import { View, read } from 'ren-core';
import { styled } from '../../theme/style.js';
import { spacing, flexWord } from '../../theme/resolve.js';
import { pass } from './layout.jsx';
import { $ui } from '../../theme/theme.jsx';
import { $breakpoints } from '../../theme/breakpoints.js';
import { parts, isPart, flat } from '../data/parts.jsx';

/**
 * A grid of `columns` (12) columns: `gap` (lg; scale steps or pixels),
 * `fill` (each row's columns share out what its spans leave, as a Row's
 * `fill` makes its children fill it), `justify`, `align`. Children
 * are Grid.Col: `span` (a number of columns, or 'auto': as wide as its
 * content),
 * `offset` (columns left empty before), `order`. `gap`, `span`,
 * `offset` and `order` may be responsive: `{ base, xs, sm, md, lg, xl }`,
 * each from the theme's breakpoint up (min-width).
 * @param {Record<string, any>} props
 */
export function Grid(props) {
  const bp = $breakpoints();
  const ui = $ui();
  const gutter = styled({}, theme => ({ g: spacing(theme, bp.at(read(props.gap), theme), 'lg') }));
  const style = styled(props, () => ({ direction: 'column' }));
  const inner = () => {
    const g = Number(gutter().g);
    return {
      direction: /** @type {const} */ ('row'),
      wrap: true,
      margin: -g / 2,
      justify: /** @type {any} */ (flexWord(read(props.justify)) ?? 'start'),
      align: /** @type {any} */ (flexWord(read(props.align)) ?? 'stretch'),
    };
  };
  const cols = () => {
    const list = flat(props.children);
    const ordered = list.some(c => isPart(c, GridCol) && c.props.order != null)
      ? list
          .map((c, i) => ({ c, i, o: isPart(c, GridCol) ? (bp.at(read(c.props.order), ui.theme()) ?? 0) : 0 }))
          .sort((a, b) => a.o - b.o || a.i - b.i)
          .map(x => x.c)
      : list;
    return parts(ordered, GridCol, () => ({ __grid: props, __gutter: gutter }));
  };
  return (
    <View {...pass(props)} style={style}>
      <View style={inner}>{cols}</View>
    </View>
  );
}

/** A percent of the row. @param {number} n @param {number} of @returns {any} */
const percent = (n, of) => `${Math.round((n / of) * 1e6) / 1e4}%`;

/** A column of a Grid: `span`, `offset`, `order`. @param {Record<string, any>} props */
function GridCol(props) {
  const grid = props.__grid ?? {};
  const gutter = props.__gutter ?? (() => ({ g: 16 }));
  const columns = () => read(grid.columns) ?? 12;
  const bp = $breakpoints();
  const ui = $ui();
  const style = styled(props, theme => {
    const span = bp.at(read(props.span), theme) ?? 12;
    const g = Number(gutter().g);
    const fill = read(grid.fill) === true;
    /** @type {Record<string, any>} */
    const size =
      span === 'auto' ? { shrink: 0 } : { width: percent(span, columns()), shrink: 0, ...(fill ? { grow: 1 } : null) };
    return { direction: 'column', padding: g / 2, minWidth: 0, ...size };
  });
  const offset = () => {
    const o = bp.at(read(props.offset), ui.theme()) ?? 0;
    return o > 0 ? <View style={() => ({ width: percent(o, columns()), shrink: 0 })} /> : null;
  };
  return [
    offset,
    <View {...pass(props)} style={style}>
      {props.children}
    </View>,
  ];
}
Grid.Col = GridCol;

/**
 * Content at a fixed `ratio` (width over height, 1 by default): the
 * style's `aspectRatio`, so its height follows its width on every resize.
 * @param {Record<string, any>} props
 */
export function AspectRatio(props) {
  const style = styled(props, () => ({ position: 'relative', overflow: 'hidden', aspectRatio: Number(read(props.ratio) ?? 1) || 1 }));
  return (
    <View {...pass(props)} style={style}>
      <View style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>{props.children}</View>
    </View>
  );
}
