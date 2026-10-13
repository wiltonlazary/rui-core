// TextAnimate and Flip: entrance animations and a card flip on motionOn (the
// Clock context's frames), portable: opacity, transforms and sizes only.

import { View, Label, Action, For, Show, read, $active, $signal, $read, $write, $untrack, $watch, $lookup, $context, $focus } from 'ren-core';
import { styled } from '../../theme/style.js';
import { $ui } from '../../theme/theme.jsx';
import { Clock, motionOn, MOTION, durationOf } from '../../theme/motion.js';
import { pass } from '../../core/layout/layout.jsx';
import { flat, isPart } from '../../core/data/parts.jsx';
import { $controlled, activeOf, focus } from '../../core/overlays/shared.jsx';
import { easeOf } from '../../core/misc/tween.js';
import { presetOf, transitionStyle } from '../../core/misc/collapse.jsx';
import { DECOR, state as ariaState } from '../../theme/meaning.js';
import { pageColors } from '../../theme/resolve.js';
import { handOn } from '../../core/ref.js';

/** The flip a Flip.Trigger toggles, and whether it shows its back. */
const FlipContext = $context(/** @type {{ toggle: () => void, flipped: () => boolean } | null} */ (null));

/**
 * Splits text into the segments TextAnimate animates: `'chars'` (spaces
 * kept as their own), `'words'` (with the spaces between them dropped:
 * the row's gap stands for them), `'lines'`, or `false` (the whole text,
 * one segment).
 * @param {string} text @param {'words' | 'chars' | 'lines' | false} split
 * @returns {string[]}
 */
export function segmentsOf(text, split) {
  if (split === false) return text === '' ? [] : [text];
  if (split === 'lines') return text.split('\n');
  if (split === 'chars') return Array.from(text);
  return text.split(/\s+/).filter(w => w !== '');
}

/**
 * A segment's style at progress `p` (0 hidden, 1 in place): the effect's
 * look (a name of EFFECTS) eased out, painted by transforms, and always
 * faded in.
 * @param {string} effect @param {number} p
 * @returns {Record<string, any>}
 */
export function segmentStyle(effect, p) {
  return { opacity: p, ...transitionStyle(p, presetOf(effect)) };
}

/**
 * Text that animates in or out by segment:
 * `children` or `text`, `play` ('in', 'out' or false: shown as it is; a
 * change replays), `split` ('words', 'chars', 'lines' or false: the whole
 * text at once), `effect`
 * (a name of EFFECTS: 'fade', 'rise', 'sink', 'grow', 'slide-bottom', …),
 * `duration` (a MOTION preset or ms a segment; 'calm'), `stagger` (50 ms between segments),
 * `delay` (0), `easing` ('ease-out'), `onStart`,
 * `onEnd`, and the style props. It is named
 * by its whole text (`aria-label`), as DigitRoll by its value; the
 * moving segments are decoration.
 * @param {Record<string, any>} props
 */
