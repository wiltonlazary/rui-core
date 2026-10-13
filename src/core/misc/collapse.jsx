// Motion: Collapse (height to and from its content's) and Transition
// (effects, as opacity and the style's transforms), on the
// Clock's frames.

import { View, Show, read, $active, $signal, $read, $write, $watch, $untrack } from 'ren-core';
import { styled } from '../../theme/style.js';
import { pass } from '../layout/layout.jsx';
import { $tween, $nextFrame, boxOf, insetsOf } from './tween.js';
import { MOTION, durationOf } from '../../theme/motion.js';
import { BASE_THEME, $ui } from '../../theme/theme.jsx';
import { spacing } from '../../theme/resolve.js';
import { tables } from '../../own.js';

/**
 * Content that opens and closes by animating its height: `open`,
 * `duration` (ms or a MOTION preset; base, 190 ms), `easing` (ease-out),
 * `fade` (false: its height only; true, its opacity follows too),
 * `onEntered` (once open) and `onExited` (once closed), as Transition's.
 * Closed, the content stays built and is hidden.
 * @param {Record<string, any>} props
 */
export function Collapse(props) {
  const R = $active();
  const open = () => read(props.open) === true;
  const first = $untrack(R, open);
  const progress = $tween(first ? 1 : 0);
  /** 'open', 'closed' or 'moving'. */
  const state = $signal(R, first ? 'open' : 'closed');
  const full = $signal(R, 0);
  const frame = $nextFrame();
  /** @type {any} */
  let inner = null;
  const duration = () => durationOf(read(props.duration), MOTION.base);
  let seen = first;
  // Its own style, as given: the height it moves to is the content's and its padding and border above and below
  // (a height is its border box).
  const own = styled(props);
  const fullHeight = () => {
    const inset = insetsOf($untrack(R, own));
    return boxOf(inner).height + inset.top + inset.bottom;
  };
  $watch(R, open, value => {
    if (value === seen) return;
    seen = value;
    if (value) {
      // Shown at no height, then measured once laid out, then grown.
      $write(state, 'moving');
      frame(() => {
        // Closed again before this frame: the close owns the motion now.
        if (!seen) return;
        $write(full, fullHeight());
        progress.to(1, duration(), () => ($write(state, 'open'), props.onEntered?.()), read(props.easing));
      });
    } else {
      $write(full, fullHeight());
      $write(state, 'moving');
      progress.to(0, duration(), () => ($write(state, 'closed'), props.onExited?.()), read(props.easing));
    }
  });
  const style = styled(props, () => {
    if ($read(state) === 'open') return {};
    const p = $read(progress.value);
    return { height: p * $read(full), overflow: 'hidden', ...(read(props.fade) === true ? { opacity: p } : null) };
  });
  return (
    <View {...pass(props)} hidden={() => $read(state) === 'closed'} style={style}>
      <View ref={(/** @type {any} */ node) => (inner = node)} style={{ shrink: 0 }}>
        {props.children}
      </View>
    </View>
  );
}

/**
 * @typedef {object} Preset an effect's look while out: opacity
 * 0, a move (a translate) by `x`, `y` (pixels, or a spacing step such as
 * `'xs'`, `'-xs'` for the other way) or by its own size (`w`, `h`, as
 * fractions), and a `scale` (both axes, or [x, y]) about `origin` ([x, y],
 * percents of its size; the center by default). `lag` holds the fade back
 * for that share of the way (0 to 1; none by default), so the move starts
 * unseen. The style's transforms paint it; the layout keeps its place.
 * @property {boolean=} opacity
 * @property {number | string=} x
 * @property {number | string=} y
 * @property {number=} w
 * @property {number=} h
 * @property {number | readonly [number, number]=} scale
 * @property {readonly [string, string]=} origin
 * @property {number=} lag
 */

const TOP = /** @type {const} */ (['50%', '0%']);
const BOTTOM = /** @type {const} */ (['50%', '100%']);
const START = /** @type {const} */ (['0%', '50%']);
const END = /** @type {const} */ (['100%', '50%']);

/** A slide's fade waits a mark's share of its way (`ratios.mark`), so it arrives from an edge before it shows. */
const SLIDE_LAG = BASE_THEME.ratios.mark;

/**
 * The effects, by name. A short move's origin is the side it enters from,
 * or its center; a slide's is the side it travels toward. A short move is
 * the spacing's `xs` step; a slide is its own size, its fade held back for
 * `ratios.mark` (0.3) of the way; `grow` starts one step down the type scale
 * (the body size over the next one up), small enough to read as growing
 * in place.
 * - `fade`: its opacity only.
 * - `rise`, `sink`: fades in moving up from `xs` below, or down from `xs` above.
 * - `from-start`, `from-end`: fades in from `xs` toward that side.
 * - `grow`: fades in from a smaller scale at its center.
 * - `slide-top`, `slide-bottom`, `slide-start`, `slide-end`: enters from that edge by its own size, showing once `ratios.mark` of the way in.
 * @type {Record<string, Preset>}
 */
