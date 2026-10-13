// Menu: a Popover whose panel holds items (Actions) walked
// with the arrow keys, Home and End and by typing their first letters,
// chosen by a press or Enter, closed by Escape, Tab or a choice; branches
// (Menu.Branch) open beside their item by hovering it or ArrowRight; checkbox
// and radio items keep the menu open. Menubar (menubar.jsx) rows menus:
// in its bar a menu's open state is the bar's, and ArrowLeft and
// ArrowRight in its panel step to the neighbor menus.

import { View, Label, Action, Shape, read, $active, $context, $lookup, $owner, $cleanup, $untrack, $watch } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { styled } from '../../theme/style.js';
import { pageColors, colorOf, radiusOf, shadowOf } from '../../theme/resolve.js';
import { alpha } from '../../theme/colors.js';
import { $popover, PopoverContext, PopoverTrigger, Panel } from './popover.jsx';
import { $controlled, focus, keyOf, prevent, ActionRow, checkFigures, partOf } from './shared.jsx';
import { DECOR, flag, marks, state } from '../../theme/meaning.js';
import { $typeAhead } from '../misc/type-ahead.js';
import { Chevron } from '../data/parts.jsx';
import { MOTION } from '../../theme/motion.js';
import { inShownOrder } from '../shown.js';

/**
 * @typedef {{ node: any, disabled: () => boolean, text: () => string, opens: boolean }} MenuRecord
 * @typedef {{ step: (key: string) => boolean }} MenuSeat a menu's place in a bar: `step` opens the neighbor ArrowLeft or ArrowRight names, false when there is none
 * @typedef {{ join: (props: Record<string, any>) => { root: Record<string, any>, take: (store: MenuStore) => MenuSeat } }} MenuBar
 * @typedef {import('./popover.jsx').PopoverStore & { items: MenuRecord[], sticky: () => boolean, move: (from: any, key: string) => void, typeAhead: (e: any) => boolean, closeAll: () => void, parent: MenuStore | null, seat: MenuSeat | null }} MenuStore
 */

/** The menu an item belongs to. */
const MenuContext = $context(/** @type {MenuStore | null} */ (null));

/** The bar a menu sits in (Menubar's), which seats it. */
export const MenubarContext = $context(/** @type {MenuBar | null} */ (null));

/**
 * The text an item is found by when typed: its label, or its children
 * when they are text (the type-ahead folds case and accents).
 * @param {Record<string, any>} props
 */
const itemText = props => () => {
  const c = typeof props.children === 'string' || typeof props.children === 'number' || typeof props.children === 'function' ? read(props.children) : read(props.label);
  return String(c ?? '');
};

/**
 * A menu's state over a popover's: the items in order, the walk by the
 * arrow keys, the type-ahead, and closing up through the parent menus.
 * @param {Record<string, any>} root @param {'click' | 'hover'} mode @param {boolean} hovers @param {MenuStore | null} parent
 * @returns {MenuStore}
 */
function $menuStore(root, mode, hovers, parent) {
  const popover = $popover(root, mode, hovers);
  /** The item the key being typed came from. @type {any} */
  let from = null;
  /** The items in the order they are shown (they register in the order they are built). */
  const shown = () => inShownOrder(store.items);
  /** The items in shown order for the key being typed: ordered once per key. @type {MenuRecord[]} */
  let walked = [];
  const seek = $typeAhead({
    count: () => walked.length,
    text: i => walked[i].text(),
    skip: i => walked[i].disabled(),
    at: () => walked.findIndex(i => i.node === from),
    go: i => focus(walked[i].node),
  });
  // Reopened, the menu starts a fresh search.
  $watch($active(), popover.isOpen, open => (open ? undefined : seek.clear()));
  /** @type {MenuStore} */
  const store = Object.assign(popover, {
    /** @type {MenuRecord[]} */
    items: [],
    parent,
    seat: null,
    sticky: () => read(root.sticky) === true,
    closeAll() {
      store.close();
      parent?.closeAll();
    },
    /** @param {any} from @param {string} key */
    move(from, key) {
      const list = shown().filter(i => !i.disabled()).map(i => i.node);
      if (list.length === 0) return;
      const at = list.indexOf(from);
      const loop = read(root.loop) !== false;
      let to = at;
      if (key === 'Home') to = 0;
      else if (key === 'End') to = list.length - 1;
      else if (key === 'ArrowDown') to = at < 0 ? 0 : at + 1 >= list.length ? (loop ? 0 : at) : at + 1;
      else if (key === 'ArrowUp') to = at < 0 ? list.length - 1 : at - 1 < 0 ? (loop ? list.length - 1 : at) : at - 1;
      focus(list[to]);
    },
    /** @param {any} e */
    typeAhead(e) {
      from = e?.target ?? null;
      walked = shown();
      return seek.key(e);
    },
  });
  store.first = () => shown().find(i => !i.disabled())?.node ?? null;
  store.arrow = key => store.move(null, key === 'ArrowUp' ? 'End' : 'Home');
  return store;
}

