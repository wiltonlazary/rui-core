// Table: cells on the portable grid, from parts (Table.Head, Body, Foot,
// Row, Heading, Cell, Caption) or a `data` prop; Table.Scroll scrolls it,
// and a `sticky` table holds the header cells at the top of the Scroll it
// is in.
//
// Columns are sized by their content, as a table's are: the table is one
// grid (`display: 'grid'`, a track per column, 'auto' each: at least its
// widest word, at most its widest line, the table's width left over shared
// among them), and a row is no box of its own: a `display: 'contents'` View
// meaning a `row`, its cells in the table's grid, so every row's cells
// share the columns and ren-json reads rows (records keyed by the column
// headers). A row's look (its line under it, a stripe, the hover
// highlight, its style props) is its cells'; hovering any cell of a row
// highlights the row.
// `fixed` shares the width equally among the columns.

import { View, Label, Scroll, Lazy, read, $write, $context, $lookup, $active, $signal, $read, $untrack, $writable, $owner, $cleanup } from 'ren-core';
import { styled } from '../../theme/style.js';
import { pageColors } from '../../theme/resolve.js';
import { pass } from '../layout/layout.jsx';
import { parts, flat } from '../data/parts.jsx';
import { textual } from '../data/badge.jsx';
import { LAYERS } from '../../theme/layers.js';
import { handOn } from '../ref.js';

/**
 * What the parts of a table share: its props, the number of columns the
 * rows ask for, and the row under the pointer.
 * @typedef {{ props: Record<string, any>, columns: () => number, report: (count: number, widths: ((() => unknown) | undefined)[]) => () => void, widthOf: (column: number) => number | undefined, row: () => string, hovered: () => string | null, hover: (row: string | null) => void }} TableState
 */

const TableContext = $context(/** @type {TableState | null} */ (null));
const SectionContext = $context(/** @type {'head' | 'body' | 'foot'} */ ('body'));
/** The row a cell is in: its key, and its look for the cells to wear. */
const RowContext = $context(/** @type {{ key: string, look: () => Record<string, any> } | null} */ (null));

/** The border color of a table. @param {Record<string, any>} t @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {'light' | 'dark'} scheme */
const lineOf = (t, theme, scheme) => read(t.borderColor) ?? pageColors(theme, scheme).rule;

/** The table around a part. @returns {TableState} */
function tableOf() {
  const t = /** @type {TableState | null} */ ($lookup(TableContext));
  if (t === null) throw new Error('RUI: a Table part outside a Table');
  return t;
}

/** A cell's padding (y, x) by a table's `density`: the theme's `control.density`, 'even' by default. @param {import('../../theme/theme.jsx').RuiThemeValue} theme @param {unknown} density */
export const densityOf = (theme, density) => theme.control.density[/** @type {'even'} */ (density ?? 'even')] ?? theme.control.density.even;

/** A cell's columns: its `span`, 1 by default. @param {any} c */
const spanOf = c => Math.max(1, Math.floor(Number(read(c?.props?.span) ?? 1)) || 1);

/** Which lines a table draws: `lines` ('rows' by default, 'columns', 'both', or false for none). @param {Record<string, any>} t */
const linesOf = t => {
  const l = read(t.lines);
  return { rows: l === undefined || l === 'rows' || l === 'both', columns: l === 'columns' || l === 'both' };
};

