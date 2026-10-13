// The rich text document: a list of
// blocks (paragraph, heading 1 to 4, bullet and ordered list items nested
// by their depth, blockquote, code block, horizontal rule), each a string
// with an alignment and inline marks (bold, italic, underline, strike, code,
// link, subscript, superscript, highlight, text color) kept as ranges. Every operation is pure:
// it returns a new document and leaves the old one as it was, so undo keeps
// documents. Blocks carry ids, unique within their document, so a view
// keeps each block's row while it changes.
//
// Serialized to and from a small HTML subset and to and from JSON, which
// is the document's own shape: `{ blocks }`, each block its fields without
// its id (`toJSON`).

import { safeHref } from '../../href.js';

/** @typedef {'paragraph' | 'heading' | 'bullet' | 'ordered' | 'quote' | 'code' | 'rule'} BlockType */
/** @typedef {'link' | 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'subscript' | 'superscript' | 'highlight' | 'color'} MarkType */
/** @typedef {'start' | 'center' | 'end' | 'justify'} Align */
/** A mark over [from, to): a link's `href`, a text color's (and a highlight's, when not the default) `color`. @typedef {{ type: MarkType, from: number, to: number, href?: string, color?: string }} Mark */
/** A block: `level` a heading's, `depth` a list item's nesting (0 at the top), `align` its text's. @typedef {{ id: number, type: BlockType, level: number, depth: number, align: Align, text: string, marks: readonly Mark[] }} Block */
/** @typedef {{ blocks: readonly Block[], next: number }} Doc */

/** The marks, in the order HTML nests them (outermost first). @type {readonly MarkType[]} */
export const MARKS = Object.freeze(/** @type {MarkType[]} */ (['link', 'bold', 'italic', 'underline', 'strike', 'code', 'subscript', 'superscript', 'highlight', 'color']));
/** The block types. @type {readonly BlockType[]} */
export const BLOCKS = Object.freeze(/** @type {BlockType[]} */ (['paragraph', 'heading', 'bullet', 'ordered', 'quote', 'code', 'rule']));
/** The text alignments of a block. @type {readonly Align[]} */
export const ALIGNS = Object.freeze(/** @type {Align[]} */ (['start', 'center', 'end', 'justify']));

const ORDER = /** @type {Record<MarkType, number>} */ ({ link: 0, bold: 1, italic: 2, underline: 3, strike: 4, code: 5, subscript: 6, superscript: 7, highlight: 8, color: 9 });

/** Whether a block type is a list item. @param {BlockType} type */
export const isList = type => type === 'bullet' || type === 'ordered';

/** An alignment, 'start' for anything else. @param {any} a @returns {Align} */
const alignOf = a => (a === 'center' || a === 'end' || a === 'justify' ? a : 'start');

/** A CSS `text-align` as an alignment: its physical `left` and `right` read as the start and the end. @param {any} css @returns {Align} */
const alignOfCSS = css => alignOf(css === 'right' ? 'end' : css);

/**
 * A new block.
 * @param {number} id @param {BlockType} type @param {string} [text] @param {readonly Mark[]} [marks] @param {number} [level] @param {number} [depth] @param {Align} [align]
 * @returns {Block}
 */
export const block = (id, type, text = '', marks = [], level = 0, depth = 0, align = 'start') => ({
  id,
  type,
  // A heading's level is a whole 1 to 4: cut to its integer, clamped (NaN is 1).
  level: type === 'heading' ? Math.max(1, Math.min(4, Math.trunc(Number(level)) || 1)) : 0,
  depth: isList(type) ? Math.max(0, Math.floor(depth) || 0) : 0,
  align: type === 'code' || type === 'rule' ? 'start' : alignOf(align),
  text: type === 'rule' ? '' : text,
  marks: type === 'code' || type === 'rule' ? [] : normalize(marks, text.length),
});

/**
 * A document from blocks given as `{ type, text, marks, level, depth,
 * align }` (ids assigned); an empty list gives one empty paragraph.
 * @param {readonly { type?: BlockType, text?: string, marks?: readonly Mark[], level?: number, depth?: number, align?: Align }[]} [blocks]
 * @returns {Doc}
 */
export function createDoc(blocks = []) {
  const list = blocks.length === 0 ? [{ type: /** @type {BlockType} */ ('paragraph') }] : blocks;
  return { blocks: list.map((b, i) => block(i + 1, b.type ?? 'paragraph', b.text ?? '', b.marks ?? [], b.level ?? 0, b.depth ?? 0, b.align ?? 'start')), next: list.length + 1 };
}

/** The index of a block by id (-1 when absent). @param {Doc} doc @param {number} id */
export const indexOf = (doc, id) => doc.blocks.findIndex(b => b.id === id);

/** A block by id. @param {Doc} doc @param {number} id */
export const blockOf = (doc, id) => doc.blocks.find(b => b.id === id);