/**
 * A menu: `Menu.Trigger` and `Menu.Panel` holding
 * `Menu.Item`, `Menu.Label`, `Menu.Divider`, `Menu.Branch`,
 * `Menu.CheckboxItem` (in a `Menu.CheckboxGroup` or alone) and
 * `Menu.RadioItem` (in a `Menu.RadioGroup`). Popover's props (`open`,
 * `defaultOpen`, `onOpenChange`, `at` 'bottom', `offset` 6, `width`,
 * `arrow`, `portal`, `collision`, `persistent`, `shadow` 'md', `layer`,
 * …), `openOn` ('press', 'hover' or 'both': a press toggles and hovering
 * opens), `sticky` (false: a choice closes the menu), `loop` (true: the
 * arrows wrap), `openDelay`, `closeDelay`, `tabbable` (false: Tab closes
 * the menu; true: Tab moves among the items, as the focus order, and
 * keeps it open). Typing letters focuses the next item starting with
 * them.
 * @param {Record<string, any>} props
 */
export function Menu(props) {
  const bar = /** @type {MenuBar | null} */ ($lookup(MenubarContext));
  const joined = bar === null ? null : bar.join(props);
  const root = joined === null ? { shadow: 'md', ...props } : joined.root;
  const openOn = read(root.openOn);
  const store = $menuStore(root, openOn === 'hover' ? 'hover' : 'click', openOn === 'hover' || openOn === 'both', null);
  if (joined !== null) store.seat = joined.take(store);
  return (
    <PopoverContext value={store}>
      <MenuContext value={store}>{props.children}</MenuContext>
    </PopoverContext>
  );
}

/** The menu in context. */
export function $menu() {
  const store = /** @type {MenuStore | null} */ ($lookup(MenuContext));
  if (store === null) throw new Error('RUI: Menu.Item, Menu.Trigger and Menu.Panel go inside a Menu');
  return store;
}

/** The trigger: Popover.Trigger's; its control says it opens a menu (`aria-haspopup`, `aria-expanded`). @param {Record<string, any>} props */
export function MenuTrigger(props) {
  return <PopoverTrigger {...props} __popup="menu" />;
}

/**
 * The panel: the items, walked with ArrowDown, ArrowUp, Home and End
 * and found by typing; Tab closes it (unless the menu is `tabbable`). A
 * branch's closes by ArrowLeft or Escape, the focus back on its item.
 * @param {Record<string, any>} props
 */
export function MenuPanel(props) {
  const store = $menu();
  const root = store.props;
  const look = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    return {
      background: page.raised,
      color: page.text,
      border: 1,
      borderColor: pageColors(theme, scheme).rule,
      radius: radiusOf(theme, read(root.radius)),
      shadow: shadowOf(theme, read(root.shadow)),
      padding: theme.control.panelPad,
      direction: 'column',
      minWidth: read(root.width) == null ? theme.sizes.box.menu : undefined,
    };
  });
  const onKey = (/** @type {any} */ e) => {
    const key = keyOf(e);
    // A branch's keys stay in it (inline, it sits in its parent's panel).
    const stop = () => (store.parent !== null ? e?.stopPropagation?.() : undefined);
    // In a bar, ArrowRight (off a branch's item, which opens its branch) and ArrowLeft in the root panel step to the neighbor menu.
    const top = topOf(store);
    const steps = (key === 'ArrowRight' && store.items.find(i => i.node === e?.target)?.opens !== true) || (key === 'ArrowLeft' && store.parent === null);
    if (steps && top.seat !== null && top.seat.step(key)) {
      prevent(e);
      stop();
    } else if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
      prevent(e);
      store.move(e?.target, key);
      stop();
    } else if (store.parent !== null && (key === 'ArrowLeft' || key === 'Escape')) {
      prevent(e);
      store.close();
      focus(store.trigger());
      stop();
    } else if (key === 'Tab') {
      if (read(root.tabbable) !== true) store.closeAll();
    } else if (store.typeAhead(e)) {
      prevent(e);
      stop();
    }
    props.onKey?.(e);
  };
  return (
    // While an app's menu is open, the browser's own never opens over it or its backdrop: a menu a right press opens
    // (ContextMenu) lies under the pointer before the browser's contextmenu event comes.
    <Panel store={store} look={look} onKey={onKey} role="menu" prevent="contextmenu">
      {props.children}
    </Panel>
  );
}

