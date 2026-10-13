// Carousel and Carousel.Slide:
// slides on a strip moved by an inset, resting on stops computed here
// (stops.js), dragged with pointer capture and settled with momentum
// on the Clock, with controls, indicators, keys, loop, autoplay and a
// store (`$carousel()`).
//
// Layout, on every renderer: a clipped viewport; inside it a frame pulled
// back by the gap (a negative margin) so each slide can carry its
// gap as padding; inside the frame the strip, moved by `left` (or `top`).
// A slide size in percent is a percent of the frame and every offset is
// written in percent too, so nothing waits for a measurement and a resize
// needs none; a size in pixels takes the frame's size from its `onResize`
// (once laid out, then on each resize) and measures it at each drag.
//
// A loop moves each slide by whole periods (a relative inset) so the ones
// leaving on one side come back on the other.

import { View, $context, $lookup, $active, $signal, $read, $write, $batch, $owner, $cleanup, $untrack, $watch, read } from 'ren-core';
import { styled } from '../../theme/style.js';
import { MOTION, durationOf } from '../../theme/motion.js';
import { spacing, shadowOf } from '../../theme/resolve.js';
import { Clock } from '../../theme/motion.js';
import { $ui } from '../../theme/theme.jsx';
import { $breakpoints } from '../../theme/breakpoints.js';
import { IconButton, BackIcon, ForwardIcon } from '../../core/buttons/index.js';
import { $controlled } from '../../core/overlays/shared.jsx';
import { parts } from '../../core/data/parts.jsx';
import { $tween, boxOf, capture } from '../../core/misc/tween.js';
import { stopsOf, nearest, shiftOf, wrap, sizeOf } from './stops.js';
import { $reducedMotion } from '../../hooks/platform.js';

/** @typedef {import('./stops.js').Stops} Stops */

/**
 * What a carousel does, from its store or `getHandle`.
 * @typedef {object} CarouselHandle
 * @property {() => void} next moves to the next stop
 * @property {() => void} previous moves to the previous stop
 * @property {(index: number, options?: { instant?: boolean }) => void} goTo to a stop (a slide with `slidesPerMove` 1); `{ instant: true }` without the animation
 * @property {() => number} selected the selected stop (reactive)
 * @property {() => number} count the number of stops (reactive)
 * @property {() => boolean} hasNext whether there is a next stop (always in a loop)
 * @property {() => boolean} hasPrevious whether there is a previous stop (always in a loop)
 * @property {() => number} offset where the strip is, in slide units: 0 at the first stop's slide, 1 a slide further (reactive)
 * @property {{ play: () => void, stop: () => void, playing: () => boolean }} autoplay
 */

/** What a slide reads from its carousel. */
const SlideContext = $context(/** @type {{ style: (index: number) => () => Record<string, any> } | null} */ (null));

/** The pointer's coordinate along an axis. @param {any} e @param {boolean} vertical */
const along = (e, vertical) => Number(vertical ? (e.clientY ?? e.y) : (e.clientX ?? e.x)) || 0;

/** How far momentum carries a release, in ms of its speed. */
const MOMENTUM = 200; // ms: a release glides on for this long at its speed
/** A release faster than this (px per ms) moves at least one stop. */
const FLICK = 0.3;
/** Past its ends (without a loop) the strip follows the pointer at this share of its pace. */
const RESIST = 0.25;

/**
 * A store for a Carousel (an rrx-core
 * operation): pass it as `store`; its methods act once the carousel
 * is built. Call it while a view is built.
 * @returns {CarouselHandle & { attach: (handle: CarouselHandle | null) => void }}
 */
export function $carousel() {
  const inner = $signal($active(), /** @type {CarouselHandle | null} */ (null));
  const handle = () => $read(inner);
  return {
    attach: h => $write(inner, h),
    next: () => handle()?.next(),
    previous: () => handle()?.previous(),
    goTo: (i, options) => handle()?.goTo(i, options),
    selected: () => handle()?.selected() ?? 0,
    count: () => handle()?.count() ?? 0,
    hasNext: () => handle()?.hasNext() ?? false,
    hasPrevious: () => handle()?.hasPrevious() ?? false,
    offset: () => handle()?.offset() ?? 0,
    autoplay: {
      play: () => handle()?.autoplay.play(),
      stop: () => handle()?.autoplay.stop(),
      playing: () => handle()?.autoplay.playing() ?? false,
    },
  };
}

