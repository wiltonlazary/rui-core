// Miscellaneous: Divider, VisuallyHidden, ScrollBox (and its Fit),
// ScrollRow and Marquee, on View, Label and Scroll.

import { View, Label, Scroll, Shape, read, $active, $signal, $read, $write, $watch, $untrack, $lookup } from 'ren-core';
import { styled, Nowrap } from '../../theme/style.js';
import { pageColors, spacing, colorOf, sized } from '../../theme/resolve.js';
import { alpha } from '../../theme/colors.js';
import { $motion, MOTION, Clock, platformClock } from '../../theme/motion.js';
import { ending, later } from '../../hooks/shared.js';
import { $ui } from '../../theme/theme.jsx';
import { pass } from '../layout/layout.jsx';
import { $tween, boxOf, capture } from './tween.js';
import { handOn } from '../ref.js';
import { $barRoom } from '../../ext/more/shared.js';
import { DECOR } from '../../theme/meaning.js';
import { $reducedMotion } from '../../hooks/platform.js';
import { labelsIn } from '../../theme/labels.js';

/**
 * A line between content: `orientation` (horizontal or vertical), `size`
 * (xs to xl, the theme's `sizes.divider`, or pixels), `color` (the page's rule color by default), `line`
 * (solid, dashed, dotted: the
 * line is a border), `label` with `labelAt` (start,
 * center, end). A rule means nothing (`aria-hidden`); its label stays
 * text.
 * @param {Record<string, any>} props
 */
export function Divider(props) {
  const ui = $ui();
  const thick = () => {
    const s = read(props.size);
    return sized(ui.theme().sizes.divider, s, 'xs');
  };
  const vertical = () => read(props.orientation) === 'vertical';
  /** The line: a border on one side of an empty box. @returns {Record<string, any>} */
  const rule = styled({}, (theme, scheme) => ({
    borderColor: read(props.color) == null ? pageColors(theme, scheme).rule : colorOf(theme, scheme, read(props.color)),
    borderStyle: read(props.line) ?? 'solid',
    ...(vertical() ? { borderLeft: thick(), width: 0 } : { borderTop: thick(), height: 0 }),
  }));
  const line = (/** @type {boolean} */ grow) => <View aria-hidden="true" style={() => ({ ...rule(), shrink: 0, ...(grow ? { grow: 1 } : { width: ui.theme().spacing.sm }) })} />;
  const style = styled(props, theme =>
    vertical()
      ? { ...rule(), self: 'stretch', shrink: 0, minHeight: 1 }
      : { direction: 'row', align: 'center', gap: theme.spacing.xs, self: 'stretch', fontSize: theme.fontSizes.xs, ...(read(props.label) == null ? rule() : null) },
  );
  return (
    <View aria-hidden={() => (read(props.label) == null ? 'true' : undefined)} {...pass(props)} style={style}>
      {() => {
        const label = read(props.label);
        if (vertical() || label == null) return null;
        const at = read(props.labelAt) ?? 'center';
        return [
          at === 'start' ? line(false) : line(true),
          typeof label === 'string' || typeof label === 'number' ? <Label text={String(label)} style={styled({}, (theme, scheme) => ({ color: pageColors(theme, scheme).quiet }))} /> : label,
          at === 'end' ? line(false) : line(true),
        ];
      }}
    </View>
  );
}

/**
 * Content out of sight, still in the view (and the accessibility mirror);
 * its text keeps to one line (`white-space: nowrap`), so a 1 px
 * box holds one row, not a row per letter.
 * @param {Record<string, any>} props
 */
export function VisuallyHidden(props) {
  return (
    <View {...pass(props)} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', margin: -1, padding: 0 }}>
      <Nowrap value={true}>{props.children}</Nowrap>
    </View>
  );
}

/**
 * The portable style of a Scroll's bars from a `bars` prop: none for false, else their width's word and their colors
 * from the theme (options `thin`, `color`, `track`).
 * @param {any} b @param {any} theme @param {'light' | 'dark'} scheme
 */
