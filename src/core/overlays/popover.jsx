// Popover, HoverCard and Tooltip: a panel placed against its trigger, in
// the portal layer or inline (shared.jsx: Placed); a press or the keys on
// the trigger (or hovering it) open it, and Escape, a press outside
// (a transparent backdrop under the panel) or the trigger again close it.
//
// The trigger is a wrapper View around the children: presses reach it as
// the pointer events that bubble on every renderer (a press does not bubble
// on ren-canv, a click does on the DOM), keys as onKey from the focused
// child. `Popover.Trigger` also takes a function child, given the props to
// spread on the pressable itself (`onPress`, `onKey`).

import { View, Label, Show, Portal, read, $active, $signal, $read, $write, $context, $lookup, $untrack, $watch, $focus, $writable, $owner, $cleanup } from 'ren-core';
import { styled } from '../../theme/style.js';
import { pageColors, radiusOf, shadowOf, sized, tooltipColors } from '../../theme/resolve.js';
import { $ui } from '../../theme/theme.jsx';
import { LAYERS } from '../../theme/layers.js';
import { Placed, Layer, Arrow, $controlled, $presence, timingOf, motionOf, $delay, moved, sideOf, focus, keyOf, rectOf, partOf, dismissOf, handled, activeOf } from './shared.jsx';
import { $nextFrame } from '../misc/tween.js';
import { tables } from '../../own.js';
import { TriggerMeaning, state as ariaState, $uid } from '../../theme/meaning.js';
import { handOn } from '../ref.js';

/**
 * @typedef {object} PopoverStore
 * @property {() => boolean} isOpen
 * @property {() => void} open
 * @property {() => void} close
 * @property {() => void} toggle
 * @property {() => any} anchor the trigger's wrapper node
 * @property {(node: any) => void} setAnchor
 * @property {Record<string, any>} props the root's props
 * @property {(node: any) => void} setTrigger the node focus returns to
 * @property {() => any} trigger
 * @property {'click' | 'hover'} mode
 * @property {boolean} hovers hovering the trigger or panel opens it and leaving closes it (hover mode, or a menu's 'both')
 * @property {() => void} enter the pointer entered the trigger or panel (hover)
 * @property {() => void} leave the pointer left them (hover)
 * @property {boolean} [focusShows] keyboard focus on the trigger shows it at once, and leaving the trigger hides it (a Tooltip)
 * @property {() => void} [focusIn] focus entered the trigger's wrapper
 * @property {(e?: any) => void} [focusOut] focus left an element in the trigger's wrapper (kept open while it moves within)
 * @property {(node: any) => void} [setFirst] where focus goes as it opens by the keyboard
 * @property {() => any} [first]
 * @property {boolean} [keyboard] a key opens it (its focus then goes in)
 * @property {(key: string) => void} [arrow] an arrow key on the trigger while open (a menu moves into its items)
 * @property {any} [inside] the last event the panel saw: inline, the panel sits in the trigger's wrapper, and its events bubble there
 * @property {() => void} [follow] measures the placement again (the trigger resized)
 * @property {any} [panel] the panel's node (Panel sets it)
 */

/** How long a panel that hovering opens stays after the pointer leaves it, ms: time to reach the panel. */
const HOVER_CLOSE = 240; // ms: time to reach a hover panel after leaving its trigger
const HOVER_OPEN = 80; // ms: a HoverCard waits this long on its trigger before it opens
const TIP_OPEN = 500; // ms: a Tooltip opens only after a deliberate hover
const TIP_CLOSE = 100; // ms: a Tooltip lingers this long after the pointer leaves

/** A panel's effect by the side it opens on: it moves out from its trigger. */
const FROM_SIDE = tables(/** @type {const} */ ({ bottom: 'sink', top: 'rise', right: 'from-start', left: 'from-end' }));

/** The popover a Trigger or Panel belongs to. */
export const PopoverContext = $context(/** @type {PopoverStore | null} */ (null));

/** True when `node` is `root` or inside it: the DOM's parentNode or a canvas item's parent. @param {any} root @param {any} node */
const within = (root, node) => {
  for (let n = node; root != null && n != null; n = n.parentNode ?? n.parent ?? null) if (n === root) return true;
  return false;
};

/** The popover whose panel holds what is being built: a popover opened from inside it counts as inside it. */
const PanelAround = $context(/** @type {PopoverStore | null} */ (null));

