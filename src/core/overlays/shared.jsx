// What the overlays and the combobox share: controlled or uncontrolled
// state, time on the Clock (a presence with its transition, on
// misc/tween.js's tween; a delay), measurement, the layer a Portal opens over the page, a close
// button, and the placement of a panel against its trigger.
//
// Placement is portable: the panel sits in an "anchor box", an absolute
// View exactly over its trigger, and inside it in a "placement box" whose
// percent insets put it on a side of the anchor (`top: '100%'` is below) and
// whose flex alignment gives the -start, center and -end alignments (a
// centered child wider than its box overflows both sides, as CSS's). In a
// Portal the anchor box is placed at the trigger's getBoundingClientRect()
// less the origin of the portal's container (measured the same way, so the
// page's scroll and a positioned container cancel out); inline (`portal`
// false, or where a node cannot be measured, as a worker's Handle) the
// placement box is a child of the trigger's wrapper, which is its anchor.

import { View, Shape, Action, Portal, read, $active, $signal, $read, $write, $untrack, $watch, $lookup, $owner, $cleanup, $batch, $scrolls, $moves } from 'ren-core';
import { Clock, MOTION } from '../../theme/motion.js';
import { LAYERS } from '../../theme/layers.js';
import { $ui } from '../../theme/theme.jsx';
import { pageColors, colorOf } from '../../theme/resolve.js';
import { styled } from '../../theme/style.js';
import { transitionStyle, presetOf } from '../misc/collapse.jsx';
import { $tween } from '../misc/tween.js';
import { collide } from './collide.js';
import { labelsIn } from '../../theme/labels.js';

// ---------------------------------------------------------------------------
// State

/**
 * A value that is controlled (`props[name]` given: read from it, `change`
 * told) or uncontrolled (its own signal from `props[initial]` or
 * `fallback`, per root).
 * @template T
 * @param {Record<string, any>} props @param {string} name @param {string | null} initial @param {T} fallback @param {((value: T) => void)} [change]
 * @returns {{ get: () => T, set: (value: T) => void }}
 */
export function $controlled(props, name, initial, fallback, change) {
  const R = $active();
  const start = initial === null ? undefined : $untrack(R, () => read(props[initial]));
  const own = $signal(R, /** @type {T} */ (start === undefined ? fallback : start));
  const controlled = () => props[name] !== undefined;
  return {
    get: () => (controlled() ? /** @type {T} */ (read(props[name]) ?? fallback) : $read(own)),
    set(value) {
      if (!controlled()) $write(own, value);
      change?.(value);
    },
  };
}

/**
 * A part prop in its four forms as the built-in part's options: `false`
 * (or null) no part, `true` the built-in part, an options object as it
 * is, and a node (your own part) as `{ node }`. `fallback` stands for an
 * unset prop.
 * @param {any} value @param {any} [fallback]
 * @returns {Record<string, any> | null}
 */
export function partOf(value, fallback = true) {
  const v = value === undefined ? fallback : value;
  if (v === false || v == null) return null;
  if (v === true) return {};
  return typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype ? v : { node: v };
}

/**
 * What closes an overlay (`dismiss`): `{ escape, outside }`, both true by
 * default; `false` for neither.
 * @param {any} value
 * @returns {{ escape: boolean, outside: boolean }}
 */
export function dismissOf(value) {
  if (value === false) return { escape: false, outside: false };
  if (value == null || value === true) return { escape: true, outside: true };
  return { escape: value.escape !== false, outside: value.outside !== false };
}

/**
 * A backdrop's color: the deepest ground of the dark page (its `sunken`
 * role), in both schemes, so a shade over the page reads as dusk.
 * @param {any} theme
 */
export const shadeColor = theme => pageColors(theme, 'dark').sunken;

/**
 * A backdrop's opacity: the disabled step in the light scheme, the muted
 * one in the dark (a dark page needs more shade to set the content off);
 * the opacity steps are the nearest tokens until the theme has a shade one.
 * @param {any} theme @param {'light' | 'dark'} scheme
 */
export const shadeOpacity = (theme, scheme) => (scheme === 'dark' ? theme.opacity.muted : theme.opacity.disabled);