/**
 * A table: `striped` (every second body row, from the second), `hoverable`,
 * `bordered`, `lines` ('rows' by default, 'columns', 'both', or false for
 * none), `density` (the cells' padding: 'tight' 4 × 8, 'even' 8 × 12 by
 * default, 'airy' 12 × 16), `sticky` and `stickyOffset` (the header sticky
 * in the Scroll around it), `borderColor`, `stripeColor`, `hoverColor`,
 * `captionAt` ('bottom' or 'top'), `fixed` (equal columns; otherwise
 * columns are sized by their content); or `data` (`{ columns, rows,
 * totals, caption }`: the column titles, the rows of cells, a totals row
 * and a caption) for the whole table. A cell takes `span` and `w`: a
 * one-column cell's number `w` (pixels) sizes its column (at least `w` wide, the widest a
 * row asks, sharing any room left as the other columns do; with `fixed`,
 * `minmax(w, 1fr)`), and the cell stretches across its track, so its row's
 * line runs whole; a spanning cell's `w` is its least width across its
 * columns; a string `w` ('50%') is the cell's own width, as any box's. It means a table (role `table`):
 * its header cells `columnheader` (`rowheader` outside the head), its data
 * cells `cell`, its rows `row` (boxless), its caption `caption`.
 * @param {Record<string, any>} props
 */
export function Table(props) {
  const R = $active();
  // The columns each row now shown asks for: the table has as many as the widest, as rows come and go (data
  // that shrinks, a list of rows). Rows are built, and go, where computations run, so computations may write it.
  // With each, the widths its cells' `w` ask for their columns.
  const asked = $writable($signal(R, /** @type {{ count: number, widths: ((() => unknown) | undefined)[] }[]} */ ([])));
  const hovered = $signal(R, /** @type {string | null} */ (null));
  let made = 0;
  /** @type {TableState} */
  const state = {
    props,
    columns: () => Math.max(1, ...$read(asked).map(a => a.count)),
    widthOf: column => {
      let most = /** @type {number | undefined} */ (undefined);
      // Read here, in the table's style: a `w` that changes (or comes, or goes) moves its column.
      for (const a of $read(asked)) {
        const w = a.widths[column]?.();
        if (typeof w === 'number' && (most === undefined || w > most)) most = w;
      }
      return most;
    },
    report: (count, widths) => {
      const mine = { count, widths };
      $write(asked, [...$untrack(R, () => $read(asked)), mine]);
      return () => $write(asked, $untrack(R, () => $read(asked)).filter(a => a !== mine));
    },
    row: () => `r${++made}`,
    hovered: () => /** @type {string | null} */ ($read(hovered)),
    hover: row => void $write(hovered, row),
  };
  const style = styled(props, (theme, scheme) => {
    const n = state.columns();
    const fixed = read(props.fixed) === true;
    // A cell's `w` sizes its column: at least that wide (the widest a row asks), sharing the rest as the others do.
    const widths = Array.from({ length: n }, (_, i) => state.widthOf(i));
    const tracks = widths.every(w => w === undefined)
      ? fixed ? `repeat(${n}, minmax(0, 1fr))` : `repeat(${n}, auto)`
      : widths.map(w => (w === undefined ? (fixed ? 'minmax(0, 1fr)' : 'auto') : `minmax(${w}px, ${fixed ? '1fr' : 'auto'})`)).join(' ');
    return {
      display: 'grid',
      columns: tracks,
      align: 'stretch',
      fontSize: theme.fontSizes.sm,
      lineHeight: theme.lineHeights.sm,
      color: pageColors(theme, scheme).text,
      ...(read(props.bordered) ? { border: 1, borderColor: lineOf(props, theme, scheme) } : null),
    };
  });
  const data = () => {
    const d = read(props.data);
    if (d == null) return props.children;
    const caption = d.caption == null ? null : <TableCaption>{d.caption}</TableCaption>;
    const bottom = (read(props.captionAt) ?? 'bottom') === 'bottom';
    return [
      bottom ? null : caption,
      d.columns == null ? null : (
        <TableHead>
          <TableRow>{d.columns.map((/** @type {any} */ h) => <TableHeading>{h}</TableHeading>)}</TableRow>
        </TableHead>
      ),
      <TableBody>
        {(d.rows ?? []).map((/** @type {any[]} */ row) => (
          <TableRow>{row.map(c => <TableCell>{c}</TableCell>)}</TableRow>
        ))}
      </TableBody>,
      d.totals == null ? null : (
        <TableFoot>
          <TableRow>{d.totals.map((/** @type {any} */ f) => <TableHeading>{f}</TableHeading>)}</TableRow>
        </TableFoot>
      ),
      bottom ? caption : null,
    ];
  };
  return (
    <TableContext value={state}>
      <View role="table" {...pass(props)} style={style}>
        {props.data === undefined ? props.children : data}
      </View>
    </TableContext>
  );
}

