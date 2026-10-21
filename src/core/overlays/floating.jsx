// Pin, ActionBar, Glider and Floater: content placed over the page (an
// inset in the portal layer), a box gliding from one element to another on the Clock,
// and a window dragged and resized with pointer capture, kept inside the
// viewport.

import { View, Action, Shape, Show, Portal, read, $active, $signal, $read, $write, $untrack, $watch, $context, $lookup, $resizes } from 'ren-core';
import { $ui } from '../../theme/theme.jsx';
import { styled } from '../../theme/style.js';
import { pageColors, radiusOf, shadowOf, spacing } from '../../theme/resolve.js';
import { LAYERS } from '../../theme/layers.js';
import { $controlled, $presence, timingOf, motionOf, moved, rectOf, roomOf, measurable, Close, keyOf, dismissOf, handled } from './shared.jsx';
import { $tween, $nextFrame } from '../misc/tween.js';
import { DECOR } from '../../theme/meaning.js';
import { handOn } from '../ref.js';
import { labelsIn } from '../../theme/labels.js';

/**
 * Content pinned to a corner of the viewport (`position: fixed`,
 * over the page's scroll): `at` ({ bottom: 'lg', right: 'lg' }; any of
 * top, right, bottom, left, in px or spacing steps), `layer`
 * (`LAYERS.raised`), `portal` (true; false keeps it in place in the
 * tree, still fixed).
 * @param {Record<string, any>} props
 */
export function Pin(props) {
  const style = styled(props, theme => {
    const at = read(props.at) ?? { bottom: 'lg', right: 'lg' };
    /** An inset: px, or a spacing step. @param {any} v */
    const inset = v => (v == null ? undefined : spacing(theme, v));
    return { position: 'fixed', top: inset(at.top), right: inset(at.right), bottom: inset(at.bottom), left: inset(at.left), zIndex: read(props.layer) ?? LAYERS.raised };
  });
  const view = (
    <View ref={props.ref} style={style}>
      {props.children}
    </View>
  );
  return read(props.portal) === false ? view : <Portal>{view}</Portal>;
}

/** The bar an ActionBar.Close closes: its `close()`. */
const ActionBarContext = $context(/** @type {Record<string, any> | null} */ (null));

/**
 * A bar at the bottom of the layer for actions on a selection:
 * `open` with `onOpenChange(open)` (or `defaultOpen`), `at` (centered
 * 'lg' above the bottom by default; { bottom, left } or { bottom, right },
 * in px or spacing steps), `dismiss` (`{ escape }`: Escape in the bar
 * closes it by default; false, or `{ escape: false }`, keeps it), `persistent`, `portal` (true), `shadow`
 * ('md'), `motion` ('base', a grow; or `{ effect, duration, exit,
 * easing }`), `layer` (`LAYERS.sheet`); `ActionBar.Divider` (a spacing
 * sm gap between groups of actions, no line) and `ActionBar.Close`
 * inside.
 * @param {Record<string, any>} props
 */