/** The root menu a branch opens from (or the menu itself). @param {MenuStore} store */
const topOf = store => {
  let s = store;
  while (s.parent !== null) s = s.parent;
  return s;
};

/** Menu item colors: the text (a `color`, else the page's) and the hover background. @param {any} theme @param {'light' | 'dark'} scheme @param {any} color */
function itemColors(theme, scheme, color) {
  const page = pageColors(theme, scheme);
  if (color == null) return { text: page.text, hover: pageColors(theme, scheme).hover };
  const c = colorOf(theme, scheme, color);
  return { text: c, hover: alpha(c, theme.opacity.faint) };
}

/**
 * An item (Menu.Item): its children as the label,
 * `start`, `end`, `color`, `disabled`, `onPress`, `sticky` (the menu's
 * by default; unless sticky, a choice closes the branches and the menus
 * they open from). Enter or Space chooses it. `onKey` hears its keys
 * first.
 * @param {Record<string, any>} props
 */
export function MenuItem(props) {
  const store = $menu();
  const R = $active();
  const ui = $ui();
  const disabled = () => read(props.disabled) === true;
  /** @type {MenuRecord} */
  const record = { node: /** @type {any} */ (null), disabled, text: itemText(props), opens: props['aria-haspopup'] === 'menu' };
  store.items.push(record);
  const owner = $owner(R);
  if (owner != null)
    $cleanup(/** @type {any} */ (owner), () => {
      const i = store.items.indexOf(record);
      if (i >= 0) store.items.splice(i, 1);
    });
  const style = styled(props, (theme, scheme) => {
    const c = itemColors(theme, scheme, read(props.color));
    return {
      direction: 'row',
      align: 'center',
      justify: 'start',
      gap: theme.control.iconGap,
      minHeight: 0,
      padding: theme.control.optionPad,
      radius: theme.radius.sm,
      background: read(props.active) === true ? c.hover : 'transparent',
      border: 0,
      fontSize: theme.fontSizes.sm,
      color: c.text,
      ...(disabled() ? { opacity: theme.opacity.disabled, cursor: 'not-allowed' } : { cursor: 'pointer', hover: { background: c.hover }, focus: { background: c.hover } }),
    };
  });
  const choose = (/** @type {any} */ e) => {
    if ($untrack(R, disabled)) return;
    props.onPress?.(e);
    if (!(read(props.sticky) ?? store.sticky())) store.closeAll();
  };
  const onKey = (/** @type {any} */ e) => {
    props.onKey?.(e);
    const key = keyOf(e);
    if (key === 'Enter' || key === ' ') {
      prevent(e);
      choose(e);
    }
  };
  const label = styled({}, () => ({ grow: 1 }));
  const text = typeof props.children === 'string' || typeof props.children === 'number' || typeof props.children === 'function';
  return (
    <Action
      ref={(/** @type {any} */ n) => {
        record.node = n;
        props.itemRef?.(n);
      }}
      label={props.label}
      role="menuitem"
      aria-disabled={flag(disabled)}
      {...marks(props)}
      selected={props.selected}
      onPress={choose}
      onKey={onKey}
      style={style}
    >
      <ActionRow gap={() => ui.theme().control.iconGap}>
        {props.start}
        {text ? <Label text={props.children} style={label} /> : <View style={label}>{props.children}</View>}
        {props.end}
      </ActionRow>
    </Action>
  );
}

/** A section's title (Menu.Label): small and quiet. @param {Record<string, any>} props */
export function MenuLabel(props) {
  const style = styled(props, (theme, scheme) => ({
    color: pageColors(theme, scheme).quiet,
    fontSize: theme.fontSizes.xs,
    padding: theme.control.optionPad,
    fontWeight: theme.weights.strong,
  }));
  return <Label text={props.children} style={style} />;
}

/** A line between groups of items (Menu.Divider). @param {Record<string, any>} props */
export function MenuDivider(props) {
  const style = styled(props, (theme, scheme) => ({
    height: 1,
    minHeight: 1,
    // Across the panel's padding, edge to edge.
    margin: [theme.control.panelPad / 2, -theme.control.panelPad],
    background: pageColors(theme, scheme).rule,
  }));
  return <View {...DECOR} style={style} />;
}

