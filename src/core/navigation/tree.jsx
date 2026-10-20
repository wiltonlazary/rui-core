// Tree: nested items that expand and collapse, with selection, on a tree
// handle (`$treeState`, an rrx-core operation). Keys
// while an item has focus: ArrowDown and ArrowUp move between the visible
// items, ArrowRight expands (or moves to the first child), ArrowLeft
// collapses (or moves to the parent), Home and End go to the ends; Enter and
// Space press the item.

import { Action, View, Label, Show, $active, $signal, $read, $write, read } from 'ren-core';
import { styled, pressLook } from '../../theme/style.js';
import { $ui } from '../../theme/theme.jsx';
import { variantColors, pageColors, spacing } from '../../theme/resolve.js';
import { pass } from '../layout/layout.jsx';
import { ChevronIcon } from '../buttons/icons.jsx';
import { $follow } from '../misc/tween.js';
import { MOTION } from '../../theme/motion.js';
import { textual } from '../feedback/feedback.jsx';
import { DECOR, state } from '../../theme/meaning.js';

/**
 * @typedef {object} TreeItem
 * @property {string} value unique in the tree
 * @property {any} label
 * @property {TreeItem[]=} children
 */

/**
 * @typedef {object} TreeStateHandle
 * @property {() => string[]} expanded the open items' values
 * @property {() => string[]} selected
 * @property {(value: string) => boolean} isExpanded
 * @property {(value: string) => boolean} isSelected
 * @property {(value: string) => void} expand
 * @property {(value: string) => void} collapse
 * @property {(value: string) => void} toggle expands or collapses
 * @property {(value: string) => void} select
 * @property {(value: string) => void} deselect
 * @property {(value: string) => void} toggleSelect
 * @property {() => void} deselectAll
 * @property {() => void} expandAll
 * @property {() => void} collapseAll
 * @property {(data: readonly TreeItem[]) => void} load the Tree gives it its data
 */

/** Every value with children, depth first. @param {readonly TreeItem[]} data @param {string[]} [out] */
function parents(data, out = []) {
  for (const item of data)
    if (item.children !== undefined && item.children.length > 0) {
      out.push(item.value);
      parents(item.children, out);
    }
  return out;
}

/**
 * A tree's state: which items are expanded (held as a Set of their
 * values; each change writes a new Set) and selected. `multiple` keeps
 * several selected; `defaultExpanded` (the open items' values) and
 * `defaultSelected` start it.
 * `onExpandedChange(value, expanded)` hears each item expand or
 * collapse.
 * @param {{ multiple?: boolean, defaultExpanded?: string[], defaultSelected?: string[], onExpandedChange?: (value: string, expanded: boolean) => void }} [options]
 * @returns {TreeStateHandle}
 */
export function $treeState(options = {}) {
  const R = $active();
  const expanded = $signal(R, /** @type {ReadonlySet<string>} */ (new Set(options.defaultExpanded ?? [])));
  const selected = $signal(R, /** @type {string[]} */ ([...(options.defaultSelected ?? [])]));
  /** @type {readonly TreeItem[]} */
  let data = [];
  const set = (/** @type {string} */ value, /** @type {boolean} */ open) => {
    const now = $read(expanded);
    if (now.has(value) === open) return;
    const next = new Set(now);
    if (open) next.add(value);
    else next.delete(value);
    $write(expanded, next);
    options.onExpandedChange?.(value, open);
  };
  /** Puts a whole new open set, telling `onExpandedChange` of each item whose state changed. @param {ReadonlySet<string>} next */
  const setAll = next => {
    const now = $read(expanded);
    $write(expanded, next);
    const tell = options.onExpandedChange;
    if (tell === undefined) return;
    for (const value of now) if (!next.has(value)) tell(value, false);
    for (const value of next) if (!now.has(value)) tell(value, true);
  };
  /** @type {TreeStateHandle} */
  const tree = {
    expanded: () => [...$read(expanded)],
    selected: () => $read(selected),
    isExpanded: value => $read(expanded).has(value),
    isSelected: value => $read(selected).includes(value),
    expand: value => set(value, true),
    collapse: value => set(value, false),
    toggle: value => set(value, !$read(expanded).has(value)),
    select: value => {
      if ($read(selected).includes(value)) return;
      $write(selected, options.multiple ? [...$read(selected), value] : [value]);
    },
    deselect: value => $write(selected, $read(selected).filter(v => v !== value)),
    toggleSelect: value => ($read(selected).includes(value) ? tree.deselect(value) : tree.select(value)),
    deselectAll: () => $write(selected, []),
    expandAll: () => setAll(new Set(parents(data))),
    collapseAll: () => setAll(new Set()),
    load: next => {
      data = next;
    },
  };
  return tree;
}

/**
 * The items shown, in order, with their parents.
 * @param {readonly TreeItem[]} data @param {(value: string) => boolean} open
 * @returns {{ item: TreeItem, parent: string | null }[]}
 */
function visible(data, open) {
  /** @type {{ item: TreeItem, parent: string | null }[]} */
  const out = [];
  /** @param {readonly TreeItem[]} list @param {string | null} parent */
  const walk = (list, parent) => {
    for (const item of list) {
      out.push({ item, parent });
      if (item.children !== undefined && item.children.length > 0 && open(item.value)) walk(item.children, item.value);
    }
  };
  walk(data, null);
  return out;
}

