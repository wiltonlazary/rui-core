// The editor: a document (model.js) in a signal, the block being edited,
// the selection last read from its Edit, marks toggled at a caret, and
// undo history; the actions of the Editor controls
// (`toggle('bold')`, `toggleBlock('heading', 1)`, …) and the keys of a block's Edit
// (Enter splits, Backspace at the start joins, Tab and Shift+Tab nest and
// lift list items, Primary+B/I/U, Primary+Z/Y with Ctrl or Cmd), and the markdown shortcuts
// typed at a paragraph's start ("# " to "#### ", "- ", "1. ", "> ", "```",
// "---").
//
// Selection comes from the Edit being edited, as an input's
// `selectionStart`/`selectionEnd` (the DOM's input and ren-canv's Edit
// both have them); where an Edit has none, an action applies to its whole
// block. A toolbar control reads it on pointerdown, before the press takes
// the focus (`snapshot`); a keyboard shortcut reads it in the key's
// handler; the Edit's changes and pointer releases keep it current.

import { $active, $signal, $read, $write, $batch, $lookup, $owner, $cleanup, $after } from 'ren-core';
import { Clock } from '../../theme/motion.js';
import * as M from './model.js';
import { composing } from '../../core/overlays/shared.jsx';

/**
 * Internal, reached by name by Editor.Content only (the package's entry does not export it): for each editor
 * handle, the rows the Edit of a block shows while it is edited and its caret's row (null where the Edit cannot
 * tell), which the arrow keys read. Not part of the handle.
 * @type {WeakMap<object, (id: number) => Caret>}
 */
export const SHOWN = new WeakMap();

/** @typedef {import('./model.js').Doc} Doc */
/** @typedef {import('./model.js').Block} Block */
/** @typedef {import('./model.js').MarkType} MarkType */
/** @typedef {import('./model.js').BlockType} BlockType */
/** @typedef {import('./model.js').Align} Align */
/** @typedef {{ id: number, from: number, to: number, known: boolean }} Range */
/** @typedef {{ row: number | null, rows: number }} Caret the drawn row of a block's caret (from 0; null: unknown) and the rows its Edit draws */

/** Content as HTML, the document's JSON (`toJSON`), a Doc, or nothing. @param {any} content @returns {Doc} */
export function docOf(content) {
  if (content == null || content === '') return M.createDoc();
  if (typeof content === 'string') return M.fromHTML(content);
  if (Array.isArray(content.blocks) && typeof content.next === 'number') return content;
  return M.fromJSON(content);
}

/**
 * The markdown shortcut a paragraph's text starts with, typed up to the
 * caret: its length and the block it makes.
 * @param {string} text @param {number} caret
 * @returns {{ length: number, type: BlockType, level: number } | null}
 */