// ---------------------------------------------------------------------------
// Time

/** @typedef {import('../../theme/motion.js').ClockValue} ClockValue */

/**
 * A delay on the Clock, owned by the calling component: `run(ms, fn)` calls
 * `fn` in a batch after `ms` (at once for 0), replacing a pending one;
 * `cancel()` drops it.
 */
export function $delay() {
  const R = $active();
  const clock = /** @type {ClockValue} */ ($lookup(Clock));
  /** @type {(() => void) | null} */
  let cancel = null;
  const drop = () => {
    if (cancel !== null) cancel();
    cancel = null;
  };
  const owner = $owner(R);
  if (owner != null) $cleanup(/** @type {any} */ (owner), drop);
  return {
    /** @param {number} ms @param {() => void} fn */
    run(ms, fn) {
      drop();
      if (!(ms > 0)) return void fn();
      const end = clock.now() + ms;
      const tick = (/** @type {number} */ now) => {
        cancel = null;
        if (now >= end) $batch(R, fn);
        else cancel = clock.frame(tick); // timer: feature, a delay counted on the Clock's frames
      };
      cancel = clock.frame(tick); // timer: feature, a delay counted on the Clock's frames
    },
    cancel: drop,
    pending: () => cancel !== null,
  };
}

/**
 * @typedef {object} Timing a motion's timing: the `motion` prop's
 * `duration` (ms), `exit` (the closing's ms; the duration by default) and
 * `easing` (a curve's name, 'ease-out' by default, or a function)
 * @property {number} duration
 * @property {number=} exit
 * @property {(string | ((t: number) => number))=} easing
 */

/** A duration in ms: a number as it is, or a `MOTION` preset's name ('quick', 'base', 'calm'). @param {any} v @returns {number | undefined} */
const msOf = v => {
  if (v == null || typeof v === 'number') return v ?? undefined;
  const p = /** @type {any} */ (MOTION)[v];
  return typeof p === 'number' ? p : p?.duration;
};

/**
 * A `motion` prop as its options: a preset's name (`motion="quick"`) is
 * `{ duration }`; an object is as it is (`{ effect, duration, exit,
 * easing }`, its durations in ms or preset names).
 * @param {any} motion
 * @returns {Record<string, any>}
 */
export const motionOf = motion => (typeof motion === 'string' ? { duration: msOf(motion) } : (motion ?? {}));

/**
 * A `motion` prop's timing, `fallback` the overlay's own default (ms or a
 * preset's name).
 * @param {any} motion @param {number | string} fallback
 * @returns {Timing}
 */
export const timingOf = (motion, fallback) => {
  const m = motionOf(motion);
  return { duration: msOf(m.duration) ?? /** @type {number} */ (msOf(fallback)), exit: msOf(m.exit), easing: m.easing };
};

/**
 * Presence with a transition: `mounted()` is true while `open()` is or while
 * it closes; `t()` goes 0 to 1 as it opens (over the timing's `duration` on
 * the Clock, by its `easing`) and back as it closes (over its `exit`).
 * `exited` is called once it has closed.
 * @param {() => boolean} open @param {() => Timing} timing @param {{ entered?: () => void, exited?: () => void }} [on]
 */
export function $presence(open, timing, on = {}) {
  const R = $active();
  const first = $untrack(R, open);
  const t = $tween(first ? 1 : 0);
  const mounted = $signal(R, first);
  let seen = first;
  $watch(R, open, value => {
    if (value === seen) return;
    seen = value;
    const { duration, exit, easing } = $untrack(R, timing);
    if (value) {
      $write(mounted, true);
      t.to(1, duration, on.entered, easing);
    } else
      t.to(
        0,
        exit ?? duration,
        () => {
          $write(mounted, false);
          on.exited?.();
        },
        easing,
      );
  });
  return { mounted: () => /** @type {boolean} */ ($read(mounted)), t: () => /** @type {number} */ ($read(t.value)) };
}

/**
 * The style of content at motion progress `t` (1 in place): an
 * `effect` (a name or a Preset) as opacity and transforms, painted and
 * never laid out.
 * @param {number} t @param {string | import('../misc/collapse.jsx').Preset | undefined} effect
 */