/** The document with one block replaced. @param {Doc} doc @param {number} index @param {Block} next @returns {Doc} */
const replace = (doc, index, next) => ({ blocks: doc.blocks.map((b, i) => (i === index ? next : b)), next: doc.next });

// ---------------------------------------------------------------------------
// Marks

/** Two marks of one kind that may merge (links only with the same address, colors of one color). @param {Mark} a @param {Mark} b */
const same = (a, b) => a.type === b.type && a.href === b.href && a.color === b.color;

/** A mark record: `attr` is a link's href, a color's (or a highlight's) color. @param {MarkType} type @param {number} from @param {number} to @param {string} [attr] @returns {Mark} */
const markOf = (type, from, to, attr) =>
  type === 'link' ? { type, from, to, href: String(attr ?? '') } : type === 'color' || (type === 'highlight' && attr != null && attr !== '') ? { type, from, to, color: String(attr ?? '') } : { type, from, to };


/**
 * Whether a text color or highlight color is a plain CSS color: a hex value,
 * a name, or one of the color functions rgb(a), hsl(a), hwb, lab, lch,
 * oklab, oklch and color() of plain values (numbers, units, `none`, commas,
 * spaces, `%` and `/`; no parentheses, quotes, `;`, a backslash or `:`). The closed
 * list of function names keeps `url(`, `var(`, `image(`, `expression(` and
 * `color-mix(` out.
 * @param {unknown} color
 */
