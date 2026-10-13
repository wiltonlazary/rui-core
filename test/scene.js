// The Skia side's scene items, for checks on what the style gave them.

/** Item kinds (ren-canv's scene). */
export const KIND = Object.freeze({ View: 0, Layout: 1, Scroll: 2, Label: 3, Edit: 4, Action: 5, Image: 6, Shape: 7 });

/**
 * The scene items of a kind on the Skia side, in tree order: the page's,
 * then the portal layer's.
 * @param {any} skia the harness's Skia side @param {number} kind
 * @returns {any[]}
 */
export function items(skia, kind) {
  skia.text();
  /** @type {any[]} */
  const out = [];
  const walk = (/** @type {any} */ n) => {
    for (let c = n.first; c !== null; c = c.next) {
      if (c.kind === kind) out.push(c);
      walk(c);
    }
  };
  walk(skia.skia.root);
  if (skia.skia.overlay) walk(skia.skia.overlay);
  return out;
}
