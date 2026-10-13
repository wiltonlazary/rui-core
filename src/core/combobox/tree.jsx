// TreeSelect: hierarchical data in a combobox panel, as
// an indented tree, walked with the arrow keys.

import { View, Label, Action, Edit, Shape, Scroll, For, Show, read, $active, $signal, $memo, $read, $write, $untrack, $watch } from 'ren-core';
import { styled } from '../../theme/style.js';
import { $ui } from '../../theme/theme.jsx';
import { pageColors } from '../../theme/resolve.js';
import { $controlled, keyOf, prevent, checkFigures, ActionRow, handled } from '../overlays/shared.jsx';
import { $combobox } from './store.js';
import { Combobox, ComboboxTrigger, ComboboxPanel, ComboboxNoMatch, optionLook } from './combobox.jsx';
import { FieldBox, Outer, Opener, Clear, editStyle, $focused, comboOf } from './field.jsx';
import { state as aria, flag, DECOR, $uid } from '../../theme/meaning.js';
import { comboboxOf, storeOf, valueStyle } from './select.jsx';
import { Tag } from './tags.jsx';
import { sizeOf } from '../inputs/shared.js';
import { Chevron } from '../data/parts.jsx';

/**
 * @typedef {object} TreeNode
 * @property {string} value
 * @property {string} label
 * @property {boolean} disabled
 * @property {TreeNode[]} children
 * @property {TreeNode | null} parent
 * @property {number} depth
 */

/**
 * Hierarchical data (`{ value, label, children, disabled }`) as nodes with
 * their parents and depths.
 * @param {any[]} data @param {TreeNode | null} [parent] @param {number} [depth]
 * @returns {TreeNode[]}
 */
export function parseTree(data, parent = null, depth = 0) {
  return (data ?? []).map(item => {
    /** @type {TreeNode} */
    const node = { value: String(item.value), label: String(item.label ?? item.value), disabled: item.disabled === true, children: [], parent, depth };
    node.children = parseTree(item.children ?? [], node, depth + 1);
    return node;
  });
}

/** Every node, depth first. @param {TreeNode[]} nodes @returns {TreeNode[]} */
const all = nodes => nodes.flatMap(n => [n, ...all(n.children)]);

/** The leaves under a node (itself when it has none). @param {TreeNode} node @returns {string[]} */
const leaves = node => (node.children.length === 0 ? [node.value] : node.children.flatMap(leaves));

/** The leaves under a node a press may toggle: none below a disabled node. @param {TreeNode} node @returns {string[]} */
const enabledLeaves = node => (node.disabled ? [] : node.children.length === 0 ? [node.value] : node.children.flatMap(enabledLeaves));

/** The row look shared by the columns and the tree: a combobox option's. @param {() => boolean} on @param {() => boolean} disabled @param {any} size */
export function rowStyle(on, disabled, size) {
  return styled({}, (theme, scheme) => optionLook(theme, scheme, { size: read(size), on: on(), disabled: disabled() }));
}

/** A chevron pointing to the row's end while collapsed, turned +90 degrees (to point down) while open, as a Cascader row's and an Accordion's. @param {{ open: () => boolean, size?: number }} props */
export function Turn(props) {
  const ui = $ui();
  return <Chevron point="end" size={() => props.size ?? ui.theme().sizes.glyph.sm} color={() => pageColors(ui.theme(), ui.scheme()).quiet} open={() => (props.open() ? 1 : 0)} />;
}

