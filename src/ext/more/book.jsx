// Book: pages that turn, on the Clock. The portable transforms are flat (a
// scale, a rotation and a translation in the page's plane: no rotateY and
// no perspective), so a turn is approximated as Flip's turn is: the leaf
// narrows about the spine to nothing at the half turn, its front shown,
// then widens on the other side with its back shown, shaded toward the
// middle of the turn; the pages under it show as it uncovers them.

import { View, Show, read, $active, $signal, $read, $write, $untrack, $watch, $lookup, $batch, $owner, $cleanup } from 'ren-core';
import { styled } from '../../theme/style.js';
import { pageColors, shadowOf, radiusOf } from '../../theme/resolve.js';
import { $ui } from '../../theme/theme.jsx';
import { alpha } from '../../theme/colors.js';
import { Clock, MOTION, durationOf } from '../../theme/motion.js';
import { pass } from '../../core/layout/layout.jsx';
import { flat, isPart } from '../../core/data/parts.jsx';
import { $controlled } from '../../core/overlays/shared.jsx';
import { easeOf } from '../../core/misc/tween.js';

/** A page of a Book: its content, laid out in a column that fills the page. @param {Record<string, any>} props */
export function BookPage(props) {
  return <View style={styled(props, theme => ({ direction: 'column', width: '100%', height: '100%', padding: theme.spacing.md, overflow: 'hidden' }))}>{props.children}</View>;
}

/**
 * The pages a book shows while at rest or turning: the pages in its left
 * and right slots (`leftPage`, `rightPage`), and the turning leaf's front
 * and back (-1: none).
 * @param {number} page the first page shown (a spread's left one, or the one page)
 * @param {{ dir: number, t: number } | null} turn a turn under way: 1 forward, -1 back; t from 0 to 1
 * @param {boolean} single one page at a time
 * @returns {{ leftPage: number, rightPage: number, front: number, back: number, leafRight: boolean }}
 */
export function bookSlots(page, turn, single) {
  if (single) {
    // One page: the leaf is the page going (forward) or coming (back), turning about its left edge.
    if (turn === null) return { leftPage: -1, rightPage: page, front: -1, back: -1, leafRight: true };
    return turn.dir > 0 ? { leftPage: -1, rightPage: page + 1, front: page, back: -1, leafRight: true } : { leftPage: -1, rightPage: page, front: page - 1, back: -1, leafRight: true };
  }
  if (turn === null) return { leftPage: page, rightPage: page + 1, front: -1, back: -1, leafRight: true };
  const firstHalf = turn.t < 0.5;
  // Forward: the right page lifts off the right, its back lands on the left.
  if (turn.dir > 0) return { leftPage: page, rightPage: page + 3, front: firstHalf ? page + 1 : -1, back: firstHalf ? -1 : page + 2, leafRight: firstHalf };
  return { leftPage: page - 2, rightPage: page + 1, front: firstHalf ? page : -1, back: firstHalf ? -1 : page - 1, leafRight: !firstHalf };
}

/**
 * Pages that turn, on the portable primitives: `Book.Page` children, `value` + `onChange`
 * or `defaultValue` (the first page shown: a spread's left page, even; 0),
 * `w` and `h` (one page's size: `sizes.box.book`, 240 by 320), `single` (one page at a
 * time, not spreads), `duration` (a turn's time: a MOTION preset or ms; two `calm` moves, 600 ms, as a turn crosses the spread), `shadow` ('md'),
 * `radius`, `onFlip(page)` once a turn ends. A press on the right page
 * turns forward, on the left page back (the one page: its right half
 * forward, its left half back); a press during a turn is ignored. The
 * pages turn by pointer only: they are no buttons and hear no keys, so a
 * book read from the keyboard turns through `value` and `onChange` (for
 * example, Buttons beside it that set the page).
 *
 * Portable approximation (the transforms are flat): the leaf narrows by a
 * scale across about the spine to nothing at the half turn and widens
 * again on the other side with its back, a shade on it deepest at the half
 * turn; no curl, no drag of a corner.
 * @param {Record<string, any>} props
 */