function barsOf(b, theme, scheme) {
  if (b === false) return { scrollbarWidth: /** @type {const} */ ('none') };
  const o = b != null && typeof b === 'object' ? b : {};
  const page = pageColors(theme, scheme);
  return {
    scrollbarWidth: o.thin === true ? /** @type {const} */ ('thin') : /** @type {const} */ ('auto'),
    scrollbarColor: [o.color == null ? page.border : colorOf(theme, scheme, o.color), o.track == null ? page.track : colorOf(theme, scheme, o.track)],
  };
}

/**
 * A scrolling region: `h` or `maxHeight` bound it, `axis` ('y', by
 * default, 'x' or 'both') is the way it scrolls, `onScroll` hears `{ x, y }`
 * (the offsets across and down), `ref` gets the Scroll (with `scrollTop`
 * and `scrollLeft`), `gutter` keeps room for a scrollbar (spacing xs).
 * `bars`: true (the default: the renderer's bars, as wide as its theme's
 * bar), false (no bars and no room kept for them; the wheel, touch and
 * `scrollTop` still scroll it) or options: `thin` (half as wide), `color`
 * (the thumb's; the page's `border` by default) and `track` (the page's
 * `track` by default), theme colors. `onEnd` (an endless list's next page)
 * is called while the scroll down is within `endGap` px (spacing lg by
 * default) of its end: after a scroll, and as the box or its content
 * changes size (content that does not fill the box is at its end), at most
 * once a frame. When it returns a promise, the end is checked again once it
 * settles, so a page that did not fill the box asks for the next one; it
 * returns nothing when it has nothing to read (all read, a read under way
 * or failed), and the asking stops there.
 * @param {Record<string, any>} props
 */
export function ScrollBox(props) {
  /** @type {any} */
  let node = null;
  const ask = props.onEnd == null ? null : $endOf(props, () => node);
  const onScroll = () => {
    props.onScroll?.({ x: node?.scrollLeft ?? 0, y: node?.scrollTop ?? 0 });
    ask?.();
  };
  const bars = (/** @type {any} */ theme, /** @type {'light' | 'dark'} */ scheme) => barsOf(read(props.bars), theme, scheme);
  return (
    <Scroll
      {...pass(props)}
      axis={props.axis}
      ref={(/** @type {any} */ n) => {
        node = n;
        handOn(props.ref, n);
        if (n != null) ask?.();
      }}
      onScroll={onScroll}
      {...(ask === null ? null : { onResize: ask })}
      style={styled(props, (theme, scheme) => ({ shrink: 0, ...bars(theme, scheme), ...(read(props.gutter) ? { padding: [0, theme.spacing.xs, 0, 0] } : null) }))}
    >
      {ask === null ? props.children : <View onResize={ask}>{props.children}</View>}
    </Scroll>
  );
}

/**
 * A ScrollBox's `onEnd`, asked for: the end checked at the next frame of the
 * nearest Clock (one check a frame, however many asks), and `onEnd` called
 * when the scroll is within `endGap` of it; again once a promise it returns
 * settles. Nothing once the box's owner ends.
 * @param {Record<string, any>} props @param {() => any} scroller
 */
function $endOf(props, scroller) {
  const R = $active();
  const ui = $ui();
  /** @type {import('../../theme/motion.js').ClockValue} */
  let clock = platformClock;
  try {
    clock = $lookup(Clock);
  } catch {
    // A root outside a view: the platform's frames.
  }
  /** @type {(() => void) | null} */
  let cancel = null;
  let ended = false;
  const check = () => {
    const n = scroller();
    if (n == null) return;
    const { scrollTop, clientHeight, scrollHeight } = n;
    if (typeof scrollTop !== 'number' || typeof clientHeight !== 'number' || typeof scrollHeight !== 'number') return;
    const gap = Number(read(props.endGap) ?? ui.theme().spacing.lg);
    if (scrollHeight - scrollTop - clientHeight > gap) return;
    const next = props.onEnd?.();
    if (next != null && typeof next.then === 'function') next.then(ask, ask);
  };
  const ask = () => {
    if (cancel !== null || ended) return;
    cancel = clock.frame(() => { // timer: feature, one check of the end per frame, however many asks came in it
      cancel = null;
      if (!ended) later(R, check);
    });
  };
  ending(R, () => {
    ended = true;
    cancel?.();
    cancel = null;
  });
  return ask;
}

