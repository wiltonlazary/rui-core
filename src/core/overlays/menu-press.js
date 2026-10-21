// The presses that open a menu at a point: a right press (pointer button 2,
// the portable signal: the canvases have no contextmenu event), a long
// press held still, and the keys (Shift+F10, the ContextMenu key). The
// region's ContextMenu and a field's own menu (edit-menu.jsx) take them.

import { read, $active, $untrack } from 'ren-core';
import { $delay, keyOf, prevent, handled } from './shared.jsx';
import { MOTION, durationOf } from '../../theme/motion.js';
import { pointOf } from '../misc/tween.js';

/**
 * @typedef {object} MenuPressOptions
 * @property {(at: { x: number, y: number }, keys: boolean) => void} open opens the menu at a point in the surface's space; `keys` when the keys opened it
 * @property {() => any} [longPress] true: a held main press opens it too; 'touch': only a finger's or a pen's; false: none
 * @property {() => any} [hold] how long a long press is held: a MOTION preset's name or ms (twice `MOTION.calm`, 600 ms, by default)
 * @property {() => boolean} [disabled] nothing opens it now
 * @property {() => { x: number, y: number } | null} [keyPoint] where the keys open it (null or none: the keys do not)
 */

/**
 * A menu's presses: handlers for a primitive's `onPointerDown`,
 * `onPointerMove`, `onPointerUp`, `onPointerCancel` and `onKey`. A right
 * press opens it at its point (its default prevented: the browser's own
 * menu stays shut), unless a handler under it took the press already (its
 * default prevented: a field's own menu); a long press after `hold`, timed
 * on the Clock and canceled by a move past 10 px or a release; Shift+F10 or
 * the ContextMenu key at `keyPoint`.
 * @param {MenuPressOptions} options
 */
export function $menuPress(options) {
  const R = $active();
  const timer = $delay();
  /** @type {{ x: number, y: number } | null} */
  let pressed = null;
  const off = () => options.disabled !== undefined && $untrack(R, options.disabled);
  const cancel = () => {
    pressed = null;
    timer.cancel();
  };
  return {
    /** @param {any} e */
    onPointerDown(e) {
      if (off()) return;
      const button = e?.button ?? 0;
      if (button === 2) {
        timer.cancel();
        pressed = null;
        if (e?.defaultPrevented === true) return;
        prevent(e);
        options.open(pointOf(e), false);
        return;
      }
      const long = $untrack(R, () => read(options.longPress?.()));
      if (button !== 0 || long === false || long == null) return;
      if (long === 'touch' && e?.pointerType !== 'touch' && e?.pointerType !== 'pen') return;
      const p = pointOf(e);
      pressed = p;
      timer.run(durationOf($untrack(R, () => read(options.hold?.())), MOTION.calm * 2), () => {
        pressed = null;
        options.open(p, false);
      });
    },
    /** @param {any} e */
    onPointerMove(e) {
      if (pressed === null) return;
      const p = pointOf(e);
      // Past 10 px it is a drag, not a finger's wobble.
      if (Math.abs(p.x - pressed.x) > 10 || Math.abs(p.y - pressed.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    /** @param {any} e */
    onKey(e) {
      const key = keyOf(e);
      if (!((key === 'F10' && e?.shiftKey === true) || key === 'ContextMenu') || off()) return;
      const at = options.keyPoint?.() ?? null;
      if (at === null) return;
      prevent(e);
      handled(e);
      options.open(at, true);
    },
    cancel,
  };
}