// ---------------------------------------------------------------------------
// Branches

/**
 * A branch (Menu.Branch): an item named `label` in its menu (with `start`,
 * `end` in place of its end-pointing chevron, `color`, `disabled`) that
 * opens a menu of its own beside it holding its children, the items (`at`
 * 'right-start', `offset` half of `theme.control.panelPad`, and `width`,
 * `shadow`, `radius` for that menu). Hovering the item opens it after
 * `openDelay` (MOTION quick, so a pass over it does not) and leaving the item and the
 * menu closes it after `closeDelay` (240: time to reach the menu);
 * ArrowRight, Enter or Space on the item open it with the focus on its
 * first item; ArrowLeft or Escape in it close it, the focus back on the
 * item. A choice in it closes every menu up to the root. The parent's
 * placement props (`portal`, `layer`, `motion`, `collision`) carry down.
 * @param {Record<string, any>} props
 */
export function MenuBranch(props) {
  const parent = $menu();
  const up = parent.props;
  const ui = $ui();
  const root = {
    at: 'right-start',
    offset: () => ui.theme().control.panelPad / 2,
    openDelay: MOTION.quick,
    shadow: 'md',
    portal: up.portal,
    layer: up.layer,
    motion: up.motion,
    collision: up.collision,
    loop: up.loop,
    tabbable: up.tabbable,
    sticky: up.sticky,
    radius: up.radius,
    dismiss: { outside: false },
    refocus: false,
    ...props,
  };
  const branch = $menuStore(root, 'hover', true, parent);
  // Inside a hover menu, the pointer in the branch keeps its parent open.
  const enter = branch.enter;
  const leave = branch.leave;
  branch.enter = () => {
    enter();
    if (parent.hovers) parent.enter();
  };
  branch.leave = () => {
    leave();
    if (parent.hovers) parent.leave();
  };
  const open = () => {
    branch.keyboard = true;
    branch.open();
  };
  const onKey = (/** @type {any} */ e) => {
    if (keyOf(e) === 'ArrowRight') {
      prevent(e);
      open();
    }
  };
  // The item belongs to the parent menu; its wrapper, as wide as the
  // parent's items, is the branch's anchor, where hovering opens it.
  return (
    <PopoverContext value={branch}>
      <MenuContext value={parent}>
        <PopoverTrigger style={{ self: 'stretch', align: 'stretch' }}>
          <MenuItem
            label={props.label}
            color={props.color}
            disabled={props.disabled}
            start={props.start}
            sticky
            aria-haspopup="menu"
            aria-expanded={state(branch.isOpen)}
            active={() => branch.isOpen()}
            itemRef={(/** @type {any} */ n) => branch.setTrigger(n)}
            onPress={open}
            onKey={onKey}
            end={props.end ?? <Chevron point="end" size={() => ui.theme().sizes.glyph.sm} color={() => pageColors(ui.theme(), ui.scheme()).quiet} />}
          >
            {props.label}
          </MenuItem>
        </PopoverTrigger>
      </MenuContext>
      <MenuContext value={branch}>
        <MenuPanel>{props.children}</MenuPanel>
      </MenuContext>
    </PopoverContext>
  );
}

// ---------------------------------------------------------------------------
// Checkbox and radio items

/** The checkbox group around a checkbox item. */
const CheckboxGroupContext = $context(/** @type {{ values: () => string[], toggle: (value: string) => void } | null} */ (null));

/** The radio group around a radio item. */
const RadioGroupContext = $context(/** @type {{ value: () => string | null, choose: (value: string) => void } | null} */ (null));

/**
 * Checkbox items sharing a list of values (Menu.CheckboxGroup):
 * `value`/`onChange(values)` or `defaultValue`.
 * @param {Record<string, any>} props
 */