/** A ScrollBox as high as its content, up to `maxHeight`. @param {Record<string, any>} props */
function ScrollBoxFit(props) {
  return <ScrollBox {...props} />;
}
ScrollBox.Fit = ScrollBoxFit;


/** A chevron pointing left (-1) or right (1). @param {{ side: number, size: () => number, color: () => string }} props */
function Arrow(props) {
  const shapes = () => {
    const s = props.size();
    const k = props.side * s * 0.15; // geometry: the chevron's half-width, a share of its box
    return [{ kind: 'path', points: [s / 2 - k, s * 0.25, s / 2 + k, s / 2, s / 2 - k, s * 0.75], stroke: 1.5, color: props.color() }];
  };
  return <Shape shapes={shapes} style={() => ({ width: props.size(), height: props.size() })} />;
}

/**
 * A horizontal strip that scrolls: a Scroll along x, with chevron controls
 * at the ends while there is more (`step` px a press, animated over `MOTION.base`;
 * by default the strip's visible width times `ratios.pad`, three quarters, so a
 * quarter of what was shown stays in view as the place kept;
 * `buttonSize` md, a step of the theme's `sizes.icon` or px), the wheel (its vertical turn scrolls across too), and
 * dragging with `draggable`. `previousIcon` and `nextIcon`
 * replace the chevrons. `bars` is ScrollBox's: the renderer's bar by default,
 * false for none (the chevrons, wheel, touch and drag still scroll it), or its
 * options. The controls follow the scroll position and
 * the strip's and its content's sizes (their `onResize`: once laid out
 * and on each resize). The strip is as high as its row and its bar's room
 * (a Scroll is otherwise the theme's region high), once the row is laid
 * out, and the row at least as wide as the strip.
 * @param {Record<string, any>} props
 */
