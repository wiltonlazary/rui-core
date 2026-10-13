// A caller's `ref`, as ren-core takes one: a function called with the node,
// or a signal written with it. Internal, not an entry: every rui component
// that keeps its own ref on a node hands the node on through `handOn`.

import { $write } from 'ren-core';

/** Hands a node to a caller's ref: a function or a signal (nothing for none). @param {any} ref @param {any} node */
export function handOn(ref, node) {
  if (typeof ref === 'function') ref(node);
  else if (ref != null) $write(ref, node);
}