export function ActionBar(props) {
  const state = $controlled(props, 'open', 'defaultOpen', false, value => props.onOpenChange?.(value));
  const isOpen = () => state.get() === true;
  const close = () => state.set(false);
  const motion = () => motionOf(read(props.motion));
  const presence = $presence(isOpen, () => timingOf(read(props.motion), 'base'));
  const ui = $ui();
  // Escape in the bar closes it unless dismiss turns it off.
  const escape = () => dismissOf(read(props.dismiss)).escape;
  /** @returns {Record<string, any>} */
  const holder = () => {
    const at = read(props.at) ?? {};
    /** An inset: px, or a spacing step. @param {any} v */
    const inset = v => (v == null ? undefined : spacing(ui.theme(), v));
    const bottom = inset(at.bottom ?? 'lg');
    const centered = at.left === undefined && at.right === undefined;
    return centered
      ? { position: 'absolute', bottom, left: 0, right: 0, direction: 'row', justify: 'center', zIndex: read(props.layer) ?? LAYERS.sheet }
      : { position: 'absolute', bottom, left: inset(at.left), right: inset(at.right), direction: 'row', zIndex: read(props.layer) ?? LAYERS.sheet };
  };
  const bar = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    return {
      direction: 'row',
      align: 'center',
      gap: theme.spacing.xs,
      padding: theme.spacing.xs,
      background: page.raised,
      color: page.text,
      border: 1,
      borderColor: page.rule,
      radius: radiusOf(theme, read(props.radius) ?? 'md'),
      shadow: shadowOf(theme, read(props.shadow) ?? 'md'),
      ...moved(presence.t(), motion().effect ?? 'grow'),
    };
  });
  const content = (
    <View style={holder}>
      <View role="toolbar" aria-label={props['aria-label']} style={bar} onKey={(/** @type {any} */ e) => keyOf(e) === 'Escape' && escape() && (handled(e), close())}>
        <ActionBarContext value={{ close }}>{props.children}</ActionBarContext>
      </View>
    </View>
  );
  const shown = () => (read(props.persistent) === true ? true : presence.mounted());
  const placed = read(props.portal) === false ? content : <Portal>{content}</Portal>;
  return (
    <Show when={shown}>
      <View hidden={() => !presence.mounted()} style={{ position: 'absolute', width: 0, height: 0 }}>
        {placed}
      </View>
    </Show>
  );
}

/** A gap between groups of actions: spacing sm of room (beside the bar's own xs gaps), no line. @param {Record<string, any>} props */
export function ActionBarDivider(props) {
  const style = styled(props, theme => ({ width: theme.spacing.sm, minWidth: theme.spacing.sm, self: 'stretch', shrink: 0 }));
  return <View {...DECOR} style={style} />;
}

/** A close button that closes the bar (or calls `onPress`). @param {Record<string, any>} props */
export function ActionBarClose(props) {
  const bar = /** @type {Record<string, any> | null} */ ($lookup(ActionBarContext));
  return <Close size={props.size ?? 'md'} label={props.label} onPress={() => (props.onPress ?? bar?.close)?.()} />;
}

ActionBar.Divider = ActionBarDivider;
ActionBar.Close = ActionBarClose;

/**
 * A box that glides over the element `to` inside the element `within`:
 * both nodes (values, accessors or signals of refs); `duration` ('quick':
 * 110 ms, on the Clock; ms or a preset's name), `radius`, `bg`, and the
 * style props. Put it in `within` (placed against its padding box); it
 * measures both boxes once laid out, when `to` changes and as either
 * changes size.
 * @param {Record<string, any>} props
 */
export function Glider(props) {
  const R = $active();
  const x = $tween(0);
  const y = $tween(0);
  const w = $tween(0);
  const h = $tween(0);
  const shown = $signal(R, false);
  const later = $nextFrame();
  let placed = false;
  /** A zero-size box at the padding box's start, beside it: where its own place is measured from (border or none). @type {any} */
  let origin = null;
  const measure = () => {
    const t = rectOf(read(props.to));
    const p = rectOf(origin);
    if (t === null || p === null || (t.width === 0 && t.height === 0)) return;
    const duration = placed ? timingOf({ duration: read(props.duration) }, 'quick').duration : 0;
    placed = true;
    x.to(t.x - p.x, duration);
    y.to(t.y - p.y, duration);
    w.to(t.width, duration);
    h.to(t.height, duration);
    $write(shown, true);
  };
  $watch(R, () => [read(props.to), read(props.within)], () => later(measure));
  // Measured again as either changes size (a font loading, content).
  $resizes(() => measurable(read(props.to)) ? read(props.to) : null, () => later(measure));
  $resizes(() => measurable(read(props.within)) ? read(props.within) : null, () => later(measure));
  const style = styled(props, theme => ({
    position: 'absolute',
    left: $read(x.value),
    top: $read(y.value),
    width: $read(w.value),
    height: $read(h.value),
    radius: radiusOf(theme, read(props.radius)),
    opacity: $read(shown) ? 1 : 0,
  }));
  return [
    <View {...DECOR} ref={(/** @type {any} */ n) => (origin = n)} style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0 }} />,
    <View ref={props.ref} {...DECOR} style={style} />,
  ];
}