export function MenuCheckboxGroup(props) {
  const state = $controlled(props, 'value', 'defaultValue', /** @type {string[]} */ ([]), v => props.onChange?.(v));
  const R = $active();
  const group = {
    values: state.get,
    /** @param {string} value */
    toggle(value) {
      const list = $untrack(R, state.get);
      state.set(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
    },
  };
  return <CheckboxGroupContext value={group}>{props.children}</CheckboxGroupContext>;
}

/**
 * Radio items sharing one value (Menu.RadioGroup):
 * `value`/`onChange(value)` or `defaultValue`.
 * @param {Record<string, any>} props
 */
export function MenuRadioGroup(props) {
  const state = $controlled(props, 'value', 'defaultValue', /** @type {string | null} */ (null), v => props.onChange?.(v));
  const group = { value: state.get, choose: (/** @type {string} */ v) => state.set(v) };
  return <RadioGroupContext value={group}>{props.children}</RadioGroupContext>;
}

/** A `check` prop's own node: a node replaces the drawn mark; true, false or options keep it. @param {any} check */
const iconOf = check => (check == null || typeof check === 'boolean' || partOf(check)?.node === undefined ? undefined : check);

/**
 * The mark at an item's start: a check or a dot while checked, the same
 * room otherwise; `icon` (a node) in place of the drawn one.
 * @param {{ on: () => boolean, dot?: boolean, color: () => string, icon?: any }} p
 */
function Mark(p) {
  const ui = $ui();
  const g = () => ui.theme().sizes.glyph.sm;
  if (p.icon !== undefined) return <View style={() => ({ width: g(), height: g(), shrink: 0, align: 'center', justify: 'center', opacity: p.on() ? 1 : 0 })}>{p.icon}</View>;
  const shapes = () => {
    if (!p.on()) return [];
    const s = g();
    // A radio item's dot, inset by the theme's `ratios.inset` of the glyph.
    const inset = Math.round(s * ui.theme().ratios.inset);
    return p.dot ? [{ kind: 'oval', x: inset, y: inset, right: s - inset, bottom: s - inset, color: p.color() }] : checkFigures(s, p.color());
  };
  return <Shape shapes={shapes} style={() => ({ width: g(), height: g(), shrink: 0 })} />;
}

/**
 * An item that toggles (Menu.CheckboxItem): `checked`/
 * `onChange(checked)` or `defaultChecked`, or `value` in a
 * `Menu.CheckboxGroup`; a check at its start while checked (`check`: a
 * node of your own replaces it); `sticky` (true: it keeps the menu open),
 * and Menu.Item's props.
 * @param {Record<string, any>} props
 */
export function MenuCheckboxItem(props) {
  const group = $lookup(CheckboxGroupContext);
  const ui = $ui();
  const R = $active();
  const own = $controlled(props, 'checked', 'defaultChecked', false, v => props.onChange?.(v));
  const inGroup = () => group !== null && props.value !== undefined && props.checked === undefined;
  const checked = () => (inGroup() ? /** @type {any} */ (group).values().includes(String(read(props.value))) : own.get() === true);
  const toggle = () => {
    if ($untrack(R, inGroup) && props.onChange === undefined) /** @type {any} */ (group).toggle(String($untrack(R, () => read(props.value))));
    else own.set(!$untrack(R, checked));
  };
  return (
    <MenuItem
      {...props}
      sticky={props.sticky ?? true}
      role="menuitemcheckbox"
      aria-checked={state(checked)}
      selected={checked}
      onPress={(/** @type {any} */ e) => {
        toggle();
        props.onPress?.(e);
      }}
      start={<Mark on={checked} icon={iconOf(props.check)} color={() => (read(props.color) != null ? colorOf(ui.theme(), ui.scheme(), read(props.color)) : pageColors(ui.theme(), ui.scheme()).text)} />}
    />
  );
}

/**
 * An item choosing its group's value (Menu.RadioItem):
 * `value` in a `Menu.RadioGroup`; a dot at its start while chosen
 * (`check`: a node of your own replaces it); `sticky` (true), and
 * Menu.Item's props.
 * @param {Record<string, any>} props
 */
export function MenuRadioItem(props) {
  const group = $lookup(RadioGroupContext);
  const ui = $ui();
  const checked = () => group !== null && group.value() === String(read(props.value));
  return (
    <MenuItem
      {...props}
      sticky={props.sticky ?? true}
      role="menuitemradio"
      aria-checked={state(checked)}
      selected={checked}
      onPress={(/** @type {any} */ e) => {
        group?.choose(String(read(props.value)));
        props.onPress?.(e);
      }}
      start={<Mark on={checked} dot icon={iconOf(props.check)} color={() => (read(props.color) != null ? colorOf(ui.theme(), ui.scheme(), read(props.color)) : pageColors(ui.theme(), ui.scheme()).text)} />}
    />
  );
}

Menu.Trigger = MenuTrigger;
Menu.Panel = MenuPanel;
Menu.Item = MenuItem;
Menu.Label = MenuLabel;
Menu.Divider = MenuDivider;
Menu.Branch = MenuBranch;
Menu.CheckboxGroup = MenuCheckboxGroup;
Menu.CheckboxItem = MenuCheckboxItem;
Menu.RadioGroup = MenuRadioGroup;
Menu.RadioItem = MenuRadioItem;