/** Per popover, the popovers built inside its panel. @type {WeakMap<object, Set<PopoverStore>>} */
const nested = new WeakMap();

/**
 * True when `node` is in the popover's panel, or in the panel of a popover
 * opened from inside it (a portaled panel is no child of its opener's).
 * @param {PopoverStore} store @param {any} node @returns {boolean}
 */
const holds = (store, node) => {
  if (within(store.panel, node)) return true;
  for (const inner of nested.get(store) ?? []) if (holds(inner, node)) return true;
  return false;
};

/**
 * True when a popover opened from inside the store's panel (or from one of
 * those, and so on) is open: its panel is portaled, so the pointer on it,
 * or on its backdrop, has left the store's panel without leaving the store.
 * @param {PopoverStore} store @returns {boolean}
 */
const opensInside = store => {
  for (const inner of nested.get(store) ?? []) if (links.get(inner)?.open() || opensInside(inner)) return true;
  return false;
};

/**
 * What a popover built inside another's panel reaches of it and of
 * itself: `open` (its state, untracked), `hold` (cancel a pending close,
 * and the outer ones'), `settle` (a nested one closed: close by the
 * pointer's delay if the pointer is off), `quiet` (close without moving
 * the focus: the panel around closed).
 * @type {WeakMap<PopoverStore, { open: () => boolean, hold: () => void, settle: () => void, quiet: () => void }>}
 */
const links = new WeakMap();

/**
 * The popover's state: controlled by `open` with `onOpenChange(open)`, or
 * its own from `defaultOpen`; `disabled`.
 * @param {Record<string, any>} props @param {'click' | 'hover'} mode @param {boolean} [hovers] (hover mode by default)
 * @returns {PopoverStore}
 */
export function $popover(props, mode, hovers = mode === 'hover') {
  const R = $active();
  // The trigger's wrapper, set by its ref: a ref runs where the trigger is built, which may be inside a
  // computation (a Calendar's renderDay), so computations may write it.
  const anchor = $writable($signal(R, /** @type {any} */ (null)));
  /** @type {any} */
  let trigger = null;
  const state = $controlled(props, 'open', 'defaultOpen', false, value => props.onOpenChange?.(value));
  const delay = $delay();
  /** The popover whose panel this one is built in (a portaled panel is no child of its opener's). */
  const around = $lookup(PanelAround);
  /** The pointer is over the trigger or the panel (a hover popover's). */
  let over = false;
  /**
   * Closes it; the focus goes back to the trigger when it was inside the
   * panel (any mode: the panel goes), or on a click-mode close (`back`),
   * unless `refocus` is false.
   * @param {boolean} back
   */
  const shut = back => {
    const inside = holds(store, activeOf(store.panel));
    state.set(false);
    if (!(back || inside)) return;
    giveBack();
  };
  /** Gives the focus back to the trigger, unless `refocus` is false. */
  const giveBack = () => {
    if (read(props.refocus) === false) return;
    // A hover trigger no press set: the first focusable in its wrapper.
    if (trigger != null) focus(trigger);
    else $focus($untrack(R, () => $read(anchor)));
  };
  /** @type {PopoverStore} */
  const store = {
    isOpen: () => state.get() === true && read(props.disabled) !== true,
    open() {
      delay.cancel();
      if (!$untrack(R, state.get)) state.set(true);
    },
    close() {
      delay.cancel();
      if ($untrack(R, state.get)) shut(mode === 'click');
    },
    toggle: () => ($untrack(R, state.get) ? store.close() : store.open()),
    anchor: () => $read(anchor),
    setAnchor: node => $write(anchor, node),
    props,
    setTrigger: node => (trigger = node),
    trigger: () => trigger,
    mode,
    hovers,
    enter() {
      over = true;
      delay.run(read(props.openDelay) ?? 0, () => state.set(true));
      // On a nested panel the pointer is still within the panels around it.
      if (around !== null) links.get(around)?.hold();
    },
    leave() {
      over = false;
      // A popover opened from the panel holds it open: the pointer is on that one's portaled panel or backdrop.
      if ($untrack(R, state.get) && opensInside(store)) return;
      delay.run(read(props.closeDelay) ?? (hovers ? HOVER_CLOSE : 0), () => shut(false));
    },
    focusIn() {
      if (!store.focusShows) return;
      delay.cancel();
      if (!$untrack(R, state.get)) state.set(true);
    },
    focusOut(e) {
      if (!store.focusShows) return;
      // Focus moving between elements inside the wrapper keeps it shown.
      if (within($untrack(R, () => $read(anchor)), e?.relatedTarget)) return;
      delay.cancel();
      if ($untrack(R, state.get)) state.set(false);
    },
  };
  const open = () => $untrack(R, state.get) === true;
  links.set(store, {
    open,
    hold() {
      if (open()) delay.cancel();
      if (around !== null) links.get(around)?.hold();
    },
    settle() {
      if (open() && hovers && !over && !opensInside(store)) store.leave();
    },
    quiet() {
      delay.cancel();
      if (open()) state.set(false);
    },
  });
  let was = open();
  $watch(R, () => state.get() === true, now => {
    if (now === was) return;
    was = now;
    if (now) {
      // Opened from a panel: the panels around stay while it does.
      if (around !== null) links.get(around)?.hold();
      return;
    }
    // Closed: the popovers opened from its panel go with it (persistent, it stays built, hidden), and
    // the panel around, left by the pointer meanwhile, closes by its delay.
    for (const inner of nested.get(store) ?? []) links.get(inner)?.quiet();
    if (around !== null) links.get(around)?.settle();
  });
  // Built inside another's panel: that one holds this one's panel too, while this one lives.
  if (around !== null) {
    let inners = nested.get(around);
    if (inners === undefined) nested.set(around, (inners = new Set()));
    const mine = inners;
    mine.add(store);
    const owner = $owner(R);
    if (owner != null) $cleanup(/** @type {any} */ (owner), () => void mine.delete(store));
  }
  // Closed from outside (a controlled `open` set false) with the focus in the panel: the focus goes back to
  // the trigger too, as on every other close. Read as it closes, while the panel is still there.
  $watch(
    R,
    () => ({ open: state.get() === true, inside: holds(store, activeOf(store.panel)) }),
    seen => {
      if (!seen.open && seen.inside) giveBack();
    },
  );
  return store;
}