/** The handle a Floater drags by, when it has one, and its resizing. */
const WindowContext = $context(/** @type {any} */ (null));

/** Clamps `v` to [lo, hi] where they are given. @param {number} v @param {number | null | undefined} lo @param {number | null | undefined} hi */
const within = (v, lo, hi) => Math.max(lo ?? -Infinity, Math.min(hi ?? Infinity, v));

/** A pointer event's place. @param {any} e */
const pointAt = e => ({ x: e?.x ?? e?.clientX ?? 0, y: e?.y ?? e?.clientY ?? 0 });

/** Captures the pointer on an event's node, where the platform lets it. @param {any} e */
const capture = e => {
  const node = e?.currentTarget;
  if (node != null && typeof node.setPointerCapture === 'function') {
    try {
      node.setPointerCapture(e.pointerId);
    } catch {
      // The platform may refuse (a synthetic pointer): the drag works while the pointer stays over it.
    }
  }
};

/**
 * A window dragged by the pointer, with pointer
 * capture while it moves: `defaultPosition` (`sizes.box.at`, { top: 20, left: 20 }; or
 * `position` controlled with `onPositionChange`), `draggable` (true),
 * `axis` ('x' or 'y'), `contained` (true: it stays inside the viewport,
 * `margin` (0) from its edges), `bordered`, `shadow` ('md'), `radius`,
 * `p`, `w`, `layer` (`LAYERS.sheet`), `portal` (true), `onDragStart`, `onDragEnd`.
 * With a `Floater.Handle` inside, only the handle drags it. Resizing:
 * a `Floater.Grip` inside (its bottom right corner) and the size
 * `{ width, height }` in px, `defaultSize` (unset: the content's own) or
 * `size` controlled with `onSizeChange({ width, height })`; `bounds`
 * `{ min: { width, height }, max: { width, height } }` (any part may be
 * left out) keeps it in range, and the viewport too while contained;
 * `onResize(phase)` hears 'start' and 'end' around each resize. The
 * viewport is a fixed View over it, in a Portal within the portal
 * layer's box (`roomOf`: a nested DOM root's host); where it cannot be
 * measured (a worker's Handle) nothing is contained. The Grip takes focus (an
 * Action, on every renderer): ArrowRight and ArrowLeft make the window
 * wider and narrower, ArrowDown and ArrowUp higher and lower, a
 * `spacing.xs` step a press (8 px), `spacing.xl` with Shift (32 px),
 * within the same bounds (a 'start', a size and an 'end' each press).
 * @param {Record<string, any>} props
 */
