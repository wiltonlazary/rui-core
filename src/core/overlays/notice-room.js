// The room notices take at the viewport's top and bottom edges, per
// application root. <Notifications> claims its stacks' room on a narrow
// viewport, and the sheets placed against the viewport (Modal, Drawer,
// Dialog) stand clear of it: on a phone a sheet fills the viewport, so a
// notice anywhere over it would lie on its controls. This is how Android's
// CoordinatorLayout keeps views out from under a Snackbar (its inset edge,
// which the views around dodge).

import { $active, $signal, $read, $write, $batch, $closed, $unowned, $untrack, $owner, $cleanup } from 'ren-core';

/** @typedef {'top' | 'bottom'} RoomEdge */
/** A claim: what reaches in from `edge`, in px (tracked). @typedef {{ edge: RoomEdge, px: () => number }} Claim */

/** Each root's claims, made on first use and kept for the root's life. @type {WeakMap<object, any>} */
const roots = new WeakMap();

/** @param {any} R */
const claimsOf = R => {
  let list = roots.get(R);
  if (list === undefined) roots.set(R, (list = $unowned(R, () => $signal(R, /** @type {Claim[]} */ ([])))));
  return list;
};

/**
 * The running root's notice room (call it in a component): how far the
 * notices reach in from the viewport's top and bottom edges, in px, the
 * largest claim at each (0 with none; tracked).
 * @returns {{ top: () => number, bottom: () => number }}
 */
export function $noticeRoom() {
  const list = claimsOf($active());
  /** @param {RoomEdge} edge */
  const at = edge => {
    let px = 0;
    for (const c of /** @type {Claim[]} */ ($read(list))) if (c.edge === edge) px = Math.max(px, c.px());
    return px;
  };
  return { top: () => at('top'), bottom: () => at('bottom') };
}

/**
 * Claims room at an edge of the running root's viewport while the
 * caller's owner lives: `px()` (tracked) is how far it reaches in.
 * @param {RoomEdge} edge @param {() => number} px
 */
export function $claimRoom(edge, px) {
  const R = $active();
  const list = claimsOf(R);
  /** @type {Claim} */
  const claim = { edge, px };
  /** @param {(all: Claim[]) => Claim[]} change */
  const put = change => {
    if (!$closed(R)) $batch(R, () => $write(list, change(/** @type {Claim[]} */ ($untrack(R, () => $read(list))))));
  };
  put(all => [...all, claim]);
  const owner = $owner(R);
  if (owner != null) $cleanup(/** @type {any} */ (owner), () => put(all => all.filter(c => c !== claim)));
}