export function shortcut(text, caret) {
  /** @type {[RegExp, BlockType][]} */
  const rules = [
    [/^(#{1,4}) /, 'heading'],
    [/^[-+*] /, 'bullet'],
    [/^\d+\. /, 'ordered'],
    [/^> /, 'quote'],
    [/^(```|~~~)/, 'code'],
    [/^(---|—-|___ |\*\*\* )$/, 'rule'],
  ];
  for (const [re, type] of rules) {
    const m = re.exec(text);
    if (m === null || (caret >= 0 && caret !== m[0].length)) continue;
    return { length: m[0].length, type, level: type === 'heading' ? m[1].length : 0 };
  }
  return null;
}

/** An Edit's selection, where it has one. @param {any} node @returns {[number, number] | null} */
const selectionOf = node => {
  const s = node?.selectionStart;
  const e = node?.selectionEnd;
  return typeof s === 'number' && typeof e === 'number' ? [Math.min(s, e), Math.max(s, e)] : null;
};

/**
 * @typedef {object} Editor
 * @property {() => Doc} doc the document (reactive)
 * @property {() => number} active the block being edited, -1 none (reactive)
 * @property {() => Range} selection the selection last read (reactive)
 * @property {() => boolean} editable
 * @property {(on: boolean) => void} setEditable
 * @property {(id: number, from?: number, to?: number) => void} activate edit a block
 * @property {(id: number, node: any) => void} bind the Edit shown for a block
 * @property {(id: number) => void} track read the selection of a block's Edit
 * @property {() => void} snapshot read the edited block's selection (a control's pointerdown)
 * @property {(id: number, value: string) => void} input
 * @property {(id: number, event: any) => void} key
 * @property {(mark: MarkType, color?: string) => void} toggle a mark on the selection, or at a caret for the text typed next (`color`: a highlight's, the theme's by default)
 * @property {(type: BlockType, level?: number) => void} toggleBlock the selected block made `type` (a heading of `level`), or a paragraph when it is that already
 * @property {(type: BlockType, level?: number) => void} setBlock the selected block made `type`
 * @property {(color: string | null) => void} colorText the selection's text color; null removes it
 * @property {(align: Align) => void} align the selected block's text alignment
 * @property {() => void} insertRule a horizontal rule after the block, the caret after it
 * @property {() => void} indent the list item one level deeper (Tab)
 * @property {() => void} outdent the list item one level up (Shift+Tab)
 * @property {(href: string) => void} link links the selection (a caret in a link: that link) to `href`; '' removes it, and an unsafe address (any scheme but http, https, mailto and tel) makes no link
 * @property {() => void} unlink removes the link at the selection (all of a link the caret is in)
 * @property {() => void} clearFormatting the selection's marks removed, its block a paragraph
 * @property {() => void} undo
 * @property {() => void} redo
 * @property {() => boolean} canUndo
 * @property {() => boolean} canRedo
 * @property {(mark: MarkType, value?: string) => boolean} marked whether the selection has the mark (`value`: that link's href, that color) (reactive)
 * @property {(mark: MarkType) => string | null} markValue the href of the link, or the color of the text color or highlight, at the selection's start; null where it has none (reactive)
 * @property {() => Block | null} block the block the actions apply to (reactive)
 * @property {(type: BlockType, level?: number) => boolean} isBlock whether that block is `type` (a heading of `level`, any level without it) (reactive)
 * @property {() => string} html the document as HTML
 * @property {() => import('./model.js').DocJSON} json the document as JSON (`toJSON`)
 * @property {() => string} text the document's plain text
 * @property {(content: any) => void} load replaces the document with HTML, JSON or a Doc (undoable)
 */

/** Each editor's Clock setter, for the Editor showing it: off the handle's members. @type {WeakMap<object, (clock: import('../../theme/motion.js').ClockValue) => void>} */
const clocks = new WeakMap();

/**
 * Hands an editor the Clock of the view it is shown in: its focus waits a
 * frame of that Clock. Editor calls it; it is not a public export.
 * @param {object} editor @param {import('../../theme/motion.js').ClockValue} clock
 */
export const handClock = (editor, clock) => clocks.get(editor)?.(clock);

/**
 * A rich text editor's state and actions (`$editor`, an
 * rrx-core operation): `content` (HTML, JSON or a Doc), `editable`
 * (true), `onChange(editor)` after each change. Call it while a view is
 * built.
 * @param {{ content?: any, editable?: boolean, onChange?: (editor: Editor) => void }} [options]
 */
export function $editor(options = {}) {
  const R = $active();
  /** The Clock of the view it is shown in (Editor sets it), else the one where it was made. */
  let clock = /** @type {import('../../theme/motion.js').ClockValue} */ ($lookup(Clock));
  const doc = $signal(R, docOf(options.content));
  /** The block being edited (its Edit shown), -1 none. */
  const active = $signal(R, -1);
  /** The selection last read. */
  const selection = $signal(R, /** @type {Range} */ ({ id: -1, from: 0, to: 0, known: false }));
  /** Marks toggled at a caret, for the text typed next. */
  const stored = $signal(R, /** @type {Map<MarkType, boolean> | null} */ (null));
  const editable = $signal(R, options.editable !== false);
  /** Bumps when the history changes (canUndo, canRedo). */
  const version = $signal(R, 0);
  /** @type {Doc[]} */
  const past = [];
  /** @type {Doc[]} */
  const future = [];
  /** The block whose typing the last history entry holds (typing coalesces), -1 none. */
  let typing = -1;
  /** The Edit of each block shown as one. @type {Map<number, any>} */
  const nodes = new Map();
  /** @type {(() => void) | null} */
  let pending = null;
  const owner = $owner(R);
  if (owner != null)
    $cleanup(/** @type {any} */ (owner), () => {
      if (pending !== null) pending();
      pending = null;
    });

  const current = () => $read(doc);
  /** Records a new document (undoable), coalescing typing in one block. @param {Doc} next @param {number} [typed] the block typed in */
  const commit = (next, typed = -1) => {
    const prev = current();
    if (next === prev) return false;
    if (typed < 0 || typed !== typing) past.push(prev);
    if (past.length > 200) past.shift();
    future.length = 0;
    typing = typed;
    $write(doc, next);
    $write(version, $read(version) + 1);
    options.onChange?.(editor);
    return true;
  };

  /** Puts the focus and the selection in an Edit. @param {any} node @param {number} from @param {number} to */
  const place = (node, from, to) => {
    node.setSelectionRange?.(from, to);
    node.focus?.();
    node.setSelectionRange?.(from, to);
  };
  /** The focus asked for and not yet placed: `bind` asks again for it when its Edit registers. @type {{ id: number, from: number, to: number } | null} */
  let wanted = null;
  /** Focuses a block's Edit with a selection: once laid out, at the next frame; an Edit built later asks again when it registers. @param {number} id @param {number} from @param {number} to */
  const focus = (id, from, to) => {
    wanted = { id, from, to };
    if (pending !== null) pending();
    // timer: feature, the focus of an Edit once the renderer has laid it out and put it in the page.
    pending = clock.frame(() => {
      pending = null;
      const node = nodes.get(id);
      if (node == null) return;
      wanted = null;
      place(node, from, to);
      $batch(R, () => $write(selection, { id, from, to, known: selectionOf(node) !== null }));
    });
  };

  /** Counts the inputs and keys: a caret placed after a flush is for the latest only. */
  let strokes = 0;
  /** Drops a focus asked for block `id` and not yet placed: its Edit has the focus, and what is typed there is newer. @param {number} id */
  const settle = id => {
    strokes++;
    if (wanted === null || wanted.id !== id || nodes.get(id) == null) return;
    wanted = null;
    if (pending !== null) pending();
    pending = null;
  };

  /** Edits block `id` (its Edit shown), the caret or selection at [from, to] (the end by default). @param {number} id @param {number} [from] @param {number} [to] */
  const activate = (id, from, to) => {
    if (!$read(editable)) return;
    const b = M.blockOf(current(), id);
    if (b === undefined || b.type === 'rule') return;
    const f = Math.max(0, Math.min(b.text.length, from ?? b.text.length));
    const t = Math.max(f, Math.min(b.text.length, to ?? f));
    $write(active, id);
    $write(stored, null);
    $write(selection, { id, from: f, to: t, known: true });
    focus(id, f, t);
  };

  /**
   * Reads the selection of block `id`'s Edit. A caret moved since the last
   * read (a pointer, a word move the platform made) drops a stored mark
   * toggle: it was for the old place; typing (`typed`) moves it and keeps it.
   * @param {number} id @param {boolean} [typed]
   */
  const track = (id, typed = false) => {
    const node = nodes.get(id);
    const s = selectionOf(node);
    const b = M.blockOf(current(), id);
    if (b === undefined) return;
    if (s !== null) {
      const next = { id, from: Math.min(s[0], b.text.length), to: Math.min(s[1], b.text.length), known: true };
      const old = $read(selection);
      if (!typed && (!old.known || old.id !== next.id || old.from !== next.from || old.to !== next.to)) $write(stored, null);
      $write(selection, next);
    } else {
      const old = $read(selection);
      if (old.id !== id || old.known) $write(selection, { id, from: 0, to: b.text.length, known: false });
    }
  };

  /** The selection an action applies to: the one read last, or the whole active block where the Edit gives none. @returns {Range | null} */
  const range = () => {
    const s = $read(selection);
    const id = s.id >= 0 ? s.id : $read(active);
    const b = M.blockOf(current(), id);
    if (b === undefined) return null;
    if (!s.known || s.id !== id) return { id, from: 0, to: b.text.length, known: false };
    return { id, from: Math.min(s.from, b.text.length), to: Math.min(s.to, b.text.length), known: true };
  };

  /** Back to the block's Edit with the selection an action applied to. @param {Range | null} r */
  const restore = r => {
    if (r === null || $read(active) !== r.id) return;
    focus(r.id, r.from, r.to);
  };

  /** Whether a mark is on at the selection (a stored toggle at a caret first). @param {MarkType} type @param {string} [href] */
  const markActive = (type, href) => {
    const r = range();
    if (r === null) return false;
    const b = /** @type {Block} */ (M.blockOf(current(), r.id));
    if (r.from === r.to) {
      const s = $read(stored);
      if (s !== null && s.has(type)) return /** @type {boolean} */ (s.get(type));
    }
    return M.hasMark(b, type, r.from, r.to, href);
  };

  /** A mark's href or color at the selection's start, null where it has none. @param {MarkType} type @returns {string | null} */
  const markValue = type => {
    const r = range();
    if (r === null) return null;
    const b = /** @type {Block} */ (M.blockOf(current(), r.id));
    const at = r.from === r.to ? M.marksAt(b, r.from) : b.marks.filter(m => m.from <= r.from && m.to > r.from);
    const m = at.find(x => x.type === type);
    return m?.href ?? m?.color ?? null;
  };

  /** Toggles a mark on the selection (a highlight of `color`); at a caret, for the text typed next. @param {MarkType} type @param {string} [color] */
  const toggleMark = (type, color) => {
    const r = range();
    if (r === null) return;
    const b = /** @type {Block} */ (M.blockOf(current(), r.id));
    if (b.type === 'code') return;
    if (r.from < r.to) commit(M.setMark(current(), r.id, r.from, r.to, type, !M.hasMark(b, type, r.from, r.to, color), color));
    else {
      const s = new Map($read(stored) ?? []);
      s.set(type, !markActive(type));
      $write(stored, s);
    }
    restore(r);
  };

  /** The block a block action applies to. */
  const actedOn = () => {
    const r = range();
    return r === null ? null : M.blockOf(current(), r.id) ?? null;
  };

  /** Sets the selected block's type, or back to a paragraph when it is that type already. @param {BlockType} type @param {number} [level] */
  const toggleBlock = (type, level = 1) => {
    const b = actedOn();
    if (b === undefined || b === null) return;
    const on = b.type === type && (type !== 'heading' || b.level === level);
    commit(M.setBlock(current(), b.id, on ? 'paragraph' : type, level));
    restore(range());
  };

  /** Links the selection to `href` (a caret in a link: that link). @param {string} href */
  const link = href => {
    const r = range();
    if (r === null) return;
    const b = /** @type {Block} */ (M.blockOf(current(), r.id));
    const span = r.from < r.to ? /** @type {[number, number]} */ ([r.from, r.to]) : M.linkRange(b, r.from, r.to);
    if (span === null) return;
    commit(href === '' ? M.setMark(current(), r.id, span[0], span[1], 'link', false) : M.setMark(current(), r.id, span[0], span[1], 'link', true, href));
    restore(r);
  };

  /** Sets (or with null removes) the text color of the selection. @param {string | null} color */
  const colorText = color => {
    const r = range();
    if (r === null || r.from >= r.to) return;
    commit(M.setMark(current(), r.id, r.from, r.to, 'color', color !== null, color ?? undefined));
    restore(r);
  };

  /** Aligns the selected block's text. @param {Align} align */
  const align = align => {
    const b = actedOn();
    if (b === null || b === undefined) return;
    commit(M.setAlign(current(), b.id, align));
    restore(range());
  };

  /** A horizontal rule after the selected block; the caret goes after it. */
  const insertRule = () => {
    const b = actedOn();
    if (b === null || b === undefined) return;
    const made = M.insertRule(current(), b.id);
    commit(made.doc);
    activate(made.id, 0);
  };

  /** Nests (`deeper`) or lifts the selected list item, the caret kept. @param {boolean} deeper */
  const nest = deeper => {
    const r = range();
    if (r === null) return false;
    const next = deeper ? M.indent(current(), r.id) : M.outdent(current(), r.id);
    if (!commit(next)) return false;
    restore(r);
    return true;
  };

  /** Removes the link at the selection (all of a link the caret is in). */
  const unlink = () => {
    const r = range();
    if (r === null) return;
    const b = /** @type {Block} */ (M.blockOf(current(), r.id));
    const span = M.linkRange(b, r.from, r.to);
    if (span === null) return;
    commit(M.setMark(current(), r.id, span[0], span[1], 'link', false));
    restore(r);
  };

  /** Removes the marks of the selection and makes its block a paragraph */
  const clearFormatting = () => {
    const r = range();
    if (r === null) return;
    let next = M.clearMarks(current(), r.id, r.from, r.to);
    next = M.setBlock(next, r.id, 'paragraph');
    commit(next);
    $write(stored, null);
    restore(r);
  };

  /** A document from history: the edited block kept if it still exists. @param {Doc} next */
  const travel = next => {
    $write(doc, next);
    typing = -1;
    $write(version, $read(version) + 1);
    const id = $read(active);
    if (id >= 0 && M.blockOf(next, id) === undefined) $write(active, -1);
    else if (id >= 0) {
      const b = /** @type {Block} */ (M.blockOf(next, id));
      focus(id, b.text.length, b.text.length);
    }
    options.onChange?.(editor);
  };
  const undo = () => {
    if (past.length === 0) return;
    future.push(current());
    travel(/** @type {Doc} */ (past.pop()));
  };
  const redo = () => {
    if (future.length === 0) return;
    past.push(current());
    travel(/** @type {Doc} */ (future.pop()));
  };

  /** The text of block `id`'s Edit changed to `value`. @param {number} id @param {string} value */
  const input = (id, value) => {
    settle(id);
    const s = selectionOf(nodes.get(id));
    let caret = s === null ? -1 : s[1];
    const was = M.blockOf(current(), id);
    // A block other than code holds one paragraph: a line break pasted or composed into it (\r\n, \r, \n) is a space,
    // as HTML reads it back, and the caret shifts with it (placed again once its Edit shows the text).
    const flat = was !== undefined && was.type !== 'code' && /[\r\n]/.test(value);
    if (flat) {
      if (caret >= 0) caret = value.slice(0, caret).replace(/\r\n|\r|\n/g, ' ').length;
      value = value.replace(/\r\n|\r|\n/g, ' ');
    }
    commit(M.setText(current(), id, value, $read(stored), caret), id);
    const node = nodes.get(id);
    if (flat && caret >= 0 && typeof node?.setSelectionRange === 'function') {
      // Right after the flush that shows the rewritten value, not a frame later: typing before that frame stays put.
      $write(selection, { id, from: caret, to: caret, known: true });
      const at = strokes;
      $after(R, () => {
        if (strokes === at && nodes.get(id) === node) node.setSelectionRange(caret, caret);
      });
    } else if (flat && caret >= 0) {
      $write(selection, { id, from: caret, to: caret, known: true });
      focus(id, caret, caret);
    } else track(id, true);
    // A markdown shortcut typed at a paragraph's start makes its block (one more undo step).
    const b = M.blockOf(current(), id);
    const rule = b !== undefined && b.type === 'paragraph' ? shortcut(b.text, caret) : null;
    if (rule === null) return;
    const cut = M.splice(current(), id, 0, rule.length, '');
    if (rule.type === 'rule') {
      commit(M.insertBefore(cut, id, 'rule').doc);
      activate(id, 0);
      return;
    }
    commit(M.setBlock(cut, id, rule.type, rule.level));
    activate(id, 0);
  };

  /**
   * A key in block `id`'s Edit: shortcuts, Enter, Backspace at the start,
   * arrows across blocks.
   * @param {number} id @param {any} e
   */
  const key = (id, e) => {
    settle(id);
    // The rows its Edit shows and its caret's row, as the view that shows it tells (one row, unknown, where none does).
    const { row, rows } = SHOWN.get(editor)?.(id) ?? { row: null, rows: 1 };
    // An input method's keys are its own: the Enter that confirms a word, the arrows among its candidates.
    if (composing(e)) return;
    const k = String(e.key ?? '');
    const primary = e.ctrlKey === true || e.metaKey === true;
    const b = M.blockOf(current(), id);
    if (b === undefined) return;
    const prevent = () => e.preventDefault?.();
    // A caret move, with a modifier too (a word or line move), leaves the place a stored mark toggle was for.
    if (k.startsWith('Arrow') || k === 'Home' || k === 'End') $write(stored, null);
    if (primary) {
      const lower = k.toLowerCase();
      track(id);
      if (lower === 'b' || lower === 'i' || lower === 'u') {
        prevent();
        toggleMark(lower === 'b' ? 'bold' : lower === 'i' ? 'italic' : 'underline');
      } else if (lower === 'z' && e.shiftKey !== true) {
        prevent();
        undo();
      } else if (lower === 'y' || (lower === 'z' && e.shiftKey === true)) {
        prevent();
        redo();
      }
      return;
    }
    const s = selectionOf(nodes.get(id));
    const from = s === null ? b.text.length : s[0];
    const to = s === null ? b.text.length : s[1];
    if (k === 'Tab' && M.isList(b.type)) {
      // Tab nests a list item under the one before it, Shift+Tab lifts it.
      prevent();
      track(id);
      nest(e.shiftKey !== true);
      return;
    }
    // A block other than code holds one paragraph: Shift+Enter makes no line break in it (its Edit wraps, it does not break).
    if (k === 'Enter' && e.shiftKey === true && b.type !== 'code') {
      prevent();
      return;
    }
    if (k === 'Enter' && e.shiftKey !== true) {
      if (b.type === 'code') {
        // Enter on the empty last line of a code block leaves it.
        if (s === null || from !== b.text.length || !b.text.endsWith('\n')) return;
        prevent();
        const trimmed = M.splice(current(), id, b.text.length - 1, 1, '');
        const made = M.insertAfter(trimmed, id);
        commit(made.doc);
        activate(made.id, 0);
        return;
      }
      prevent();
      if (b.text === '' && (b.type === 'bullet' || b.type === 'ordered' || b.type === 'quote')) {
        // Enter in an empty item lifts it a level, out of the list (or the quote) at the top.
        commit(M.isList(b.type) ? M.outdent(current(), id) : M.setBlock(current(), id, 'paragraph'));
        activate(id, 0);
        return;
      }
      const cut = to > from ? M.splice(current(), id, from, to - from, '') : current();
      const made = M.split(cut, id, from);
      commit(made.doc);
      activate(made.id, 0);
      return;
    }
    if (k === 'Backspace' && ((s !== null && from === 0 && to === 0) || (s === null && b.text === ''))) {
      prevent();
      if (b.type !== 'paragraph') {
        commit(M.isList(b.type) ? M.outdent(current(), id) : M.setBlock(current(), id, 'paragraph'));
        activate(id, 0);
        return;
      }
      const joined = M.join(current(), id);
      if (joined === null) return;
      commit(joined.doc);
      activate(joined.id, joined.at);
      return;
    }
    // The caret collapsed on the first drawn row, Up leaves for the block before; on the last, Down for the block
    // after; on another row they move a row. Where the Edit cannot tell its caret's row (a worker's Handle): one row
    // shown, they leave at once; more (its Edit wraps, as drawn; a code block's lines), they move a row, the platform
    // taking the caret to the start at the first row, to the end at the last, and leave from its first place (Up) or
    // its last (Down). With no Edit bound (no view: a key sent through the store), the caret is taken at the block's end.
    const edge =
      from === to &&
      (row !== null ? (k === 'ArrowUp' ? row <= 0 : row >= rows - 1) : rows <= 1 || (k === 'ArrowUp' ? from === 0 : to === b.text.length));
    if ((k === 'ArrowUp' || k === 'ArrowDown') && edge) {
      const blocks = current().blocks;
      const step = k === 'ArrowUp' ? -1 : 1;
      let i = M.indexOf(current(), id) + step;
      // Past rules: they take no caret.
      while (i >= 0 && i < blocks.length && blocks[i].type === 'rule') i += step;
      if (i < 0 || i >= blocks.length) return;
      prevent();
      activate(blocks[i].id, k === 'ArrowUp' ? blocks[i].text.length : 0);
      return;
    }
  };


  /** @type {Editor} */
  const editor = {
    doc: current,
    active: () => $read(active),
    selection: () => $read(selection),
    editable: () => $read(editable),
    setEditable: on => $batch(R, () => {
      $write(editable, on);
      if (!on) $write(active, -1);
    }),
    activate: (id, from, to) => $batch(R, () => activate(id, from, to)),
    bind: (id, node) => {
      nodes.set(id, node);
      // The Edit registers before it is in the page: the next frame focuses it there.
      if (node != null && wanted !== null && wanted.id === id) focus(id, wanted.from, wanted.to);
    },
    track: id => $batch(R, () => track(id)),
    snapshot: () => $batch(R, () => {
      const id = $read(active);
      if (id >= 0) track(id);
    }),
    input: (id, value) => $batch(R, () => input(id, value)),
    key: (id, e) => $batch(R, () => key(id, e)),
    toggle: (mark, color) => $batch(R, () => toggleMark(mark, color)),
    toggleBlock: (type, level) => $batch(R, () => toggleBlock(type, level)),
    setBlock: (type, level) =>
      $batch(R, () => {
        const b = actedOn();
        if (b !== null && b !== undefined) commit(M.setBlock(current(), b.id, type, level));
      }),
    colorText: color => $batch(R, () => colorText(color)),
    align: value => $batch(R, () => align(value)),
    insertRule: () => $batch(R, insertRule),
    indent: () => $batch(R, () => void nest(true)),
    outdent: () => $batch(R, () => void nest(false)),
    link: href => $batch(R, () => link(href)),
    unlink: () => $batch(R, unlink),
    clearFormatting: () => $batch(R, clearFormatting),
    undo: () => $batch(R, undo),
    redo: () => $batch(R, redo),
    canUndo: () => ($read(version), past.length > 0),
    canRedo: () => ($read(version), future.length > 0),
    marked: (mark, value) => markActive(mark, value),
    markValue: mark => markValue(mark),
    block: () => actedOn() ?? null,
    isBlock: (type, level) => {
      const b = actedOn();
      return b !== null && b !== undefined && b.type === type && (type !== 'heading' || level === undefined || b.level === level);
    },
    html: () => M.toHTML(current()),
    json: () => M.toJSON(current()),
    text: () => M.toText(current()),
    load: content =>
      $batch(R, () => {
        commit(docOf(content));
        $write(active, -1);
      }),
  };
  clocks.set(editor, value => {
    clock = value;
  });
  return editor;
}