export function TextAnimate(props) {
  const R = $active();
  const ui = $ui();
  const clock = /** @type {import('../../theme/motion.js').ClockValue} */ ($lookup(Clock));
  const each = () => durationOf(read(props.duration), MOTION.calm);
  const text = () => String(read(props.text) ?? read(props.children) ?? '');
  /** @returns {'words' | 'chars' | 'lines' | false} */
  const by = () => read(props.split) ?? 'words';
  const segments = () => segmentsOf(text(), by());
  const mode = () => read(props.play) ?? 'in';
  /** The time since the animation started (Infinity: finished). */
  const elapsed = $signal(R, 0);
  let stop = () => {};
  const total = () => {
    const n = $untrack(R, segments).length;
    return Number(read(props.delay) ?? 0) + Math.max(0, n - 1) * Number(read(props.stagger) ?? 50) + each();
  };
  const start = () => {
    stop();
    $write(elapsed, 0);
    if ($untrack(R, mode) === false) return;
    props.onStart?.();
    const began = clock.now();
    stop = motionOn(R, clock, now => {
      const t = now - began;
      const end = $untrack(R, total);
      $write(elapsed, Math.min(t, end));
      if (t >= end) {
        props.onEnd?.();
        return false;
      }
      return true;
    });
  };
  $watch(R, () => [mode(), text(), by()], start);
  /** A segment's progress: 0 before it starts, 1 once in (for 'in'; reversed for 'out'). @param {number} i */
  const progress = i => {
    const m = mode();
    if (m === false) return 1;
    const t = /** @type {number} */ ($read(elapsed)) - Number(read(props.delay) ?? 0) - i * Number(read(props.stagger) ?? 50);
    const p = easeOf(read(props.easing) ?? 'ease-out')(Math.min(1, Math.max(0, t / Math.max(1, each()))));
    return m === 'out' ? 1 - p : p;
  };
  // The space between words: a mark's share of the body size (ratios.mark × fontSizes.md).
  const space = (/** @type {any} */ theme) => Math.round(theme.fontSizes.md * theme.ratios.mark);
  const style = styled(props, theme => ({
    direction: by() === 'lines' ? 'column' : 'row',
    wrap: by() !== 'lines',
    align: by() === 'lines' ? 'start' : 'end',
    columnGap: by() === 'chars' ? 0 : space(theme),
  }));
  return (
    <View aria-label={text} {...pass(props)} style={style}>
      <For by="position" each={segments}>
        {(segment, i) => (
          <Show when={() => segment() !== ' '} fallback={<View style={() => ({ width: space(ui.theme()), shrink: 0 })} />}>
            <Label {...DECOR} text={segment} style={() => segmentStyle(read(props.effect) ?? 'fade', progress(i))} />
          </Show>
        )}
      </For>
    </View>
  );
}

/** Flip's two faces, in order: the front, then the back. @param {Record<string, any>} props */
export function FlipFace(props) {
  return <View style={styled(props, () => ({ direction: 'column', width: '100%', height: '100%' }))}>{props.children}</View>;
}

/**
 * A card that flips between two faces (the first child the front, the
 * second the back): `flipped` + `onFlippedChange(flipped)` or its own
 * from `defaultFlipped` (false), `duration` (a MOTION preset or ms; 'calm'),
 * `onFlipEnd(flipped)`, `orientation` ('horizontal' or 'vertical'), `w`, `h`, and
 * `Flip.Trigger` inside (it toggles on press). The portable transforms
 * are flat (no rotateY or perspective), so the turn is a scale across
 * through 0: the face narrows (or flattens) about its center to nothing
 * at the half turn, painted so and never reflowed, and the other face
 * widens back.
 * @param {Record<string, any>} props
 */
