// Cascader: a combobox field whose panel walks a tree level by level, one
// column per open parent. Past `levels` columns the earliest ones fold into
// a trail of crumbs; a search (or the list layout) shows whole paths flat.

import { View, Label, Action, Edit, Shape, For, Show, read, $active, $signal, $memo, $read, $write, $untrack, $watch } from 'ren-core';
import { styled } from '../../theme/style.js';
import { $ui } from '../../theme/theme.jsx';
import { fontBelow, pageColors } from '../../theme/resolve.js';
import { $controlled, keyOf, prevent, partOf, chevronFigures, ActionRow, handled } from '../overlays/shared.jsx';
import { DECOR, flag, state, $uid } from '../../theme/meaning.js';
import { $combobox } from './store.js';
import { Combobox, ComboboxTrigger, ComboboxPanel, ComboboxNoMatch, OptionCheck, optionLook } from './combobox.jsx';
import { FieldBox, Outer, Opener, Clear, editStyle, $focused, comboOf } from './field.jsx';
import { comboboxOf, storeOf, valueStyle } from './select.jsx';
import { parseTree } from './tree.jsx';
import { labelsIn } from '../../theme/labels.js';
import { ScrollBox } from '../misc/misc.jsx';

/** @typedef {import('./tree.jsx').TreeNode} TreeNode */

/**
 * A path as the flat views list it: its nodes from the root, a key, its
 * text, and whether a disabled node on it keeps it from being chosen.
 * @typedef {{ nodes: TreeNode[], key: string, text: string, disabled: boolean }} Route
 */

/** The nodes a path of values walks from the roots; null when it leaves the tree. @param {TreeNode[]} roots @param {string[]} path */
function walk(roots, path) {
  /** @type {TreeNode[]} */
  const out = [];
  let level = roots;
  for (const v of path) {
    const node = level.find(n => n.value === v);
    if (node === undefined) return null;
    out.push(node);
    level = node.children;
  }
  return out;
}

/** The nodes from the root down to `node`. @param {TreeNode} node @returns {TreeNode[]} */
function chainOf(node) {
  /** @type {TreeNode[]} */
  const out = [];
  for (let n = /** @type {TreeNode | null} */ (node); n !== null; n = n.parent) out.unshift(n);
  return out;
}

/**
 * Every path a choice may end on, depth first: the leaves, and with
 * `parents` the parents as well.
 * @param {TreeNode[]} roots @param {boolean} parents @param {string} separator
 * @returns {Route[]}
 */
function routesOf(roots, parents, separator) {
  /** @type {Route[]} */
  const out = [];
  const visit = (/** @type {TreeNode[]} */ nodes, /** @type {TreeNode[]} */ above) => {
    for (const node of nodes) {
      const chain = [...above, node];
      if (node.children.length === 0 || parents)
        out.push({ nodes: chain, key: chain.map(n => n.value).join('\n'), text: chain.map(n => n.label).join(separator), disabled: chain.some(n => n.disabled) });
      visit(node.children, chain);
    }
  };
  visit(roots, []);
  return out;
}

/** The built-in search rule: each whitespace-separated word, case aside, is in one of the path's labels. @param {TreeNode[]} nodes @param {string} search */
function wordsMatch(nodes, search) {
  const words = search.toLowerCase().split(/\s+/).filter(w => w !== '');
  const labels = nodes.map(n => n.label.toLowerCase());
  return words.every(w => labels.some(l => l.includes(w)));
}

/** The first (or, `last`, the final) enabled node of a column, else null. @param {TreeNode[]} nodes @param {boolean} [last] */
function edgeOf(nodes, last = false) {
  const enabled = nodes.filter(n => !n.disabled);
  return (last ? enabled.at(-1) : enabled[0]) ?? null;
}