export const EFFECTS = tables({
  fade: { opacity: true },
  rise: { opacity: true, y: 'xs', origin: BOTTOM },
  sink: { opacity: true, y: '-xs', origin: TOP },
  'from-start': { opacity: true, x: '-xs', origin: START },
  'from-end': { opacity: true, x: 'xs', origin: END },
  grow: { opacity: true, scale: BASE_THEME.fontSizes.md / BASE_THEME.fontSizes.lg },
  'slide-top': { opacity: true, h: -1, lag: SLIDE_LAG, origin: BOTTOM },
  'slide-bottom': { opacity: true, h: 1, lag: SLIDE_LAG, origin: TOP },
  'slide-start': { opacity: true, w: -1, lag: SLIDE_LAG, origin: END },
  'slide-end': { opacity: true, w: 1, lag: SLIDE_LAG, origin: START },
});

/** An effect by name (fade for an unknown one), or a Preset as it is. @param {string | Preset | null | undefined} effect @returns {Preset} */
export const presetOf = effect => (effect == null ? EFFECTS.fade : typeof effect === 'string' ? (EFFECTS[effect] ?? EFFECTS.fade) : effect);

/**
 * A move in pixels: a number as it is, or a spacing step of the theme
 * (`'xs'`, or `'-xs'` the other way).
 * @param {number | string | undefined} v @param {import('../../theme/theme.jsx').RuiThemeValue} theme @returns {number}
 */
const moveOf = (v, theme) => {
  if (typeof v !== 'string') return v ?? 0;
  const back = v.startsWith('-');
  const px = spacing(theme, /** @type {any} */ (back ? v.slice(1) : v));
  return back ? -px : px;
};

/**
 * The style of content `p` of the way in (1: in place, no style of its
 * own): its opacity and transforms between the preset's and none. A move
 * by a spacing step reads `theme`'s spacing (BASE_THEME's by default).
 * @param {number} p @param {Preset} look @param {import('../../theme/theme.jsx').RuiThemeValue} [theme]
 * @returns {Record<string, any>}
 */
export function transitionStyle(p, look, theme = BASE_THEME) {
  if (p >= 1) return {};
  const q = 1 - p;
  /** @type {Record<string, any>} */
  const out = {};
  if (look.opacity) {
    const lag = Math.min(Math.max(look.lag ?? 0, 0), 1);
    out.opacity = lag >= 1 ? 0 : Math.max(0, (p - lag) / (1 - lag));
  }
  // A move is a translate, painted and never laid out: in pixels, or in
  // its own size (percents of its box, measured by nobody), which wins.
  if (look.x || look.y || look.w || look.h) out.translate = [look.w ? `${q * look.w * 100}%` : q * moveOf(look.x, theme), look.h ? `${q * look.h * 100}%` : q * moveOf(look.y, theme)];
  if (look.scale !== undefined) {
    const [sx, sy] = typeof look.scale === 'number' ? [look.scale, look.scale] : look.scale;
    out.scale = [sx + (1 - sx) * p, sy + (1 - sy) * p];
  }
  if (look.origin !== undefined) out.transformOrigin = look.origin;
  return out;
}

/**
 * Mounts and unmounts its content with an effect: `shown`,
 * `effect` (a name of EFFECTS, fade by default, or a Preset),
 * `duration` (ms or a MOTION preset; base, 190 ms), `exit` (the exit's
 * duration: the duration), `easing` (ease-out),
 * `persistent` (hidden instead of removed), `onEnter`, `onEntered`,
 * `onExit`, `onExited`. Children are content, or a function given the
 * style accessor to put on its own element.
 * @param {Record<string, any>} props
 */
export function Transition(props) {
  const R = $active();
  const ui = $ui();
  const shown = () => read(props.shown) === true;
  const first = $untrack(R, shown);
  const progress = $tween(first ? 1 : 0);
  const present = $signal(R, first);
  const moving = $signal(R, false);
  let seen = first;
  $watch(R, shown, value => {
    if (value === seen) return;
    seen = value;
    const duration = durationOf(read(props.duration), MOTION.base);
    const ease = read(props.easing);
    $write(moving, true);
    if (value) {
      $write(present, true);
      props.onEnter?.();
      progress.to(1, duration, () => ($write(moving, false), props.onEntered?.()), ease);
    } else {
      props.onExit?.();
      progress.to(0, durationOf(read(props.exit), duration), () => ($write(moving, false), $write(present, false), props.onExited?.()), ease);
    }
  });
  /** The style of the content at the current progress. */
  const style = () => ($read(moving) ? transitionStyle($read(progress.value), presetOf(read(props.effect)), ui.theme()) : {});
  const children = props.children;
  const content =
    typeof children === 'function' && children.length >= 1 ? (
      <View style={{ shrink: 0 }}>
        {children(style)}
      </View>
    ) : (
      <View style={styled(props, style)}>
        {children}
      </View>
    );
  if (read(props.persistent) === true) return <View hidden={() => !$read(present)}>{content}</View>;
  return <Show when={() => $read(present)}>{content}</Show>;
}
