// Input hooks, portable: they return props to spread on a portable
// primitive, which every renderer delivers the same way (ren-canv's input is the DOM's: event
// names, fields, bubbling, capture).

import { $signal, $write, $untrack, $watch, $lookup, $focus, read } from 'ren-core';
import { rooted, ending, later } from './shared.js';
import { Clock, platformClock } from '../theme/motion.js';

/** @typedef {import('ren-core').Graph} Root */
/**
 * @template T
 * @typedef {import('ren-core').Readable<T>} Readable
 */

// ---------------------------------------------------------------------------
// $os

/** @typedef {'unknown' | 'macos' | 'ios' | 'windows' | 'android' | 'linux' | 'chromeos'} OS */

/** Platform names (`navigator.userAgentData.platform`) and user agent marks, in the order they are tried. */
const SYSTEMS = /** @type {[OS, RegExp][]} */ ([
  ['ios', /\b(iphone|ipad|ipod|ios)\b/i],
  ['android', /\bandroid\b/i],
  ['chromeos', /\b(cros|chrome ?os)\b/i],
  ['macos', /\b(mac|macos|macintosh)\b/i],
  ['windows', /\bwin(dows|32|64)?\b/i],
  ['linux', /\b(linux|x11)\b/i],
]);

/**
 * The operating system: the platform the browser reports
 * (`navigator.userAgentData.platform`), else its user agent; `'unknown'`
 * where neither tells (node, some workers). It does not change while the
 * page lives, so `value` is the name itself, not a node.
 * @param {string} [agent] a user agent to read instead (tests)
 * @returns {{ value: OS }}
 */
export function $os(agent) {
  return { value: osOf(agent) };
}

/** The operating system's name. @param {string} [agent] @returns {OS} */
function osOf(agent) {
  const nav = /** @type {any} */ (globalThis).navigator;
  const platform = agent === undefined && typeof nav?.userAgentData?.platform === 'string' ? nav.userAgentData.platform : '';
  const ua = agent ?? (typeof nav?.userAgent === 'string' ? nav.userAgent : '');
  for (const text of [platform, ua]) {
    if (text === '') continue;
    for (const [os, mark] of SYSTEMS) if (mark.test(text)) return os;
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// $outside

/**
 * @typedef {object} Outside
 * @property {{ onPointerDown: (e: any) => void }} inside spread on the element (or elements) that count as inside
 * @property {{ onPointerDown: (e: any) => void }} outside spread on an ancestor that covers what counts as outside (the application's outer View, an overlay)
 */

/**
 * Calls `handler` for a press outside an element. Portable, without document listeners: a press inside
 * marks its event on the way up, and the ancestor that `outside` is spread
 * on calls `handler` for the unmarked ones. Presses outside that ancestor
 * are not seen. A handler inside that stops propagation keeps the press
 * inside too.
 * @overload
 * @param {Root} root @param {(event: any) => void} handler
 * @returns {Outside}
 */
/**
 * @overload
 * @param {(event: any) => void} handler
 * @returns {Outside}
 */
/** @param {any[]} args @returns {any} */
export function $outside(...args) {
  if (typeof args[0] !== 'function') args.shift();
  const handler = /** @type {(event: any) => void} */ (args[0]);
  /** The press seen inside, until the ancestor sees it. @type {any} */
  let marked = null;
  return {
    inside: { onPointerDown: (/** @type {any} */ e) => void (marked = e) },
    outside: {
      onPointerDown(/** @type {any} */ e) {
        const inside = marked !== null && marked === e;
        marked = null;
        if (!inside) handler(e);
      },
    },
  };
}

// ---------------------------------------------------------------------------
// $hover

/**
 * Whether the pointer is over an element: spread
 * `props` on it.
 * @overload
 * @param {Root} root
 * @returns {{ value: Readable<boolean>, props: { onPointerEnter: () => void, onPointerLeave: () => void } }}
 */
/**
 * @overload
 * @returns {{ value: Readable<boolean>, props: { onPointerEnter: () => void, onPointerLeave: () => void } }}
 */
/** @param {any[]} args @returns {any} */
export function $hover(...args) {
  const R = rooted(args);
  const value = $signal(R, false);
  return { value, props: { onPointerEnter: () => void $write(value, true), onPointerLeave: () => void $write(value, false) } };
}

// ---------------------------------------------------------------------------
// $move

/** @typedef {{ x: number, y: number }} MovePosition between 0 and 1 across the element */
/**
 * @typedef {object} Move
 * @property {Readable<boolean>} value while the pointer is held down on it
 * @property {{ onPointerDown: (e: any) => void, onPointerMove: (e: any) => void, onPointerUp: (e: any) => void, onPointerCancel: () => void, style: { touchAction: 'none' } }} props spread on the element (merge `style` into the element's own when it has one)
 */

/**
 * The pointer's position inside an element while it is held down there
 * (for sliders and pickers): `onChange({ x, y })` with
 * both between 0 and 1. The pointer is captured on press, so the drag
 * follows outside the element until release, or until the browser takes
 * the press back (`onPointerCancel`: it ends where the last move left it).
 * Options: `onMoveStart`, `onMoveEnd`, and `dir` (`'rtl'` mirrors x). Its props carry the style `touchAction: 'none'`,
 * so a touch drags the element on every renderer instead of panning the
 * page.
 * @overload
 * @param {Root} root @param {(position: MovePosition) => void} onChange
 * @param {{ onMoveStart?: () => void, onMoveEnd?: () => void, dir?: 'ltr' | 'rtl' }} [options]
 * @returns {Move}
 */
/**
 * @overload
 * @param {(position: MovePosition) => void} onChange
 * @param {{ onMoveStart?: () => void, onMoveEnd?: () => void, dir?: 'ltr' | 'rtl' }} [options]
 * @returns {Move}
 */
/** @param {any[]} args @returns {any} */
export function $move(...args) {
  const R = rooted(args);
  const [onChange, handlers = {}] = args;
  const dir = handlers.dir ?? 'ltr';
  const active = $signal(R, false);
  /** The element pressed. @type {any} */
  let element = null;
  /** @param {any} e */
  const report = e => {
    const box = element?.getBoundingClientRect?.();
    if (box == null) return;
    const x = box.width > 0 ? Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)) : 0;
    const y = box.height > 0 ? Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)) : 0;
    onChange({ x: dir === 'rtl' ? 1 - x : x, y });
  };
  /** @param {any} [e] a release (a cancel has no point to report) */
  const end = e => {
    if (element === null) return;
    if (e !== undefined) report(e);
    element = null;
    $write(active, false);
    handlers.onMoveEnd?.();
  };
  return {
    value: active,
    props: {
      onPointerDown(/** @type {any} */ e) {
        if (e.button != null && e.button !== 0) return;
        element = e.currentTarget;
        try {
          element?.setPointerCapture?.(e.pointerId);
        } catch {
          // A synthetic event has no active pointer to capture.
        }
        $write(active, true);
        handlers.onMoveStart?.();
        report(e);
      },
      onPointerMove(/** @type {any} */ e) {
        if (element !== null) report(e);
      },
      onPointerUp: end,
      onPointerCancel: () => end(),
      style: { touchAction: 'none' },
    },
  };
}