/**
 * A panel against a trigger: children are a
 * `Popover.Trigger` and a `Popover.Panel`. `open` with
 * `onOpenChange(open)` (controlled) or `defaultOpen`; `at` ('bottom';
 * top, right, bottom, left, each with -start and -end), `offset` (6:
 * half of spacing sm, close to the trigger yet clear of its focus ring),
 * `width` (px or 'trigger': as wide as the trigger), `arrow` (false;
 * true, or `{ size, offset, at }`: `size` 6, `offset` 6, `at` 'edge'
 * (`offset` from the aligned edge) or 'center' (at the trigger's
 * center)), `portal` (true; inline
 * where a node cannot be measured, as a worker's Handle), `collision`
 * (`{ flip: true, slide: true }`: the other side where its own overflows
 * the viewport, a slide along it to stay inside, 8 px in, never past the
 * trigger), `persistent` (the panel stays built while closed, hidden),
 * `trap`, `dismiss` (`{ escape, outside }`, both true; false for
 * neither), `refocus` (true: closing gives the focus back to the trigger,
 * on a click-mode close or, in any mode and by any close (an `open` set
 * false too), from inside the panel or a popover opened from it), `shadow` ('md'), `radius`, `layer`
 * (`LAYERS.float`), `motion` ('quick': 110 ms, a preset's name or `{
 * effect, duration, exit, easing }`; by default a fade out from the
 * trigger's side, `sink` below it), `disabled`. While open it
 * follows its trigger: measured again on every scroll that can move it
 * (ren-core's `$scrolls`: an ancestor's, the page's), on any other move
 * of its trigger (`$moves`: a layout shift above it, a transform, an
 * animation), and when the viewport, the trigger or the panel resizes.
 * @param {Record<string, any>} props
 */
export function Popover(props) {
  const store = $popover(props, 'click');
  return <PopoverContext value={store}>{props.children}</PopoverContext>;
}

/** The popover in context. */
function $store() {
  const store = /** @type {PopoverStore | null} */ ($lookup(PopoverContext));
  if (store === null) throw new Error('RUI: Popover.Trigger and Popover.Panel go inside a Popover (or HoverCard, Menu)');
  return store;
}