export function Floater(props) {
  const R = $active();
  const start = $untrack(R, () => read(props.defaultPosition)) ?? {};
  const ui = $ui();
  const [top, left] = $untrack(R, () => ui.theme().sizes.box.at);
  const own = $signal(R, { top: start.top ?? top, left: start.left ?? left });
  const at = () => (props.position !== undefined ? read(props.position) : $read(own));
  const bounds = () => read(props.bounds) ?? {};
  const first = $untrack(R, () => read(props.defaultSize)) ?? {};
  const ownSize = $signal(R, /** @type {{ width: number | null, height: number | null }} */ ({ width: first.width ?? null, height: first.height ?? null }));
  /** The size set: the controlled one, else its own. @returns {{ width: number | null, height: number | null }} */
  const sized = () => {
    if (props.size === undefined) return $read(ownSize);
    const s = read(props.size) ?? {};
    return { width: s.width ?? null, height: s.height ?? null };
  };
  /** Sets the size: its own unless controlled, and says so. @param {{ width: number, height: number }} next */
  const setSize = next => {
    if (props.size === undefined) $write(ownSize, next);
    props.onSizeChange?.(next);
  };
  /** @type {any} */
  let node = null;
  /** @type {any} */
  let screen = null;
  /** The portal layer's box: an absolute View over it (none in place). @type {any} */
  let layer = null;
  const constrained = () => read(props.contained) !== false;
  const gap = () => read(props.margin) ?? 0;
  /** The room's box (the viewport within the layer's), when it can be measured. */
  const viewport = () => roomOf(screen, layer);
  /** @type {{ x: number, y: number, top: number, left: number } | null} */
  let drag = null;
  // A Handle inside (it says so as it is made, after the window's style): the window's body then neither drags nor keeps a touch.
  const handled = $signal(R, false);
  const down = (/** @type {any} */ e, /** @type {boolean} */ handle) => {
    if (read(props.draggable) === false || (!handle && $untrack(R, () => $read(handled))) || drag !== null) return;
    const p = $untrack(R, at);
    drag = { ...pointAt(e), top: p.top, left: p.left };
    capture(e);
    props.onDragStart?.();
  };
  const move = (/** @type {any} */ e) => {
    if (drag === null) return;
    const axis = read(props.axis);
    const q = pointAt(e);
    let next = { top: drag.top + (axis === 'x' ? 0 : q.y - drag.y), left: drag.left + (axis === 'y' ? 0 : q.x - drag.x) };
    const v = constrained() ? viewport() : null;
    const box = rectOf(node);
    if (v !== null && box !== null) {
      const g = gap();
      // The room in the portal layer's own coordinates, where top and left are.
      const o = rectOf(layer) ?? { x: 0, y: 0 };
      // Whole pixels that stay inside: a box of a fractional size rounds in, never past the edge.
      const fit = (/** @type {number} */ x, /** @type {number} */ near, /** @type {number} */ far) => Math.max(Math.ceil(near), Math.min(Math.floor(far), Math.round(x)));
      next = {
        top: fit(next.top, v.y - o.y + g, v.y - o.y + v.height - box.height - g),
        left: fit(next.left, v.x - o.x + g, v.x - o.x + v.width - box.width - g),
      };
    }
    if (props.position === undefined) $write(own, next);
    props.onPositionChange?.(next);
  };
  const up = () => {
    if (drag !== null) props.onDragEnd?.();
    drag = null;
  };
  /** @type {{ x: number, y: number, width: number, height: number } | null} */
  let sizing = null;
  /** The size from `width` and `height` within `bounds` (and the viewport while constrained). @param {number} width @param {number} height */
  const fit = (width, height) => {
    const b = bounds();
    const lo = b.min ?? {};
    const hi = b.max ?? {};
    const v = constrained() ? viewport() : null;
    const box = rectOf(node);
    const room = v !== null && box !== null ? { width: v.x + v.width - box.x - gap(), height: v.y + v.height - box.y - gap() } : null;
    return {
      width: Math.round(within(within(width, lo.width, hi.width), null, room?.width)),
      height: Math.round(within(within(height, lo.height, hi.height), null, room?.height)),
    };
  };
  /** The size now: the one set, else the window's measured box. */
  const current = () => {
    const box = rectOf(node);
    const s = $untrack(R, sized);
    return { width: s.width ?? box?.width ?? 0, height: s.height ?? box?.height ?? 0 };
  };
  const resize = {
    /** @param {any} e */
    down(e) {
      sizing = { ...pointAt(e), ...current() };
      capture(e);
      e?.stopPropagation?.();
      props.onResize?.('start');
    },
    /** @param {any} e */
    move(e) {
      if (sizing === null) return;
      e?.stopPropagation?.();
      const q = pointAt(e);
      setSize(fit(sizing.width + q.x - sizing.x, sizing.height + q.y - sizing.y));
    },
    /** @param {any} e */
    up(e) {
      if (sizing === null) return;
      e?.stopPropagation?.();
      sizing = null;
      props.onResize?.('end');
    },
    /** An arrow key on the handle: a `spacing.xs` step, `spacing.xl` with Shift. @param {any} e */
    key(e) {
      const theme = ui.theme();
      const step = e?.shiftKey === true ? theme.spacing.xl : theme.spacing.xs;
      const by = { ArrowRight: [step, 0], ArrowLeft: [-step, 0], ArrowDown: [0, step], ArrowUp: [0, -step] }[/** @type {string} */ (e?.key)];
      if (by === undefined || sizing !== null) return;
      e.preventDefault?.();
      e.stopPropagation?.();
      const s = current();
      props.onResize?.('start');
      setSize(fit(s.width + by[0], s.height + by[1]));
      props.onResize?.('end');
    },
  };
  const style = styled(props, (theme, scheme) => {
    const page = pageColors(theme, scheme);
    const p = at();
    const s = sized();
    return {
      position: 'absolute',
      top: p.top,
      left: p.left,
      ...(s.width !== null ? { width: s.width } : null),
      ...(s.height !== null ? { height: s.height } : null),
      zIndex: read(props.layer) ?? LAYERS.sheet,
      background: page.raised,
      color: page.text,
      radius: radiusOf(theme, read(props.radius)),
      shadow: shadowOf(theme, read(props.shadow) ?? 'md'),
      ...(read(props.bordered) ? { border: 1, borderColor: page.rule } : null),
      ...(props.p === undefined ? { padding: spacing(theme, 'md') } : null),
      direction: 'column',
      cursor: $read(handled) || read(props.draggable) === false ? undefined : 'move',
      ...($read(handled) || read(props.draggable) === false ? null : { touchAction: 'none' }),
    };
  });
  const ctx = {
    use: () => void $write(handled, true),
    down: (/** @type {any} */ e) => down(e, true),
    move,
    up,
    resize,
  };
  const view = (
    <>
      <View ref={(/** @type {any} */ n) => (screen = n)} style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }} />
      <View
        ref={(/** @type {any} */ n) => {
          node = n;
          handOn(props.ref, n);
        }}
        role="dialog"
        aria-label={props['aria-label']}
        style={style}
        onPointerDown={(/** @type {any} */ e) => down(e, false)}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <WindowContext value={ctx}>{props.children}</WindowContext>
      </View>
    </>
  );
  if (read(props.portal) === false) return view;
  return (
    <Portal>
      <View ref={(/** @type {any} */ n) => (layer = n)} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      {view}
    </Portal>
  );
}

