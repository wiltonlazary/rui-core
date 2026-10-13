// What the extra components share: a pointer's point, a drag with pointer
// capture, a measured width, and each root's window order.

import { read, $active, $signal, $read, $write, $untrack, $unowned, $writable, $owner, $cleanup } from 'ren-core';
import { boxOf, capture } from '../../core/misc/tween.js';
import { handOn } from '../../core/ref.js';

export { boxOf, capture };

/** A pointer event's point in the surface's space (the DOM's clientX/Y, ren-canv's x/y). @param {any} e */
export const pointOf = e => ({ x: Number(e?.clientX ?? e?.x ?? 0), y: Number(e?.clientY ?? e?.y ?? 0) });

/** A number kept between two bounds. @param {number} v @param {number} lo @param {number} hi */
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * A drag with pointer capture: `down(e, state)` starts it (capturing the
 * pointer on the pressed primitive), `move(e)` calls `onMove(dx, dy,
 * state)` while it lasts, `up(e)` ends it with `onEnd(state, moved)`;
 * `cancel()` (a press the browser took back) ends it where the last move
 * left it, with `onEnd` only when it moved (a taken-back press is no click).
 * @template S
 * @param {{ onMove: (dx: number, dy: number, state: S, e: any) => void, onEnd?: (state: S, moved: boolean, e: any) => void }} on
 */
export function dragger(on) {
  /** @type {{ x: number, y: number, state: S, moved: boolean } | null} */
  let drag = null;
  return {
    active: () => drag !== null,
    /** @param {any} e @param {S} state */
    down(e, state) {
      if ((e?.button ?? 0) !== 0) return false;
      const p = pointOf(e);
      drag = { x: p.x, y: p.y, state, moved: false };
      capture(e);
      e?.preventDefault?.();
      return true;
    },
    /** @param {any} e */
    move(e) {
      if (drag === null) return;
      const p = pointOf(e);
      const dx = p.x - drag.x;
      const dy = p.y - drag.y;
      if (dx !== 0 || dy !== 0) drag.moved = true;
      on.onMove(dx, dy, drag.state, e);
    },
    /** @param {any} e */
    up(e) {
      if (drag === null) return;
      const d = drag;
      drag = null;
      on.onEnd?.(d.state, d.moved, e);
    },
    cancel() {
      if (drag === null) return;
      const d = drag;
      drag = null;
      if (d.moved) on.onEnd?.(d.state, true, null);
    },
  };
}

/**
 * A primitive's width as its `onResize` reports it (hand it to the
 * primitive): the first size once laid out, then each change; or `props.w`
 * when that is a number.
 * @param {Record<string, any>} props @param {string} [name] the prop that fixes it
 */
export function $width(props, name = 'w') {
  const R = $active();
  const measured = $signal(R, 0);
  /** @type {any} */
  let node = null;
  const fixed = () => {
    const w = read(props[name]);
    return typeof w === 'number' ? w : null;
  };
  return {
    /** @param {any} n */
    ref(n) {
      node = n;
      handOn(props.ref, n);
    },
    node: () => node,
    width: () => fixed() ?? /** @type {number} */ ($read(measured)),
    /** @param {{ width: number }} box */
    onResize(box) {
      const w = Math.round(box.width);
      if (w > 0 && w !== $untrack(R, () => $read(measured))) $write(measured, w);
    },
  };
}


/** Per root, its windows from the back to the front (roots are isolated: nothing module-wide changes between them). @type {WeakMap<object, any>} */
const stacks = new WeakMap();

/**
 * A window's place among its root's windows, from the back: 1 for the
 * backmost, as many as there are for the front one (tracked), so a stack
 * of windows spans exactly as many steps above its layer as it has windows,
 * however often they are pressed; `front()` moves it to the front. It joins
 * as it is built (in front) and leaves as it goes.
 * @returns {{ place: () => number, front: () => void }}
 */
export function $stack() {
  const R = $active();
  // One list per root, made outside the asking scope (it outlives the first window), which a window
  // built or gone inside a computation writes.
  /** @type {import('ren-core').Writable<object[]>} */
  let list = stacks.get(R);
  if (list === undefined) stacks.set(R, (list = $unowned(R, () => $writable($signal(R, /** @type {object[]} */ ([]))))));
  const now = () => /** @type {object[]} */ ($untrack(R, () => $read(list)));
  const me = {};
  $write(list, [...now(), me]);
  const owner = $owner(R);
  if (owner != null) $cleanup(/** @type {any} */ (owner), () => $write(list, now().filter(w => w !== me)));
  return {
    place: () => /** @type {object[]} */ ($read(list)).indexOf(me) + 1,
    front: () => {
      const all = now();
      if (all.at(-1) !== me) $write(list, [...all.filter(w => w !== me), me]);
    },
  };
}

/**
 * The room a Scroll across keeps for its bar, so a Scroll on the x axis can
 * be as high as its content plus it: its border box less its client height,
 * read on `onResize` (0 until then, and where the bar overlays the content).
 * @returns {{ ref: (node: any) => void, onResize: (box: { height: number }) => void, room: () => number }}
 */
export function $barRoom() {
  const R = $active();
  const room = $signal(R, 0);
  /** @type {any} */
  let node = null;
  return {
    ref: n => void (node = n),
    onResize(box) {
      const client = node?.clientHeight;
      if (!(typeof client === 'number' && client > 0)) return;
      const b = Math.max(0, Math.round(box.height - client));
      if (b !== $untrack(R, () => $read(room))) $write(room, b);
    },
    room: () => /** @type {number} */ ($read(room)),
  };
}
