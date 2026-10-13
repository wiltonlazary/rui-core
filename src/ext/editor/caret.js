// The character of a drawn Label under a point, on every renderer: a canvas
// Label's ref answers `offsetAt(x, y)` (ren-canv), the DOM's document
// `caretPositionFromPoint` (or `caretRangeFromPoint`). A worker's Handle
// has neither, and there the answer is null (the caller takes the end).

/**
 * The offset in a Label's text nearest the point (a pointer event's
 * `clientX`, `clientY`), or null where the platform cannot say.
 * @param {any} node a Label's ref
 * @param {number} x @param {number} y
 * @returns {number | null}
 */
export function offsetAt(node, x, y) {
  if (node == null) return null;
  if (typeof node.offsetAt === 'function') {
    const at = node.offsetAt(x, y);
    return typeof at === 'number' && at >= 0 ? at : null;
  }
  const doc = node.ownerDocument;
  if (doc == null || typeof node.contains !== 'function') return null;
  if (typeof doc.caretPositionFromPoint === 'function') {
    const p = doc.caretPositionFromPoint(x, y);
    if (p != null && p.offsetNode != null && node.contains(p.offsetNode)) return before(node, p.offsetNode) + p.offset;
  }
  if (typeof doc.caretRangeFromPoint === 'function') {
    const r = doc.caretRangeFromPoint(x, y);
    if (r != null && node.contains(r.startContainer)) return before(node, r.startContainer) + r.startOffset;
  }
  return null;
}

/**
 * The length of a DOM Label's text before one of its text nodes (a run's
 * span holds its own): an offset in that node is one in the Label's text.
 * @param {any} node @param {any} textNode
 */
function before(node, textNode) {
  let n = 0;
  /** @param {any} at @returns {boolean} */
  const walk = at => {
    for (let c = at.firstChild; c != null; c = c.nextSibling) {
      if (c === textNode) return true;
      if (c.nodeType === 3) n += c.data.length;
      else if (walk(c)) return true;
    }
    return false;
  };
  return node === textNode || node.firstChild === undefined || !walk(node) ? 0 : n;
}

/**
 * A pointer event's point: the DOM's `clientX`/`clientY`, the canvases'
 * too (or their `x`, `y`).
 * @param {any} event
 * @returns {[number, number]}
 */
export const pointOf = event => [event?.clientX ?? event?.x ?? 0, event?.clientY ?? event?.y ?? 0];
