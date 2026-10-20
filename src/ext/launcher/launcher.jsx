// <Launcher>: the action center on a Modal:
// a search field, the actions that match it (groups, a maximum, the search
// highlighted), chosen with the keyboard as the combobox's list (ArrowUp and
// ArrowDown, Enter; Escape closes) or by press; shown by its
// store (`$launcher().open()`) or its shortcut, heard root-wide (ren-core's
// `$keys`), with or without a focus in the application.

import { View, Label, Action, Edit, Scroll, Show, For, read, $active, $memo, $read, $untrack, $watch, $owner, $cleanup, $keys } from 'ren-core';
import { styled, pressLook } from '../../theme/style.js';
import { $ui } from '../../theme/theme.jsx';
import { pageColors, fontBelow } from '../../theme/resolve.js';
import { Modal } from '../../core/overlays/index.js';
import { focus, keyOf, prevent, activeOf, ActionRow } from '../../core/overlays/shared.jsx';
import { $combobox } from '../../core/combobox/store.js';
import { Highlight } from '../../core/typography/index.js';
import { LauncherContext, $launcher, launcherMatch, firstActions, matching, isGroup } from './store.js';
import { DECOR, flag, state, $uid } from '../../theme/meaning.js';
import { $nextFrame } from '../../core/misc/tween.js';
import { labelsIn } from '../../theme/labels.js';

/** @typedef {import('./store.js').LauncherAction} LauncherAction */
/** @typedef {import('./store.js').LauncherItem} LauncherItem */
/** @typedef {{ label: string | null, key: string, entries: { action: LauncherAction, index: number, key: string }[] }} Run */

/**
 * Items as runs of actions by group, each with its place in the keyboard's
 * order. Each run and entry is keyed by its `id` when it has one, else by
 * its index path, so labels may repeat.
 * @param {LauncherItem[]} items @returns {Run[]}
 */
function runsOf(items) {
  /** @type {Run[]} */
  const runs = [];
  let index = 0;
  items.forEach((item, i) => {
    if (isGroup(item)) {
      const group = /** @type {any} */ (item).id;
      runs.push({ label: item.label, key: group != null ? `id:${group}` : `${i}`, entries: item.actions.map((action, j) => ({ action, index: index++, key: action.id != null ? `id:${action.id}` : `${i}.${j}` })) });
    } else {
      const last = runs.at(-1);
      const entry = { action: item, index: index++, key: item.id != null ? `id:${item.id}` : `${i}` };
      if (last !== undefined && last.label === null) last.entries.push(entry);
      else runs.push({ label: null, key: `${i}`, entries: [entry] });
    }
  });
  return runs;
}

/**
 * The action center: `actions` (actions `{ id, label, hint, tags, start,
 * end, disabled, sticky, onPress }`, or groups `{ label, actions }`),
 * `store` (the nearest by default: `$launcher()`), `shortcut`
 * ('primary+K', a list, or null), `fields` (false: the shortcut is not
 * heard from a text field, the event's `editable`; true hears it there
 * too), `match(action, search)` (whether an action shows; by default
 * `launcherMatch`: the label, the hint or a tag holds the search), `limit`
 * (the actions shown at most), `empty` ('No matches'), `highlight` (the
 * search marked in the labels), `height` (`sizes.box.launcher.list`, 360: the list's most, past which
 * it scrolls), `search` with `onSearchChange` (controlled) or
 * `defaultSearch`, `keepSearch` (false: closing clears the search),
 * `sticky` (false: running an action closes it), `loop` (true: the arrow
 * keys wrap), `placeholder` ('Find an
 * action'), `start` (before the field), `onOpenChange(open)`, and Modal's
 * look (`size` `sizes.box.launcherWidth` (640), `offset` `sizes.box.launcher.offset` (96) from the top, `radius`, `shadow`, `layer`,
 * `motion`, `backdrop`, `portal`). The field is as tall as an xl field in
 * the lg type; the actions are padded as options, a group's label a step
 * below their type in the strong weight, and the empty text sits where an
 * action would. The
 * shortcut is heard anywhere in the application root (ren-core's `$keys`),
 * nothing focused too. Closing gives the focus back where it was before
 * opening, unless the action that closed it moved the focus itself (to the
 * page it opened). `children` go inside, where `$launcher()` finds this
 * store.
 * @param {Record<string, any>} props
 */