/** A section's rows, each told its place (striping counts the body's). @param {'head' | 'body' | 'foot'} section @param {Record<string, any>} props */
const section = (section, props) => <SectionContext value={section}>{parts(props.children, TableRow, index => ({ __index: index }))}</SectionContext>;

/** The header rows; with the table's `sticky`, their cells sticky at the top of the Scroll around it (`stickyOffset` below). @param {Record<string, any>} props */
function TableHead(props) {
  return section('head', props);
}

/** The body rows (striped by their place). @param {Record<string, any>} props */
function TableBody(props) {
  return section('body', props);
}

/** The footer rows. @param {Record<string, any>} props */
function TableFoot(props) {
  return section('foot', props);
}

/**
 * A row: a `row` with no box (`display: 'contents'`), its cells in the
 * table's grid; what it means and its events are its own. Its line under
 * it, its stripe, its hover highlight and its style props are its cells'.
 * @param {Record<string, any>} props
 */
function TableRow(props) {
  const t = tableOf();
  const where = /** @type {'head' | 'body' | 'foot'} */ ($lookup(SectionContext));
  const index = props.__index ?? 0;
  const key = t.row();
  const look = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    const stripe = where === 'body' && read(t.props.striped) === true && index % 2 === 1;
    const hover = where === 'body' && read(t.props.hoverable) === true && t.hovered() === key;
    return {
      ...(!linesOf(t.props).rows ? null : { borderBottom: 1, borderColor: lineOf(t.props, theme, scheme) }),
      ...(stripe ? { background: read(t.props.stripeColor) ?? page.stripe } : null),
      ...(hover ? { background: read(t.props.hoverColor) ?? page.hover } : null),
    };
  });
  const list = flat(props.children);
  // The columns it asks the table for.
  // Its cells' columns, and each one-column cell's `w` for its column, as an accessor the table reads (a spanning
  // cell's is its own least width).
  /** @type {((() => unknown) | undefined)[]} */
  const widths = [];
  let at = 0;
  for (const c of list) {
    if (!isCell(c)) continue;
    const cell = c;
    if (spanOf(c) === 1) widths[at] = () => read(cell.props.w);
    at += spanOf(c);
  }
  const release = t.report(at, widths);
  const owner = $owner($active());
  if (owner != null) $cleanup(/** @type {any} */ (owner), release);
  // Each cell but the last knows it is followed (its column line); the first starts its row at the first column,
  // so a short row before it never lets its cells flow up into that row.
  let last = -1;
  const first = list.findIndex(isCell);
  list.forEach((c, i) => {
    if (isCell(c)) last = i;
  });
  const cells = list.map((c, i) => (isCell(c) && (i !== last || i === first) ? new Lazy(c.component, { ...c.props, __followed: i !== last, __first: i === first }) : c));
  return (
    <RowContext value={{ key, look }}>
      <View role="row" {...pass(props)} style={ROW}>
        {cells}
      </View>
    </RowContext>
  );
}

/** A row's box: none, its cells laid out in the table's grid. */
const ROW = /** @type {const} */ ({ display: 'contents' });

/** Whether a child is a Heading or a Cell element. @param {any} c */
const isCell = c => c instanceof Lazy && (c.component === TableHeading || c.component === TableCell);

/**
 * A cell: its row's look under its own (padding, a column line on its
 * right with the table's column `lines` but the last in its row), a
 * sticky header cell's place, its `span`, and the row's hover.
 * @param {Record<string, any>} props @param {boolean} head
 */