/**
 * A chooser of one path through a tree: `data` (a tree of `{ value,
 * label, children, disabled }`), `value`/`onChange(path)` or
 * `defaultValue` (the values from the root, null for none), `pick`
 * ('leaf': only a node without children; 'any': a parent too, by Enter or
 * a second press once it is open), `openOn` ('press' or 'hover'), `toggle`
 * (true: choosing the chosen path clears it), `stay` (the panel stays open
 * on a choice), `separator` (' › '), `format(labels)` (the field's text),
 * `levels` (4 columns shown; the earlier open levels fold into a trail of
 * crumbs, `trailLabel` 'Levels above' names it), `column` (`{ width }`,
 * `sizes.box.menu`), `panelHeight` (`sizes.box.panel`), `check` (true,
 * false or `{ at: 'start' | 'end' }`), `layout` ('columns' or 'list': every
 * choosable path in one list), `searchable` (`search`/`onSearchChange` or
 * `defaultSearch`, `match(nodes, search)`, `limit`), `empty` ('No match'),
 * `clearable`, `placeholder`, `disabled`, `readOnly`, and the field's,
 * Field's and panel's props.
 * @param {Record<string, any>} props
 */
export function Cascader(props) {
  const R = $active();
  const ui = $ui();
  const roots = $memo(R, () => parseTree(read(props.data)));
  const tree = () => /** @type {TreeNode[]} */ ($read(roots));
  const value = $controlled(props, 'value', 'defaultValue', /** @type {string[] | null} */ (null), v => props.onChange?.(v));
  const parents = () => read(props.pick) === 'any';
  const hovers = () => read(props.openOn) === 'hover';
  const listed = () => read(props.layout) === 'list';
  const separator = () => String(read(props.separator) ?? ' › ');
  const levels = () => Math.max(1, Number(read(props.levels) ?? 4));
  const locked = () => read(props.disabled) === true || read(props.readOnly) === true;

  /** The chosen path's nodes, null when none (or when it is not in the tree). */
  const chosen = () => {
    const path = value.get();
    return path == null || path.length === 0 ? null : walk(tree(), path);
  };
  const isChosen = (/** @type {TreeNode} */ node) => chosen()?.at(-1) === node;
  const fieldText = () => {
    const nodes = chosen();
    if (nodes === null) return '';
    const labels = nodes.map(n => n.label);
    return props.format !== undefined ? String(props.format(labels)) : labels.join(separator());
  };

  const searchable = () => read(props.searchable) === true;
  const typed = $signal(R, false);
  const search = $controlled(props, 'search', 'defaultSearch', '', v => props.onSearchChange?.(v));
  const query = () => (searchable() && $read(typed) ? search.get() : '');
  /** True while the panel lists paths flat: the list layout, or a search. */
  const flat = () => listed() || query().trim() !== '';
  /** The paths listed flat: those the search keeps, at most `limit`. */
  const routes = () => {
    const all = routesOf(tree(), parents(), separator());
    const q = query();
    const rule = props.match ?? wordsMatch;
    const kept = q.trim() === '' ? all : all.filter(r => rule(r.nodes, q));
    const cap = read(props.limit);
    return cap == null ? kept : kept.slice(0, cap);
  };

  /** The open parent at each level: column 0 is the roots, column i + 1 the children of opened[i]. */
  const opened = $signal(R, /** @type {TreeNode[]} */ ([]));
  const openList = () => /** @type {TreeNode[]} */ ($read(opened));
  /** Where the keyboard is in the columns (its column is its depth). */
  const cursor = $signal(R, /** @type {TreeNode | null} */ (null));
  const here = () => /** @type {TreeNode | null} */ ($read(cursor));
  /** Where the keyboard is in the flat list. */
  const row = $signal(R, -1);
  /** The first column in view. */
  const start = $signal(R, 0);
  const count = () => openList().length + 1;
  const first = () => Math.min(/** @type {number} */ ($read(start)), count() - 1);
  const inView = () => {
    const from = first();
    return Array.from({ length: Math.min(count(), from + levels()) - from }, (_, i) => from + i);
  };
  const later = () => first() + levels() < count();
  const nodesAt = (/** @type {number} */ level) => (level === 0 ? tree() : (openList()[level - 1]?.children ?? []));
  const isOpen = (/** @type {TreeNode} */ node) => openList()[node.depth] === node;

  /** Shows the deepest columns. */
  const fit = () => $write(start, Math.max(0, $untrack(R, count) - levels()));
  /** Moves the window so the column `depth` is in it. @param {number} depth */
  const reveal = depth => {
    const from = $untrack(R, first);
    if (depth < from) $write(start, depth);
    else if (depth >= from + levels()) $write(start, depth - levels() + 1);
  };
  /** Opens a parent's column (closing the deeper ones of another branch). @param {TreeNode} node */
  const expand = node => {
    if (node.disabled || node.children.length === 0 || $untrack(R, () => isOpen(node))) return;
    $write(opened, [...$untrack(R, openList).slice(0, node.depth), node]);
    fit();
  };
  /** Closes the columns past `depth`. @param {number} depth */
  const fold = depth => {
    if ($untrack(R, openList).length <= depth) return;
    $write(opened, $untrack(R, openList).slice(0, depth));
    fit();
  };

  const store = $combobox(
    storeOf(props, {
      open: () => {
        const nodes = $untrack(R, chosen);
        $write(opened, nodes === null ? [] : nodes.filter(n => n.children.length > 0));
        $write(cursor, nodes?.at(-1) ?? edgeOf($untrack(R, tree)));
        fit();
        const list = $untrack(R, routes);
        const at = nodes === null ? -1 : list.findIndex(r => r.nodes.at(-1) === nodes.at(-1));
        $write(row, at >= 0 ? at : list.findIndex(r => !r.disabled));
      },
      close: () => {
        $write(typed, false);
        search.set('');
      },
    }),
  );

  /** Sets the value to the path to `node`, or clears it when it is the chosen one (`toggle`). @param {TreeNode} node */
  const choose = node => {
    const chain = chainOf(node);
    if (chain.some(n => n.disabled)) return;
    const path = chain.map(n => n.value);
    const current = $untrack(R, value.get);
    const same = current != null && current.length === path.length && current.every((v, i) => v === path[i]);
    if (!same) value.set(path);
    else if (read(props.toggle) !== false) value.set(null);
    if ($untrack(R, () => $read(typed))) {
      $write(typed, false);
      search.set('');
    }
    if (read(props.stay) !== true) {
      store.close();
      store.focus();
    }
  };
  /** A press on a row: a leaf is chosen, a parent opens (or, open, is chosen with `pick="any"`). @param {TreeNode} node */
  const press = node => {
    if (node.disabled) return;
    $write(cursor, node);
    if (node.children.length === 0) return choose(node);
    if ($untrack(R, () => isOpen(node))) {
      if (parents()) return choose(node);
    } else expand(node);
    store.focus();
  };
  /** The pointer on a row with `openOn="hover"`: a parent opens, a leaf closes the columns past it. @param {TreeNode} node */
  const hover = node => {
    if (node.disabled) return;
    $write(cursor, node);
    if (node.children.length > 0) expand(node);
    else fold(node.depth);
  };
  /** A crumb: the window starts at `level`, the keyboard kept in it. @param {number} level */
  const jump = level => {
    $write(start, level);
    const at = $untrack(R, here);
    if (at === null || at.depth < level || at.depth >= level + levels()) $write(cursor, $untrack(R, openList)[level] ?? edgeOf($untrack(R, () => nodesAt(level))));
    store.focus();
  };

  /** The keys over the flat list. @param {any} e @param {string} key */
  const flatKey = (e, key) => {
    const list = $untrack(R, routes);
    const at = /** @type {number} */ ($untrack(R, () => $read(row)));
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      prevent(e);
      if (list.length === 0) return;
      let j = at;
      for (let k = 0; k < list.length; k++) {
        j = key === 'ArrowDown' ? (j + 1) % list.length : (j - 1 + list.length) % list.length;
        if (!list[j].disabled) break;
      }
      $write(row, j);
    } else if (key === 'Enter') {
      prevent(e);
      const route = list[at];
      if (route !== undefined && !route.disabled) choose(/** @type {TreeNode} */ (route.nodes.at(-1)));
    }
  };
  /** The keys over the columns. @param {any} e @param {string} key */
  const columnKey = (e, key) => {
    const at = $untrack(R, here);
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(key)) return;
    prevent(e);
    if (at === null) {
      $write(cursor, edgeOf($untrack(R, () => nodesAt(first()))));
      return;
    }
    const column = at.parent === null ? $untrack(R, tree) : at.parent.children;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      let j = column.indexOf(at);
      for (let k = 0; k < column.length; k++) {
        j = key === 'ArrowDown' ? (j + 1) % column.length : (j - 1 + column.length) % column.length;
        if (!column[j].disabled) break;
      }
      $write(cursor, column[j]);
    } else if (key === 'Home' || key === 'End') {
      $write(cursor, edgeOf(column, key === 'End') ?? at);
    } else if (key === 'ArrowRight') {
      if (at.disabled || at.children.length === 0) return;
      expand(at);
      $write(cursor, edgeOf(at.children) ?? at);
      reveal(at.depth + 1);
    } else if (key === 'ArrowLeft') {
      if (at.parent === null) return;
      $write(cursor, at.parent);
      reveal(at.parent.depth);
    } else if (key === 'Enter') {
      if (at.disabled) return;
      if (at.children.length === 0) return choose(at);
      if (!$untrack(R, () => isOpen(at))) return expand(at);
      if (parents()) return choose(at);
      $write(cursor, edgeOf(at.children) ?? at);
      reveal(at.depth + 1);
    }
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
    if (key === 'Escape' || key === 'Tab') {
      if (key === 'Escape' && $untrack(R, store.isOpen)) handled(e);
      return store.close();
    }
    if ($untrack(R, flat)) flatKey(e, key);
    else columnKey(e, key);
  };

  const focused = $focused();
  const clear = () => {
    value.set(null);
    search.set('');
    $write(typed, false);
    store.close();
  };
  const right = () => {
    if (props.end !== undefined) return props.end;
    return read(props.clearable) === true && value.get() != null && !locked() ? <Clear onPress={clear} /> : <Opener />;
  };
  /** The root column's name (and the flat list's): the field's label, else its placeholder. */
  const fieldName = () => {
    const label = read(props.label);
    return typeof label === 'string' ? label : String(read(props.placeholder) ?? '');
  };

  const mark = partOf(read(props.check));
  const markStart = mark !== null && mark.at === 'start';
  /** A row's check, before or after its text per `check`. @param {() => boolean} on @param {boolean} before */
  const checkOf = (on, before) => (mark !== null && markStart === before ? <OptionCheck shown={on} /> : null);
  const panelHeight = () => read(props.panelHeight) ?? ui.theme().sizes.box.panel;
  const columnWidth = () => partOf(read(props.column))?.width ?? ui.theme().sizes.box.menu;

  /** A row's look: an option's; the open parent's selected, the keyboard's the hover color. @param {() => boolean} on @param {() => boolean} keyed @param {boolean | (() => boolean)} disabled */
  const lookOf = (on, keyed, disabled) =>
    styled({}, (theme, scheme) => {
      const off = typeof disabled === 'function' ? disabled() : disabled;
      return { ...optionLook(theme, scheme, { size: read(props.size), on: on(), disabled: off }), ...(keyed() && !on() && !off ? { background: pageColors(theme, scheme).hover } : null) };
    });
  /** The chevron at a parent row's end, pointing on to its column. */
  const onward = () => (
    <Shape
      {...DECOR}
      shapes={() => chevronFigures(ui.theme().sizes.glyph.xs, pageColors(ui.theme(), ui.scheme()).quiet)}
      style={() => ({ width: ui.theme().sizes.glyph.xs, height: ui.theme().sizes.glyph.xs, shrink: 0, rotate: -90 })}
    />
  );

  /** A row's id, the field's active descendant while the keyboard is on it. @param {() => boolean} on */
  const rowId = on => {
    const id = $uid('node');
    $watch(R, on, v => (v ? store.markActive(id) : undefined));
    return id;
  };

  /** A node's row in its column. @param {TreeNode} node */
  const nodeRow = node => (
    <Action
      id={rowId(() => here() === node)}
      role="option"
      aria-selected={state(() => isOpen(node) || isChosen(node))}
      aria-disabled={flag(() => node.disabled)}
      onPress={() => press(node)}
      onPointerEnter={() => hovers() && hover(node)}
      style={lookOf(() => isOpen(node), () => here() === node, node.disabled)}
    >
      <ActionRow gap={() => ui.theme().control.iconGap}>
        {checkOf(() => isChosen(node), true)}
        <Label text={node.label} ellipsis style={{ grow: 1, minWidth: 0 }} />
        {checkOf(() => isChosen(node), false)}
        {node.children.length > 0 ? onward() : null}
      </ActionRow>
    </Action>
  );
  const rule = styled({}, (theme, scheme) => ({ width: 1, self: 'stretch', shrink: 0, background: pageColors(theme, scheme).edge }));
  /** A column: a listbox named by its parent's label, a rule before it unless it is the first in view. @param {number} level */
  const columnOf = level => (
    <View style={{ direction: 'row', align: 'stretch' }}>
      <Show when={() => level > first()}>
        <View {...DECOR} style={rule} />
      </Show>
      <ScrollBox.Fit
        role="listbox"
        aria-label={() => (level === 0 ? fieldName() : (openList()[level - 1]?.label ?? ''))}
        maxHeight={panelHeight}
        axis="y"
        bars={false}
        style={() => ({ direction: 'column', width: columnWidth(), shrink: 0 })}
      >
        <For each={() => nodesAt(level)}>{(/** @type {() => TreeNode} */ node) => nodeRow($untrack(R, node))}</For>
      </ScrollBox.Fit>
    </View>
  );

  const crumbLook = styled({}, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    return { minHeight: 0, padding: [0, theme.control.labelGap / 2], border: 0, radius: theme.radius.sm, background: 'transparent', color: page.quiet, fontSize: fontBelow(theme, 'md'), cursor: 'pointer', hover: { background: page.hover } };
  });
  const crumbText = styled({}, (theme, scheme) => ({ color: pageColors(theme, scheme).quiet, fontSize: fontBelow(theme, 'md') }));
  const trailLook = styled({}, theme => ({ direction: 'row', align: 'center', wrap: true, padding: theme.control.panelPad }));
  /** A crumb for a level out of view: the label chosen there, after the separator. @param {number} level */
  const crumb = level => (
    <View style={{ direction: 'row', align: 'center' }}>
      {level > 0 ? <Label {...DECOR} text={separator} style={crumbText} /> : null}
      <Action onPress={() => jump(level)} style={crumbLook}>
        <Label text={() => openList()[level]?.label ?? ''} style={crumbText} />
      </Action>
    </View>
  );
  const trail = (
    <Show when={() => first() > 0 || later()}>
      <View role="navigation" aria-label={() => read(props.trailLabel) ?? labelsIn().levelsAbove} style={trailLook}>
        <For each={() => Array.from({ length: first() }, (_, i) => i)}>{(/** @type {() => number} */ level) => crumb($untrack(R, level))}</For>
        <Show when={later}>
          <Action label={() => labelsIn().deeperLevels} onPress={() => jump(Math.max(0, $untrack(R, count) - levels()))} style={crumbLook}>
            <Label text="›" style={crumbText} />
          </Action>
        </Show>
      </View>
    </Show>
  );

  /** A path's row in the flat list. @param {() => Route} route @param {() => number} index */
  const routeRow = (route, index) => {
    const end = () => /** @type {TreeNode} */ (route().nodes.at(-1));
    return (
      <Action
        id={rowId(() => $read(row) === index())}
        role="option"
        aria-selected={state(() => isChosen(end()))}
        aria-disabled={flag(() => route().disabled)}
        onPress={() => !route().disabled && choose(end())}
        style={lookOf(() => $read(row) === index(), () => false, () => route().disabled)}
      >
        <ActionRow gap={() => ui.theme().control.iconGap}>
          {checkOf(() => isChosen(end()), true)}
          <Label text={() => route().text} ellipsis style={{ grow: 1, minWidth: 0 }} />
          {checkOf(() => isChosen(end()), false)}
        </ActionRow>
      </Action>
    );
  };
  const empty = () => <ComboboxNoMatch>{() => String(read(props.empty) ?? labelsIn().noMatch)}</ComboboxNoMatch>;
  const flatView = (
    <Show when={() => routes().length > 0} fallback={empty()}>
      <ScrollBox.Fit role="listbox" aria-label={fieldName} maxHeight={panelHeight} axis="y" bars={false} style={() => ({ direction: 'column', minWidth: columnWidth() })}>
        <For each={routes} by={(/** @type {Route} */ r) => r.key}>
          {(/** @type {() => Route} */ route, /** @type {() => number} */ index) => routeRow(route, index)}
        </For>
      </ScrollBox.Fit>
    </Show>
  );
  const columnsView = (
    <Show when={() => tree().length > 0} fallback={empty()}>
      {trail}
      <View style={{ direction: 'row', align: 'stretch' }}>
        <For each={inView}>{(/** @type {() => number} */ level) => columnOf($untrack(R, level))}</For>
      </View>
    </Show>
  );

  const shownText = () => ($read(typed) ? search.get() : fieldText());
  const trigger = searchable() ? (
    <Edit
      ref={store.setTrigger}
      // its press is its own (the caret goes where it is pressed); it opens the panel
      onPointerDown={(/** @type {any} */ e) => {
        e?.stopPropagation?.();
        if (!locked()) store.open();
      }}
      value={shownText}
      label={() => read(props.placeholder) ?? ''}
      {...comboOf(props, store)}
      onChange={(/** @type {{ value: string }} */ e) => {
        if (locked()) return;
        search.set(e.value);
        $write(typed, true);
        store.open();
        $write(row, $untrack(R, routes).findIndex(r => !r.disabled));
      }}
      onKey={onKey}
      onFocus={focused.onFocus}
      onBlur={focused.onBlur}
      style={editStyle(props)}
    />
  ) : (
    <Action
      ref={store.setTrigger}
      label={() => read(props['aria-label']) ?? (fieldText() || String(read(props.placeholder) ?? ''))}
      {...comboOf(props, store)}
      onPress={() => !locked() && store.toggle()}
      // its pointerdown is its own: the box's opens the panel, whose backdrop would take the press it toggles with
      onPointerDown={(/** @type {any} */ e) => e.stopPropagation()}
      onKey={onKey}
      onFocus={focused.onFocus}
      onBlur={focused.onBlur}
      style={{ grow: 1, shrink: 1, width: 0, minWidth: 0, height: '100%', minHeight: 0, padding: 0, border: 0, ring: false, background: 'transparent', justify: 'start', align: 'center', direction: 'row', textAlign: 'start' }}
    >
      <Label text={() => fieldText() || String(read(props.placeholder) ?? '')} style={valueStyle(props, () => chosen() === null)} />
    </Action>
  );
  return (
    <Outer {...props}>
      <Combobox store={store} keys={false} width={listed() ? 'trigger' : null} {...comboboxOf(props)}>
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
            // The whole box opens it, its padding and chevron too, the focus on the field (the press prevented, as a DOM
            // mousedown: no focus moves away); the field's own press is its own.
            onPointerDown={(/** @type {any} */ e) => {
              if (locked()) return;
              e?.preventDefault?.();
              store.focus();
              store.open();
            }}
          >
            {trigger}
          </FieldBox>
        </ComboboxTrigger>
        <ComboboxPanel>
          <Show when={flat} fallback={columnsView}>
            {flatView}
          </Show>
        </ComboboxPanel>
      </Combobox>
    </Outer>
  );
}