/** The part of a Floater that drags it (a title bar). @param {Record<string, any>} props */
export function FloaterHandle(props) {
  const ctx = /** @type {any} */ ($lookup(WindowContext));
  ctx?.use();
  const style = styled(props, () => ({ cursor: 'move', direction: 'row', align: 'center', touchAction: 'none' }));
  return (
    <View style={style} onPointerDown={ctx?.down} onPointerMove={ctx?.move} onPointerUp={ctx?.up} onPointerCancel={ctx?.up}>
      {props.children}
    </View>
  );
}

/**
 * The corner that resizes a Floater
 * (Floater.Grip): at its bottom right, `sizes.glyph.md` (16 px), notches drawn
 * (or its children), dragged with the pointer captured, or focused and
 * resized by the arrow keys (Shift: bigger steps); the window keeps
 * its `bounds`. `label` names it ('Drag to resize').
 * @param {Record<string, any>} props
 */
export function FloaterGrip(props) {
  const ctx = /** @type {any} */ ($lookup(WindowContext));
  const ui = $ui();
  const style = styled(props, theme => ({
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: theme.sizes.glyph.md,
    height: theme.sizes.glyph.md,
    minWidth: 0,
    minHeight: 0,
    padding: 0,
    border: 0,
    background: 'transparent',
    cursor: 'nwse-resize',
    align: 'center',
    justify: 'center',
    touchAction: 'none',
  }));
  const notches = () => {
    const c = pageColors(ui.theme(), ui.scheme()).quiet;
    return [
      { kind: 'path', points: [4, 12, 12, 4], color: c, stroke: 1.5 },
      { kind: 'path', points: [8, 12, 12, 8], color: c, stroke: 1.5 },
    ];
  };
  return (
    <Action
      label={() => read(props.label) ?? labelsIn().dragToResize}
      style={style}
      onPointerDown={ctx?.resize.down}
      onPointerMove={ctx?.resize.move}
      onPointerUp={ctx?.resize.up}
      onPointerCancel={ctx?.resize.up}
      onKey={ctx?.resize.key}
    >
      {props.children ?? <Shape shapes={notches} style={() => ({ width: ui.theme().sizes.glyph.md, height: ui.theme().sizes.glyph.md })} />}
    </Action>
  );
}

Floater.Handle = FloaterHandle;
Floater.Grip = FloaterGrip;
