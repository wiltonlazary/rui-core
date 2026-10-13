// The launcher store, per application root:
// `launcherStore()` makes one; `$launcher()` is the nearest one (a
// <Launcher>'s or LauncherContext's, else the root's own), with
// `isOpen`, `open`, `close` and `toggle`, the search, and `onKey`: the
// shortcut's key handler (<Launcher> hears it root-wide). Also the
// actions' match and their first `limit`.

import { $signal, $read, $write, $untrack, $batch, $closed, $context, $lookup, $unowned, read } from 'ren-core';
import { rooted } from '../../hooks/shared.js';
import { chordOf, eventChords } from '../../hooks/shortcuts.js';

/** @typedef {import('ren-core').Graph} Root */

/**
 * An action.
 * @typedef {object} LauncherAction
 * @property {string=} id
 * @property {string} label
 * @property {string=} hint a line under the label, matched by the default match too
 * @property {any=} start before the label
 * @property {any=} end after the label
 * @property {(string | string[])=} tags more words the default match finds it by
 * @property {boolean=} disabled
 * @property {boolean=} sticky overrides the Launcher's `sticky` (true: it stays open once the action runs)
 * @property {((action: LauncherAction) => void)=} onPress
 */

/** Actions under a label. @typedef {{ label: string, actions: LauncherAction[] }} LauncherGroup */
/** @typedef {LauncherAction | LauncherGroup} LauncherItem */

/**
 * @typedef {object} LauncherStore
 * @property {() => boolean} isOpen whether it is open (tracked)
 * @property {() => void} open
 * @property {() => void} close
 * @property {() => void} toggle
 * @property {() => string} search what is typed in its field (tracked)
 * @property {(search: string) => void} setSearch
 * @property {() => string | string[] | null} shortcut the shortcuts that open it (set by <Launcher shortcut>; 'primary+K')
 * @property {(event: any) => void} onKey the shortcut's handler (<Launcher> hears it root-wide; for keys from elsewhere)
 */

/**
 * A new launcher store on a root (the running one by default).
 * @param {Root} [root]
 * @returns {LauncherStore}
 */
export function launcherStore(root) {
  const R = root ?? rooted([]);
  const state = $signal(R, false);
  const search = $signal(R, '');
  /** @param {() => void} fn */
  const run = fn => {
    if (!$closed(R)) $batch(R, fn);
  };
  /** @type {LauncherStore} */
  const store = {
    isOpen: () => /** @type {boolean} */ ($read(state)),
    open: () => run(() => $write(state, true)),
    close: () => run(() => $write(state, false)),
    toggle: () => run(() => $write(state, !$untrack(R, () => $read(state)))),
    search: () => /** @type {string} */ ($read(search)),
    setSearch: q => run(() => $write(search, q)),
    shortcut: () => 'primary+K',
    onKey(event) {
      const keys = $untrack(R, store.shortcut);
      if (keys == null) return;
      const chords = eventChords(event);
      if (chords.length === 0) return;
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (!chords.includes(chordOf(key))) continue;
        event?.preventDefault?.();
        store.open();
        return;
      }
    },
  };
  return store;
}

/** The store a <Launcher> provides to what is inside it. */
export const LauncherContext = $context(/** @type {LauncherStore | null} */ (null));

/** Each root's own store, made on first use. @type {WeakMap<object, LauncherStore>} */
const own = new WeakMap();

/**
 * The nearest launcher store: the one in context, else the root's own.
 * Call it while a view is built; its methods work from anywhere.
 * @overload
 * @param {Root} root
 * @returns {LauncherStore}
 */
/**
 * @overload
 * @returns {LauncherStore}
 */
/** @param {any[]} args @returns {any} */
export function $launcher(...args) {
  const R = rooted(args);
  const near = /** @type {LauncherStore | null} */ (read($lookup(R, LauncherContext)));
  if (near !== null) return near;
  let store = own.get(R);
  // Made outside the asking scope, so it lives as long as the root: the cache hands it to every later caller.
  if (store === undefined) own.set(R, (store = $unowned(R, () => launcherStore(R))));
  return store;
}

/** Whether an item is a group. @param {LauncherItem} item @returns {item is LauncherGroup} */
export const isGroup = item => Array.isArray(/** @type {any} */ (item).actions);

/**
 * The default match: whether every word of the search, ignoring case, is
 * in the action's label, its hint or one of its tags, in any order ('file
 * new' finds 'New file'); the words may land in different texts. A search
 * of no words matches every action.
 * @param {LauncherAction} action @param {string} search
 * @returns {boolean}
 */
export function launcherMatch(action, search) {
  const words = search.toLowerCase().split(/\s+/).filter(w => w !== '');
  if (words.length === 0) return true;
  const tags = Array.isArray(action.tags) ? action.tags : action.tags == null ? [] : [action.tags];
  const texts = [action.label, action.hint ?? '', ...tags].map(text => String(text).toLowerCase());
  return words.every(w => texts.some(text => text.includes(w)));
}

/**
 * The actions that `match` the search, in their order; a group keeps its
 * matching actions, and a group with none goes.
 * @param {LauncherItem[]} items @param {string} search @param {(action: LauncherAction, search: string) => boolean} match
 * @returns {LauncherItem[]}
 */
export function matching(items, search, match) {
  /** @type {LauncherItem[]} */
  const out = [];
  for (const item of items) {
    if (!isGroup(item)) {
      if (match(item, search)) out.push(item);
      continue;
    }
    const found = item.actions.filter(a => match(a, search));
    if (found.length > 0) out.push({ ...item, actions: found });
  }
  return out;
}

/**
 * The first `max` actions, groups kept: the items laid out as one list of
 * rows (each action with the group it sits in, or none), that list cut to
 * its first `max` rows, and the rows gathered back under their groups.
 * @param {LauncherItem[]} actions @param {number} max
 * @returns {LauncherItem[]}
 */
export function firstActions(actions, max) {
  if (!Number.isFinite(max)) return actions;
  /** @type {{ group: LauncherGroup | null, action: LauncherAction }[]} */
  const rows = actions.flatMap(item => (isGroup(item) ? item.actions.map(action => ({ group: /** @type {LauncherGroup | null} */ (item), action })) : [{ group: null, action: item }]));
  /** @type {LauncherItem[]} */
  const out = [];
  /** The group the last row came from, and its copy in `out`. @type {LauncherGroup | null} */
  let from = null;
  /** @type {LauncherGroup | null} */
  let copy = null;
  for (const { group, action } of rows.slice(0, Math.max(0, max))) {
    if (group === null) out.push(action);
    else if (group === from && copy !== null) copy.actions.push(action);
    else out.push((copy = { ...group, actions: [action] }));
    from = group;
  }
  return out;
}
