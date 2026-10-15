// The load bar: a store per
// application root (`$loadBar()`: run, hold, to, add, finish, clear) and
// <LoadBar>, a thin bar at the top of the root, creeping on while it runs,
// its width and fade animated on the Clock.

import { View, Portal, read, $active, $signal, $read, $write, $untrack, $batch, $closed, $context, $lookup, $watch, $unowned } from 'ren-core';
import { rooted } from '../../hooks/shared.js';
import { $ui } from '../../theme/theme.jsx';
import { colorOf } from '../../theme/resolve.js';
import { LAYERS } from '../../theme/layers.js';
import { MOTION, durationOf } from '../../theme/motion.js';
import { $delay } from '../../core/overlays/shared.jsx';
import { $elapsed } from '../../core/feedback/anim.js';
import { $follow } from '../../core/misc/tween.js';
import { labelsIn } from '../../theme/labels.js';

/** @typedef {import('ren-core').Graph} Root */
/** @typedef {'idle' | 'running' | 'held' | 'finishing'} LoadBarPhase */

/**
 * @typedef {object} LoadBarStore
 * @property {() => number} value 0 to 100 (tracked)
 * @property {() => boolean} shown whether the bar shows (tracked)
 * @property {() => LoadBarPhase} phase idle, running (creeping on), held (still where it is), finishing (full, fading out)
 * @property {() => void} run shows it and creeps on (from 0 again after a finish)
 * @property {() => void} hold keeps it where it is
 * @property {(value: number) => void} to shows it at a value
 * @property {(step?: number) => void} add moves it by `step` (a negative one moves it back), or by the creep step
 * @property {() => void} finish fills it, then it fades out and clears
 * @property {() => void} clear hides it at 0
 */

/**
 * The creep: the step from a value, an easing approach to 98: 9 % of what
 * is left, at least 0.4, and never more than half of what is left, so it
 * never reaches 98 on its own.
 * @param {number} value
 */
export function creep(value) {
  const left = 98 - value;
  if (left <= 0) return 0;
  return Math.min(Math.max(0.4, left * 0.09), left / 2); // geometry: the creep's own curve (9 % of the rest, 0.4 to half of it)
}

/** @param {number} v */
const clamp = v => Math.min(100, Math.max(0, v));

/**
 * A new load bar store on a root (the running one by default).
 * @param {Root} [root]
 * @returns {LoadBarStore}
 */
export function loadBarStore(root) {
  const R = root ?? rooted([]);
  const value = $signal(R, 0);
  const shownNow = $signal(R, false);
  const phase = $signal(R, /** @type {LoadBarPhase} */ ('idle'));
  const now = () => /** @type {number} */ ($untrack(R, () => $read(value)));
  /** @param {() => void} fn */
  const batch = fn => {
    if (!$closed(R)) $batch(R, fn);
  };
  /** @param {number} at @param {LoadBarPhase} [next] */
  const show = (at, next) =>
    batch(() => {
      $write(value, clamp(at));
      $write(shownNow, true);
      if (next !== undefined) $write(phase, next);
      else if ($untrack(R, () => $read(phase)) === 'finishing' || $untrack(R, () => $read(phase)) === 'idle') $write(phase, 'held');
    });
  return {
    value: () => /** @type {number} */ ($read(value)),
    shown: () => /** @type {boolean} */ ($read(shownNow)),
    phase: () => /** @type {LoadBarPhase} */ ($read(phase)),
    run: () => show(now() >= 100 ? 0 : now(), 'running'),
    hold: () => batch(() => $write(phase, 'held')),
    to: at => show(at),
    add: step => show(now() + (step ?? creep(now()))),
    finish: () => show(100, 'finishing'),
    clear: () =>
      batch(() => {
        $write(value, 0);
        $write(shownNow, false);
        $write(phase, 'idle');
      }),
  };
}

/** The store a <LoadBar> provides to what is inside it. */
export const LoadBarContext = $context(/** @type {LoadBarStore | null} */ (null));

/** Each root's own store, made on first use. @type {WeakMap<object, LoadBarStore>} */
const own = new WeakMap();