export function Book(props) {
  const R = $active();
  const ui = $ui();
  const clock = /** @type {import('../../theme/motion.js').ClockValue} */ ($lookup(Clock));
  const pages = flat(props.children).filter(c => isPart(c, BookPage));
  const single = () => read(props.single) === true;
  const count = pages.length;
  /** The first page shown at rest, kept on a spread's left page. @param {number} p */
  const rest = p => {
    const n = Math.max(0, Math.min(count - 1, Math.floor(Number(p) || 0)));
    return $untrack(R, single) ? n : n - (n % 2);
  };
  const state = $controlled(props, 'value', 'defaultValue', 0, v => props.onChange?.(v));
  /** Where the book is: its page at rest, and a turn under way. */
  const shown = $signal(R, rest($untrack(R, state.get)));
  const turn = $signal(R, /** @type {{ dir: number, t: number } | null} */ (null));
  const step = () => (single() ? 1 : 2);
  // The turn's frames, from wherever it starts (a press, or a page set from outside), until the book goes.
  let dead = false;
  let cancel = () => {};
  const owner = $owner(R);
  if (owner != null)
    $cleanup(/** @type {any} */ (owner), () => {
      dead = true;
      cancel();
    });
  /** Runs `tick(now)` each Clock frame, in a batch, while it returns true. @param {(now: number) => boolean} tick */
  const frames = tick => {
    const run = (/** @type {number} */ now) => {
      if (dead) return;
      let more = false;
      $batch(R, () => {
        more = tick(now);
      });
      if (more && !dead) cancel = clock.frame(run); // timer: feature, a page turn's frame loop
    };
    cancel = clock.frame(run); // timer: feature, a page turn's frame loop
  };
  /** Starts a turn toward `to`, one leaf at a time. @param {number} to */
  const go = to => {
    const from = /** @type {number} */ ($untrack(R, () => $read(shown)));
    if ($untrack(R, () => $read(turn)) !== null || to === from) return;
    const dir = to > from ? 1 : -1;
    const duration = Math.max(0, durationOf(read(props.duration), 2 * MOTION.calm));
    const began = clock.now();
    const ease = easeOf('ease-in-out');
    $write(turn, { dir, t: 0 });
    frames(now => {
      const t = duration > 0 ? Math.min(1, (now - began) / duration) : 1;
      if (t < 1) {
        $write(turn, { dir, t: ease(t) });
        return true;
      }
      const next = from + dir * $untrack(R, step);
      $write(turn, null);
      $write(shown, next);
      props.onFlip?.(next);
      // A page asked for further on turns the next leaf.
      const wanted = rest($untrack(R, state.get));
      if (wanted !== next) go(wanted);
      return false;
    });
  };
  $watch(R, () => rest(state.get()), to => go(to));
  /** Turns one leaf forward or back, within the pages. @param {number} dir */
  const flip = dir => {
    if ($untrack(R, () => $read(turn)) !== null) return;
    const at = /** @type {number} */ ($untrack(R, () => $read(shown)));
    const next = at + dir * $untrack(R, step);
    if (next < 0 || next > count - 1) return;
    // The watch turns it once the page changes (a controlled book: once its parent takes the change).
    state.set(next);
  };
  const width = () => Number(read(props.w) ?? ui.theme().sizes.box.book[0]);
  const height = () => Number(read(props.h) ?? ui.theme().sizes.box.book[1]);
  const slots = () => bookSlots(/** @type {number} */ ($read(shown)), $read(turn), single());
  /** The page at an index, or a blank one past the ends. @param {number} i */
  const pageAt = i => (i >= 0 && i < count ? pages[i] : null);
  const paper = styled({}, (theme, scheme) => ({ background: pageColors(theme, scheme).body, color: pageColors(theme, scheme).text }));
  /** A static slot: its page, pressed to turn. @param {() => number} index @param {() => number} left @param {number} dir */
  const slot = (index, left, dir) => (
    <View
      style={() => ({ ...paper(), position: 'absolute', top: 0, left: left(), width: width(), height: height(), overflow: 'hidden' })}
      onPress={(/** @type {any} */ e) => {
        if (!single()) return flip(dir);
        // One page: the right half turns forward, the left half back.
        const box = e?.currentTarget?.getBoundingClientRect?.();
        const x = e?.clientX ?? e?.x;
        flip(box != null && typeof x === 'number' && x < box.left + box.width / 2 ? -1 : 1);
      }}
    >
      {() => pageAt(index())}
    </View>
  );
  /**
   * The leaf's scale across, never quite 0 (a transform stays invertible):
   * |cos(pi t)| over a spread; one page going narrows from 1, one coming
   * widens from 0.
   */
  const share = () => {
    const turning = $read(turn);
    const t = turning?.t ?? 0;
    const s = !single() ? Math.abs(Math.cos(Math.PI * t)) : (turning?.dir ?? 1) > 0 ? 1 - t : t;
    return Math.max(0.001, Math.round(s * 1000) / 1000);
  };
  const leafStyle = styled({}, (theme, scheme) => {
    const s = slots();
    const w = width();
    const onRight = s.leafRight;
    // Turning about the spine: the leaf's left edge on the right, its right edge on the left.
    const x = single() ? 0 : onRight ? w : 0;
    return {
      background: pageColors(theme, scheme).body,
      color: pageColors(theme, scheme).text,
      position: 'absolute',
      top: 0,
      left: x,
      width: w,
      height: height(),
      overflow: 'hidden',
      zIndex: 1,
      scale: [share(), 1],
      transformOrigin: [onRight ? 0 : w, height() / 2],
      shadow: shadowOf(theme, 'sm'),
    };
  });
  const shade = styled({}, theme => {
    const t = $read(turn)?.t ?? 0;
    return { position: 'absolute', inset: 0, background: alpha(theme.black, Math.round(theme.opacity.soft * Math.sin(Math.PI * t) * 1000) / 1000), pointerEvents: 'none' };
  });
  const style = styled(props, theme => ({
    position: 'relative',
    width: single() ? width() : width() * 2,
    height: height(),
    shrink: 0,
    radius: radiusOf(theme, read(props.radius)),
    shadow: shadowOf(theme, read(props.shadow) ?? 'md'),
  }));
  const spine = styled({}, (theme, scheme) => ({ position: 'absolute', top: 0, left: width() - 1, width: 2, height: height(), zIndex: 2, background: pageColors(theme, scheme).border, pointerEvents: 'none' }));
  return (
    <View {...pass(props)} ref={props.ref} style={style}>
      <Show when={() => !single()}>{slot(() => slots().leftPage, () => 0, -1)}</Show>
      {slot(() => slots().rightPage, () => (single() ? 0 : width()), 1)}
      <Show when={() => $read(turn) !== null}>
        <View style={leafStyle}>
          {() => {
            const s = slots();
            return pageAt(s.front >= 0 ? s.front : s.back);
          }}
          <View style={shade} />
        </View>
      </Show>
      <Show when={() => !single()}>
        <View style={spine} />
      </Show>
    </View>
  );
}

Book.Page = BookPage;