export const moved = (t, effect) => transitionStyle(t, presetOf(effect));

// ---------------------------------------------------------------------------
// Measurement

/**
 * A node's border box in the surface's space, as getBoundingClientRect()
 * gives it on ren-dom and ren-canv; null where the node cannot say (a
 * worker's Handle).
 * @param {any} node
 * @returns {{ x: number, y: number, width: number, height: number } | null}
 */
export function rectOf(node) {
  if (node == null || typeof node.getBoundingClientRect !== 'function') return null;
  const r = node.getBoundingClientRect();
  return { x: r.x ?? r.left ?? 0, y: r.y ?? r.top ?? 0, width: r.width ?? 0, height: r.height ?? 0 };
}

/** True when a node can be measured (not a worker's Handle). @param {any} node */
export const measurable = node => node != null && typeof node.getBoundingClientRect === 'function';

/** Focuses a node when it can take focus. @param {any} node */
export const focus = node => void (node != null && typeof node.focus === 'function' && node.focus());

/**
 * The element with the focus in a node's document, on every renderer (the
 * DOM's document or shadow root, a canvas item's Document); null where the
 * node cannot say (a worker's Handle).
 * @param {any} node
 */
export const activeOf = node => (node != null && typeof node.getRootNode === 'function' ? (node.getRootNode()?.activeElement ?? null) : null);

// ---------------------------------------------------------------------------
// The layer

/**
 * Content over the page: a Portal (the renderer's portal layer, or
 * `into`) holding a View over the whole layer (`position: 'absolute'`,
 * `inset: 0`) at `layer`. With `portal` false it renders in place,
 * covering its parent instead.
 *
 * On ren-dom the layer is the viewport (the portal's container is the
 * page's body); on ren-canv the portal layer is as wide and as high as the
 * viewport too. `prevent` cancels those default actions on it (a menu's
 * backdrop: the browser's context menu).
 * @param {{ layer?: any, portal?: any, into?: any, style?: any, children?: any, onPointerDown?: any, onKey?: any, ref?: any, prevent?: any }} props
 */
export function Layer(props) {
  const style = () => ({ position: 'absolute', inset: 0, zIndex: read(props.layer) ?? LAYERS.sheet, ...read(props.style) });
  const content = (
    <View ref={props.ref} style={style} onKey={props.onKey} onPointerDown={props.onPointerDown} prevent={props.prevent}>
      {props.children}
    </View>
  );
  if (read(props.portal) === false) return content;
  return <Portal into={props.into}>{content}</Portal>;
}

// ---------------------------------------------------------------------------
// Placement

/** @typedef {'top' | 'right' | 'bottom' | 'left'} Side */
/** @typedef {'start' | 'center' | 'end'} Align */

/** A placement ('bottom-start') as its side and alignment. @param {string | undefined} at @returns {[Side, Align]} */
export function sideOf(at) {
  const [side, align] = (at ?? 'bottom').split('-');
  return [/** @type {Side} */ (['top', 'right', 'bottom', 'left'].includes(side) ? side : 'bottom'), /** @type {Align} */ (align === 'start' || align === 'end' ? align : 'center')];
}

/**
 * The placement box's style: on `side` of its anchor box, `offset` away,
 * its child aligned by `align`; `full` makes the child as wide (or high)
 * as the anchor.
 * @param {Side} side @param {Align} align @param {number} offset @param {boolean} full
 * @returns {Record<string, any>}
 */
export function placement(side, align, offset, full) {
  const justify = align;
  switch (side) {
    case 'top':
      return { position: 'absolute', bottom: '100%', left: 0, right: 0, padding: [0, 0, offset, 0], direction: 'row', justify, align: full ? 'stretch' : 'end' };
    case 'left':
      return { position: 'absolute', right: '100%', top: 0, bottom: 0, padding: [0, offset, 0, 0], direction: 'column', justify, align: 'end' };
    case 'right':
      return { position: 'absolute', left: '100%', top: 0, bottom: 0, padding: [0, 0, 0, offset], direction: 'column', justify, align: 'start' };
    default:
      return { position: 'absolute', top: '100%', left: 0, right: 0, padding: [offset, 0, 0, 0], direction: 'row', justify, align: 'start' };
  }
}

