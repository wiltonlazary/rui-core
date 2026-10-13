// Tabs: Tabs.List of Tabs.Tab, and Tabs.Panel, sharing the active value
// through a context. The list is one Tab stop (a roving tabIndex); the
// arrow keys (by orientation), Home and End move focus to the next enabled
// tab and activate it, looping by default.

import { Action, View, Label, Show, For, $parts, $context, $lookup, $owner, $active, $cleanup, $signal, $read, $write, $watch, $after, $untrack, read } from 'ren-core';
import { styled } from '../../theme/style.js';
import { $ui } from '../../theme/theme.jsx';
import { variantColors, radiusOf, pageColors, colorOf, flexWord, shadowOf } from '../../theme/resolve.js';
import { pass } from '../layout/layout.jsx';
import { pressOf } from '../buttons/button.jsx';
import { textual, textOf } from '../feedback/feedback.jsx';
import { $navValue } from './state.js';
import { DECOR, flag, state as aria, $uid } from '../../theme/meaning.js';
import { inShownOrder } from '../shown.js';
import { handOn } from '../ref.js';
import { activeOf } from '../overlays/shared.jsx';

/**
 * @typedef {object} TabEntry
 * @property {() => any} value
 * @property {() => boolean} disabled
 * @property {any} node the tab's Action
 */

/**
 * @typedef {object} TabsState
 * @property {{ get: () => any, set: (value: any) => void }} value
 * @property {Record<string, any>} props the Tabs' props
 * @property {TabEntry[]} tabs in the order they were made
 * @property {string} id the base of its tabs' element ids (a panel names itself by its tab)
 * @property {import('ren-core').Writable<number>} made counts the tabs made and gone, so the Tab stop follows them
 * @property {import('ren-core').Writable<any>} roving the value of the tab the arrows moved the focus to without choosing it (`followFocus` false; null: none)
 */

const TabsContext = $context(/** @type {TabsState | null} */ (null));

/** Whether the list sits at the end of the panels (vertical Tabs with `listAt="end"`). @param {TabsState} tabs */
const atEnd = tabs => read(tabs.props.orientation) === 'vertical' && read(tabs.props.listAt) === 'end';

/** The Tabs around a part. @returns {TabsState} */
function tabsOf() {
  const state = /** @type {TabsState | null} */ ($lookup(TabsContext));
  if (state === null) throw new Error('RUI: a Tabs part outside Tabs');
  return state;
}

/**
 * Tabs: `value` (a value, an accessor or a signal) or `defaultValue`,
 * `onChange(value)`, `variant` (line, outline, pill), `orientation`
 * (horizontal or vertical), `listAt` (vertical tabs: the list at the
 * 'start' of the panels, or the 'end': a grid of the panels' column and
 * the list's, whatever their order), `color`, `radius`, `persistent`
 * (hidden panels stay built), `followFocus` (true: the arrow keys choose
 * the tab they move to), `loop` (true), `deselectable` (a press on the
 * active tab deselects it: the value clears).
 *
 * Every tab is an Action, and the list is one Tab stop: the active tab
 * (the first enabled one while none is), or the tab the arrows moved the
 * focus to without choosing it, takes `tabIndex` 0, the others -1, reached
 * by the arrows (wrapping unless `loop` is false, past disabled tabs),
 * Home and End. A press on one gives it the focus.
 *
 * Its look: a tab is an option-high row (`theme.control.optionPad`'s
 * height, `theme.control.pad.sm` at its sides) with its text at the body
 * size (md) in the strong weight. The list (line and outline) stands on a
 * hairline rule (a Divider's xs thickness: the page's rule, the border
 * role for outline); the line variant marks the active tab with a
 * rounded bar in the tone, a Divider's lg thickness, set in by the tab's
 * side padding (vertical: by its top and bottom padding); the outline
 * variant raises the active tab (the raised ground, shadow xs) with a
 * tone edge on its side away from the list (a Divider's md thickness)
 * and no side borders.
 * @param {Record<string, any>} props
 */