export function ScrollRow(props) {
  const R = $active();
  const ui = $ui();
  const offset = $tween(0);
  /** The Scroll's scrollLeft, and how far it can go. */
  const at = $signal(R, 0);
  const max = $signal(R, 0);
  /** @type {any} */
  let viewport = null;
  // The strip's height: its row's, measured, and its bar's room; null until the row is laid out.
  const bar = $barRoom();
  const row = $signal(R, /** @type {number | null} */ (null));
  /** True while a control's press animates the position. */
  let driving = false;
  const sync = () => {
    if (viewport == null) return;
    $write(max, Math.max(0, (viewport.scrollWidth ?? 0) - (viewport.clientWidth ?? 0)));
    $write(at, viewport.scrollLeft ?? 0);
  };
  const place = (/** @type {number} */ x) => {
    if (viewport == null) return;
    viewport.scrollLeft = x;
    sync();
  };
  $watch(R, () => $read(offset.value), x => {
    if (driving) place(x);
  });
  const go = (/** @type {number} */ to, /** @type {number} */ duration) => {
    sync();
    const from = $untrack(R, () => $read(at));
    const goal = Math.max(0, Math.min($untrack(R, () => $read(max)), to));
    driving = false;
    offset.to(from, 0);
    driving = true;
    offset.to(goal, duration, () => {
      driving = false;
      place(goal);
    });
  };
  /** A press's distance: `step`, else the visible width times `ratios.pad`. */
  const stride = () => read(props.step) ?? (viewport?.clientWidth ?? 0) * ui.theme().ratios.pad;
  const step = (/** @type {number} */ side) => go($untrack(R, () => $read(at)) + side * $untrack(R, stride), MOTION.base);
  const size = () => {
    const s = read(props.buttonSize);
    return sized(ui.theme().sizes.icon, s, 'md');
  };
  const ink = styled({}, (theme, scheme) => ({ color: pageColors(theme, scheme).text }));
  const control = (/** @type {number} */ side) => {
    const shown = () => (side < 0 ? $read(at) > 0.5 : $read(at) < $read(max) - 0.5);
    const style = styled({}, (theme, scheme) => ({
      position: 'absolute',
      top: 0,
      bottom: 0,
      ...(side < 0 ? { left: 0 } : { right: 0 }),
      width: size(),
      align: 'center',
      justify: 'center',
      background: pageColors(theme, scheme).body,
      cursor: 'pointer',
      zIndex: 1,
    }));
    const icon = side < 0 ? props.previousIcon : props.nextIcon;
    return () =>
      shown() ? (
        <View {...{ label: () => (side < 0 ? labelsIn().scrollBack : labelsIn().scrollForward) }} onPress={() => step(side)} style={style}>
          {icon ?? <Arrow side={side} size={() => size() * ui.theme().ratios.icon} color={() => String(ink().color)} />}
        </View>
      ) : null;
  };
  let from = -1;
  let start = 0;
  const drag = {
    onPointerDown(/** @type {any} */ e) {
      if (!read(props.draggable)) return;
      from = e.clientX ?? e.x;
      sync();
      start = $untrack(R, () => $read(at));
      capture(e);
    },
    onPointerMove(/** @type {any} */ e) {
      if (from < 0) return;
      driving = false;
      place(start - ((e.clientX ?? e.x) - from));
    },
    onPointerUp() {
      from = -1;
    },
    onPointerCancel() {
      from = -1;
    },
  };
  // The wheel's vertical turn scrolls across (its own deltaX already does).
  const onWheel = (/** @type {any} */ e) => {
    if (viewport == null || Math.abs(e.deltaX ?? 0) >= Math.abs(e.deltaY ?? 0) || e.shiftKey) return;
    sync();
    const before = $untrack(R, () => $read(at));
    driving = false;
    place(Math.max(0, Math.min($untrack(R, () => $read(max)), before + e.deltaY)));
    if ($untrack(R, () => $read(at)) !== before) e.preventDefault?.();
  };
  return (
    <View {...pass(props)} style={styled(props, () => ({ position: 'relative', direction: 'row' }))}>
      <Scroll
        axis="x"
        ref={(/** @type {any} */ n) => {
          viewport = n;
          bar.ref(n);
        }}
        {...drag}
        onWheel={onWheel}
        onScroll={sync}
        onResize={(/** @type {{ height: number }} */ box) => {
          bar.onResize(box);
          sync();
        }}
        style={styled({}, (theme, scheme) => {
          const high = $read(row);
          const b = read(props.bars);
          // the renderer's own bar unless one is asked for, or none
          return { grow: 1, minWidth: 0, shrink: 1, ...(b == null || b === true ? null : barsOf(b, theme, scheme)), ...(high === null ? null : { height: high + bar.room() }) };
        })}
      >
        <View
          onResize={(/** @type {{ height: number }} */ box) => {
            if (box.height !== $untrack(R, () => $read(row))) $write(row, box.height);
            sync();
          }}
          style={{ direction: 'row', self: 'start', shrink: 0, minWidth: '100%' }}
        >
          {props.children}
        </View>
      </Scroll>
      {control(-1)}
      {control(1)}
    </View>
  );
}

/**
 * Content scrolling past in a loop: `duration` (ms a loop, 20000),
 * `orientation`, `reverse`, `holdOnHover`, `gap` (lg between the copies),
 * `repeat` (2 copies), `fade` (false; true: at both ends the page ground,
 * or `fadeColor`, eases out through alpha over `fadeSize`, xl: solid at
 * the edge, at `theme.opacity.soft` half way, clear at the inner end).
 * The first copy is the content; the others repeat it as `inert`
 * decoration: no Tab stop, no pointer, no selection, out of the
 * accessibility tree and of its data, so a control in it is reached and
 * read once, in the first copy. It holds still while the user
 * asks for reduced motion (content that moves on its own, WCAG 2.2.2), and
 * goes on from there when they no longer do.
 * @param {Record<string, any>} props
 */