/** @typedef {import('./collide.js').Fit} Fit */

/** Two boxes the same, rounded. @param {Record<string, number> | null} a @param {Record<string, number> | null} b */
const same = (a, b) => a !== null && b !== null && Object.keys(a).every(k => Math.round(a[k]) === Math.round(b[k]));

/**
 * A panel placed against a trigger: in a Portal over the page at the
 * trigger's box (`portal` true and the trigger measurable), else inline in
 * the trigger's wrapper. `anchor()` is the wrapper node (a signal's read);
 * `children` is the panel.
 *
 * Where the nodes can be measured (not a worker's Handle), it handles
 * collisions with the viewport by its `collision` (`flip` and
 * `slide`, both true by default): the viewport is a fixed View over it
 * (`inset: 0`), the panel's size its own box. It follows its trigger
 * while `active()`: measured again on every scroll that can move it
 * (ren-core's `$scrolls`: an ancestor's, the page's, answered in the
 * scroll's own frame), on any other move of the trigger (ren-core's
 * `$moves`: a layout shift above it, a transform, an animation), when
 * the viewport or the panel resizes, and when `follow` (given the
 * measure) is called, as the trigger's onResize.
 * The result goes to `fit` (a signal of a Fit, or null before a measure).
 * @param {{ anchor: () => any, portal: () => boolean, at: () => string | undefined, offset: () => number, width: () => any, layer: () => number, children?: any, collision?: () => any, active?: () => boolean, fit?: any, follow?: (measure: () => void) => void }} props
 */
export function Placed(props) {
  const R = $active();
  const ui = $ui();
  const node = $untrack(R, props.anchor);
  const can = measurable(node);
  const portal = $untrack(R, props.portal) && can;
  const box = $signal(R, { x: 0, y: 0, width: 0, height: 0 });
  const fit = props.fit ?? $signal(R, /** @type {Fit | null} */ (null));
  /** @type {any} */
  let origin = null;
  /** @type {any} */
  let screen = null;
  /** @type {any} */
  let child = null;
  const collision = () => ({ flip: true, slide: true, ...(props.collision?.() ?? null) });
  const measure = () => {
    const r = rectOf(node);
    if (r === null) return;
    if (portal) {
      const o = rectOf(origin) ?? { x: 0, y: 0 };
      const next = { x: r.x - o.x, y: r.y - o.y, width: r.width, height: r.height };
      if (!same(next, $untrack(R, () => $read(box)))) $write(box, next);
    }
    const v = rectOf(screen);
    const d = rectOf(child);
    if (v === null || d === null || v.width <= 0 || v.height <= 0 || (d.width === 0 && d.height === 0)) return;
    const [side, align] = sideOf($untrack(R, props.at));
    const m = $untrack(R, collision);
    const next = collide(r, d, v, { side, align, offset: $untrack(R, props.offset), clear: $untrack(R, ui.theme).spacing.xs, flip: m.flip !== false, slide: m.slide !== false });
    const was = /** @type {Fit | null} */ ($untrack(R, () => $read(fit)));
    if (was === null || was.side !== next.side || was.shift !== next.shift || was.center !== next.center || was.length !== next.length) $write(fit, next);
  };
  const active = () => props.active?.() ?? true;
  /** Measures again while active (a scroll, a resize). */
  const follow = () => {
    if ($untrack(R, active)) $batch(R, measure);
  };
  props.follow?.(follow);
  if (can) {
    if ($untrack(R, active)) measure();
    $watch(R, active, on => {
      if (on) measure();
    });
    $scrolls(follow);
    // Any other move of the trigger: a layout shift above it, a transform, an animation.
    $moves(node, follow);
  }
  /** The side it is on: the fitted one, else the one asked for. @returns {[Side, Align]} */
  const at = () => {
    const [side, align] = sideOf(props.at());
    return [/** @type {Fit | null} */ ($read(fit))?.side ?? side, align];
  };
  const place = () => {
    const [side, align] = at();
    return placement(side, align, props.offset(), props.width() === 'trigger');
  };
  /** @returns {Record<string, any>} */
  const inner = () => {
    const width = props.width();
    const [side] = at();
    const vertical = side === 'top' || side === 'bottom';
    const shift = /** @type {Fit | null} */ ($read(fit))?.shift ?? 0;
    return {
      shrink: 0,
      ...(width === 'trigger' ? (vertical ? { grow: 1, width: '100%' } : null) : width != null ? { width } : null),
      ...(shift !== 0 ? { position: 'relative', [vertical ? 'left' : 'top']: shift } : null),
    };
  };
  // The anchor box and the placement box lie over the trigger and beside
  // it: they let the pointer through (pointerEvents), the panel takes it.
  const content = (
    <>
      {can ? <View ref={(/** @type {any} */ n) => (screen = n)} style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }} onResize={follow} /> : null}
      <View style={() => ({ ...place(), pointerEvents: 'none' })}>
        <View ref={(/** @type {any} */ n) => (child = n)} style={() => ({ ...inner(), pointerEvents: 'auto' })} onResize={can ? follow : undefined}>
          {props.children}
        </View>
      </View>
    </>
  );
  if (!portal)
    return (
      <Portal into={node}>
        <View style={() => ({ position: 'absolute', inset: 0, zIndex: props.layer(), pointerEvents: 'none' })}>{content}</View>
      </Portal>
    );
  return (
    <Portal>
      <View ref={(/** @type {any} */ n) => (origin = n)} style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0 }} />
      <View
        style={() => {
          const b = $read(box);
          return { position: 'absolute', left: b.x, top: b.y, width: b.width, height: b.height, zIndex: props.layer(), pointerEvents: 'none' };
        }}
      >
        {content}
      </View>
    </Portal>
  );
}