/**
 * Slides in a row (or a column) that move from stop to stop: `span`
 * (a slide's length: '100%', a percent or px), `gap` (a spacing
 * step or px), each a value or a responsive object (`{ base:
 * '100%', sm: '50%' }`, from the theme's breakpoint up against the root's
 * viewport), `align` ('start', 'center',
 * 'end' or a fraction of the viewport; 'start' by default), `slidesPerMove` (1: the slides a
 * stop holds, so a control moves that many), `loop`,
 * `orientation` ('horizontal' or 'vertical', which needs `height`),
 * `height`, `glide` (a release glides with its momentum and rests there,
 * off any stop), `draggable` (true), `fling` (a fast release may pass
 * several stops; one at most otherwise), `ends` (without a loop: 'open',
 * the default, leaves space past the ends where `align` puts it; 'fill'
 * keeps the frame filled, no stop showing space past the content, and the
 * stops that land together are one), `value`/`defaultValue`/`onChange(index)`
 * (the selected stop's index, 0 by default: a slide's index while each
 * slide is its own stop; a new value moves the strip to it), `duration` (a move's
 * time: a MOTION preset or ms; 'calm'). A percent span is a share of the frame and holds the gap; a
 * px span is the slide's own length and the gap comes between.
 * `controls` (true: round buttons, shown disabled where there is nowhere to
 * go, each holding a pointer glyph, BackIcon and ForwardIcon, drawn down
 * and up in a vertical carousel), `buttonSize` (`sizes.box.carouselButton`,
 * 32), `buttonInset` ('xs'), `nextIcon`, `previousIcon`, `nextLabel`
 * ('Forward'), `previousLabel` ('Back'), `dots` (round marks a sm step in
 * from the edge, the selected one stretched to an lg step and the rest
 * muted; each named `${n} / ${total}`),
 * `keys` (true), `onNext`, `onPrevious`, `autoplay`
 * (true, a delay in ms, or `{ delay, stopOnUse, holdOnHover, startPaused }`:
 * a drag, a key or a control stops it (`stopOnUse`, true); the pointer over
 * it holds it (`holdOnHover`, false); it plays at once unless
 * `startPaused`; it never starts itself while the user asks for reduced
 * motion, its play still starts it), `store` (from `$carousel()`), `getHandle(handle)`.
 * @param {Record<string, any>} props
 */