/**
 * A tree of options: `data` (a tree of `{ value,
 * label, children, disabled }`), `pick` ('one', the default, or 'many'),
 * `checks` (a checkbox on each row, and many: a parent checks every enabled leaf
 * under it and the value is the leaves; with `strict` each node checks
 * alone, its value independent of its parent's and children's),
 * `value`/`onChange` or `defaultValue` (a value with one, an array with
 * many), `expanded`/`onExpandedChange`
 * or `defaultExpanded` (the open nodes' values, or `true` for all),
 * `press` ('select': a press on a parent chooses it; 'expand': it opens
 * or closes the parent instead, as Tree's `press`),
 * `max` (the most values), `clearable`, `panelHeight` (280, in a Scroll),
 * `placeholder`, `disabled`, `readOnly`, and the field's, Field's and
 * panel's props. `searchable`: the field is an Edit; typing shows the
 * nodes whose labels contain the text and their ancestors, open
 * (`search`/`onSearchChange` or `defaultSearch`, `match(node, search)`,
 * `empty`). `guides` (false): hairlines in the rule color join each node to
 * its parent, down from the middle of the parent's chevron. ArrowUp and
 * ArrowDown move, ArrowRight opens (or goes to the first child), ArrowLeft
 * closes (or goes to the parent), Enter chooses.
 * @param {Record<string, any>} props
 */