/**
 * The trigger: a wrapper around its children that is the panel's anchor.
 * A press (pointer down, then up, on it) or Enter or Space toggles, and
 * ArrowDown opens (click mode); hovering opens (hover mode); Escape closes.
 * Events from the panel (inline, it sits in this wrapper) are not the
 * trigger's. Focus bubbling to the wrapper (`onFocusIn`, `onFocusOut`)
 * shows a Tooltip at once and hides it as focus leaves the wrapper. A
 * function child gets the trigger props to spread on a press target
 * (`onPress`, `onKey`, `ref`: Enter and Space open it through the target's
 * press); its wrapper stretches as its parent lays
 * it out (a field fills its row), where a plain child's hugs it (`self`
 * 'start'). `style` adds to the wrapper's style in both forms.
 * @param {Record<string, any>} props
 */
export function PopoverTrigger(props) {
  const store = $store();
  const R = $active();
  let down = false;
  const onPointerDown = (/** @type {any} */ e) => {
    if ((e?.button ?? 0) !== 0 || (e != null && e === store.inside)) return;
    down = true;
    store.setTrigger(e?.target ?? null);
  };
  const onPointerUp = (/** @type {any} */ e) => {
    if (!down || (e != null && e === store.inside)) return;
    down = false;
    if (store.mode === 'click') store.toggle();
  };
  // `pressed`: the control fires onPress from Enter and Space itself (a function child's), so the key only says the keyboard opens it.
  const keyed = (/** @type {any} */ e, /** @type {boolean} */ pressed) => {
    if (e != null && e === store.inside) return;
    const key = keyOf(e);
    if (key === 'Escape' && dismissOf(read(store.props.dismiss)).escape) {
      // Closing an open layer, the key stops here; a closed one lets it reach the layer around.
      if ($untrack(R, store.isOpen)) {
        handled(e);
        store.close();
      }
      return;
    }
    if (store.mode !== 'click') return;
    store.setTrigger(e?.target ?? null);
    if (key === 'Enter' || key === ' ') {
      store.keyboard = true;
      if (!pressed) store.toggle();
    } else if ((key === 'ArrowDown' || key === 'ArrowUp') && store.arrow !== undefined && $untrack(R, store.isOpen)) {
      e?.preventDefault?.();
      store.arrow(key);
    } else if (key === 'ArrowDown' && !$untrack(R, store.isOpen)) {
      e?.preventDefault?.();
      store.keyboard = true;
      store.open();
    }
  };
  const onKey = (/** @type {any} */ e) => keyed(e, false);
  const hover = store.hovers ? { onPointerEnter: store.enter, onPointerLeave: store.leave } : null;
  const children = props.children;
  // What the control inside says of the layer: a menu (Menu.Trigger) and whether it is open, or
  // the shown tooltip that describes it (Tooltip); a trigger inside another adds to the outer's.
  const outer = $lookup(TriggerMeaning);
  /** @type {Record<string, any> | null} */
  const own =
    props.__popup !== undefined
      ? { 'aria-haspopup': props.__popup, 'aria-expanded': ariaState(store.isOpen) }
      : props.__describe !== undefined
        ? { 'aria-describedby': () => (store.isOpen() ? props.__describe : undefined) }
        : null;
  const meaning = own === null ? outer : { ...outer, ...own };
  // Focus bubbles to the wrapper from any child: a Tooltip shows at once and hides as it leaves.
  const focusing = { onFocusIn: store.focusIn, onFocusOut: store.focusOut };
  if (typeof children === 'function' && children.length >= 1) {
    return (
      <View ref={store.setAnchor} style={() => ({ ...read(props.style) })} onResize={() => store.follow?.()} {...focusing} {...hover}>
        {children({ ...meaning, onPress: () => (store.mode === 'click' ? store.toggle() : undefined), onKey: (/** @type {any} */ e) => keyed(e, true), ref: store.setTrigger })}
      </View>
    );
  }
  return (
    <View ref={store.setAnchor} style={() => ({ self: 'start', align: 'start', ...read(props.style) })} onResize={() => store.follow?.()} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => (down = false)} onKey={onKey} {...focusing} {...hover}>
      <TriggerMeaning value={meaning}>{children}</TriggerMeaning>
    </View>
  );
}

