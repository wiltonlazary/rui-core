// FocusTrap: while `active`, Tab and Shift+Tab cycle among the
// focusables inside it (the primitives' `trap`, on every renderer), and the
// focus moves in when it activates: to its FocusTrap.Start, else to
// its first focusable (ren-core's `$focus`).

import { View, Action, read, $active, $context, $lookup, $owner, $cleanup, $watch, $untrack, $focus } from 'ren-core';
import { Clock } from '../../theme/motion.js';
import { styled } from '../../theme/style.js';
import { pass } from '../layout/layout.jsx';
import { handOn } from '../ref.js';

/** The FocusTrap around a FocusTrap.Start: where it registers. */
const Slot = $context(/** @type {{ node: any } | null} */ (null));

/** A zero-size, see-through Action: a focus stop nobody sees. */
const HIDDEN = Object.freeze({ position: 'absolute', width: 0, height: 0, minHeight: 0, minWidth: 0, padding: 0, border: 0, opacity: 0 });

/** Focuses a node when it can take focus. @param {any} node */
const focus = node => void (node != null && typeof node.focus === 'function' && node.focus());

/**
 * Keeps the focus inside its children while `active` (true by default).
 * When it activates (at the Clock's next frame, once laid out), the focus
 * moves to its FocusTrap.Start, or else to its first focusable, on
 * every renderer (ren-core's `$focus`; none in a worker, whose refs are
 * handles: the focus stays where it is until Tab enters).
 * @param {Record<string, any>} props
 */
export function FocusTrap(props) {
  const R = $active();
  const clock = /** @type {import('../../theme/motion.js').ClockValue} */ ($lookup(Clock));
  const active = () => read(props.active) !== false;
  /** @type {{ node: any }} */
  const slot = { node: null };
  /** @type {any} */
  let box = null;
  /** @type {(() => void) | null} */
  let cancel = null;
  // Once laid out (the next frame), as Modal does.
  const enter = () => {
    cancel?.();
    cancel = clock.frame(() => { // timer: feature, the focus once the trapped content is laid out (a measurement's frame)
      cancel = null;
      if (slot.node != null) focus(slot.node);
      else $focus(box);
    });
  };
  $watch(R, active, on => {
    if (on) enter();
  });
  if ($untrack(R, active)) enter();
  const owner = $owner(R);
  if (owner != null) $cleanup(/** @type {any} */ (owner), () => cancel?.());
  const ref = (/** @type {any} */ n) => {
    box = n;
    handOn(props.ref, n);
  };
  return (
    <Slot value={slot}>
      <View {...pass(props)} ref={ref} trap={active} style={styled(props, () => ({ direction: 'column' }))}>
        {props.children}
      </View>
    </Slot>
  );
}

/** Where the focus goes when its FocusTrap activates: a hidden stop inside it. @param {{ label?: any }} props */
function FocusTrapStart(props) {
  const slot = /** @type {{ node: any } | null} */ ($lookup(Slot));
  return <Action ref={(/** @type {any} */ n) => slot !== null && (slot.node = n)} label={props.label ?? ''} style={HIDDEN} />;
}

FocusTrap.Start = FocusTrapStart;