// ---------------------------------------------------------------------------
// $trap

/**
 * Keeps the focus inside an element while `active` (as props): spread `props` (`trap` and its `ref`) on a
 * View, Layout or Scroll, and while the focus is inside it Tab and
 * Shift+Tab cycle among its focusables (ren-core's `trap`, on every
 * renderer). When it activates, the focus moves at the next frame of the
 * Clock to the element given to `start` (a ref), else to its first focusable (ren-core's `$focus`; none
 * in a worker, whose refs are handles).
 * @param {...any} args [root], active (true; a value, accessor or signal)
 * @returns {{ props: { trap: () => boolean, ref: (node: any) => void }, start: (node: any) => void, active: () => boolean }}
 */
export function $trap(...args) {
  const R = rooted(args);
  const given = args[0];
  const active = () => read(given) !== false;
  /** @type {import('../theme/motion.js').ClockValue} */
  let clock = platformClock;
  try {
    clock = $lookup(Clock);
  } catch {
    // A root outside a view: the platform's frames.
  }
  /** @type {any} */
  let first = null;
  /** @type {any} */
  let element = null;
  /** @type {(() => void) | null} */
  let cancel = null;
  const enter = () => {
    cancel?.();
    cancel = clock.frame(() => { // timer: feature, the focus once the trapped element is laid out (a measurement's frame)
      cancel = null;
      if (first != null && typeof first.focus === 'function') first.focus();
      else $focus(element);
    });
  };
  $watch(R, active, on => {
    if (on) enter();
    else cancel?.();
  });
  if ($untrack(R, active)) enter();
  ending(R, () => cancel?.());
  return {
    props: { trap: active, ref: node => void (element = node) },
    start: node => void (first = node),
    active,
  };
}

// ---------------------------------------------------------------------------
// $eyedropper

/**
 * @typedef {object} EyedropperHandle
 * @property {Readable<string | null>} value the last color picked (a hex string), null before any
 * @property {boolean} available whether the platform has an eye dropper (Chromium browsers)
 * @property {(options?: { signal?: AbortSignal }) => Promise<string | null>} pick picks a color from the screen: its hex, or null where there is none or the pick was canceled
 */

/**
 * The platform's color picker from the screen, as a handle: `value`
 * (the last color picked), `available`, and `pick({ signal })`. Inert
 * elsewhere (node, a worker, other browsers).
 * @param {...any} args [root]
 * @returns {EyedropperHandle}
 */
export function $eyedropper(...args) {
  const R = rooted(args);
  const color = $signal(R, /** @type {string | null} */ (null));
  const Dropper = /** @type {any} */ (globalThis).EyeDropper;
  const supported = typeof Dropper === 'function';
  /** @type {AbortController | null} */
  let pending = null;
  ending(R, () => pending?.abort());
  /** @param {{ signal?: AbortSignal }} [options] @returns {Promise<string | null>} */
  const pick = async (options = {}) => {
    if (!supported || options.signal?.aborted) return null;
    const own = new AbortController();
    pending = own;
    const abort = () => own.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    try {
      const result = await new Dropper().open({ signal: own.signal });
      if (result == null || typeof result.sRGBHex !== 'string') return null;
      if (!own.signal.aborted) later(R, () => void $write(color, result.sRGBHex));
      return result.sRGBHex;
    } catch {
      // Canceled (Escape, an abort): no color.
      return null;
    } finally {
      options.signal?.removeEventListener('abort', abort);
      if (pending === own) pending = null;
    }
  };
  return { value: color, available: supported, pick };
}

