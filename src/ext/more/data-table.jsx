// DataTable: fields over rows, with sorting,
// pagination, row selection with checkboxes, row presses, a loading
// cover, an empty state, a sticky header over a scrolling body, and
// virtual rows (only the rows in view are built) for large row sets.

import { View, Label, Scroll, Shape, Action, For, Show, read, $active, $signal, $read, $write, $untrack } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { styled } from '../../theme/style.js';
import { pageColors, radiusOf, colorOf, TINTS } from '../../theme/resolve.js';
import { alpha } from '../../theme/colors.js';
import { pass } from '../../core/layout/layout.jsx';
import { Checkbox } from '../../core/inputs/choice.jsx';
import { densityOf } from '../../core/typography/table.jsx';
import { Pagination } from '../../core/navigation/pagination.jsx';
import { Busy } from '../../core/overlays/backdrop.jsx';
import { $controlled, partOf } from '../../core/overlays/shared.jsx';
import { DECOR } from '../../theme/meaning.js';
import { labelsIn } from '../../theme/labels.js';

/**
 * A field of `fields`, keyed by its row path ('a.b' reads a nested one).
 * @typedef {object} DataTableField
 * @property {any=} title the header (the path's last key, spaced and capitalized, by default)
 * @property {((row: any, index: number) => any)=} cell the cell's content (the value as text by default)
 * @property {true | ((row: any) => any)=} sort sortable: by the value, or by what the function gives
 * @property {number=} width px (the fields without one share the rest)
 * @property {'start' | 'center' | 'end'=} align
 */

/** A field as the table reads it: its path and its options. @typedef {DataTableField & { key: string }} Column */

/** The rows' order: the path sorted `by`, `desc` for high to low. @typedef {{ by: string, desc?: boolean }} Order */

/** A table's fields in key order. @param {Record<string, DataTableField | true> | null | undefined} fields @returns {Column[]} */
export const columnsOf = fields => Object.entries(fields ?? {}).map(([key, f]) => ({ ...(f === true || f == null ? {} : f), key }));

/** The value at a path ('a.b.c') of a row. @param {any} row @param {string} path */
export function valueAt(row, path) {
  let v = row;
  for (const k of String(path).split('.')) {
    if (v == null) return undefined;
    v = v[k];
  }
  return v;
}

/** A column's default title: 'firstName' as 'First name'. @param {string} key */
export const titleOf = key => {
  const last = String(key).split('.').pop() ?? '';
  const words = last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** Compares two cell values: numbers and dates by value, the rest as text. @param {any} a @param {any} b */
function compare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a instanceof Date || b instanceof Date) return +a - +b;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * Rows in an order (stable; nulls, NaN and Invalid Dates last).
 * @param {readonly any[]} rows @param {Record<string, DataTableField | true> | null | undefined} fields @param {Order | null} order
 */
export function sortRecords(rows, fields, order) {
  if (order == null) return rows;
  const own = /** @type {any} */ (fields ?? {})[order.by]?.sort;
  const key = typeof own === 'function' ? own : (/** @type {any} */ r) => valueAt(r, order.by);
  const sign = order.desc === true ? -1 : 1;
  // NaN and an Invalid Date are no value: they sort as null, last.
  const value = (/** @type {any} */ k) => ((typeof k === 'number' && Number.isNaN(k)) || (k instanceof Date && Number.isNaN(k.getTime())) ? null : k);
  return rows
    .map((r, i) => ({ r, i, k: value(key(r)) }))
    .sort((a, b) => (a.k == null || b.k == null ? compare(a.k, b.k) : sign * compare(a.k, b.k)) || a.i - b.i)
    .map(x => x.r);
}

/** The first and last row indexes to build in view (with `overscan` rows around it). @param {number} top @param {number} viewport @param {number} rowHeight @param {number} count @param {number} overscan */
export function windowOf(top, viewport, rowHeight, count, overscan) {
  const first = Math.max(0, Math.floor(top / rowHeight) - overscan);
  const last = Math.min(count, Math.ceil((top + viewport) / rowHeight) + overscan);
  return { first, last: Math.max(first, last) };
}