/**
 * The panel's look: the raised ground, a rule-colored edge, a radius and
 * `shadow` ('md'), padding `spacing.xs` by `spacing.sm` (8 by 12).
 * @param {Record<string, any>} root @param {Record<string, any>} props
 */
export function panelStyle(root, props) {
  return styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    return {
      background: page.raised,
      color: page.text,
      border: 1,
      borderColor: pageColors(theme, scheme).rule,
      radius: radiusOf(theme, read(root.radius)),
      shadow: shadowOf(theme, read(root.shadow) ?? 'md'),
      padding: [theme.spacing.xs, theme.spacing.sm],
      fontSize: theme.fontSizes.sm,
      direction: 'column',
    };
  });
}

/**
 * The panel: shown while the popover is open, placed against the
 * trigger, over a transparent backdrop that closes it when pressed
 * (`dismiss.outside`; a press outside is taken by the backdrop, as no
 * portable way exists to see presses elsewhere on a canvas). Inline
 * (`portal` false, or in a worker) there is no backdrop: the layer
 * paints over the page, so it would cover the panel too; Escape, the
 * trigger and a choice close it. `ref` gets the panel's node.
 * @param {Record<string, any>} props
 */
export function PopoverPanel(props) {
  const store = $store();
  const root = store.props;
  return <Panel store={store} look={props.look ?? panelStyle(root, props)} role="dialog" {...props} />;
}

/**
 * The panel machinery Popover, HoverCard, Menu and the combobox share;
 * `role` (and `aria-label`) say what it means: a `dialog` (Popover,
 * HoverCard), a `tooltip`, a `menu`; nothing for the combobox's (its
 * listbox is inside). `prevent` cancels those default actions on it and
 * its backdrop (a Menu's: the browser's context menu).
 * @param {Record<string, any>} props
 */
export function Panel(props) {
  const store = /** @type {PopoverStore} */ (props.store);
  const root = store.props;
  const ui = $ui();
  const motion = () => motionOf(read(root.motion));
  const presence = $presence(store.isOpen, () => timingOf(read(root.motion), 'quick'));
  const layer = () => read(root.layer) ?? LAYERS.float;
  const portal = () => read(root.portal) !== false;
  const keep = () => read(root.persistent) === true;
  const dismiss = () => dismissOf(read(root.dismiss));
  const fit = $signal($active(), /** @type {import('./shared.jsx').Fit | null} */ (null));
  /** @type {any} */
  let drop = null;
  const onKey = (/** @type {any} */ e) => {
    store.inside = e;
    if (keyOf(e) === 'Escape' && dismiss().escape) {
      handled(e);
      store.close();
    }
    props.onKey?.(e);
  };
  /** Marks a pointer event as the panel's, for the trigger's wrapper it bubbles to inline. @param {any} e */
  const mark = e => void (store.inside = e);
  const arrow = () => {
    const a = partOf(read(root.arrow), false);
    if (a === null) return null;
    const [asked, align] = sideOf(read(root.at));
    const f = /** @type {import('./shared.jsx').Fit | null} */ ($read(fit));
    const side = f?.side ?? asked;
    const theme = ui.theme();
    const scheme = ui.scheme();
    const s = a.size ?? theme.sizes.box.arrow.size;
    // Centered (arrow.at 'center', or a centered placement): at the trigger's center where measured, within arrow.offset of the ends.
    const centered = a.at === 'center' || align === 'center';
    const offset = a.offset ?? theme.sizes.box.arrow.offset;
    const at = centered && f !== null && f.length > 0 ? Math.min(Math.max(f.center - s, offset), Math.max(offset, f.length - offset - 2 * s)) : null;
    const colors = props.arrowColors?.() ?? { background: pageColors(theme, scheme).raised, border: pageColors(theme, scheme).rule };
    return Arrow({ side, align: centered ? 'center' : align, size: s, offset, background: colors.background, border: colors.border, at });
  };
  const look = /** @type {() => Record<string, any>} */ (props.look);
  /** The side it opens on: the fitted one, else the one asked for. */
  const side = () => /** @type {import('./shared.jsx').Fit | null} */ ($read(fit))?.side ?? sideOf(read(root.at))[0];
  const style = () => ({ ...look(), ...moved(presence.t(), motion().effect ?? FROM_SIDE[side()]) });
  const trap = () => read(root.trap) === true;
  const later = $nextFrame();
  // Open by the keyboard, or trapping: the focus goes in once it is laid
  // out, to the first item (a Menu's), else trapping to the first focusable
  // inside (ren-core's `$focus`).
  $watch($active(), store.isOpen, open => {
    if (open && (trap() || store.keyboard))
      later(() => {
        const item = store.first?.() ?? null;
        if (item !== null) focus(item);
        else if (trap()) $focus(drop);
      });
    store.keyboard = false;
  });
  return (
    <Show when={() => (presence.mounted() || keep()) && store.anchor() != null}>
      {() => {
        const hover = store.hovers ? { onPointerEnter: store.enter, onPointerLeave: store.leave } : null;
        return (
          <>
            {() => (store.mode === 'click' && !store.hovers && dismiss().outside && portal() && store.isOpen() ? <Layer layer={layer} onPointerDown={store.close} prevent={props.prevent} /> : null)}
            <Placed
              anchor={store.anchor}
              portal={portal}
              at={() => read(root.at)}
              offset={() => read(root.offset) ?? ui.theme().spacing.sm / 2}
              width={() => read(root.width)}
              layer={layer}
              collision={() => read(root.collision)}
              active={presence.mounted}
              fit={fit}
              follow={(/** @type {() => void} */ measure) => (store.follow = measure)}
            >
              <View
                hidden={() => !presence.mounted()}
                ref={(/** @type {any} */ n) => {
                  drop = n;
                  store.panel = n;
                  handOn(props.ref, n);
                }}
                id={props.id}
                role={props.role}
                aria-label={props['aria-label']}
                prevent={props.prevent}
                style={style}
                onKey={onKey}
                onPointerDown={mark}
                onPointerUp={mark}
                trap={trap}
                {...hover}
              >
                <PanelAround value={store}>{props.children}</PanelAround>
                {() => arrow()}
              </View>
            </Placed>
          </>
        );
      }}
    </Show>
  );
}