const safeColor = color => /^(?:#[0-9a-f]{3,8}|[a-z]+|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([a-z0-9.,%/+\-\s]*\))$/i.test(String(color ?? '').trim());

/** Whether a mark may be kept: a link to a safe address, a color or highlight of a safe color. @param {Mark} m */
const safeMark = m => (m.type === 'link' ? safeHref(m.href) : m.type === 'color' || (m.type === 'highlight' && m.color !== undefined) ? safeColor(m.color) : true);

/**
 * Marks sorted (by type, then start), clamped to the text, empty ones
 * dropped, a link to an unsafe address (see `safeHref`) or a color that is
 * no plain color token (see `safeColor`) dropped, overlapping
 * or touching ones of a kind merged; a link over another link takes its place
 * there.
 * @param {readonly Mark[]} marks @param {number} length
 * @returns {Mark[]}
 */
export function normalize(marks, length) {
  /** @type {Mark[]} */
  const list = [];
  for (const m of marks) {
    const from = Math.max(0, Math.min(length, m.from));
    const to = Math.max(0, Math.min(length, m.to));
    if (!(to > from && Object.hasOwn(ORDER, m.type) && !(m.type === 'color' && !m.color))) continue;
    const made = markOf(m.type, from, to, m.type === 'link' ? m.href : m.color);
    // A link to an unsafe address, or a color that is no plain token, is no mark: its text stays.
    if (safeMark(made)) list.push(made);
  }
  list.sort((a, b) => ORDER[a.type] - ORDER[b.type] || a.from - b.from);
  /** @type {Mark[]} */
  const out = [];
  for (const m of list) {
    const last = out.length > 0 ? out[out.length - 1] : null;
    if (last !== null && last.type === m.type && m.from <= last.to) {
      if (same(last, m)) last.to = Math.max(last.to, m.to);
      else {
        // Another link: it wins over the overlap.
        const tail = last.to > m.to ? { ...last, from: m.to } : null;
        last.to = m.from;
        if (last.to <= last.from) out.pop();
        out.push({ ...m });
        if (tail !== null) out.push(tail);
      }
    } else out.push({ ...m });
  }
  return out;
}

/** The marks without `type` over [from, to) (split where they cross it). @param {readonly Mark[]} marks @param {MarkType} type @param {number} from @param {number} to @returns {Mark[]} */
function without(marks, type, from, to) {
  /** @type {Mark[]} */
  const out = [];
  for (const m of marks) {
    if (m.type !== type || m.to <= from || m.from >= to) {
      out.push(m);
      continue;
    }
    if (m.from < from) out.push({ ...m, to: from });
    if (m.to > to) out.push({ ...m, from: to });
  }
  return out;
}

/** A mark's attribute: a link's href, a color's color. @param {Mark} m */
const attrOf = m => m.href ?? m.color;

/** Whether every character of [from, to) has the mark (`href`: that link, or that color). @param {Block} b @param {MarkType} type @param {number} from @param {number} to @param {string} [href] */
export function hasMark(b, type, from, to, href) {
  if (to <= from) return marksAt(b, from).some(m => m.type === type && (href === undefined || attrOf(m) === href));
  let at = from;
  for (const m of b.marks) {
    if (m.type !== type || (href !== undefined && attrOf(m) !== href) || m.to <= at || m.from > at) continue;
    at = m.to;
    if (at >= to) return true;
  }
  return false;
}

/**
 * The marks at a caret: those around it, and those ending at it that
 * grow with the text typed there (every mark but a link and code).
 * @param {Block} b @param {number} at
 * @returns {Mark[]}
 */
export function marksAt(b, at) {
  return b.marks.filter(m => (m.from < at && m.to > at) || (m.to === at && m.from < at && grows(m.type)) || (at === 0 && m.from === 0 && m.to > 0 && grows(m.type)));
}

/** Whether typing at a mark's end extends it. @param {MarkType} type */
const grows = type => type !== 'link' && type !== 'code';

/**
 * Adds a mark over [from, to) of a block, or removes it (`on` false);
 * `href` is a link's address, or a color's (a highlight's) color.
 * @param {Doc} doc @param {number} id @param {number} from @param {number} to @param {MarkType} type @param {boolean} on @param {string} [href]
 * @returns {Doc}
 */
export function setMark(doc, id, from, to, type, on, href) {
  const i = indexOf(doc, id);
  if (i < 0 || to <= from) return doc;
  const b = doc.blocks[i];
  if (b.type === 'code' || b.type === 'rule') return doc;
  let rest = without(b.marks, type, from, to);
  // Subscript and superscript exclude each other.
  if (on && type === 'subscript') rest = without(rest, 'superscript', from, to);
  if (on && type === 'superscript') rest = without(rest, 'subscript', from, to);
  const marks = on ? [...rest, markOf(type, from, to, href)] : rest;
  return replace(doc, i, { ...b, marks: normalize(marks, b.text.length) });
}

/**
 * Toggles a mark over [from, to): removed where all of it has it, added
 * otherwise (the editor's `toggle`).
 * @param {Doc} doc @param {number} id @param {number} from @param {number} to @param {MarkType} type
 * @returns {Doc}
 */
export function toggleMark(doc, id, from, to, type) {
  const b = blockOf(doc, id);
  if (b === undefined || to <= from) return doc;
  return setMark(doc, id, from, to, type, !hasMark(b, type, from, to));
}

/** Removes every mark over [from, to). @param {Doc} doc @param {number} id @param {number} from @param {number} to @returns {Doc} */
export function clearMarks(doc, id, from, to) {
  const i = indexOf(doc, id);
  if (i < 0 || to <= from) return doc;
  const b = doc.blocks[i];
  let marks = /** @type {Mark[]} */ ([...b.marks]);
  for (const type of MARKS) marks = without(marks, type, from, to);
  return replace(doc, i, { ...b, marks: normalize(marks, b.text.length) });
}

/**
 * The link over [from, to) grown to the whole link it touches (for
 * Remove link with a caret inside a link).
 * @param {Block} b @param {number} from @param {number} to
 * @returns {[number, number] | null}
 */
export function linkRange(b, from, to) {
  for (const m of b.marks) if (m.type === 'link' && m.from <= Math.max(from, to - 1) && m.to >= Math.min(to, from + 1)) return [Math.min(m.from, from), Math.max(m.to, to)];
  return null;
}

// ---------------------------------------------------------------------------
// Text

/**
 * Replaces [at, at + removed) of a block's text with `text`, moving the
 * marks: text typed inside a mark, or at the end of one that extends,
 * takes it; `stored` (the marks toggled at a caret) sets or clears marks on
 * the inserted text.
 * @param {Doc} doc @param {number} id @param {number} at @param {number} removed @param {string} text @param {ReadonlyMap<MarkType, boolean> | null} [stored]
 * @returns {Doc}
 */
export function splice(doc, id, at, removed, text, stored = null) {
  const i = indexOf(doc, id);
  if (i < 0) return doc;
  const b = doc.blocks[i];
  const end = at + removed;
  const added = text.length;
  /** @type {Mark[]} */
  let marks = [];
  for (const m of b.marks) {
    // Deletion: positions inside the removed range fall to its start.
    let from = m.from <= at ? m.from : m.from >= end ? m.from - removed : at;
    let to = m.to <= at ? m.to : m.to >= end ? m.to - removed : at;
    // Insertion at `at`.
    if (added > 0) {
      // At a block's start the text takes the marks that start there.
      if (from > at || (from === at && to > at && !(at === 0 && grows(m.type)))) from += added;
      if (to > at || (to === at && from < at && grows(m.type))) to += added;
    }
    if (to > from) marks.push({ ...m, from, to });
  }
  const value = b.text.slice(0, at) + text + b.text.slice(end);
  if (stored !== null && added > 0) {
    for (const [type, on] of stored) {
      marks = without(marks, type, at, at + added);
      if (on) marks.push({ type, from: at, to: at + added });
    }
  }
  return replace(doc, i, { ...b, text: value, marks: normalize(marks, value.length) });
}

/**
 * A block's text set to `value` as one edit: the change found by the
 * common start and end of the old and new text (an Edit's onChange gives
 * the whole value), then applied as `splice`.
 * @param {Doc} doc @param {number} id @param {string} value @param {ReadonlyMap<MarkType, boolean> | null} [stored] @param {number} [caret] where the caret is after the edit, to place an ambiguous insertion
 * @returns {Doc}
 */
export function setText(doc, id, value, stored = null, caret = -1) {
  const b = blockOf(doc, id);
  if (b === undefined || b.text === value) return doc;
  const old = b.text;
  const max = Math.min(old.length, value.length);
  let start = 0;
  while (start < max && old.charCodeAt(start) === value.charCodeAt(start)) start++;
  let tail = 0;
  while (tail < max - start && old.charCodeAt(old.length - 1 - tail) === value.charCodeAt(value.length - 1 - tail)) tail++;
  // Typing "a" into "aa" at the caret: the common start may run past the edit.
  if (caret >= 0 && value.length > old.length) {
    const added = value.length - old.length;
    const at = caret - added;
    if (at >= 0 && at < start && value.slice(0, at) + value.slice(caret) === old) {
      start = at;
      tail = old.length - at;
    }
  }
  return splice(doc, id, start, old.length - start - tail, value.slice(start, value.length - tail), stored);
}

// ---------------------------------------------------------------------------
// Blocks

/**
 * A block's type set (heading `level` 1 to 4); a code block drops its
 * marks; a list item keeps its depth, another block has none.
 * @param {Doc} doc @param {number} id @param {BlockType} type @param {number} [level]
 * @returns {Doc}
 */
export function setBlock(doc, id, type, level = 1) {
  const i = indexOf(doc, id);
  if (i < 0) return doc;
  const b = doc.blocks[i];
  if (b.type === 'rule' || type === 'rule') return doc;
  return replace(doc, i, block(b.id, type, b.text, b.marks, level, isList(type) ? b.depth : 0, b.align));
}

/** A block's text alignment set. @param {Doc} doc @param {number} id @param {Align} align @returns {Doc} */
export function setAlign(doc, id, align) {
  const i = indexOf(doc, id);
  if (i < 0) return doc;
  const b = doc.blocks[i];
  const next = alignOf(align);
  return b.align === next || b.type === 'code' || b.type === 'rule' ? doc : replace(doc, i, { ...b, align: next });
}

/**
 * The list items of block `i`'s subtree: it and the items after it
 * nested deeper, as [i, end).
 * @param {readonly Block[]} blocks @param {number} i
 */
function subtree(blocks, i) {
  let end = i + 1;
  while (end < blocks.length && isList(blocks[end].type) && blocks[end].depth > blocks[i].depth) end++;
  return end;
}

/**
 * A list item nested one level deeper, with the items nested in it
 * (Tab): only under an item before it at its
 * depth or deeper. The document as it was when it cannot.
 * @param {Doc} doc @param {number} id
 * @returns {Doc}
 */
export function indent(doc, id) {
  const i = indexOf(doc, id);
  if (i <= 0) return doc;
  const blocks = doc.blocks;
  const b = blocks[i];
  const prev = blocks[i - 1];
  if (!isList(b.type) || !isList(prev.type) || prev.depth < b.depth) return doc;
  const end = subtree(blocks, i);
  return { blocks: blocks.map((x, k) => (k >= i && k < end ? { ...x, depth: x.depth + 1 } : x)), next: doc.next };
}

/**
 * A list item one level up, with the items nested in it
 * (Shift+Tab); at the top, out of the list as a paragraph.
 * @param {Doc} doc @param {number} id
 * @returns {Doc}
 */
export function outdent(doc, id) {
  const i = indexOf(doc, id);
  if (i < 0) return doc;
  const blocks = doc.blocks;
  const b = blocks[i];
  if (!isList(b.type)) return doc;
  if (b.depth === 0) return setBlock(doc, id, 'paragraph');
  const end = subtree(blocks, i);
  return { blocks: blocks.map((x, k) => (k >= i && k < end ? { ...x, depth: x.depth - 1 } : x)), next: doc.next };
}

/** A new empty block of `type` before the block `id`. @param {Doc} doc @param {number} id @param {BlockType} [type] @returns {{ doc: Doc, id: number }} */
export function insertBefore(doc, id, type = 'paragraph') {
  const i = Math.max(0, indexOf(doc, id));
  const b = block(doc.next, type);
  return { doc: { blocks: [...doc.blocks.slice(0, i), b, ...doc.blocks.slice(i)], next: doc.next + 1 }, id: b.id };
}

/**
 * A horizontal rule after block `id`, and an
 * empty paragraph after it when nothing follows. Returns the document and
 * the block after the rule.
 * @param {Doc} doc @param {number} id
 * @returns {{ doc: Doc, id: number }}
 */
export function insertRule(doc, id) {
  const made = insertAfter(doc, id, 'rule');
  const i = indexOf(made.doc, made.id);
  const after = made.doc.blocks[i + 1];
  if (after !== undefined) return { doc: made.doc, id: after.id };
  return insertAfter(made.doc, made.id);
}

/**
 * The effective depth of each block: a list item at most one deeper than
 * the item before it, 0 after anything else (how a list nests).
 * @param {readonly Block[]} blocks
 */
export function depths(blocks) {
  const out = new Array(blocks.length).fill(0);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!isList(b.type)) continue;
    out[i] = i > 0 && isList(blocks[i - 1].type) ? Math.min(b.depth, out[i - 1] + 1) : 0;
  }
  return out;
}

