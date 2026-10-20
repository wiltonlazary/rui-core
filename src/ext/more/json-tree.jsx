// JsonTree: a JSON value as a tree of rows, objects and arrays expanded and
// collapsed by a press (or the keys), values colored by their type, a
// value copied on press.

import { View, Label, Action, Shape, Show, For, read, $active, $signal, $read, $write, $untrack } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { styled, pressLook } from '../../theme/style.js';
import { colorOf, pageColors } from '../../theme/resolve.js';
import { pass } from '../../core/layout/layout.jsx';
import { keyOf } from '../../core/overlays/shared.jsx';
import { DECOR, state } from '../../theme/meaning.js';
import { labelsIn } from '../../theme/labels.js';

/** The type of a JSON value, for its color. @param {any} v @returns {'string' | 'number' | 'boolean' | 'null' | 'array' | 'object' | 'other'} */
export function jsonType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  const t = typeof v;
  return t === 'string' || t === 'number' || t === 'boolean' || t === 'object' ? t : 'other';
}

/** A leaf as it is shown (strings quoted, as JSON writes them). @param {any} v */
export const leafText = v => (typeof v === 'string' ? JSON.stringify(v) : v === undefined ? 'undefined' : typeof v === 'bigint' ? `${v}n` : String(v));

/** Theme colors per value type; null reads the page's quiet text. */
const TYPE_COLORS = /** @type {Record<string, string>} */ ({ string: 'green', number: 'blue', boolean: 'orange', other: 'purple', key: 'violet' });

/**
 * Whether a node starts expanded: `defaultExpanded` true (all), false
 * (none), a depth (the levels above it; 1 by default: the root) or a list
 * of node ids.
 * @param {any} expanded @param {string} id @param {number} depth
 */
const opensAt = (expanded, id, depth) =>
  Array.isArray(expanded) ? expanded.includes(id) : expanded === true ? true : expanded === false ? false : depth < Number(expanded ?? 1);

/**
 * A node's id: its path's keys joined by dots ('' the root), each key's
 * backslashes and dots escaped with a backslash, so `{ 'a.b': 1 }` is
 * 'a\.b' and `{ a: { b: 1 } }` is 'a.b'.
 * @param {any[]} path
 */
const jsonPathId = path => path.map(k => String(k).replace(/[\\.]/g, '\\$&')).join('.');

/**
 * A JSON tree: `data`; the expanded nodes as `expanded` (their ids, a
 * string[]) with `onExpandedChange(ids, { path, open })` told on each
 * toggle, or its own from `defaultExpanded` (1: the root's level; true,
 * false, a depth or a list of ids); `maxDepth` (deeper nodes start
 * collapsed), `title` (the
 * root's key, 'root'), `counts` (true: '3 items' beside a
 * collapsed node), `copyable` (true: pressing a value copies it to the
 * platform clipboard where there is one: a string or a BigInt as written,
 * anything else as JSON), `onCopy(text, path)`, `fontSize` ('sm').
 * Paths are key lists from the root; a node's id is its path joined by
 * dots ('meta.ok'; '' the root), a key's `\` and `.` escaped with a
 * backslash (the key 'a.b' is 'a\.b'). It means a `tree` of `treeitem`s
 * (`aria-level`, `aria-expanded`) named by their paths, an open node's
 * children a `group`; a leaf holds its value's copy button.
 * @param {Record<string, any>} props
 */