// ---------------------------------------------------------------------------
// Drawn pieces

/**
 * An arrow on a panel's `side` facing its trigger: a triangle of the
 * panel's background with its border on the two outer edges; `at` (px
 * from the panel's start along that side) places it, else `align`
 * (`offset` from the aligned edge, or centered).
 * @param {{ side: Side, align: Align, size: number, offset: number, background: string, border: string | null, at?: number | null }} a
 */
export function Arrow(a) {
  const s = a.size;
  const horizontal = a.side === 'top' || a.side === 'bottom';
  /** The triangle pointing out of the panel, in a box s*2 by s (or s by s*2). */
  const pts =
    a.side === 'bottom'
      ? [0, s, s, 0, 2 * s, s]
      : a.side === 'top'
        ? [0, 0, s, s, 2 * s, 0]
        : a.side === 'right'
          ? [s, 0, 0, s, s, 2 * s]
          : [0, 0, s, s, 0, 2 * s];
  const shapes = [{ kind: 'path', points: pts, color: a.background, closed: true }];
  if (a.border !== null) shapes.push(/** @type {any} */ ({ kind: 'path', points: pts, color: a.border, stroke: 1 }));
  // The panel's side facing the trigger: the arrow sits just outside it.
  const edge = a.side === 'bottom' ? { top: -s } : a.side === 'top' ? { bottom: -s } : a.side === 'right' ? { left: -s } : { right: -s };
  const placed = a.at != null;
  const justify = placed ? 'start' : a.align;
  const pad = placed ? [0, 0, 0, Math.max(0, /** @type {number} */ (a.at))] : [0, a.offset];
  /** @type {Record<string, any>} */
  const along = horizontal
    ? { left: 0, right: 0, height: s, direction: 'row', justify, padding: pad }
    : { top: 0, bottom: 0, width: s, direction: 'column', justify, padding: placed ? [Math.max(0, /** @type {number} */ (a.at)), 0, 0, 0] : [a.offset, 0] };
  return (
    <View aria-hidden="true" style={{ position: 'absolute', ...edge, ...along, pointerEvents: 'none' }}>
      <Shape shapes={shapes} style={{ width: horizontal ? 2 * s : s, height: horizontal ? s : 2 * s, shrink: 0 }} />
    </View>
  );
}

/** An X of two strokes. @param {number} size @param {string} color */
export const crossFigures = (size, color) => {
  const p = size * 0.25; // geometry: the X's inset from its box's corners
  const q = size - p;
  const stroke = Math.max(1.5, size / 10);
  return [
    { kind: 'path', points: [p, p, q, q], color, stroke },
    { kind: 'path', points: [q, p, p, q], color, stroke },
  ];
};

