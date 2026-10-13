// Time for the feedback and navigation components, on the Clock context
// (theme/motion.js): `$elapsed(on)` is the time a component has run, for
// looping animations (Loader, Skeleton, striped Progress). Frames run only
// while something runs, and stop with the owner. Tweening is misc/tween.js's.

import { $active, $signal, $read, $write, $watch, $lookup, $owner, $cleanup, $batch } from 'ren-core';
import { Clock } from '../../theme/motion.js';

/**
 * The milliseconds a component has been running, as an accessor, written
 * once per frame while `on()` holds (always by default) and its owner lives;
 * it starts again from 0 each time `on()` turns true.
 * @param {() => boolean} [on]
 * @returns {() => number}
 */
export function $elapsed(on) {
  const R = $active();
  const clock = /** @type {import('../../theme/motion.js').ClockValue} */ ($lookup(Clock));
  const time = $signal(R, 0);
  /** @type {() => void} */
  let cancel = () => {};
  $watch(R, () => (on === undefined ? true : on() === true), run => {
    cancel();
    cancel = () => {};
    if (!run) return;
    const start = clock.now();
    const tick = (/** @type {number} */ now) => {
      $batch(R, () => $write(time, now - start));
      cancel = clock.frame(tick); // timer: feature, an animation's frame loop
    };
    cancel = clock.frame(tick); // timer: feature, an animation's frame loop
  });
  const owner = $owner(R);
  if (owner != null) $cleanup(/** @type {any} */ (owner), () => cancel());
  return () => $read(time);
}