export function JsonTree(props) {
  const ui = $ui();
  const R = $active();
  const color = (/** @type {string} */ type) => {
    const own = read(props[`${type}Color`]) ?? TYPE_COLORS[type];
    return own == null ? pageColors(ui.theme(), ui.scheme()).quiet : colorOf(ui.theme(), ui.scheme(), own);
  };
  const copy = (/** @type {any} */ value, /** @type {any[]} */ path) => {
    if (read(props.copyable) === false) return;
    // A string as it is, a BigInt as its digits (JSON has none: inside an object too), and what JSON cannot write as its text.
    const text = typeof value === 'string' || typeof value === 'bigint' ? String(value) : (JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? String(v) : v), 2) ?? String(value));
    const clipboard = /** @type {any} */ (globalThis).navigator?.clipboard;
    if (typeof clipboard?.writeText === 'function') clipboard.writeText(text).catch(() => {});
    props.onCopy?.(text, path);
  };
  // Uncontrolled: the nodes toggled so far (the rest follow defaultExpanded).
  const toggled = $signal(R, /** @type {Map<string, boolean>} */ (new Map()));
  const controlled = () => props.expanded !== undefined;
  /** Whether a node is expanded. @param {string} id @param {number} depth */
  const isOpen = (id, depth) => {
    if (controlled()) return (/** @type {string[]} */ (read(props.expanded)) ?? []).includes(id);
    const own = /** @type {Map<string, boolean>} */ ($read(toggled)).get(id);
    if (own !== undefined) return own;
    const max = read(props.maxDepth);
    return max != null && depth >= Number(max) ? false : opensAt(read(props.defaultExpanded), id, depth);
  };
  /** Every expanded node's id in the data, in document order, with `id` set to `open`. @param {string} id @param {boolean} open */
  const openIds = (id, open) => {
    /** @type {string[]} */
    const out = [];
    /** @param {any} v @param {any[]} path @param {number} depth */
    const walk = (v, path, depth) => {
      const type = jsonType(v);
      if (type !== 'object' && type !== 'array') return;
      const at = jsonPathId(path);
      if (at === id ? open : isOpen(at, depth)) out.push(at);
      for (const [k, c] of type === 'array' ? v.map((/** @type {any} */ c, /** @type {number} */ i) => [i, c]) : Object.entries(v)) walk(c, [...path, k], depth + 1);
    };
    walk(read(props.data), [], 0);
    return out;
  };
  /** Opens or closes one node. @param {any[]} path @param {number} depth */
  const toggle = (path, depth) => {
    const id = jsonPathId(path);
    const open = !$untrack(R, () => isOpen(id, depth));
    if (!controlled()) $write(toggled, new Map([...$untrack(R, () => /** @type {Map<string, boolean>} */ ($read(toggled)))]).set(id, open));
    props.onExpandedChange?.($untrack(R, () => openIds(id, open)), { path, open });
  };
  /** A level's indent: `spacing.md`. */
  const indent = () => ui.theme().spacing.md;
  /** A branch's chevron: `sizes.glyph.xs`. */
  const chevronSide = () => ui.theme().sizes.glyph.xs;
  /** A key's label ('name: ' or '0: '). @param {string | number | null} key */
  const keyLabel = key =>
    key === null ? null : <Label {...DECOR} text={`${typeof key === 'number' ? key : JSON.stringify(key)}:`} style={() => ({ color: color('key'), shrink: 0 })} />;
  /**
   * A node: a leaf row, or an expandable row with its children.
   * @param {any} value @param {string | number | null} key @param {any[]} path @param {number} depth
   */
  const Node = (value, key, path, depth) => {
    const type = jsonType(value);
    const rowStyle = /** @returns {Record<string, any>} */ () => ({ direction: 'row', align: 'center', gap: ui.theme().control.iconGap, padding: [1, 0, 1, depth * indent()] });
    const name = path.length === 0 ? (read(props.title) ?? 'root') : path.join('.');
    if (type !== 'object' && type !== 'array') {
      return (
        <View role="treeitem" aria-level={depth + 1} aria-label={name} style={rowStyle}>
          <View style={() => ({ width: chevronSide(), shrink: 0 })} />
          {keyLabel(key)}
          <Action
            label={() => labelsIn().copyPath(path.join('.'))}
            onPress={() => copy(value, path)}
            style={() => ({ background: 'transparent', border: 0, padding: 0, minHeight: 0, radius: 2, color: color(type), cursor: read(props.copyable) === false ? 'default' : 'copy', hover: { background: pageColors(ui.theme(), ui.scheme()).hover } })}
          >
            <Label text={leafText(value)} />
          </Action>
        </View>
      );
    }
    const entries = type === 'array' ? value.map((/** @type {any} */ v, /** @type {number} */ i) => [i, v]) : Object.entries(value);
    const id = jsonPathId(path);
    const open = () => isOpen(id, depth);
    const count = entries.length;
    const brackets = type === 'array' ? ['[', ']'] : ['{', '}'];
    const chevron = () => {
      const c = pageColors(ui.theme(), ui.scheme()).quiet;
      return open() ? [{ kind: 'path', points: [2, 4, 6, 8, 10, 4], stroke: 1.5, color: c }] : [{ kind: 'path', points: [4, 2, 8, 6, 4, 10], stroke: 1.5, color: c }];
    };
    return (
      <View style={{ direction: 'column' }}>
        <Action
          role="treeitem"
          aria-level={depth + 1}
          aria-expanded={state(open)}
          label={name}
          selected={() => /** @type {boolean} */ (open())}
          onPress={() => toggle(path, depth)}
          onKey={(/** @type {any} */ e) => {
            const k = keyOf(e);
            if ((k === 'ArrowRight' && !$untrack(R, () => open())) || (k === 'ArrowLeft' && $untrack(R, () => open()))) {
              e?.preventDefault?.();
              toggle(path, depth);
            }
          }}
          style={/** @returns {Record<string, any>} */ () => ({ ...rowStyle(), background: 'transparent', border: 0, minHeight: 0, radius: 2, justify: 'start', ...pressLook(ui.theme()), color: pageColors(ui.theme(), ui.scheme()).text, hover: { background: pageColors(ui.theme(), ui.scheme()).hover } })}
        >
          <Shape {...DECOR} shapes={chevron} style={() => ({ width: chevronSide(), height: chevronSide(), shrink: 0 })} />
          {key === null ? <Label {...DECOR} text={`${read(props.title) ?? 'root'}:`} style={() => ({ color: color('key') })} /> : keyLabel(key)}
          <Label {...DECOR} text={() => (open() ? brackets[0] : `${brackets[0]}…${brackets[1]}`)} />
          <Show when={() => !open() && read(props.counts) !== false}>
            <Label text={`${count} ${count === 1 ? 'item' : 'items'}`} style={() => ({ color: pageColors(ui.theme(), ui.scheme()).quiet, fontSize: ui.theme().fontSizes.xs })} />
          </Show>
        </Action>
        <Show when={() => /** @type {boolean} */ (open())}>
          <View role="group" style={{ direction: 'column' }}>
            <For each={entries} by="position">
              {(/** @type {() => [string | number, any]} */ entry) => {
                const [k, v] = $untrack(R, entry);
                return Node(v, k, [...path, k], depth + 1);
              }}
            </For>
          </View>
          {/* The closing bracket under the opening one: past the chevron and its gap. */}
          <Label {...DECOR} text={brackets[1]} style={() => ({ padding: [1, 0, 1, depth * indent() + chevronSide() + ui.theme().control.iconGap] })} />
        </Show>
      </View>
    );
  };
  const style = styled(props, (theme, scheme) => ({
    direction: 'column',
    fontSize: theme.fontSizes[/** @type {'sm'} */ (read(props.fontSize) ?? 'sm')] ?? theme.fontSizes.sm,
    color: pageColors(theme, scheme).text,
  }));
  return (
    <View role="tree" {...pass(props)} style={style}>
      {() => Node(read(props.data), null, [], 0)}
    </View>
  );
}