Popover.Trigger = PopoverTrigger;
Popover.Panel = PopoverPanel;

/**
 * A panel that opens while its trigger is hovered:
 * `openDelay` (80), `closeDelay` (240), and Popover's placement and look.
 * It stays open while the pointer is over the trigger or the panel, or
 * while a popover opened from its panel is open (the pointer on that
 * one's panel or backdrop); closing it closes those too.
 * @param {Record<string, any>} props
 */
export function HoverCard(props) {
  const store = $popover({ openDelay: HOVER_OPEN, closeDelay: HOVER_CLOSE, ...props }, 'hover');
  return <PopoverContext value={store}>{props.children}</PopoverContext>;
}

HoverCard.Trigger = PopoverTrigger;
HoverCard.Panel = PopoverPanel;

/**
 * A tooltip's padding: `control.labelGap / 2` above and below, and at its
 * sides `ratios.pad` of its font (a compact part's side padding), 3 by 9.
 * @param {import('../../theme/theme.jsx').RuiThemeValue} theme
 */
const tipPad = theme => [theme.control.labelGap / 2, Math.round(theme.fontSizes.xs * theme.ratios.pad)];

/**
 * A label shown while its trigger is hovered: `label`, `at` ('top'),
 * `offset` (6, as every panel: half of spacing sm), `openDelay` (500: only after a deliberate hover) and
 * `closeDelay` (100: grace to cross a gap), `arrow` (false; true or
 * `{ size }`: 5), `wrap` (the label wraps at `w`, 250 by default),
 * `color`, `radius` ('sm'), `open` (controlled), `disabled`, `layer`
 * (`LAYERS.tip`, above any panel it explains), `portal`, `motion`
 * ('quick', a fade). Focus entering its child shows it at once and
 * focus leaving hides it; a function child gets the trigger props
 * (`onKey`, `ref`, and `aria-describedby`) to spread on the element.
 * While shown, it describes the Button, Pressable or IconButton in its
 * child (`aria-describedby`, its id).
 * @param {Record<string, any>} props
 */