/**
 * A list's tree from block `i` at depth `d`: its items (each a block and
 * the lists nested in it), up to an item of another type at its depth or
 * a block outside it.
 * @typedef {{ type: 'bullet' | 'ordered', items: { block: Block, children: ListTree[] }[] }} ListTree
 * @param {readonly Block[]} blocks @param {readonly number[]} eff @param {number} i @param {number} d
 * @returns {{ list: ListTree, next: number }}
 */
function listTree(blocks, eff, i, d) {
  const type = /** @type {'bullet' | 'ordered'} */ (blocks[i].type);
  /** @type {ListTree} */
  const list = { type, items: [] };
  while (i < blocks.length && isList(blocks[i].type) && eff[i] >= d) {
    if (eff[i] === d) {
      if (blocks[i].type !== type) break;
      list.items.push({ block: blocks[i], children: [] });
      i++;
    } else {
      const inner = listTree(blocks, eff, i, eff[i]);
      list.items[list.items.length - 1].children.push(inner.list);
      i = inner.next;
    }
  }
  return { list, next: i };
}

/**
 * Splits a block at `at` (Enter): the text after goes to a new block after
 * it, of the same type, except at the end of a heading, where a paragraph
 * follows. Returns the document and the new
 * block's id.
 * @param {Doc} doc @param {number} id @param {number} at
 * @returns {{ doc: Doc, id: number }}
 */