export function Tabs(props) {
  const R = $active();
  /** @type {TabsState} */
  const state = { value: $navValue(props, null), props, tabs: [], id: $uid('tabs'), made: $signal(R, 0), roving: $signal(R, null) };
  // A tab chosen (by a press, the arrows or the value from outside) is the Tab stop again.
  $watch(R, () => state.value.get(), () => $write(state.roving, null));
  const vertical = () => read(props.orientation) === 'vertical';
  const style = styled(props, () =>
    atEnd(state)
      ? { display: 'grid', columns: '1fr auto', rows: 'auto', align: 'stretch' }
      : { direction: vertical() ? 'row' : 'column', align: 'stretch' },
  );
  return (
    <TabsContext value={state}>
      <View {...pass(props)} style={style}>
        {textOf(props.children)}
      </View>
    </TabsContext>
  );
}

/**
 * The row (or column) of tabs: `fill` (the tabs share the width),
 * `justify` ('start', 'center', 'end', 'between', 'around' or 'evenly': the portable
 * style's words).
 * @param {Record<string, any>} props
 */
export function TabsList(props) {
  const ui = $ui();
  const tabs = tabsOf();
  const vertical = () => read(tabs.props.orientation) === 'vertical';
  const variant = () => read(tabs.props.variant) ?? 'line';
  const style = styled(props, theme => ({
    direction: vertical() ? 'column' : 'row',
    wrap: !vertical(),
    align: 'stretch',
    justify: /** @type {any} */ (flexWord(read(props.justify)) ?? 'start'),
    gap: variant() === 'pill' ? theme.spacing.xs / 2 : 0,
    shrink: 0,
    ...(atEnd(tabs) ? { column: '2', row: '1' } : null),
  }));
  const line = () => {
    const theme = ui.theme();
    const width = ui.theme().sizes.divider.xs;
    const color = variant() === 'outline' ? pageColors(theme, ui.scheme()).border : pageColors(theme, ui.scheme()).rule;
    if (variant() === 'pill') return { position: 'absolute', width: 0, height: 0 };
    return vertical()
      ? { position: 'absolute', top: 0, bottom: 0, [atEnd(tabs) ? 'left' : 'right']: 0, width, background: color }
      : { position: 'absolute', left: 0, right: 0, bottom: 0, height: width, background: color };
  };
  return (
    <View role="tablist" aria-orientation={() => (vertical() ? 'vertical' : 'horizontal')} {...pass(props)} style={style}>
      <View {...DECOR} style={/** @type {any} */ (line)} />
      {read(props.fill) ? <FillTabs>{props.children}</FillTabs> : props.children}
    </View>
  );
}

/**
 * The list's one Tab stop: the tab the arrows moved the focus to without
 * choosing it, else the active tab, else the first enabled tab (none while
 * every tab is disabled).
 * @param {TabsState} tabs @returns {TabEntry | null}
 */
function stopOf(tabs) {
  $read(tabs.made);
  const target = $read(tabs.roving) ?? tabs.value.get();
  const found = target == null ? undefined : tabs.tabs.find(t => t.value() === target && !t.disabled());
  return found ?? tabs.tabs.find(t => !t.disabled()) ?? null;
}

/** Tabs that share the list's width, each tab as rendered. @param {{ children?: any }} props */
function FillTabs(props) {
  return <For each={$parts(props.children)}>{part => <View style={{ grow: 1, width: 0, align: 'stretch' }}>{part}</View>}</For>;
}

/**
 * A tab: `value`, `start`, `end`, `disabled`, `color`, `onPress`; its
 * children are its text. It means a tab (`aria-selected`
 * while active); Tabs.List a `tablist`, Tabs.Panel a `tabpanel`. It is
 * an Action, in the Tab order while it is the list's Tab stop (Tabs).
 * @param {Record<string, any>} props
 */