/**
 * A tree: `data` (TreeItem[]: a value, an accessor or a signal), `store`
 * (a `$treeState()` handle; its own by default, telling
 * `onExpandedChange(value, expanded)`), `indent` ('md' a depth: px or a
 * spacing step), `press` ('expand': a press opens or closes an item;
 * 'select' selects it; 'both' does both), `chevrons`
 * (true: they turn over MOTION's quick), `renderItem({ item, depth, open, chosen, branch, handle })`
 * (the row's content; `open` and `chosen` are accessors, `branch` is true
 * for an item with children). It
 * means a `tree` of `treeitem`s (`aria-level`, `aria-selected`,
 * `aria-expanded`), an open item's children a `group`.
 * @param {Record<string, any>} props
 */
export function Tree(props) {
  const ui = $ui();
  const tree = /** @type {TreeStateHandle} */ (props.store ?? $treeState({ onExpandedChange: (value, expanded) => props.onExpandedChange?.(value, expanded) }));
  const data = () => /** @type {readonly TreeItem[]} */ (read(props.data) ?? []);
  /** @type {Map<string, any>} */
  const nodes = new Map();
  const focus = (/** @type {string | null | undefined} */ value) => {
    if (value != null) nodes.get(value)?.focus?.();
  };
  /** @param {TreeItem} item @param {number} depth */
  const row = (item, depth) => {
    const kids = item.children !== undefined && item.children.length > 0;
    const expanded = () => tree.isExpanded(item.value);
    const selected = () => tree.isSelected(item.value);
    const turn = $follow(() => (expanded() ? 0 : -90), MOTION.quick);
    const style = () => {
      const theme = ui.theme();
      const scheme = ui.scheme();
      const c = variantColors(theme, scheme, 'soft', undefined);
      return {
        padding: [theme.spacing.xs / 2, theme.spacing.xs, theme.spacing.xs / 2, theme.spacing.xs + (depth - 1) * spacing(theme, read(props.indent), 'md')],
        border: 0,
        radius: theme.radius.sm,
        textAlign: 'start',
        fontSize: theme.fontSizes.sm,
        ...pressLook(theme),
        background: selected() ? c.background : 'transparent',
        color: selected() ? c.color : pageColors(theme, scheme).text,
        hover: { background: selected() ? c.hover : pageColors(theme, scheme).hover },
      };
    };
    const onPress = () => {
      focus(item.value);
      const press = read(props.press) ?? 'expand';
      if (press !== 'expand') tree.select(item.value);
      if (kids && press !== 'select') tree.toggle(item.value);
    };
    const onKey = (/** @type {{ key: string, preventDefault?: () => void, stopPropagation?: () => void }} */ e) => {
      const shown = visible(data(), tree.isExpanded);
      const at = shown.findIndex(v => v.item.value === item.value);
      let to = /** @type {string | null | undefined} */ (undefined);
      switch (e.key) {
        case 'ArrowDown':
          to = shown[at + 1]?.item.value;
          break;
        case 'ArrowUp':
          to = shown[at - 1]?.item.value;
          break;
        case 'ArrowRight':
          if (!kids) return;
          if (expanded()) to = item.children?.[0]?.value;
          else tree.expand(item.value);
          break;
        case 'ArrowLeft':
          if (kids && expanded()) tree.collapse(item.value);
          else to = shown[at]?.parent;
          break;
        case 'Home':
          to = shown[0]?.item.value;
          break;
        case 'End':
          to = shown[shown.length - 1]?.item.value;
          break;
        default:
          return;
      }
      e.preventDefault?.();
      e.stopPropagation?.();
      focus(to);
    };
    const ref = (/** @type {any} */ el) => void nodes.set(item.value, el);
    const content = props.renderItem
      ? props.renderItem({ item, depth, open: expanded, chosen: selected, branch: kids, handle: tree })
      : textual(item.label)
        ? <Label text={item.label} />
        : item.label;
    return (
      <View style={{ direction: 'column', align: 'stretch' }}>
        <Action
          ref={ref}
          role="treeitem"
          aria-level={depth}
          aria-selected={state(selected)}
          aria-expanded={kids ? state(expanded) : undefined}
          label={textual(item.label) ? undefined : item.value}
          selected={selected}
          onPress={onPress}
          onKey={onKey}
          style={/** @type {any} */ (style)}
        >
          <View style={() => ({ direction: 'row', align: 'center', gap: ui.theme().control.iconGap })}>
            {kids && read(props.chevrons) !== false ? <ChevronIcon size={() => ui.theme().sizes.glyph.sm} rotate={turn} color={() => (selected() ? variantColors(ui.theme(), ui.scheme(), 'soft', undefined).color : pageColors(ui.theme(), ui.scheme()).quiet)} /> : <View {...DECOR} style={() => ({ width: kids ? 0 : ui.theme().sizes.glyph.sm, shrink: 0 })} />}
            {content}
          </View>
        </Action>
        {kids ? (
          <Show when={expanded}>
            <View role="group" style={{ direction: 'column', align: 'stretch' }}>{/** @type {TreeItem[]} */ (item.children).map(child => <Row item={child} depth={depth + 1} />)}</View>
          </Show>
        ) : null}
      </View>
    );
  };
  /** A row, built only where it shows. @param {{ item: TreeItem, depth: number }} p */
  const Row = p => row(p.item, p.depth);
  const style = styled(props, () => ({ direction: 'column', align: 'stretch' }));
  return (
    <View role="tree" {...pass(props)} style={style}>
      {() => {
        const list = data();
        tree.load(list);
        nodes.clear();
        return list.map(item => <Row item={item} depth={1} />);
      }}
    </View>
  );
}