export function Launcher(props) {
  const R = $active();
  const ui = $ui();
  const store = props.store ?? $launcher(R);
  store.shortcut = () => (props.shortcut === undefined ? 'primary+K' : read(props.shortcut));
  // The shortcut from anywhere in the root; from a text field (the event's
  // `editable`) only with `fields`.
  const fields = () => read(props.fields) === true;
  $keys(e => {
    if (e.editable === true && !fields()) return;
    store.onKey(e);
  });
  const controlled = () => props.search !== undefined;
  if (props.defaultSearch !== undefined && !$untrack(R, controlled)) store.setSearch(String($untrack(R, () => read(props.defaultSearch)) ?? ''));
  const search = () => String((controlled() ? read(props.search) : store.search()) ?? '');
  /** @param {string} q */
  const setSearch = q => {
    if (!$untrack(R, controlled)) store.setSearch(q);
    props.onSearchChange?.(q);
  };
  const list = $combobox({ loop: props.loop ?? true });
  const shown = $memo(R, () => {
    const items = /** @type {LauncherItem[]} */ (read(props.actions) ?? []);
    const most = read(props.limit);
    return runsOf(firstActions(matching(items, search(), props.match ?? launcherMatch), typeof most === 'number' ? most : Infinity));
  });
  const count = () => /** @type {Run[]} */ ($read(shown)).reduce((n, run) => n + run.entries.length, 0);
  /** @type {any} */
  let field = null;
  const next = $nextFrame();
  let seen = $untrack(R, store.isOpen);
  /** An action that ran moved the focus itself (to a page it opened): closing then leaves it there. */
  let moved = false;
  $watch(R, store.isOpen, open => {
    if (open === seen) return;
    seen = open;
    if (open) moved = false;
    list.reset();
    props.onOpenChange?.(open);
    if (open) next(() => focus(field));
    else if (read(props.keepSearch) !== true) setSearch('');
  });
  $watch(R, search, () => list.reset());
  const keys = (/** @type {any} */ e) => {
    const key = keyOf(e);
    if (key === 'ArrowDown') {
      prevent(e);
      list.next();
    } else if (key === 'ArrowUp') {
      prevent(e);
      list.previous();
    } else if (key === 'Enter') {
      if (list.pick()) prevent(e);
    }
  };
  /** @param {LauncherAction} action */
  const trigger = action => {
    if (action.disabled === true) return;
    const from = activeOf(field);
    action.onPress?.(action);
    if (action.sticky ?? read(props.sticky) === true) return;
    moved = activeOf(field) !== from;
    store.close();
  };
  const fieldStyle = styled({}, (theme, scheme) => ({
    height: theme.sizes.control.xl,
    minHeight: theme.sizes.control.xl,
    padding: [0, theme.spacing.md],
    border: 0,
    radius: 0,
    // Its panel draws its focus ring, along its corners.
    ring: false,
    background: 'transparent',
    color: pageColors(theme, scheme).text,
    fontSize: theme.fontSizes.lg,
    grow: 1,
  }));
  const line = styled({}, (theme, scheme) => ({ height: 1, minHeight: 1, background: pageColors(theme, scheme).rule }));
  const groupLabel = styled({}, (theme, scheme) => {
    const [, x] = theme.control.optionPad;
    return { color: pageColors(theme, scheme).quiet, fontSize: fontBelow(theme, theme.fontSizes.sm), fontWeight: theme.weights.strong, padding: [theme.spacing.sm, x, theme.control.labelGap, x] };
  });
  const none = styled({}, (theme, scheme) => ({ color: pageColors(theme, scheme).quiet, padding: theme.control.optionPad, fontSize: theme.fontSizes.sm }));
  const listStyle = styled({}, theme => ({ direction: 'column', padding: theme.control.panelPad }));
  const actions = (
    <View role="listbox" style={listStyle}>
      <For each={shown} by={(/** @type {Run} */ run) => run.key}>
        {(/** @type {() => Run} */ run) => (
          <View role={() => (run().label ? 'group' : 'presentation')} aria-label={() => run().label || undefined} style={{ direction: 'column' }}>
            {() => (run().label ? <Label {...DECOR} text={run().label ?? ''} style={groupLabel} /> : null)}
            <For each={() => run().entries} by={(/** @type {Run['entries'][number]} */ e) => e.key}>
              {(/** @type {() => Run['entries'][number]} */ entry) => <Item entry={entry} list={list} trigger={trigger} search={search} highlight={props.highlight} />}
            </For>
          </View>
        )}
      </For>
      <Show when={() => count() === 0 && props.empty !== null && props.empty !== false}>
        {props.empty === undefined || typeof props.empty === 'string' || typeof props.empty === 'function' ? <Label text={props.empty ?? (() => labelsIn().noMatches)} style={none} /> : <View style={none}>{props.empty}</View>}
      </Show>
    </View>
  );
  return (
    <LauncherContext value={store}>
      {props.children === undefined ? null : (
        <View style={() => ({ direction: 'column', ...read(props.style) })}>
          {props.children}
        </View>
      )}
      <Modal
        open={store.isOpen}
        onOpenChange={(/** @type {boolean} */ open) => (open ? store.open() : store.close())}
        closable={false}
        trap={false}
        refocus={() => !moved}
        padding={0}
        size={() => read(props.size) ?? ui.theme().sizes.box.launcherWidth}
        offset={() => ({ y: read(props.offset) ?? ui.theme().sizes.box.launcher.offset })}
        radius={props.radius}
        style={{ ring: 'inner' }}
        shadow={props.shadow}
        layer={props.layer}
        motion={props.motion}
        backdrop={props.backdrop}
        portal={props.portal}
      >
        <View style={{ direction: 'row', align: 'center' }}>
          {props.start === undefined ? null : <View style={() => ({ padding: [0, 0, 0, ui.theme().spacing.md], color: pageColors(ui.theme(), ui.scheme()).quiet })}>{props.start}</View>}
          <Edit
            ref={(/** @type {any} */ n) => (field = n)}
            value={search}
            label={() => String(read(props.placeholder) ?? labelsIn().findAction)}
            role="combobox"
            aria-expanded="true"
            aria-activedescendant={() => list.activeId()}
            onChange={(/** @type {any} */ e) => setSearch(String(e?.value ?? ''))}
            onKey={keys}
            style={fieldStyle}
          />
        </View>
        <View {...DECOR} style={line} />
        <Scroll style={() => ({ maxHeight: read(props.height) ?? ui.theme().sizes.box.launcher.list, direction: 'column' })}>{actions}</Scroll>
      </Modal>
    </LauncherContext>
  );
}

