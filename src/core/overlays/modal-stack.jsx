// Modals and Drawers open one over the other. `Modal.Stack` (also
// `Drawer.Stack`) keeps the members it shows in the order they opened;
// each member is a Modal or Drawer with a `stack` id. Only the topmost
// member acts as a modal (backdrop, focus trap, Escape, a press outside);
// those under it stay shown and keep their state. `$modalStack` holds the
// open ids for code that drives its members by id.

import { read, $active, $context, $signal, $read, $write, $untrack, $watch, $owner, $cleanup } from 'ren-core';
import { LAYERS } from '../../theme/layers.js';

/**
 * A stack as its members see it: `shown`, the ids of the open members
 * bottom to top; `ids`, every member's id, to refuse a second one.
 * @typedef {{ shown: any, ids: Set<string> }} Stacking
 */

/** The stack a Modal or Drawer sits in, or null. */
export const StackContext = $context(/** @type {Stacking | null} */ (null));

/** Each bound `open` of a `$modalStack` to the count of its raises: a raise lifts an open member to the top. */
const RAISES = new WeakMap();

/**
 * Several Modals or Drawers shown together (Modal.Stack, Drawer.Stack):
 * the members inside, each with a `stack` id, stack in the order they
 * opened, the later over the earlier.
 * @param {{ children?: any }} props
 */
export function ModalStack(props) {
  const R = $active();
  /** @type {Stacking} */
  const value = { shown: $signal(R, /** @type {string[]} */ ([])), ids: new Set() };
  return <StackContext value={value}>{props.children}</StackContext>;
}

/**
 * A member's seat in its stack: its props with the stack's say (`layer`
 * raised by its depth; `backdrop`, `trap` and `dismiss` only while on top)
 * and `join(isOpen)`, which keeps the stack's order as it opens, closes,
 * is raised or goes away.
 * @param {Stacking} stack @param {string} id @param {Record<string, any>} given
 * @returns {{ props: Record<string, any>, join: (isOpen: () => boolean) => void }}
 */
export function seat(stack, id, given) {
  const R = $active();
  if (stack.ids.has(id)) throw new Error(`RUI: two stacked modals share the id "${id}"`);
  stack.ids.add(id);
  let isOpen = () => false;
  let depth = 0;
  /** Its depth: its place in the stack; on top while open and not listed yet; the last one while it leaves. */
  const depthOf = () => {
    const shown = /** @type {string[]} */ ($read(stack.shown));
    const at = shown.indexOf(id);
    if (at >= 0) depth = at;
    else if (isOpen()) depth = shown.length;
    return depth;
  };
  const top = () => {
    const shown = /** @type {string[]} */ ($read(stack.shown));
    return shown.includes(id) ? shown[shown.length - 1] === id : isOpen();
  };
  /** @type {Record<string, () => any>} */
  const say = {
    layer: () => (read(given.layer) ?? LAYERS.sheet) + depthOf(),
    backdrop: () => (top() ? read(given.backdrop) : false),
    trap: () => top() && read(given.trap) !== false,
    dismiss: () => (top() ? read(given.dismiss) : false),
  };
  const props = new Proxy(given, {
    get: (target, key) => (typeof key === 'string' && Object.hasOwn(say, key) ? say[key] : Reflect.get(target, key)),
    has: (target, key) => (typeof key === 'string' && Object.hasOwn(say, key)) || Reflect.has(target, key),
  });
  /** @param {(shown: string[]) => string[]} change */
  const edit = change => {
    const was = /** @type {string[]} */ ($untrack(R, () => $read(stack.shown)));
    const next = change(was.filter(x => x !== id));
    if (next.length !== was.length || next.some((x, i) => x !== was[i])) $write(stack.shown, next);
  };
  const join = (/** @type {() => boolean} */ open) => {
    isOpen = open;
    const raises = RAISES.get($untrack(R, () => given.open));
    let seen = -1;
    $watch(
      R,
      () => (open() ? (raises?.() ?? 0) : -1),
      mark => {
        if (mark === seen) return;
        seen = mark;
        edit(rest => (mark < 0 ? rest : [...rest, id]));
      },
    );
    const owner = $owner(R);
    if (owner != null)
      $cleanup(/** @type {any} */ (owner), () => {
        stack.ids.delete(id);
        edit(rest => rest);
      });
  };
  return { props, join };
}

/**
 * @typedef {object} ModalStackHandle
 * @property {import('ren-core').Readable<string[]>} value the open ids, bottom to top, in the order they opened
 * @property {(id: string) => boolean} isOpen
 * @property {() => string | null} top the topmost open id, or null
 * @property {(id: string) => void} open puts it on top (a raise when it is open)
 * @property {(id: string) => void} close
 * @property {(id: string) => void} toggle
 * @property {() => void} clear
 * @property {(id: string) => { open: () => boolean, onOpenChange: (open: boolean) => void, stack: string }} bind the props that make a Modal or Drawer this id's member
 */

/**
 * The open state of a stack's members by id: `open(id)` puts one on top
 * (lifting it when it is already open), `close(id)` takes it out wherever
 * it is. `ids`, when given, names the set: opening another id throws.
 * @param {readonly string[]} [ids]
 * @returns {ModalStackHandle}
 */
export function $modalStack(ids) {
  const R = $active();
  const value = $signal(R, /** @type {string[]} */ ([]));
  /** @type {Map<string, any>} */
  const raised = new Map();
  const now = () => /** @type {string[]} */ ($untrack(R, () => $read(value)));
  /** @param {string} id */
  const raisesOf = id => {
    let n = raised.get(id);
    if (n === undefined) raised.set(id, (n = $signal(R, 0)));
    return n;
  };
  /** @param {string} id */
  const open = id => {
    if (ids !== undefined && !ids.includes(id)) throw new Error(`RUI: $modalStack has no modal "${id}"`);
    const n = raisesOf(id);
    $write(n, $untrack(R, () => $read(n)) + 1);
    $write(value, [...now().filter(x => x !== id), id]);
  };
  /** @param {string} id */
  const close = id => {
    if (now().includes(id)) $write(value, now().filter(x => x !== id));
  };
  /** @param {string} id */
  const isOpen = id => /** @type {string[]} */ ($read(value)).includes(id);
  return {
    value,
    isOpen,
    top: () => /** @type {string[]} */ ($read(value)).at(-1) ?? null,
    open,
    close,
    toggle: id => (now().includes(id) ? close(id) : open(id)),
    clear: () => {
      if (now().length > 0) $write(value, []);
    },
    bind(id) {
      const shown = () => isOpen(id);
      RAISES.set(shown, () => $read(raisesOf(id)));
      return { open: shown, onOpenChange: next => (next ? open(id) : close(id)), stack: id };
    },
  };
}