/**
 * The nearest load bar store: the one in context, else the root's own.
 * Call it while a view is built; its methods work from anywhere.
 * @overload
 * @param {Root} root
 * @returns {LoadBarStore}
 */
/**
 * @overload
 * @returns {LoadBarStore}
 */
/** @param {any[]} args @returns {any} */
export function $loadBar(...args) {
  const R = rooted(args);
  const near = /** @type {LoadBarStore | null} */ (read($lookup(R, LoadBarContext)));
  if (near !== null) return near;
  let store = own.get(R);
  // Made outside the asking scope, so it lives as long as the root: the cache hands it to every later caller.
  if (store === undefined) own.set(R, (store = $unowned(R, () => loadBarStore(R))));
  return store;
}

/**
 * The bar: `store` (the nearest by
 * default: `$loadBar()`), `defaultValue` (0), `color` (the accent
 * color), `size` (2 px), `interval` (400 ms between creep steps),
 * `duration` (a MOTION preset or ms; 'base': its width and fade), `layer`
 * (`LAYERS.top`), `portal` (true: fixed at the top of the viewport, in
 * the portal layer; false: at the top of its parent). `children` go inside, where `$loadBar()` finds this
 * store. After `finish()` it stays full for `duration`, fades
 * out over as long, then clears.
 * @param {Record<string, any>} props
 */
export function LoadBar(props) {
  const R = $active();
  const ui = $ui();
  /** @type {LoadBarStore} */
  const store = props.store ?? $loadBar(R);
  const initial = Number($untrack(R, () => read(props.defaultValue)) ?? 0);
  // Once the view is up (a first apply, not while it is built).
  if (initial > 0) $watch(R, () => initial, () => void ($untrack(R, store.value) === 0 && store.to(initial)));
  const duration = () => durationOf(read(props.duration), MOTION.base);
  const step = () => Number(read(props.interval) ?? 400);
  // Creeps on while running: one step per interval.
  const time = $elapsed(() => store.phase() === 'running');
  let steps = 0;
  $watch(R, () => (store.phase() === 'running' ? Math.floor(time() / step()) : -1), n => {
    if (n < 0) steps = 0;
    else if (n > steps) {
      steps = n;
      store.add();
    }
  });
  // Finishing: full for a moment, then out, then clear.
  const later = $delay();
  const shown = $signal(R, $untrack(R, store.shown));
  $watch(R, () => [store.phase(), store.shown()], ([phase, shownNow]) => {
    if (phase === 'finishing') later.run(duration(), () => {
      $write(shown, false);
      later.run(duration(), () => store.clear());
    });
    else {
      later.cancel();
      $write(shown, shownNow === true);
    }
  });
  const width = $follow(() => store.value(), duration);
  const opacity = $follow(() => ($read(shown) ? 1 : 0), duration);
  const size = () => Number(read(props.size) ?? 2);
  const portal = read(props.portal) !== false;
  const bar = (
    <View
      role="progressbar"
      aria-label={() => labelsIn().pageLoading}
      aria-valuenow={() => Math.round(store.value())}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-hidden={() => ($read(shown) ? undefined : 'true')}
      style={() => ({
        // Fixed: as wide as the viewport (a fixed item's percent is of the viewport, of the portal layer on the canvases).
        ...(portal ? { position: /** @type {const} */ ('fixed'), top: 0, left: 0, width: '100%' } : { position: /** @type {const} */ ('absolute'), top: 0, left: 0, right: 0 }),
        height: size(),
        zIndex: read(props.layer) ?? LAYERS.top,
        opacity: opacity(),
        direction: 'row',
      })}
    >
      <View style={() => ({ width: `${width()}%`, height: size(), background: colorOf(ui.theme(), ui.scheme(), read(props.color)), radius: [0, size(), size(), 0] })} />
    </View>
  );
  return (
    <LoadBarContext value={store}>
      {portal ? <Portal>{bar}</Portal> : bar}
      {props.children}
    </LoadBarContext>
  );
}