export function TabsTab(props) {
  const ui = $ui();
  const tabs = tabsOf();
  const R = $active();
  const vertical = () => read(tabs.props.orientation) === 'vertical';
  const variant = () => read(tabs.props.variant) ?? 'line';
  const active = () => tabs.value.get() === read(props.value);
  const disabled = () => read(props.disabled) === true;
  const color = () => colorOf(ui.theme(), ui.scheme(), read(props.color) ?? read(tabs.props.color));
  /** @type {TabEntry} */
  const entry = { value: () => read(props.value), disabled, node: null };
  tabs.tabs.push(entry);
  // Once the flush that made it is done (a tab is built where state is read only, in a list's row too): the stop
  // may move to it.
  $after(R, () => $write(tabs.made, $untrack(R, () => $read(tabs.made)) + 1));
  const owner = $owner($active());
  if (owner != null)
    $cleanup(/** @type {any} */ (owner), () => {
      const at = tabs.tabs.indexOf(entry);
      if (at >= 0) tabs.tabs.splice(at, 1);
      // Once the flush that removed it is done: the stop may move to another tab.
      $after(R, () => $write(tabs.made, $untrack(R, () => $read(tabs.made)) + 1));
    });
  const style = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    const v = variant();
    const on = active();
    const hover = pageColors(theme, scheme).hover;
    const r = radiusOf(theme, read(tabs.props.radius));
    // Rounded away from the list's line (pill: all four).
    const radius = v === 'pill' ? r : vertical() ? (atEnd(tabs) ? [0, r, r, 0] : [r, 0, 0, r]) : [r, r, 0, 0];
    const base = {
      padding: [theme.control.optionPad[0], theme.control.pad.sm],
      fontSize: theme.fontSizes.md,
      fontWeight: theme.weights.strong,
      textAlign: vertical() ? 'start' : 'center',
      radius,
      color: page.text,
      cursor: disabled() ? 'not-allowed' : 'pointer',
      ...(disabled() ? { opacity: theme.opacity.disabled } : null),
    };
    if (v === 'pill') {
      const c = variantColors(theme, scheme, 'solid', read(props.color) ?? read(tabs.props.color));
      return { ...base, border: 0, background: on ? c.background : 'transparent', color: on ? c.color : page.text, ...(on || disabled() ? null : { hover: { background: hover } }) };
    }
    if (v === 'outline') {
      // The active tab is raised (the raised ground, shadow xs) with a tone
      // edge on the side away from the list (a Divider's md thickness); no
      // side borders.
      const outer = vertical() ? (atEnd(tabs) ? 'borderRight' : 'borderLeft') : 'borderTop';
      return {
        ...base,
        border: 0,
        ...(on ? { [outer]: theme.sizes.divider.md, borderColor: color(), background: page.raised, shadow: shadowOf(theme, 'xs') } : { background: 'transparent' }),
        ...(on || disabled() ? null : { hover: { background: hover } }),
      };
    }
    return { ...base, border: 0, background: 'transparent', ...(disabled() ? null : { hover: { background: hover } }) };
  });
  // The line variant's bar under (or beside) the active tab (the outline
  // variant's active tab carries its tone edge on its outer side).
  const mark = () => {
    const v = variant();
    if (!active() || v !== 'line') return { position: 'absolute', width: 0, height: 0 };
    const theme = ui.theme();
    const shared = { position: 'absolute', background: color(), radius: theme.radius.round };
    const inset = theme.control.pad.sm;
    return vertical()
      ? { ...shared, top: theme.control.optionPad[0], bottom: theme.control.optionPad[0], [atEnd(tabs) ? 'left' : 'right']: 0, width: theme.sizes.divider.lg }
      : { ...shared, left: inset, right: inset, bottom: 0, height: theme.sizes.divider.lg };
  };
  const press = pressOf(props);
  /** Once the flush shows `to` as the Tab stop's Action, it takes the focus. @param {TabEntry} to */
  const refocus = to => $after(R, () => to.node?.focus?.());
  const onPress = (/** @type {any} */ e) => {
    if (disabled()) return;
    $write(tabs.roving, null);
    const value = read(props.value);
    if (active()) {
      if (read(tabs.props.deselectable)) tabs.value.set(null);
    } else tabs.value.set(value);
    // The pressed tab takes the focus, so the arrows go on from it.
    refocus(entry);
    press?.(e);
  };
  const onKey = (/** @type {{ key: string, preventDefault?: () => void }} */ e) => {
    const back = vertical() ? 'ArrowUp' : 'ArrowLeft';
    const forth = vertical() ? 'ArrowDown' : 'ArrowRight';
    // In the order shown: a tab shown later registers last.
    const list = inShownOrder(tabs.tabs).filter(t => !t.disabled());
    if (list.length === 0) return;
    const at = list.indexOf(entry);
    const loop = read(tabs.props.loop) !== false;
    let next = -1;
    if (e.key === forth) next = at + 1 < list.length ? at + 1 : loop ? 0 : at;
    else if (e.key === back) next = at > 0 ? at - 1 : loop ? list.length - 1 : at;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else return;
    e.preventDefault?.();
    const to = list[next];
    // The tab moved to is the Tab stop, chosen or (followFocus false) only focused; it takes the focus.
    if (read(tabs.props.followFocus) !== false) tabs.value.set(to.value());
    else $write(tabs.roving, to.value());
    refocus(to);
  };
  const stop = () => stopOf(tabs) === entry;
  // The Tab stop moved off this tab while it had the focus (a value from outside): the focus follows it.
  $watch(
    R,
    () => ({ stop: stop(), had: entry.node != null && activeOf(entry.node) === entry.node }),
    seen => {
      if (seen.stop || !seen.had) return;
      const to = stopOf(tabs);
      if (to !== null) refocus(to);
    },
  );
  const ref = (/** @type {any} */ node) => {
    entry.node = node;
    handOn(props.ref, node);
  };
  const text = () => ({ wrap: false });
  const id = () => tabIdOf(tabs, read(props.value));
  const content = () => [
    <View style={() => ({ direction: 'row', align: 'center', justify: vertical() ? 'start' : 'center', gap: ui.theme().control.iconGap })}>
      {props.start === undefined ? null : <View style={{ direction: 'row', align: 'center' }}>{props.start}</View>}
      {textual(props.children) ? <Label text={props.children} style={text} /> : props.children}
      {props.end === undefined ? null : <View style={{ direction: 'row', align: 'center' }}>{props.end}</View>}
    </View>,
    <View {...DECOR} style={/** @type {any} */ (mark)} />,
  ];
  // One Tab stop: this tab is in the Tab order while it is the stop; the arrows reach the others.
  return (
    <Action
      ref={ref}
      id={id}
      role="tab"
      aria-selected={aria(active)}
      aria-disabled={flag(disabled)}
      label={props.label}
      selected={active}
      tabIndex={() => (stop() ? 0 : -1)}
      onPress={onPress}
      onKey={onKey}
      style={style}
    >
      {content()}
    </Action>
  );
}

