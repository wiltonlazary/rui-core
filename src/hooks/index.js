// Hooks: rrx-core operations, named with `$` (`$open`). Each is
// called inside a component, or with a root first (`$open(root, true)`), and
// returns one handle: its state as nodes (`value` first) and its commands as
// verbs (`menu.toggle()`). Each ends with its owner: timers are cleared and platform listeners removed.
// The input hooks also give props to spread on a primitive (`$hover`, `$move`, `$outside`,
// `$idle`) or a key handler (`$shortcuts`).

export { $open, $toggle, $counter, $bound, $previous, $map, $set, $pages, $selection } from './state.js';
export { $list, $history, $queue } from './collections.js';
export { $patch, $model, $validated } from './values.js';
export { $debounce, $interval, $timeout, $idle } from './timing.js';
export { $debounced, $throttled } from './pace.js';
export { $os, $outside, $hover, $move, $trap, $eyedropper } from './input.js';
export { $shortcuts } from './shortcuts.js';
export { $spy } from './spy.js';
export {
  $localStorage, $sessionStorage, $clipboard, $fits, $scheme, $reducedMotion, $viewportSize, $online, $title, $fullscreen,
} from './platform.js';

// The handles' types, one per hook that returns a handle.
/** @typedef {import('./state.js').OpenHandle} OpenHandle */
/** @typedef {import('./state.js').CounterHandle} CounterHandle */
/** @typedef {import('./timing.js').IntervalHandle} IntervalHandle */
/** @typedef {import('./timing.js').TimeoutHandle} TimeoutHandle */
/** @typedef {import('./timing.js').IdleHandle} IdleHandle */
/** @typedef {import('./platform.js').ClipboardHandle} ClipboardHandle */
/** @typedef {import('./platform.js').FullscreenHandle} FullscreenHandle */
/**
 * @template T
 * @typedef {import('./state.js').ToggleHandle<T>} ToggleHandle
 */
/**
 * @template T
 * @typedef {import('./collections.js').ListHandle<T>} ListHandle
 */
/**
 * @template T
 * @typedef {import('./values.js').PatchHandle<T>} PatchHandle
 */
/**
 * @template T
 * @typedef {import('./state.js').BoundHandle<T>} BoundHandle
 */
/**
 * @template T
 * @typedef {import('./values.js').ModelHandle<T>} ModelHandle
 */
/**
 * @template T
 * @typedef {import('./values.js').ValidatedHandle<T>} ValidatedHandle
 */
/**
 * @template T
 * @typedef {import('./collections.js').HistoryHandle<T>} HistoryHandle
 */
/**
 * @template T
 * @typedef {import('./collections.js').QueueHandle<T>} QueueHandle
 */
/**
 * @template T
 * @typedef {import('./state.js').SelectionHandle<T>} SelectionHandle
 */
/**
 * @template T
 * @typedef {import('./platform.js').StorageHandle<T>} StorageHandle
 */