export function Flip(props) {
  const R = $active();
  const ui = $ui();
  const clock = /** @type {import('../../theme/motion.js').ClockValue} */ ($lookup(Clock));
  const state = $controlled(props, 'flipped', 'defaultFlipped', false, v => props.onFlippedChange?.(v));
  /** The turn: 0 the front, 1 the back. */
  const turn = $signal(R, $untrack(R, state.get) ? 1 : 0);
  let stop = () => {};
  /** @type {any} */
  let root = null;
  /** @type {any} */
  let faceNode = null;
  /** Whether the keyboard focus was on the face leaving as the turn began: that face goes at the half turn. */
  let held = false;
  /** What had the focus as the turn began. @type {any} */
  let holder = null;
  /** Whether `node` is `root` or inside it (the DOM's parents, ren-canv's). @param {any} root @param {any} node */
  const inside = (root, node) => {
    for (let n = node; root != null && n != null; n = n.parentNode ?? n.parent ?? null) if (n === root) return true;
    return false;
  };
  $watch(R, () => state.get() === true, on => {
    const goal = on ? 1 : 0;
    const from = $untrack(R, () => /** @type {number} */ ($read(turn)));
    if (from === goal) return;
    // Only the face's own focus moves with it: a control of the caller's elsewhere in the Flip keeps its own.
    holder = activeOf(root);
    held = inside(faceNode, holder);
    stop();
    const duration = durationOf(read(props.duration), MOTION.calm) * Math.abs(goal - from);
    const began = clock.now();
    stop = motionOn(R, clock, now => {
      const t = duration > 0 ? Math.min(1, (now - began) / duration) : 1;
      const eased = easeOf('ease-in-out')(t);
      $write(turn, from + (goal - from) * eased);
      if (t >= 1) props.onFlipEnd?.(on);
      return t < 1;
    });
  });
  const vertical = () => read(props.orientation) === 'vertical';
  /** The visible share of the face: |cos(pi * turn)|. */
  const share = () => Math.abs(Math.cos(Math.PI * /** @type {number} */ ($read(turn))));
  const back = () => /** @type {number} */ ($read(turn)) >= 0.5;
  // At the half turn the face swaps; the focus that was on the old one moves to the new one's first
  // focusable (else to the Flip, where it can take it), not to the page.
  $watch(R, back, () => {
    if (!held) return;
    held = false;
    // The focus the leaving face had: gone with it (to the page, or nowhere), or still in the Flip. Moved
    // elsewhere since, it is the caller's: left alone.
    const active = activeOf(root);
    const lost = active == null || active === holder || active === active.ownerDocument?.body;
    holder = null;
    if (!lost && !inside(root, active)) return;
    if (!$focus(faceNode)) focus(root);
  });
  const faces = flat(props.children).filter(c => isPart(c, FlipFace));
  const others = flat(props.children).filter(c => !isPart(c, FlipFace));
  const height = () => read(props.h) ?? ui.theme().sizes.box.stage;
  // The face's scale across (never quite 0: a transform stays invertible for hit testing).
  const face = /** @returns {Record<string, any>} */ () => {
    const s = Math.max(0.001, Math.round(share() * 1000) / 1000);
    return { position: 'absolute', inset: 0, scale: vertical() ? [1, s] : [s, 1] };
  };
  const style = styled(props, () => ({ position: 'relative', height: height() }));
  return (
    <FlipContext value={{ toggle: () => state.set(!$untrack(R, state.get)), flipped: () => state.get() === true }}>
      <View
        {...pass(props)}
        ref={(/** @type {any} */ n) => {
          root = n;
          handOn(props.ref, n);
        }}
        style={style}
      >
        <View ref={(/** @type {any} */ n) => (faceNode = n)} style={face}>
          <Show when={back} fallback={faces[0] ?? null}>
            {faces[1] ?? null}
          </Show>
        </View>
        {others}
      </View>
    </FlipContext>
  );
}

/**
 * Toggles the Flip around it when pressed, by pointer or keyboard (a
 * button, named by its content or `aria-label`): wraps its children, with
 * no look of its own. It is a button, so its content holds no controls
 * (buttons, links, fields), only text, images and the like.
 *
 * A function child `(props) => control` puts no button of its own: it
 * renders the caller's control, handed `onPress` (turns the Flip),
 * `aria-pressed` (bound: 'true' while the back shows) and `label` (the
 * Trigger's `aria-label` or `label`, when set):
 * `<Flip.Trigger aria-label="Turn over">{p => <Button {...p}>Turn</Button>}</Flip.Trigger>`.
 * @param {Record<string, any>} props
 */
export function FlipTrigger(props) {
  const flip = /** @type {{ toggle: () => void, flipped: () => boolean } | null} */ ($lookup(FlipContext));
  const children = props.children;
  if (typeof children === 'function' && children.length >= 1) {
    const name = props.label ?? props['aria-label'];
    return children({ onPress: () => flip?.toggle(), 'aria-pressed': ariaState(() => flip?.flipped() ?? false), ...(name === undefined ? {} : { label: name }) });
  }
  return (
    <Action
      label={props['aria-label']}
      onPress={() => flip?.toggle()}
      // The page's text color, as Pressable: an Action's own is the paper's, for a filled button.
      style={styled(props, (theme, scheme) => ({ background: 'transparent', color: pageColors(theme, scheme).text, border: 0, padding: 0, radius: 0, minHeight: 0, direction: 'column', align: 'stretch', justify: 'start', textAlign: 'start', cursor: 'pointer' }))}
    >
      {children}
    </Action>
  );
}

Flip.Front = FlipFace;
Flip.Back = FlipFace;
Flip.Trigger = FlipTrigger;