/**
 * A data table: `rows` and `fields` ({ [path]: { title, cell(row, index),
 * sort (true, or a function giving what to compare), width, align } }:
 * one column a key, in key order; a path left out is not shown), `idOf(row,
 * index)` (row.id, else the index); sorting by a sortable header press
 * (`order` { by, desc } + `onOrderChange`: the caller sorts; or
 * `defaultOrder` and the table sorts); `pages` (false, or { size, page +
 * onChange or defaultPage, total (when `rows` is only the page; else the
 * table slices), text(from, to, total): '1–2 of 5' by default, look: { size: the pager's, 'sm' }
 * }); `picking` (false, or { value + onChange or defaultValue, allow(row)
 * }: a checkbox column); `onRowPress(row, index, event)`; `loading` (a
 * Busy cover, `loader` its loader's options); `empty` ('Nothing here
 * yet', in a box twice `sizes.control.md` tall); `height` (the body scrolls
 * under a sticky header; `sizes.box.table` while it measures); `virtual` with
 * `rowHeight` (`sizes.box.tableRow`, 36) and `overscan` (4) builds only the rows in view (needs
 * `height`); `striped` (every other row on the page's `stripe`),
 * `hoverable` (a row on `hover` under the pointer), `selectionColor`
 * (picked rows in its tint; the accent), `bordered`, `lines` ('rows',
 * 'columns', 'both' or false), `radius`, `density` ('tight' 4 × 8, 'even'
 * 8 × 12 or 'airy' 12 × 16 px of cell padding: 'even'), `fontSize` ('md').
 * It means a `table` of rows (`row`), its header's cells `columnheader` (a
 * sortable one's `aria-sort`), the others `cell`.
 * @param {Record<string, any>} props
 */
