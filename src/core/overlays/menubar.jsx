// Menubar: a row of menus sharing one open state. The bar keeps its menus
// in shown order and which of them is open (at most one); a press, the
// pointer, the arrows and typing move between them, and inside an open
// menu ArrowLeft and ArrowRight step to its neighbors.

import { View, Action, read, $active, $signal, $read, $write, $untrack, $owner, $cleanup, $lookup } from 'ren-core';
import { styled } from '../../theme/style.js';
import { pageColors } from '../../theme/resolve.js';
import { state } from '../../theme/meaning.js';
import { $typeAhead } from '../misc/type-ahead.js';
import { Menu, MenuPanel, MenubarContext, $menu } from './menu.jsx';
import { PopoverTrigger } from './popover.jsx';
import { $controlled, focus, keyOf, prevent, handled } from './shared.jsx';
import { $nextFrame } from '../misc/tween.js';
import { inShownOrder } from '../shown.js';
import { pass } from '../layout/layout.jsx';

/**
 * A menu's place in the bar.
 * @typedef {{ store: import('./menu.jsx').MenuStore | null, trigger: any, text: () => string }} BarEntry
 */

/**
 * The bar's record: its entries in live order, the open index, and the moves.
 * @param {Record<string, any>} props
 */
function $bar(props) {
  const R = $active();
  /** @type {BarEntry[]} */
  const entries = [];
  // Entries come and go outside any signal: this one counts the changes.
  const order = $signal(R, 0);
  let changes = 0;
  // The trigger a typed key came from.
  let at = -1;
  const shown = $controlled(props, 'value', 'defaultValue', /** @type {number | null} */ (null), v => props.onChange?.(v));
  const later = $nextFrame();
  const resortLater = $nextFrame();
  /** Puts the entries in the order their triggers are shown, the open one staying open. */
  const resort = () => {
    const next = inShownOrder(entries, e => e.trigger);
    if (next.every((e, i) => e === entries[i])) return;
    const open = current();
    const was = open === null ? null : entries[open];
    entries.splice(0, entries.length, ...next);
    $write(order, ++changes);
    if (was != null) set(entries.indexOf(was));
  };
  const current = () => $untrack(R, shown.get);
  /** @param {number | null} v */
  const set = v => {
    if (current() !== v) shown.set(v);
  };
  const loop = () => read(props.loop) !== false;
  /** The index `step` away from `from` (wrapping when `loop`, else held at the ends). @param {number} from @param {number} step */
  const beside = (from, step) => {
    const n = entries.length;
    const to = from + step;
    if (to >= 0 && to < n) return to;
    return loop() ? (to + n) % n : from;
  };
  /** Opens entry `i`, the focus on its first or last item once it is laid out. @param {number} i @param {'Home' | 'End'} [where] */
  const show = (i, where = 'Home') => {
    // The entry, not its index: a re-sort may run before the frame.
    const entry = entries[i];
    set(i);
    later(() => entry?.store?.move(null, where));
  };
  /** Moves to entry `i` from a trigger: its menu opens when one was open, else the focus goes to its trigger. @param {number} i */
  const reach = i => {
    if (current() !== null) show(i);
    else focus(entries[i]?.trigger);
  };
  const seek = $typeAhead({
    count: () => entries.length,
    text: i => entries[i].text(),
    at: () => at,
    go: i => reach(i),
  });
  const bar = {
    /**
     * Seats a menu: its props with the bar's open state (press to open, no
     * outside dismiss, the bar's `at` unless its own) and the store it builds.
     * @param {Record<string, any>} own
     */
    join(own) {
      /** @type {BarEntry} */
      const entry = { store: null, trigger: null, text: () => '' };
      entries.push(entry);
      $write(order, ++changes);
      const index = () => ($read(order), entries.indexOf(entry));
      const owner = $owner(R);
      if (owner != null)
        $cleanup(/** @type {any} */ (owner), () => {
          const i = entries.indexOf(entry);
          if (i < 0) return;
          entries.splice(i, 1);
          $write(order, ++changes);
          const open = current();
          if (open === i) set(null);
          else if (open !== null && open > i) set(open - 1);
        });
      const root = {
        shadow: 'md',
        ...own,
        at: () => read(own.at) ?? read(props.at) ?? 'bottom-start',
        openOn: 'press',
        dismiss: { outside: false },
        open: () => {
          const i = index();
          return i >= 0 && shown.get() === i;
        },
        onOpenChange: (/** @type {boolean} */ v) => {
          const i = $untrack(R, index);
          if (v) set(i);
          else if (current() === i) set(null);
          own.onOpenChange?.(v);
        },
      };
      return {
        root,
        /** @param {import('./menu.jsx').MenuStore} store */
        take(store) {
          entry.store = store;
          return {
            /** ArrowLeft or ArrowRight inside the menu: the neighbor opens, the focus on its first item. @param {string} key */
            step(key) {
              const i = entries.indexOf(entry);
              const to = beside(i, key === 'ArrowRight' ? 1 : -1);
              if (to === i) return false;
              show(to);
              return true;
            },
          };
        },
      };
    },
    /** @param {import('./menu.jsx').MenuStore} store */
    entryOf: store => /** @type {BarEntry} */ (entries.find(e => e.store === store)),
    /** A trigger's node is in place: the entries take the order the triggers are shown in, once laid out. */
    placed: () => resortLater(resort),
    /** A press on a trigger: opens its menu, or closes it when open. @param {BarEntry} entry */
    press(entry) {
      const i = entries.indexOf(entry);
      set(current() === i ? null : i);
    },
    /** The pointer entered a trigger: 'hover' opens, 'press' switches while a menu is open. @param {BarEntry} entry */
    hover(entry) {
      if (read(props.openOn) === 'hover' || current() !== null) set(entries.indexOf(entry));
    },
    /** A key on a trigger. @param {BarEntry} entry @param {any} e */
    key(entry, e) {
      const i = entries.indexOf(entry);
      const key = keyOf(e);
      const n = entries.length;
      if (key === 'ArrowRight' || key === 'ArrowLeft' || key === 'Home' || key === 'End') {
        prevent(e);
        reach(key === 'Home' ? 0 : key === 'End' ? n - 1 : beside(i, key === 'ArrowRight' ? 1 : -1));
      } else if (key === 'ArrowDown' || key === 'Enter' || key === ' ' || key === 'ArrowUp') {
        prevent(e);
        show(i, key === 'ArrowUp' ? 'End' : 'Home');
      } else if (key === 'Escape') {
        prevent(e);
        if (current() !== null) handled(e);
        set(null);
        focus(entry.trigger);
      } else {
        at = i;
        if (seek.key(e)) prevent(e);
      }
    },
  };
  return bar;
}