export function TreeSelect(props) {
  const R = $active();
  const tree = $memo(R, () => parseTree(read(props.data)));
  /** Checkboxes on the rows (`checks`), which take many. */
  const checks = () => read(props.checks) === true;
  const many = () => checks() || read(props.pick) === 'many';
  /** Checks without the cascade: each node checked alone (`strict`). */
  const strict = () => read(props.strict) === true;
  const value = $controlled(props, 'value', 'defaultValue', /** @type {any} */ (null), v => props.onChange?.(v));
  const values = () => /** @type {string[]} */ (many() ? (value.get() ?? []) : value.get() == null ? [] : [value.get()]);
  const initial = $untrack(R, () => (read(props.defaultExpanded) === true ? all(/** @type {TreeNode[]} */ ($read(tree))).filter(n => n.children.length > 0).map(n => n.value) : (read(props.defaultExpanded) ?? [])));
  const expanded = $controlled(props, 'expanded', null, /** @type {string[]} */ (initial), v => props.onExpandedChange?.(v));
  const cursor = $signal(R, -1);
  const searchable = () => read(props.searchable) === true;
  const typed = $signal(R, false);
  const search = $controlled(props, 'search', 'defaultSearch', '', v => props.onSearchChange?.(v));
  /** The text searched for, lower case; '' while not searching. */
  const query = () => (searchable() && $read(typed) ? search.get().trim().toLowerCase() : '');
  /** The nodes a search keeps: those matching and their ancestors (null while not searching). */
  const kept = () => {
    const q = query();
    if (q === '') return null;
    /** @type {Set<TreeNode>} */
    const keep = new Set();
    for (const n of all(/** @type {TreeNode[]} */ ($read(tree)))) {
      if (!(props.match !== undefined ? props.match(n, search.get()) : n.label.toLowerCase().includes(q))) continue;
      for (let up = /** @type {TreeNode | null} */ (n); up !== null && !keep.has(up); up = up.parent) keep.add(up);
    }
    return keep;
  };
  /** The nodes shown: the roots, and the children of open nodes; while searching, the ones kept, open. */
  const visible = () => {
    const keep = kept();
    if (keep !== null) return all(/** @type {TreeNode[]} */ ($read(tree))).filter(n => keep.has(n));
    const open = new Set(expanded.get());
    /** @type {TreeNode[]} */
    const out = [];
    const walk = (/** @type {TreeNode[]} */ nodes) => {
      for (const n of nodes) {
        out.push(n);
        if (open.has(n.value)) walk(n.children);
      }
    };
    walk(/** @type {TreeNode[]} */ ($read(tree)));
    return out;
  };
  const store = $combobox(
    storeOf(props, {
      open: () => {
        const v = $untrack(R, values);
        $write(cursor, v.length === 0 ? -1 : $untrack(R, visible).findIndex(n => n.value === v[0]));
      },
      close: () => {
        $write(typed, false);
        search.set('');
      },
    }),
  );
  const locked = () => read(props.disabled) === true || read(props.readOnly) === true;
  const find = (/** @type {string} */ v) => all(/** @type {TreeNode[]} */ ($read(tree))).find(n => n.value === v);
  const labelOf = (/** @type {string} */ v) => find(v)?.label ?? v;
  /** @param {TreeNode} node */
  const toggleOpen = node => {
    const list = $untrack(R, expanded.get);
    expanded.set(list.includes(node.value) ? list.filter(x => x !== node.value) : [...list, node.value]);
  };
  /** @param {TreeNode} node */
  const choose = node => {
    if (node.disabled) return;
    if (read(props.press) === 'expand' && node.children.length > 0 && !checks()) return toggleOpen(node);
    const current = $untrack(R, values);
    if ($untrack(R, () => $read(typed))) {
      $write(typed, false);
      search.set('');
    }
    if (!many()) {
      value.set(current[0] === node.value ? null : node.value);
      store.close();
      store.focus();
      return;
    }
    const max = read(props.max);
    if (checks() && !strict()) {
      // A press toggles the enabled leaves only: a disabled one keeps its state either way.
      const under = enabledLeaves(node);
      const allOn = under.every(v => current.includes(v));
      const added = under.filter(v => !current.includes(v));
      // max caps what a press adds, never what it removes (values over a max lowered later stay until unchecked).
      const kept = allOn ? current.filter(v => !under.includes(v)) : [...current, ...(max != null ? added.slice(0, Math.max(0, max - current.length)) : added)];
      // max may refuse every leaf a press adds: then nothing changed, and no onChange.
      if (kept.length !== current.length || kept.some((v, i) => v !== current[i])) value.set(kept);
      return;
    }
    if (current.includes(node.value)) value.set(current.filter(v => v !== node.value));
    else if (max == null || current.length < max) value.set([...current, node.value]);
  };
  /** A node's check state: 1 checked, 0.5 some leaves, 0. @param {TreeNode} node */
  const state = node => {
    const v = values();
    if (!checks() || strict()) return v.includes(node.value) ? 1 : 0;
    const under = leaves(node);
    const on = under.filter(x => v.includes(x)).length;
    return on === 0 ? 0 : on === under.length ? 1 : 0.5;
  };
  /** A checked row's state as ARIA states it: its check, mixed while some of its leaves are. @param {TreeNode} node */
  const checkedOf = node => {
    const s = state(node);
    return s === 1 ? 'true' : s === 0 ? 'false' : 'mixed';
  };
  const onKey = (/** @type {any} */ e) => {
    if (locked()) return;
    const key = keyOf(e);
    if (!$untrack(R, store.isOpen)) {
      if (key === 'ArrowDown' || key === 'Enter' || (key === ' ' && !searchable())) {
        prevent(e);
        store.open();
      }
      return;
    }
    const list = $untrack(R, visible);
    const i = $untrack(R, () => /** @type {number} */ ($read(cursor)));
    const at = list[i];
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      prevent(e);
      if (list.length === 0) return;
      let j = i;
      for (let k = 0; k < list.length; k++) {
        j = key === 'ArrowDown' ? (j + 1) % list.length : (j - 1 + list.length) % list.length;
        if (!list[j].disabled) break;
      }
      $write(cursor, j);
    } else if (key === 'ArrowRight' && at !== undefined) {
      prevent(e);
      if (at.children.length === 0) return;
      if (!$untrack(R, expanded.get).includes(at.value)) toggleOpen(at);
      else $write(cursor, i + 1);
    } else if (key === 'ArrowLeft' && at !== undefined) {
      prevent(e);
      if (at.children.length > 0 && $untrack(R, expanded.get).includes(at.value)) toggleOpen(at);
      else if (at.parent !== null) $write(cursor, list.indexOf(at.parent));
    } else if (key === 'Enter' && at !== undefined) {
      prevent(e);
      choose(at);
    } else if (key === 'Escape' || key === 'Tab') {
      if (key === 'Escape' && $untrack(R, store.isOpen)) handled(e);
      store.close();
    }
  };
  const focused = $focused();
  const right = () => (props.end !== undefined ? props.end : read(props.clearable) === true && values().length > 0 && !locked() ? <Clear onPress={() => value.set(many() ? [] : null)} /> : <Opener />);
  const ui = $ui();
  const guides = () => read(props.guides) === true;
  /** True when no sibling after the node is shown. @param {TreeNode} node */
  const lastShown = node => {
    const shownNow = visible();
    const siblings = (node.parent?.children ?? /** @type {TreeNode[]} */ ($read(tree))).filter(x => shownNow.includes(x));
    return siblings.at(-1) === node;
  };
  const line = styled({}, (theme, scheme) => ({ background: pageColors(theme, scheme).rule }));
  /**
   * The indent of a node at an ancestor's level: `spacing.md`, with its line
   * (`guides`) at half `sizes.iconBox.xs`, under the ancestor's chevron: down through the level while that ancestor has shown
   * siblings below it, and at the node's own level a branch to it (down
   * to its middle when it is the last shown).
   * @param {TreeNode} n @param {number} level
   */
  const indent = (n, level) => {
    /** The node's ancestor at depth level + 1 (the node itself at its own level). */
    let at = n;
    while (at.depth > level + 1 && at.parent !== null) at = at.parent;
    const own = level === n.depth - 1;
    const mid = () => ui.theme().sizes.iconBox.xs / 2;
    return (
      <View style={() => ({ width: ui.theme().spacing.md, shrink: 0, self: 'stretch' })}>
        <Show when={() => guides() && (own || !lastShown(at))}>
          <View style={() => ({ ...line(), position: 'absolute', left: mid(), width: 1, top: 0, ...(own && lastShown(at) ? { height: '50%' } : { bottom: 0 }) })} />
        </Show>
        <Show when={() => guides() && own}>
          <View style={() => ({ ...line(), position: 'absolute', left: mid(), right: 0, top: '50%', height: 1 })} />
        </Show>
      </View>
    );
  };
  const box = (/** @type {TreeNode} */ n) => (
    <Shape
      shapes={() => {
        const s = state(n);
        const theme = ui.theme();
        const scheme = ui.scheme();
        const border = pageColors(theme, scheme).border;
        const fill = theme.colors[theme.accent][theme.accentShade[scheme]];
        const g = theme.sizes.glyph.sm;
        if (!checks()) return s === 1 ? checkFigures(theme.sizes.glyph.xs, pageColors(theme, scheme).text) : [];
        return s === 0
          ? [{ kind: 'round', x: 0, y: 0, right: g, bottom: g, radius: 3, color: border }, { kind: 'round', x: 1, y: 1, right: g - 1, bottom: g - 1, radius: 2, color: pageColors(theme, scheme).body }]
          : [{ kind: 'round', x: 0, y: 0, right: g, bottom: g, radius: 3, color: fill }, ...(s === 1 ? checkFigures(g, theme.white) : [{ kind: 'line', x: 3, y: g / 2, right: g - 3, bottom: g / 2, color: theme.white, stroke: 2 }])];
      }}
      style={() => {
        const g = ui.theme().sizes.glyph[checks() ? 'sm' : 'xs'];
        return { width: g, height: g, shrink: 0 };
      }}
    />
  );
  return (
    <Outer {...props}>
      <Combobox store={store} keys={false} {...comboboxOf(props)}>
        <ComboboxTrigger>
          <FieldBox
            size={props.size}
            radius={props.radius}
            error={props.error}
            invalid={props.invalid}
            disabled={props.disabled}
            variant={props.variant}
            start={props.start}
            end={right}
            focused={focused.get}
            multiline={many}
            onPointerDown={searchable() ? () => !locked() && store.open() : undefined}
          >
            <Show when={many}>
              <For each={values} by="position">
                {(/** @type {() => string} */ v) => (
                  <Tag removable={() => !locked()} onRemove={() => !locked() && value.set($untrack(R, values).filter(x => x !== v()))}>
                    {() => labelOf(v())}
                  </Tag>
                )}
              </For>
            </Show>
            {searchable() ? (
              <Edit
                ref={store.setTrigger}
                value={() => ($read(typed) ? search.get() : many() || values().length === 0 ? '' : labelOf(values()[0]))}
                label={() => (many() && values().length > 0 ? '' : (read(props.placeholder) ?? ''))}
                {...comboOf(props, store)}
                onChange={(/** @type {{ value: string }} */ e) => {
                  if (locked()) return;
                  search.set(e.value);
                  $write(typed, true);
                  store.open();
                  $write(cursor, $untrack(R, visible).findIndex(n => !n.disabled));
                }}
                onKey={onKey}
                onFocus={focused.onFocus}
                onBlur={focused.onBlur}
                style={editStyle({ size: props.size, multiline: many })}
              />
            ) : (
              <Action
                ref={store.setTrigger}
                label={() => read(props.placeholder) ?? 'Options'}
                {...comboOf(props, store)}
                onPress={() => !locked() && store.toggle()}
                onKey={onKey}
                onFocus={focused.onFocus}
                onBlur={focused.onBlur}
                style={() => ({ grow: 1, shrink: 1, minWidth: ui.theme().sizes.control[sizeOf(read(props.size))], minHeight: 0, height: ui.theme().sizes.dense[sizeOf(read(props.size))], padding: 0, border: 0, background: 'transparent', justify: 'start', align: 'center', direction: 'row', textAlign: 'start' })}
              >
                <Label
                  text={() => (many() ? (values().length === 0 ? (read(props.placeholder) ?? '') : '') : values().length === 0 ? (read(props.placeholder) ?? '') : labelOf(values()[0]))}
                  style={valueStyle(props, () => values().length === 0)}
                />
              </Action>
            )}
          </FieldBox>
        </ComboboxTrigger>
        <ComboboxPanel>
          <Show when={() => visible().length > 0} fallback={props.empty === undefined ? null : <ComboboxNoMatch>{props.empty}</ComboboxNoMatch>}>
          <Scroll role="tree" aria-multiselectable={flag(many)} style={() => ({ direction: 'column', maxHeight: read(props.panelHeight) ?? ui.theme().sizes.box.panel })}>
            <For each={visible}>
              {(/** @type {() => TreeNode} */ node) => {
                const n = $untrack(R, node);
                const on = () => visible()[$read(cursor)] === n;
                // Where the keyboard is, the row is the field's active descendant.
                const id = $uid('node');
                $watch(R, on, v => (v ? store.markActive(id) : undefined));
                const open = () => kept() !== null || expanded.get().includes(n.value);
                return (
                  <View style={{ direction: 'row', align: 'center' }}>
                    {Array.from({ length: n.depth }, (_, level) => indent(n, level))}
                    {n.children.length > 0 ? (
                      // A drawn chevron, not a button: a press opens or closes the node and the focus stays on
                      // the field (the arrows open and close from there).
                      <View {...DECOR} aria-label={() => (open() ? `Collapse ${n.label}` : `Expand ${n.label}`)} onPointerDown={(/** @type {any} */ e) => {
                        e?.preventDefault?.(); // as a DOM mousedown prevented: no focus moves
                        toggleOpen(n);
                      }} style={() => ({ width: ui.theme().sizes.iconBox.xs, height: ui.theme().sizes.iconBox.xs, shrink: 0, align: 'center', justify: 'center', cursor: 'pointer' })}>
                        <Turn open={open} size={ui.theme().sizes.glyph.xs} />
                      </View>
                    ) : (
                      <View style={() => ({ width: ui.theme().sizes.iconBox.xs, shrink: 0 })} />
                    )}
                    <Action id={id} role="treeitem" aria-level={n.depth + 1} aria-expanded={n.children.length > 0 ? aria(open) : undefined} aria-checked={() => (checks() ? checkedOf(n) : undefined)} aria-selected={() => (checks() ? undefined : values().includes(n.value) ? 'true' : 'false')} aria-disabled={flag(() => n.disabled)} onPress={() => choose(n)} style={rowStyle(on, () => n.disabled, props.size)}>
                      <ActionRow gap={() => ui.theme().control.iconGap}>
                        {box(n)}
                        <Label text={n.label} />
                      </ActionRow>
                    </Action>
                  </View>
                );
              }}
            </For>
          </Scroll>
          </Show>
        </ComboboxPanel>
      </Combobox>
    </Outer>
  );
}
