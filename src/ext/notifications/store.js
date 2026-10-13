// The notifications store, per
// application root: never a global singleton. `notificationsStore()`
// makes one; `$notifications()` is the nearest one (the one a
// `<Notifications>` or `NotificationsContext` provides, else the root's
// own, made on first use), and its methods are
// `notifications.show/hide/update/clear/clearWaiting/set`.
//
// The store keeps one ordered list; which notifications show and which wait
// follows from it in one pass that counts each place's turns: a
// notification whose turn at its place is under `limit` shows (the
// `<Notifications>` rendering it sets `limit` and the default place, `at`).

import { $signal, $read, $write, $untrack, $batch, $closed, $context, $lookup, $unowned, read } from 'ren-core';
import { rooted } from '../../hooks/shared.js';

/** @typedef {import('ren-core').Graph} Root */
/** @typedef {'top-start' | 'top-center' | 'top-end' | 'bottom-start' | 'bottom-center' | 'bottom-end'} NotificationPlace a notification stack's `at`: an edge, then a side (start, end) or the center */

/**
 * A notification, as `show` takes it.
 * @typedef {object} NotificationData
 * @property {string=} id made by `show` when not given
 * @property {NotificationPlace=} at where it shows; the `<Notifications>` default when not given
 * @property {any=} text the content
 * @property {any=} title
 * @property {string=} color
 * @property {any=} icon
 * @property {boolean=} loading busy: a rule along the bottom edge with a segment sweeping across it; the tone mark stays
 * @property {boolean | number=} timeout ms; false, like true, keeps it until it is closed; the `<Notifications>` default when not given
 * @property {any=} closable its close button: true by default, false for none, or the button's options
 * @property {any=} radius
 * @property {any=} style
 * @property {((data: NotificationData) => void)=} onHide called when it is hidden
 * @property {((data: NotificationData) => void)=} onShow called once it is shown
 */

/** The positions in reading order, the order their stacks render. @type {readonly NotificationPlace[]} */
export const NOTIFICATION_PLACES = Object.freeze(['top-start', 'top-center', 'top-end', 'bottom-start', 'bottom-center', 'bottom-end']);

/**
 * @typedef {object} NotificationsStore
 * @property {() => (NotificationData & { id: string })[]} all every notification, shown or waiting, in order (tracked)
 * @property {() => (NotificationData & { id: string })[]} shown those shown: per place, the first `limit`
 * @property {() => (NotificationData & { id: string })[]} waiting those waiting their turn
 * @property {(data: NotificationData) => string} show adds one; returns its id
 * @property {(id: string) => string} hide removes one (its `onHide` runs); returns the id
 * @property {(data: NotificationData & { id: string }) => string} update merges into the one with that id
 * @property {() => void} clear removes every one, shown and waiting (each `onHide` runs)
 * @property {() => void} clearWaiting removes the waiting ones (each `onHide` runs)
 * @property {(list: (NotificationData & { id: string })[]) => void} set puts a whole new list in place of the current one (`onHide` runs for each one left out)
 * @property {() => Map<NotificationPlace, { shown: (NotificationData & { id: string })[], waiting: (NotificationData & { id: string })[] }>} places each place in use, with its shown and waiting ones in order (tracked)
 * @property {() => number} limit how many show per position (set by `<Notifications limit>`; 4)
 * @property {() => NotificationPlace} at the default place (set by `<Notifications at>`; 'top-end')
 */

/**
 * A new notifications store on a root (the running one by default).
 * @param {Root} [root]
 * @returns {NotificationsStore}
 */
export function notificationsStore(root) {
  const R = root ?? rooted([]);
  const list = $signal(R, /** @type {(NotificationData & { id: string })[]} */ ([]));
  let seq = 0;
  const all = () => /** @type {(NotificationData & { id: string })[]} */ ($read(list));
  const now = () => $untrack(R, all);
  /** @param {(NotificationData & { id: string })[]} next */
  const put = next => {
    if (!$closed(R)) $batch(R, () => $write(list, next));
  };
  /**
   * One pass over the list: each notification with its place and whether
   * it shows, counting the ones met at each place so far (its turn there).
   * @param {(NotificationData & { id: string })[]} items
   */
  const turns = items => {
    const at = store.at();
    const limit = store.limit();
    /** @type {Map<NotificationPlace, number>} */
    const met = new Map();
    return items.map(item => {
      const place = item.at ?? at;
      const turn = met.get(place) ?? 0;
      met.set(place, turn + 1);
      return { item, place, on: turn < limit };
    });
  };
  /** Those of `items` that show (or wait: `on` false), in the list's order. @param {(NotificationData & { id: string })[]} items @param {boolean} [on] */
  const showing = (items, on = true) => turns(items).flatMap(t => (t.on === on ? [t.item] : []));
  /** Each place in use, in order of first use, with its shown and waiting ones. @param {(NotificationData & { id: string })[]} items */
  const grouped = items => {
    /** @type {Map<NotificationPlace, { shown: (NotificationData & { id: string })[], waiting: (NotificationData & { id: string })[] }>} */
    const by = new Map();
    for (const t of turns(items)) {
      if (!by.has(t.place)) by.set(t.place, { shown: [], waiting: [] });
      by.get(t.place)?.[t.on ? 'shown' : 'waiting'].push(t.item);
    }
    return by;
  };
  /** Puts `next`, then tells each notification it left out that it is hidden. @param {(NotificationData & { id: string })[]} next */
  const drop = next => {
    const before = now();
    put(next);
    const ids = new Set(next.map(n => n.id));
    for (const n of before) if (!ids.has(n.id)) n.onHide?.(n);
  };
  /** @type {NotificationsStore} */
  const store = {
    all,
    shown: () => showing(all()),
    waiting: () => showing(all(), false),
    places: () => grouped(all()),
    show(data) {
      const id = data.id ?? `notification-${++seq}`;
      put([...now().filter(n => n.id !== id), { ...data, id }]);
      return id;
    },
    hide(id) {
      const found = now().find(n => n.id === id);
      if (found === undefined) return id;
      put(now().filter(n => n.id !== id));
      found.onHide?.(found);
      return id;
    },
    update(data) {
      put(now().map(n => (n.id === data.id ? { ...n, ...data } : n)));
      return data.id;
    },
    clear: () => drop([]),
    clearWaiting() {
      drop(showing(now()));
    },
    set: next => drop([...next]),
    limit: () => 4,
    at: () => 'top-end',
  };
  return store;
}

/** The store `<Notifications>` provides to what is inside it. */
export const NotificationsContext = $context(/** @type {NotificationsStore | null} */ (null));

/** Each root's own store, made on first use: roots never share one. @type {WeakMap<object, NotificationsStore>} */
const own = new WeakMap();

/**
 * The nearest notifications store: the one in context, else the root's own
 * (made on first use). Call it while a view is built; its methods
 * (`show`, `hide`, `update`, `clear`, `clearWaiting`) work from anywhere.
 * @overload
 * @param {Root} root
 * @returns {NotificationsStore}
 */
/**
 * @overload
 * @returns {NotificationsStore}
 */
/** @param {any[]} args @returns {any} */
export function $notifications(...args) {
  const R = rooted(args);
  const near = /** @type {NotificationsStore | null} */ (read($lookup(R, NotificationsContext)));
  if (near !== null) return near;
  let store = own.get(R);
  // Made outside the asking scope, so it lives as long as the root: the cache hands it to every later caller.
  if (store === undefined) own.set(R, (store = $unowned(R, () => notificationsStore(R))));
  return store;
}
