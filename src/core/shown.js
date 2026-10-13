// Shown order: records (tabs, menu items, options, a bar's menus) sorted by
// where their nodes are in the tree, on every renderer, rather than the order
// they registered in (an item shown later registers last).

/** A node's parent on any renderer (the DOM's parentNode, a drawn node's parent). @param {any} n */
const parentOf = n => n.parentNode ?? n.parent ?? null;
/** A node's first child. @param {any} n */
const firstOf = n => n.firstChild ?? n.first ?? null;
/** A node's next sibling. @param {any} n */
const nextOf = n => n.nextSibling ?? n.next ?? null;

/**
 * Records in the order their nodes are shown: tree order on every renderer,
 * found by one walk of the smallest subtree holding them. A record whose node
 * is not built, or sits in another (detached) tree, comes after the shown
 * ones; ties keep the order the records registered in. A total order, so
 * sorting is consistent.
 * @template R @param {readonly R[]} records @param {(record: R) => any} [nodeOf] a record's node (`node` by default)
 * @returns {R[]}
 */
export function inShownOrder(records, nodeOf = (/** @type {any} */ r) => r.node) {
  /** Each built node's top, and how many nodes share it. */
  const tops = new Map();
  /** @type {Map<any, any>} */
  const topOf = new Map();
  for (const r of records) {
    if (nodeOf(r) == null) continue;
    let top = nodeOf(r);
    while (parentOf(top) !== null) top = parentOf(top);
    topOf.set(nodeOf(r), top);
    tops.set(top, (tops.get(top) ?? 0) + 1);
  }
  /** @type {Map<any, number>} */
  const rank = new Map();
  if (tops.size > 0) {
    // The tree most of them are in; the smallest subtree of it holding them all.
    const top = [...tops].sort((a, b) => b[1] - a[1])[0][0];
    const wanted = new Set(records.filter(r => nodeOf(r) != null && topOf.get(nodeOf(r)) === top).map(r => nodeOf(r)));
    /** @type {Map<any, number>} */
    const depth = new Map();
    const first = [...wanted][0];
    const line = [];
    for (let at = first; at !== null; at = parentOf(at)) line.push(at);
    line.reverse().forEach((n, i) => depth.set(n, i));
    let low = line.length - 1;
    for (const n of wanted) {
      let at = n;
      while (!depth.has(at)) at = parentOf(at);
      low = Math.min(low, /** @type {number} */ (depth.get(at)));
    }
    // One preorder walk from there ranks every wanted node.
    const stack = [line[low]];
    let n = 0;
    while (stack.length > 0 && rank.size < wanted.size) {
      const at = stack.pop();
      if (wanted.has(at)) rank.set(at, n++);
      const kids = [];
      for (let c = firstOf(at); c !== null; c = nextOf(c)) kids.push(c);
      for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
    }
  }
  return records
    .map((r, i) => ({ r, i, k: rank.get(nodeOf(r)) ?? Infinity }))
    .sort((a, b) => (a.k === b.k ? a.i - b.i : a.k - b.k))
    .map(x => x.r);
}