/** A downward chevron. @param {number} size @param {string} color */
export const chevronFigures = (size, color) => [{ kind: 'path', points: [size * 0.25, size * 0.4, size * 0.5, size * 0.65, size * 0.75, size * 0.4], color, stroke: Math.max(1.5, size / 10) }];

/** A check mark. @param {number} size @param {string} color */
export const checkFigures = (size, color) => [{ kind: 'path', points: [size * 0.2, size * 0.52, size * 0.42, size * 0.72, size * 0.8, size * 0.3], color, stroke: Math.max(1.5, size / 8) }];

/**
 * A close button (ghost): an X in the page's quiet color in a square
 * press area, `size` xs to xl (the box the theme's `sizes.icon`, the X its
 * `sizes.closeIcon`), `label` for assistive technology,
 * `onPress`.
 * @param {Record<string, any>} props
 */
export function Close(props) {
  const ui = $ui();
  const dims = () => {
    const icon = /** @type {Record<string, number>} */ (ui.theme().sizes.icon);
    const closeIcon = /** @type {Record<string, number>} */ (ui.theme().sizes.closeIcon);
    const s = read(props.size) ?? 'md';
    return icon[s] == null ? [icon.md, closeIcon.md] : [icon[s], closeIcon[s]];
  };
  const style = styled(props, (theme, scheme) => {
    const [box] = dims();
    const page = pageColors(theme, scheme);
    return {
      width: box,
      height: box,
      minHeight: box,
      padding: 0,
      radius: theme.radius.sm,
      background: 'transparent',
      border: 0,
      align: 'center',
      justify: 'center',
      shrink: 0,
      cursor: 'pointer',
      hover: { background: pageColors(theme, scheme).hover },
      color: page.quiet,
    };
  });
  const ink = () => (read(props.color) != null ? colorOf(ui.theme(), ui.scheme(), read(props.color)) : pageColors(ui.theme(), ui.scheme()).quiet);
  return (
    <Action ref={props.ref} label={() => read(props.label) ?? labelsIn().close} onPress={props.onPress} onKey={props.onKey} style={style}>
      <Shape shapes={() => crossFigures(dims()[1], ink())} style={() => ({ width: dims()[1], height: dims()[1], shrink: 0 })} />
    </Action>
  );
}

/**
 * A pointer-down handler that runs `fn` only for a press on the node itself
 * (not on its content), as a backdrop's.
 * @param {() => void} fn
 */
export const self = fn => (/** @type {any} */ e) => {
  if (e != null && e.target === e.currentTarget) fn();
};


/** The key of a key event (ren-core's `{ key }`, the DOM's KeyboardEvent). @param {any} e @returns {string} */
export const keyOf = e => (e == null || composing(e) ? '' : String(e.key ?? ''));

/**
 * Whether a key belongs to an input method composing a word (the DOM's
 * `isComposing`, or its keyCode 229): the Enter that confirms it and the
 * arrows among its candidates are its own, never a field's command. The
 * canvases never send one. `keyOf` reads such a key as none.
 * @param {any} e
 */
export const composing = e => e != null && (e.isComposing === true || e.keyCode === 229);

/** Keeps a key from its default action (a field's edit, a button's press). @param {any} e */
export const prevent = e => void e?.preventDefault?.();

/**
 * An Escape that closed an open layer goes no further: the Modal, Drawer or
 * Popover around the layer stays open.
 * @param {any} e
 */
export const handled = e => void e?.stopPropagation?.();

/**
 * An item's content in one row from its start, inside an Action (menu
 * items, combobox options and fields start what they hold): a DOM
 * button is no flex container and centers its text, so the row is a View
 * as wide as the Action, its text started, `gap` apart.
 * @param {{ gap?: any, children?: any }} props
 */
export function ActionRow(props) {
  return <View style={() => ({ direction: 'row', align: 'center', justify: 'start', textAlign: 'start', gap: read(props.gap) ?? 0, grow: 1, shrink: 1, minWidth: 0 })}>{props.children}</View>;
}