export function Marquee(props) {
  const R = $active();
  const reduced = $reducedMotion().value;
  const offset = $signal(R, 0);
  const vertical = () => read(props.orientation) === 'vertical';
  /** @type {any} */
  let copy = null;
  let paused = false;
  /** The first copy's box, measured once laid out and again as it resizes (its content changing). @type {{ width: number, height: number } | null} */
  let box = null;
  let last = -1;
  let traveled = 0;
  const gap = styled({}, theme => ({ gap: spacing(theme, read(props.gap), 'lg') }));
  $motion(now => {
    if (last >= 0 && !paused && !$untrack(R, () => $read(reduced))) traveled += now - last;
    last = now;
    if (box === null) {
      const b = boxOf(copy);
      if (b.width > 0 || b.height > 0) box = { width: b.width, height: b.height };
    }
    // A loop is a copy and a gap along the axis, both read each frame: a new gap or orientation takes at once.
    const length = box === null ? 0 : (vertical() ? box.height : box.width) + Number(gap().gap);
    if (length > 0) {
      const d = read(props.duration) ?? 20000; // cycle: one pass of the strip, a loop, not a transition
      const at = ((traveled / d) * length) % length;
      $write(offset, read(props.reverse) ? at - length : -at);
    }
    return true;
  });
  const hover = {
    onPointerEnter: () => (paused = read(props.holdOnHover) === true),
    onPointerLeave: () => (paused = false),
  };
  const count = () => Math.max(1, read(props.repeat) ?? 2);
  /** @returns {any} */
  const track = () => ({ ...gap(), direction: vertical() ? 'column' : 'row', shrink: 0, self: 'start', ...(vertical() ? { top: $read(offset) } : { left: $read(offset) }) });
  const item = /** @type {const} */ ({ direction: 'row', shrink: 0 });
  /** An end's fade: the ground through alpha, solid at the edge to clear, letting the pointer through. @param {boolean} start */
  const fade = start =>
    styled({}, (theme, scheme) => {
      const color = read(props.fadeColor) == null ? pageColors(theme, scheme).body : colorOf(theme, scheme, read(props.fadeColor));
      const f = read(props.fadeSize) ?? 'xl';
      const size = typeof f === 'string' && !Object.hasOwn(theme.spacing, f) ? f : spacing(theme, f);
      const v = vertical();
      // Toward the content: 90 degrees points right, 180 down.
      const angle = (v ? 180 : 90) + (start ? 0 : 180);
      return {
        position: 'absolute',
        ...(v ? { left: 0, right: 0, height: size, ...(start ? { top: 0 } : { bottom: 0 }) } : { top: 0, bottom: 0, width: size, ...(start ? { left: 0 } : { right: 0 }) }),
        background: { linear: angle, stops: [[0, color], [1 / 2, alpha(color, theme.opacity.soft)], [1, alpha(color, 0)]] },
        pointerEvents: 'none',
      };
    });
  return (
    <View {...pass(props)} {...hover} style={styled(props, () => ({ overflow: 'hidden', direction: vertical() ? 'column' : 'row' }))}>
      <View style={track}>
        {() =>
          Array.from({ length: count() }, (_, i) =>
            i === 0 ? (
              <View ref={(/** @type {any} */ n) => (copy = n)} onResize={(/** @type {{ width: number, height: number }} */ b) => (box = { width: b.width, height: b.height })} style={item}>
                {props.children}
              </View>
            ) : (
              // A repeated copy is only seen: input, assistive technology and data reach the content once.
              <View inert style={item}>
                {props.children}
              </View>
            ),
          )
        }
      </View>
      {() => (read(props.fade) !== true ? null : [<View style={fade(true)} />, <View style={fade(false)} />])}
    </View>
  );
}
