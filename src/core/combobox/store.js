// The combobox store (`$combobox`, an rrx-core operation): the
// panel's open state and the option the keyboard is on, over the
// options registered by Combobox.Option in their order. Per root: made in
// a component, its signals belong to that component's root.

import { read, $active, $signal, $read, $write, $untrack, $batch, $after, $closed } from 'ren-core';
import { inShownOrder } from '../shown.js';

/**
 * @typedef {object} OptionRecord
 * @property {() => string} value
 * @property {() => boolean} disabled
 * @property {(() => number)=} order its place among the options (its index in what is shown, else the order it registered in)
 * @property {(event?: any) => void} press chooses it
 * @property {any} node
 * @property {string=} id its element id, for the field's `aria-activedescendant`
 */

/**
 * @typedef {object} ComboboxHandle
 * @property {() => boolean} isOpen
 * @property {() => string | undefined} activeId the element id of the option the keyboard is on (tracked): the one the option shown active wrote
 * @property {(id: string) => () => void} markActive an option shown active writes its id; the return clears it (if still its)
 * @property {() => void} open
 * @property {() => void} close
 * @property {() => void} toggle
 * @property {() => number} active the option the keyboard is on, -1 when none
 * @property {(index: number) => void} activate
 * @property {() => void} first the first enabled one
 * @property {() => void} next
 * @property {() => void} previous
 * @property {(value: string | null | undefined) => void} find the option with that value, if shown
 * @property {() => void} reset no option active
 * @property {() => boolean} pick presses the active option; false when none is active
 * @property {() => OptionRecord[]} options the registered options, in order (not tracked)
 * @property {(record: OptionRecord) => number} positionOf an option's index among them (its `order` when it gave one: tracked)
 * @property {(record: OptionRecord) => () => void} register adds an option (the record itself, found again by identity); returns its removal
 * @property {(node: any) => void} setTrigger
 * @property {(node: any) => void} setFilter
 * @property {() => void} focus focuses the trigger's field
 * @property {() => void} focusFilter
 * @property {() => any} trigger
 */

/**
 * A combobox store. `options`: `open` (controlled, a value, accessor or
 * signal) with `onOpenChange(open)`, or `defaultOpen`; `loop` (true: the
 * arrows wrap).
 * @param {{ open?: any, defaultOpen?: boolean, onOpenChange?: (open: boolean) => void, loop?: any }} [options]
 * @returns {ComboboxHandle}
 */
export function $combobox(options = {}) {
  const R = $active();
  const own = $signal(R, options.defaultOpen === true);
  const selected = $signal(R, -1);
  // The id of the option shown active, written by that option while it is (the field's aria-activedescendant).
  const activeId = $signal(R, /** @type {string | undefined} */ (undefined));
  // A plain list: options register as they are built, where no signal may be
  // written; their order is read when the keys need it.
  /** @type {OptionRecord[]} */
  const list = [];
  let seq = 1e9;
  /** @type {any} */
  let trigger = null;
  /** @type {any} */
  let filter = null;
  const isOpen = () => (options.open !== undefined ? read(options.open) === true : $read(own));
  /** @param {boolean} value */
  const set = value => {
    if ($untrack(R, isOpen) === value) return;
    $batch(R, () => {
      if (options.open === undefined) $write(own, value);
      if (!value) $write(selected, -1);
      options.onOpenChange?.(value);
    });
  };
  // Options with an index in their place; the others after them, in the order shown (one shown later registers last).
  const sorted = () => {
    const placed = list.filter(o => /** @type {() => number} */ (o.order)() < 1e9).sort((a, b) => /** @type {() => number} */ (a.order)() - /** @type {() => number} */ (b.order)());
    return [...placed, ...inShownOrder(list.filter(o => /** @type {() => number} */ (o.order)() >= 1e9))];
  };
  const enabled = () => $untrack(R, sorted).filter(o => !o.disabled());
  /** @param {number} dir */
  const step = dir => {
    const all = $untrack(R, sorted);
    if (all.length === 0) return;
    const loop = read(options.loop) !== false;
    let i = $untrack(R, () => $read(selected));
    for (let n = 0; n < all.length; n++) {
      let next = i + dir;
      if (next < 0) next = loop ? all.length - 1 : 0;
      else if (next >= all.length) next = loop ? 0 : all.length - 1;
      if (next === i) return;
      i = next;
      if (!all[i].disabled()) break;
    }
    $write(selected, i);
  };
  /** @type {ComboboxHandle} */
  const store = {
    isOpen,
    open: () => set(true),
    close: () => set(false),
    toggle: () => set(!$untrack(R, isOpen)),
    active: () => /** @type {number} */ ($read(selected)),
    activeId: () => /** @type {string | undefined} */ ($read(activeId)),
    markActive: id => {
      $write(activeId, id);
      // It may let go while a computation disposes it, where nothing may be written: after the flush.
      const clear = () => {
        if ($untrack(R, () => $read(activeId)) === id) $write(activeId, undefined);
      };
      return () => {
        if (!$closed(R)) $after(R, clear);
      };
    },
    activate: index => $write(selected, index),
    first() {
      const first = enabled()[0];
      $write(selected, first === undefined ? -1 : $untrack(R, sorted).indexOf(first));
    },
    next: () => step(1),
    previous: () => step(-1),
    find(value) {
      const all = $untrack(R, sorted);
      $write(selected, value == null ? -1 : all.findIndex(o => o.value() === value));
    },
    reset: () => $write(selected, -1),
    pick() {
      const at = $untrack(R, () => $read(selected));
      const option = $untrack(R, sorted)[at];
      if (option === undefined || option.disabled()) return false;
      option.press();
      return true;
    },
    options: sorted,
    positionOf: record => (record.order !== undefined && record.order() < 1e9 ? record.order() : $untrack(R, sorted).indexOf(record)),
    register(record) {
      if (record.order === undefined) {
        const mine = seq++;
        record.order = () => mine;
      }
      list.push(record);
      return () => {
        const at = list.indexOf(record);
        if (at >= 0) list.splice(at, 1);
      };
    },
    setTrigger: node => (trigger = node),
    setFilter: node => (filter = node),
    focus: () => void trigger?.focus?.(),
    focusFilter: () => void filter?.focus?.(),
    trigger: () => trigger,
  };
  return store;
}