/**
 * A row of menus (Menubar), at most one open: `Menubar.Menu` (a Menu in
 * the bar, Menu's props) holding a `Menubar.Trigger` (its children are the
 * trigger's text) and a `Menubar.Panel` (Menu.Panel). `value`/`onChange`
 * (the open menu's index in shown order, or null; a menu shown later
 * re-sorts the bar, and `onChange` reports the open menu's new index) or
 * `defaultValue`;
 * `openOn` ('press': a press opens a menu and, while one is open, the
 * pointer entering another trigger switches to it; 'hover': entering any
 * trigger opens its menu); `loop` (true: the arrows wrap); `at` (the menus'
 * placement, 'bottom-start'; a menu's own `at` wins); style props and
 * `style`. The menus take no outside-press backdrop, which would keep the
 * pointer from the other triggers: a press elsewhere leaves them open;
 * Escape, a choice, Tab or their trigger close them. On a trigger the
 * arrows, Home and End move between triggers (the menus follow while one is
 * open), ArrowDown, Enter or Space open its menu on the first item and
 * ArrowUp on the last, and typing finds a trigger by its text; in an open
 * menu ArrowRight (off a branch's item) and ArrowLeft open its neighbors.
 * `aria-label` or `aria-labelledby` names the bar, and the other `aria-*`
 * and `data-*` props reach it.
 * @param {Record<string, any>} props
 */
export function Menubar(props) {
  const bar = $bar(props);
  const style = styled(props, theme => ({
    direction: 'row',
    align: 'center',
    padding: theme.control.panelPad,
    gap: theme.control.panelPad / 2,
    radius: theme.radius.sm,
  }));
  return (
    <MenubarContext value={bar}>
      <View role="menubar" {...pass(props)} style={style}>
        {props.children}
      </View>
    </MenubarContext>
  );
}

/**
 * A menu's trigger in the bar (Menubar.Trigger): its children are its text.
 * It looks like a menu item, its ground the page's hover color while
 * hovered, focused or open.
 * @param {Record<string, any>} props
 */
export function MenubarTrigger(props) {
  const store = $menu();
  const bar = /** @type {ReturnType<typeof $bar> | null} */ ($lookup(MenubarContext));
  if (bar === null) throw new Error('RUI: Menubar.Trigger goes inside a Menubar.Menu');
  const entry = bar.entryOf(store);
  entry.text = () => String(read(props.children) ?? '');
  const style = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    return {
      padding: theme.control.optionPad,
      radius: theme.radius.sm,
      fontSize: theme.fontSizes.sm,
      color: page.text,
      border: 0,
      cursor: 'pointer',
      background: store.isOpen() ? page.hover : 'transparent',
      hover: { background: page.hover },
      focus: { background: page.hover },
    };
  });
  return (
    <PopoverTrigger>
      {(/** @type {any} */ t) => (
        <Action
          ref={(/** @type {any} */ n) => {
            entry.trigger = n;
            // A menu shown later registers last: the bar re-sorts by where its trigger is shown.
            bar.placed();
            t.ref(n);
          }}
          text={props.children}
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={state(store.isOpen)}
          style={style}
          onPress={() => bar.press(entry)}
          onKey={(/** @type {any} */ e) => bar.key(entry, e)}
          onPointerEnter={() => bar.hover(entry)}
        />
      )}
    </PopoverTrigger>
  );
}

/** A menu in the bar (Menubar.Menu): Menu's props. @param {Record<string, any>} props */
export function MenubarMenu(props) {
  return <Menu {...props} />;
}

Menubar.Menu = MenubarMenu;
Menubar.Trigger = MenubarTrigger;
Menubar.Panel = MenuPanel;