function cellOf(props, head) {
  const t = tableOf();
  const row = $lookup(RowContext);
  const where = /** @type {'head' | 'body' | 'foot'} */ ($lookup(SectionContext));
  const sticky = () => where === 'head' && read(t.props.sticky) === true;
  const given = styled(props, (theme, scheme) => ({
    ...row?.look(),
    direction: 'column',
    // Columns sized by their content keep each cell's least (its widest word, an unbreakable code); fixed ones
    // share the width, a cell as narrow as its share.
    ...(read(t.props.fixed) === true ? { minWidth: 0 } : null),
    padding: densityOf(theme, read(t.props.density)),
    ...(props.__first === true ? { column: `1 / span ${spanOf({ props })}` } : spanOf({ props }) > 1 ? { column: `span ${spanOf({ props })}` } : null),
    ...(head ? { fontWeight: theme.weights.strong } : null),
    ...(props.__followed === true && linesOf(t.props).columns ? { borderRight: 1, borderColor: lineOf(t.props, theme, scheme) } : null),
    ...(sticky() ? { position: 'sticky', top: read(t.props.stickyOffset) ?? 0, zIndex: LAYERS.raised, background: row?.look().background ?? pageColors(theme, scheme).body } : null),
  }));
  // Its `w` is its column's (the table's template): the cell itself stretches across its track, so its row's line runs
  // whole; a spanning cell's `w` is its least width across its columns.
  const style = () => {
    const s = given();
    const w = read(props.w);
    if (typeof w !== 'number') return s;
    const { width: _, ...rest } = s;
    return spanOf({ props }) > 1 ? { ...rest, minWidth: w } : rest;
  };
  const hover = row === null ? null : { onPointerEnter: () => t.hover(row.key), onPointerLeave: () => t.hovered() === row.key && t.hover(null) };
  return (
    <View role={head ? (where === 'head' ? 'columnheader' : 'rowheader') : 'cell'} {...pass(props)} {...hover} style={style}>
      {textual(props.children) ? <Label text={props.children} style={{ wrap: true }} /> : props.children}
    </View>
  );
}

/** A header cell. @param {Record<string, any>} props */
function TableHeading(props) {
  return cellOf(props, true);
}

/** A data cell. @param {Record<string, any>} props */
function TableCell(props) {
  return cellOf(props, false);
}

/** The table's caption: a line of its own across every column. @param {Record<string, any>} props */
function TableCaption(props) {
  const style = styled(props, (theme, scheme) => ({ column: '1 / -1', color: pageColors(theme, scheme).quiet, textAlign: 'center', margin: [theme.spacing.xs, 0], wrap: true }));
  return <Label role="caption" {...pass(props)} text={props.children} style={style} />;
}

/**
 * A Scroll for a table: `maxHeight` (or `h`) bounds it, `minWidth` keeps
 * the table from narrowing (it scrolls across then); a sticky header stays
 * at its top.
 * @param {Record<string, any>} props
 */
function TableScroll(props) {
  // Its `minWidth` is the table's, inside it, not the Scroll's own style.
  const outer = Object.create(props, { minWidth: { value: undefined } });
  const style = styled(outer, () => ({ shrink: 0 }));
  return (
    <Scroll
      {...pass(props)}
      axis={() => (read(props.minWidth) == null ? 'y' : 'both')}
      ref={(/** @type {any} */ n) => {
        handOn(props.ref, n);
      }}
      style={style}
    >
      <View style={() => ({ direction: 'column', minWidth: read(props.minWidth) ?? 0, shrink: 0 })}>{props.children}</View>
    </Scroll>
  );
}

Table.Head = TableHead;
Table.Body = TableBody;
Table.Foot = TableFoot;
Table.Row = TableRow;
Table.Heading = TableHeading;
Table.Cell = TableCell;
Table.Caption = TableCaption;
Table.Scroll = TableScroll;