/**
 * A tab's element id from its Tabs' id and its value: anything but an ASCII letter, digit or `-`
 * (an `_` too) becomes `_` its code in hex `_`, so two values never meet in one id.
 * @param {{ id: string }} tabs @param {unknown} value
 */
const tabIdOf = (tabs, value) => `${tabs.id}-${String(value).replace(/[^A-Za-z0-9-]/g, c => `_${c.charCodeAt(0).toString(16)}_`)}`;

/**
 * The content of the tab with the same `value`, shown while it is active
 * (kept built and hidden otherwise with the Tabs' `persistent`).
 * @param {Record<string, any>} props
 */
export function TabsPanel(props) {
  const tabs = tabsOf();
  const active = () => tabs.value.get() === read(props.value);
  const style = styled(props, () => ({ grow: 1, ...(atEnd(tabs) ? { column: '1', row: '1', minWidth: 0 } : null) }));
  if (read(tabs.props.persistent))
    return (
      <View role="tabpanel" aria-labelledby={() => tabIdOf(tabs, read(props.value))} {...pass(props)} hidden={() => !active()} style={style}>
        {textOf(props.children)}
      </View>
    );
  return (
    <Show when={active}>
      <View role="tabpanel" aria-labelledby={() => tabIdOf(tabs, read(props.value))} {...pass(props)} style={style}>
        {textOf(props.children)}
      </View>
    </Show>
  );
}
Tabs.List = TabsList;
Tabs.Tab = TabsTab;
Tabs.Panel = TabsPanel;