/**
 * One action: its start, label (the search highlighted), hint
 * and end, selected by the keyboard or pressed.
 * @param {{ entry: () => { action: LauncherAction, index: number }, list: import('../../core/combobox/store.js').ComboboxHandle, trigger: (action: LauncherAction) => void, search: () => string, highlight: any }} p
 */
function Item(p) {
  const R = $active();
  const ui = $ui();
  const action = () => p.entry().action;
  const a = $untrack(R, action);
  /** @type {import('../../core/combobox/store.js').OptionRecord} */
  const record = { value: () => action().id ?? action().label, disabled: () => action().disabled === true, order: () => p.entry().index, press: () => p.trigger($untrack(R, action)), node: null, id: $uid('action') };
  const remove = p.list.register(record);
  const owner = $owner(R);
  if (owner != null) $cleanup(/** @type {any} */ (owner), remove);
  const selected = () => p.list.active() === p.entry().index;
  // Shown active, it is the search field's active descendant; leaving, or gone, it lets go.
  $watch(R, selected, on => (on ? p.list.markActive(/** @type {string} */ (record.id)) : undefined));
  const style = styled({}, (theme, scheme) => {
    const hover = pageColors(theme, scheme).hover;
    return {
      direction: 'row',
      align: 'center',
      justify: 'start',
      gap: theme.control.iconGap,
      minHeight: 0,
      padding: theme.control.optionPad,
      radius: theme.radius.sm,
      border: 0,
      background: selected() ? hover : 'transparent',
      color: pageColors(theme, scheme).text,
      ...(action().disabled === true ? { opacity: theme.opacity.disabled, ...pressLook(theme, true) } : { ...pressLook(theme), hover: { background: hover } }),
    };
  });
  const hint = styled({}, (theme, scheme) => ({ color: pageColors(theme, scheme).quiet, fontSize: theme.fontSizes.xs }));
  const labelStyle = styled({}, theme => ({ fontSize: theme.fontSizes.sm }));
  return (
    <Action
      ref={(/** @type {any} */ n) => (record.node = n)}
      id={record.id}
      role="option"
      aria-selected={state(selected)}
      aria-disabled={flag(() => action().disabled === true)}
      label={() => action().label}
      onPress={() => p.trigger($untrack(R, action))} style={style}>
      <ActionRow gap={() => ui.theme().control.iconGap}>
        {a.start === undefined ? null : <View style={{ shrink: 0 }}>{a.start}</View>}
        <View style={{ direction: 'column', grow: 1, shrink: 1, minWidth: 0 }}>
          {read(p.highlight) === true ? (
            <Highlight match={p.search} size="sm">
              {() => action().label}
            </Highlight>
          ) : (
            <Label text={() => action().label} style={labelStyle} />
          )}
          {a.hint === undefined ? null : <Label text={() => action().hint ?? ''} style={hint} />}
        </View>
        {a.end === undefined ? null : <View style={{ shrink: 0 }}>{a.end}</View>}
      </ActionRow>
    </Action>
  );
}