export function Tooltip(props) {
  // A tooltip's arrow is 5 px unless its options say.
  const arrow = () => {
    const a = partOf(read(props.arrow), false);
    return a === null ? false : { size: 5, ...a };
  };
  const root = { at: 'top', openDelay: TIP_OPEN, closeDelay: TIP_CLOSE, layer: LAYERS.tip, motion: { effect: 'fade', duration: 'quick' }, ...props, arrow };
  const store = $popover(root, 'hover');
  store.focusShows = true;
  const ui = $ui();
  const look = styled({}, (theme, scheme) => {
    const c = tooltipColors(theme, scheme, read(props.color));
    return {
      background: c.background,
      color: c.text,
      radius: radiusOf(theme, read(props.radius) ?? 'sm'),
      padding: tipPad(theme),
      fontSize: theme.fontSizes.xs,
      ...(read(props.wrap) ? { maxWidth: read(props.w) ?? theme.sizes.box.tip } : null),
    };
  });
  const arrowColors = () => ({ background: tooltipColors(ui.theme(), ui.scheme(), read(props.color)).background, border: null });
  const text = styled({}, theme => ({ wrap: read(props.wrap) === true, lineHeight: theme.lineHeights.sm }));
  // The shown tooltip describes the control inside its trigger (aria-describedby).
  const tip = $uid('tip');
  return (
    <PopoverContext value={store}>
      <PopoverTrigger __describe={tip}>{props.children}</PopoverTrigger>
      <Panel store={store} look={look} arrowColors={arrowColors} role="tooltip" id={tip}>
        {typeof props.label === 'string' || typeof props.label === 'function' || typeof props.label === 'number' ? <Label text={props.label} style={text} /> : props.label}
      </Panel>
    </PopoverContext>
  );
}

/**
 * A tooltip that follows the pointer over its trigger
 * (Tooltip.Follow): `label`, `offset` (`sizes.box.follow`, 12), `at` ('bottom-end': below the
 * pointer, reaching toward the end; or 'top', 'left', 'right', each with
 * -start and -end), `color`, `radius` ('sm'), `disabled`, `layer`
 * (`LAYERS.tip`). Where the portal's container cannot be measured it is
 * not shown.
 * @param {Record<string, any>} props
 */
export function TooltipFollow(props) {
  const R = $active();
  const at = $signal(R, /** @type {{ x: number, y: number } | null} */ (null));
  /** @type {any} */
  let origin = null;
  const move = (/** @type {any} */ e) => {
    if (read(props.disabled)) return;
    const o = rectOf(origin) ?? { x: 0, y: 0 };
    $write(at, { x: (e?.x ?? e?.clientX ?? 0) - o.x, y: (e?.y ?? e?.clientY ?? 0) - o.y });
  };
  const look = styled({}, (theme, scheme) => {
    const c = tooltipColors(theme, scheme, read(props.color));
    const p = $read(at) ?? { x: 0, y: 0 };
    const off = read(props.offset) ?? theme.sizes.box.follow;
    const [side, align] = sideOf(read(props.at) ?? 'bottom-end');
    // Its near edge `off` from the pointer on its side (the far one moved by its own size: a translate,
    // so a tooltip above or to the left never covers the pointer), and across it: '-end' reaching toward
    // the end from the pointer, '-start' toward the start, none centered on it.
    const across = align === 'end' ? '0%' : align === 'start' ? '-100%' : '-50%';
    const place =
      side === 'left'
        ? { left: p.x - off, top: p.y, translate: ['-100%', across] }
        : side === 'right'
          ? { left: p.x + off, top: p.y, translate: ['0%', across] }
          : side === 'top'
            ? { left: p.x, top: p.y - off, translate: [across, '-100%'] }
            : { left: p.x, top: p.y + off, translate: [across, '0%'] };
    return {
      position: 'absolute',
      ...place,
      zIndex: read(props.layer) ?? LAYERS.tip,
      background: c.background,
      color: c.text,
      radius: radiusOf(theme, read(props.radius) ?? 'sm'),
      padding: tipPad(theme),
      fontSize: sized(theme.fontSizes, 'xs'),
    };
  });
  return (
    <View style={{ self: 'start', align: 'start' }} onPointerMove={move} onPointerEnter={move} onPointerLeave={() => $write(at, null)}>
      {props.children}
      <Show when={() => $read(at) !== null}>
        <Portal>
          <View ref={(/** @type {any} */ n) => (origin = n)} style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0 }} />
          <View role="tooltip" style={look}>
            {typeof props.label === 'object' ? props.label : <Label text={props.label} />}
          </View>
        </Portal>
      </Show>
    </View>
  );
}

Tooltip.Follow = TooltipFollow;