export function Carousel(props) {
  const R = $active();
  const ui = $ui();
  const clock = /** @type {import('../../theme/motion.js').ClockValue} */ ($lookup(Clock));
  const children = parts(props.children, CarouselSlide, index => ({ index }));
  const count = children.filter(c => c != null && c.component === CarouselSlide).length;
  const vertical = () => read(props.orientation) === 'vertical';
  const bp = $breakpoints();
  const gap = () => spacing(ui.theme(), bp.at(read(props.gap), ui.theme()) ?? 0, 'md');
  /** The frame's measured length in px (0 until measured). */
  const measured = $signal(R, 0);
  /** @type {any} */
  let frameNode = null;
  const measure = () => {
    const box = boxOf(frameNode);
    const px = vertical() ? box.height : box.width;
    if (px > 0 && px !== $read(measured)) $write(measured, px);
    return px > 0 ? px : $read(measured);
  };
  /** The frame's new border box: px slides are measured again. @param {{ width: number, height: number }} box */
  const resized = box => {
    const px = $untrack(R, vertical) ? box.height : box.width;
    if (px > 0 && px !== $untrack(R, () => $read(measured))) $write(measured, px);
  };
  const size = () => sizeOf(bp.at(read(props.span), ui.theme()) ?? '100%');
  /** @returns {Stops} */
  const geometry = () => {
    const s = size();
    const g = gap();
    const percent = s.percent;
    return stopsOf({
      count,
      step: percent ? s.value / 100 : s.value + g,
      frame: percent ? 1 : $read(measured),
      align: read(props.align) ?? 'start',
      loop: read(props.loop) === true,
      ends: read(props.ends) === 'fill' ? 'fill' : 'open',
      group: Math.max(1, Number(read(props.slidesPerMove) ?? 1) || 1),
      percent,
    });
  };
  const first = geometry();
  /** The selected stop's index, controlled (`value`) or not (`defaultValue`). */
  const state = $controlled(props, 'value', 'defaultValue', 0, v => props.onChange?.(v));
  /** A stop's index within the stops there are. @param {any} i @param {number} n */
  const within = (i, n) => Math.max(0, Math.min(n - 1, Math.floor(Number(i) || 0)));
  /** The stop the strip shows (or moves to); `state` follows it. */
  const selected = $signal(R, within($untrack(R, state.get), first.stops.length));
  /** The strip's offset while it moves; at rest it is the selected stop's. */
  const position = $tween(first.stops[$read(selected)] ?? 0);
  /** Whether the strip is off its stop (moving, or resting where a glide left it). */
  const moving = $signal(R, false);
  const offset = () => {
    const geo = geometry();
    return $read(moving) ? $read(position.value) : (geo.stops[Math.min($read(selected), geo.stops.length - 1)] ?? 0);
  };
  const duration = () => durationOf(read(props.duration), MOTION.calm);

  /** Whether the strip is following a value set from outside (not told back). */
  let following = false;
  /** Selects a stop and tells the listeners. @param {number} index */
  const select = index => {
    if (index === $read(selected)) return;
    $write(selected, index);
    if (!following) state.set(index);
  };
  /** Moves the strip to an offset, then rests there as stop `index`. @param {number} index @param {number} to @param {boolean} [instant] */
  const settle = (index, to, instant = false) => {
    const from = offset();
    position.to(from, 0);
    $write(moving, true);
    select(index);
    position.to(to, instant ? 0 : duration(), () => $write(moving, false), 'ease-out');
  };
  /** Moves to stop `index` (wrapped in a loop, clamped otherwise); in a loop, `direction` picks the way round. @param {number} index @param {boolean} [instant] @param {number} [direction] */
  const goTo = (index, instant = false, direction = 0) => {
    const geo = geometry();
    const n = geo.stops.length;
    if (n === 0) return;
    if (!geo.loop) {
      const i = Math.max(0, Math.min(n - 1, index));
      settle(i, geo.stops[i], instant);
      return;
    }
    const i = wrap(index, n);
    const from = offset();
    // The copy of the stop asked for nearest the current offset, the way asked.
    let to = geo.stops[i] + Math.round((from - geo.stops[i]) / geo.period) * geo.period;
    if (direction > 0 && to <= from + 1e-9) to += geo.period;
    if (direction < 0 && to >= from - 1e-9) to -= geo.period;
    settle(i, to, instant);
  };
  // A value set from outside moves the strip there (the nearest way round in a loop).
  $watch(R, () => state.get(), v => {
    const i = within(v, $untrack(R, () => geometry().stops.length));
    if (i === $untrack(R, () => $read(selected))) return;
    following = true;
    try {
      goTo(i);
    } finally {
      following = false;
    }
  });
  const canNext = () => geometry().loop || $read(selected) < geometry().stops.length - 1;
  const canPrev = () => geometry().loop || $read(selected) > 0;
  const next = () => {
    if (!canNext()) return;
    goTo($read(selected) + 1, false, 1);
    props.onNext?.();
  };
  const prev = () => {
    if (!canPrev()) return;
    goTo($read(selected) - 1, false, -1);
    props.onPrevious?.();
  };

  // ---------------------------------------------------------------------
  // Autoplay: a frame loop on the Clock while playing (one callback a frame).

  const auto = () => {
    const a = read(props.autoplay);
    if (a == null || a === false) return null;
    const o = typeof a === 'object' ? a : {};
    return {
      delay: Number(typeof a === 'number' ? a : (o.delay ?? 5000)),
      stopOnUse: o.stopOnUse !== false,
      holdOnHover: o.holdOnHover === true,
      startPaused: o.startPaused === true,
    };
  };
  const playing = $signal(R, false);
  let hovered = false;
  let dragging = false;
  let since = 0;
  /** @type {(() => void) | null} */
  let cancel = null;
  const tick = (/** @type {number} */ now) => {
    cancel = null;
    if (!$read(playing)) return;
    const a = auto();
    if (a === null) return;
    if (hovered && a.holdOnHover) since = now;
    else if (dragging || position.running()) since = now;
    else if (now - since >= a.delay) {
      since = now;
      $batch(R, () => {
        const geo = geometry();
        if (canNext()) goTo($read(selected) + 1, false, 1);
        else goTo(0, false, geo.loop ? 1 : 0);
      });
    }
    cancel = clock.frame(tick); // timer: feature, the carousel's motion frame loop
  };
  const play = () => {
    if (auto() === null) return;
    $write(playing, true);
    since = clock.now();
    if (cancel === null) cancel = clock.frame(tick); // timer: feature, the carousel's motion frame loop
  };
  const stop = () => {
    $write(playing, false);
    if (cancel !== null) cancel();
    cancel = null;
  };
  const interacted = () => {
    const a = auto();
    if (a !== null && a.stopOnUse && $read(playing)) stop();
  };
  const owner = $owner(R);
  if (owner != null) $cleanup(/** @type {any} */ (owner), stop);
  // Content that moves on its own waits for the user when they ask for reduced motion (WCAG 2.2.2):
  // it starts only by its play, and a preference turned on stops it.
  const reduced = $reducedMotion().value;
  if (auto()?.startPaused === false && !$untrack(R, () => $read(reduced))) play();
  $watch(R, () => $read(reduced), on => (on ? stop() : undefined));

  /** @type {CarouselHandle} */
  const handle = {
    next: () => $batch(R, next),
    previous: () => $batch(R, prev),
    goTo: (i, options) => $batch(R, () => goTo(i, options?.instant === true)),
    selected: () => $read(selected),
    count: () => geometry().stops.length,
    hasNext: canNext,
    hasPrevious: canPrev,
    offset: () => {
      const geo = geometry();
      return geo.step > 0 ? (offset() - geo.stops[0]) / geo.step : 0;
    },
    autoplay: { play: () => $batch(R, play), stop: () => $batch(R, stop), playing: () => $read(playing) },
  };
  props.store?.attach(handle);
  props.getHandle?.(handle);

  // ---------------------------------------------------------------------
  // Dragging: the strip follows the pointer (held by capture once it
  // travels), then settles on a stop, carried by its speed.

  /** @type {null | { from: number, start: number, stop: number, px: number, last: number, at: number, speed: number, held: boolean }} */
  let drag = null;
  /** Px per offset unit. */
  const scale = () => (geometry().percent ? measure() : 1);
  const onPointerDown = (/** @type {any} */ e) => {
    if (read(props.draggable) === false || count === 0) return;
    if (typeof e.button === 'number' && e.button > 0) return;
    const px = scale();
    const start = offset();
    position.to(start, 0);
    const now = clock.now();
    drag = { from: along(e, vertical()), start, stop: $read(selected), px: px > 0 ? px : 1, last: along(e, vertical()), at: now, speed: 0, held: false };
  };
  const onPointerMove = (/** @type {any} */ e) => {
    if (drag === null) return;
    const at = along(e, vertical());
    const moved = at - drag.from;
    if (!drag.held) {
      // A press turns into a drag past half the smallest spacing step, so a
      // shaky click still clicks.
      if (Math.abs(moved) < ui.theme().spacing.xs / 2) return;
      drag.held = true;
      dragging = true;
      interacted();
      capture(e);
      $write(moving, true);
    }
    const now = clock.now();
    if (now > drag.at) {
      drag.speed = (at - drag.last) / (now - drag.at);
      drag.at = now;
      drag.last = at;
    }
    const geo = geometry();
    let to = drag.start - moved / drag.px;
    if (!geo.loop) {
      // Past the ends the strip follows at a share of the pointer's pace (RESIST).
      const lo = geo.stops[0];
      const hi = geo.stops[geo.stops.length - 1];
      if (to < lo) to = lo - (lo - to) * RESIST;
      else if (to > hi) to = hi + (to - hi) * RESIST;
    }
    position.to(to, 0);
    e.preventDefault?.();
  };
  const onPointerUp = () => {
    const d = drag;
    drag = null;
    if (d === null || !d.held) return;
    dragging = false;
    const geo = geometry();
    const now = position.now();
    const speed = clock.now() - d.at > 100 ? 0 : d.speed;
    const projected = now - (speed * MOMENTUM) / d.px;
    if (read(props.glide) === true) {
      const lo = geo.stops[0];
      const hi = geo.stops[geo.stops.length - 1];
      const to = geo.loop ? projected : Math.max(lo, Math.min(hi, projected));
      const index = nearest(geo, to);
      select(index);
      position.to(to, duration(), undefined, 'ease-out');
      return;
    }
    let index = nearest(geo, projected);
    const n = geo.stops.length;
    const step = (/** @type {number} */ i) => (geo.loop ? wrap(i, n) : Math.max(0, Math.min(n - 1, i)));
    const direction = now < d.start ? -1 : now > d.start ? 1 : 0;
    if (read(props.fling) !== true) {
      // At most one stop per release, without fling.
      const back = step(d.stop - 1);
      const on = step(d.stop + 1);
      if (index !== d.stop && index !== back && index !== on) index = direction < 0 ? back : on;
    }
    if (index === d.stop && Math.abs(speed) > FLICK) index = step(d.stop + (speed < 0 ? 1 : -1));
    // In a loop the goal is the copy of its stop nearest where the strip is.
    const to = geo.loop ? geo.stops[index] + Math.round((now - geo.stops[index]) / geo.period) * geo.period : geo.stops[index];
    select(index);
    position.to(to, duration(), () => $write(moving, false), 'ease-out');
  };

  const onKey = (/** @type {any} */ e) => {
    if (read(props.keys) === false) return;
    const key = e.key;
    const back = vertical() ? 'ArrowUp' : 'ArrowLeft';
    const forth = vertical() ? 'ArrowDown' : 'ArrowRight';
    if (key !== back && key !== forth) return;
    e.preventDefault?.();
    interacted();
    if (key === forth) next();
    else prev();
  };

  // ---------------------------------------------------------------------
  // Styles

  const unit = (/** @type {number} */ v) => (geometry().percent ? `${v * 100}%` : v);
  /** The strip's offset shown: in a loop, within one period. */
  const shown = () => {
    const geo = geometry();
    const o = offset();
    return geo.loop ? o - Math.floor(o / geo.period) * geo.period : o;
  };
  const slideStyle = (/** @type {number} */ index) => () => {
    const geo = geometry();
    const s = size();
    const g = gap();
    const v = vertical();
    const length = s.percent ? `${s.value}%` : s.value + g;
    /** @type {Record<string, any>} */
    const out = {
      position: 'relative',
      shrink: 0,
      grow: 0,
      minWidth: 0,
      minHeight: 0,
      ...(v ? { height: length, padding: [g, 0, 0, 0] } : { width: length, padding: [0, 0, 0, g] }),
    };
    if (geo.loop) out[v ? 'top' : 'left'] = unit(shiftOf(geo, index, shown()));
    return out;
  };
  // A touch across it drags it; along the other axis it scrolls the page (pan-y).
  const root = styled(props, () => ({ position: 'relative', direction: 'column', ...(read(props.draggable) === false ? null : { touchAction: vertical() ? 'pan-x pinch-zoom' : 'pan-y pinch-zoom' }), ...(read(props.height) != null ? { height: read(props.height) } : null) }));
  /** @returns {Record<string, any>} */
  const viewport = () => ({ direction: 'column', overflow: 'hidden', grow: 1, minHeight: 0, ...(read(props.height) != null ? { height: '100%' } : null) });
  /** @returns {Record<string, any>} */
  const frame = () => {
    const g = gap();
    return vertical() ? { direction: 'column', grow: 1, minHeight: 0, margin: [-g, 0, 0, 0] } : { direction: 'column', margin: [0, 0, 0, -g] };
  };
  /** @returns {Record<string, any>} */
  const strip = () => {
    const v = vertical();
    const o = unit(-shown());
    return v ? { position: 'relative', direction: 'column', height: '100%', top: o } : { position: 'relative', direction: 'row', left: o };
  };

  // Controls and indicators.
  const buttonSize = () => Number(read(props.buttonSize) ?? ui.theme().sizes.box.carouselButton);
  const buttonInset = () => spacing(ui.theme(), read(props.buttonInset) ?? 'xs', 'xs');
  const control = (/** @type {number} */ side) => {
    const style = () => {
      const s = buttonSize();
      const o = buttonInset();
      const place = vertical()
        ? { left: '50%', margin: [0, 0, 0, -s / 2], ...(side > 0 ? { bottom: o } : { top: o }) }
        : { top: '50%', margin: [-s / 2, 0, 0, 0], ...(side > 0 ? { right: o } : { left: o }) };
      return { position: 'absolute', zIndex: 1, shadow: shadowOf(ui.theme(), 'sm'), ...place };
    };
    const icon = side > 0 ? props.nextIcon : props.previousIcon;
    const Glyph = side > 0 ? ForwardIcon : BackIcon;
    return (
      <IconButton
        variant="neutral"
        radius="round"
        size={buttonSize}
        disabled={() => !(side > 0 ? canNext() : canPrev())}
        label={() => String(side > 0 ? (read(props.nextLabel) ?? 'Forward') : (read(props.previousLabel) ?? 'Back'))}
        onPress={() => {
          interacted();
          if (side > 0) next();
          else prev();
        }}
        style={style}
      >
        {icon ?? <Glyph size={() => Math.round(buttonSize() * ui.theme().ratios.icon)} orientation={() => (vertical() ? 'vertical' : 'horizontal')} />}
      </IconButton>
    );
  };
  const indicators = () => {
    const v = vertical();
    const bar = styled({}, theme => ({
      position: 'absolute',
      zIndex: 1,
      gap: theme.spacing.xs / 2,
      justify: 'center',
      align: 'center',
      ...(v ? { direction: 'column', top: 0, bottom: 0, right: theme.spacing.sm } : { direction: 'row', left: 0, right: 0, bottom: theme.spacing.sm }),
    }));
    return (
      <View style={bar}>
        {() => {
          const n = geometry().stops.length;
          return Array.from({ length: n }, (_, i) => (
            <IconButton
              variant="inverse"
              radius="round"
              label={`${i + 1} / ${n}`}
              aria-current={() => ($read(selected) === i ? 'true' : undefined)}
              onPress={() => {
                interacted();
                goTo(i);
              }}
              style={() => {
                const theme = ui.theme();
                const on = $read(selected) === i;
                const dot = theme.spacing.xs;
                const long = on ? theme.spacing.lg : dot;
                return {
                  width: v ? dot : long,
                  height: v ? long : dot,
                  minWidth: v ? dot : long,
                  minHeight: v ? long : dot,
                  border: 0,
                  opacity: on ? 1 : theme.opacity.muted,
                  shadow: shadowOf(theme, 'xs'),
                };
              }}
            />
          ));
        }}
      </View>
    );
  };

  return (
    <SlideContext value={{ style: slideStyle }}>
      <View
        ref={props.ref}
        role="region"
        aria-roledescription="carousel"
        aria-label={() => read(props['aria-label']) ?? 'Carousel'}
        style={root}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerEnter={() => (hovered = true)}
        onPointerLeave={() => (hovered = false)}
        onKey={onKey}
      >
        <View style={viewport}>
          <View ref={(/** @type {any} */ n) => (frameNode = n)} onResize={resized} style={frame}>
            <View style={strip}>{children}</View>
          </View>
        </View>
        {() => (read(props.controls) === false ? null : [control(-1), control(1)])}
        {() => (read(props.dots) === true ? indicators() : null)}
      </View>
    </SlideContext>
  );
}

/**
 * One slide of a Carousel: its content, sized by the carousel's
 * `span` and `gap`; the style props go on its content box. A
 * `group` (a slide).
 * @param {Record<string, any>} props
 */
export function CarouselSlide(props) {
  const ctx = $lookup(SlideContext);
  const inner = styled(props, () => ({ direction: 'column', grow: 1, minWidth: 0, minHeight: 0 }));
  if (ctx === null) return <View style={inner}>{props.children}</View>;
  return (
    <View role="group" aria-roledescription="slide" style={ctx.style(Number(props.index ?? 0))}>
      <View style={inner}>{props.children}</View>
    </View>
  );
}
Carousel.Slide = CarouselSlide;