export function split(doc, id, at) {
  const i = indexOf(doc, id);
  if (i < 0) return { doc, id };
  const b = doc.blocks[i];
  const cut = Math.max(0, Math.min(b.text.length, at));
  /** @type {Mark[]} */
  const left = [];
  /** @type {Mark[]} */
  const right = [];
  for (const m of b.marks) {
    if (m.from < cut) left.push({ ...m, to: Math.min(m.to, cut) });
    if (m.to > cut) right.push({ ...m, from: Math.max(0, m.from - cut), to: m.to - cut });
  }
  const type = b.type === 'heading' && cut === b.text.length ? 'paragraph' : b.type;
  const next = block(doc.next, type, b.text.slice(cut), right, b.level, b.depth, b.align);
  const blocks = [...doc.blocks.slice(0, i), { ...b, text: b.text.slice(0, cut), marks: normalize(left, cut) }, next, ...doc.blocks.slice(i + 1)];
  return { doc: { blocks, next: doc.next + 1 }, id: next.id };
}

/**
 * Joins a block to the one before it (Backspace at its start). Returns the
 * document, the block kept and where the join is in its text; null when it
 * is the first block.
 * @param {Doc} doc @param {number} id
 * @returns {{ doc: Doc, id: number, at: number } | null}
 */
export function join(doc, id) {
  const i = indexOf(doc, id);
  if (i <= 0) return null;
  const a = doc.blocks[i - 1];
  const b = doc.blocks[i];
  // A rule before it goes (Backspace after a rule).
  if (a.type === 'rule') return { doc: { blocks: doc.blocks.filter((_, k) => k !== i - 1), next: doc.next }, id: b.id, at: 0 };
  const at = a.text.length;
  const text = a.text + b.text;
  const marks = a.type === 'code' ? [] : normalize([...a.marks, ...b.marks.map(m => ({ ...m, from: m.from + at, to: m.to + at }))], text.length);
  const blocks = [...doc.blocks.slice(0, i - 1), { ...a, text, marks }, ...doc.blocks.slice(i + 1)];
  return { doc: { blocks, next: doc.next }, id: a.id, at };
}

/** A new empty block of `type` after the block `id`. @param {Doc} doc @param {number} id @param {BlockType} [type] @returns {{ doc: Doc, id: number }} */
export function insertAfter(doc, id, type = 'paragraph') {
  const i = indexOf(doc, id);
  const b = block(doc.next, type);
  const at = i < 0 ? doc.blocks.length : i + 1;
  return { doc: { blocks: [...doc.blocks.slice(0, at), b, ...doc.blocks.slice(at)], next: doc.next + 1 }, id: b.id };
}

/**
 * The runs of a block's text between mark boundaries, each with the marks
 * over it (for drawing and for HTML).
 * @param {Block} b
 * @returns {{ text: string, from: number, marks: Mark[] }[]}
 */