export function DataTable(props) {
  const R = $active();
  const ui = $ui();
  const columns = () => columnsOf(read(props.fields));
  const idOf = (/** @type {any} */ record, /** @type {number} */ index) => {
    const own = props.idOf;
    return typeof own === 'function' ? own(record, index) : (record?.id ?? index);
  };
  const order = $controlled(props, 'order', 'defaultOrder', /** @type {Order | null} */ (null), o => props.onOrderChange?.(o));
  const sorted = () => {
    const records = /** @type {any[]} */ (read(props.rows) ?? []);
    return props.order !== undefined ? records : sortRecords(records, read(props.fields), order.get());
  };
  // `pages` and `picking` are part props: false, or their options (read live).
  const paging = () => partOf(read(props.pages), false);
  const perPage = () => {
    const n = paging()?.size;
    return paging() === null ? 0 : Math.max(1, Math.floor(Number(n ?? 10)));
  };
  const page = $controlled(
    { get page() { return paging()?.page; }, get defaultPage() { return paging()?.defaultPage; } },
    'page', 'defaultPage', 1, p => paging()?.onChange?.(p),
  );
  const total = () => Number(paging()?.total ?? sorted().length);
  const pages = () => (perPage() === 0 ? 1 : Math.max(1, Math.ceil(total() / perPage())));
  const current = () => Math.min(Math.max(1, Number(page.get())), pages());
  /** The rows shown: the page's (sliced here when `rows` holds more than a page). */
  const shown = () => {
    const all = sorted();
    const n = perPage();
    if (n === 0 || all.length <= n) return all;
    const from = (current() - 1) * n;
    return all.slice(from, from + n);
  };
  const picking = () => partOf(read(props.picking), false);
  const selectable = $untrack(R, picking) !== null;
  const selection = $controlled(
    { get value() { return picking()?.value; }, get defaultValue() { return picking()?.defaultValue; } },
    'value', 'defaultValue', /** @type {any[]} */ ([]), list => picking()?.onChange?.(list),
  );
  /** A row's key, its index looked up only when the key needs it. @param {any} record */
  const keyOf = record => {
    const own = props.idOf;
    if (typeof own !== 'function' && record?.id != null) return record.id;
    const index = sorted().indexOf(record);
    if (typeof own === 'function') return own(record, index);
    // A record not among the rows (a stale selection) is keyed by itself, never as a row's index.
    return index < 0 ? record : index;
  };
  const isSelected = (/** @type {any} */ record) => {
    const id = keyOf(record);
    return selection.get().some(r => keyOf(r) === id);
  };
  const canSelect = (/** @type {any} */ record) => picking()?.allow?.(record) !== false;
  const toggle = (/** @type {any} */ record) => {
    const list = $untrack(R, selection.get);
    const id = keyOf(record);
    selection.set(list.some(r => keyOf(r) === id) ? list.filter(r => keyOf(r) !== id) : [...list, record]);
  };
  const pageSelectable = () => shown().filter(r => canSelect(r));
  const allSelected = () => pageSelectable().length > 0 && pageSelectable().every(isSelected);
  const someSelected = () => !allSelected() && pageSelectable().some(isSelected);
  const toggleAll = () => {
    const list = $untrack(R, selection.get);
    const mine = $untrack(R, pageSelectable);
    const ids = new Set(mine.map(keyOf));
    if ($untrack(R, allSelected)) selection.set(list.filter(r => !ids.has(keyOf(r))));
    else selection.set([...list, ...mine.filter(r => !list.some(s => keyOf(s) === keyOf(r)))]);
  };
  const pressSort = (/** @type {Column} */ column) => {
    const now = $untrack(R, order.get);
    order.set({ by: column.key, desc: now?.by === column.key && now.desc !== true });
  };

  // Looks
  const line = () => {
    const theme = ui.theme();
    return pageColors(theme, ui.scheme()).rule;
  };
  const padding = () => densityOf(ui.theme(), read(props.density));
  // The rules between rows and between columns (`lines`: 'rows' by default).
  const lines = () => read(props.lines) ?? 'rows';
  const rowLines = () => lines() === 'rows' || lines() === 'both';
  const columnLines = () => lines() === 'columns' || lines() === 'both';
  /** A cell's box for a column. @param {Column | null} column @returns {Record<string, any>} */
  const cellBox = column => {
    const w = column === null ? ui.theme().sizes.box.tableCheck : column.width;
    const align = column?.align === 'end' ? 'end' : column?.align === 'center' ? 'center' : 'start';
    return {
      direction: 'column',
      justify: 'center',
      align: column === null ? 'center' : 'stretch',
      textAlign: align,
      padding: column === null ? [0, 0] : padding(),
      ...(w == null ? { grow: 1, width: 0, minWidth: 0 } : { width: w, shrink: 0, grow: 0 }),
    };
  };
  const separator = () => (columnLines() ? <View {...DECOR} style={() => ({ width: 1, shrink: 0, self: 'stretch', background: line() })} /> : null);
  /** The cells of a row: the check cell (its `role`) and one per column, with separators. @param {(column: Column) => any} cell @param {() => any} check @param {string} role */
  const cells = (cell, check, role) => {
    /** @type {any[]} */
    const out = [];
    if (selectable) out.push(<View role={role} style={() => cellBox(null)}>{check()}</View>);
    for (const c of columns()) {
      if (out.length > 0) out.push(separator());
      out.push(cell(c));
    }
    return out;
  };

  const rowHeight = () => Number(read(props.rowHeight) ?? ui.theme().sizes.box.tableRow);
  const virtual = () => read(props.virtual) === true;
  /** A row of the body. @param {() => any} record @param {() => number} index */
  const Row = (record, index) => {
    const striped = () => read(props.striped) === true && index() % 2 === 1;
    const style = styled({}, (theme, scheme) => {
      const page = pageColors(theme, scheme);
      const selected = selectable && isSelected(record());
      const color = colorOf(theme, scheme, read(props.selectionColor));
      return {
        direction: 'row',
        align: 'stretch',
        grow: 1,
        background: selected ? alpha(color, TINTS[scheme].rest) : striped() ? page.stripe : 'transparent',
        ...(props.onRowPress !== undefined ? { cursor: 'pointer' } : null),
        ...(read(props.hoverable) === true ? { hover: { background: page.hover } } : null),
      };
    });
    const onPress = props.onRowPress === undefined ? undefined : (/** @type {any} */ event) => props.onRowPress($untrack(R, record), $untrack(R, index), event);
    return (
      <View style={() => ({ direction: 'column', shrink: 0, ...(virtual() ? { position: 'absolute', left: 0, right: 0, top: index() * rowHeight(), height: rowHeight() } : null) })}>
        <View role="row" onPress={onPress} style={style}>
          {() => cells(
            column => (
              <View role="cell" style={() => cellBox(column)}>
                {column.cell === undefined ? (
                  <Label text={() => String(valueAt(record(), column.key) ?? '')} />
                ) : (
                  () => column.cell?.(record(), index())
                )}
              </View>
            ),
            () => (
              <View onPress={(/** @type {any} */ e) => e?.stopPropagation?.()} style={() => ({ padding: ui.theme().spacing.xs / 2 })}>
                <Checkbox
                  size="xs"
                  aria-label={() => labelsIn().selectRow(index() + 1)}
                  checked={() => isSelected(record())}
                  disabled={() => !canSelect(record())}
                  onChange={() => toggle($untrack(R, record))}
                />
              </View>
            ),
            'cell',
          )}
        </View>
        {!rowLines() ? null : <View {...DECOR} style={() => ({ height: 1, shrink: 0, background: line() })} />}
      </View>
    );
  };

  // The header
  const arrow = (/** @type {Column} */ column) => () => {
    const s = order.get();
    const on = s?.by === column.key;
    const color = on ? pageColors(ui.theme(), ui.scheme()).text : pageColors(ui.theme(), ui.scheme()).quiet;
    const down = on && s?.desc === true;
    const up = on && s?.desc !== true;
    /** @type {Record<string, any>[]} */
    const out = [];
    if (!down) out.push({ kind: 'path', closed: true, points: [2, 6, 7, 1, 12, 6], color });
    if (!up) out.push({ kind: 'path', closed: true, points: [2, 9, 12, 9, 7, 14], color });
    return out;
  };
  // With a `height`, the header is sticky at the top of the scrolling body.
  const header = (/** @type {boolean} */ sticky) => (
    <View
      onResize={(/** @type {{ height: number }} */ box) => {
        headHigh = box.height;
        measure();
      }}
      style={styled({}, (theme, scheme) => ({ direction: 'column', shrink: 0, fontWeight: theme.weights.strong, ...(sticky ? { position: 'sticky', top: 0, zIndex: 1, background: pageColors(theme, scheme).body } : null) }))}
    >
      <View role="row" style={{ direction: 'row', align: 'stretch' }}>
        {() => cells(
          column => {
            const title = column.title ?? titleOf(column.key);
            const text = typeof title === 'string' || typeof title === 'number';
            const content = text ? <Label text={String(title)} /> : title;
            if (column.sort == null) return <View role="columnheader" style={() => cellBox(column)}>{content}</View>;
            // The columnheader keeps the column's name and says its order; the button in it sorts, named by the title.
            return (
              <View
                role="columnheader"
                aria-sort={() => {
                  const s = order.get();
                  return s?.by !== column.key ? 'none' : s.desc === true ? 'descending' : 'ascending';
                }}
                style={() => ({ ...cellBox(column), direction: 'row', align: 'stretch' })}
              >
                <Action
                  label={String(text ? title : column.key)}
                  onPress={() => pressSort(column)}
                  style={/** @returns {Record<string, any>} */ () => ({ grow: 1, direction: 'row', align: 'center', justify: column.align === 'end' ? 'end' : column.align === 'center' ? 'center' : 'start', gap: ui.theme().control.iconGap, background: 'transparent', border: 0, radius: ui.theme().radius.sm, padding: 0, minHeight: 0, fontWeight: ui.theme().weights.strong, cursor: 'pointer' })}
                >
                  {content}
                  <Shape {...DECOR} shapes={arrow(column)} style={() => ({ width: ui.theme().sizes.glyph.sm, height: ui.theme().sizes.glyph.sm, shrink: 0 })} />
                </Action>
              </View>
            );
          },
          () => <Checkbox size="xs" aria-label={() => labelsIn().selectAllRows} checked={allSelected} indeterminate={someSelected} onChange={toggleAll} />,
          'columnheader',
        )}
      </View>
      <View {...DECOR} style={() => ({ height: 1, shrink: 0, background: line() })} />
    </View>
  );

  // The body: all rows, or the rows in view.
  const scrollTop = $signal(R, 0);
  const viewport = $signal(R, 0);
  /** @type {any} */
  let scroller = null;
  // The rows in view: the Scroll's height less the sticky header's (the rows under it are hidden), as their
  // onResize tell them (once laid out, then on each resize).
  let scrollHigh = 0;
  let headHigh = 0;
  const measure = () => {
    const h = Math.round(scrollHigh - headHigh);
    if (scrollHigh > 0 && h > 0 && h !== $untrack(R, () => $read(viewport))) $write(viewport, h);
  };
  const items = () => {
    const list = shown();
    if (!virtual()) return list.map((record, index) => ({ record, index }));
    const view = /** @type {number} */ ($read(viewport)) || Number(read(props.height) ?? ui.theme().sizes.box.table);
    const { first, last } = windowOf(/** @type {number} */ ($read(scrollTop)), view, rowHeight(), list.length, Number(read(props.overscan) ?? 4));
    /** @type {{ record: any, index: number }[]} */
    const out = [];
    for (let i = first; i < last; i++) out.push({ record: list[i], index: i });
    return out;
  };
  const rows = (
    <For each={items} by={(/** @type {{ record: any, index: number }} */ x) => idOf(x.record, x.index)}>
      {item => Row(() => item().record, () => item().index)}
    </For>
  );
  const body = () => (virtual() ? <View style={() => ({ position: 'relative', height: shown().length * rowHeight(), shrink: 0 })}>{rows}</View> : <View style={{ direction: 'column', shrink: 0 }}>{rows}</View>);
  const empty = () => (
    <Show when={() => shown().length === 0 && read(props.loading) !== true}>
      <View style={styled({}, (theme, scheme) => ({ minHeight: 2 * theme.sizes.control.md, align: 'center', justify: 'center', padding: theme.spacing.md, color: pageColors(theme, scheme).quiet }))}>
        {() => {
          const text = read(props.empty) ?? labelsIn().nothingHere;
          return typeof text === 'string' ? <Label text={text} /> : text;
        }}
      </View>
    </Show>
  );
  const height = () => read(props.height);
  const scrolled = () =>
    height() == null ? (
      <View style={{ direction: 'column' }}>
        {body()}
        {empty()}
      </View>
    ) : (
      <Scroll
        ref={(/** @type {any} */ n) => (scroller = n)}
        onResize={(/** @type {{ height: number }} */ box) => {
          scrollHigh = box.height;
          measure();
        }}
        onScroll={() => $write(scrollTop, Number(scroller?.scrollTop ?? 0))}
        style={{ grow: 1, minHeight: 0, shrink: 1 }}
      >
        <View style={{ direction: 'column', shrink: 0 }}>
          {header(true)}
          {body()}
          {empty()}
        </View>
      </Scroll>
    );

  // The footer
  const footer = () => {
    if (perPage() === 0) return null;
    return (
      <View style={styled({}, theme => ({ direction: 'row', align: 'center', justify: 'between', gap: theme.spacing.sm, padding: [theme.spacing.xs, theme.spacing.xs], shrink: 0, fontWeight: theme.weights.regular }))}>
        <Label
          text={() => {
            const n = perPage();
            const from = total() === 0 ? 0 : (current() - 1) * n + 1;
            const to = Math.min(total(), current() * n);
            const text = paging()?.text;
            // rui's wording: '1–2 of 5' (one row: '5 of 5').
            return typeof text === 'function' ? String(text(from, to, total())) : `${from === to ? from : `${from}–${to}`} of ${total()}`;
          }}
        />
        <Pagination total={pages} value={current} onChange={(/** @type {number} */ p) => page.set(p)} size={() => paging()?.look?.size ?? 'sm'} />
      </View>
    );
  };

  const style = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    const h = height();
    return {
      direction: 'column',
      position: 'relative',
      fontSize: theme.fontSizes[/** @type {'md'} */ (read(props.fontSize) ?? 'md')] ?? theme.fontSizes.md,
      color: page.text,
      background: page.body,
      overflow: 'hidden',
      ...(h == null ? null : { height: h }),
      ...(read(props.bordered) === true ? { border: 1, borderColor: line(), radius: radiusOf(theme, read(props.radius) ?? 'sm') } : null),
    };
  });
  return (
    <View role="table" {...pass(props)} style={style}>
      {() => (height() == null ? header(false) : null)}
      {() => scrolled()}
      {footer}
      <Busy shown={() => read(props.loading) === true} {...(read(props.loader) ? { loader: read(props.loader) } : null)} />
    </View>
  );
}