export function runs(b) {
  const cuts = new Set([0, b.text.length]);
  for (const m of b.marks) {
    cuts.add(m.from);
    cuts.add(m.to);
  }
  const points = [...cuts].sort((x, y) => x - y);
  /** @type {{ text: string, from: number, marks: Mark[] }[]} */
  const out = [];
  for (let k = 0; k + 1 < points.length; k++) {
    const from = points[k];
    const to = points[k + 1];
    if (to <= from) continue;
    out.push({ text: b.text.slice(from, to), from, marks: b.marks.filter(m => m.from <= from && m.to >= to) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// HTML

/** @param {string} s */
const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** @param {string} s */
const escapeAttribute = s => escape(s).replace(/"/g, '&quot;');

const TAGS = /** @type {Record<MarkType, string>} */ ({ link: 'a', bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code', subscript: 'sub', superscript: 'sup', highlight: 'mark', color: 'span' });

/** A mark's opening tag: a colored highlight is `<mark style="background-color: …">`, a text color `<span style="color: …">`, both plain inline CSS. @param {Mark} m */
function openTag(m) {
  if (m.type === 'link') return `<a href="${escapeAttribute(m.href ?? '')}">`;
  if (m.type === 'color') return `<span style="color: ${escapeAttribute(m.color ?? '')}">`;
  if (m.type === 'highlight' && m.color !== undefined) return `<mark style="background-color: ${escapeAttribute(m.color)}">`;
  return `<${TAGS[m.type]}>`;
}

/**
 * A run's text as HTML, from `at` in its block's `all`: a space that HTML
 * would collapse (at the block's start or end, or after another space)
 * written as `&nbsp;`.
 * @param {string} text @param {string} all @param {number} at
 */
function spaced(text, all, at) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const k = at + i;
    out += c === ' ' && (k === 0 || k === all.length - 1 || all[k - 1] === ' ') ? '&nbsp;' : escape(c);
  }
  return out;
}

/** A block's inline HTML: its runs with their marks, nested in one order. @param {Block} b */
function inline(b) {
  if (b.type === 'code') return escape(b.text);
  let html = '';
  let at = 0;
  /** @type {Mark[]} */
  let open = [];
  const close = (/** @type {number} */ keep) => {
    while (open.length > keep) html += `</${TAGS[/** @type {Mark} */ (open.pop()).type]}>`;
  };
  for (const run of runs(b)) {
    const want = run.marks.filter(safeMark).sort((x, y) => ORDER[x.type] - ORDER[y.type]);
    let keep = 0;
    while (keep < open.length && keep < want.length && same(open[keep], want[keep])) keep++;
    close(keep);
    for (let k = keep; k < want.length; k++) {
      html += openTag(want[k]);
      open.push(want[k]);
    }
    html += spaced(run.text, b.text, at);
    at += run.text.length;
  }
  close(0);
  return html;
}

/** A text block's opening attributes: its alignment as a `text-align` style, when not the start. @param {Block} b */
const alignAttr = b => (b.align === 'start' ? '' : ` style="text-align: ${b.align}"`);

/** A list's HTML: its items, each a paragraph and the lists nested in it. @param {ListTree} list @returns {string} */
function listHTML(list) {
  const tag = list.type === 'bullet' ? 'ul' : 'ol';
  let html = `<${tag}>`;
  for (const item of list.items) html += `<li><p${alignAttr(item.block)}>${inline(item.block)}</p>${item.children.map(listHTML).join('')}</li>`;
  return `${html}</${tag}>`;
}

/**
 * The document as HTML: `<p>`, `<h1>` to
 * `<h4>` (with `style="text-align: …"` when not the start), `<ul>`/`<ol>` of
 * `<li><p>` with nested lists inside their item, `<blockquote>` of `<p>`,
 * `<pre><code>`, `<hr>`, and `<strong>`, `<em>`, `<u>`, `<s>`, `<code>`,
 * `<sub>`, `<sup>`, `<mark>`, `<span style="color">`, `<a href>` inside; a
 * space HTML would collapse is written `&nbsp;`; a link to an unsafe address
 * is written as its text only.
 * @param {Doc} doc
 */
export function toHTML(doc) {
  let html = '';
  const blocks = doc.blocks;
  const eff = depths(blocks);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (isList(b.type)) {
      const tree = listTree(blocks, eff, i, 0);
      html += listHTML(tree.list);
      i = tree.next - 1;
    } else if (b.type === 'quote') {
      html += '<blockquote>';
      let j = i;
      for (; j < blocks.length && blocks[j].type === 'quote'; j++) html += `<p${alignAttr(blocks[j])}>${inline(blocks[j])}</p>`;
      html += '</blockquote>';
      i = j - 1;
    } else if (b.type === 'heading') html += `<h${b.level}${alignAttr(b)}>${inline(b)}</h${b.level}>`;
    else if (b.type === 'code') html += `<pre><code>${inline(b)}</code></pre>`;
    else if (b.type === 'rule') html += '<hr>';
    else html += `<p${alignAttr(b)}>${inline(b)}</p>`;
  }
  return html;
}

const ENTITIES = /** @type {Record<string, string>} */ ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' });

/**
 * The numeric references 0x80 to 0x9F that name windows-1252's characters,
 * as the HTML standard reads them (`&#150;` is an en dash); the other five
 * stay as they are.
 */
const C1 = /** @type {Record<number, number>} */ ({
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030,
  0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022,
  0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
});

/** Decodes HTML's character references. @param {string} s */
const decode = s =>
  s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (all, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      // No character there (past U+10FFFF, a surrogate, NUL): the replacement character, as a browser reads it.
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(C1[code] ?? code) : '\ufffd';
    }
    const key = name.toLowerCase();
    return Object.hasOwn(ENTITIES, key) ? ENTITIES[key] : all;
  });

const MARK_TAGS = /** @type {Record<string, MarkType>} */ ({ strong: 'bold', b: 'bold', em: 'italic', i: 'italic', u: 'underline', s: 'strike', strike: 'strike', del: 'strike', code: 'code', a: 'link', sub: 'subscript', sup: 'superscript', mark: 'highlight', span: 'color' });

/** An attribute's value in a tag's attribute text, or null. @param {string} attributes @param {string} name */
const attribute = (attributes, name) => {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attributes);
  return m === null ? null : decode(m[1] ?? m[2] ?? m[3] ?? '');
};

/** A CSS property's value in a style attribute, or null. @param {string | null} style @param {string} name */
const cssOf = (style, name) => {
  if (style === null) return null;
  const m = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i').exec(style);
  return m === null ? null : m[1].trim();
};

/**
 * A document from HTML: the subset `toHTML` writes, and what is close to it
 * (`<b>`, `<i>`, `<del>`, `<h5>`/`<h6>` as `<h4>`, text outside blocks as
 * paragraphs). Unknown tags keep their text; ASCII whitespace collapses
 * outside `<pre>`, and `&nbsp;` is kept as a space. A link to an unsafe
 * address (any scheme but http, https, mailto and tel) is no link: its text
 * stays.
 * @param {string} html
 * @returns {Doc}
 */
export function fromHTML(html) {
  /** @typedef {{ type: BlockType, text: string, marks: Mark[], level: number, depth: number, align: Align }} Draft */
  /** @type {Draft[]} */
  const out = [];
  /** @type {Draft | null} */
  let current = null;
  /** @type {{ type: MarkType, from: number, href?: string, color?: string }[]} */
  let open = [];
  /** A `<span>` opens a color, or nothing. @type {boolean[]} */
  const spans = [];
  /** @type {BlockType[]} */
  const lists = [];
  let quote = 0;
  let pre = 0;
  const context = () => /** @type {BlockType} */ (pre > 0 ? 'code' : lists.length > 0 ? lists[lists.length - 1] : quote > 0 ? 'quote' : 'paragraph');
  const flush = () => {
    if (current === null) return;
    const b = current;
    // Only ASCII whitespace collapses; a no-break space kept so far becomes the model's plain space here.
    if (b.type !== 'code') b.text = b.text.replace(/[ \t\n\r\f]+$/, '');
    b.text = b.text.replace(/\u00a0/g, ' ');
    for (const m of open) b.marks.push(/** @type {Mark} */ ({ ...m, to: b.text.length }));
    out.push(b);
    current = null;
    open = open.map(m => ({ ...m, from: 0 }));
  };
  const start = (/** @type {BlockType} */ type, level = 0, align = /** @type {Align} */ ('start')) => {
    flush();
    current = { type, text: '', marks: [], level, depth: Math.max(0, lists.length - 1), align };
  };
  const text = (/** @type {string} */ raw) => {
    let t = decode(raw);
    if (pre === 0) {
      t = t.replace(/[ \t\n\r\f]+/g, ' ');
      if (current === null && t === ' ') return;
      if (current === null) start(context());
      const c = /** @type {{ text: string }} */ (current);
      if (c.text === '' || c.text.endsWith(' ')) t = t.replace(/^ /, '');
    } else if (current === null) start('code');
    /** @type {{ text: string }} */ (current).text += t;
  };
  const pattern = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|[^<]+|</g;
  for (const m of html.matchAll(pattern)) {
    const all = m[0];
    if (all.startsWith('<!--')) continue;
    if (m[2] === undefined) {
      text(all);
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attributes = m[3] ?? '';
    const align = alignOfCSS(cssOf(attribute(attributes, 'style'), 'text-align'));
    const heading = /^h([1-6])$/.exec(tag);
    if (heading !== null) {
      if (closing) flush();
      else start('heading', Math.min(4, Number(heading[1])), align);
    } else if (tag === 'p' || tag === 'div') {
      if (closing) flush();
      else if (current !== null && /** @type {any} */ (current).text === '' && /** @type {any} */ (current).type === context()) /** @type {any} */ (current).align = align;
      else start(context(), 0, align);
    } else if (tag === 'li') {
      if (closing) flush();
      else start(lists.length > 0 ? lists[lists.length - 1] : 'bullet', 0, align);
    } else if (tag === 'ul' || tag === 'ol') {
      flush();
      if (closing) lists.pop();
      else lists.push(tag === 'ul' ? 'bullet' : 'ordered');
    } else if (tag === 'blockquote') {
      flush();
      quote += closing ? -1 : 1;
    } else if (tag === 'pre') {
      if (closing) {
        flush();
        pre = Math.max(0, pre - 1);
      } else {
        flush();
        pre++;
        start('code');
      }
    } else if (tag === 'hr') {
      if (!closing) {
        flush();
        out.push({ type: 'rule', text: '', marks: [], level: 0, depth: 0, align: 'start' });
      }
    } else if (tag === 'br') {
      if (pre > 0) text('\n');
      else text(' ');
    } else if (Object.hasOwn(MARK_TAGS, tag) && !(tag === 'code' && pre > 0)) {
      const type = MARK_TAGS[tag];
      if (!closing) {
        /** @type {string | undefined} */
        let attr;
        if (type === 'link') attr = attribute(attributes, 'href') ?? '';
        else if (type === 'highlight') attr = cssOf(attribute(attributes, 'style'), 'background') ?? cssOf(attribute(attributes, 'style'), 'background-color') ?? undefined;
        else if (type === 'color') {
          const color = cssOf(attribute(attributes, 'style'), 'color');
          spans.push(color !== null);
          if (color === null) continue;
          attr = color;
        }
        if (current === null) start(context());
        const from = /** @type {any} */ (current).text.length;
        open.push(type === 'link' ? { type, from, href: attr } : attr !== undefined ? { type, from, color: attr } : { type, from });
      } else {
        if (type === 'color' && spans.pop() !== true) continue;
        for (let k = open.length - 1; k >= 0; k--) {
          if (open[k].type !== type) continue;
          const o = open[k];
          open.splice(k, 1);
          if (current !== null) /** @type {any} */ (current).marks.push(/** @type {Mark} */ ({ ...o, to: /** @type {any} */ (current).text.length }));
          break;
        }
      }
    }
  }
  flush();
  return createDoc(out);
}

// ---------------------------------------------------------------------------
// JSON

/**
 * A block as JSON: its type and text, and only the fields that differ
 * from a plain block (a heading's `level`, a list item's `depth` when
 * nested, `align` when not the start, `marks` when it has some).
 * @typedef {{ type: BlockType, text?: string, level?: number, depth?: number, align?: Align, marks?: Mark[] }} BlockJSON
 */
/** A document as JSON. @typedef {{ blocks: BlockJSON[] }} DocJSON */

/** A block as JSON. @param {Block} b @returns {BlockJSON} */
function blockJSON(b) {
  /** @type {BlockJSON} */
  const out = { type: b.type };
  if (b.text !== '') out.text = b.text;
  if (b.type === 'heading') out.level = b.level;
  if (b.depth > 0) out.depth = b.depth;
  if (b.align !== 'start') out.align = b.align;
  if (b.marks.length > 0) out.marks = b.marks.map(m => ({ ...m }));
  return out;
}

/**
 * The document as JSON: `{ blocks }`, each block `{ type, text }` with its
 * `level` (a heading), `depth` (a nested list item), `align` (not the start)
 * and `marks` (`{ type, from, to }` over its text, a link's `href`, a
 * color's or a highlight's `color`) where it has them. Plain data: it
 * survives `JSON.stringify`, and `fromJSON` reads it back.
 * @param {Doc} doc
 * @returns {DocJSON}
 */
export const toJSON = doc => ({ blocks: doc.blocks.map(blockJSON) });

/**
 * A document from JSON (what `toJSON` writes): unknown block types are
 * paragraphs, unknown marks are dropped, a missing field is its default.
 * @param {any} json
 * @returns {Doc}
 */
export function fromJSON(json) {
  const list = Array.isArray(json?.blocks) ? json.blocks : [];
  return createDoc(
    list.map((/** @type {any} */ b) => {
      const type = /** @type {BlockType} */ (BLOCKS.includes(b?.type) ? b.type : 'paragraph');
      const text = typeof b?.text === 'string' ? b.text : '';
      const marks = (Array.isArray(b?.marks) ? b.marks : [])
        .filter((/** @type {any} */ m) => m != null && Object.hasOwn(ORDER, m.type) && Number.isFinite(m.from) && Number.isFinite(m.to))
        .map((/** @type {any} */ m) => markOf(m.type, m.from, m.to, m.type === 'link' ? m.href : m.color ?? undefined));
      return { type, text, marks, level: Number(b?.level) || 0, depth: Number(b?.depth) || 0, align: alignOf(b?.align) };
    }),
  );
}

/** The document's plain text, a line break between blocks. @param {Doc} doc */
export const toText = doc => doc.blocks.map(b => b.text).join('\n');
